import {
  describe,
  expect,
  it,
} from "vitest";

import {
  redisReconnectStrategy,
} from "../redis.js";

describe(
  "Gateway Redis reconnect strategy",
  () => {
    it(
      "continues retrying with a capped delay",
      () => {
        expect(
          redisReconnectStrategy(
            1,
          ),
        ).toBe(100);

        expect(
          redisReconnectStrategy(
            10,
          ),
        ).toBe(1_000);

        expect(
          redisReconnectStrategy(
            100,
          ),
        ).toBe(3_000);

        expect(
          redisReconnectStrategy(
            1_000_000,
          ),
        ).toBe(3_000);
      },
    );
  },
);