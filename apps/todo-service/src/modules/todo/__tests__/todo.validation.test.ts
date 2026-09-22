import {
  describe,
  expect,
  it,
} from "vitest";

import {
  createTodoSchema,
} from "../todo.validation.js";

describe(
  "createTodoSchema",
  () => {
    it(
      "accepts a valid TODO",
      () => {
        const result =
          createTodoSchema.parse({
            title:
              "  Complete Part 5  ",

            description:
              "  Implement API  ",

            state:
              "pending",

            dueDate:
              "2026-09-25T12:00:00.000Z",
          });

        expect(result).toEqual({
          title:
            "Complete Part 5",

          description:
            "Implement API",

          state:
            "pending",

          dueDate:
            "2026-09-25T12:00:00.000Z",
        });
      },
    );

    it(
      "accepts only the required title",
      () => {
        expect(
          createTodoSchema.parse({
            title:
              "Complete Part 5",
          }),
        ).toEqual({
          title:
            "Complete Part 5",
        });
      },
    );

    it(
      "converts a blank description to null",
      () => {
        expect(
          createTodoSchema.parse({
            title:
              "Complete Part 5",

            description:
              "   ",
          }),
        ).toEqual({
          title:
            "Complete Part 5",

          description:
            null,
        });
      },
    );

    it(
      "rejects a blank title",
      () => {
        expect(() =>
          createTodoSchema.parse({
            title: "   ",
          }),
        ).toThrow();
      },
    );

    it(
      "rejects an unsupported state",
      () => {
        expect(() =>
          createTodoSchema.parse({
            title:
              "Complete Part 5",

            state:
              "done",
          }),
        ).toThrow();
      },
    );

    it(
      "rejects an invalid due date",
      () => {
        expect(() =>
          createTodoSchema.parse({
            title:
              "Complete Part 5",

            dueDate:
              "tomorrow",
          }),
        ).toThrow();
      },
    );

    it(
      "rejects unknown properties",
      () => {
        expect(() =>
          createTodoSchema.parse({
            title:
              "Complete Part 5",

            ownerId:
              "attacker-selected-owner",
          }),
        ).toThrow();
      },
    );
  },
);