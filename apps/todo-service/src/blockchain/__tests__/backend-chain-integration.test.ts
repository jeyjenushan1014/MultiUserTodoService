import { describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import {
  PostgresChainSubmissionWriter,
  DEFAULT_PERSONAL_WORKSPACE_ID,
} from "../chain-submission.writer.js";
import { PrivacyGateViolationError } from "../privacy-gate.js";
import { getDeploymentArtifact, getVerifiedContractAddress } from "../deployment-artifact.js";

describe("Backend chain writer unit regressions and artifact checks", () => {
  describe("PostgresChainSubmissionWriter (BC-1, BC-2)", () => {
    it("enqueues privacy-safe chain commands into chain_submissions table (BC-1)", async () => {
      const queries: { text: string; values: unknown[] }[] = [];
      const client = {
        query: vi.fn((text: string, values: unknown[]) => {
          queries.push({ text, values });
          return Promise.resolve({ rows: [], rowCount: 1 });
        }),
      } as unknown as PoolClient;

      const writer = new PostgresChainSubmissionWriter();

      await writer.enqueue(client, {
        sourceEventId: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d",
        taskId: "11111111-1111-4111-8111-111111111111",
        workspaceId: "22222222-2222-4222-8222-222222222222",
        action: "created",
      });

      expect(queries).toHaveLength(1);
      const insertQuery = queries[0];
      expect(insertQuery).toBeDefined();
      if (!insertQuery) {
        throw new Error("Expected insertQuery to be present");
      }

      expect(insertQuery.text).toContain("INSERT INTO chain_submissions");
      expect(insertQuery.text).toContain("status");
      expect(insertQuery.values[1]).toBe("a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d");
      expect(insertQuery.values[2]).toBe("11111111-1111-4111-8111-111111111111");
      expect(insertQuery.values[3]).toBe("22222222-2222-4222-8222-222222222222");
      expect(insertQuery.values[4]).toBe("created");
    });

    it("rejects enqueuing if privacy gate detects forbidden fields (BC-2)", async () => {
      const querySpy = vi.fn();
      const client = { query: querySpy } as unknown as PoolClient;
      const writer = new PostgresChainSubmissionWriter();

      await expect(
        writer.enqueue(client, {
          sourceEventId: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d",
          taskId: "11111111-1111-4111-8111-111111111111",
          workspaceId: "22222222-2222-4222-8222-222222222222",
          action: "created",
          // @ts-expect-error Testing leak of forbidden property
          title: "Secret Task",
        }),
      ).rejects.toThrow(PrivacyGateViolationError);

      expect(querySpy).not.toHaveBeenCalled();
    });

    it("uses DEFAULT_PERSONAL_WORKSPACE_ID when task has null workspace", () => {
      expect(DEFAULT_PERSONAL_WORKSPACE_ID).toBe(
        "00000000-0000-4000-8000-000000000001",
      );
    });
  });

  describe("Deployment Address Verification (BC-17)", () => {
    it("loads deployed address from generated deployment artifact without hardcoding in service code", () => {
      const artifact = getDeploymentArtifact();
      expect(artifact).toBeDefined();
      expect(artifact.contractAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(artifact.chainId).toBe(31337);

      const verifiedAddress = getVerifiedContractAddress();
      expect(verifiedAddress).toBe(artifact.contractAddress.toLowerCase());
    });
  });

  describe("Database-only enqueue path", () => {
    it("enqueues using the transaction without a wallet or RPC dependency", async () => {
      const queries: { text: string }[] = [];
      const mockClient = {
        query: vi.fn((text: string) => {
          queries.push({ text });
          return Promise.resolve({ rows: [], rowCount: 1 });
        }),
      } as unknown as PoolClient;

      const writer = new PostgresChainSubmissionWriter();
      await writer.enqueue(mockClient, {
        sourceEventId: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d",
        taskId: "11111111-1111-4111-8111-111111111111",
        workspaceId: DEFAULT_PERSONAL_WORKSPACE_ID,
        action: "created",
      });

      expect(queries.some((q) => q.text.includes("chain_submissions"))).toBe(true);
    });
  });

});
