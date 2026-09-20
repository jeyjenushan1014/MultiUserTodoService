import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  InternalIdentityEnvelope,
} from "@todo/contracts";

import {
  decodeIdentity,
  encodeIdentity,
  signIdentity,
  verifyIdentitySignature,
} from "../security/identity-signature.js";

const secret =
  "this-is-a-test-secret-with-more-than-32-characters";

const identity:
  InternalIdentityEnvelope = {
    userId:
      "a95fd118-f777-4500-9ea9-7d1a650fdadb",
    sessionId:
      "29686b93-e275-428d-a7ef-cd86267bb53f",
    email: "user@example.com",
    requestId:
      "49ba39a3-437e-48c8-bac0-b3fcb5f35ca2",
    issuedAt: 1_750_000_000,
  };

describe("identity-signature utilities", () => {
  it("encodes and decodes an identity", () => {
    const encoded =
      encodeIdentity(identity);

    expect(
      decodeIdentity(encoded),
    ).toEqual(identity);
  });

  it("accepts a correct signature", () => {
    const encoded =
      encodeIdentity(identity);

    const signature =
      signIdentity(
        encoded,
        secret,
      );

    expect(
      verifyIdentitySignature(
        encoded,
        signature,
        secret,
      ),
    ).toBe(true);
  });

  it("rejects a modified identity", () => {
    const encoded =
      encodeIdentity(identity);

    const signature =
      signIdentity(
        encoded,
        secret,
      );

    const modified =
      `${encoded}modified`;

    expect(
      verifyIdentitySignature(
        modified,
        signature,
        secret,
      ),
    ).toBe(false);
  });

  it("rejects a signature made with another secret", () => {
    const encoded =
      encodeIdentity(identity);

    const signature =
      signIdentity(
        encoded,
        "another-secret-with-more-than-32-characters",
      );

    expect(
      verifyIdentitySignature(
        encoded,
        signature,
        secret,
      ),
    ).toBe(false);
  });

  it("rejects a malformed signature", () => {
    const encoded =
      encodeIdentity(identity);

    expect(
      verifyIdentitySignature(
        encoded,
        "not-a-hex-signature",
        secret,
      ),
    ).toBe(false);
  });
});