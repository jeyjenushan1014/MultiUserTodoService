import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { PostgresRefreshRepository } from "../refresh.repository.js";

const clientMocks = vi.hoisted(() => ({
  query: vi.fn(),
  release: vi.fn(),
}));

vi.mock("../../../../config/database.js", () => ({
  database: {
    connect: vi.fn(() => Promise.resolve(clientMocks)),
  },
}));

describe("PostgresRefreshRepository", () => {
  it("rotates a valid refresh token", async () => {
    const repo = new PostgresRefreshRepository();

    const now = new Date();
    const future = new Date(now.getTime() + 1000 * 60 * 60);

    const credentialRow = {
      token_id: "token-id",
      session_id: "session-id",
      family_id: "family-id",
      token_expires_at: future,
      used_at: null,
      user_id: "user-id",
      session_expires_at: future,
      revoked_at: null,
      email: "user@example.com",
    };

    // BEGIN
    clientMocks.query.mockResolvedValueOnce({});

    // SELECT returns credential
    clientMocks.query.mockResolvedValueOnce({ rows: [credentialRow] });

    // INSERT new token
    clientMocks.query.mockResolvedValueOnce({});

    // UPDATE mark used -> rowCount 1
    clientMocks.query.mockResolvedValueOnce({ rowCount: 1 });

    // UPDATE sessions
    clientMocks.query.mockResolvedValueOnce({});

    // COMMIT
    clientMocks.query.mockResolvedValueOnce({});

    const result = await repo.rotateRefreshToken({
      currentTokenHash: "hash",
      nextTokenHash: "next-hash",
      nextExpiresAt: future,
      nextTokenId: "next-id",
    });

    expect(result.status).toBe("rotated");
    if (result.status === "rotated") {
      expect(result.session.userId).toBe("user-id");
    }
  });

  it("returns reused when token was already used and revokes session", async () => {
    const repo = new PostgresRefreshRepository();

    const now = new Date();
    const future = new Date(now.getTime() + 1000 * 60 * 60);

    const credentialRow = {
      token_id: "token-id",
      session_id: "session-id",
      family_id: "family-id",
      token_expires_at: future,
      used_at: new Date(now.getTime() - 1000),
      user_id: "user-id",
      session_expires_at: future,
      revoked_at: null,
      email: "user@example.com",
    };

    // BEGIN
    clientMocks.query.mockResolvedValueOnce({});

    // SELECT returns credential with used_at set
    clientMocks.query.mockResolvedValueOnce({ rows: [credentialRow] });

    // UPDATE sessions revoke
    clientMocks.query.mockResolvedValueOnce({});

    // COMMIT
    clientMocks.query.mockResolvedValueOnce({});

    const result = await repo.rotateRefreshToken({
      currentTokenHash: "hash",
      nextTokenHash: "next-hash",
      nextExpiresAt: future,
      nextTokenId: "next-id",
    });

    expect(result.status).toBe("reused");
    if (result.status === "reused") {
      expect(result.sessionId).toBe("session-id");
      expect(result.userId).toBe("user-id");
    }

    const revokeQuery =
      clientMocks.query.mock.calls[2];

    expect(revokeQuery?.[0]).toContain(
      "WHERE user_id = $1",
    );
    expect(revokeQuery?.[0]).toContain(
      "AND revoked_at IS NULL",
    );
    expect(revokeQuery?.[1]).toEqual([
      "user-id",
    ]);
  });

  it("returns invalid when token is not found", async () => {
    const repo = new PostgresRefreshRepository();

    // BEGIN
    clientMocks.query.mockResolvedValueOnce({});

    // SELECT returns no rows
    clientMocks.query.mockResolvedValueOnce({ rows: [] });

    // COMMIT
    clientMocks.query.mockResolvedValueOnce({});

    const result = await repo.rotateRefreshToken({
      currentTokenHash: "hash",
      nextTokenHash: "next-hash",
      nextExpiresAt: new Date(),
      nextTokenId: "next-id",
    });

    expect(result.status).toBe("invalid");
  });
});



