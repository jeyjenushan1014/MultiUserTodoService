import { readFile } from "node:fs/promises";
import { evaluateMeasurements, objectives } from "./objectives.mjs";

const [file, mode] = process.argv.slice(2);
if (!file || (mode !== undefined && mode !== "--deliberate-breach")) {
  throw new Error("Usage: evaluate.mjs <measurement.json> [--deliberate-breach]");
}
const result = JSON.parse(await readFile(file, "utf8"));
const verdict = evaluateMeasurements(result, mode === "--deliberate-breach"
  ? { ...objectives, readP95Ms: 0.001, writeP95Ms: 0.001 }
  : objectives);
console.log(JSON.stringify(verdict));
process.exitCode = verdict.passed ? 0 : 1;
