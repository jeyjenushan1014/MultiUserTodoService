import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

import { database } from "../dist/config/database.js";
import { PostgresNotificationDeliveryRepository } from "../dist/notifications/postgres-notification-delivery.repository.js";

const accountId = randomUUID();
const email = `quota-${accountId}@example.test`;
const changedEmail = `changed-${accountId}@example.test`;
const firstWorker = new PostgresNotificationDeliveryRepository();
const secondWorker = new PostgresNotificationDeliveryRepository();

try {
  await database.query(
    "INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)",
    [accountId, email, "test-only-not-a-credential"],
  );

  const eventIds = Array.from({ length: 6 }, () => randomUUID());
  const allowed = await Promise.all(eventIds.map((eventId, index) =>
    (index % 2 === 0 ? firstWorker : secondWorker).withRecipientGuard(accountId, async (session) => {
      const currentEmail = await session.findEmail(accountId);
      assert.equal(currentEmail, email);
      return session.reserveAddress(eventId, accountId, currentEmail);
    }),
  ));
  assert.equal(allowed.filter(Boolean).length, 5);
  const limitedEvent = eventIds[allowed.indexOf(false)];
  assert.ok(limitedEvent);
  assert.equal(await firstWorker.withRecipientGuard(accountId, async (session) =>
    session.reserveAddress(limitedEvent, accountId, email)), false);

  const acceptedEvent = eventIds[allowed.indexOf(true)];
  assert.ok(acceptedEvent);
  assert.equal(await secondWorker.withRecipientGuard(accountId, async (session) =>
    session.reserveAddress(acceptedEvent, accountId, email)), true);
  const count = await database.query(
    "SELECT COUNT(*)::integer AS count FROM notification_address_reservations WHERE email = $1",
    [email],
  );
  assert.equal(count.rows[0].count, 5);

  assert.equal(await firstWorker.withRecipientGuard(randomUUID(), async (session) =>
    session.findEmail(randomUUID())), undefined);

  let allowAddressChange;
  let announceSend;
  const sending = new Promise((resolve) => { announceSend = resolve; });
  const releaseSend = new Promise((resolve) => { allowAddressChange = resolve; });
  const pendingSend = firstWorker.withRecipientGuard(accountId, async (session) => {
    assert.equal(await session.findEmail(accountId), email);
    announceSend();
    await releaseSend;
  });
  await sending;
  const change = (async () => {
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))", [accountId]);
      await client.query("UPDATE users SET email = $1 WHERE id = $2", [changedEmail, accountId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  })();
  const beforeRelease = await database.query("SELECT email FROM users WHERE id = $1", [accountId]);
  assert.equal(beforeRelease.rows[0]?.email, email);
  allowAddressChange();
  await Promise.all([pendingSend, change]);
  assert.equal(await secondWorker.withRecipientGuard(accountId, async (session) =>
    session.findEmail(accountId)), changedEmail);
  assert.equal(await secondWorker.withRecipientGuard(accountId, async (session) =>
    session.reserveAddress(randomUUID(), accountId, email)), false);

  let allowDeletion;
  let announceSecondSend;
  const entered = new Promise((resolve) => { announceSecondSend = resolve; });
  const release = new Promise((resolve) => { allowDeletion = resolve; });
  const heldSend = firstWorker.withRecipientGuard(accountId, async (session) => {
    assert.equal(await session.findEmail(accountId), changedEmail);
    announceSecondSend();
    await release;
  });
  await entered;
  const deletion = (async () => {
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))", [accountId]);
      const legacySchema = await client.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name = 'account_deletion_requests' AND column_name = 'identity_hash'`,
      );
      if (legacySchema.rowCount === 1) {
        await client.query(
          `INSERT INTO account_deletion_requests (id, user_id, identity_hash, status)
           VALUES ($1, $2, $3, 'pending')`,
          [randomUUID(), accountId, createHash("sha256").update(accountId).digest("hex")],
        );
      } else {
        await client.query(
          `INSERT INTO account_deletion_requests (id, user_id, idempotency_key_hash, correlation_id, status)
           VALUES ($1, $2, $3, $4, 'pending')`,
          [randomUUID(), accountId, createHash("sha256").update(randomUUID()).digest("hex"), randomUUID()],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  })();
  const beforeDeletion = await database.query(
    "SELECT COUNT(*)::integer AS count FROM account_deletion_requests WHERE user_id = $1",
    [accountId],
  );
  assert.equal(beforeDeletion.rows[0].count, 0);
  allowDeletion();
  await heldSend;
  await deletion;
  assert.equal(await secondWorker.withRecipientGuard(accountId, async (session) =>
    session.findEmail(accountId)), undefined);

  await database.query("DELETE FROM account_deletion_requests WHERE user_id = $1", [accountId]);
  await database.query("DELETE FROM users WHERE id = $1", [accountId]);
  const erased = await database.query(
    `SELECT COUNT(*)::integer AS count FROM notification_address_reservations
     WHERE user_id = $1 OR email IN ($2, $3)`,
    [accountId, email, changedEmail],
  );
  assert.equal(erased.rows[0].count, 0);
  console.log("Mail quota concurrency, retry reuse, address change, and account erasure verified");
} finally {
  await database.query("DELETE FROM account_deletion_requests WHERE user_id = $1", [accountId]);
  await database.query("DELETE FROM users WHERE id = $1", [accountId]);
  await database.end();
}