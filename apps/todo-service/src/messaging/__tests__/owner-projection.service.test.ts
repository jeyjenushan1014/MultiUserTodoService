import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  AccountRegisteredEvent,
} from "../account-event.schema.js";

import type {
  OwnerProjectionRepository,
} from "../owner-projection.repository.interface.js";

import {
  OwnerProjectionService,
} from "../owner-projection.service.js";

interface Dependencies {
  readonly applyAccountRegisteredMock:
    ReturnType<
      typeof vi.fn<
        OwnerProjectionRepository[
          "applyAccountRegistered"
        ]
      >
    >;

  readonly service:
    OwnerProjectionService;
}

function createDependencies():
Dependencies {
  const applyAccountRegisteredMock =
    vi.fn<
      OwnerProjectionRepository[
        "applyAccountRegistered"
      ]
    >();

  const repository:
    OwnerProjectionRepository = {
      applyAccountRegistered:
        applyAccountRegisteredMock,
  };

  return {
    applyAccountRegisteredMock,

    service:
      new OwnerProjectionService(
        repository,
      ),
  };
}

function createEvent():
AccountRegisteredEvent {
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
    },
  };
}

describe(
  "OwnerProjectionService",
  () => {
    it(
      "applies a new owner projection",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .applyAccountRegisteredMock
          .mockResolvedValue(
            "applied",
          );

        await expect(
          dependencies
            .service
            .handleAccountRegistered(
              createEvent(),
            ),
        ).resolves.toBe(
          "applied",
        );

        expect(
          dependencies
            .applyAccountRegisteredMock,
        ).toHaveBeenCalledWith({
          eventId:
            "5403d006-532f-4d5f-8200-9893fe84e00d",

          eventType:
            "account.registered",

          userId:
            "3bf53c86-0932-43d0-85ed-bd536c694677",

          occurredAt:
            new Date(
              "2026-09-22T10:00:00.000Z",
            ),

          consumerName:
            "todo-owner-projection",
        });
      },
    );

    it(
      "returns duplicate for an already processed event",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .applyAccountRegisteredMock
          .mockResolvedValue(
            "duplicate",
          );

        await expect(
          dependencies
            .service
            .handleAccountRegistered(
              createEvent(),
            ),
        ).resolves.toBe(
          "duplicate",
        );
      },
    );

    it(
      "propagates database failures for retry",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .applyAccountRegisteredMock
          .mockRejectedValue(
            new Error(
              "database unavailable",
            ),
          );

        await expect(
          dependencies
            .service
            .handleAccountRegistered(
              createEvent(),
            ),
        ).rejects.toThrow(
          "database unavailable",
        );
      },
    );
  },
);