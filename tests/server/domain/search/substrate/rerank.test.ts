// substrate/rerank — applyRerank (pure orchestration; the rerank call is an arg). Asserts: the reorder
// follows the runner's hit order; UNSCORABLE candidates (no sourceText) are kept and placed AFTER the
// ranked ones (recall-preserving); scorable the runner OMITS keep their incoming order after the ranked
// ones; the result caps to topN; and a rerank rejection (the PD-11 hosted not-supported throw)
// PROPAGATES — search owns no silent CSLS fallback.

import type { RoleClients } from "@orb/contracts/role-clients";
import { describe } from "vitest";
import { applyRerank } from "../../../../../packages/server/src/domain/search/substrate/rerank.ts";
import { expect, test } from "../../../../support/fixtures.ts";

interface Cand {
  readonly id: string;
  readonly sourceText: string | null;
}

/** A runner that returns the given ids (in order) as descending-scored hits, ignoring any not present.
 *  Typed as the real `RoleClients["rerank"]` so the `query` param is the full `RerankQuery` (contravariant
 *  — a `string`-only param would not be assignable where `applyRerank` expects the wider signature). */
function runnerReturning(order: readonly string[]): RoleClients["rerank"] {
  return (_query, _documents) =>
    Promise.resolve({
      hits: order.map((id, i) => ({ id, score: order.length - i })),
      model: "test-rerank",
      usage: { totalTokens: null },
    });
}

describe("applyRerank", () => {
  test("reorders scorable candidates by the runner's hit order, capped to topN", async () => {
    const candidates: Cand[] = [
      { id: "a", sourceText: "alpha" },
      { id: "b", sourceText: "bravo" },
      { id: "c", sourceText: "charlie" },
    ];
    const out = await applyRerank("q", candidates, runnerReturning(["c", "a", "b"]), 2);
    expect(out.map((c) => c.id)).toEqual(["c", "a"]);
  });

  test("unscorable candidates (no sourceText) are placed AFTER the ranked ones", async () => {
    const candidates: Cand[] = [
      { id: "a", sourceText: "alpha" },
      { id: "b", sourceText: null },
      { id: "c", sourceText: "   " },
      { id: "d", sourceText: "delta" },
    ];
    // The runner only sees the scorable docs (a, d); it ranks d before a.
    const out = await applyRerank("q", candidates, runnerReturning(["d", "a"]), 10);
    expect(out.map((c) => c.id)).toEqual(["d", "a", "b", "c"]);
  });

  test("scorable the runner omits keep their incoming order, after the ranked ones", async () => {
    const candidates: Cand[] = [
      { id: "a", sourceText: "alpha" },
      { id: "b", sourceText: "bravo" },
      { id: "c", sourceText: "charlie" },
    ];
    // Runner returns only "b" (a budget-capped subset); a + c are leftover scorable in incoming order.
    const out = await applyRerank("q", candidates, runnerReturning(["b"]), 10);
    expect(out.map((c) => c.id)).toEqual(["b", "a", "c"]);
  });

  test("with no scorable candidates, returns incoming order capped (runner never called)", async () => {
    const candidates: Cand[] = [
      { id: "a", sourceText: null },
      { id: "b", sourceText: "" },
    ];
    const out = await applyRerank("q", candidates, () => Promise.reject(new Error("must not be called")), 10);
    expect(out.map((c) => c.id)).toEqual(["a", "b"]);
  });

  test("a rerank rejection PROPAGATES (no silent fallback to CSLS order)", async () => {
    const candidates: Cand[] = [{ id: "a", sourceText: "alpha" }];
    await expect(applyRerank("q", candidates, () => Promise.reject(new Error("rerank not supported")), 10)).rejects.toThrow("rerank not supported");
  });
});
