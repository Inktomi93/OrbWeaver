# tooling-configs

- Paths: `tooling/src/biome-config/`, `tooling/src/stack/`
- Band: S (4,752 code lines, 36 files — tokei, upper end of S)
- Status: in-progress
- Axes: all eight fixed axes. This unit is the biome preset producer (`biome-config`) and the
  dev/prod process supervisor (`stack`). The preset's consumers (root `biome.json` and the
  packages' configs) were reviewed in root-lint-configs; here the question is whether the preset
  itself says true things and whether the supervisor cleans up after itself.

## Sweeps

- Literal sweep (`any|eslint-disable|@ts-|TODO|FIXME`): 13 hits, all the English word "any" in
  comments and refusal messages. Zero hatches, zero suppressions, zero TODOs.
- Sideways/upward relative imports (`--pcre2` needed for the lookaround — plain rg rejects it):
  zero hits. depcruise whole-tree: `✔ no dependency violations found (8524 modules, 53096
  dependencies cruised)`.
- `tests/legacy` cites: zero (rc=1).
- Empty/comment-only catches: zero. Bare `.then(`: one, at `supervisor.ts:59`, deliberately
  un-awaited with a `.catch` and a WHY comment carrying its own ending condition. `process.exit`
  inside stack/: zero live sites (one comment-only mention, which is itself stale — F3).
- Weak-assert sweep (`\.length\)\.toBe|toMatchInlineSnapshot`): zero inline snapshots; three
  `length).toBeGreaterThan(0)` floors, all eyeballed legitimate — `stack-plan.test.ts:20` asserts
  the empty-file-value fallback (non-emptiness IS the contract), `setup.test.ts:105` floors
  "something was prompted" beside a full `toEqual` of the write, and
  `biome-naming-convention.int.test.ts:176` guards a census loop that would pass vacuously at
  zero. No finding.
- Header-claim truthing (the headers here are dense with checkable promises; results):
  - `spawn-plan.ts` "An argv snapshot test pins that": TRUE — three
    `expect(plan.args).toEqual([...SERVER_NODE_FLAGS, entry])` sites
    (`start-plan.test.ts:122`, `index.test.ts:261`, `server-entry.int.test.ts:35`).
  - `cli.ts` exit-code legend 0/1/2/3: matches `floor/cli/exit-contract.ts` exactly; npm wiring
    for `stack`/`start`/`share`/`fixture` all dispatch through `stack/cli.ts` (package.json:20-26).
  - `spawners.ts` "every port from the ONE registry": TRUE — no port literals in stack/ (the lone
    `3000` is a fetch budget in `served-probe.ts:42`).
  - `verdicts.ts:9` "not exported from the package": FALSE — F1.
  - `spawn-lock.ts:3` "prod.ts is an executable script": FALSE — F3.
  - `contract/types.ts:146` "every debug-surface knob foundation/env declares": FALSE — F5.
  - biome-config: `pnpm biome:check` wired into `pnpm lint` (package.json:47-49); `$schema`
    2.6.2 matches the catalog pin (`pnpm-workspace.yaml:49`) but nothing couples them at a bump
    (uncoupled pair, counted under the closed-vocabulary triage item, not filed separately —
    a version string that goes stale degrades editor validation only).
- Archaeology (D141): 6 dated files, 15 issue-number cite lines — extends the cross-cutting
  tooling-package cluster already filed in `units/tooling-floor.md`; not re-filed here.

## Findings

