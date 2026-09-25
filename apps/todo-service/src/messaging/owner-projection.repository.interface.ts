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

export interface OwnerProjectionRebuildUser {
  readonly userId: string;
  readonly email: string;
  readonly accountCreatedAt: Date;
  readonly projectionOccurredAt: Date;
}

export interface OwnerProjectionRebuildResult {
  readonly upserted: number;
  readonly alreadyPresent: number;
}

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

  startRebuild(
    rebuildId: string,
  ): Promise<void>;

  applyRebuildBatch(
    rebuildId: string,
    users: readonly OwnerProjectionRebuildUser[],
  ): Promise<OwnerProjectionRebuildResult>;

  completeRebuild(
    rebuildId: string,
  ): Promise<number>;
}