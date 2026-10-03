import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../");

// Ordinary unit tests cannot provide PostgreSQL evidence. Day-4 supplies a dedicated
// role-free cluster and must explicitly enable this fail-closed integration suite.
describe.skipIf(process.env.EV_RUN_POSTGRES !== "1")("Real PostgreSQL schema evolution (EV-1/2/9/10)", () => {
  it("executes every migration up/down and previous repository HTTP traffic during additive DDL", async () => {
    expect(process.env.EV_DATABASE_URL, "Dedicated EV_DATABASE_URL is required").toBeTruthy();
    const result = await new Promise<{ code: number | null; output: string }>((done, reject) => {
      const child = spawn(process.execPath, [resolve(repoRoot, "scripts/verify-evolution-schema.mjs")], {
        cwd: repoRoot,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 170_000,
      });
      let output = "";
      child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
      child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
      child.on("error", reject);
      child.on("close", (code) => { done({ code, output }); });
    });
    expect(result.code, result.output).toBe(0);
    const evidence = JSON.parse(result.output) as {
      services: { service: string; up: string[]; down: string[] }[];
      online: {
        overlappingRequests: number;
        pendingAccessExclusiveLockObserved: boolean;
        previousRepositorySqlWaitingDuringDdlObserved: boolean;
      };
    };
    expect(evidence.services.map((service) => service.service)).toEqual(["account", "todo"]);
    for (const service of evidence.services) {
      expect(service.up.length).toBeGreaterThan(0);
      expect(service.down).toEqual([...service.up].reverse());
    }
    expect(evidence.online.overlappingRequests).toBeGreaterThan(0);
    expect(evidence.online.pendingAccessExclusiveLockObserved).toBe(true);
    expect(evidence.online.previousRepositorySqlWaitingDuringDdlObserved).toBe(true);
  }, 180_000);
});