- \[P2] `tooling/src/stack/lib/verdicts.ts:9` + `tests/tooling/stack/index.test.ts:398` — the mirror rationale for `SERVER_DRAIN_MS` is false: it says `SHUTDOWN_DRAIN_MS` is "not exported from the package" (test adds "restated in the kit" — wrong location too), but `packages/server/src/infra/network/index.ts:23` exports it and `verdicts.ts:5`/`ops/prod-down.ts:5` already import `SHUTDOWN_MESSAGES` from that same subpath — the duplicate home exists to dodge a door that was never closed. Fix (ledger-clean, it's a merge not a gate): import the constant from `@orb/server/infra/network` (tooling declares `@orb/server`; depcruise green), delete the mirror, the `DRAIN_MS_RE` source-read pin (`index.test.ts:46,396-403`) goes with it.
- \[P2] `tooling/src/stack/ops/start.ts:30-31`, `tooling/src/stack/ops/prod-up.ts:5` — dead-policy cite, 10th name in the tooling-floor F2 cluster and NOT counted there (that ledger covers floor/ only): ``policy `tooling-child-process-door` `` cited as live with fabricated-sounding "reviewed grant" records (`…:stack-start`, `…:stack-prod-up`); resolves nowhere in dep-cruiser/eslint/knip/biome (five-config grep, rc=1). One more cite at `tooling/src/snap/ops/stage-keeper.ts:17` — belongs to the snap units, counted here so the cluster census stays complete. Fix = rewrite to past tense with the constraint stated (full priority is deliberate because the child IS the app), same shape as the F2 direction.
- \[P3] `tooling/src/stack/lib/spawn-lock.ts:3-8` — the module's WHY header rests on a dead premise: "`ops/prod.ts` is an executable script — it ends in `process.exit(await main())`, so importing it to test anything RUNS it." `prod.ts` is now a module (`runStackProd` imported at `ops/run.ts:18`, switch returns exit codes; zero `process.exit` in all of stack/ outside this comment). The split's real justification (fs mechanics need real-file tests; decisions stay pure in `prod-record.ts`) is already in the same comment, so the module stands — only the sentence rots. Fix: drop the script claim.
- \[P3] Env-key magic strings, three shapes in one unit — `"PORT"` has two exported constant homes
  (`PORT_KEY` at `lib/setup-plan.ts:19`, `PORT_ENV` at `lib/stack-plan.ts:13`; 6 and 8 using files
  repo-wide); `AUTH_MODE_KEY` is redefined at `lib/setup-plan.ts:20` although the file already
  imports from `@orb/contracts/identity`, the home that exports the canonical constant
  (`packages/contracts/src/identity/index.ts:111`) — same name, two definitions, silent drift on a
  rename; and `SESSION_SECRET`/`AUTH_MODE`/`DEV_SEED` are hand-spelled literals in
  `lib/fixture-plan.ts:59-60` and `lib/stack-plan.ts` `PIN_DEFAULTS` while canonical constants
  exist (`packages/server/src/foundation/data-layout/contract.ts:14` `SESSION_SECRET_ENV`) and the
  sibling-import pattern is already established in the same file. The test suite cements the wrong
  home: `tests/tooling/stack/lib/setup-plan.test.ts:10-19` imports `AUTH_MODE_KEY`/`PORT_KEY` from
  tooling's local redefinitions (a canonical rename keeps that suite green), while
  `start-plan.test.ts:11` correctly imports from `@orb/contracts/identity`. Fix: import the canonical constants,
  collapse PORT to one home, keep the `PIN_DEFAULTS` pairs keyed by the imported names.
- \[P3] `tooling/src/stack/contract/types.ts:146-149` — `DEBUG_ENV_KEYS` is captioned "every
  debug-surface knob `foundation/env` declares" but the server declares a fourth:
  `WIRE_CAPTURE_REPLY` (`packages/server/src/foundation/env/record/index.ts:237`). The exclusion
  is deliberate (the server comment documents it: reply prose must be independently off, never
  implied by request capture) but the tuple's sentence states completeness without stating the
  exception, and no door couples the tuple to the server's debug section (grep `DEBUG_ENV_KEYS`
  in `tests/`: only intra-tooling uses). Fix: state the exclusion in the caption; optionally a
  D333-legal ordinary int test diffing the record's debug section against tuple + documented
  exclusions — the `tests/db/schema/enum-tuples.suite.test.ts` habit, not a new framework.

## Verdict

reviewed (2 P2, 3 P3, zero fixed in-unit — log-only kept). Mechanically this is a strong unit in
the floor's best tradition: import direction pristine, contract is the repo's closed-vocabulary
exemplar (every verdict union is a private tuple + exported type), zero empty catches, all three
weak-assert candidates are real behavioral floors, and the biome-config generator is deterministic
with a planted-tree door that proves its own scoped overrides fire. Its rot is again the phase
crime, three ways: a false one-line claim propping up a duplicated constant that the existing
import line disproves (F1); the dead ``policy `X` `` dialect escaping floor/ into stack/ with a
10th dead name and fabricated "reviewed grant" cites (F2); and a completeness sentence over a
cross-package census that went false silently when the server grew a fourth debug knob (F5). The
unit also contributes the sweep's cleanest counterexample-per-finding: where the prose IS coupled
(`spawn-plan`'s argv claim), the pin exists and is true — six of eight header claims verified TRUE
on first probe.
