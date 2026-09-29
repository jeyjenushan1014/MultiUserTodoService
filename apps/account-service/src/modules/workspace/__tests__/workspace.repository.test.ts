import type {
  PoolClient,
} from "pg";

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  PostgresWorkspaceRepository,
} from "../workspace.repository.js";

const databaseMocks =
  vi.hoisted(
    () => ({
      connect:
        vi.fn(),
    }),
  );

vi.mock(
  "../../../config/database.js",
  () => ({
    database:
      databaseMocks,
  }),
);

vi.mock(
  "../../../config/logger.js",
  () => ({
    logger: {
      error:
        vi.fn(),
    },
  }),
);

interface QueryResultFixture {
  readonly rows?:
    readonly unknown[];

  readonly rowCount?:
    number;
}

interface RecordedQuery {
  readonly text:
    string;

  readonly parameters:
    readonly unknown[] | undefined;
}

interface ExpectedWorkspacePayload {
  readonly workspaceId:
    string;

  readonly userId:
    string;

  readonly role:
    | "administrator"
    | "editor"
    | "viewer"
    | null;

  readonly changedAt:
    string;
}

interface ClientHarness {
  readonly client:
    PoolClient;

  readonly queries:
    RecordedQuery[];

  readonly getReleaseCount:
    () => number;
}

type QueryStep =
  | QueryResultFixture
  | Error;

function createClientHarness(
  steps:
    readonly QueryStep[],
): ClientHarness {
  const remainingSteps =
    [...steps];

  const queries:
    RecordedQuery[] = [];

  let releaseCount =
    0;

  const client = {
    query: (
      text: string,
      parameters?:
        readonly unknown[],
    ): Promise<QueryResultFixture> => {
      queries.push({
        text,
        parameters,
      });

      const step =
        remainingSteps.shift();

      if (
        step === undefined
      ) {
        return Promise.reject(
          new Error(
            `Unexpected query: ${text}`,
          ),
        );
      }

      if (
        step instanceof Error
      ) {
        return Promise.reject(
          step,
        );
      }

      return Promise.resolve(
        step,
      );
    },

    release: (): void => {
      releaseCount += 1;
    },
  } as unknown as PoolClient;

  return {
    client,
    queries,

    getReleaseCount:
      (): number =>
        releaseCount,
  };
}

function queryTextAt(
  harness:
    ClientHarness,
  index:
    number,
): string {
  const query =
    harness.queries[index];

  if (
    query === undefined
  ) {
    throw new Error(
      `Query ${index} was not recorded`,
    );
  }

  return query.text;
}

function findOutboxQuery(
  harness:
    ClientHarness,
): RecordedQuery | undefined {
  return harness.queries.find(
    (
      query,
    ) =>
      query.text.includes(
        "INSERT INTO outbox_events",
      ),
  );
}

function requireParameters(
  query:
    RecordedQuery | undefined,
): readonly unknown[] {
  if (
    query?.parameters ===
      undefined
  ) {
    throw new Error(
      "Expected query parameters",
    );
  }

  return query.parameters;
}

function expectOutboxPayload(
  harness:
    ClientHarness,
  expected:
    ExpectedWorkspacePayload,
): void {
  const parameters =
    requireParameters(
      findOutboxQuery(
        harness,
      ),
    );

  const serializedPayload =
    parameters[5];

  if (
    typeof serializedPayload !==
      "string"
  ) {
    throw new Error(
      "Outbox payload is not serialized JSON",
    );
  }

  expect(
    serializedPayload,
  ).toBe(
    JSON.stringify(
      expected,
    ),
  );
}

function containsQuery(
  harness:
    ClientHarness,
  text:
    string,
): boolean {
  return harness.queries.some(
    (
      query,
    ) =>
      query.text.includes(
        text,
      ),
  );
}

