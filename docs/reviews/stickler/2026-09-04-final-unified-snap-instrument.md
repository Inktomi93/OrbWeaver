---
kind: review
status: active
updated: 2026-09-04
---

# Final unified Snap instrument — stickler review

Verdict: **NOT MERGEABLE.** Ten confirmed findings remain: six P1 and four P2. The final whole-static run was green through lint, types, execution membership, DB, imports, dependencies and docs formatting; its three non-catalog findings were repaired immediately afterward and ledger freshness was re-run green. The separate docs-catalog verified-commit re-attestation is expected after the content commit.

Scope: the current dirty-main implementation of `docs/design/1208-instrument-substrate.md` as the sole rendered-instrument CLI for motion, interaction performance, CPU, boot, React, Lighthouse, requests/HAR, diagnostics, map, heap and filmstrip; typed run facts/artifacts; stateful sessions; scenarios/multi-targets; browser-free reports; and retired `motion-audit`/`perf-meter`/`record` doors. The requested #1315 design-audit absorption slice was excluded.

## Confirmed findings

### P1 — `tooling/src/_shared/proc.ts:98` — restoring an absent process-environment key writes the literal string `"undefined"`, diverting later heap-parser problem reports out of the run

`withProcessEnv` saves `undefined` for a previously absent key and restores it with `environment[key] = previous`. Node coerces that assignment to the string `"undefined"` and leaves the key present. The patched DevTools heap worker treats any truthy `ORB_HEAP_PARSER_PROBLEM_PATH` as a path and appends its JSONL there. After one parser window closes, a later worker can therefore write to a relative file named `undefined` instead of the per-snapshot `.heap-parser-…jsonl` sink; the run-side reader treats its own missing sink as “no problem report.” This both pollutes the repo root and can erase parser warnings from the immutable heap sidecar.

Concrete failure: a long-lived named session or scenario performs another heap-parser operation after the first sink is restored. The worker inherits `ORB_HEAP_PARSER_PROBLEM_PATH=undefined`, writes weak-root diagnostics to `<cwd>/undefined`, while `parsedSnapshot` reads a different unique sink path and can report an empty parser-problem population.

Evidence produced on the final tree:

```text
$ pnpm exec tsx -e '<call withProcessEnv on an initially absent key; print the restored value/presence>'
{"value":"undefined","present":true}

$ wc -l undefined && stat -c '%y %s' undefined
4 undefined
2026-09-04 01:30:40.806233833 -0600 8636
```

The untracked root file contains four DevTools heap `problemReport` JSONL rows. `patches/chrome-devtools-mcp@1.8.0.patch:16-19` writes to the environment value, while `tooling/src/snap/lib/heap-devtools.ts:220-235` interprets ENOENT at the intended unique path as no report. Fix by deleting the key when the prior value was absent, restoring only a real prior string, and add a two-consecutive-sink control that asserts the second report reaches its own sink and no `undefined` path exists.

### P1 — `tooling/src/snap/ops/session-call-watchdog.ts:47` — a timed-out non-page operation is awaited without a second bound, so the watchdog can hang forever and leave the session permanently busy

After the outer deadline fires, the watchdog terminates/reloads the page and then does `await work.catch(...)` before throwing the timeout. That only recovers work blocked in page JavaScript. A heap parser, filesystem operation, CDP command, body read or other non-page promise that never settles remains awaited forever. `serveSerialized` never clears `state.inflight`, never rearms the TTL and never sends the caller’s `done` event.

Concrete failure: a named-session heap/parser/CDP call wedges outside `Runtime.terminateExecution`. The advertised call budget fires, but the client never receives `ORB-LOAD-KILL`; every later caller sees the session stuck busy or blocks behind the still-open first socket.

Evidence produced with the real watchdog and a fake page whose termination/reload/detach all succeed while `run()` never resolves:

```text
$ timeout 2s pnpm exec tsx -e '<runSessionCallWithinBudget(..., () => new Promise(() => {}), 1)>'
exit 124; no "returned" output
```

The design requires a bounded per-call failure and a usable next call (`1208-instrument-substrate.md` §7.1 T17). Make the post-cancellation drain bounded; if work does not settle, poison/restart or close that session with an explicit terminal refusal rather than awaiting it indefinitely. Add a non-page never-resolving control in addition to the current hanging-eval test.

