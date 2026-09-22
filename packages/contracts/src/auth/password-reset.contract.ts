export interface PasswordResetRequest {
  readonly email: string;
}

export interface PasswordResetRequestedResponse {
  readonly message: string;
}

export interface AccountPasswordResetRequestedPayload {
  readonly userId: string;
  readonly email: string;
  readonly resetToken: string;
  readonly expiresAt: string;
}