describe(
  "PostgresWorkspaceRepository",
  () => {
    beforeEach(
      () => {
        databaseMocks
          .connect
          .mockReset();
      },
    );

    it(
      "creates a workspace, administrator and event in one transaction",
      async () => {
        const changedAt =
          new Date(
            "2026-09-29T10:00:00.000Z",
          );

        const harness =
          createClientHarness([
            // BEGIN
            {},

            // INSERT workspaces
            {
              rows: [
                {
                  id:
                    "workspace-id",

                  name:
                    "Engineering",

                  created_by:
                    "creator-id",

                  created_at:
                    changedAt,
                },
              ],
            },

            // INSERT workspace_members
            {
              rowCount:
                1,
            },

            // INSERT outbox_events
            {
              rowCount:
                1,
            },

            // COMMIT
            {},
          ]);

        databaseMocks
          .connect
          .mockResolvedValue(
            harness.client,
          );

        const repository =
          new PostgresWorkspaceRepository();

        const result =
          await repository
            .createWorkspace({
              id:
                "workspace-id",

              name:
                "Engineering",

              creatorId:
                "creator-id",

              eventId:
                "event-id",

              requestId:
                "request-id",

              changedAt,
            });

        expect(
          result,
        ).toEqual({
          id:
            "workspace-id",

          name:
            "Engineering",

          createdBy:
            "creator-id",

          createdAt:
            changedAt.toISOString(),
        });

        expect(
          queryTextAt(
            harness,
            0,
          ),
        ).toBe(
          "BEGIN",
        );

        expect(
          queryTextAt(
            harness,
            1,
          ),
        ).toContain(
          "INSERT INTO workspaces",
        );

        expect(
          queryTextAt(
            harness,
            2,
          ),
        ).toContain(
          "INSERT INTO workspace_members",
        );

        expect(
          queryTextAt(
            harness,
            3,
          ),
        ).toContain(
          "INSERT INTO outbox_events",
        );

        expect(
          queryTextAt(
            harness,
            4,
          ),
        ).toBe(
          "COMMIT",
        );

        expectOutboxPayload(
          harness,
          {
            workspaceId:
              "workspace-id",

            userId:
              "creator-id",

            role:
              "administrator",

            changedAt:
              changedAt.toISOString(),
          },
        );

        expect(
          harness.getReleaseCount(),
        ).toBe(1);
      },
    );

    it(
      "rolls back when the initial administrator insert fails",
      async () => {
        const changedAt =
          new Date(
            "2026-09-29T10:00:00.000Z",
          );

        const harness =
          createClientHarness([
            // BEGIN
            {},

            // INSERT workspaces
            {
              rows: [
                {
                  id:
                    "workspace-id",

                  name:
                    "Engineering",

                  created_by:
                    "creator-id",

                  created_at:
                    changedAt,
                },
              ],
            },

            // INSERT workspace_members fails
            new Error(
              "member insert failed",
            ),

            // ROLLBACK
            {},
          ]);

        databaseMocks
          .connect
          .mockResolvedValue(
            harness.client,
          );

        const repository =
          new PostgresWorkspaceRepository();

        await expect(
          repository
            .createWorkspace({
              id:
                "workspace-id",

              name:
                "Engineering",

              creatorId:
                "creator-id",

              eventId:
                "event-id",

              requestId:
                "request-id",

              changedAt,
            }),
        ).rejects.toThrow(
          "member insert failed",
        );

        expect(
          queryTextAt(
            harness,
            3,
          ),
        ).toBe(
          "ROLLBACK",
        );

        expect(
          findOutboxQuery(
            harness,
          ),
        ).toBeUndefined();

        expect(
          harness.getReleaseCount(),
        ).toBe(1);
      },
    );

    it(
      "rolls back workspace creation when the outbox insert fails",
      async () => {
        const changedAt =
          new Date(
            "2026-09-29T10:00:00.000Z",
          );

        const harness =
          createClientHarness([
            // BEGIN
            {},

            // INSERT workspaces
            {
              rows: [
                {
                  id:
                    "workspace-id",

                  name:
                    "Engineering",

                  created_by:
                    "creator-id",

                  created_at:
                    changedAt,
                },
              ],
            },

            // INSERT workspace_members
            {
              rowCount:
                1,
            },

            // INSERT outbox_events fails
            new Error(
              "outbox insert failed",
            ),

            // ROLLBACK
            {},
          ]);

        databaseMocks
          .connect
          .mockResolvedValue(
            harness.client,
          );

        const repository =
          new PostgresWorkspaceRepository();

        await expect(
          repository
            .createWorkspace({
              id:
                "workspace-id",

              name:
                "Engineering",

              creatorId:
                "creator-id",

              eventId:
                "event-id",

              requestId:
                "request-id",

              changedAt,
            }),
        ).rejects.toThrow(
          "outbox insert failed",
        );

        expect(
          queryTextAt(
            harness,
            4,
          ),
        ).toBe(
          "ROLLBACK",
        );

        expect(
          containsQuery(
            harness,
            "COMMIT",
          ),
        ).toBe(false);

        expect(
          harness.getReleaseCount(),
        ).toBe(1);
      },
    );

    it(
      "rejects self-add before opening a transaction",
      async () => {
        const repository =
          new PostgresWorkspaceRepository();

        const result =
          await repository
            .addMember({
              workspaceId:
                "workspace-id",

              actorId:
                "same-user",

              userId:
                "same-user",

              role:
                "administrator",

              eventId:
                "event-id",

              requestId:
                "request-id",

              changedAt:
                new Date(
                  "2026-09-29T10:00:00.000Z",
                ),
            });

        expect(
          result,
        ).toBe(
          "self-change",
        );

        expect(
          databaseMocks.connect,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "does not allow an editor to add a member or publish an event",
      async () => {
        const harness =
          createClientHarness([
            // BEGIN
            {},

            // SELECT workspace FOR UPDATE
            {
              rowCount:
                1,

              rows: [
                {
                  id:
                    "workspace-id",
                },
              ],
            },

            // SELECT actor membership
            {
              rows: [
                {
                  user_id:
                    "actor-id",

                  role:
                    "editor",
                },
              ],
            },

            // COMMIT
            {},
          ]);

        databaseMocks
          .connect
          .mockResolvedValue(
            harness.client,
          );

        const repository =
          new PostgresWorkspaceRepository();

        const result =
          await repository
            .addMember({
              workspaceId:
                "workspace-id",

              actorId:
                "actor-id",

              userId:
                "target-id",

              role:
                "viewer",

              eventId:
                "event-id",

              requestId:
                "request-id",

              changedAt:
                new Date(
                  "2026-09-29T10:00:00.000Z",
                ),
            });

        expect(
          result,
        ).toBe(
          "forbidden",
        );

        expect(
          findOutboxQuery(
            harness,
          ),
        ).toBeUndefined();

        expect(
          queryTextAt(
            harness,
            3,
          ),
        ).toBe(
          "COMMIT",
        );

        expect(
          harness.getReleaseCount(),
        ).toBe(1);
      },
    );

    it(
      "adds a registered member and publishes the current role",
      async () => {
        const changedAt =
          new Date(
            "2026-09-29T10:05:00.000Z",
          );

        const harness =
          createClientHarness([
            // BEGIN
            {},

            // SELECT workspace FOR UPDATE
            {
              rowCount:
                1,

              rows: [
                {
                  id:
                    "workspace-id",
                },
              ],
            },

            // SELECT actor membership
            {
              rows: [
                {
                  user_id:
                    "actor-id",

                  role:
                    "administrator",
                },
              ],
            },

            // INSERT workspace_members
            {
              rowCount:
                1,
            },

            // INSERT outbox_events
            {
              rowCount:
                1,
            },

            // COMMIT
            {},
          ]);

        databaseMocks
          .connect
          .mockResolvedValue(
            harness.client,
          );

        const repository =
          new PostgresWorkspaceRepository();

        const result =
          await repository
            .addMember({
              workspaceId:
                "workspace-id",

              actorId:
                "actor-id",

              userId:
                "target-id",

              role:
                "viewer",

              eventId:
                "event-id",

              requestId:
                "request-id",

              changedAt,
            });

        expect(
          result,
        ).toBe(
          "changed",
        );

        expectOutboxPayload(
          harness,
          {
            workspaceId:
              "workspace-id",

            userId:
              "target-id",

            role:
              "viewer",

            changedAt:
              changedAt.toISOString(),
          },
        );

        expect(
          queryTextAt(
            harness,
            5,
          ),
        ).toBe(
          "COMMIT",
        );

        expect(
          harness.getReleaseCount(),
        ).toBe(1);
      },
    );

    it(
      "rolls back member addition when its outbox insert fails",
      async () => {
        const changedAt =
          new Date(
            "2026-09-29T10:05:00.000Z",
          );

        const harness =
          createClientHarness([
            // BEGIN
            {},

            // SELECT workspace FOR UPDATE
            {
              rowCount:
                1,

              rows: [
                {
                  id:
                    "workspace-id",
                },
              ],
            },

            // SELECT actor membership
            {
              rows: [
                {
                  user_id:
                    "actor-id",

                  role:
                    "administrator",
                },
              ],
            },

            // INSERT workspace_members
            {
              rowCount:
                1,
            },

            // INSERT outbox_events fails
            new Error(
              "outbox insert failed",
            ),

            // ROLLBACK
            {},
          ]);

        databaseMocks
          .connect
          .mockResolvedValue(
            harness.client,
          );

        const repository =
          new PostgresWorkspaceRepository();

        await expect(
          repository
            .addMember({
              workspaceId:
                "workspace-id",

              actorId:
                "actor-id",

              userId:
                "target-id",

              role:
                "viewer",

              eventId:
                "event-id",

              requestId:
                "request-id",

              changedAt,
            }),
        ).rejects.toThrow(
          "outbox insert failed",
        );

        expect(
          queryTextAt(
            harness,
            5,
          ),
        ).toBe(
          "ROLLBACK",
        );

        expect(
          containsQuery(
            harness,
            "COMMIT",
          ),
        ).toBe(false);

        expect(
          harness.getReleaseCount(),
        ).toBe(1);
      },
    );

    it.each(
      [
        "changeMemberRole",
        "removeMember",
      ] as const,
    )(
      "prevents %s for the last administrator",
      async (
        operation,
      ) => {
        const changedAt =
          new Date(
            "2026-09-29T10:10:00.000Z",
          );

        const harness =
          createClientHarness([
            // BEGIN
            {},

            // SELECT workspace FOR UPDATE
            {
              rowCount:
                1,

              rows: [
                {
                  id:
                    "workspace-id",
                },
              ],
            },

            // SELECT actor
            {
              rows: [
                {
                  user_id:
                    "actor-id",

                  role:
                    "administrator",
                },
              ],
            },

            // SELECT target
            {
              rows: [
                {
                  user_id:
                    "target-id",

                  role:
                    "administrator",
                },
              ],
            },

            // SELECT another administrator
            {
              rows: [
                {
                  present:
                    false,
                },
              ],
            },

            // COMMIT
            {},
          ]);

        databaseMocks
          .connect
          .mockResolvedValue(
            harness.client,
          );

        const repository =
          new PostgresWorkspaceRepository();

        const result =
          operation ===
            "changeMemberRole"
            ? await repository
              .changeMemberRole({
                workspaceId:
                  "workspace-id",

                actorId:
                  "actor-id",

                userId:
                  "target-id",

                role:
                  "editor",

                eventId:
                  "event-id",

                requestId:
                  "request-id",

                changedAt,
              })
            : await repository
              .removeMember({
                workspaceId:
                  "workspace-id",

                actorId:
                  "actor-id",

                userId:
                  "target-id",

                eventId:
                  "event-id",

                requestId:
                  "request-id",

                changedAt,
              });

        expect(
          result,
        ).toBe(
          "last-administrator",
        );

        expect(
          findOutboxQuery(
            harness,
          ),
        ).toBeUndefined();

        expect(
          queryTextAt(
            harness,
            5,
          ),
        ).toBe(
          "COMMIT",
        );

        expect(
          harness.getReleaseCount(),
        ).toBe(1);
      },
    );

    it(
      "changes a member role and publishes the new role",
      async () => {
        const changedAt =
          new Date(
            "2026-09-29T10:15:00.000Z",
          );

        const harness =
          createClientHarness([
            // BEGIN
            {},

            // SELECT workspace FOR UPDATE
            {
              rowCount:
                1,

              rows: [
                {
                  id:
                    "workspace-id",
                },
              ],
            },

            // SELECT actor
            {
              rows: [
                {
                  user_id:
                    "actor-id",

                  role:
                    "administrator",
                },
              ],
            },

            // SELECT target
            {
              rows: [
                {
                  user_id:
                    "target-id",

                  role:
                    "viewer",
                },
              ],
            },

            // UPDATE workspace_members
            {
              rowCount:
                1,
            },

            // INSERT outbox_events
            {
              rowCount:
                1,
            },

            // COMMIT
            {},
          ]);

        databaseMocks
          .connect
          .mockResolvedValue(
            harness.client,
          );

        const repository =
          new PostgresWorkspaceRepository();

        const result =
          await repository
            .changeMemberRole({
              workspaceId:
                "workspace-id",

              actorId:
                "actor-id",

              userId:
                "target-id",

              role:
                "editor",

              eventId:
                "event-id",

              requestId:
                "request-id",

              changedAt,
            });

        expect(
          result,
        ).toBe(
          "changed",
        );

        expectOutboxPayload(
          harness,
          {
            workspaceId:
              "workspace-id",

            userId:
              "target-id",

            role:
              "editor",

            changedAt:
              changedAt.toISOString(),
          },
        );

        expect(
          queryTextAt(
            harness,
            6,
          ),
        ).toBe(
          "COMMIT",
        );

        expect(
          harness.getReleaseCount(),
        ).toBe(1);
      },
    );

    it(
      "removes a member and publishes a null role",
      async () => {
        const changedAt =
          new Date(
            "2026-09-29T10:25:00.000Z",
          );

        const harness =
          createClientHarness([
            // BEGIN
            {},

            // SELECT workspace FOR UPDATE
            {
              rowCount:
                1,

              rows: [
                {
                  id:
                    "workspace-id",
                },
              ],
            },

            // SELECT actor
            {
              rows: [
                {
                  user_id:
                    "actor-id",

                  role:
                    "administrator",
                },
              ],
            },

            // SELECT target
            {
              rows: [
                {
                  user_id:
                    "target-id",

                  role:
                    "viewer",
                },
              ],
            },

            // DELETE workspace_members
            {
              rowCount:
                1,
            },

            // INSERT outbox_events
            {
              rowCount:
                1,
            },

            // COMMIT
            {},
          ]);

        databaseMocks
          .connect
          .mockResolvedValue(
            harness.client,
          );

        const repository =
          new PostgresWorkspaceRepository();

        const result =
          await repository
            .removeMember({
              workspaceId:
                "workspace-id",

              actorId:
                "actor-id",

              userId:
                "target-id",

              eventId:
                "event-id",

              requestId:
                "request-id",

              changedAt,
            });

        expect(
          result,
        ).toBe(
          "changed",
        );

        expectOutboxPayload(
          harness,
          {
            workspaceId:
              "workspace-id",

            userId:
              "target-id",

            role:
              null,

            changedAt:
              changedAt.toISOString(),
          },
        );

        expect(
          queryTextAt(
            harness,
            6,
          ),
        ).toBe(
          "COMMIT",
        );

        expect(
          harness.getReleaseCount(),
        ).toBe(1);
      },
    );
  },
);