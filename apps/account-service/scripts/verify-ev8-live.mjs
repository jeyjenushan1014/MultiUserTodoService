import pg from "pg";
import { randomUUID } from "node:crypto";

const internalSecret = process.env.INTERNAL_SERVICE_SECRET;
const databaseUrl = process.env.ACCOUNT_DATABASE_URL;

if (!internalSecret || !databaseUrl) {
  throw new Error("INTERNAL_SERVICE_SECRET and ACCOUNT_DATABASE_URL must be configured in the root .env");
}

const oldUrl = process.env.EV8_OLD_URL ?? "http://127.0.0.1:3101";
const newUrl = process.env.EV8_NEW_URL ?? "http://127.0.0.1:3102";
const password = "Ev8-Test-Only-Password-123!";

async function assertHealthy(baseUrl, version) {
  const response = await fetch(`${baseUrl}/health`);
  if (!response.ok) {
    throw new Error(`${version} Account Service health check failed: HTTP ${response.status}`);
  }
}

async function register(baseUrl, version) {
  const email = `ev8-${version}-${randomUUID()}@example.com`;
  const response = await fetch(`${baseUrl}/internal/v1/accounts/register`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-service-key": internalSecret,
    },
    body: JSON.stringify({ email, password }),
  });

  const body = await response.json();
  if (response.status !== 201 || typeof body?.data?.user?.id !== "string") {
    throw new Error(`${version} registration failed: HTTP ${response.status}`);
  }

  if (version === "new" && body.data.id !== body.data.user.id) {
    throw new Error("New Account Service did not return matching legacy and current response shapes");
  }

  if (version === "old" && Object.hasOwn(body.data, "id")) {
    throw new Error("Old Account Service unexpectedly returned the new flat response aliases");
  }

  return body.data.user.id;
}

const pool = new pg.Pool({ connectionString: databaseUrl });
try {
  await Promise.all([
    assertHealthy(oldUrl, "old"),
    assertHealthy(newUrl, "new"),
  ]);

  const [oldUserId, newUserId] = await Promise.all([
    register(oldUrl, "old"),
    register(newUrl, "new"),
  ]);

  const result = await pool.query(
    `
      SELECT aggregate_id, event_version
      FROM outbox_events
      WHERE event_type = 'account.registered'
        AND aggregate_id = ANY($1::uuid[])
    `,
    [[oldUserId, newUserId]],
  );

  const versionsByUser = new Map(
    result.rows.map((row) => [row.aggregate_id, row.event_version]),
  );

  if (versionsByUser.get(oldUserId) !== 1 || versionsByUser.get(newUserId) !== 2) {
    throw new Error("Expected shared outbox to contain old v1 and new v2 registration events");
  }

  console.log("EV-8 live check passed: old/new Account Service images were healthy together, both registrations committed, and shared outbox contains v1 and v2.");
  console.log(JSON.stringify({ oldUserId, newUserId, eventVersions: [1, 2] }));
} finally {
  await pool.end();
}
