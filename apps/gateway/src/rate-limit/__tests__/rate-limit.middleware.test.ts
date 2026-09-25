import type {
  NextFunction,
  Request,
  Response,
} from "express";

import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createRateLimitMiddleware,
} from "../rate-limit.middleware.js";

import type {
  RateLimitService,
} from "../rate-limit.service.js";

function createResponse(): {
  readonly response:
    Response;

  readonly setHeaderMock:
    ReturnType<
      typeof vi.fn
    >;
} {
  const setHeaderMock =
    vi.fn();

  const response = {
    setHeader:
      setHeaderMock,
  } as unknown as Response;

  return {
    response,
    setHeaderMock,
  };
}

describe(
  "rate-limit middleware",
  () => {
    it(
      "allows a request below the limit",
      async () => {
        const consumeMock =
          vi.fn().mockResolvedValue({
            allowed:
              true,

            limit:
              10,

            remaining:
              9,

            resetAfterSeconds:
              60,
          });

        const service = {
          consume:
            consumeMock,
        } as unknown as
          RateLimitService;

        const middleware =
          createRateLimitMiddleware({
            service,

            policy: {
              scope:
                "test",

              maximumRequests:
                10,

              windowSeconds:
                60,
            },

            resolveIdentifier:
              () =>
                "test-client",
          });

        const request = {
          ip:
            "127.0.0.1",

          socket: {},
        } as Request;

        const {
          response,
          setHeaderMock,
        } =
          createResponse();

        const nextMock =
          vi.fn();

        await middleware(
          request,
          response,
          nextMock as
            NextFunction,
        );

        expect(
          nextMock,
        ).toHaveBeenCalledWith();

        expect(
          setHeaderMock,
        ).toHaveBeenCalledWith(
          "RateLimit-Remaining",
          "9",
        );
      },
    );

    it(
      "returns a 429 error when the limit is exceeded",
      async () => {
        const service = {
          consume:
            vi.fn()
              .mockResolvedValue({
                allowed:
                  false,

                limit:
                  10,

                remaining:
                  0,

                resetAfterSeconds:
                  30,
              }),
        } as unknown as
          RateLimitService;

        const middleware =
          createRateLimitMiddleware({
            service,

            policy: {
              scope:
                "test",

              maximumRequests:
                10,

              windowSeconds:
                60,
            },

            resolveIdentifier:
              () =>
                "test-client",
          });

        const {
          response,
        } =
          createResponse();

        const nextMock =
          vi.fn();

        await middleware(
          {
            ip:
              "127.0.0.1",

            socket: {},
          } as Request,
          response,
          nextMock as
            NextFunction,
        );

        expect(
          nextMock,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode:
              429,

            code:
              "RATE_LIMIT_EXCEEDED",
          }),
        );
      },
    );

    it(
      "fails open when Redis is unavailable",
      async () => {
        const service = {
          consume:
            vi.fn()
              .mockResolvedValue(
                undefined,
              ),
        } as unknown as
          RateLimitService;

        const middleware =
          createRateLimitMiddleware({
            service,

            policy: {
              scope:
                "test",

              maximumRequests:
                10,

              windowSeconds:
                60,
            },

            resolveIdentifier:
              () =>
                "test-client",
          });

        const nextMock =
          vi.fn();

        await middleware(
          {
            ip:
              "127.0.0.1",

            socket: {},
          } as Request,
          createResponse()
            .response,
          nextMock as
            NextFunction,
        );

        expect(
          nextMock,
        ).toHaveBeenCalledWith();
      },
    );

    it(
      "fails closed for protected policies when Redis is unavailable",
      async () => {
        const service = {
          consume:
            vi.fn()
              .mockResolvedValue(
                undefined,
              ),
        } as unknown as
          RateLimitService;

        const middleware =
          createRateLimitMiddleware({
            service,

            policy: {
              scope:
                "authentication",

              maximumRequests:
                10,

              windowSeconds:
                60,

              failClosed:
                true,
            },
          });

        const nextMock =
          vi.fn();

        await middleware(
          {
            ip:
              "127.0.0.1",

            socket: {},
          } as Request,
          createResponse()
            .response,
          nextMock as
            NextFunction,
        );

        expect(
          nextMock,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode:
              503,

            code:
              "RATE_LIMIT_UNAVAILABLE",
          }),
        );
      },
    );

    it(
      "fails open when the rate-limit service rejects for an unavailable Redis",
      async () => {
        const service = {
          consume:
            vi.fn()
              .mockRejectedValue(
                new Error(
                  "Redis unavailable",
                ),
              ),
        } as unknown as
          RateLimitService;

        const middleware =
          createRateLimitMiddleware({
            service,

            policy: {
              scope:
                "test",

              maximumRequests:
                10,

              windowSeconds:
                60,
            },
          });

        const nextMock =
          vi.fn();

        await middleware(
          {
            ip:
              "127.0.0.1",

            socket: {},
          } as Request,
          createResponse()
            .response,
          nextMock as
            NextFunction,
        );

        expect(
          nextMock,
        ).toHaveBeenCalledWith();
      },
    );

    it(
      "fails closed when the rate-limit service rejects for an unavailable Redis",
      async () => {
        const service = {
          consume:
            vi.fn()
              .mockRejectedValue(
                new Error(
                  "Redis unavailable",
                ),
              ),
        } as unknown as
          RateLimitService;

        const middleware =
          createRateLimitMiddleware({
            service,

            policy: {
              scope:
                "authentication",

              maximumRequests:
                10,

              windowSeconds:
                60,

              failClosed:
                true,
            },
          });

        const nextMock =
          vi.fn();

        await middleware(
          {
            ip:
              "127.0.0.1",

            socket: {},
          } as Request,
          createResponse()
            .response,
          nextMock as
            NextFunction,
        );

        expect(
          nextMock,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode:
              503,

            code:
              "RATE_LIMIT_UNAVAILABLE",
          }),
        );
      },
    );
  },
);