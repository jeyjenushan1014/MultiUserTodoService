const BASE_RETRY_DELAY_MS =
  1_000;

const MAX_RETRY_DELAY_MS =
  60_000;

export function calculateTodoOutboxRetryDelayMilliseconds(
  publishAttempts: number,
): number {
  /*
   * publishAttempts is incremented when the event
   * is claimed. Therefore, attempt 1 waits one
   * second before retrying.
   */
  const normalizedAttempt =
    Math.max(
      1,
      Math.floor(
        publishAttempts,
      ),
    );

  /*
   * Limiting the exponent prevents an unnecessarily
   * large intermediate number.
   */
  const exponent =
    Math.min(
      normalizedAttempt - 1,
      30,
    );

  return Math.min(
    BASE_RETRY_DELAY_MS *
      2 ** exponent,

    MAX_RETRY_DELAY_MS,
  );
}

export function createTodoOutboxNextAttemptAt(
  publishAttempts: number,
  currentTime:
    Date = new Date(),
): Date {
  const delayMilliseconds =
    calculateTodoOutboxRetryDelayMilliseconds(
      publishAttempts,
    );

  return new Date(
    currentTime.getTime() +
      delayMilliseconds,
  );
}