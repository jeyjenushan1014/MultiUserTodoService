export interface EmailChangeCredentialRow {
  readonly id: string;
  readonly email: string;
  readonly password_hash: string;
}

export interface ChangeEmailData {
  readonly userId: string;
  readonly email: string;
  readonly eventId: string;
  readonly requestId: string;
  readonly occurredAt: Date;
}

export interface ChangedEmailRow {
  readonly id: string;
  readonly email: string;
  readonly updated_at: Date;
}