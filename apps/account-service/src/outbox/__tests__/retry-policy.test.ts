import {
  describe,
  expect,
  it,
} from "vitest";

import {
  calculateNextAttemptAt,
  calculateRetryDelaySeconds,
} from "../retry-policy.js";

describe(
  "calculateRetryDelaySeconds",
  () => {
    it(
      "uses exponential backoff",
      () => {
        expect(
          calculateRetryDelaySeconds(
            0,
            300,
          ),
        ).toBe(2);

        expect(
          calculateRetryDelaySeconds(
            1,
            300,
          ),
        ).toBe(4);

        expect(
          calculateRetryDelaySeconds(
            2,
            300,
          ),
        ).toBe(8);

        expect(
          calculateRetryDelaySeconds(
            3,
            300,
          ),
        ).toBe(16);
      },
    );

    it(
      "does not exceed the maximum delay",
      () => {
        expect(
          calculateRetryDelaySeconds(
            20,
            300,
          ),
        ).toBe(300);
      },
    );

    it(
      "handles negative attempt values",
      () => {
        expect(
          calculateRetryDelaySeconds(
            -5,
            300,
          ),
        ).toBe(2);
      },
    );
  },
);

describe(
  "calculateNextAttemptAt",
  () => {
    it(
      "returns the next retry timestamp",
      () => {
        const now =
          new Date(
            "2026-09-22T10:00:00.000Z",
          );

        const result =
          calculateNextAttemptAt(
            now,
            2,
            300,
          );

        expect(
          result.toISOString(),
        ).toBe(
          "2026-09-22T10:00:08.000Z",
        );
      },
    );
  },
);