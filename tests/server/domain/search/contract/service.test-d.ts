// Type-level pin for PD-102: `SearchContext.db` must be `ReadOnlyDb` (`@orb/db` — `select`/`query`
// only), so a write call through it is a `tsc` error, not merely a behavioral convention. Runtime
// behavior (the verbs never issue a write) is covered by the existing `.int.test.ts` siblings.

import type { SearchContext } from "@orb/server/domain/search";
import { expectTypeOf, test } from "vitest";

declare const ctx: SearchContext;

test("SearchContext.db exposes only select/query — every write member is absent", () => {
  expectTypeOf(ctx.db).toHaveProperty("select");
  expectTypeOf(ctx.db).toHaveProperty("query");
  // Each of these is the enforcement ITSELF: if `ReadOnlyDb` ever widens back to the full `Db`,
  // one of these flips to a compile error (a member reappearing), catching the PD-102 regression.
  expectTypeOf(ctx.db).not.toHaveProperty("insert");
  expectTypeOf(ctx.db).not.toHaveProperty("update");
  expectTypeOf(ctx.db).not.toHaveProperty("delete");
  expectTypeOf(ctx.db).not.toHaveProperty("run");
  expectTypeOf(ctx.db).not.toHaveProperty("all");
  expectTypeOf(ctx.db).not.toHaveProperty("get");
  expectTypeOf(ctx.db).not.toHaveProperty("values");
  expectTypeOf(ctx.db).not.toHaveProperty("transaction");
  expectTypeOf(ctx.db).not.toHaveProperty("batch");
});