### P1 — `tooling/src/snap/lib/run-bundle-verdict.ts:86` — scenario checkpoint arms disappear from `verdict.arms` because arm selection consults only the outer argv

`snapArmVerdicts` filters the arm vocabulary through `ARM_DEFS[arm].result.enabled(opts)`, where `opts` is the outer `--scenario …` parse. Arms enabled only inside checkpoint argv are present in typed fact batches and have real artifacts, but the immutable verdict/end card omits them. A refused checkpoint arm can therefore make the overall run exit 2 without its owning arm appearing in the verdict.

Concrete failure: a two-checkpoint scenario requests `--filmstrip` in both checkpoints. Both typed facts are passed and both PNGs exist, yet the index advertises only `dead-css`, `app-snapshot` and `shot` in `verdict.arms`; a cold reader cannot establish from the verdict that filmstrip ran.

Evidence produced by the real focused scenario test and the resulting index:

```text
$ pnpm test:scoped tests/tooling/snap/ops/arms/filmstrip.suite.int.test.ts --maxWorkers=1 \
    -t 'scenario checkpoints each own a scoped filmstrip fact and artifact'
Test Files 1 passed; Tests 1 passed | 12 skipped

$ jq '{verdictArms:[.verdict.arms[].arm], filmstripFacts:[...]}' \
    reports/runs/snap/main-3665558-2026-09-04T08-32-44-729Z/run.json
verdictArms = ["dead-css","app-snapshot","shot"]
filmstripFacts = two passed snap-arm-filmstrip-v1 facts
```

Derive the verdict inventory from non-`off` typed facts across all batches (with outer enablement only as a missing-fact refusal belt), and extend the scenario test to assert the immutable verdict and browser-free report, not merely fact/artifact existence.

### P1 — `tooling/src/snap/ops/run-bundle.ts:364` — artifact reconciliation discards the evidence-window axis, cross-linking one checkpoint’s artifacts onto every same-page fact

The linker deliberately calls `scopeMatches` with `window: null`. Scenario filmstrip facts and artifacts also use the same generic `action-tape-through-settle` window in each checkpoint. The final index consequently lists both checkpoint PNGs on each individual checkpoint fact, even though `data.artifact` names only one. Page/context/window filters cannot recover checkpoint ownership from the public artifact references.

Concrete failure: checkpoint `first` and checkpoint `second` each capture a distinct filmstrip PNG. Each fact’s `artifacts` array contains both `first-filmstrip.png` and `second-filmstrip.png`; an agent following the first fact cannot know which immutable bytes belong to it.

Evidence from the same fresh real scenario index:

```text
batch filmstrip-scenario:checkpoint:first
  data.artifact = filmstrip/filmstrip-scenario-first-filmstrip.png
  artifacts = [first-filmstrip.png, second-filmstrip.png]
  scope.window = action-tape-through-settle

batch filmstrip-scenario:checkpoint:second
  data.artifact = filmstrip/filmstrip-scenario-second-filmstrip.png
  artifacts = [first-filmstrip.png, second-filmstrip.png]
  scope.window = action-tape-through-settle
```

The typed-results design requires distinct checkpoint scopes and exact writer→reader identity (`1208-run-index-typed-results.md` §Evidence scope). Mint a checkpoint-specific evidence-window id at the host seam and match all three scope axes during reconciliation; keep only explicit aggregate artifacts as aggregate. The existing passing scenario test is an asserts-the-fake gap because it checks “two facts/two artifacts exist” but never verifies the mapping.

### P1 — `tests/tooling/snap/ops/request-result-truth.suite.int.test.ts:80` — the mandatory request RESULT-truth control is red against the new typed-fact contract

The focused suite constructs only normalized terminal pairs, then expects the immutable requests arm detail to be `requests=0`. The typed-results design explicitly forbids deriving structured arm state from pairs; with no registered request fact, the writer correctly emits the generic `enabled arm emitted no typed fact`. The test is now internally contradictory and the behavioral battery cannot pass.

Evidence on the final tree:

