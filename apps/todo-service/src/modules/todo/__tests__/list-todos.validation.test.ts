import {
  describe,
  expect,
  it,
} from "vitest";

import {
  listTodosQuerySchema,
} from "../list/list-todos.validation.js";
import { listTodosQuerySchema as gatewaySchema } from "../../../../../gateway/src/modules/todo/list/list-todos.validation.js";

const cursor = Buffer.from(JSON.stringify({
  createdAt: "2026-10-01T00:00:00.000123Z",
  id: "00000000-0000-4000-8000-000000000001",
  sortOrder: "desc",
})).toString("base64url");

describe.each([
  ["Todo", listTodosQuerySchema],
  ["Gateway", gatewaySchema],
] as const)("%s cursor validation", (_name, schema) => {
  it("accepts a valid cursor and preserves its microseconds", () => {
    expect(schema.parse({ cursor }).cursor).toBe(cursor);
  });
  it.each([
    { cursor: "garbage" },
    { cursor, sortBy: "dueDate" },
    { cursor, sortOrder: "asc" },
    { cursor, page: 2 },
    { cursor: Buffer.from('{"createdAt":"invalid"}').toString("base64url") },
    { cursor: Buffer.from(JSON.stringify({
      createdAt: "2026-02-31T00:00:00.000000Z",
      id: "00000000-0000-4000-8000-000000000001", sortOrder: "desc",
    })).toString("base64url") },
  ])("rejects malformed or incompatible cursors: %j", (query) => {
    expect(schema.safeParse(query).success).toBe(false);
  });
});

describe(
  "listTodosQuerySchema",
  () => {
    it(
      "defaults access to all",
      () => {
        const result =
          listTodosQuerySchema
            .parse({});

        expect(
          result.access,
        ).toBe("all");
      },
    );

    it.each([
      "owned",
      "shared",
      "all",
    ] as const)(
      "accepts the %s access filter",
      (
        access,
      ) => {
        const result =
          listTodosQuerySchema
            .parse({
              access,
            });

        expect(
          result.access,
        ).toBe(access);
      },
    );

    it(
      "rejects an invalid access filter",
      () => {
        const result =
          listTodosQuerySchema
            .safeParse({
              access:
                "invalid",
            });

        expect(
          result.success,
        ).toBe(false);
      },
    );
  },
);