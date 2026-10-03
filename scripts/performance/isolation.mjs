export function requirePerformanceIsolation() {
  const url = new URL(process.env.TODO_DATABASE_URL ?? "http://missing");
  const endpoint = new URL(process.env.TODO_E2E_BASE_URL ?? "http://missing");
  if (process.env.PERFORMANCE_VERIFY_ISOLATED !== "1" ||
      url.hostname !== "todo-postgres" || url.pathname !== "/verify_todo" ||
      endpoint.origin !== "http://edge:3000" ||
      process.env.MAIL_TEST_SINK_ONLY !== "true") {
    throw new Error("Performance evidence must run inside the dedicated Day-4 verification stack");
  }
}
