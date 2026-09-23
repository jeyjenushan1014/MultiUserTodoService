import type {
  RateLimitStore,
} from "./rate-limit.store.interface.js";

import type {
  RateLimitDecision,
  RateLimitPolicy,
} from "./rate-limit.types.js";

export class RateLimitService {
  public constructor(
    private readonly store:
      RateLimitStore,
  ) {}

  public async consume(
    key:
      string,
    policy:
      RateLimitPolicy,
  ): Promise<
    RateLimitDecision |
    undefined
  > {
    const result =
      await this.store.consume({
        key,

        maximumRequests:
          policy.maximumRequests,

        windowMilliseconds:
          policy.windowSeconds *
          1_000,
      });

    if (
      result === undefined
    ) {
      /*
       * Fail open when Redis is unavailable.
       *
       * Redis failure must not take down Account or
       * TODO business functionality.
       */
      return undefined;
    }

    const remaining =
      Math.max(
        policy.maximumRequests -
          result.currentCount,
        0,
      );

    const resetAfterSeconds =
      Math.max(
        Math.ceil(
          result
            .remainingMilliseconds /
            1_000,
        ),
        1,
      );

    return {
      allowed:
        result.currentCount <=
        policy.maximumRequests,

      limit:
        policy.maximumRequests,

      remaining,

      resetAfterSeconds,
    };
  }
}