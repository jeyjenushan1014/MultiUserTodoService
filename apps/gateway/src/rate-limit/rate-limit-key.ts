import {
  createHash,
} from "node:crypto";

import {
  env,
} from "../config/env.js";

function hashIdentifier(
  identifier:
    string,
): string {
  return createHash(
    "sha256",
  )
    .update(
      identifier,
      "utf8",
    )
    .digest(
      "hex",
    );
}

export function createRateLimitKey(
  scope:
    string,
  identifier:
    string,
): string {
  return [
    env.RATE_LIMIT_KEY_PREFIX,
    scope,
    hashIdentifier(
      identifier,
    ),
  ].join(
    ":",
  );
}