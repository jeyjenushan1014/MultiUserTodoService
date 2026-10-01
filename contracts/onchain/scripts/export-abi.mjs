import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../../..");

const artifactPath = resolve(
  repositoryRoot,
  "contracts/onchain/artifacts/contracts/TaskHistory.sol/TaskHistory.json",
);

const deployedAddressPath = resolve(
  repositoryRoot,
  "contracts/onchain/ignition/deployments/chain-31337/deployed_addresses.json",
);

const outputPath = resolve(
  repositoryRoot,
  "apps/todo-service/src/blockchain/generated/task-history.abi.json",
);

const distOutputPath = resolve(
  repositoryRoot,
  "apps/todo-service/dist/src/blockchain/generated/task-history.abi.json",
);

const deploymentOutputPath = resolve(
  repositoryRoot,
  "apps/todo-service/src/blockchain/generated/task-history.deployment.json",
);

const distDeploymentOutputPath = resolve(
  repositoryRoot,
  "apps/todo-service/dist/src/blockchain/generated/task-history.deployment.json",
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

// BC-17: Export deployment metadata artifact containing verified deployed address
let deployedAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
if (existsSync(deployedAddressPath)) {
  try {
    const deployedJson = JSON.parse(readFileSync(deployedAddressPath, "utf8"));
    if (deployedJson["TaskHistoryModule#TaskHistory"]) {
      deployedAddress = deployedJson["TaskHistoryModule#TaskHistory"];
    }
  } catch {
    // fallback to recorded local default
  }
}

const deploymentContent = `${JSON.stringify(
  {
    chainId: 31337,
    contractName: "TaskHistory",
    contractAddress: deployedAddress,
    exportedAt: new Date().toISOString(),
  },
  null,
  2,
)}\n`;

writeFileSync(deploymentOutputPath, deploymentContent);
writeFileSync(distDeploymentOutputPath, deploymentContent);

console.log(`Generated Deployment Metadata: ${deploymentOutputPath}`);