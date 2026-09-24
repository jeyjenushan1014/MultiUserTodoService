import {
  defineConfig,
} from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",

    setupFiles: [
      "../../vitest.setup.ts",
    ],

    clearMocks: true,

    restoreMocks: true,

    coverage: {
      provider: "v8",

      reporter: [
        "text",
        "html",
      ],
    },
  },
});