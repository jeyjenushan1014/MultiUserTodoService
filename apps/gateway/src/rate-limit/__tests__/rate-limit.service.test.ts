import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  Mock,
} from "vitest";

import type {
  RateLimitStore,
} from "../rate-limit.store.interface.js";

import {
  RateLimitService,
} from "../rate-limit.service.js";

interface RateLimitStoreFixture {
  readonly store:
    RateLimitStore;

  readonly consumeMock:
    Mock<
      RateLimitStore[
        "consume"
      ]
    >;
}

/*
Creates the mock separately from the store object.

The store calls the mock through an arrow function.
This avoids passing an unbound interface method to
vi.mocked().
*/
function createStoreFixture():
  RateLimitStoreFixture {
  const consumeMock =
    vi.fn<
      RateLimitStore[
        "consume"
      ]
    >();

  const store:
    RateLimitStore = {
      consume:
        (
          command,
        ) =>
          consumeMock(
            command,
          ),
    };

  return {
    store,
    consumeMock,
  };
}

describe(
  "RateLimitService",
  () => {
    it(
      "allows a request below the limit",
      async () => {
        const {
          store,
          consumeMock,
        } =
          createStoreFixture();

        consumeMock
          .mockResolvedValueOnce({
            currentCount:
              3,

            remainingMilliseconds:
              30_000,
          });

        const service =
          new RateLimitService(
            store,
          );

        const result =
          await service.consume(
            "rate-limit:test",
            {
              scope:
                "test",

              maximumRequests:
                10,

              windowSeconds:
                60,
            },
          );

        expect(
          result,
        ).toEqual({
          allowed:
            true,

          limit:
            10,

          remaining:
            7,

          resetAfterSeconds:
            30,
        });

        expect(
          consumeMock,
        ).toHaveBeenCalledOnce();

        expect(
          consumeMock,
        ).toHaveBeenCalledWith({
          key:
            "rate-limit:test",

          maximumRequests:
            10,

          windowMilliseconds:
            60_000,
        });
      },
    );

    it(
      "allows the request exactly at the limit",
      async () => {
        const {
          store,
          consumeMock,
        } =
          createStoreFixture();

        consumeMock
          .mockResolvedValueOnce({
            currentCount:
              10,

            remainingMilliseconds:
              15_000,
          });

        const service =
          new RateLimitService(
            store,
          );

        const result =
          await service.consume(
            "rate-limit:test",
            {
              scope:
                "test",

              maximumRequests:
                10,

              windowSeconds:
                60,
            },
          );

        expect(
          result,
        ).toEqual({
          allowed:
            true,

          limit:
            10,

          remaining:
            0,

          resetAfterSeconds:
            15,
        });
      },
    );

    it(
      "rejects a request above the limit",
      async () => {
        const {
          store,
          consumeMock,
        } =
          createStoreFixture();

        consumeMock
          .mockResolvedValueOnce({
            currentCount:
              11,

            remainingMilliseconds:
              20_000,
          });

        const service =
          new RateLimitService(
            store,
          );

        const result =
          await service.consume(
            "rate-limit:test",
            {
              scope:
                "test",

              maximumRequests:
                10,

              windowSeconds:
                60,
            },
          );

        expect(
          result,
        ).toEqual({
          allowed:
            false,

          limit:
            10,

          remaining:
            0,

          resetAfterSeconds:
            20,
        });
      },
    );

    it(
      "rounds the reset duration up to the next second",
      async () => {
        const {
          store,
          consumeMock,
        } =
          createStoreFixture();

        consumeMock
          .mockResolvedValueOnce({
            currentCount:
              1,

            remainingMilliseconds:
              1_001,
          });

        const service =
          new RateLimitService(
            store,
          );

        const result =
          await service.consume(
            "rate-limit:test",
            {
              scope:
                "test",

              maximumRequests:
                10,

              windowSeconds:
                60,
            },
          );

        expect(
          result,
        ).toEqual({
          allowed:
            true,

          limit:
            10,

          remaining:
            9,

          resetAfterSeconds:
            2,
        });
      },
    );

    it(
      "returns a minimum reset duration of one second",
      async () => {
        const {
          store,
          consumeMock,
        } =
          createStoreFixture();

        consumeMock
          .mockResolvedValueOnce({
            currentCount:
              1,

            remainingMilliseconds:
              0,
          });

        const service =
          new RateLimitService(
            store,
          );

        const result =
          await service.consume(
            "rate-limit:test",
            {
              scope:
                "test",

              maximumRequests:
                10,

              windowSeconds:
                60,
            },
          );

        expect(
          result?.resetAfterSeconds,
        ).toBe(
          1,
        );
      },
    );

    it(
      "never returns a negative remaining count",
      async () => {
        const {
          store,
          consumeMock,
        } =
          createStoreFixture();

        consumeMock
          .mockResolvedValueOnce({
            currentCount:
              25,

            remainingMilliseconds:
              10_000,
          });

        const service =
          new RateLimitService(
            store,
          );

        const result =
          await service.consume(
            "rate-limit:test",
            {
              scope:
                "test",

              maximumRequests:
                10,

              windowSeconds:
                60,
            },
          );

        expect(
          result?.remaining,
        ).toBe(
          0,
        );

        expect(
          result?.allowed,
        ).toBe(
          false,
        );
      },
    );

    it(
      "fails open when the store is unavailable",
      async () => {
        const {
          store,
          consumeMock,
        } =
          createStoreFixture();

        consumeMock
          .mockResolvedValueOnce(
            undefined,
          );

        const service =
          new RateLimitService(
            store,
          );

        await expect(
          service.consume(
            "rate-limit:test",
            {
              scope:
                "test",

              maximumRequests:
                10,

              windowSeconds:
                60,
            },
          ),
        ).resolves.toBeUndefined();

        expect(
          consumeMock,
        ).toHaveBeenCalledOnce();
      },
    );
  },
);