import { randomUUID } from "node:crypto";

import { database } from "../config/database.js";

export type MailDestination = "sink" | "external";

export interface MailModeRepository {
  readMode(): Promise<MailDestination>;
  setMode(mode: MailDestination, changedBy: string): Promise<void>;
  pinDestination(eventId: string, mode: MailDestination): Promise<MailDestination>;
}

export class PostgresMailModeRepository implements MailModeRepository {
  public async readMode(): Promise<MailDestination> {
    const result = await database.query<{ mode: MailDestination }>(
      "SELECT mode FROM notification_mail_settings WHERE id = 1",
    );
    const mode = result.rows[0]?.mode;
    if (mode !== "sink" && mode !== "external") {
      throw new Error("Mail mode is unavailable");
    }
    return mode;
  }

  public async setMode(mode: MailDestination, changedBy: string): Promise<void> {
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      const previous = await client.query<{ mode: MailDestination }>(
        "SELECT mode FROM notification_mail_settings WHERE id = 1 FOR UPDATE",
      );
      const previousMode = previous.rows[0]?.mode;
      if (previousMode !== "sink" && previousMode !== "external") {
        throw new Error("Mail mode is unavailable");
      }
      if (previousMode !== mode) {
        await client.query(
          "UPDATE notification_mail_settings SET mode = $1, updated_at = CURRENT_TIMESTAMP WHERE id = 1",
          [mode],
        );
        await client.query(
          `INSERT INTO notification_mail_mode_audit
           (id, previous_mode, new_mode, changed_by) VALUES ($1, $2, $3, $4)`,
          [randomUUID(), previousMode, mode, changedBy],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async pinDestination(eventId: string, mode: MailDestination): Promise<MailDestination> {
    const result = await database.query<{ destination: MailDestination }>(
      `UPDATE notification_event_deliveries
       SET destination = COALESCE(destination, $2)
       WHERE event_id = $1 AND status = 'processing'
       RETURNING destination`,
      [eventId, mode],
    );
    const destination = result.rows[0]?.destination;
    if (destination !== "sink" && destination !== "external") {
      throw new Error("Mail destination cannot be pinned");
    }
    return destination;
  }
}
