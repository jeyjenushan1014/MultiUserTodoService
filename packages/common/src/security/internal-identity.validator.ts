import type {
  InternalIdentityEnvelope,
  InternalServiceAudience,
} from "@todo/contracts";

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value ===
      "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isInternalServiceAudience(
  value: unknown,
): value is InternalServiceAudience {
  return (
    value ===
      "account-service" ||
    value ===
      "todo-service"
  );
}

export function isInternalIdentityEnvelope(
  value: unknown,
): value is InternalIdentityEnvelope {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.issuer ===
      "gateway" &&

    isInternalServiceAudience(
      value.audience,
    ) &&

    typeof value.requestId ===
      "string" &&

    typeof value.issuedAt ===
      "number" &&

    Number.isInteger(
      value.issuedAt,
    ) &&

    value.issuedAt >= 0 &&

    typeof value.expiresAt ===
      "number" &&

    Number.isInteger(
      value.expiresAt,
    ) &&

    value.expiresAt >
      value.issuedAt &&

    typeof value.userId ===
      "string" &&

    typeof value.email ===
      "string" &&

    typeof value.sessionId ===
      "string"
  );
}