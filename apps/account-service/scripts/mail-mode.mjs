import { database } from "../dist/config/database.js";
import { PostgresMailModeRepository } from "../dist/notifications/notification-mode.repository.js";
import { loadExternalMailer } from "../dist/notifications/notification-transport.selector.js";

const command = process.argv[2];
if (!["status", "sink", "external"].includes(command)) {
  throw new Error("Usage: mail-mode.mjs status|sink|external");
}

const store = new PostgresMailModeRepository();
try {
  if (command !== "status") {
    const operator = process.env.MAIL_OPERATOR_ID?.trim();
    if (!operator || operator.length > 100) {
      throw new Error("MAIL_OPERATOR_ID must identify the operator (1-100 characters)");
    }
    if (command === "external") {
      await loadExternalMailer();
    }
    await store.setMode(command, operator);
  }

  const configuredMode = await store.readMode();
  let effectiveMode = "sink";
  if (configuredMode === "external") {
    try {
      await loadExternalMailer();
      effectiveMode = "external";
    } catch {
      effectiveMode = "blocked";
    }
  }
  console.log(JSON.stringify({ configuredMode, effectiveMode }));
} finally {
  await database.end();
}