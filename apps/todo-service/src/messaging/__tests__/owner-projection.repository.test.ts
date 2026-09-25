import type {
  PoolClient,
  QueryResult,
} from "pg";

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  PostgresOwnerProjectionRepository,
} from "../owner-projection.repository.js";

const databaseMocks =
  vi.hoisted(
    () => ({
      connect:
        vi.fn<
          () => Promise<PoolClient>
        >(),
    }),
  );

vi.mock(
  "../../config/database.js",
  () => ({
    database: {
      connect:
        databaseMocks.connect,
    },
  }),
);

type TestQueryResult =
  QueryResult<
    Record<string, unknown>
  >;

type TestQuery = (
  queryText: string,
  values?: readonly unknown[],
) => Promise<TestQueryResult>;

const userId =
  "9f134ed0-4503-4a23-a189-f065fe9fd838";

const registeredAt =
  new Date("2026-09-24T04:00:00.000Z");

const changedAt =
  new Date("2026-09-24T05:00:00.000Z");

function createQueryResult(
  rowCount = 0,
  rows: readonly Record<string, unknown>[] = [],
): TestQueryResult {
  return {
    command:
      "SELECT",

    rowCount,

    oid:
      0,

    fields:
      [],

    rows:
      [...rows],
  };
}

function createClient(): {
  readonly client: PoolClient;
  readonly queryMock: ReturnType<typeof vi.fn<TestQuery>>;
} {
  const queryMock =
    vi.fn<TestQuery>();

  const client = {
    query:
      queryMock,

    release:
      vi.fn<() => void>(),
  } as unknown as PoolClient;

  databaseMocks
    .connect
    .mockResolvedValueOnce(
      client,
    );

  return {
    client,
    queryMock,
  };
}

function createData(
  eventType:
    | "account.registered"
    | "account.email-changed",
  eventId: string,
  email: string,
  occurredAt: Date,
): {
  eventId: string;
  eventType: "account.registered" | "account.email-changed";
  userId: string;
  email: string;
  occurredAt: Date;
  consumerName: string;
} {
  return {
    eventId,
    eventType,
    userId,
    email,
    occurredAt,
    consumerName:
      "todo-owner-projection",
  } as const;
}

beforeEach(
  () => {
    databaseMocks
      .connect
      .mockReset();
  },
);

describe(
  "PostgresOwnerProjectionRepository",
  () => {
    it(
      "keeps an email change until registration arrives",
      async () => {
        const emailChangeClient =
          createClient();

        emailChangeClient.queryMock
          .mockResolvedValueOnce(
            createQueryResult(),
          )
          .mockResolvedValueOnce(
            createQueryResult(1),
          )
          .mockResolvedValueOnce(
            createQueryResult(),
          )
          .mockResolvedValueOnce(
            createQueryResult(),
          )
          .mockResolvedValueOnce(
            createQueryResult(),
          )
          .mockResolvedValueOnce(
            createQueryResult(),
          );

        const repository =
          new PostgresOwnerProjectionRepository();

        await repository.applyAccountEmailChanged(
          createData(
            "account.email-changed",
            "39eb964c-991a-47bc-a012-e9db6eb86c10",
            "new@example.com",
            changedAt,
          ),
        );

        const registrationClient =
          createClient();

        registrationClient.queryMock
          .mockResolvedValueOnce(
            createQueryResult(),
          )
          .mockResolvedValueOnce(
            createQueryResult(1),
          )
          .mockResolvedValueOnce(
            createQueryResult(1, [
              {
                email:
                  "new@example.com",

                occurred_at:
                  changedAt,
              },
            ]),
          )
          .mockResolvedValueOnce(
            createQueryResult(),
          )
          .mockResolvedValueOnce(
            createQueryResult(),
          )
          .mockResolvedValueOnce(
            createQueryResult(),
          );

        await repository.applyAccountRegistered(
          createData(
            "account.registered",
            "70668eae-dac5-4b75-9bd3-02c963eb5b99",
            "old@example.com",
            registeredAt,
          ),
        );

        expect(
          registrationClient.queryMock,
        ).toHaveBeenCalledWith(
          expect.stringContaining(
            "INSERT INTO todo_owners",
          ),
          [
            userId,
            "new@example.com",
            registeredAt,
            changedAt,
          ],
        );
      },
    );

    it(
      "does not apply an older email change after a newer projection",
      async () => {
        const client =
          createClient();

        client.queryMock
          .mockResolvedValueOnce(
            createQueryResult(),
          )
          .mockResolvedValueOnce(
            createQueryResult(1),
          )
          .mockResolvedValueOnce(
            createQueryResult(),
          )
          .mockResolvedValueOnce(
            createQueryResult(),
          )
          .mockResolvedValueOnce(
            createQueryResult(),
          )
          .mockResolvedValueOnce(
            createQueryResult(),
          );

        const repository =
          new PostgresOwnerProjectionRepository();

        const result =
          await repository.applyAccountEmailChanged(
            createData(
              "account.email-changed",
              "224d07f1-8812-429c-a0a6-092d83977ad5",
              "older@example.com",
              registeredAt,
            ),
          );

        expect(result).toBe(
          "applied",
        );

        expect(
          client.queryMock,
        ).toHaveBeenNthCalledWith(
          4,
          expect.stringContaining(
            "owners.projection_occurred_at < pending.occurred_at",
          ),
          [
            userId,
          ],
        );

        expect(
          client.queryMock,
        ).toHaveBeenNthCalledWith(
          5,
          expect.stringContaining(
            "pending.occurred_at <= owners.projection_occurred_at",
          ),
          [
            userId,
          ],
        );
      },
    );
  },
);