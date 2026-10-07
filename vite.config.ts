import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative asset paths so the build runs from any sub-path (static hosting, file previews).
  base: "./",
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**"],
    globals: true,
  },
});
