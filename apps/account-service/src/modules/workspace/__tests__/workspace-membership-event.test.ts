import type {
  PoolClient,
} from "pg";

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  insertWorkspaceMembershipChangedOutboxEvent,
} from "../workspace-membership-event.js";

interface RecordedQuery {
  readonly text: string;
  readonly parameters:
    readonly unknown[] | undefined;
}

interface ParsedWorkspacePayload {
  readonly workspaceId: string;
  readonly userId: string;
  readonly role:
    | "administrator"
    | "editor"
    | "viewer"
    | null;
  readonly changedAt: string;
}

function isRecord(
  value: unknown,
): value is Record<
  string,
  unknown
> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isWorkspaceRoleOrNull(
  value: unknown,
): value is
  | "administrator"
  | "editor"
  | "viewer"
  | null {
  return (
    value === null ||
    value === "administrator" ||
    value === "editor" ||
    value === "viewer"
  );
}

function parseWorkspacePayload(
  value: unknown,
): ParsedWorkspacePayload {
  if (
    typeof value !== "string"
  ) {
    throw new Error(
      "Outbox payload is not serialized JSON",
    );
  }

  const parsed: unknown =
    JSON.parse(
      value,
    );

  if (
    !isRecord(
      parsed,
    ) ||
    typeof parsed.workspaceId !==
      "string" ||
    typeof parsed.userId !==
      "string" ||
    !isWorkspaceRoleOrNull(
      parsed.role,
    ) ||
    typeof parsed.changedAt !==
      "string"
  ) {
    throw new Error(
      "Outbox payload does not match the workspace membership event",
    );
  }

  return {
    workspaceId:
      parsed.workspaceId,

    userId:
      parsed.userId,

    role:
      parsed.role,

    changedAt:
      parsed.changedAt,
  };
}

function createRecordingClient(): {
  readonly client: PoolClient;
  readonly queries:
    RecordedQuery[];
} {
  const queries:
    RecordedQuery[] = [];

  /*
   * The production helper only calls client.query() with
   * SQL text and a parameter array.
   *
   * This test double records those arguments without
   * reading Vitest's untyped mock.calls collection.
   */
  const client = {
    query: (
      text: string,
      parameters?:
        readonly unknown[],
    ): Promise<{
      readonly rows:
        readonly unknown[];
      readonly rowCount:
        number;
    }> => {
      queries.push({
        text,
        parameters,
      });

      return Promise.resolve({
        rows: [],
        rowCount: 1,
      });
    },
  } as unknown as PoolClient;

  return {
    client,
    queries,
  };
}

function requireParameters(
  query:
    RecordedQuery | undefined,
): readonly unknown[] {
  if (
    query?.parameters === undefined
  ) {
    throw new Error(
      "Expected query parameters",
    );
  }

  return query.parameters;
}

describe(
  "insertWorkspaceMembershipChangedOutboxEvent",
  () => {
    it(
      "inserts the version 1 producer payload",
      async () => {
        const {
          client,
          queries,
        } =
          createRecordingClient();

        const changedAt =
          new Date(
            "2026-09-29T10:00:00.000Z",
          );

        await insertWorkspaceMembershipChangedOutboxEvent(
          client,
          {
            eventId:
              "7d80fc1e-c97a-43b7-905a-dd7186b23d94",

            workspaceId:
              "f0762196-e58e-469d-a857-6d5df68ca022",

            userId:
              "60fd290e-7fd0-468b-858c-40a53e78fe36",

            role:
              "editor",

            changedAt,

            requestId:
              "796ec39c-c13c-436c-bf91-dd830e32c6c2",
          },
        );

        expect(
          queries,
        ).toHaveLength(1);

        const parameters =
          requireParameters(
            queries[0],
          );

        expect(
          parameters[3],
        ).toBe(
          "workspace.membership-changed",
        );

        expect(
          parameters[4],
        ).toBe(1);

        expect(
          parseWorkspacePayload(
            parameters[5],
          ),
        ).toEqual({
          workspaceId:
            "f0762196-e58e-469d-a857-6d5df68ca022",

          userId:
            "60fd290e-7fd0-468b-858c-40a53e78fe36",

          role:
            "editor",

          changedAt:
            changedAt.toISOString(),
        });

        expect(
          parameters[6],
        ).toBe(
          "796ec39c-c13c-436c-bf91-dd830e32c6c2",
        );

        expect(
          parameters[7],
        ).toBe(
          changedAt,
        );
      },
    );

    it(
      "uses null role for removal",
      async () => {
        const {
          client,
          queries,
        } =
          createRecordingClient();

        const changedAt =
          new Date(
            "2026-09-29T10:05:00.000Z",
          );

        await insertWorkspaceMembershipChangedOutboxEvent(
          client,
          {
            eventId:
              "9c2ff176-08b2-4ac3-bf10-30c1f2907f18",

            workspaceId:
              "f0762196-e58e-469d-a857-6d5df68ca022",

            userId:
              "60fd290e-7fd0-468b-858c-40a53e78fe36",

            role:
              null,

            changedAt,

            requestId:
              "5cf2a51a-4db8-4b72-b812-e23143014304",
          },
        );

        const parameters =
          requireParameters(
            queries[0],
          );

        const payload =
          parseWorkspacePayload(
            parameters[5],
          );

        expect(
          payload.role,
        ).toBeNull();

        expect(
          payload.changedAt,
        ).toBe(
          changedAt.toISOString(),
        );
      },
    );
  },
);