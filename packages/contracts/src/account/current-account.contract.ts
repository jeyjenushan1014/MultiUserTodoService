export interface CurrentAccount {
  readonly id: string;
  readonly email: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CurrentAccountResponse {
  readonly data: {
    readonly user:
      CurrentAccount;
  };
}