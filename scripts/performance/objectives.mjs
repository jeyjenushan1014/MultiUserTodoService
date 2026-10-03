export const objectives = Object.freeze({
  clients: 20,
  cycleMs: 2000,
  warmupMs: 60000,
  durationMs: 300000,
  readP95Ms: 300,
  writeP95Ms: 500,
  maxErrorRate: 0.01,
  minReadSamples: 2000,
  minWriteSamples: 500,
});

export function evaluateMeasurements(result, limits = objectives) {
  const failures = [];
  for (const operation of ["read", "write"]) {
    const metric = result[operation];
    const minSamples = limits[operation === "read" ? "minReadSamples" : "minWriteSamples"];
    const maxP95 = limits[operation === "read" ? "readP95Ms" : "writeP95Ms"];
    if (!metric || !Number.isSafeInteger(metric.samples) || metric.samples < minSamples) {
      failures.push(`${operation}: insufficient samples`);
      continue;
    }
    if (!Number.isFinite(metric.p95Ms) || metric.p95Ms <= 0 || metric.p95Ms > maxP95) {
      failures.push(`${operation}: p95 objective breached`);
    }
    if (!Number.isSafeInteger(metric.errors) || metric.errors < 0 || metric.errors > metric.samples ||
        metric.errors / metric.samples > limits.maxErrorRate) {
      failures.push(`${operation}: error-rate objective breached`);
    }
    if (metric.invalidResponses !== 0) failures.push(`${operation}: invalid response/persistence`);
  }
  if (!Number.isFinite(result.elapsedMs) || result.elapsedMs < limits.durationMs) failures.push("measurement did not run for the declared duration");
  if (result.clients !== limits.clients) failures.push("client concurrency does not match objective");
  return { passed: failures.length === 0, failures };
}
