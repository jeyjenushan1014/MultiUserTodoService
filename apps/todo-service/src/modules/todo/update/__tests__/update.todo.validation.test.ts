import {
  describe,
  expect,
  it,
} from "vitest";

import {
  updateTodoBodySchema,
} from "../update.todo.validation.js";

describe(
  "updateTodoBodySchema",
  () => {
    it(
      "accepts a title-only update",
      () => {
        const result =
          updateTodoBodySchema.parse({
            title:
              "  Updated title  ",
          });

        expect(result).toEqual({
          title:
            "Updated title",
        });
      },
    );

    it(
      "accepts a state-only update",
      () => {
        const result =
          updateTodoBodySchema.parse({
            state:
              "completed",
          });

        expect(result).toEqual({
          state:
            "completed",
        });
      },
    );

    it(
      "accepts multiple fields",
      () => {
        const result =
          updateTodoBodySchema.parse({
            title:
              "Updated TODO",

            description:
              "Updated description",

            state:
              "in_progress",

            dueDate:
              "2026-09-30T10:00:00.000Z",
          });

        expect(result).toEqual({
          title:
            "Updated TODO",

          description:
            "Updated description",

          state:
            "in_progress",

          dueDate:
            "2026-09-30T10:00:00.000Z",
        });
      },
    );

    it(
      "converts an empty description to null",
      () => {
        const result =
          updateTodoBodySchema.parse({
            description:
              "   ",
          });

        expect(result).toEqual({
          description:
            null,
        });
      },
    );

    it(
      "allows clearing the description",
      () => {
        const result =
          updateTodoBodySchema.parse({
            description:
              null,
          });

        expect(result).toEqual({
          description:
            null,
        });
      },
    );

    it(
      "allows clearing the due date",
      () => {
        const result =
          updateTodoBodySchema.parse({
            dueDate:
              null,
          });

        expect(result).toEqual({
          dueDate:
            null,
        });
      },
    );

    it(
      "rejects an empty update",
      () => {
        const result =
          updateTodoBodySchema.safeParse(
            {},
          );

        expect(
          result.success,
        ).toBe(false);
      },
    );

    it(
      "rejects a blank title",
      () => {
        const result =
          updateTodoBodySchema.safeParse({
            title:
              "   ",
          });

        expect(
          result.success,
        ).toBe(false);
      },
    );

    it(
      "rejects an invalid state",
      () => {
        const result =
          updateTodoBodySchema.safeParse({
            state:
              "deleted",
          });

        expect(
          result.success,
        ).toBe(false);
      },
    );

    it(
      "rejects an invalid due date",
      () => {
        const result =
          updateTodoBodySchema.safeParse({
            dueDate:
              "tomorrow",
          });

        expect(
          result.success,
        ).toBe(false);
      },
    );

    it(
      "rejects protected fields",
      () => {
        const result =
          updateTodoBodySchema.safeParse({
            ownerId:
              "another-owner",
          });

        expect(
          result.success,
        ).toBe(false);
      },
    );
  },
);