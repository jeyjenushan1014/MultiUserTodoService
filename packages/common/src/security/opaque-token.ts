/*
It is used to prevent to store the raw toke.so attacker when get the database copy cannot get the raw credentials.
*/

import {
  createHash,
  randomBytes,
} from "node:crypto";

const DEFAULT_TOKEN_BYTES = 32;

export function createOpaqueToken(
  numberOfBytes: number =
    DEFAULT_TOKEN_BYTES,
): string {
  if (
    !Number.isInteger(numberOfBytes) ||
    numberOfBytes < 16
  ) {
    throw new RangeError(
      "Opaque token size must be an integer of at least 16 bytes",
    );
  }

  return randomBytes(numberOfBytes)
    .toString("base64url");
}

export function hashOpaqueToken(
  token: string,
): string {
  return createHash("sha256")
    .update(
      token,
      "utf8",
    )
    .digest("hex");
}