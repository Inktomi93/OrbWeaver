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
  - **Read first, in this order, in full:** `docs/design/gate-runtime-standardization.md` (the goal and the
    final `defineGate` contract), `docs/reviews/gate-runtime/exemplars-2026-09-11.md` ("copy these shapes"),
    `tooling/src/verify/contract/policy.ts` (+ `population.ts`, `resource-declaration.ts`), then the
    converted exemplar modules and their family tests, then every assigned gate and its legacy source via
    `git show <sha>:<path>`. **`tooling/src/verify/gates/GATE-AUTHORING.md` is the LEGACY descriptor guide**
    (`scanRoot`, `scopeSafety`, `run` hooks, `ExemptionRow` tables, `check-gates.int` fixtures, the
    registered-gates count; it never mentions `defineGate`): read it only to understand a descriptor you are
    replacing; never copy its shapes or satisfy its coupled-site checklist in a `defineGate` module.
  - **Whole-tree checks are RED by construction mid-migration** (`pnpm check`/`verify`/`check:structure`,
    the lefthook hooks, `check-gates.repo.int.test.ts` throwing in setup). That red is baseline, never your
    defect, never laundered. Your verdict is the SCOPED floor: the family tests you name, `pnpm gate:contract`
    before/after (the corpus total must not rise; zero for each converted module), biome/eslint on touched
    files, `pnpm typecheck --config tsconfig.json`. Commit with `git -c core.hooksPath=/dev/null` and name
    the floor in the message.
  - **Every conversion records a FAMILY decision** in the module header and the report: the shared `lib/`
    reader (module + function) or "singleton"; siblings that are two spellings of one concept MERGE (the
    stronger identity reader wins, with a successor proof for the retired arm); arms that differ in
    authority or severity SPLIT into an ordinary policy plus a hard `-health` sibling with the identical
    `family` string. A theme is not a family.
  - **STOP-IF-MISSING-KIND:** a read outside the seven shipped `GateResourceRequest` kinds, or a needed
    shared reader that is not in `lib/`, stops that module (leave it legacy and armed), reports the exact read
    with file:line, and continues; that refusal is a success and #1930 tracks the gap. Never a private reader,
    walk, cache, scope predicate or exemption grammar behind `defineGate`.
  - **The receipt is a committed family test** under `tests/tooling/verify/gates/` importing every converted
    module and asserting `verifyPolicyProofs([...])` equals `[]`, plus the negative report-identity row for
    every ordinary policy (a marker naming a DIFFERENT policy must not suppress; shape
    `ordinary-visitors-family.test.ts:190-204`) and a frozen-legacy differential for the conversion commit.
    Retiring a private marker vocabulary for `@orb-waive` means COUNTING the live legacy markers (count /
    files / trailing-position) and recording the census in the header; translation of product files is a
    separate lane, never yours.
  - **Every NEW proof row ships with a planted-break receipt** (Opus verifier ruling, 2026-09-11, after two
    Sonnet lanes each shipped one proof that cannot fail): for each new `mustFlag`, negative identity arm,
    or differential row, break the property it claims to guard in a SCRATCH COPY of the module (never the
    tracked file), run the row, record "went red with <message>" in your report, restore. A row that stays
    green under the break is a fence, not a proof — fix the fixture until it discriminates (offsets must
    actually overlap; a wrong-policy marker must reach the `policyId` filter, so pass BOTH policies in
    `knownPolicies` and pair it with a positive same-position arm). A header that claims "this row proves X"
    without that receipt is a defect.
  - **Contract facts that bit:** `report.node` token is an exact slice of the node text; population
    `under: ["x/"]` matches nothing (use `"x/**"`); state in `create`; `ctx.fact()` only in
    evaluate/visitFile/visitors; every anchor inside the policy's own population; `facts: []` explicit;
    direct walks are banned regardless of receiver.
  - **Conversions are program work:** no board row per gate or batch; the orchestrator posts your receipt on
    #1584. Only defects, prerequisites and decisions get rows, and only the orchestrator files them.
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
