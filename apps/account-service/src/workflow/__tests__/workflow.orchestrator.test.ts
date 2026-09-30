/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from "vitest";
import type { WorkflowStepName, WorkflowStatus } from "@todo/contracts";

import { WorkflowOrchestrator } from "../workflow.orchestrator.js";
import type { WorkflowParticipant, WorkflowRecord, WorkflowRepository } from "../workflow.types.js";

const names: readonly WorkflowStepName[] = ["account-reservation", "todo-reservation", "gateway-publication"];

class MemoryRepository implements WorkflowRepository {
  public record: WorkflowRecord = {
    id: "d73fe128-bf4d-42f4-84ae-293aabbc06c8",
    ownerId: "37aa9c2b-1d75-43bc-a8c3-697458afecfb",
    idempotencyKey: "launch-0001",
    correlationId: "request-123",
    workspaceName: "Operations",
    status: "running",
    currentStep: null,
    createdAt: new Date("2026-09-30T00:00:00Z"),
    updatedAt: new Date("2026-09-30T00:00:00Z"),
    steps: names.map((name) => ({ name, status: "pending", attempts: 0, compensationAttempts: 0, lastError: null })),
  };

  public async create(): Promise<WorkflowRecord> { return this.record; }
  public async find(): Promise<WorkflowRecord> { return this.record; }
  public async findOwned(): Promise<WorkflowRecord> { return this.record; }
  public async claimNext(): Promise<WorkflowRecord> { return this.record; }
  public async countStuckCompensations(): Promise<number> { return 0; }

  public async beginStep(_id: string, name: WorkflowStepName, compensating: boolean): Promise<void> {
    this.changeStep(name, { status: compensating ? "compensating" : "applying" });
  }
  public async finishStep(_id: string, name: WorkflowStepName, compensating: boolean): Promise<void> {
    this.changeStep(name, { status: compensating ? "compensated" : "applied", lastError: null });
  }
  public async recordFailure(_id: string, name: WorkflowStepName, compensating: boolean, message: string): Promise<number> {
    const step = this.record.steps.find((candidate) => candidate.name === name);
    if (step === undefined) throw new Error("missing step");
    const count = (compensating ? step.compensationAttempts : step.attempts) + 1;
    this.changeStep(name, compensating
      ? { status: "failed", compensationAttempts: count, lastError: message }
      : { status: "failed", attempts: count, lastError: message });
    return count;
  }
  public async setStatus(_id: string, status: WorkflowStatus, currentStep: WorkflowStepName | null): Promise<void> {
    this.record = { ...this.record, status, currentStep, updatedAt: new Date() };
  }
  private changeStep(name: WorkflowStepName, patch: Partial<WorkflowRecord["steps"][number]>): void {
    this.record = { ...this.record, steps: this.record.steps.map((step) => step.name === name ? { ...step, ...patch } : step) };
  }
}

function participant(): WorkflowParticipant {
  return { apply: vi.fn(async () => undefined), compensate: vi.fn(async () => undefined) };
}

describe("WorkflowOrchestrator", () => {
  it("resumes after a process stop without repeating an applied step", async () => {
    const repository = new MemoryRepository();
    repository.record = { ...repository.record, steps: repository.record.steps.map((step) => step.name === "account-reservation" ? { ...step, status: "applied" } : step) };
    const account = participant();
    const todo = participant();
    const gateway = participant();
    await new WorkflowOrchestrator(repository, { "account-reservation": account, "todo-reservation": todo, "gateway-publication": gateway }).run(repository.record);
    expect(account.apply).not.toHaveBeenCalled();
    expect(todo.apply).toHaveBeenCalledOnce();
    expect(gateway.apply).toHaveBeenCalledOnce();
    expect(repository.record.status).toBe("completed");
  });

  it("uses bounded retries then compensates every applied participant in reverse order", async () => {
    const repository = new MemoryRepository();
    const calls: string[] = [];
    const account: WorkflowParticipant = { apply: async () => { calls.push("apply-account"); }, compensate: async () => { calls.push("undo-account"); } };
    const todo: WorkflowParticipant = { apply: async () => { throw new Error("todo unavailable"); }, compensate: async () => { calls.push("undo-todo"); } };
    const gateway = participant();
    const orchestrator = new WorkflowOrchestrator(repository, { "account-reservation": account, "todo-reservation": todo, "gateway-publication": gateway }, 3);
    await orchestrator.run(repository.record);
    await orchestrator.run(repository.record);
    await orchestrator.run(repository.record);
    expect(repository.record.status).toBe("compensating");
    await orchestrator.run(repository.record);
    expect(repository.record.status).toBe("compensated");
    expect(calls.filter((call) => call === "apply-account")).toHaveLength(1);
    expect(calls.at(-1)).toBe("undo-account");
  });

  it("bounds compensation attempts and exposes compensation_failed", async () => {
    const repository = new MemoryRepository();
    repository.record = { ...repository.record, status: "compensating", steps: repository.record.steps.map((step) => step.name === "account-reservation" ? { ...step, status: "applied" } : step) };
    const account: WorkflowParticipant = { apply: async () => undefined, compensate: async () => { throw new Error("database unavailable"); } };
    const orchestrator = new WorkflowOrchestrator(repository, { "account-reservation": account, "todo-reservation": participant(), "gateway-publication": participant() }, 2);
    await orchestrator.run(repository.record);
    await orchestrator.run(repository.record);
    expect(repository.record.status).toBe("compensation_failed");
    expect(repository.record.steps[0]?.compensationAttempts).toBe(2);
  });

  it("does nothing when a terminal workflow is delivered twice", async () => {
    const repository = new MemoryRepository();
    repository.record = { ...repository.record, status: "completed" };
    const account = participant();
    const orchestrator = new WorkflowOrchestrator(repository, { "account-reservation": account, "todo-reservation": participant(), "gateway-publication": participant() });
    await orchestrator.run(repository.record);
    expect(account.apply).not.toHaveBeenCalled();
  });
});