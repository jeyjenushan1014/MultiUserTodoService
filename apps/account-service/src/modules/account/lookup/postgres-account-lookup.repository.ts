import type {
  QueryResult,
} from "pg";

import type {
  ResolvedAccount,
} from "@todo/contracts";

import {
  database,
} from "../../../config/database.js";

import type {
  AccountLookupRepository,
} from "./account-lookup.repository.interface.js";

interface AccountLookupRow {
  readonly id:
    string;

  readonly email:
    string;
}

function mapAccount(
  row:
    AccountLookupRow,
): ResolvedAccount {
  return {
    id:
      row.id,

    email:
      row.email,
  };
}

export class PostgresAccountLookupRepository
implements AccountLookupRepository {
  public async findByEmail(
    normalizedEmail:
      string,
  ): Promise<
    ResolvedAccount |
    undefined
  > {
    const result:
      QueryResult<
        AccountLookupRow
      > =
      await database.query<
        AccountLookupRow
      >(
        `
          SELECT
            id,
            email
          FROM users
          WHERE email = $1
          LIMIT 1
        `,
        [
          normalizedEmail,
        ],
      );

    const row =
      result.rows[0];

    return row === undefined
      ? undefined
      : mapAccount(
          row,
        );
  }
}