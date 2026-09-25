import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  OutboxEvent,
} from "../outbox.types.js";

import {
  createEnvelope,
} from "../outbox.service.js";

function makeEvent(): OutboxEvent {
  return {
    id:
      "5403d006-532f-4d5f-8200-9893fe84e00d",

    aggregateType:
      "account",

    aggregateId:
      "3bf53c86-0932-43d0-85ed-bd536c694677",

    eventType:
      "account.registered",

    eventVersion:
      1,

    payload: {
      userId:
        "3bf53c86-0932-43d0-85ed-bd536c694677",

      email:
        "user@example.com",
    },

    requestId:
      "67dd883e-0ca4-4101-9a11-5bf22dbfcaf0",

    occurredAt:
      new Date(),

    publishAttempts:
      0,
  };
}

describe(
  "createEnvelope",
  () => {
    it(
      "does not include outbox metadata in the published body",
      () => {
        const envelope =
          createEnvelope(
            makeEvent(),
          );

        expect(
          "aggregateType" in envelope,
        ).toBe(false);

        expect(
          "aggregateId" in envelope,
        ).toBe(false);

        expect(
          envelope.eventId,
        ).toBeDefined();

        expect(
          envelope.eventType,
        ).toBeDefined();

        expect(
          envelope.payload,
        ).toBeDefined();
      },
    );
  },
);
