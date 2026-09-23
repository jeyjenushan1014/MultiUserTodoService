import type {
  ResolvedAccount,
} from "@todo/contracts"

export interface AccountLookupRepository {
  findByEmail(
    normalizedEmail:
      string,
  ): Promise<
    ResolvedAccount |
    undefined
  >;
}