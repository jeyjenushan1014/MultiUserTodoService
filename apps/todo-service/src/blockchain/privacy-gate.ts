export class PrivacyGateViolationError extends Error {
  constructor(message: string) {
    super(`PrivacyGateViolation: ${message}`);
    this.name = "PrivacyGateViolationError";
  }
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FORBIDDEN_KEYS = new Set([
  "title",
  "description",
  "email",
  "user_id",
  "userid",
  "owner_id",
  "ownerid",
  "username",
  "name",
  "password",
  "token",
  "completedbyuserid",
  "deletedbyuserid",
]);

/**
 * BC-2 Privacy Gate:
 * Enforces that no personal identifiers, titles, descriptions, emails,
 * account IDs, or hashes of personal data can reach the blockchain.
 */
export const PrivacyGate = {
  /**
   * Asserts that a chain submission input contains ONLY safe opaque identifiers
   * and contains no forbidden personal metadata.
   */
  assertPrivacySafe(input: Record<string, unknown>): void {
    const keys = Object.keys(input);
    const allowedKeys = new Set(["sourceEventId", "taskId", "workspaceId", "action"]);

    for (const key of keys) {
      if (!allowedKeys.has(key)) {
        throw new PrivacyGateViolationError(
          `Unexpected property '${key}' in chain submission payload. Only minimal opaque identifiers are permitted.`,
        );
      }
      if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
        throw new PrivacyGateViolationError(
          `Personal property '${key}' is strictly forbidden on-chain.`,
        );
      }
    }

    // Deep inspect values to ensure no nested objects or leaky strings
    for (const [key, value] of Object.entries(input)) {
      if (typeof value === "string") {
        if (value.includes("@")) {
          throw new PrivacyGateViolationError(
            `Field '${key}' contains an email address, which is forbidden on-chain.`,
          );
        }
      } else if (typeof value === "object" && value !== null) {
        throw new PrivacyGateViolationError(
          `Nested object in field '${key}' is forbidden on-chain.`,
        );
      }
    }

    // Verify taskId and workspaceId are valid RFC4122 opaque UUIDs
    const taskId = input.taskId;
    if (typeof taskId !== "string" || !UUID_REGEX.test(taskId)) {
      throw new PrivacyGateViolationError(
        "taskId must be an opaque RFC4122 UUID",
      );
    }

    const workspaceId = input.workspaceId;
    if (typeof workspaceId !== "string" || !UUID_REGEX.test(workspaceId)) {
      throw new PrivacyGateViolationError(
        "workspaceId must be an opaque RFC4122 UUID",
      );
    }

    // Ensure action is valid
    const action = input.action;
    if (action !== "created" && action !== "updated" && action !== "deleted") {
      throw new PrivacyGateViolationError(
        "action must be one of 'created', 'updated', 'deleted'",
      );
    }
  },
};
