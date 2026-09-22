export interface PasswordResetRequest {
  readonly email: string;
}

export interface PasswordResetRequestedResponse {
  readonly message: string;
}

export interface ConfirmPasswordResetRequest {
  readonly token: string;
  readonly newPassword: string;
}

export interface AccountPasswordResetRequestedPayload {
  readonly userId: string;
  readonly email: string;
  readonly resetToken: string;
  readonly expiresAt: string;
}

export interface AccountPasswordResetCompletedPayload {
  readonly userId: string;
  readonly completedAt: string;
}