import {
  SignJWT,
} from "jose";

import type {
  Request,
} from "express";

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  env,
} from "../../config/env.js";

import {
  verifyAccessToken,
} from "../access-token-verifier.js";

const secret =
  new TextEncoder().encode(
    env.JWT_SECRET,
  );

function createRequest(
  authorization?:
    string,
): Request {
  return {
    header: (
      name: string,
    ): string | undefined => {
      if (
        name.toLowerCase() ===
        "authorization"
      ) {
        return authorization;
      }

      return undefined;
    },
  } as Request;
}

interface TokenOptions {
  readonly issuer?:
    string;

  readonly audience?:
    string;

  readonly expiresIn?:
    string | number;
}

async function createToken(
  options?:
    TokenOptions,
): Promise<string> {
  return new SignJWT({
    sid:
      "session-id",

    email:
      "user@example.com",
  })
    .setProtectedHeader({
      alg:
        "HS256",
    })
    .setSubject(
      "user-id",
    )
    .setIssuer(
      options?.issuer ??
        env.JWT_ISSUER,
    )
    .setAudience(
      options?.audience ??
        env.JWT_AUDIENCE,
    )
    .setIssuedAt()
    .setExpirationTime(
      options?.expiresIn ??
        "15m",
    )
    .sign(
      secret,
    );
}

describe(
  "verifyAccessToken",
  () => {
    it(
      "accepts a valid token",
      async () => {
        const token =
          await createToken();

        const result =
          await verifyAccessToken(
            createRequest(
              `Bearer ${token}`,
            ),
          );

        expect(result).toEqual({
          userId:
            "user-id",

          sessionId:
            "session-id",

          email:
            "user@example.com",
        });
      },
    );

    it(
      "rejects a missing token",
      async () => {
        await expect(
          verifyAccessToken(
            createRequest(),
          ),
        ).rejects.toMatchObject({
          statusCode:
            401,

          code:
            "INVALID_ACCESS_TOKEN",
        });
      },
    );

    it(
      "rejects an invalid token",
      async () => {
        await expect(
          verifyAccessToken(
            createRequest(
              "Bearer invalid-token",
            ),
          ),
        ).rejects.toMatchObject({
          statusCode:
            401,

          code:
            "INVALID_ACCESS_TOKEN",
        });
      },
    );

    it(
      "rejects the wrong issuer",
      async () => {
        const token =
          await createToken({
            issuer:
              "wrong-issuer",
          });

        await expect(
          verifyAccessToken(
            createRequest(
              `Bearer ${token}`,
            ),
          ),
        ).rejects.toMatchObject({
          statusCode:
            401,

          code:
            "INVALID_ACCESS_TOKEN",
        });
      },
    );

    it(
      "rejects the wrong audience",
      async () => {
        const token =
          await createToken({
            audience:
              "wrong-audience",
          });

        await expect(
          verifyAccessToken(
            createRequest(
              `Bearer ${token}`,
            ),
          ),
        ).rejects.toMatchObject({
          statusCode:
            401,

          code:
            "INVALID_ACCESS_TOKEN",
        });
      },
    );

    it(
      "rejects an expired token",
      async () => {
        const token =
          await createToken({
            expiresIn:
              Math.floor(Date.now() / 1000) - 60,
          });

        await expect(
          verifyAccessToken(
            createRequest(
              `Bearer ${token}`,
            ),
          ),
        ).rejects.toMatchObject({
          statusCode:
            401,

          code:
            "INVALID_ACCESS_TOKEN",
        });
      },
    );
  },
);