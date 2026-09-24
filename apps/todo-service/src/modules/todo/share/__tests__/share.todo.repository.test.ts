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

import type {
  CreateTodoShareData,
} from "../share.todo.repository.interface.js";

import {
  PostgresShareTodoRepository,
} from "../share.todo.repository.js";

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
    PostgresShareTodoRepository;

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

const shareData:
  CreateTodoShareData = {
    id:
      "22222222-2222-4222-8222-222222222222",

    todoId:
      "11111111-1111-4111-8111-111111111111",

    ownerId:
      "33333333-3333-4333-8333-333333333333",

    recipientId:
      "44444444-4444-4444-8444-444444444444",

    permission:
      "state-update",

    requestId:
      "55555555-5555-4555-8555-555555555555",

    sharedAt:
      new Date(
        "2026-09-24T10:00:00.000Z",
      ),
  };

const createdShareRow:
  Record<string, unknown> = {
    outcome:
      "created",

    id:
      shareData.id,

    todo_id:
      shareData.todoId,

    owner_id:
      shareData.ownerId,

    recipient_id:
      shareData.recipientId,

    permission:
      shareData.permission,

    shared_at:
      shareData.sharedAt,
  };

const duplicateShareRow:
  Record<string, unknown> = {
    outcome:
      "duplicate",

    id:
      null,

    todo_id:
      null,

    owner_id:
      null,

    recipient_id:
      null,

    permission:
      null,

    shared_at:
      null,
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
        (
          transaction,
          event,
        ) =>
          appendMock(
            transaction,
            event,
          ),
    };

  return {
    repository:
      new PostgresShareTodoRepository(
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
  "PostgresShareTodoRepository",
  () => {
    it(
      "creates the share and outbox event in one transaction",
      async () => {
        const fixture =
          createFixture();

        fixture.queryMock
          .mockResolvedValueOnce(
            createQueryResult(),
          )
          .mockResolvedValueOnce(
            createQueryResult([
              createdShareRow,
            ]),
          )
          .mockResolvedValueOnce(
            createQueryResult(),
          );

        fixture.appendMock
          .mockResolvedValueOnce();

        const result =
          await fixture.repository
            .create(
              shareData,
            );

        expect(result).toEqual({
          outcome:
            "created",

          share: {
            id:
              shareData.id,

            todoId:
              shareData.todoId,

            ownerId:
              shareData.ownerId,

            recipientId:
              shareData.recipientId,

            permission:
              "state-update",

            sharedAt:
              "2026-09-24T10:00:00.000Z",
          },
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
              "todo.shared",

            eventVersion:
              1,

            producer:
              "todo-service",

            requestId:
              shareData.requestId,

            payload: {
              shareId:
                shareData.id,

              todoId:
                shareData.todoId,

              ownerId:
                shareData.ownerId,

              recipientId:
                shareData.recipientId,
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
      "does not create an event for a duplicate active share",
      async () => {
        const fixture =
          createFixture();

        fixture.queryMock
          .mockResolvedValueOnce(
            createQueryResult(),
          )
          .mockResolvedValueOnce(
            createQueryResult([
              duplicateShareRow,
            ]),
          )
          .mockResolvedValueOnce(
            createQueryResult(),
          );

        const result =
          await fixture.repository
            .create(
              shareData,
            );

        expect(result).toEqual({
          outcome:
            "duplicate",
        });

        expect(
          fixture.appendMock,
        ).not.toHaveBeenCalled();

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
      "does not create an event for a missing or cross-owner TODO",
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
            .create(
              shareData,
            );

        expect(result).toEqual({
          outcome:
            "todo-not-found",
        });

        expect(
          fixture.appendMock,
        ).not.toHaveBeenCalled();

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
      "rolls back the share when the outbox insert fails",
      async () => {
        const fixture =
          createFixture();

        fixture.queryMock
          .mockResolvedValueOnce(
            createQueryResult(),
          )
          .mockResolvedValueOnce(
            createQueryResult([
              createdShareRow,
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
            .create(
              shareData,
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