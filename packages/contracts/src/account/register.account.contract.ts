export interface RegisterAccountRequest {
  readonly email: string;
  readonly password: string;
}

export interface RegisteredAccount {
  readonly id: string;
  readonly email: string;
  readonly createdAt: string;
}

export interface RegisterAccountResponse {
  readonly data: {
    readonly user: RegisteredAccount;
  };
}