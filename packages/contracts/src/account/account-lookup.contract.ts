export interface ResolveAccountRequest {
  readonly email:
    string;
}

export interface ResolvedAccount {
  readonly id:
    string;

  readonly email:
    string;
}

export interface ResolveAccountResponse {
  readonly data: {
    readonly account:
      ResolvedAccount;
  };
}