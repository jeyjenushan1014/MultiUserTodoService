import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("TaskHistoryModule", (m) => {
  const writer = m.getAccount(0);

  const taskHistory = m.contract("TaskHistory", [writer]);

  return {
    taskHistory,
  };
});