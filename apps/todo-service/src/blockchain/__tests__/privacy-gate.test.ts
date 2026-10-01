import { describe, expect, it } from "vitest";
import {
  PrivacyGate,
  PrivacyGateViolationError,
} from "../privacy-gate.js";

describe("PrivacyGate (BC-2)", () => {
  const validPayload = {
    sourceEventId: "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d",
    taskId: "11111111-1111-4111-8111-111111111111",
    workspaceId: "22222222-2222-4222-8222-222222222222",
    action: "created",
  };

  it("passes valid opaque identifiers and action", () => {
    expect(() => {
      PrivacyGate.assertPrivacySafe(validPayload);
    }).not.toThrow();
  });

  it("rejects payload containing task title or description", () => {
    expect(() => {
      PrivacyGate.assertPrivacySafe({
        ...validPayload,
        title: "Confidential Project Plan",
      });
    }).toThrow(PrivacyGateViolationError);

    expect(() => {
      PrivacyGate.assertPrivacySafe({
        ...validPayload,
        description: "Task description with personal notes",
      });
    }).toThrow(PrivacyGateViolationError);
  });

  it("rejects payload containing email address", () => {
    expect(() => {
      PrivacyGate.assertPrivacySafe({
        ...validPayload,
        email: "alice@example.com",
      });
    }).toThrow(PrivacyGateViolationError);

    expect(() => {
      PrivacyGate.assertPrivacySafe({
        ...validPayload,
        taskId: "alice@example.com",
      });
    }).toThrow(PrivacyGateViolationError);
  });

  it("rejects payload containing user or owner identifiers", () => {
    expect(() => {
      PrivacyGate.assertPrivacySafe({
        ...validPayload,
        ownerId: "33333333-3333-4333-8333-333333333333",
      });
    }).toThrow(PrivacyGateViolationError);

    expect(() => {
      PrivacyGate.assertPrivacySafe({
        ...validPayload,
        userId: "44444444-4444-4444-8444-444444444444",
      });
    }).toThrow(PrivacyGateViolationError);

    expect(() => {
      PrivacyGate.assertPrivacySafe({
        ...validPayload,
        completedByUserId: "55555555-5555-4555-8555-555555555555",
      });
    }).toThrow(PrivacyGateViolationError);
  });

  it("rejects malformed non-UUID identifiers", () => {
    expect(() => {
      PrivacyGate.assertPrivacySafe({
        ...validPayload,
        taskId: "plain-string-not-uuid",
      });
    }).toThrow(PrivacyGateViolationError);

    expect(() => {
      PrivacyGate.assertPrivacySafe({
        ...validPayload,
        workspaceId: "0x123456",
      });
    }).toThrow(PrivacyGateViolationError);
  });

  it("rejects invalid actions", () => {
    expect(() => {
      PrivacyGate.assertPrivacySafe({
        ...validPayload,
        action: "archived",
      });
    }).toThrow(PrivacyGateViolationError);
  });

  it("rejects nested objects or secret payloads", () => {
    expect(() => {
      PrivacyGate.assertPrivacySafe({
        ...validPayload,
        metadata: { secret: "123" },
      });
    }).toThrow(PrivacyGateViolationError);
  });
});
