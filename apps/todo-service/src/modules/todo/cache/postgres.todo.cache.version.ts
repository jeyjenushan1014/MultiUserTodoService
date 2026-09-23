import {
  database,
} from "../../../config/database.js";

interface TodoOwnerCacheVersionRow {
  readonly cache_version:
    string;
}

function parseCacheVersion(
  value: string,
): string {
  if (
    !/^\d+$/.test(
      value,
    )
  ) {
    throw new Error(
      "PostgreSQL returned an invalid TODO cache version",
    );
  }

  return value;
}

export async function getDurableTodoCacheVersion(
  ownerId: string,
): Promise<
  string | undefined
> {
  const result =
    await database.query<
      TodoOwnerCacheVersionRow
    >(
      `
        SELECT
          cache_version::text
            AS cache_version
        FROM todo_owners
        WHERE id = $1
          AND deactivated_at
            IS NULL
        LIMIT 1
      `,
      [
        ownerId,
      ],
    );

  const row =
    result.rows[0];

  if (row === undefined) {
    return undefined;
  }

  return parseCacheVersion(
    row.cache_version,
  );
}