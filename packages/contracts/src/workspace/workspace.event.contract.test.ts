/*
It proves that the shared contract accepts:
  1:a current role for add/change operations;
  2:null for removal;
  3:the standard event envelope;
version 1.

It does not yet prove that Account Service publishes the correct payload. That producer proof is added later in this part.

*/


import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  WorkspaceMembershipChangedEventV1,
} from "./workspace.event.contract.js";

describe(
  "workspace.membership-changed version 1",
  () => {
    it(
      "represents an added or changed membership",
      () => {
        const event:
          WorkspaceMembershipChangedEventV1 = {
            eventId:
              "7d80fc1e-c97a-43b7-905a-dd7186b23d94",

            eventType:
              "workspace.membership-changed",

            eventVersion:
              1,

            producer:
              "account-service",

            requestId:
              "796ec39c-c13c-436c-bf91-dd830e32c6c2",

            occurredAt:
              "2026-09-29T10:00:00.000Z",

            payload: {
              workspaceId:
                "f0762196-e58e-469d-a857-6d5df68ca022",

              userId:
                "60fd290e-7fd0-468b-858c-40a53e78fe36",

              role:
                "editor",

              changedAt:
                "2026-09-29T10:00:00.000Z",
            },
          };

        expect(
          event.eventVersion,
        ).toBe(1);

        expect(
          event.payload.role,
        ).toBe("editor");
      },
    );

    it(
      "represents removal with a null role",
      () => {
        const event:
          WorkspaceMembershipChangedEventV1 = {
            eventId:
              "23ab4fa4-7f77-4a90-93dd-bddbd0c2be1e",

            eventType:
              "workspace.membership-changed",

            eventVersion:
              1,

            producer:
              "account-service",

            requestId:
              "67e258d9-35c8-4e9c-a84e-b7679d104fa7",

            occurredAt:
              "2026-09-29T10:05:00.000Z",

            payload: {
              workspaceId:
                "f0762196-e58e-469d-a857-6d5df68ca022",

              userId:
                "60fd290e-7fd0-468b-858c-40a53e78fe36",

              role:
                null,

              changedAt:
                "2026-09-29T10:05:00.000Z",
            },
          };

        expect(
          event.payload.role,
        ).toBeNull();
      },
    );
  },
);