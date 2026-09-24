import type {
  QueryResult,
} from "pg";

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

interface CacheVersionRow {
  readonly cache_version:
    string;
}

type DatabaseQuery = (
  text: string,
  values?:
    readonly unknown[],
) => Promise<
  QueryResult<
    CacheVersionRow
  >
>;

/*
 * vi.mock() is hoisted to the beginning of the
 * module. Therefore, mocks used inside its factory
 * must also be created with vi.hoisted().
 */
const {
  queryMock,
} = vi.hoisted(
  () => ({
    queryMock:
      vi.fn<
        DatabaseQuery
      >(),
  }),
);

vi.mock(
  "../../../../config/database.js",
  () => ({
    database: {
      query:
        queryMock,
    },
  }),
);

import {
  getDurableTodoCacheVersion,
} from "../postgres.todo.cache.version.js";

function createQueryResult(
  rows:
    CacheVersionRow[],
): QueryResult<
  CacheVersionRow
> {
  return {
    rows,

    command:
      "SELECT",

    rowCount:
      rows.length,

    oid:
      0,

    fields:
      [],
  };
}

describe(
  "getDurableTodoCacheVersion",
  () => {
    beforeEach(
      () => {
        queryMock.mockReset();
      },
    );

    it(
      "returns the durable version",
      async () => {
        queryMock
          .mockResolvedValueOnce(
            createQueryResult([
              {
                cache_version:
                  "15",
              },
            ]),
          );

        const result =
          await getDurableTodoCacheVersion(
            "70668eae-dac5-4b75-9bd3-02c963eb5b99",
          );

        expect(result).toBe(
          "15",
        );

        expect(
          queryMock,
        ).toHaveBeenCalledWith(
          expect.stringContaining(
            "SELECT",
          ),
          [
            "70668eae-dac5-4b75-9bd3-02c963eb5b99",
          ],
        );
      },
    );

    it(
      "returns undefined when the owner is missing",
      async () => {
        queryMock
          .mockResolvedValueOnce(
            createQueryResult(
              [],
            ),
          );

        const result =
          await getDurableTodoCacheVersion(
            "70668eae-dac5-4b75-9bd3-02c963eb5b99",
          );

        expect(
          result,
        ).toBeUndefined();
      },
    );

    it(
      "rejects an invalid database version",
      async () => {
        queryMock
          .mockResolvedValueOnce(
            createQueryResult([
              {
                cache_version:
                  "invalid",
              },
            ]),
          );

        await expect(
          getDurableTodoCacheVersion(
            "70668eae-dac5-4b75-9bd3-02c963eb5b99",
          ),
        ).rejects.toThrow(
          "PostgreSQL returned an invalid TODO cache version",
        );
      },
    );

    it(
      "propagates database failures",
      async () => {
        queryMock
          .mockRejectedValueOnce(
            new Error(
              "Database unavailable",
            ),
          );

        await expect(
          getDurableTodoCacheVersion(
            "70668eae-dac5-4b75-9bd3-02c963eb5b99",
          ),
        ).rejects.toThrow(
          "Database unavailable",
        );
      },
    );
  },
);