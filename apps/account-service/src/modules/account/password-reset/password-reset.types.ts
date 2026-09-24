export interface PasswordResetUser {
  readonly id: string;
  readonly email: string;
}

export interface CreatePasswordResetData {
  readonly tokenId: string;
  readonly userId: string;
  readonly email: string;
  readonly tokenHash: string;
  readonly resetToken: string;
  readonly expiresAt: Date;
  readonly occurredAt: Date;
  readonly requestId: string;
  readonly eventId: string;
}

export interface CompletePasswordResetData {
  readonly tokenHash: string;
  readonly newPasswordHash: string;
  readonly occurredAt: Date;
  readonly requestId: string;
  readonly eventId: string;
}

export interface CompletePasswordResetResult {
  readonly completed: boolean;
}