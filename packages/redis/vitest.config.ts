import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**"],
      reporter: ["text-summary", "text"],
      thresholds: { lines: 85, statements: 85, functions: 85, branches: 80 },
    },
  },
});
