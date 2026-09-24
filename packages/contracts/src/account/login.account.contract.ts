export interface LoginAccountRequest {
  readonly email: string;
  readonly password: string;
}

export interface AuthenticatedAccount {
  readonly id: string;
  readonly email: string;
}

export interface LoginAccountResponse {
  readonly data: {
    readonly user:
      AuthenticatedAccount;

    readonly accessToken:
      string;

    readonly refreshToken:
      string;

    readonly accessTokenExpiresIn:
      number;

    readonly refreshTokenExpiresIn:
      number;
  };
}