/*
Internal signed identity flow:

Identity object
  -> JSON
  -> Base64URL
  -> HMAC-SHA256 signature
  -> receiver verifies signature
  -> receiver decodes and validates identity
*/

import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import type {
  InternalIdentityEnvelope,
} from "@todo/contracts";

import {
  isInternalIdentityEnvelope,
} from "./internal-identity.validator.js";

/*
Creates the expected HMAC signature as raw bytes.

Keeping this operation in one function prevents the
signing and verification implementations from
becoming different.
*/
function createSignatureBuffer(
  encodedIdentity:
    string,
  secret:
    string,
): Buffer {
  return createHmac(
    "sha256",
    secret,
  )
    .update(
      encodedIdentity,
      "utf8",
    )
    .digest();
}

/*
Encodes the trusted identity for transmission in an
HTTP header.
*/
export function encodeIdentity(
  identity:
    InternalIdentityEnvelope,
): string {
  return Buffer
    .from(
      JSON.stringify(
        identity,
      ),
      "utf8",
    )
    .toString(
      "base64url",
    );
}

/*
Decodes and validates the identity at runtime.

A TypeScript assertion is not used here because
external request headers are untrusted runtime data.
*/
export function decodeIdentity(
  encodedIdentity:
    string,
): InternalIdentityEnvelope {
  let parsedIdentity:
    unknown;

  try {
    const decodedIdentity =
      Buffer
        .from(
          encodedIdentity,
          "base64url",
        )
        .toString(
          "utf8",
        );

    parsedIdentity =
      JSON.parse(
        decodedIdentity,
      ) as unknown;
  } catch {
    throw new Error(
      "Internal identity is not valid Base64URL JSON",
    );
  }

  if (
    !isInternalIdentityEnvelope(
      parsedIdentity,
    )
  ) {
    throw new Error(
      "Internal identity has an invalid structure",
    );
  }

  return parsedIdentity;
}

/*
Creates a 64-character hexadecimal HMAC-SHA256
signature.
*/
export function signIdentity(
  encodedIdentity:
    string,
  secret:
    string,
): string {
  return createSignatureBuffer(
    encodedIdentity,
    secret,
  ).toString(
    "hex",
  );
}

/*
Verifies the hexadecimal HMAC signature using a
timing-safe comparison.
*/
export function verifyIdentitySignature(
  encodedIdentity:
    string,
  receivedSignature:
    string,
  secret:
    string,
): boolean {
  if (
    !/^[0-9a-f]{64}$/iu.test(
      receivedSignature,
    )
  ) {
    return false;
  }

  const expectedSignature =
    createSignatureBuffer(
      encodedIdentity,
      secret,
    );

  const suppliedSignature =
    Buffer.from(
      receivedSignature,
      "hex",
    );

  if (
    expectedSignature.length !==
    suppliedSignature.length
  ) {
    return false;
  }

  return timingSafeEqual(
    expectedSignature,
    suppliedSignature,
  );
}