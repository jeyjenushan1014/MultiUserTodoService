import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  WorkspaceMembershipChangedEventV1,
  WorkspaceMembershipChangedPayloadV1,
} from "@todo/contracts";

import {
  createEnvelope,
} from "../../../outbox/outbox.service.js";

import type {
  OutboxEvent,
} from "../../../outbox/outbox.types.js";

describe(
  "workspace membership published envelope",
  () => {
    it(
      "publishes the shared version 1 event shape",
      () => {
        /*
         * `satisfies` checks this producer payload against
         * the shared contract without changing the value's
         * inferred runtime shape.
         */
        const producerPayload = {
          workspaceId:
            "f0762196-e58e-469d-a857-6d5df68ca022",

          userId:
            "60fd290e-7fd0-468b-858c-40a53e78fe36",

          role:
            "viewer",

          changedAt:
            "2026-09-29T10:00:00.000Z",
        } satisfies
          WorkspaceMembershipChangedPayloadV1;

        const occurredAt =
          new Date(
            "2026-09-29T10:00:00.000Z",
          );

        const outboxEvent:
          OutboxEvent = {
            id:
              "7d80fc1e-c97a-43b7-905a-dd7186b23d94",

            aggregateType:
              "workspace-membership",

            aggregateId:
              "f0762196-e58e-469d-a857-6d5df68ca022",

            eventType:
              "workspace.membership-changed",

            eventVersion:
              1,

            payload:
              producerPayload,

            requestId:
              "796ec39c-c13c-436c-bf91-dd830e32c6c2",

            occurredAt,

            publishAttempts:
              0,
          };

        const envelope =
          createEnvelope(
            outboxEvent,
          );

        /*
         * Build the compile-time contract value from the
         * same producer payload supplied to the outbox.
         *
         * Do not read properties from envelope.payload,
         * because its production type is intentionally
         * unknown.
         */
        const contractEvent:
          WorkspaceMembershipChangedEventV1 = {
            eventId:
              envelope.eventId,

            eventType:
              "workspace.membership-changed",

            eventVersion:
              1,

            occurredAt:
              envelope.occurredAt,

            requestId:
              envelope.requestId,

            producer:
              envelope.producer,

            payload:
              producerPayload,
          };

        expect(
          envelope,
        ).toEqual({
          eventId:
            "7d80fc1e-c97a-43b7-905a-dd7186b23d94",

          eventType:
            "workspace.membership-changed",

          eventVersion:
            1,

          occurredAt:
            occurredAt.toISOString(),

          requestId:
            "796ec39c-c13c-436c-bf91-dd830e32c6c2",

          producer:
            "account-service",

          payload:
            producerPayload,
        });

        expect(
          contractEvent,
        ).toEqual(
          envelope,
        );
      },
    );

    it(
      "publishes null role for a removed membership",
      () => {
        const producerPayload = {
          workspaceId:
            "f0762196-e58e-469d-a857-6d5df68ca022",

          userId:
            "60fd290e-7fd0-468b-858c-40a53e78fe36",

          role:
            null,

          changedAt:
            "2026-09-29T10:05:00.000Z",
        } satisfies
          WorkspaceMembershipChangedPayloadV1;

        const outboxEvent:
          OutboxEvent = {
            id:
              "9c2ff176-08b2-4ac3-bf10-30c1f2907f18",

            aggregateType:
              "workspace-membership",

            aggregateId:
              "f0762196-e58e-469d-a857-6d5df68ca022",

            eventType:
              "workspace.membership-changed",

            eventVersion:
              1,

            payload:
              producerPayload,

            requestId:
              "5cf2a51a-4db8-4b72-b812-e23143014304",

            occurredAt:
              new Date(
                "2026-09-29T10:05:00.000Z",
              ),

            publishAttempts:
              0,
          };

        const envelope =
          createEnvelope(
            outboxEvent,
          );

        expect(
          envelope.payload,
        ).toEqual({
          workspaceId:
            "f0762196-e58e-469d-a857-6d5df68ca022",

          userId:
            "60fd290e-7fd0-468b-858c-40a53e78fe36",

          role:
            null,

          changedAt:
            "2026-09-29T10:05:00.000Z",
        });
      },
    );

    it(
      "does not publish internal outbox metadata",
      () => {
        const producerPayload = {
          workspaceId:
            "f0762196-e58e-469d-a857-6d5df68ca022",

          userId:
            "60fd290e-7fd0-468b-858c-40a53e78fe36",

          role:
            "editor",

          changedAt:
            "2026-09-29T10:10:00.000Z",
        } satisfies
          WorkspaceMembershipChangedPayloadV1;

        const outboxEvent:
          OutboxEvent = {
            id:
              "7d80fc1e-c97a-43b7-905a-dd7186b23d94",

            aggregateType:
              "workspace-membership",

            aggregateId:
              "f0762196-e58e-469d-a857-6d5df68ca022",

            eventType:
              "workspace.membership-changed",

            eventVersion:
              1,

            payload:
              producerPayload,

            requestId:
              "796ec39c-c13c-436c-bf91-dd830e32c6c2",

            occurredAt:
              new Date(
                "2026-09-29T10:10:00.000Z",
              ),

            publishAttempts:
              0,
          };

        const envelope =
          createEnvelope(
            outboxEvent,
          );

        expect(
          "aggregateType" in envelope,
        ).toBe(false);

        expect(
          "aggregateId" in envelope,
        ).toBe(false);

        expect(
          "publishAttempts" in envelope,
        ).toBe(false);
      },
    );
  },
);