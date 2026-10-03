import assert from "node:assert/strict";
import test from "node:test";

import { runOperatorCommand } from "./operator-access.mjs";

test("requires the service-specific operator login configured by the server", async () => {
  await assert.rejects(
    runOperatorCommand(["account", "mail-status"], {}),
    /ACCOUNT_OPERATOR_DATABASE_URL must be provisioned/,
  );
  await assert.rejects(
    runOperatorCommand(["todo", "chain-progress"], {}),
    /TODO_OPERATOR_DATABASE_URL must be provisioned/,
  );
});

test("rejects commands outside the bounded operator interface", async () => {
  await assert.rejects(runOperatorCommand(["account", "raw-sql"], {}), /Usage:/);
  await assert.rejects(runOperatorCommand(["todo", "chain-progress", "5"], {}), /Usage:/);
  await assert.rejects(runOperatorCommand(["account", "access-audit", "51"], {}), /between 1 and 50/);
  await assert.rejects(runOperatorCommand(["account", "mail-audit", "1e2"], {}), /Usage:/);
});
