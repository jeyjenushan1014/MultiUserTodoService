export interface UserDatabaseRow {
  readonly id: string;
  readonly email: string;
  readonly password_hash: string;
  readonly created_at: Date;
  readonly updated_at: Date;
}

export interface CreateAccountData {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly createdAt: Date;
  readonly requestId: string;
  readonly eventId: string;
}