export type NotificationDeliveryClaim =
  | "claimed"
  | "completed"
  | "in-progress"
  | "retry-pending"
  | "dead-letter-pending"
  | "stale";

export interface NotificationRecipientSession {
  findEmail(accountId: string): Promise<string | undefined>;
  reserveAddress(eventId: string, accountId: string, email: string): Promise<boolean>;
}

export interface NotificationDeliveryRepository {
  withRecipientGuard<T>(
    accountId: string,
    action: (session: NotificationRecipientSession) => Promise<T>,
  ): Promise<T>;

  claim(
    eventId: string,
    attempt?: number,
  ): Promise<{
    readonly status: NotificationDeliveryClaim;
    readonly processingToken?: string;
  }>;

  markSent(
    eventId: string,
    processingToken: string,
  ): Promise<void>;

  markFailed(
    eventId: string,
    processingToken: string,
    errorMessage: string,
    terminal?: boolean,
  ): Promise<void>;

  markDeadLetter(eventId: string): Promise<void>;
}