---
kind: law
status: active
updated: 2026-09-23
---

# Core tooling: census hazards and the move playbook

Split off [Core-Tooling-Law.md](Core-Tooling-Law.md) for the 48 KiB law cap.

## 8. Census hazards in the gate corpus

**Any import or dependency census over `tooling/src/verify/gates/**` MUST exclude example-string literals**, or it reports fixture fiction as real dependencies. A gate's `mustFlag`/`mustPass` examples are SOURCE TEXT for in-memory mini-projects: they import specifiers no package resolves and packages the tree never depends on, such as `@orb/client`, which `@orb/tooling` deliberately does not depend on.

The same hazard has a second face: the corpus cites DEAD names deliberately, as fixture strings and as its own exemption-table KEYS. A name-resolution index built over the corpus must exclude the string-literal and object-property-key cases for gate files, or every exemption row vouches for itself.

## 9. The move playbook

The ordered checklist for promoting or relocating a tool. Every step was paid for at least once.

1. **Full-read the monolith before slicing.** Classify each region by NATURE into the five slots: pure derivation → `lib/`, shapes → `contract/`, I/O → `ops/`, argv+dispatch → `cli.ts`, curated exports → `index.ts`. By nature, never by size.
2. **Consumer census BEFORE homing** anything the tool drags along ([Core-Tooling-Law.md](Core-Tooling-Law.md) §2.4). The classification is a hypothesis; the importer census is the verdict — and this applies to DATA files, not only to code (a data file's consumers can prove it belongs in `packages/`, not in `tooling/`).
3. **Repair the slicer's artifact classes.** A cut landing mid-JSDoc (re-anchor on the opening `/**`); doubled `export export`; helpers duplicated across two slices (one home, delete the copy); an over-cap slice (re-split by nature). **A trailing comment defeats an ends-with-`;` block boundary** and silently swallows the NEXT declaration into the wrong file — a nothing-dropped line count does NOT catch mis-ROUTING, so grep the `lib/` files for `export type|interface` (contract-only vocabulary) as the routing boundary.
4. **Re-derive every depth-derived ROOT constant at its new depth** — `import.meta.dirname` up-counts differ between homes, and AGAIN when the tests relocate.
5. **Break import cycles by construction.** The monolith's implicit layering becomes explicit: shared leaf constants get their own `lib/` module, cross-mode refusal/config helpers get `ops/guards.ts`, the dispatcher lives in `cli.ts`. Cycles die by moving LEAVES DOWN, never by re-merging and never by routing through `index.ts`. A `contract/` importing an OP's exported type is the same bug: the type moves DOWN to `contract/`.
6. **DOM-typed `page.evaluate` bodies become raw strings** ([Core-Tooling-Law.md](Core-Tooling-Law.md) §2.3 — there is no DOM lib). A segmented in-page IIFE is the size-cap case for walker-class strings: one function scope, segment files concatenated IN ORDER, byte-equality of the composition asserted at the split, and the walker CT re-run as the behavioral twin. Never route a cycle or a reorder through the segments.
7. **Exit-contract convergence is a SHARED-VALUE change.** Aligning a tool's historical exits to `_shared/exit-contract.ts` reds assertions in suites nobody would associate with the tool — `rg -n 'toBe\(2\)|exit 2' tests/tooling` and sweep in the same commit.
8. **`cli.ts` enters through `runTool`, and everything the cli dispatches is re-exported from `index.ts`.** The cli consumes the programmatic API it fronts.
9. **Test relocation follows the shared kind and mirror rules** ([Core-Tooling-Law.md](Core-Tooling-Law.md) §3.1). There is no filename manifest to update. Verify native compiler and runner ownership after the move.
10. **Replay [Core-Tooling-Law.md](Core-Tooling-Law.md) §3.2 over the phase's own delta** — the widening protocol is per-change, not one-time.
11. **The sweeps, exact commands** (per moved file and per moved BASENAME; a zero owes a positive control in the same invocation):
    - old-path: `rg -n '<old path>'` over `package.json`, configs, `tests/`, `docs/` — expect zero;
    - CT-side: `rg -n '<old path>' tests/ --glob '*.ct.tsx'` + per-package client tsc when anything test-side imported it;
    - comment/prose cites: `rg -n '<basename>'` repo-wide — live code and `status: active` docs are updated; dated reviews and `history/` are frozen;
    - the OLD ZONE PREFIX across the gate corpus ([Core-Tooling-Law.md](Core-Tooling-Law.md) §3.1's zone-keyed-exclusion row);
    - recipe lines in active docs: a `node scripts/…` invocation becomes the pnpm front door.
12. **Then [Core-Tooling-Law.md](Core-Tooling-Law.md) §6's floor, then the LIVE run.**

### 9.1 Proof idioms that are now standard

- **A stack-free cli proof** is a `file://` base over a scratch fixture page that declares `data-app-ready` on itself (skipping the readiness ceiling), plus a planted `__orb` bridge defining the instrument's INPUT CONTRACT. mustFlag discipline at the cli tier with zero dev-stack dependency.
- **A clean TWIN asserts the PLANTED CLASS's absence, not sterility.** Pin `p1=0` + the absent finding kind + exit 0 — never "no findings", which makes the proof lie the day any unrelated rule grows.
- **`satisfies <RealShape>` on a proof fixture is a live drift guard** — a fixture that desyncs from the real serialized shape fails tsc.
- **A test spying `console.log` goes blind when output moves to the print/warn doors** — the spy must follow the REAL sink.
- **Time BOTH sides warm before calling a regression.** A cold-vs-warm confound reads as a 2× slowdown at tool scale.
- **Never trust a text fixer beyond tsc.** An automated import/export fixer's own despecifier regex mangled a type body (`Map<SkipReason, number>` → `Map<number>`); tsc is the mangle detector.

### 9.2 Orchestrator-side, at every merge

- **A sibling lane's `tests/tooling` test written before the tool-fixtures door existed will red at the barrier** on [Core-Tooling-Law.md](Core-Tooling-Law.md) §4.8. The fix is mechanical rerouting; budget one per live sibling lane.
- **Three-way merges break organizeImports sort in files both sides touched.** Run a scoped `biome check --write` over the merge-touched set and land it as a style commit.
- **A merged sibling's tooling-adjacent dep may need its own knip row** — a lane cannot see a sibling's dep surface.
