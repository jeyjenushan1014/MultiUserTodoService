import { main } from "./dlq-operations.mjs";

const args = process.argv.slice(2);
if (args.length !== 1) {
  console.error("Usage: replay-notification-dlq.mjs <event-id>; DLQ_OPERATOR_ID is required");
  process.exitCode = 1;
} else {
  main([
    "replay",
    "--queue", process.env.RABBITMQ_NOTIFICATION_DLQ ?? "todo.notifications.dlq",
    "--event-id", args[0],
  ]).catch((error) => {
    console.error(error instanceof Error ? error.message : "Notification replay failed");
    process.exitCode = 1;
  });
}
