export interface ChangeEmailRequest {
  readonly email: string;
  readonly currentPassword: string;
}

export interface ChangedEmailAccount {
  readonly id: string;
  readonly email: string;
  readonly updatedAt: string;
}

export interface ChangeEmailResponse {
  readonly data: {
    readonly user:
      ChangedEmailAccount;

    readonly reauthenticationRequired:
      true;
  };
}