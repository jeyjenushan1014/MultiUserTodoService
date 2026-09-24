import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  MockedFunction,
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

interface TestDependencies {
  readonly applyAccountRegisteredMock:
    MockedFunction<
      OwnerProjectionRepository[
        "applyAccountRegistered"
      ]
    >;

  readonly service:
    OwnerProjectionService;
}

function createDependencies():
  TestDependencies {
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
      "39eb964c-991a-47bc-a012-e9db6eb86c10",

    eventType:
      "account.registered",

    eventVersion:
      1,

    producer:
      "account-service",

    requestId:
      "70668eae-dac5-4b75-9bd3-02c963eb5b99",

    occurredAt:
      "2026-09-24T04:00:00.000Z",

    payload: {
      userId:
        "9f134ed0-4503-4a23-a189-f065fe9fd838",

      email:
        "owner@example.com",
    },
  };
}

describe(
  "OwnerProjectionService",
  () => {
    it(
      "applies an account registered event",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .applyAccountRegisteredMock
          .mockResolvedValueOnce(
            "applied",
          );

        const event =
          createEvent();

        const result =
          await dependencies
            .service
            .handleAccountRegistered(
              event,
            );

        expect(result).toBe(
          "applied",
        );

        expect(
          dependencies
            .applyAccountRegisteredMock,
        ).toHaveBeenCalledTimes(1);

        expect(
          dependencies
            .applyAccountRegisteredMock,
        ).toHaveBeenCalledWith({
          eventId:
            event.eventId,

          eventType:
            event.eventType,

          userId:
            event.payload.userId,

          email:
            event.payload.email,

          occurredAt:
            new Date(
              event.occurredAt,
            ),

          consumerName:
            "todo-owner-projection",
        });
      },
    );

    it(
      "returns duplicate when the event was already processed",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .applyAccountRegisteredMock
          .mockResolvedValueOnce(
            "duplicate",
          );

        const result =
          await dependencies
            .service
            .handleAccountRegistered(
              createEvent(),
            );

        expect(result).toBe(
          "duplicate",
        );

        expect(
          dependencies
            .applyAccountRegisteredMock,
        ).toHaveBeenCalledTimes(1);
      },
    );

    it(
      "propagates repository errors",
      async () => {
        const dependencies =
          createDependencies();

        dependencies
          .applyAccountRegisteredMock
          .mockRejectedValueOnce(
            new Error(
              "Database unavailable",
            ),
          );

        await expect(
          dependencies
            .service
            .handleAccountRegistered(
              createEvent(),
            ),
        ).rejects.toThrow(
          "Database unavailable",
        );
      },
    );
  },
);