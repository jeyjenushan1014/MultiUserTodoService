import { network } from "hardhat";

const TASK_HISTORY_ADDRESS =
  "0xF9b72407696e8D30FB43E17c77dB8B77bDb231E7" as const;

const TASK_ID =
  "0x11111111111111111111111111111111" as const;

const WORKSPACE_ID =
  "0x22222222222222222222222222222222" as const;

async function main(): Promise<void> {
  console.log("Connecting to Sepolia...");

  const { viem } = await network.connect({
    network: "sepolia",
  });

  const publicClient = await viem.getPublicClient();
  const [walletClient] = await viem.getWalletClients();

  if (walletClient === undefined) {
    throw new Error("No Sepolia writer account is configured.");
  }

  console.log("Writer:", walletClient.account.address);
  console.log("Contract:", TASK_HISTORY_ADDRESS);
  console.log("Synthetic task ID:", TASK_ID);
  console.log("Synthetic workspace ID:", WORKSPACE_ID);

  const taskHistory = await viem.getContractAt(
    "TaskHistory",
    TASK_HISTORY_ADDRESS,
  );

  const writer = await taskHistory.read.writer();

  console.log("Configured contract writer:", writer);

  if (
    writer.toLowerCase() !==
    walletClient.account.address.toLowerCase()
  ) {
    throw new Error(
      "Configured Sepolia account is not the TaskHistory writer.",
    );
  }

  const countBefore = await taskHistory.read.getRecordCount([
    TASK_ID,
  ]);

  console.log("Record count before:", countBefore.toString());

  console.log("Sending recordTaskAction transaction...");

  // Action.Created = 0
  const transactionHash =
    await taskHistory.write.recordTaskAction([
      TASK_ID,
      WORKSPACE_ID,
      0,
    ]);

  console.log("Transaction hash:", transactionHash);
  console.log("Waiting for 2 confirmations...");

  const receipt =
    await publicClient.waitForTransactionReceipt({
      hash: transactionHash,
      confirmations: 2,
    });

  console.log("Transaction confirmed.");
  console.log("Block number:", receipt.blockNumber.toString());
  console.log("Gas used:", receipt.gasUsed.toString());

  const countAfter = await taskHistory.read.getRecordCount([
    TASK_ID,
  ]);

  console.log("Record count after:", countAfter.toString());

  const history = await taskHistory.read.getHistory([
    TASK_ID,
    0n,
    50n,
  ]);

  console.log("History:");
  console.dir(history, { depth: null });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});