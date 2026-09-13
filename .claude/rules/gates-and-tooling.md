---
paths:
  - "tooling/src/verify/gates/**"
  - "tooling/src/**/*.ts"
  - "tests/tooling/**"
---

<!-- Path-scoped rule, split out of `.claude/rules/orchestration.md` on 2026-08-24 (lane
     cb-agent-fleet): these facts only bind an agent actually inside a gate or an instrument, so they
     load when you read one of the paths above instead of costing every lane context at launch.
     ONE HOME each — the gate-runtime reading router owns current gate law; this file does not restate the
     build-process floor (`.claude/agent-doctrine.md` § gate/marker laws), or the always-on facts
     (`.claude/rules/lane-standing-facts.md`). It carries only what is specific to running and
     probing these tools. -->

# Gates and instruments — before you edit one

- **GATE-RUNTIME PROGRAM POSTURE (#1584; mixed legacy and final policies share one front door).**
  - **Read the canonical router first:** `docs/design/gate-runtime-read-first.md` in full. It assigns the
    standing law (`gate-runtime-standardization.md`), the operating procedure
    (`gate-runtime-orchestrator-playbook.md`), and the current lookup sources. Read the standing law in full
    before changing a gate; read the complete playbook sections governing the operation you perform. Then
    read the relevant contract source (`policy.ts`, `population.ts`, `resource-declaration.ts`), the owning
    module and family test, and the legacy source at its pre-conversion SHA when converting. The archived
    exemplar review is historical evidence, never a copy source. `GATE-AUTHORING.md` is the mechanism-first final authoring guide. Its linked verbatim legacy
    archive explains the descriptor being removed; never copy archived templates into a final policy.
  - **Establish a current baseline; do not exempt new failures as migration noise.** Mixed-runtime work may
    inherit known whole-program failures, but no command is red merely because conversion is active. Read
    the finished artifact and distinguish pre-existing findings from new findings, tool errors, withheld
    owners, and changed effective counts. A scoped suite failure is a regression until re-derived on a clean
    tree. A whole-program failure is also owned when the current change introduced or changed it.
  - **Run the floor that owns the changed behavior.** This includes the policy's declared proofs, its family
    controls, `pnpm gate:contract` before and after conversion, lint on touched files, and every affected
    native TypeScript program selected from the generated world/config intent—not a blanket root-tsconfig
    substitute. Whole-corpus conformance and other serialized train checks belong to the orchestrator at a
    quiescent merge boundary as the playbook specifies. Record the exact commands, results, and commit.
  - **Sweep coupled legacy-roster assertions.** A conversion shrinks the legacy roster returned by `loadGates()`, so search
    `tests/tooling/**` for the gate id as a string and run every assertion whose expected value derives from
    that roster, including ledger-backed equality. Do not filter the search by matcher spelling: a `toEqual`
    ledger and a membership assertion are the same coupling. For ordinary words such as `population` or
    `registry`, narrow by module specifier and state the predicate used. Keep legacy-only harnesses while they still test remaining legacy owners; retire them when successor
    evidence covers their final owner. Do not repoint them indefinitely.
  - **Keep conversion ownership atomic.** The conversion commit records the family/reader or singleton
    decision, carries or replaces every proof, and translates that gate's live product/test markers in the
    same lane and commit after the owner becomes final. Reconcile marker counts per file and classify dead,
    multi-finding, and unwaivable sites; never run a detached product-file translation lane. A stronger
    existing detector means merge with a successor proof; authority or severity differences split into
    siblings with the same family. Missing shared capability with multiple consumers is build work; a
    one-consumer reading need uses an existing admissible shared capability or its gate is deleted. It does
    not justify inventing a private resource kind behind a final gate.
  - **Use the proof owner that can express the claim.** Declared `mustFlag`, `mustPass`, and `mustRefuse`
    rows run through conformance. A family test owns the production-dispatched ordinary identity triple,
    actual central permission and independent authority controls, grant-table/state/receipt assertions a row cannot express, conversion
    differential, and family-specific controls. The reviewed-grant witness rule in the standing law owns the
    synthetic exact-grant rerun of a declared row. A new-property row owes a scratch planted break. A
    narrowing row owes a discriminating cut. `mustRefuse` is optional, nonempty, and matches the policy's
    own refusal text; do not repeat the obsolete claim that proof rows cannot express refusals.
  - **Preserve the fixture boundaries that prevent false proof.** `report.node` positions are authored source
    slices. A population-fence falsifier includes an admitted anchor file; an outside-only or subtracted-only
    fixture refuses for empty population and proves no fence. `under` uses a glob such as `x/**`, state is
    created in `create`, `ctx.fact()` is read only in `evaluate`, every report anchor is
    admitted, `facts: []` is explicit, and gate-local walks remain forbidden.
  - **Conversions are program work:** do not create a board row per gate or batch. The orchestrator records
    the program receipt; only concrete defects, prerequisites, and owner decisions receive their own items.
- **NATIVE CONFIG OWNERSHIP — two mechanisms, do not confuse them (world program #1351).**
  - **GENERATED:** the TypeScript configs. `tooling/src/_shared/type-config-intent.ts` is the source;
    `verify baseline type-configs` writes the world templates and runnable configs, `--check` verifies freshness
    without writing. Package worlds, test kinds, helper homes and ambient scopes determine the generated fields. Never
    hand-edit a generated field; change the intent.
  - **HAND-AUTHORED BUT LIVENESS-GATED:** `biome.json`, `eslint.config.js`, `.dependency-cruiser.cjs`. Nothing writes
    them — deliberately, because "preserve tool-specific rule policy, deliberate grants, public-entry semantics" and
    "a current violation must not generate its own permission". What keeps their hand-maintained path lists honest is a
    gate per config (`biome-grant-liveness`, `eslint-grant-liveness`, `depcruise-grant-liveness`) plus
    `verify/ops/config-snapshot.ts` reading the native loader. A file-exact path in a `biome.json` override `includes`
    that names nothing is a finding, and the arms are two-sided so a stale exemption row is caught too.
  - So "the config is hand-maintained" is NOT a defect here and NOT a missing generator. Reach for the liveness gate,
    not for generation, when a native config's list rots.
- **`biome`'s `noUselessUndefined` fights tsc's `noImplicitReturns`; the house answer is ONE TAIL RETURN.**
  `biome.json` sets `noUselessUndefined: "error"` and `tsconfig.base.json` sets `noImplicitReturns: true`. On a
  function typed `T | undefined` with early returns, `biome check --write` DELETES a trailing `return undefined;` as a
  SAFE fix, and the implicit fall-through is then `TS7030: Not all code paths return a value`. Reproduced end to end
  2026-09-11. Two sanctioned answers already in the tree, prefer the first: restructure to a single tail return
  expression (`baseui-expand.ts:68` calls it "the pass.ts idiom" — an accumulator satisfies both without suppressing
  either), or, where that is genuinely worse, an explicit
  `// biome-ignore lint/complexity/noUselessUndefined: <config> enables noImplicitReturns.` (`pending-guard.ts:76`).
  Do NOT disable the rule: all 8 surviving `return undefined;` sites pass biome today because each one takes one of
  those two routes. **Order your floor biome FIRST, then typecheck** — the reverse reports a green tsc that biome is
  about to invalidate.
- `.claude/agent-doctrine.md` carries the marker-gate laws, the gates-land-on-a-fixed-tree rule, and the
  exemption-row coupled-site rule — the last applies to LEGACY descriptors only.
- **Read a structure verdict from `reports/check-structure.json`, never from scrollback.** It is a symlink to the
  last run that FINISHED; `pnpm check:show` prints the run id it read, and refuses when this checkout's last run DIED
  (its in-flight slot outlived its pid). The heap-floor half of this rule — why a bare
  `node tooling/src/<tool>/cli.ts` OOMs where the `pnpm` row does not — is `lane-standing-facts.md`
  §"Verification floors", which every agent also loads; it was duplicated here and is not restated (paid 2026-08-23:
  two exit-134 OOMs on a bare structure run).
- **A committed SINGLE-WRITER ledger's freshness belongs on the static bar, not in a vitest suite** (#817).
  `pnpm check:ledgers-fresh` enters `tooling/src/verify/ops/ledgers-fresh.ts`; its production dispatch owns
  the checked artifacts and regeneration advice. Read that dispatch for the current coverage rather
  than maintaining a second artifact roster here. A new freshness check owes behavioral controls through
  its registered CLI and the composed stage; a direct helper test does not prove stage registration.
  Re-derive generated artifacts on the quiescent integrated tree when the checker names drift. The retired
  test-baseline manifest has no regeneration step (#2217).
- **A FAMILY TEST OFTEN LIVES UNDER THE WAVE'S NAME, NOT THE GATE'S — so grepping for the gate's FILENAME returns a
  false “no family test”.** Conformance entries for #1584 conversions are routinely filed as `contract-shape-wave-1.test.ts`,
  `simple-visitors-wave-2.test.ts` and the like. **Grep the gate ID as a STRING across `tests/tooling/verify/gates/`**,
  never the filename. Paid 2026-09-11: a lane drafted two headers claiming its family had no test file, caught itself
  before commit, and deleted a duplicate `verifyPolicyProofs` suite it had already written.
- **`tests/tooling/check-gates.repo.int.test.ts` is NOT concurrency-safe with itself** (shared `__g_`
  fixture paths). It must never overlap a sibling lane's floor or a drain battery — during a train it
  is the orchestrator's to run.
- **A GATE PROBE ON A SHARED TREE IS AN ANNOUNCED OPERATION.** On 2026-08-24 a review lane was probing
  `tooling/src/verify/gates/bus-definition-belts.ts` live on main with no way to say so; the next broad
  `git add` swept the probe into a commit and the gate shipped BLINDED — and a blinded gate reports
  green forever, so nothing downstream ever catches it. Prefer a throwaway violation at a scratch path
  (`features/__probe/lib/x.ts`, then `rm`) over editing the gate itself. If you must edit a real file,
  SendMessage the orchestrator the exact paths before you start and again once restored.
- **A tool caught LYING gets its permanent pin, not a probe receipt** (owner, 2026-08-22). The fix
  carries planted positive controls in BOTH directions, makes unsupported query shapes REFUSE loudly
  instead of printing a clean zero, and lands the fixture that reproduced the lie as a COMMITTED
  red-first test in `tests/tooling/<tool>/…` so the regression goes red forever. A lying-tool fix
  without that pin is not done — and the clean-surface re-run must distinguish fixed-false-positives
  from newly-visible real findings.
