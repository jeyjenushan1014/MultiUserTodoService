export interface RefreshSessionRequest {
  readonly refreshToken: string;
}

export interface RefreshSessionResponse {
  readonly data: {
    readonly accessToken: string;
    readonly refreshToken: string;

    readonly accessTokenExpiresIn:
      number;

    readonly refreshTokenExpiresIn:
      number;
  };
}