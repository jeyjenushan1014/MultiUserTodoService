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
  "test-internal-secret-with-at-least-32-characters";

function createIdentity():
  InternalIdentityEnvelope {
  return {
    issuer:
      "gateway",

    audience:
      "todo-service",

    requestId:
      "b4f29a51-bcc9-4c7d-9a62-2562ff18ea0d",

    issuedAt:
      1_790_150_000,

    expiresAt:
      1_790_150_030,

    userId:
      "98671bf7-07fe-484c-a63b-884d58ffec54",

    email:
      "user@example.com",

    sessionId:
      "83a32d9d-7401-4576-896e-580afecba95a",
  };
}

describe(
  "identity signature",
  () => {
    it(
      "encodes and decodes a valid identity",
      () => {
        const identity =
          createIdentity();

        const encodedIdentity =
          encodeIdentity(
            identity,
          );

        expect(
          decodeIdentity(
            encodedIdentity,
          ),
        ).toEqual(
          identity,
        );
      },
    );

    it(
      "creates a hexadecimal SHA-256 signature",
      () => {
        const signature =
          signIdentity(
            encodeIdentity(
              createIdentity(),
            ),
            secret,
          );

        expect(
          signature,
        ).toMatch(
          /^[0-9a-f]{64}$/u,
        );
      },
    );

    it(
      "accepts a valid signature",
      () => {
        const encodedIdentity =
          encodeIdentity(
            createIdentity(),
          );

        const signature =
          signIdentity(
            encodedIdentity,
            secret,
          );

        expect(
          verifyIdentitySignature(
            encodedIdentity,
            signature,
            secret,
          ),
        ).toBe(
          true,
        );
      },
    );

    it(
      "rejects a modified identity",
      () => {
        const originalIdentity =
          encodeIdentity(
            createIdentity(),
          );

        const signature =
          signIdentity(
            originalIdentity,
            secret,
          );

        const modifiedIdentity =
          encodeIdentity({
            ...createIdentity(),

            audience:
              "account-service",
          });

        expect(
          verifyIdentitySignature(
            modifiedIdentity,
            signature,
            secret,
          ),
        ).toBe(
          false,
        );
      },
    );

    it(
      "rejects a signature made with another secret",
      () => {
        const encodedIdentity =
          encodeIdentity(
            createIdentity(),
          );

        const signature =
          signIdentity(
            encodedIdentity,
            "different-secret-with-at-least-32-characters",
          );

        expect(
          verifyIdentitySignature(
            encodedIdentity,
            signature,
            secret,
          ),
        ).toBe(
          false,
        );
      },
    );

    it(
      "rejects a malformed signature",
      () => {
        expect(
          verifyIdentitySignature(
            encodeIdentity(
              createIdentity(),
            ),
            "invalid-signature",
            secret,
          ),
        ).toBe(
          false,
        );
      },
    );

    it(
      "rejects identity JSON with missing fields",
      () => {
        const invalidIdentity =
          Buffer
            .from(
              JSON.stringify({
                issuer:
                  "gateway",

                audience:
                  "todo-service",
              }),
              "utf8",
            )
            .toString(
              "base64url",
            );

        expect(
          () => decodeIdentity(
            invalidIdentity,
          ),
        ).toThrow(
          "Internal identity has an invalid structure",
        );
      },
    );

    it(
      "rejects malformed JSON",
      () => {
        const invalidIdentity =
          Buffer
            .from(
              "not-json",
              "utf8",
            )
            .toString(
              "base64url",
            );

        expect(
          () => decodeIdentity(
            invalidIdentity,
          ),
        ).toThrow(
          "Internal identity is not valid Base64URL JSON",
        );
      },
    );

    it(
      "rejects an expiry before the issue time",
      () => {
        const identity = {
          ...createIdentity(),

          expiresAt:
            1_790_149_999,
        };

        const encodedIdentity =
          Buffer
            .from(
              JSON.stringify(
                identity,
              ),
              "utf8",
            )
            .toString(
              "base64url",
            );

        expect(
          () => decodeIdentity(
            encodedIdentity,
          ),
        ).toThrow(
          "Internal identity has an invalid structure",
        );
      },
    );
  },
);