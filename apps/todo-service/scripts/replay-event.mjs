import { randomUUID } from "node:crypto";
import { connect } from "amqplib";

import { database } from "../dist/src/config/database.js";
import { env } from "../dist/src/config/env.js";
import {
  createTodoHistoryReplayPlan,
  parseTodoHistoryReplayArguments,
} from "../dist/src/history/todo-history-replay.js";

async function main() {
  const options = parseTodoHistoryReplayArguments(process.argv.slice(2));
  const operatorId = process.env.TODO_EVENT_REPLAY_OPERATOR_ID?.trim();
  if (options.apply && (!operatorId || operatorId.length > 100)) {
    throw new Error(
      "TODO_EVENT_REPLAY_OPERATOR_ID must identify the operator (1-100 characters)",
    );
  }

  let connection;
  let channel;
  try {
    const eventTypes = [
      "todo.created",
      "todo.completed",
      "todo.shared",
      "todo.share-withdrawn",
      "todo.deleted",
    ];
    const result = options.selection.kind === "event-id"
      ? await database.query(
        `
        SELECT
          id,
          event_type,
          event_version,
          payload,
          request_id,
          occurred_at,
          published_at
        FROM outbox_events
        WHERE id = $1
        `,
        [options.selection.eventId],
      )
      : await database.query(
        `
          SELECT
            id,
            event_type,
            event_version,
            payload,
            request_id,
            occurred_at,
            published_at
          FROM outbox_events
          WHERE occurred_at >= $1
            AND occurred_at < $2
            AND published_at IS NOT NULL
            AND event_type = ANY($3::text[])
          ORDER BY occurred_at ASC, id ASC
          LIMIT 101
        `,
        [options.selection.from, options.selection.to, eventTypes],
      );

    if (options.selection.kind === "event-id" && result.rowCount !== 1) {
      throw new Error("Event was not found in the Todo outbox");
    }
    if (result.rowCount > 100) {
      throw new Error("Replay range exceeds 100 events; use a narrower range");
    }

    const plans = result.rows.map((row) =>
      createTodoHistoryReplayPlan(
        {
          id: row.id,
          eventType: row.event_type,
          eventVersion: row.event_version,
          payload: row.payload,
          requestId: row.request_id,
          occurredAt: row.occurred_at,
          publishedAt: row.published_at,
        },
        options.target,
      ),
    );
    const eventIds = plans.map((plan) => plan.eventId);
    const processedResult = eventIds.length === 0
      ? { rows: [] }
      : await database.query(
        "SELECT event_id FROM todo_history WHERE event_id = ANY($1::uuid[])",
        [eventIds],
      );
    const processedIds = new Set(processedResult.rows.map((row) => row.event_id));

    if (!options.apply) {
      console.log(JSON.stringify({
        mode: "dry-run",
        target: options.target,
        from: options.selection.kind === "range"
          ? options.selection.from.toISOString()
          : undefined,
        to: options.selection.kind === "range"
          ? options.selection.to.toISOString()
          : undefined,
        selected: plans.length,
        alreadyProcessed: processedIds.size,
        events: plans.map(({ eventId, eventType }) => ({
          eventId,
          eventType,
          alreadyProcessed: processedIds.has(eventId),
        })),
      }));
      return;
    }

    connection = await connect(env.RABBITMQ_URL);
    channel = await connection.createConfirmChannel();
    await channel.checkQueue(env.TODO_HISTORY_QUEUE);
    const results = [];
    for (const plan of plans) {
      const auditId = randomUUID();
      const alreadyProcessed = processedIds.has(plan.eventId);
      await database.query(
        `
          INSERT INTO todo_event_replay_audit (
            id, event_id, target_consumer, operator_id, status, completed_at
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          auditId,
          plan.eventId,
          options.target,
          operatorId,
          alreadyProcessed ? "already_processed" : "started",
          alreadyProcessed ? new Date() : null,
        ],
      );
      if (alreadyProcessed) {
        results.push({ eventId: plan.eventId, result: "already-processed" });
        continue;
      }

      let confirmed = false;
      try {
        channel.sendToQueue(
          env.TODO_HISTORY_QUEUE,
          Buffer.from(JSON.stringify(plan.payload), "utf8"),
          {
            persistent: true,
            contentType: "application/json",
            contentEncoding: "utf-8",
            messageId: plan.eventId,
            correlationId: plan.requestId,
            type: plan.eventType,
            timestamp: Math.floor(plan.occurredAt.getTime() / 1_000),
            headers: {
              requestId: plan.requestId,
              aggregateId: plan.payload.payload.todoId,
              eventVersion: plan.eventVersion,
              producer: "todo-service",
              operatorReplay: true,
            },
          },
        );
        await channel.waitForConfirms();
        confirmed = true;
        await database.query(
          `
            UPDATE todo_event_replay_audit
            SET status = 'queued', completed_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `,
          [auditId],
        );
        results.push({ eventId: plan.eventId, result: "queued" });
      } catch (error) {
        if (!confirmed) {
          await database.query(
            `
              UPDATE todo_event_replay_audit
              SET status = 'failed', error_code = 'replay_outcome_uncertain', completed_at = CURRENT_TIMESTAMP
              WHERE id = $1
            `,
            [auditId],
          );
        }
        console.log(JSON.stringify({
          target: options.target,
          completed: results,
          failedEventId: plan.eventId,
          message: "Replay stopped at first error; reconcile this event before retrying the remaining range.",
        }));
        throw error;
      }
    }

    console.log(JSON.stringify({
      result: "complete",
      target: options.target,
      selected: plans.length,
      operatorId,
      events: results,
    }));
  } finally {
    await channel?.close();
    await connection?.close();
    await database.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Event replay failed");
  process.exitCode = 1;
});