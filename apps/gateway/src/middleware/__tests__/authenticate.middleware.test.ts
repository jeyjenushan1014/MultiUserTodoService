import {
  SignJWT,
} from "jose";

import type {
  NextFunction,
  Request,
  Response,
} from "express";

import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  env,
} from "../../config/env.js";

const redisState:
  {
    isReady: boolean;
    values: Map<string, string>;
  } = {
    isReady: true,
    values: new Map(),
  };

vi.mock(
  "../../config/redis.js",
  () => ({
    redis: {
      get isReady(): boolean {
        return redisState.isReady;
      },
      get: (
        key: string,
      ): Promise<string | null> =>
        Promise.resolve(
          redisState.values.get(key) ??
            null,
        ),
    },
  }),
);

const {
  authenticate,
} = await import(
  "../authenticate.middleware.js"
);

function createRequest(
  token: string,
): Request {
  return {
    header: (
      name: string,
    ): string | undefined =>
      name.toLowerCase() ===
        "authorization"
        ? `Bearer ${token}`
        : undefined,
  } as Request;
}

function createResponse(): Response {
  return {
    locals: {},
  } as unknown as Response;
}

async function signAccessToken(
  overrides?: {
    readonly sessionId?: string;
    readonly userId?: string;
    readonly issuedAt?: number;
  },
): Promise<string> {
  return new SignJWT({
    sid:
      overrides?.sessionId ??
      "session-1",

    email:
      "user@example.com",
  })
    .setProtectedHeader({
      alg: "HS256",
    })
    .setSubject(
      overrides?.userId ??
        "user-1",
    )
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setIssuedAt(
      overrides?.issuedAt,
    )
    .setExpirationTime("15m")
    .sign(
      new TextEncoder().encode(
        env.JWT_SECRET,
      ),
    );
}

describe(
  "authenticate middleware",
  () => {
    afterEach(() => {
      redisState.isReady = true;
      redisState.values.clear();
    });

    it(
      "allows a request whose session is not revoked, without calling Account Service",
      async () => {
        const token =
          await signAccessToken();

        const request =
          createRequest(token);

        const response =
          createResponse();

        const next =
          vi.fn() as NextFunction;

        await new Promise<void>(
          (resolve) => {
            (
              authenticate as (
                request: Request,
                response: Response,
                next: NextFunction,
              ) => void
            )(
              request,
              response,
              (
                error?: unknown,
              ): void => {
                (next as (
                  error?: unknown,
                ) => void)(error);

                resolve();
              },
            );
          },
        );

        expect(next).toHaveBeenCalledWith(undefined);
        expect(
          response.locals.callerIdentity,
        ).toEqual({
          userId: "user-1",
          sessionId: "session-1",
          email: "user@example.com",
        });
      },
    );

    it(
      "rejects a request whose specific session was revoked",
      async () => {
        redisState.values.set(
          "session-revoked:session-1",
          String(
            Math.floor(
              Date.now() / 1000,
            ),
          ),
        );

        const token =
          await signAccessToken();

        const request =
          createRequest(token);

        const response =
          createResponse();

        const next =
          vi.fn() as NextFunction;

        await new Promise<void>(
          (resolve) => {
            (
              authenticate as (
                request: Request,
                response: Response,
                next: NextFunction,
              ) => void
            )(
              request,
              response,
              (
                error?: unknown,
              ): void => {
                (next as (
                  error?: unknown,
                ) => void)(error);

                resolve();
              },
            );
          },
        );

        const error =
          (next as ReturnType<typeof vi.fn>)
            .mock.calls[0]?.[0] as {
              statusCode?: number;
              code?: string;
            };

        expect(error.statusCode).toBe(401);
        expect(error.code).toBe(
          "INVALID_ACCESS_TOKEN",
        );
      },
    );

    it(
      "rejects a token issued before an account-wide revocation",
      async () => {
        const revokedAtEpochSeconds =
          Math.floor(
            Date.now() / 1000,
          );

        redisState.values.set(
          "account-revoked:user-1",
          String(revokedAtEpochSeconds),
        );

        const token =
          await signAccessToken({
            issuedAt:
              revokedAtEpochSeconds -
              60,
          });

        const request =
          createRequest(token);

        const response =
          createResponse();

        const next =
          vi.fn() as NextFunction;

        await new Promise<void>(
          (resolve) => {
            (
              authenticate as (
                request: Request,
                response: Response,
                next: NextFunction,
              ) => void
            )(
              request,
              response,
              (
                error?: unknown,
              ): void => {
                (next as (
                  error?: unknown,
                ) => void)(error);

                resolve();
              },
            );
          },
        );

        const error =
          (next as ReturnType<typeof vi.fn>)
            .mock.calls[0]?.[0] as {
              statusCode?: number;
            };

        expect(error.statusCode).toBe(401);
      },
    );

    it(
      "fails open when Redis is unavailable",
      async () => {
        redisState.isReady = false;

        const token =
          await signAccessToken();

        const request =
          createRequest(token);

        const response =
          createResponse();

        const next =
          vi.fn() as NextFunction;

        await new Promise<void>(
          (resolve) => {
            (
              authenticate as (
                request: Request,
                response: Response,
                next: NextFunction,
              ) => void
            )(
              request,
              response,
              (
                error?: unknown,
              ): void => {
                (next as (
                  error?: unknown,
                ) => void)(error);

                resolve();
              },
            );
          },
        );

        expect(next).toHaveBeenCalledWith(undefined);
      },
    );
  },
);
