export interface RateLimitPolicy {
  readonly scope:
    string;

  readonly maximumRequests:
    number;

  readonly windowSeconds:
    number;

  readonly failClosed?:
    boolean;
}

export interface RateLimitConsumeCommand {
  readonly key:
    string;

  readonly maximumRequests:
    number;

  readonly windowMilliseconds:
    number;
}

export interface RateLimitStoreResult {
  readonly currentCount:
    number;

  readonly remainingMilliseconds:
    number;
}

export interface RateLimitDecision {
  readonly allowed:
    boolean;

  readonly limit:
    number;

  readonly remaining:
    number;

  readonly resetAfterSeconds:
    number;
}