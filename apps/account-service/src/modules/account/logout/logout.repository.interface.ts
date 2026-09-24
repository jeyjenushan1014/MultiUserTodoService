export interface LogoutRepository {
  revokeSession(
    userId: string,
    sessionId: string,
  ): Promise<boolean>;

  revokeAllSessions(
    userId: string,
  ): Promise<number>;
}