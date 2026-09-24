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
} from "../../../../outbox/todo-outbox.writer.interface.js";

import {
  PostgresDeleteTodoRepository,
} from "../postgres.delete.todo.repository.js";

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
  "../../../../config/database.js",
  () => ({
    database: {
      connect:
        databaseMocks.connect,
    },
  }),
);

vi.mock(
  "../../../../config/logger.js",
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
    PostgresDeleteTodoRepository;

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

const ownerId =
  "70668eae-dac5-4b75-9bd3-02c963eb5b99";

const todoId =
  "9f134ed0-4503-4a23-a189-f065fe9fd838";

const requestId =
  "224d07f1-8812-429c-a0a6-092d83977ad5";

const deletedTodoRow:
  Record<string, unknown> = {
    id:
      todoId,

    owner_id:
      ownerId,
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
      new PostgresDeleteTodoRepository(
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
  "PostgresDeleteTodoRepository",
  () => {
    it(
      "soft deletes the TODO and appends the event in one transaction",
      async () => {
        const fixture =
          createFixture();

        fixture.queryMock
          .mockResolvedValueOnce(
            createQueryResult(),
          )
          .mockResolvedValueOnce(
            createQueryResult([
              deletedTodoRow,
            ]),
          )
          .mockResolvedValueOnce(
            createQueryResult(),
          );

        fixture.appendMock
          .mockResolvedValueOnce(
            undefined,
          );

        const result =
          await fixture.repository
            .softDeleteOwnedTodo(
              ownerId,
              todoId,
              requestId,
            );

        expect(result).toBe(true);

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
              "todo.deleted",

            eventVersion:
              1,

            producer:
              "todo-service",

            requestId,

            payload: {
              todoId,
              ownerId,

              deletedByUserId:
                ownerId,
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
      "does not append an event when no owned TODO is deleted",
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
            .softDeleteOwnedTodo(
              ownerId,
              todoId,
              requestId,
            );

        expect(result).toBe(false);

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
      "rolls back the deletion when the outbox insert fails",
      async () => {
        const fixture =
          createFixture();

        fixture.queryMock
          .mockResolvedValueOnce(
            createQueryResult(),
          )
          .mockResolvedValueOnce(
            createQueryResult([
              deletedTodoRow,
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
            .softDeleteOwnedTodo(
              ownerId,
              todoId,
              requestId,
            ),
        ).rejects.toThrow(
          "Outbox insert failed",
        );

        expect(
          fixture.queryMock,
        ).toHaveBeenNthCalledWith(
          3,
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