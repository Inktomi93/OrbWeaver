// Type-level pin: the verbs' `SearchContext.db` must be `ReadOnlyDb` (`@orb/db` — `select`/`query`
// only), so a write call through it is a `tsc` error, not merely a behavioral convention. Runtime
// behavior (the verbs never issue a write) is covered by the existing `.int.test.ts` siblings.
// The domain's public `SearchContext` is the assembly input: its `db` is the sealed `DatabaseHandle`.

import type { DatabaseHandle } from "@orb/db/wiring";
import { expectTypeOf, test } from "vitest";
import type { SearchContext } from "#server/domain/search/context.ts";
import type { SearchContext as SearchAssemblyContext } from "#server/domain/search/index.ts";

declare const ctx: SearchContext;

test("SearchContext.db exposes only select/query — every write member is absent", () => {
  expectTypeOf(ctx.db).toHaveProperty("select");
  expectTypeOf(ctx.db).toHaveProperty("query");
  // Each of these is the enforcement ITSELF: if `ReadOnlyDb` ever widens back to the full `Db`,
  // one of these stops being absent and `tsc` fails.
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

test("the public assembly input carries the sealed handle, never a queryable connection", () => {
  expectTypeOf<SearchAssemblyContext["db"]>().toEqualTypeOf<DatabaseHandle>();
  expectTypeOf<SearchAssemblyContext["db"]>().not.toHaveProperty("select");
});
