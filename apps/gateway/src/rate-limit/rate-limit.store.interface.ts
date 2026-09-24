import type {
  RateLimitConsumeCommand,
  RateLimitStoreResult,
} from "./rate-limit.types.js";

export interface RateLimitStore {
  consume(
    command:
      RateLimitConsumeCommand,
  ): Promise<
    RateLimitStoreResult |
    undefined
  >;
}