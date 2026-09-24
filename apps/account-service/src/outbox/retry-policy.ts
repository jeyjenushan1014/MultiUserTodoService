const BASE_RETRY_DELAY_SECONDS = 2;

export function calculateRetryDelaySeconds(
  completedAttempts: number,
  maximumDelaySeconds: number,
): number {
  const safeAttempts =
    Math.max(
      0,
      completedAttempts,
    );

  const exponentialDelay =
    BASE_RETRY_DELAY_SECONDS *
    2 ** Math.min(
      safeAttempts,
      10,
    );

  return Math.min(
    exponentialDelay,
    maximumDelaySeconds,
  );
}

export function calculateNextAttemptAt(
  now: Date,
  completedAttempts: number,
  maximumDelaySeconds: number,
): Date {
  const delaySeconds =
    calculateRetryDelaySeconds(
      completedAttempts,
      maximumDelaySeconds,
    );

  return new Date(
    now.getTime() +
    delaySeconds * 1000,
  );
}