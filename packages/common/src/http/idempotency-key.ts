export const IDEMPOTENCY_KEY_HEADER =
  "idempotency-key";

export const MINIMUM_IDEMPOTENCY_KEY_LENGTH =
  8;

export const MAXIMUM_IDEMPOTENCY_KEY_LENGTH =
  128;

const IDEMPOTENCY_KEY_PATTERN =
  /^[A-Za-z0-9._:-]+$/u;

export function normalizeIdempotencyKey(
  value:
    string | undefined,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized =
    value.trim();

  if (
    normalized.length <
      MINIMUM_IDEMPOTENCY_KEY_LENGTH ||
    normalized.length >
      MAXIMUM_IDEMPOTENCY_KEY_LENGTH ||
    !IDEMPOTENCY_KEY_PATTERN.test(
      normalized,
    )
  ) {
    return undefined;
  }

  return normalized;
}