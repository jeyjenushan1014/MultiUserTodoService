import {
  describe,
  expect,
  it,
} from "vitest";

import {
  accountRegisteredEventSchema,
} from "../account-event.schema.js";

function createValidEvent():
  Record<string, unknown> {
  return {
    eventId:
      "5403d006-532f-4d5f-8200-9893fe84e00d",

    eventType:
      "account.registered",

    eventVersion:
      1,

    occurredAt:
      "2026-09-22T10:00:00.000Z",

    requestId:
      "67dd883e-0ca4-4101-9a11-5bf22dbfcaf0",

    producer:
      "account-service",

    payload: {
      userId:
        "3bf53c86-0932-43d0-85ed-bd536c694677",

      email:
        "user@example.com",
    },
  };
}

describe(
  "accountRegisteredEventSchema",
  () => {
    it(
      "accepts a valid account event",
      () => {
        const result =
          accountRegisteredEventSchema
            .parse(
              createValidEvent(),
            );

        expect(result).toMatchObject({
          eventType:
            "account.registered",

          payload: {
            userId:
              "3bf53c86-0932-43d0-85ed-bd536c694677",

            email:
              "user@example.com",
          },
        });
      },
    );

    it(
      "rejects an unsupported event type",
      () => {
        const event =
          createValidEvent();

        event.eventType =
          "account.deleted";

        const result =
          accountRegisteredEventSchema
            .safeParse(event);

        expect(
          result.success,
        ).toBe(false);
      },
    );

    it(
      "rejects an invalid producer",
      () => {
        const event =
          createValidEvent();

        event.producer =
          "unknown-service";

        const result =
          accountRegisteredEventSchema
            .safeParse(event);

        expect(
          result.success,
        ).toBe(false);
      },
    );

    it(
      "rejects an invalid payload email",
      () => {
        const event =
          createValidEvent();

        event.payload = {
          userId:
            "3bf53c86-0932-43d0-85ed-bd536c694677",

          email:
            "invalid-email",
        };

        const result =
          accountRegisteredEventSchema
            .safeParse(event);

        expect(
          result.success,
        ).toBe(false);
      },
    );

    it(
      "rejects outbox-only metadata",
      () => {
        const event =
          createValidEvent();

        event.aggregateType =
          "account";

        event.aggregateId =
          "3bf53c86-0932-43d0-85ed-bd536c694677";

        const result =
          accountRegisteredEventSchema
            .safeParse(event);

        expect(
          result.success,
        ).toBe(false);
      },
    );
  },
);