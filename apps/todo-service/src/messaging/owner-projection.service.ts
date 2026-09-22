import {
  logger,
} from "../config/logger.js";

import type {
  AccountRegisteredEvent,
} from "./account-event.schema.js";

import type {
  ApplyOwnerProjectionResult,
  OwnerProjectionRepository,
} from "./owner-projection.repository.interface.js";

const CONSUMER_NAME =
  "todo-owner-projection";

export class OwnerProjectionService {
  public constructor(
    private readonly repository:
      OwnerProjectionRepository,
  ) {}

  public async handleAccountRegistered(
    event: AccountRegisteredEvent,
  ): Promise<ApplyOwnerProjectionResult> {
    const result =
      await this.repository
        .applyAccountRegistered({
          eventId:
            event.eventId,

          eventType:
            event.eventType,

          userId:
            event.payload.userId,

          occurredAt:
            new Date(
              event.occurredAt,
            ),

          consumerName:
            CONSUMER_NAME,
        });

    logger.info(
      {
        eventId:
          event.eventId,

        eventType:
          event.eventType,

        ownerId:
          event.payload.userId,

        projectionResult:
          result,

        requestId:
          event.requestId,
      },
      result === "applied"
        ? "TODO owner projection applied"
        : "Duplicate account event ignored",
    );

    return result;
  }
}