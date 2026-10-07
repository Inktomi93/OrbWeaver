// peek-query.test.ts — the cache-first query peek (data/peek-query.ts). Proves it reads what's ALREADY in
// the cache and returns `undefined` for an uncached key, and that it NEVER fetches (no queryFn runs) — the
// read-only-peek contract the §11.3 gate exemption rests on.

import { peekQueryData } from "@orb/client/data";
import { QueryClient, queryOptions } from "@tanstack/react-query";
import { expectTypeOf } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

test("peekQueryData returns cached data for a seeded key", () => {
  const qc = new QueryClient();
  qc.setQueryData(["chat", "getChat", { chatId: "c1" }], { rpg: { gameId: "g1" } });

  const got = peekQueryData<{ rpg: { gameId: string } | null }>(qc, ["chat", "getChat", { chatId: "c1" }]);

  expect(got).toEqual({ rpg: { gameId: "g1" } });
});

test("peekQueryData returns undefined for an uncached key (no fetch, no throw)", () => {
  const qc = new QueryClient();

  const got = peekQueryData(qc, ["chat", "getChat", { chatId: "missing" }]);

  expect(got).toBeUndefined();
});

test("peekQueryData is read-only — it does not create a cache entry for an uncached key", () => {
  const qc = new QueryClient();

  peekQueryData(qc, ["nope"]);

  // The peek must never materialize a query (a fetch/create would recreate the sprawl the gate guards).
  expect(qc.getQueryCache().find({ queryKey: ["nope"] })).toBeUndefined();
});

test("a tagged-key peek preserves invalidation and leaves freshness to the owning query", async () => {
  const qc = new QueryClient();
  let reads = 0;
  const options = queryOptions({
    queryKey: ["peek-freshness"],
    queryFn: () => {
      reads += 1;
      return { revision: reads };
    },
  });
  const seeded = { revision: 0 };
  qc.setQueryData(options.queryKey, seeded);
  await qc.invalidateQueries({ queryKey: options.queryKey, refetchType: "none" });

  const cached = peekQueryData(qc, options.queryKey);
  expectTypeOf(cached).toEqualTypeOf<{ revision: number } | undefined>();
  expect(cached).toBe(seeded);
  expect(qc.getQueryState(options.queryKey)?.isInvalidated).toBe(true);
  expect(reads).toBe(0);
  expect(await qc.query(options)).toEqual({ revision: 1 });
  expect(qc.getQueryState(options.queryKey)?.isInvalidated).toBe(false);
});
