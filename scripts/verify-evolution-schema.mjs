#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyEvolutionSchema } from "./evolution/verify-postgres.mjs";

export { verifyEvolutionSchema };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const evidence = await verifyEvolutionSchema();
    console.log(JSON.stringify(evidence, null, 2));
  } catch (error) {
    // PostgreSQL/connection errors can contain credentials; never print their raw messages.
    console.error(`FAIL: schema evolution verification (${error.stage ?? "setup"}; ${error.code ?? "assertion"}).`);
    process.exitCode = 1;
  }
}
