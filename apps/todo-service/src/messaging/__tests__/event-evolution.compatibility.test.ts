import { describe, expect, it } from "vitest";
import { createAccountRegisteredEventV2 } from "../../../../account-service/src/modules/account/registration/account-registered.event.js";
import {
  accountRegisteredEventSchema,
  accountEmailChangedEventSchema,
} from "../account-event.schema.js";

describe("Account event compatibility (EV-3, EV-4, EV-5, EV-6)", () => {
  const base = {
    eventId: "5403d006-532f-4d5f-8200-9893fe84e00d",
    eventType: "account.registered",
    occurredAt: "2026-10-01T10:00:00.000Z",
    requestId: "67dd883e-0ca4-4101-9a11-5bf22dbfcaf0",
    producer: "account-service",
    payload: {
      userId: "3bf53c86-0932-43d0-85ed-bd536c694677",
      email: "user@example.com",
    },
  };

  it("accepts v1 and v2 registration messages concurrently during a rolling deployment (EV-3)", () => {
    const historicalV1 = {
      ...base,
      eventVersion: 1,
    };
    const currentV2 = createAccountRegisteredEventV2({
      eventId: base.eventId,
      userId: base.payload.userId,
      email: base.payload.email,
      occurredAt: base.occurredAt,
      requestId: base.requestId,
    });

    expect(accountRegisteredEventSchema.parse(historicalV1).eventVersion).toBe(1);
    expect(accountRegisteredEventSchema.parse(currentV2).eventVersion).toBe(2);
  });

  it("processes interleaved v1 and v2 producer messages through the same consumer boundary (EV-8 protocol proof)", () => {
    const messages: unknown[] = [
      { ...base, eventVersion: 1 },
      createAccountRegisteredEventV2({
        eventId: "af5b7687-8c0e-4809-a8a1-513cd53d9419",
        userId: base.payload.userId,
        email: base.payload.email,
        occurredAt: base.occurredAt,
        requestId: base.requestId,
      }),
      { ...base, eventVersion: 1, eventId: "a5e0ef0c-11ce-401a-8426-c4e2cfa74e6e" },
    ];

    const accepted = messages.map((message) =>
      accountRegisteredEventSchema.parse(message),
    );

    expect(accepted.map((event) => event.eventVersion)).toEqual([1, 2, 1]);
    expect(accepted.map((event) => event.payload.userId)).toEqual([
      base.payload.userId,
      base.payload.userId,
      base.payload.userId,
    ]);
  });

  it("ignores unknown additive envelope and payload fields without changing known values (EV-4)", () => {
    const event = {
      ...base,
      eventVersion: 1,
      traceContext: { traceId: "trace-1" },
      payload: {
        ...base.payload,
        displayPreference: "compact",
      },
    };

    const parsed = accountRegisteredEventSchema.parse(event);
    expect(parsed.payload).toEqual(base.payload);
    expect("traceContext" in parsed).toBe(false);
    expect("displayPreference" in parsed.payload).toBe(false);
  });

  it("preserves v1 field meanings in v2 and adds registrationMethod without redefining existing fields (EV-5)", () => {
    const produced = createAccountRegisteredEventV2({
      eventId: base.eventId,
      userId: base.payload.userId,
      email: base.payload.email,
      occurredAt: base.occurredAt,
      requestId: base.requestId,
    });
    const parsed = accountRegisteredEventSchema.parse(produced);

    expect(parsed.payload.userId).toBe(base.payload.userId);
    expect(parsed.payload.email).toBe(base.payload.email);
    expect(parsed.payload.registrationMethod).toBe("password");
  });

  it("validates actual producer output with the independently maintained consumer schema (EV-6)", () => {
    const produced = createAccountRegisteredEventV2({
      eventId: base.eventId,
      userId: base.payload.userId,
      email: base.payload.email,
      occurredAt: base.occurredAt,
      requestId: base.requestId,
    });
    const consumerAccepted = accountRegisteredEventSchema.safeParse(produced);

    expect(consumerAccepted.success).toBe(true);
    if (!consumerAccepted.success) return;
    expect(consumerAccepted.data).toMatchObject({
      eventType: "account.registered",
      eventVersion: 2,
      payload: {
        userId: base.payload.userId,
        email: base.payload.email,
        registrationMethod: "password",
      },
    });
  });

  it("continues to accept account.email-changed v1 while ignoring additive fields", () => {
    const parsed = accountEmailChangedEventSchema.parse({
      ...base,
      eventType: "account.email-changed",
      eventVersion: 1,
      payload: {
        userId: base.payload.userId,
        email: "new@example.com",
        auditLabel: "future-field",
      },
    });

    expect(parsed.payload).toEqual({
      userId: base.payload.userId,
      email: "new@example.com",
    });
  });
});
