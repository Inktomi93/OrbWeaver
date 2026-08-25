// Contract pins for `domain/automation/contract/ops.ts` — the domain's own type home. Only the axes with a
// RUNTIME vocabulary live here; the rest of that module is injected-op TYPES, which `tsc` owns.
//
// `DOMAIN_ROW_KINDS` is the one such axis, and this is its liveness pin. It names the domain rows a
// CHAT-LESS `TriggerFact` can reference, and it has TWO consumers that must never disagree about the set:
// the plugin fan-out's visibility gate ("may this installer SEE this fact?") and the owner-global rule gate
// ("may this author's chat-less rule ACT on it?"), both routed through `substrate/fact-scope.ts`. The
// per-kind SQL in `persistence/canon-reads.ts` is `default: never`-pinned against the derived union, so a
// fifth kind cannot be added without its read — this asserts the other direction, that the TUPLE and the
// UNION are the same set, which is what makes the `never` pin mean anything.

import { describe } from "vitest";
import type { DomainRowKind } from "../../../../../packages/server/src/domain/automation/contract/ops.ts";
import { DOMAIN_ROW_KINDS } from "../../../../../packages/server/src/domain/automation/contract/ops.ts";
import { expect, test } from "../../../../support/fixtures.ts";

// The compile-time backstop (the workloads KIND_SEEN pattern): a tuple edit the runtime `toEqual` below
// missed fails `tsc` HERE instead of drifting.
const KIND_SEEN: Record<DomainRowKind, true> = { character: true, asset: true, persona: true, worldBook: true };

describe("DOMAIN_ROW_KINDS", () => {
  test("is the pinned four-member set — one per DOMAIN-bus event that names an owned row", () => {
    // It grew to four with S7: `persona.updated` and `world-info.updated` had been live on the domain bus
    // since 2026-08-14 with no trigger-tuple members and no visibility arm, so both facts fell into the
    // fan-out's fail-CLOSED default forever — a dead wire that reads as coverage.
    expect(DOMAIN_ROW_KINDS).toEqual(["character", "asset", "persona", "worldBook"]);
  });

  test("the union has no member beyond the tuple", () => {
    expect(Object.keys(KIND_SEEN).toSorted()).toEqual(DOMAIN_ROW_KINDS.toSorted());
  });
});
