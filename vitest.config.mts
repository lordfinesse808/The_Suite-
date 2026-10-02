import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 60000,
    env: { DATABASE_URL: "memory://", LLM_MODE: "mock", MOCK_WHATSAPP: "true", NODE_ENV: "test" },
  },
});
