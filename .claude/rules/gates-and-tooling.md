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

- **Read `tooling/src/verify/gates/GATE-AUTHORING.md` IN FULL first.** It is the gate law: descriptor
  contract, coupled sites, exemption grammar, scanRoot formats, conformance mechanics. Constitution
  §0.3 routes gate work there. `.claude/agent-doctrine.md` carries the marker-gate laws, the
  gates-land-on-a-fixed-tree rule, and the exemption-row coupled-site rule — both still apply.
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
