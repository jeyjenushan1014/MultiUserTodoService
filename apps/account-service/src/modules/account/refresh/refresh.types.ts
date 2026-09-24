export interface RefreshCredentialRow {
  readonly token_id: string;
  readonly session_id: string;
  readonly family_id: string;
  readonly token_expires_at: Date;
  readonly used_at: Date | null;
  readonly user_id: string;
  readonly email: string;
  readonly session_expires_at: Date;
  readonly revoked_at: Date | null;
}

export interface RotateRefreshTokenData {
  readonly currentTokenHash:
    string;

  readonly nextTokenId:
    string;

  readonly nextTokenHash:
    string;

  readonly nextExpiresAt:
    Date;
}

export interface RotatedSession {
  readonly userId: string;
  readonly email: string;
  readonly sessionId: string;
}

export type RefreshRotationResult =
  | {
      readonly status: "rotated";
      readonly session:
        RotatedSession;
    }
  | {
      readonly status: "invalid";
    }
  | {
      readonly status: "reused";
      readonly sessionId: string;
      readonly userId: string;
    };