```text
$ pnpm test:scoped tests/tooling/snap/ops/request-ring.test.ts \
    tests/tooling/snap/ops/request-result-truth.suite.int.test.ts \
    tests/tooling/cpu-profile/index.test.ts \
    tests/tooling/snap/ops/run-index-typed-results.suite.int.test.ts --maxWorkers=1
Test Files 1 failed | 3 passed
Tests 1 failed | 15 passed

expected detail "requests=0"
received detail "enabled arm emitted no typed fact"
```

Update the control to register a typed `snap-arm-requests-v1` fact for zero and nonzero populations, then assert terminal-pair bytes stay transcript-only while index/report state follows the typed fact. Do not restore pair parsing merely to satisfy the stale expectation.

### P1 — `.claude/skills/snap-driving/SKILL.md:98` — the active cold-agent instructions still describe the retired browser/session, exit-code and stage topology

The skill says every Snap invocation boots a fresh browser and only a chain/scenario carries state (`:98-103`), classifies argv misuse as exit 2 (`:172-178`, repeated at `:349`), and says there is one fixed stage pair plus `active.json` and no per-lane bands (`:318-338`). Current Snap has named stateful sessions, house exits 2=tool error / 3=misuse, and a multi-band `bands.json` allocator. The changed side-eye role mirrors the bad exit/pointer/stage guidance (`.claude/agents/side-eye.md:174`, `:472`, `:563`), and its generated Codex manifest carries the same text.

Concrete failure: a cold driver follows the skill, refuses to split an interaction across named-session calls, diagnoses an instrument refusal as bad argv, waits for a nonexistent single-band owner, or cites the mutable published alias as stable evidence instead of the immutable index/slot. This fails the §10.8 cold-agent acceptance even if the implementation is correct.

Evidence: full-file read of the final skill/role against `pnpm snap --help`, `UNIFIED-VERIFICATION-DESIGN.md` §3.3/§3.3b and `1208-instrument-substrate.md` §3.2–§3.8. The real invalid replacement probe below exits 3, while the skill says exit 2. Documentation law makes a wrong active instruction a defect, not cleanup (`Documentation-Law.md` “A wrong doc is worse than no doc”). Rewrite the active skill/role around named sessions, band tables, immutable `run.json`, and the 0/1/2/3 contract, then sync the Codex manifest.

### P2 — `tooling/src/snap/lib/run-report-query.ts:191` — `--arm perf` silently hides interaction-performance facts/findings because the public arm name is not normalized

The public CLI flag, artifact producer and historical cold-agent recipe use `perf`, while typed facts use `interaction-perf`. Artifact filtering tolerates the producer spelling, but `findingMatches`, fact rendering and verdict filtering compare `query.arm` exactly. `--problems --arm perf` therefore prints the artifact yet suppresses all perf facts, annotations and arm state.

Concrete failure: a passing perf run contains three non-voting threshold annotations. The intuitive/public filter returns none of them, while `--arm interaction-perf` returns all three. No help row enumerates or explains the internal name.

Evidence:

```text
$ pnpm snap --report .../main-3558311-2026-09-04T08-12-19-495Z/run.json --problems --arm perf
VERDICT passed exit=0
(no FACT, FINDING, or ARM rows; only artifacts)

$ pnpm snap --report ... --problems --arm interaction-perf
FACT ... state=passed
3 FINDING annotation rows
ARM interaction-perf state=passed
```

Normalize the public `perf` spelling to the typed arm or make the accepted arm vocabulary explicit and validate unknown values; apply one normalized value to facts, findings, verdicts, analyzer rows and artifacts.

### P2 — `tooling/src/cpu-profile/cli.ts:8` — the retired `perf-meter` door prints replacements that Snap immediately rejects

The translator strips only `--cpuprofile` and otherwise copies legacy argv verbatim. Legacy `--settle`, `--cycles`, `--jsclick` and `--wheelburst` survive into the printed “REPLACEMENT”, but Snap intentionally refuses those spellings in favor of `--pause`, `--perf-cycles`, `--dom-click` and `--wheel-burst`. The only remaining public purpose of `perf-meter` is therefore broken for normal nontrivial invocations.

Evidence:

