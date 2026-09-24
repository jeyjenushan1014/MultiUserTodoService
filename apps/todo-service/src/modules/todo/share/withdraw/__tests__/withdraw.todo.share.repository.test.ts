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

import type {
  TodoOutboxWriter,
} from "../../../../../outbox/todo-outbox.writer.interface.js";

import type {
  WithdrawTodoShareData,
} from "../withdraw.todo.share.types.js";

import {
  PostgresWithdrawTodoShareRepository,
} from "../postgres.withdraw.todo.share.repository.js";

const databaseMocks =
  vi.hoisted(
    () => ({
      connect:
        vi.fn<
          () => Promise<PoolClient>
        >(),
    }),
  );

const loggerMocks =
  vi.hoisted(
    () => ({
      error:
        vi.fn(),
    }),
  );

vi.mock(
  "../../../../../config/database.js",
  () => ({
    database: {
      connect:
        databaseMocks.connect,
    },
  }),
);

vi.mock(
  "../../../../../config/logger.js",
  () => ({
    logger: {
      error:
        loggerMocks.error,
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

interface RepositoryFixture {
  readonly repository:
    PostgresWithdrawTodoShareRepository;

  readonly client:
    PoolClient;

  readonly queryMock:
    ReturnType<
      typeof vi.fn<TestQuery>
    >;

  readonly releaseMock:
    ReturnType<
      typeof vi.fn<() => void>
    >;

  readonly appendMock:
    ReturnType<
      typeof vi.fn<
        TodoOutboxWriter[
          "append"
        ]
      >
    >;
}

const withdrawalData:
  WithdrawTodoShareData = {
    ownerId:
      "70668eae-dac5-4b75-9bd3-02c963eb5b99",

    todoId:
      "9f134ed0-4503-4a23-a189-f065fe9fd838",

    recipientId:
      "2dced07e-8468-4a4b-9d23-cd96c75fb962",

    requestId:
      "224d07f1-8812-429c-a0a6-092d83977ad5",

    withdrawnAt:
      new Date(
        "2026-09-24T12:00:00.000Z",
      ),
  };

const ownerRow:
  Record<string, unknown> = {
    owner_id:
      withdrawalData.ownerId,
  };

const withdrawnShareRow:
  Record<string, unknown> = {
    id:
      "f0c8fdcf-bf84-4d17-a7fd-5ab7349d987c",

    todo_id:
      withdrawalData.todoId,

    owner_id:
      withdrawalData.ownerId,

    recipient_id:
      withdrawalData.recipientId,
  };

function createQueryResult(
  rows:
    readonly Record<
      string,
      unknown
    >[] = [],
): TestQueryResult {
  return {
    command:
      "SELECT",

    rowCount:
      rows.length,

    oid:
      0,

    fields:
      [],

    rows:
      [...rows],
  };
}

function createFixture():
  RepositoryFixture {
  const queryMock =
    vi.fn<TestQuery>();

  const releaseMock =
    vi.fn<() => void>();

  const client = {
    query:
      queryMock,

    release:
      releaseMock,
  } as unknown as PoolClient;

  databaseMocks
    .connect
    .mockResolvedValueOnce(
      client,
    );

const appendMock =
  vi.fn<
    TodoOutboxWriter[
      "append"
    ]
  >();

const outboxWriter:
  TodoOutboxWriter = {
    append:
      appendMock,
  };

  return {
    repository:
      new PostgresWithdrawTodoShareRepository(
        outboxWriter,
      ),

    client,
    queryMock,
    releaseMock,
    appendMock,
  };
}

beforeEach(
  () => {
    databaseMocks
      .connect
      .mockReset();

    loggerMocks
      .error
      .mockReset();
  },
);

describe(
  "PostgresWithdrawTodoShareRepository",
  () => {
    it(
      "withdraws the share and appends the event in one transaction",
      async () => {
        const fixture =
          createFixture();

        fixture.queryMock
          .mockResolvedValueOnce(
            createQueryResult(),
          )
          .mockResolvedValueOnce(
            createQueryResult([
              ownerRow,
            ]),
          )
          .mockResolvedValueOnce(
            createQueryResult([
              withdrawnShareRow,
            ]),
          )
          .mockResolvedValueOnce(
            createQueryResult(),
          );

        fixture.appendMock
          .mockResolvedValueOnce();

        const result =
          await fixture.repository
            .withdraw(
              withdrawalData,
            );

        expect(result).toEqual({
          status:
            "withdrawn",

          ownerId:
            withdrawalData.ownerId,
        });

        expect(
          fixture.queryMock,
        ).toHaveBeenNthCalledWith(
          1,
          "BEGIN",
        );

        expect(
          fixture.appendMock,
        ).toHaveBeenCalledWith(
          fixture.client,
          expect.objectContaining({
            eventType:
              "todo.share-withdrawn",

            eventVersion:
              1,

            producer:
              "todo-service",

            requestId:
              withdrawalData.requestId,

            payload: {
              shareId:
                "f0c8fdcf-bf84-4d17-a7fd-5ab7349d987c",

              todoId:
                withdrawalData.todoId,

              ownerId:
                withdrawalData.ownerId,

              recipientId:
                withdrawalData.recipientId,
            },
          }),
        );

        expect(
          fixture.queryMock,
        ).toHaveBeenLastCalledWith(
          "COMMIT",
        );

        expect(
          fixture.releaseMock,
        ).toHaveBeenCalledOnce();
      },
    );

    it(
      "does not create an event when the TODO is inaccessible",
      async () => {
        const fixture =
          createFixture();

        fixture.queryMock
          .mockResolvedValueOnce(
            createQueryResult(),
          )
          .mockResolvedValueOnce(
            createQueryResult(),
          )
          .mockResolvedValueOnce(
            createQueryResult(),
          );

        const result =
          await fixture.repository
            .withdraw(
              withdrawalData,
            );

        expect(result).toEqual({
          status:
            "not_found",
        });

        expect(
          fixture.appendMock,
        ).not.toHaveBeenCalled();

        expect(
          fixture.queryMock,
        ).toHaveBeenLastCalledWith(
          "ROLLBACK",
        );

        expect(
          fixture.releaseMock,
        ).toHaveBeenCalledOnce();
      },
    );

    it(
      "does not create an event when the share is missing or already withdrawn",
      async () => {
        const fixture =
          createFixture();

        fixture.queryMock
          .mockResolvedValueOnce(
            createQueryResult(),
          )
          .mockResolvedValueOnce(
            createQueryResult([
              ownerRow,
            ]),
          )
          .mockResolvedValueOnce(
            createQueryResult(),
          )
          .mockResolvedValueOnce(
            createQueryResult(),
          );

        const result =
          await fixture.repository
            .withdraw(
              withdrawalData,
            );

        expect(result).toEqual({
          status:
            "not_found",
        });

        expect(
          fixture.appendMock,
        ).not.toHaveBeenCalled();

        expect(
          fixture.queryMock,
        ).toHaveBeenLastCalledWith(
          "ROLLBACK",
        );

        expect(
          fixture.releaseMock,
        ).toHaveBeenCalledOnce();
      },
    );

    it(
      "rolls back the withdrawal when the outbox insert fails",
      async () => {
        const fixture =
          createFixture();

        fixture.queryMock
          .mockResolvedValueOnce(
            createQueryResult(),
          )
          .mockResolvedValueOnce(
            createQueryResult([
              ownerRow,
            ]),
          )
          .mockResolvedValueOnce(
            createQueryResult([
              withdrawnShareRow,
            ]),
          )
          .mockResolvedValueOnce(
            createQueryResult(),
          );

        fixture.appendMock
          .mockRejectedValueOnce(
            new Error(
              "Outbox insert failed",
            ),
          );

        await expect(
          fixture.repository
            .withdraw(
              withdrawalData,
            ),
        ).rejects.toThrow(
          "Outbox insert failed",
        );

        expect(
          fixture.queryMock,
        ).toHaveBeenNthCalledWith(
          4,
          "ROLLBACK",
        );

        expect(
          fixture.queryMock,
        ).not.toHaveBeenCalledWith(
          "COMMIT",
        );

        expect(
          fixture.releaseMock,
        ).toHaveBeenCalledOnce();
      },
    );
  },
);