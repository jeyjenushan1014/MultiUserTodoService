import { describe, expect, it, vi } from "vitest";
import type { Channel } from "amqplib";

import { messageContainsAccountIdentifier, purgeQueueMessages } from "../account-deletion.broker.js";

describe("messageContainsAccountIdentifier", () => {
  it("matches account IDs and email addresses without case sensitivity", () => {
    expect(
      messageContainsAccountIdentifier(
        Buffer.from('{"payload":{"userId":"account-id"}}'),
        "account-id",
        "user@example.com",
      ),
    ).toBe(true);
    expect(
      messageContainsAccountIdentifier(
        Buffer.from('{"payload":{"email":"USER@EXAMPLE.COM"}}'),
        "account-id",
        "user@example.com",
      ),
    ).toBe(true);
    expect(
      messageContainsAccountIdentifier(
        Buffer.from('{"payload":{"userId":"another-account"}}'),
        "account-id",
        "user@example.com",
      ),
    ).toBe(false);
  });

  it("acks matching messages and requeues unrelated messages", async () => {
    const properties = {};
    const unrelated = {
      content: Buffer.from('{"payload":{"userId":"other-id"}}'),
      fields: { exchange: "events", routingKey: "todo.updated" },
      properties,
    };
    const matching = {
      content: Buffer.from('{"payload":{"email":"user@example.com"}}'),
      fields: { exchange: "events", routingKey: "todo.shared" },
      properties,
    };
    const channelMocks = {
      checkQueue: vi.fn().mockResolvedValue({ messageCount: 2 }),
      get: vi.fn().mockResolvedValueOnce(unrelated).mockResolvedValueOnce(matching),
      publish: vi.fn().mockReturnValue(true),
      waitForConfirms: vi.fn().mockResolvedValue(undefined),
      ack: vi.fn(),
      nack: vi.fn(),
    };

    await purgeQueueMessages(channelMocks as unknown as Channel, "events.dlq", "account-id", "user@example.com");

    expect(channelMocks.checkQueue).toHaveBeenCalledWith("events.dlq");
    expect(channelMocks.publish).toHaveBeenCalledWith("events", "todo.updated", unrelated.content, properties);
    expect(channelMocks.waitForConfirms).toHaveBeenCalledOnce();
    expect(channelMocks.ack).toHaveBeenCalledWith(unrelated);
    expect(channelMocks.ack).toHaveBeenCalledWith(matching);
    expect(channelMocks.nack).not.toHaveBeenCalled();
  });
});