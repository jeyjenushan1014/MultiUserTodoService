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

    eventVersion: 1,

    aggregateType:
      "account",

    aggregateId:
      "3bf53c86-0932-43d0-85ed-bd536c694677",

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
        expect(
          accountRegisteredEventSchema
            .parse(
              createValidEvent(),
            ),
        ).toMatchObject({
          eventType:
            "account.registered",

          aggregateId:
            "3bf53c86-0932-43d0-85ed-bd536c694677",
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

        expect(() =>
          accountRegisteredEventSchema
            .parse(event),
        ).toThrow();
      },
    );

    it(
      "rejects a mismatched aggregate ID",
      () => {
        const event =
          createValidEvent();

        event.aggregateId =
          "906d8bf4-6a14-40cb-a380-60909c0741db";

        expect(() =>
          accountRegisteredEventSchema
            .parse(event),
        ).toThrow(
          "Event aggregateId must match payload.userId",
        );
      },
    );

    it(
      "rejects an invalid producer",
      () => {
        const event =
          createValidEvent();

        event.producer =
          "unknown-service";

        expect(() =>
          accountRegisteredEventSchema
            .parse(event),
        ).toThrow();
      },
    );
  },
);