/*
This code creates a small signed identity mechanisim for communication between microservices.

The main idea:
identity Object -> JSON -> Base64URL -> HMAC signature 
-> receiver verifies signature -> decode identity

*/


import {
  createHmac,//Create a cryptographic signature
  timingSafeEqual,//used to securely compare 2 signatures
} from "node:crypto";

import type {
  InternalIdentityEnvelope,
} from "@todo/contracts";


//This functions accepts an identity object and returns a string
/*
Javascript object -> JSON String -> UTF-8 bytes -> Base64URL string
*/
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


// It can get the object from the Base64URL
export function decodeIdentity(
  encodedIdentity: string,
): InternalIdentityEnvelope {
  const decoded = Buffer
    .from(
      encodedIdentity,
      "base64url",
    )
    .toString("utf8");

  return JSON.parse(
    decoded,
  ) as InternalIdentityEnvelope;
}

export function signIdentity(
  encodedIdentity: string,
  secret: string,
): string {
  return createHmac(
    "sha256",
    secret,
  )
    .update(
      encodedIdentity,
      "utf8",
    )
    .digest("hex");
}

export function verifyIdentitySignature(
  encodedIdentity: string,
  receivedSignature: string,
  secret: string,
): boolean {
  if (
    !/^[0-9a-f]{64}$/i.test(
      receivedSignature,
    )
  ) {
    return false;
  }

  const expectedSignature =
    Buffer.from(
      signIdentity(
        encodedIdentity,
        secret,
      ),
      "hex",
    );

  const suppliedSignature =
    Buffer.from(
      receivedSignature,
      "hex",
    );

  return (
    expectedSignature.length ===
      suppliedSignature.length &&
    timingSafeEqual(
      expectedSignature,
      suppliedSignature,
    )
  );
}