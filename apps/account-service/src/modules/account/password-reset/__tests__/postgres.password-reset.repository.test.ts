import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { PostgresPasswordResetRepository } from "../password-reset.repository.js";

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

    // invalidatePreviousTokens
    clientMocks.query.mockResolvedValueOnce({});

    // insertResetToken
    clientMocks.query.mockResolvedValueOnce({});

    // insertOutboxEvent
    clientMocks.query.mockResolvedValueOnce({});

    // COMMIT
    clientMocks.query.mockResolvedValueOnce({});

    const payload = {
      userId: "user-id",
      email: "user@example.com",
      resetToken: "reset-token",
      expiresAt: expiresAt.toISOString(),
    };

    await repo.createPasswordReset({
      tokenId: "token-id",
      eventId: "event-id",
      userId: "user-id",
      email: payload.email,
      resetToken: payload.resetToken,
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
    // payload parameter is the 6th parameter (index 5)
    expect(params[5]).toBe(JSON.stringify(payload));
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