```text
$ pnpm perf-meter / --settle 900 --cycles 2 --jsclick '#target' --wheelburst '#list=40:3' --cpuprofile
REPLACEMENT  pnpm snap / --perf --settle 900 --cycles 2 --jsclick #target --wheelburst #list=40:3
CPU PROFILE  pnpm snap / --cpu-profile --settle 900 --cycles 2 --jsclick #target --wheelburst #list=40:3
exit 3

$ pnpm snap <printed replacement>
ARG ERROR unknown flag --settle
ARG ERROR unknown flag --cycles — did you mean --perf-cycles?
ARG ERROR unknown flag --jsclick — did you mean --dom-click?
ARG ERROR unknown flag --wheelburst — did you mean --wheel-burst?
exit 3
```

Translate and consume every accepted legacy value shape, shell-quote the recipe, and add a full-dialect round-trip that feeds the emitted argv to `parseSnapArgs` and requires zero errors.

### P2 — `tooling/src/snap/ops/request-ring.ts:333` — `--request-body` returns the oldest matching body, contradicting the mandated newest-body contract

The ring preserves issue order, then selects with `entries.find(...)`. Two requests to the same endpoint inside a checkpoint window therefore return the first response even when the later response is the state the operator is asking to inspect.

Evidence from the real `RequestRing` on the final tree, with two matching JSON bodies issued in order:

```text
{"url":"http://x/same","kind":"captured","contentType":"application/json","bytes":5,"text":"first"}
```

The authority says `--request-body` prints the newest matching stored body (`1208-instrument-substrate.md:339`). Select from the end and add a duplicate-URL control with distinct bytes; retain the existing whole-body/cap/budget behavior.

### P2 — `tooling/src/snap/ops/run-report-render.ts:72` — every raw fallback is given the Playwright trace viewer, including raw Chromium trace JSON that the command cannot open

Both the browser-free report and end card unconditionally print `pnpm exec playwright show-trace` for `role: raw-fallback`. Boot trace correctly classifies its raw `.trace.json` as a Chromium trace fallback, not a Playwright `trace.zip`, so the advertised copy-paste command is invalid.

Concrete failure reproduced from a real completed boot-trace bundle:

```text
RAW FALLBACK .../boot-trace/snap-boot.trace.json ... channel=chromium-trace media=application/json
VIEW         pnpm exec playwright show-trace .../boot-trace/snap-boot.trace.json
```

The same unconditional viewer exists in `run-bundle-receipt.ts:67-69`. Emit `show-trace` only for `schema/channel=playwright-trace` ZIPs; raw Chromium traces need a truthful label/appropriate viewer or no executable viewer recipe. Add a boot-trace report/end-card assertion beside the existing Playwright-ZIP controls.

## Final verification state

The final whole-static `pnpm check` run exited 1 before three immediate post-run repairs. Authoritative artifact: `reports/runs/verify/main-3667875-2026-09-04T08-33-17-687Z/verify.json`.

- `structure:full` had found two new filmstrip env-read suppressions and the fixed initial-frame clock. The final bytes now read those env values through `_shared/proc.processEnvValue` with no new suppressions and derive `INITIAL_FRAME_TIMEOUT_MS = budget(INITIAL_FRAME_TIMEOUT_BASE_MS)`.
- `ledgers:fresh` had found one moved caught-failure ownership row. After regeneration, a fresh `pnpm exec node tooling/src/verify/cli.ts ledgers-fresh` passed both ledgers (`2327` test-baseline rows; `528` caught-failure rows).
- `docs:catalog` found the expected post-content-commit verified-hash/verified-commit re-attestation debt plus stale generated `docs/catalog/catalog.json`; the orchestrator explicitly classified that verified-commit portion separately.

Everything else in the static tier passed: Biome, ESLint, all five type programs, execution membership, DB baseline, Drizzle migration-chain validation, agent config, depcruise, knip and docs formatting. Per orchestrator direction, the six-minute whole-static battery was not repeated after these narrow repairs; current `git diff --check` is clean.

## Verified clean

