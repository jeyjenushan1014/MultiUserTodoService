import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import type {
  InternalIdentityEnvelope,
} from "@todo/contracts";

export function encodeIdentity(
  identity: InternalIdentityEnvelope,
): string {
  return Buffer
    .from(
      JSON.stringify(identity),
      "utf8",
    )
    .toString("base64url");
}

export function signIdentity(
  encodedIdentity: string,
  secret: string,
): string {
  return createHmac(
    "sha256",
    secret,
  )
    .update(encodedIdentity)
    .digest("hex");
}

export function verifyIdentitySignature(
  encodedIdentity: string,
  receivedSignature: string,
  secret: string,
): boolean {
  const expected = Buffer.from(
    signIdentity(encodedIdentity, secret),
    "hex",
  );

  const received = Buffer.from(
    receivedSignature,
    "hex",
  );

  return (
    expected.length === received.length &&
    timingSafeEqual(expected, received)
  );
}