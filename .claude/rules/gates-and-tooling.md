---
paths:
  - "tooling/src/verify/gates/**"
  - "tooling/src/**/*.ts"
  - "tests/tooling/**"
---

<!-- Path-scoped rule, split out of `.claude/rules/orchestration.md` on 2026-08-24 (lane
     cb-agent-fleet): these facts only bind an agent actually inside a gate or an instrument, so they
     load when you read one of the paths above instead of costing every lane context at launch.
     ONE HOME each — this file deliberately does NOT restate gate law (`GATE-AUTHORING.md`), the
     build-process floor (`.claude/agent-doctrine.md` § gate/marker laws), or the always-on facts
     (`.claude/rules/lane-standing-facts.md`). It carries only what is specific to running and
     probing these tools. -->

# Gates and instruments — before you edit one

- **GATE-RUNTIME MIGRATION POSTURE (#1584; owner rulings 2026-09-11, binding until the atomic cutover).**
  - **Read first, in this order, in full:** `docs/design/gate-runtime-standardization.md` (THE program guide:
    mixed runtime, state of the tree, proof rules, order of work, per-conversion procedure, dispatch mechanics, and
    the full `defineGate` contract in §12), `docs/reviews/gate-runtime/exemplars-2026-09-11.md` ("copy these shapes"),
    `tooling/src/verify/contract/policy.ts` (+ `population.ts`, `resource-declaration.ts`), then the
    converted exemplar modules and their family tests, then every assigned gate and its legacy source via
    `git show <sha>:<path>`. **`tooling/src/verify/gates/GATE-AUTHORING.md` is the LEGACY descriptor guide**
    (`scanRoot`, `scopeSafety`, `run` hooks, `ExemptionRow` tables, `check-gates.int` fixtures, the
    registered-gates count; it never mentions `defineGate`): read it only to understand a descriptor you are
    replacing; never copy its shapes or satisfy its coupled-site checklist in a `defineGate` module.
  - **Whole-tree checks are RED by construction mid-migration** (`pnpm check`/`verify`/`check:structure`,
    the lefthook hooks, `check-gates.repo.int.test.ts` throwing in setup). That red is baseline, never your
    defect, never laundered. **That list is EXHAUSTIVE: a SCOPED suite red is never baseline — re-derive it.** A scoped
    family test is the verdict this posture promises stays trustworthy, so a red there is a real regression until you
    prove otherwise on a clean tree, dated against the commit that broke it. Paid 2026-09-11:
    `tests/tooling/verify/gates/registry-family.test.ts` sat at 4 failed / 4 passed on main for five days (95 refused
    proof rows across eight policies, broken by `ab675b23b` on 2026-09-10, #1953) because `tests/tooling/**` is
    `--full`-only (#1842) and any red near the migration read as ambient noise. Your verdict is the SCOPED floor: the family tests you name, `pnpm gate:contract`
    before/after (the corpus total must not rise; zero for each converted module), biome/eslint on touched
    files, `pnpm typecheck --config tsconfig.json`. Commit with `git -c core.hooksPath=/dev/null` and name
    the floor in the message.
  - **A CONVERSION'S FLOOR MUST ALSO RUN THE SUITES IT BREAKS THAT ARE NOT ITS OWN (measured 2026-09-11, #1983).**
    `loadGates()` (`lib/loader.ts:190`) returns `corpus.legacy` ALONE, so **every conversion SHRINKS the legacy
    roster** and reds any suite asserting the converted gate's membership. Your floor names your OWN family test and
    structurally cannot see this. **So grep `tests/tooling/**` for the converted gate's id AS A STRING LITERAL and run
    every suite that names it — INCLUDING ids inside committed ledger JSON.** The predicate is *any assertion whose
    expected value derives from the legacy roster*, not just membership: `gate-spelling-twins.int.test.ts` compares a
    two-sided SHRINK-ONLY ledger with `toEqual` and **54 of its 79 gate names have already converted**, so it is red
    with no membership assertion in the file. A grep filtered on membership-shaped matchers misses that shape. These suites sit in the seam the bullet above does not cover — not red-by-construction,
    not in any scoped floor — and `tests/tooling/**` is `--full`-only (#1842), so the break is unobservable. **Three
    instances in one five-day window:** `registry-family.test.ts` (#1953), `gate-ignore-grammar.repo.int.test.ts` (red
    from 2026-09-06, broken by a #1584 conversion), `gate-conformance.repo.int.test.ts:49` (found by this rule at zero
    load). A carrier in such a suite is LEGACY BY REQUIREMENT, so those suites retire at the cutover rather than being
    re-pointed forever. **Beware the false positive:** most `tests/tooling` files naming a converted gate are that
    conversion's own family test and are fine — the ones that bite call `loadGates()`.
  - **Every conversion records a FAMILY decision** in the module header and the report: the shared `lib/`
    reader (module + function) or "singleton"; siblings that are two spellings of one concept MERGE (the
    stronger identity reader wins, with a successor proof for the retired arm); arms that differ in
    authority or severity SPLIT into an ordinary policy plus a hard `-health` sibling with the identical
    `family` string. A theme is not a family.
  - **STOP-IF-MISSING-KIND:** a read outside the **eighteen** shipped `GateResourceRequest` kinds (the set is
    FROZEN — re-derive it from `tooling/src/verify/contract/resource-declaration.ts`, never from a doc; it was
    seven until 2026-09-11 and any prose still saying seven is stale), or a needed
    shared reader that is not in `lib/`, stops that module (leave it legacy and armed), reports the exact read
    with file:line, and continues; that refusal is a success and #1930 tracks the gap. Never a private reader,
    walk, cache, scope predicate or exemption grammar behind `defineGate`.
  - **The receipt is a committed family test** under `tests/tooling/verify/gates/` importing every converted
    module and asserting `verifyPolicyProofs([...])` equals `[]`, plus for each ORDINARY policy the positive
    identity arm (the correct marker at the reported position suppresses; shape
    `ordinary-visitors-family.test.ts:187-196` — the POSITIVE arm ONLY. **`:198-205` beside it is a dead-position
    NEGATIVE arm; §4.2 forbids copying a negative arm into a gate (under `knownPolicies: [policy]` it rides the
    unknown-policy short-circuit and proves nothing), so a range ending at :205 tells you to copy the one shape the
    same rule bans.** And do NOT copy the SIBLING pin at `:207-218` (`empty-state-has-action`): it asserts
    `effectiveFindings` and `waivedFindings` but **omits `authorityAlarms`**, so it would pass an over-broad or
    duplicate marker — both of which ALARM without changing the finding count. The §4.2 triple is all three
    assertions or it is not the arm.) and a frozen-legacy differential for the conversion commit.
    Retiring a private marker vocabulary for `@orb-waive` means COUNTING the live legacy markers (count /
    files / trailing-position) and recording the census in the header; translation of product files is a
    separate lane, never yours.
  - **Proofs: carry the legacy rows, prove identity ONCE, invent nothing you cannot break** (owner +
    verifier, 2026-09-11). The legacy six-arm `mustFlag`/`mustPass` rows carried into the converted module
    ARE the bite proof once `verifyPolicyProofs` runs them in a committed family test — no extra receipt.
    The per-policy identity proof is the exemplar's POSITIVE arm only: the correct `@orb-waive <id>(<pos>)`
    marker at the reported position suppresses (0 findings, 1 waived, 0 alarms). Wrong-policy, stale,
    malformed and over-broad markers are the CENTRAL engine's proof (`ordinary-waiver.test.ts`), run once —
    do not copy a negative arm into every gate; a copied one rides the unknown-policy short-circuit and
    proves nothing. Only when a lane INVENTS a new row for a NEW property (a cross-file index, an
    absent-subject arm) does it owe a planted-break receipt: break the property in a scratch copy, show the
    row went red, restore. A header that claims a row proves something it was never shown to catch is a
    defect.
  - **Contract facts that bit:** `report.node` token is an exact slice of the node text; population
    `under: ["x/"]` matches nothing (use `"x/**"`); **a population fence cannot be falsified by a fixture that admits NOTHING — the run comes
    back a `[population]` TOOL ERROR, not a finding.** A `notUnder` needs a SECOND admitted file beside the one inside
    the subtraction (wave-4 audit), and the rule GENERALIZES to a ROOT fence: a `population: "@x"` falsifier holding
    only the out-of-population file admits zero paths and tool-errors too, so **every population falsifier needs an
    in-population ANCHOR file** (measured 2026-09-11 across four modules); state in `create`; `ctx.fact()` only in
    evaluate/visitFile/visitors; every anchor inside the policy's own population; `facts: []` explicit;
    direct walks are banned regardless of receiver.
  - **Conversions are program work:** no board row per gate or batch; the orchestrator posts your receipt on
    #1584. Only defects, prerequisites and decisions get rows, and only the orchestrator files them.
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
- **Invoke through the `pnpm` rows, never a bare `node tooling/src/<tool>/cli.ts …`.** The bare
  spelling bypasses the workspace-wide heap floor (`nodeOptions: --max-old-space-size=16384` in
  `pnpm-workspace.yaml`) and dies at node's ~4GB self-cap. Paid 2026-08-23: two exit-134 OOMs on a bare
  structure run; `pnpm check:structure` picked up the floor and ran clean. Read the verdict from
  `reports/check-structure.json`, never from scrollback. `reports/check-structure.json` is a symlink to the last run that FINISHED; `pnpm check:show` prints the run id it read, and refuses when this checkout's last run DIED (its in-flight slot outlived its pid).
- **A committed SINGLE-WRITER ledger's freshness belongs on the static bar, not in a vitest suite** (#817).
  `ledgers:fresh` (`pnpm check:ledgers-fresh`, `tooling/src/verify/ops/ledgers-fresh.ts`) re-derives the
  caught-failure census and the test-baseline manifest on every `pnpm check` and names the drifting rows —
  the barrier regen is now the FIX for a red, not a scheduled guess. Its per-ledger door is
  `cli.ts baseline <kind> --check` (derives and diffs, writes nothing).
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
