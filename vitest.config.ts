import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["scripts/wiki-parser/tests/**/*.test.ts", "src/**/*.test.ts"],
    environment: "node",
  },
});
