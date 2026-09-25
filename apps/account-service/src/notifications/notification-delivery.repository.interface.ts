export type NotificationDeliveryClaim =
  | "claimed"
  | "completed"
  | "in-progress";

export interface NotificationDeliveryRepository {
  claim(
    eventId: string,
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
  ): Promise<void>;
}