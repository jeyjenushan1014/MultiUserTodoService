import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { database } from "../dist/config/database.js";
import { env } from "../dist/config/env.js";
import { PostgresMailModeRepository } from "../dist/notifications/notification-mode.repository.js";
import { PostgresNotificationDeliveryRepository } from "../dist/notifications/postgres-notification-delivery.repository.js";
import { NotificationTransportSelector } from "../dist/notifications/notification-transport.selector.js";

const operator = `stage4-verifier-${randomUUID()}`;
const sinkEventId = randomUUID();
const externalEventId = randomUUID();
const first = new PostgresMailModeRepository();
const second = new PostgresMailModeRepository();
const delivery = new PostgresNotificationDeliveryRepository();
let originalMode;

try {
  assert.equal(env.MAIL_TEST_SINK_ONLY, "true", "Verification requires sink-only workers");
  originalMode = await first.readMode();
  assert.equal(originalMode, "sink", "Verification requires the sink to be active");

  assert.equal((await delivery.claim(sinkEventId, 1)).status, "claimed");
  assert.equal(await first.pinDestination(sinkEventId, await first.readMode()), "sink");

  await first.setMode("external", operator);
  assert.equal(await second.readMode(), "external");
  assert.equal(await second.pinDestination(sinkEventId, await second.readMode()), "sink");

  assert.equal((await delivery.claim(externalEventId, 1)).status, "claimed");
  assert.equal(await second.pinDestination(externalEventId, await second.readMode()), "external");
  await second.setMode("sink", operator);
  assert.equal(await first.readMode(), "sink");
  assert.equal(await first.pinDestination(externalEventId, await first.readMode()), "external");

  const selector = new NotificationTransportSelector(
    {},
    first,
    async () => { throw new Error("External provider must not be contacted by verification"); },
    () => true,
  );
  await assert.rejects(selector.select(externalEventId), /External mail is disabled/);

  const audits = await database.query(
    `SELECT previous_mode, new_mode FROM notification_mail_mode_audit
     WHERE changed_by = $1 ORDER BY changed_at, id`,
    [operator],
  );
  assert.equal(audits.rowCount, 2);
  assert.deepEqual(new Set(audits.rows.map((row) => `${row.previous_mode}:${row.new_mode}`)),
    new Set(["sink:external", "external:sink"]));
  console.log("Shared mail mode, audit, pinning, and external kill switch verified");
} finally {
  if (originalMode === "sink") await first.setMode("sink", operator);
  await database.query("DELETE FROM notification_mail_mode_audit WHERE changed_by = $1", [operator]);
  await database.query(
    "DELETE FROM notification_event_deliveries WHERE event_id = ANY($1::uuid[])",
    [[sinkEventId, externalEventId]],
  );
  await database.end();
}