- Authority read in full: `.claude/agent-doctrine.md`; `docs/architecture/core/AGENTS.md`; `Core-Laws-and-Precedents.md`; `Core-0-Architecture-and-Structure.md`; `Core-Tooling-Law.md`; `Spine-Testing.md`; `Documentation-Law.md`; `Core-Docs-Formatting-Law.md`; `UNIFIED-VERIFICATION-DESIGN.md`; and all 1,417 lines of `docs/design/1208-instrument-substrate.md` plus the request/typed-results/heap/retention/filmstrip child designs.
- Full-file reads covered the changed/new Snap contracts, arm registry, core run/capture/drive paths, request ring, run index/writer/readers/findings, sessions/daemon/evidence/watchdog, scenario/context/matrix hosts, filmstrip/heap/React/CPU/boot/motion/perf arms, shared browser/network/retention/artifact/upload plumbing, retired CLI doors, user-facing Snap skill/recipes and the relevant tests. The prior final-stickler reports were read only as leads; every retained finding above was reproduced against the final tree.
- Whole-graph structural sweep: `ast-grep run -p '$A.newCDPSession($B)' -l ts tooling/src/snap tooling/src/cpu-profile tooling/src/_shared --inspect summary` scanned 254 files and enumerated every CDP construction site; request/result/filter call-site sweeps scanned 2,935 files. Literal `rg` corroborated each relevant consumer.
- Focused green: `unified-instrument.suite.int.test.ts` + `run-bundle.suite.int.test.ts` — 2 files / 26 tests passed; `run-index-typed-results.suite.int.test.ts`, request-ring unit and cpu-profile barrel rows passed in the mixed focused run; the single filmstrip scenario control passed but failed to assert the two confirmed index contradictions above.
- Focused red: `request-result-truth.suite.int.test.ts` — 1 failing assertion, reported as P1 above.
- Direct probes reproduced the environment coercion, unbounded watchdog, oldest request body, invalid retired recipe, missing `perf` filter rows, wrong raw-trace viewer and scenario fact/artifact mismatch. `git diff --check` was clean at stable HEAD `9301fdf41e54011f670e57b3c326c4e39f118035` (2026-09-04T02:42:30-06:00).
- Existing repaired surfaces inspected clean in this pass: one-shot/named-session request listener ownership and body eligibility/caps; typed terminal pair preservation; shared per-run rate posture on the ordinary run path; recorded-context attach failure cleanup; boot `Tracing.start` rejection cleanup; HAR redaction/correlation; heap capture disable/detach aggregation; non-voting interaction-perf thresholds; map hidden/actionable distinction; React flat chunk inflation and Activity exclusion from active ranking; legacy parser/run deletion.

## Regions not reviewed line-by-line

- `tooling/src/ui-audit/**` and its tests were deliberately excluded as #1315 design-audit absorption, per the task.
- Generated/vendored bulk was inventory-checked rather than read byte-for-byte: `tooling/src/snap/lib/devtools-frontend/**`, `pnpm-lock.yaml`, generated catalog/receipt/state JSON, caught-failure population JSON and catalog research JSON aggregates.
- Product CT/UI changes were read only at the instrument seam; rendered visual/a11y judgment belongs to the completed side-eye lane and was not re-driven here.

## Unconfirmed, low priority

None. Suspicions without a final-tree reproduction or direct control-flow proof were dropped.

## Durable lesson candidate

Index entry: **Process-env restoration — deleting an absent key is not equivalent to assigning `undefined`; Node stringifies the latter and subprocess/worker protocols inherit a live bogus value.**

Body: When a temporary process-environment owner restores a key, branch on whether the prior value existed. Use `delete process.env[key]` for an absent prior key and assignment only for a real string. The falsifiable control must assert both the value and `Object.hasOwn(process.env, key)` after the window, then run two consecutive worker operations so delayed or newly spawned children cannot inherit a bogus relative path.

## Issue summary

Final unified Snap stickler verdict: NOT MERGEABLE — 10 confirmed findings (6 P1, 4 P2); the three non-catalog static-gate findings were repaired after the recorded whole-static run and ledger freshness re-passed, while docs-catalog verified-commit re-attestation remains the expected post-content-commit step. Severity ceiling P1. Durable report: `docs/reviews/stickler/2026-09-04-final-unified-snap-instrument.md`.
