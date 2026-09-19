// The declared wall-clock budget for a suite whose SUBJECT is a module-graph re-import
// (`vi.resetModules()` + a dynamic `import(...)` per case). One home for the rule, so the three suites
// that carry it do not each re-derive the reasoning from scratch — and so `reimportBudget` is the grep
// that answers "which suites are re-import-budgeted, and why".
//
// WHY THESE SUITES NEED A DECLARATION AT ALL. A re-import is not a cache hit: vitest re-transforms the
// whole reachable graph, and that transform is paid INSIDE the first test's timer. The project default is
// 5 s, which is ample for a normal unit test and is NOT a statement about a suite that transforms a
// package barrel before it asserts anything. The tell is that the same file is fast in the full battery
// (the graph is already warm from a sibling) and red in a COLD scoped run — the exact run a lane makes
// while iterating on it.
//
// HOW TO PICK THE NUMBER (do this, do not copy a neighbour's): run the file ALONE, cold —
// `pnpm test:scoped <file> --reporter=verbose` — and read the FIRST test's duration; that one carries the
// transform. Declare roughly ten times it. The headroom is not padding: the quiet-box measurement is the
// floor of the range, and the same graph under a full lane fleet has measured ~4-7x its quiet cost
// (wire-capture's own record: ~6.5-6.9 s quiet, 48 s under heavy contention, #1810). Record the measured
// number in a comment at the call site so the next reader can re-derive the declaration instead of
// trusting it.
//
// The load scaling on top is `budget()`'s (`@orb/tooling/_shared/load-budget` — THE one reading of the
// box): on a quiet box the returned value is byte-identical to the base, so this never hides a real
// slowdown, and above the contention boundary it stretches rather than reporting a red about the box.
import { budget } from "@orb/tooling/_shared/load-budget";

/** The load-scaled `testTimeout` for a re-import-as-subject suite. `declaredBaseMs` is the author's
 *  measured-cold-first-test number times its headroom (see the header) — never a copied constant. */
export function reimportBudget(declaredBaseMs: number): number {
  return budget(declaredBaseMs);
}
