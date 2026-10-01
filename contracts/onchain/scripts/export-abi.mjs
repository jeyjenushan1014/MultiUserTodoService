import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../../..");

const artifactPath = resolve(
  repositoryRoot,
  "contracts/onchain/artifacts/contracts/TaskHistory.sol/TaskHistory.json",
);

const outputPath = resolve(
  repositoryRoot,
  "apps/todo-service/src/blockchain/generated/task-history.abi.json",
);

const distOutputPath = resolve(
  repositoryRoot,
  "apps/todo-service/dist/src/blockchain/generated/task-history.abi.json",
);

const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));

if (!Array.isArray(artifact.abi)) {
  throw new Error("TaskHistory artifact does not contain an ABI array");
}

const abiContent = `${JSON.stringify(artifact.abi, null, 2)}\n`;

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, abiContent);

mkdirSync(dirname(distOutputPath), { recursive: true });
writeFileSync(distOutputPath, abiContent);

console.log(`Generated ABI: ${outputPath}`);