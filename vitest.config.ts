import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "apps/web/src"),
      "@inspect-ai/contracts": resolve(__dirname, "packages/contracts/src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup/vitest.setup.ts"],
    include: ["apps/web/src/**/*.test.ts", "apps/api/src/**/*.test.ts", "packages/contracts/src/**/*.test.ts"],
    restoreMocks: true,
  },
});
