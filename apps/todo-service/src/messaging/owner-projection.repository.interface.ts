export interface ApplyOwnerProjectionData {
  readonly eventId:
    string;

  readonly eventType:
    | "account.registered"
    | "account.email-changed";

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

  applyAccountEmailChanged(
    data:
      ApplyOwnerProjectionData,
  ): Promise<
    ApplyOwnerProjectionResult
  >;
}