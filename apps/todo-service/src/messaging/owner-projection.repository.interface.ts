export interface ApplyOwnerProjectionData {
  readonly eventId:
    string;

  readonly eventType:
    "account.registered";

  readonly userId:
    string;

  readonly email:
    string;

  readonly occurredAt:
    Date;

  readonly consumerName:
    string;
}

export type ApplyOwnerProjectionResult =
  | "applied"
  | "duplicate";

export interface OwnerProjectionRepository {
  applyAccountRegistered(
    data:
      ApplyOwnerProjectionData,
  ): Promise<
    ApplyOwnerProjectionResult
  >;
}