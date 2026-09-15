// The PERMANENT PIN for BOTH of the conformance harness's substrates — the fs-backed door (#779, first
// half) and the amortized in-memory door (#780, second half). One file because they are one contract: what
// project a gate's example is proven against.
//
// ── #779, the fs-backed substrate ──────────────────────────────────────────────────────────────────────
// The substrate used to
// re-DISCOVER the files it had just written with a recursive glob per example — measured 50.7ms against
// 0.7ms for the known-path door — and across 330 fs-backed examples that glob WAS the bite-proof's runtime
// (43s against its 45s budget). The resolve-once rewrite is only safe if the project it hands a gate is the
// SAME SET as before, so the two halves of that contract are pinned here rather than left to a one-shot
// measurement: every materialized `.ts`/`.tsx` reaches the gate's project, and every NON-TS file it writes
// stays on DISK and OUT of it (dangling-refs plants `.md`, over-art-plate-arm a stylesheet, a ratchet gate
// its baseline — each read through the gate's own `readFileSync`, and each a parse error if it were added).
// Driven through the REAL `verifyGateProofs`, with a synthetic descriptor that records what it was fed.
//
// ── #780, the in-memory substrate ──────────────────────────────────────────────────────────────────────
// That door used to build a FRESH ts-morph `Project` per example; ~105ms of every one of the ~1500 in-memory
// examples was TypeScript parsing lib.d.ts on that project's first type query. It now reuses ONE Project,
// giving each example its own virtual root (`ops/conformance.ts#loadInMemoryExample`).
//
// WHY A PIN AND NOT A ONE-SHOT MEASUREMENT. "Conformance still passes" is NOT evidence that an amortized
// substrate is equivalent: a contaminated run can satisfy every mustFlag/mustPass by accident. Only a
// FINDING-level comparison catches it, and it caught two distinct corruption classes:
//
//   1. PATH REUSE (the one that bit). Removing a file and re-creating the next example at the SAME virtual
//      path makes ts-morph's language service serve the PREVIOUS document's snapshot — a re-created
//      SourceFile restarts its script version, so `Identifier.getDefinitionNodes()` comes back empty or
//      pointing at stale positions, and every gate that resolves declarations through the LS silently
//      changes verdict. Measured on baseui-portal-container-seam: fresh `defs=[BindingElement@L6]`,
//      reused-path `defs=[]`. The unique root per example is the fix, and `pathReusingLoad` below is the
//      pre-fix spelling kept as a POSITIVE CONTROL: it must still corrupt, or this pin proves nothing.
//   2. A GATE CACHING ON PROJECT IDENTITY (GATE-AUTHORING §12). A `WeakMap<Project, …>` memo is only ever
//      correct because the substrate happened to throw the key away every example; on the shared Project it
//      serves a previous example's derivation (#751's `detached-work-traced` was a real one).
//      `projectKeyedGate` below plants that class as the second positive control.
//
// The #780 half is also the integration guard for #751: when that branch's `caught-failure-ownership` gate
// lands, its examples join the corpus sweep here automatically — no coupled edit.
//
// ── the corpus is MIXED, and the floor is no longer a number (#1969, 2026-09-11) ────────────────────────
// The equivalence property above is about a SUBSTRATE, not about a descriptor contract, and both runtimes
// amortize the same way: `ops/conformance.ts#loadInMemoryExample` gives each legacy example a unique
// virtual root on one shared Project, and `ops/policy-conformance.ts#runVirtualExample` does exactly that
// for every FINAL policy. So the sweep walks BOTH halves.
//
// It used to assert `compared > 1000` against the LEGACY corpus alone. `loadGates` returns the legacy
// remnant (`lib/loader.ts:190`), which the #1584 program exists to drive to ZERO — so that floor was a
// countdown wearing a gate's clothes: it stood at 749 and falling, red for reasons that had nothing to do
// with the substrate, and re-read as a fresh finding on every verifier pass. Lowering the constant buys
// one batch and re-breaks. The intent was never "at least N": it was "the harness actually compared the
// corpus rather than silently skipping it", so the floor is now EXACTLY that — the sweep's own count must
// equal the eligible corpus count computed outside the sweep, and the corpus must be non-empty. The
// final count shares the sweep's proof selector: this detects skipped execution, not selector omissions. That
// property holds identically at 749 legacy examples, at 2,400 mixed ones, and on the day the legacy
// roster empties.
import { Project } from "ts-morph";
import { loadInMemoryExample } from "../../../../tooling/src/verify/ops/conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

// ── #2333: fixture destinations stay under the owned root ──────────────────────────────────────────────

// ── #780: the in-memory substrate equivalence sweep ────────────────────────────────────────────────────

// ── the two planted corruption classes ─────────────────────────────────────────────────────────────────

const PROBE_AT = "packages/server/src/domain/probe/substrate/probe.ts";

// ── the pins ───────────────────────────────────────────────────────────────────────────────────────────

test("the in-memory substrate reuses ONE Project and never re-creates a virtual path", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const first = loadInMemoryExample(project, { [PROBE_AT]: "export const a = 1;\n" });
  const firstFiles = project.getSourceFiles().map((sf) => sf.getFilePath());
  const second = loadInMemoryExample(project, { [PROBE_AT]: "export const b = 2;\n", "packages/ui/src/probe/probe.tsx": "export const P = () => null;\n" });

  expect(first).not.toEqual(second);
  expect(firstFiles).toEqual([`${first}/${PROBE_AT}`]);
  // The previous example's files are GONE — a gate reads exactly its own example's corpus.
  expect(
    project
      .getSourceFiles()
      .map((sf) => sf.getFilePath())
      .sort(),
  ).toEqual([`${second}/${PROBE_AT}`, `${second}/packages/ui/src/probe/probe.tsx`].sort());
});
