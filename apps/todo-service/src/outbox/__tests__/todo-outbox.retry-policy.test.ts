import {
  describe,
  expect,
  it,
} from "vitest";

import {
  calculateTodoOutboxRetryDelayMilliseconds,
  createTodoOutboxNextAttemptAt,
} from "../todo-outbox.retry-policy.js";

describe(
  "TODO outbox retry policy",
  () => {
    it(
      "uses one second for the first attempt",
      () => {
        expect(
          calculateTodoOutboxRetryDelayMilliseconds(
            1,
          ),
        ).toBe(
          1_000,
        );
      },
    );

    it(
      "increases the delay exponentially",
      () => {
        expect(
          calculateTodoOutboxRetryDelayMilliseconds(
            2,
          ),
        ).toBe(
          2_000,
        );

        expect(
          calculateTodoOutboxRetryDelayMilliseconds(
            5,
          ),
        ).toBe(
          16_000,
        );
      },
    );

    it(
      "caps the retry delay at sixty seconds",
      () => {
        expect(
          calculateTodoOutboxRetryDelayMilliseconds(
            20,
          ),
        ).toBe(
          60_000,
        );
      },
    );

    it(
      "creates the next absolute attempt date",
      () => {
        const currentTime =
          new Date(
            "2026-09-24T13:00:00.000Z",
          );

        const result =
          createTodoOutboxNextAttemptAt(
            3,
            currentTime,
          );

        expect(
          result.toISOString(),
        ).toBe(
          "2026-09-24T13:00:04.000Z",
        );
      },
    );
  },
);