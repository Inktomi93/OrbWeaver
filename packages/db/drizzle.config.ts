// drizzle-kit config — points the generator at the schema barrel. `generate` is runnable now
// (`pnpm --filter @orb/db exec drizzle-kit generate`) and diffs `src/schema/index.ts` → SQL in
// `src/migrations/`. The `0000_baseline` is NOT generated yet (the integration step does that once every
// Wave-1 table lands — a fresh born-correct baseline, no neo migration replay). Dialect `sqlite` is the
// offline, credential-free generator target; the runtime is libSQL/turso (the emitted DDL is identical).
//
// CONVENTION (Wave-1 must follow): name every column explicitly in snake_case (e.g. `text("created_at")`).
// No `casing` transform is configured, so an omitted column name would NOT be snake-cased — and the
// runtime `drizzle()` call would then disagree with the generated DDL. Explicit names avoid that.

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema/index.ts",
  out: "./src/migrations",
  strict: true,
  verbose: true,
});
