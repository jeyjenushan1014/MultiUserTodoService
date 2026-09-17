import {
  describe,
  expect,
  it,
} from "vitest";
import { createTodoSchema, listTodosSchema, updateTodoSchema } from "../features/todo/todo.validation";


describe("TODO validation", () => {
  it("accepts an allowed TODO state", () => {
    const result =
      createTodoSchema.safeParse({
        body: {
          title: "Complete testing",
          state: "pending",
        },
        params: {},
        query: {},
      });

    expect(result.success).toBe(true);
  });

  it("rejects an unsupported TODO state", () => {
    const result =
      createTodoSchema.safeParse({
        body: {
          title: "Complete testing",
          state: "cancelled",
        },
        params: {},
        query: {},
      });

    expect(result.success).toBe(false);
  });

  it("applies pagination defaults", () => {
    const result =
      listTodosSchema.safeParse({
        body: {},
        params: {},
        query: {},
      });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.query).toEqual({
        page: 1,
        pageSize: 20,
        sortBy: "createdAt",
        sortOrder: "desc",
      });
    }
  });

  it("rejects a page size over 100", () => {
    const result =
      listTodosSchema.safeParse({
        body: {},
        params: {},
        query: {
          pageSize: "101",
        },
      });

    expect(result.success).toBe(false);
  });

  it("rejects an empty update", () => {
    const result =
      updateTodoSchema.safeParse({
        body: {},
        params: {
          id: "3c0cf078-8c35-49fb-928c-f03714ec5e32",
        },
        query: {},
      });

    expect(result.success).toBe(false);
  });
});