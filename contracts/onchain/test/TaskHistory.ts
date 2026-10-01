import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";

const { viem } = await network.create();

const TASK_ID = "0x11111111111111111111111111111111";
const OTHER_TASK_ID = "0x22222222222222222222222222222222";
const WORKSPACE_ID = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ZERO_ID = "0x00000000000000000000000000000000";

describe("TaskHistory", () => {
  async function deployTaskHistory() {
    const [writer, nonWriter] = await viem.getWalletClients();

    const contract = await viem.deployContract("TaskHistory", [
      writer.account.address,
    ]);

    return {
      contract,
      writer,
      nonWriter,
    };
  }

  it("stores only the task ID, workspace ID, action, and timestamp", async () => {
    const { contract } = await deployTaskHistory();

    await contract.write.recordTaskAction([
      TASK_ID,
      WORKSPACE_ID,
      0, // Action.Created
    ]);

    const records = await contract.read.getHistory([
      TASK_ID,
      0n,
      10n,
    ]);

    assert.equal(records.length, 1);
    assert.equal(records[0].taskId, TASK_ID);
    assert.equal(records[0].workspaceId, WORKSPACE_ID);
    assert.equal(records[0].action, 0);
    assert.ok(records[0].timestamp > 0n);

    assert.equal(
      await contract.read.getRecordCount([TASK_ID]),
      1n,
    );
  });

  it("rejects a write from an account other than the writer", async () => {
    const { contract, nonWriter } = await deployTaskHistory();

    await assert.rejects(() =>
      contract.write.recordTaskAction(
        [TASK_ID, WORKSPACE_ID, 0],
        { account: nonWriter.account },
      ),
    );

    assert.equal(
      await contract.read.getRecordCount([TASK_ID]),
      0n,
    );
  });

  it("rejects a zero task ID", async () => {
    const { contract } = await deployTaskHistory();

    await assert.rejects(() =>
      contract.write.recordTaskAction([
        ZERO_ID,
        WORKSPACE_ID,
        0,
      ]),
    );
  });

  it("rejects a zero workspace ID", async () => {
    const { contract } = await deployTaskHistory();

    await assert.rejects(() =>
      contract.write.recordTaskAction([
        TASK_ID,
        ZERO_ID,
        0,
      ]),
    );
  });

  it("returns history in bounded pages", async () => {
    const { contract } = await deployTaskHistory();

    await contract.write.recordTaskAction([
      TASK_ID,
      WORKSPACE_ID,
      0, // Created
    ]);

    await contract.write.recordTaskAction([
      TASK_ID,
      WORKSPACE_ID,
      1, // Updated
    ]);

    await contract.write.recordTaskAction([
      TASK_ID,
      WORKSPACE_ID,
      2, // Deleted
    ]);

    const page = await contract.read.getHistory([
      TASK_ID,
      1n,
      1n,
    ]);

    assert.equal(page.length, 1);
    assert.equal(page[0].action, 1);
  });

  it("returns an empty page for an offset past the end", async () => {
    const { contract } = await deployTaskHistory();

    const page = await contract.read.getHistory([
      TASK_ID,
      10n,
      10n,
    ]);

    assert.equal(page.length, 0);
  });

  it("rejects zero or over-limit page sizes", async () => {
    const { contract } = await deployTaskHistory();

    await assert.rejects(() =>
      contract.read.getHistory([
        TASK_ID,
        0n,
        0n,
      ]),
    );

    await assert.rejects(() =>
      contract.read.getHistory([
        TASK_ID,
        0n,
        51n,
      ]),
    );
  });

  it("keeps append gas stable when the task already has 1 versus 1,000 records", async () => {
    const { contract } = await deployTaskHistory();
    const publicClient = await viem.getPublicClient();

    async function appendAndReadGas(): Promise<bigint> {
      const hash = await contract.write.recordTaskAction([
        TASK_ID,
        WORKSPACE_ID,
        1, // Keep the calldata/action the same for comparable measurements.
      ]);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return receipt.gasUsed;
    }

    await appendAndReadGas(); // There is now 1 existing record.

    const gasWithOneExistingRecord = await appendAndReadGas();

    // After the second append there are 2 records. Add 998 to reach 1,000.
    for (let i = 0; i < 998; i++) {
      await appendAndReadGas();
    }

    assert.equal(
      await contract.read.getRecordCount([TASK_ID]),
      1000n,
    );

    const gasWithOneThousandExistingRecords = await appendAndReadGas();

    console.log({
      gasWithOneExistingRecord: gasWithOneExistingRecord.toString(),
      gasWithOneThousandExistingRecords:
        gasWithOneThousandExistingRecords.toString(),
    });

    assert.equal(
      gasWithOneThousandExistingRecords,
      gasWithOneExistingRecord,
    );
  });
});