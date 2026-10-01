import type {
  AccountRegisteredEventV2,
} from "@todo/contracts";

export interface AccountRegisteredEventInput {
  readonly eventId: string;
  readonly userId: string;
  readonly email: string;
  readonly occurredAt: string;
  readonly requestId: string;
}

export function createAccountRegisteredEventV2(
  input: AccountRegisteredEventInput,
): AccountRegisteredEventV2 {
  return {
    eventId: input.eventId,
    eventType: "account.registered",
    eventVersion: 2,
    occurredAt: input.occurredAt,
    requestId: input.requestId,
    producer: "account-service",
    payload: {
      userId: input.userId,
      email: input.email,
      registrationMethod: "password",
    },
  };
}
