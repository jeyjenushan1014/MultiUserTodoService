import {
  defineConfig,
} from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "src/__tests__/todo.e2e.test.ts",
    ],

    testTimeout:
      30_000,

    hookTimeout:
      60_000,

    sequence: {
      concurrent:
        false,
    },

    env: {
      RUN_TODO_E2E:
        "true",
    },
  },
});