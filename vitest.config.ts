import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["packages/*/src/**/*.test.ts", "infra/**/*.test.ts"],
          exclude: ["packages/*/src/**/*.integration.test.ts"],
        },
      },
      {
        test: {
          name: "integration",
          include: ["packages/*/src/**/*.integration.test.ts"],
          passWithNoTests: true,
        },
      },
    ],
  },
});
