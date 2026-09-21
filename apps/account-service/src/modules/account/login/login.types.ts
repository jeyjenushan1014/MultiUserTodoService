export interface LoginUserRow {
  readonly id: string;
  readonly email: string;
  readonly password_hash: string;
}

export interface CreateSessionData {
  readonly sessionId: string;
  readonly familyId: string;
  readonly refreshTokenId: string;
  readonly userId: string;
  readonly refreshTokenHash: string;
  readonly sessionExpiresAt: Date;
  readonly refreshTokenExpiresAt:
    Date;
}