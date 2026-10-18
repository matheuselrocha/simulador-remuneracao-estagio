import { defineConfig } from "vitest/config";

// Testes de banco e segurança: exigem `supabase start` (Docker).
export default defineConfig({
  test: {
    include: ["supabase/tests/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
