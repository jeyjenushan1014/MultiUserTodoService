import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { PostgresPasswordResetRepository } from "../password-reset.repository.js";

import {
  decryptPasswordResetToken,
} from "../password-reset-token.crypto.js";

const clientMocks = vi.hoisted(() => ({
  query: vi.fn(),
  release: vi.fn(),
}));

vi.mock("../../../../config/database.js", () => ({
  database: {
    connect: vi.fn(() => Promise.resolve(clientMocks)),
    query: clientMocks.query,
  },
}));

describe("PostgresPasswordResetRepository", () => {
  it("creates a password reset and inserts an outbox event with current email", async () => {
    const repo = new PostgresPasswordResetRepository();

    const occurredAt = new Date();
    const expiresAt = new Date(occurredAt.getTime() + 15 * 60 * 1000);

    // BEGIN
    clientMocks.query.mockResolvedValueOnce({});

    // lock eligible account
    clientMocks.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "user-id" }] });

    // invalidatePreviousTokens
    clientMocks.query.mockResolvedValueOnce({});

    // insertResetToken
    clientMocks.query.mockResolvedValueOnce({});

    // insertOutboxEvent
    clientMocks.query.mockResolvedValueOnce({});

    // COMMIT
    clientMocks.query.mockResolvedValueOnce({});

    const resetToken = "reset-token";

    await repo.createPasswordReset({
      tokenId: "token-id",
      eventId: "event-id",
      userId: "user-id",
      email: "user@example.com",
      resetToken,
      tokenHash: "hash",
      occurredAt,
      expiresAt,
      requestId: "request-id",
    });

    // Find the outbox INSERT call
    const calls = clientMocks.query.mock.calls;
    const outboxCall = calls.find((c) => typeof c[0] === "string" && c[0].includes("INSERT INTO outbox_events"));

    expect(outboxCall).toBeDefined();

    const params = outboxCall?.[1] as unknown[];
    const payload = JSON.parse(
      params[5] as string,
    ) as {
      userId: string;
      email: string;
      encryptedResetToken: string;
      expiresAt: string;
    };

    expect(payload.userId).toBe("user-id");
    expect(payload.email).toBe("user@example.com");
    expect(payload.expiresAt).toBe(
      expiresAt.toISOString(),
    );
    expect(
      decryptPasswordResetToken(
        payload.encryptedResetToken,
      ),
    ).toBe(resetToken);
    expect(
      params[5],
    ).not.toContain(resetToken);
  });

  it("does not create a reset token for an account pending deletion", async () => {
    const repo = new PostgresPasswordResetRepository();
    clientMocks.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({});

    const created = await repo.createPasswordReset({
      tokenId: "token-id",
      eventId: "event-id",
      userId: "user-id",
      email: "user@example.com",
      resetToken: "reset-token",
      tokenHash: "hash",
      occurredAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      requestId: "request-id",
    });

    expect(created).toBe(false);
    expect(clientMocks.query).toHaveBeenCalledTimes(3);
    expect(clientMocks.query.mock.calls[1]?.[0]).toContain("account_deletion_requests");
    expect(clientMocks.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
  });

  it("completes password reset, consumes tokens and revokes sessions", async () => {
    const repo = new PostgresPasswordResetRepository();

    const occurredAt = new Date();

    // BEGIN
    clientMocks.query.mockResolvedValueOnce({});

    // lockValidResetToken -> return a token row
    clientMocks.query.mockResolvedValueOnce({ rows: [{ token_id: "token-id", user_id: "user-id" }] });

    // updatePassword
    clientMocks.query.mockResolvedValueOnce({});

    // consumeResetTokens
    clientMocks.query.mockResolvedValueOnce({});

    // revokeUserSessions
    clientMocks.query.mockResolvedValueOnce({});

    // insertPasswordResetCompletedEvent
    clientMocks.query.mockResolvedValueOnce({});

    // COMMIT
    clientMocks.query.mockResolvedValueOnce({});

    const result = await repo.completePasswordReset({
      tokenHash: "hash",
      newPasswordHash: "new-hash",
      occurredAt,
      requestId: "request-id",
      eventId: "event-id",
    });

    expect(result.completed).toBe(true);
  });
});

