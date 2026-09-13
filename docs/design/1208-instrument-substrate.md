---
kind: design
status: active
updated: 2026-09-08
---

# 1208 — the instrument substrate: stateful sessions, per-lane stages, one grammar, arms

> **Status: implemented, final whole-tree verification in progress (owner-directed 2026-09-02, #1208).** Phases 0–3 landed through #1277; the final reconciliation folded #1282, #1287, #1289 and #1290, then completed the remaining F7/F10/T4/T17 and CT run-slot obligations in this document. The accepted seed is a STATEFUL snap (`pnpm snap --session <lane> …`), widened into the substrate every rendered instrument and every browser-driving agent goes through. Every boundary below names its enforcer; a prose-only boundary is a wish. Forks F1–F4 were ruled by the owner on 2026-09-02 (§12.1); the timeout/load policy (§7.1) is an owner addition of the same day.
>
> **Current transition-capture ruling (#1310, 2026-09-03):** Snap's `--filmstrip` run arm owns the
> existing exact page from before its argv action tape through bounded settle and emits one labelled PNG
> contact sheet plus typed facts/artifact scope. The former Record parser/browser/WebM/GIF path is deleted.
> Historical inventories below retain the pre-unification paths as dated evidence, not current executable
> topology.
>
> **THE FOLD IS COMPLETE (#1315, 2026-09-04 — §10.10).** `pnpm snap` is the ONE rendered-instrument argv
> door. `design-audit` was the last sibling and is now the `--design-audit` arm; `motion-audit`,
> `perf-meter` and `record` no longer exist as scripts at all. Owner ruling of the same day: an unlaunched
> product GREP-FIXES a retired spelling rather than keeping a refusal door, an alias table or a retirement
> census, so §4.1's retirement order and every "prints the equivalent recipe and exits misuse" sentence in
> this document are SUPERSEDED — the engine dirs keep a bare `cli.ts` only because the five-slot template
> requires one. Wherever a table below lists five flag dialects or five parsers, read it as the dated
> inventory it is: there is one parser left.

## 1. Pain-point inventory (receipts)

Method for the transcript counts: both accounts' `~/.claude/projects/…orbweaver/**/*.jsonl` + `~/.claude-b/…`, last 14 days, 721 files, every Bash `tool_use` invoking `pnpm snap|design-audit|motion-audit|perf-meter|ct:scoped|ui-audit` or `node tooling/src/{snap,ui-audit,motion-audit,cpu-profile}/cli.ts`, paired with its `tool_result` text: 3015 invocations (snap 1546 · ct:scoped 693 · design-audit 220 · motion-audit 41 · perf-meter 25). Scripts + TSVs: session scratchpad `p-sd-instrument-usage.py`, `p-sd-analyze.py`, `p-sd-analyze2.py`, `p-sd-instrument-usage.tsv`, `p-sd-refusals.tsv`; re-derive with the same method when re-judged. Transcript text was treated as data.

| # | Pain | Receipt (code) | Receipt (rows / transcripts / ledger) |
| - | - | - | - |
| P1 | ONE fixed stage band for the whole box | `tooling/src/snap/lib/stage-plan.ts:15` `STAGE_PORT_OFFSET = 100` → 8888/5273 ("One stage runs at a time"); ONE marker file (`stage-marker.ts:1`, `<main>/.cache/snap-stage/active.json`); `stage-plan.ts:72-94` `bandAccess` = ours / shared-reuse / take-over / refuse | 120 stage-admin calls in 14 days (status 89 · down 28 · sweep 3), 54 on 2026-09-02 alone; 09-02 status reads found a SIBLING's marker idle 37m / 43m / 1h15m (under the 2h TTL: unreapable, so blocked). 4 distinct `--isolated` drivers on 09-02, 5 rendered-instrument drivers in one hour (16:00Z). Bridge 113: a folded lane's stage held the band 76–80 min and blocked three lanes; dispatch ledger 09-02: p-home-perf refused ×3, p-quiet-checked ×1, p-audit-blind ×1, cb-wallpaper-jiggle holding. Hard `STAGE ERROR … held by ANOTHER checkout` lines in transcripts: 2 (08-29, 08-30) — the 09-02 blocks were discipline refusals (status read → CT fallback), costing passes rather than errors. #1163 · #1164 · #1186 |
| P2 | Every invocation boots a FRESH browser; nothing carries between calls | `tooling/src/snap/ops/session.ts:98-142` `launchSnapSession` per run; `_shared/browser.ts:262/269` the one launch site; the skill states it (`.claude/skills/snap-driving/SKILL.md` §4 "Every snap invocation boots a FRESH browser") | 42 identical-command re-runs within 15 min by the same agent (snap 20, ct:scoped 16); a reserveKey CLS payoff is structurally invisible to single-shot snaps (memory `ui-probe-blind-spots-hub`, #1188); the MCP's 39 `evaluate_script` + 34 drive calls in `docs/design/1195-devtools-mcp-retirement.md` §1 were exactly "keep the page, poke it again" |
| P3 | The shared MCP browser leaks emulation across consumers | `.claude/agents/side-eye.md:9` grants the chrome-devtools tools; one browser, one selected-page pointer (memory `ct-test-gotchas-hub`, #1099) | Bridge 114 (owner saw the app at 412×823 DPR 2, a mobile arm's leak), bridge 150 (bottom rail clipped, a "reset" that was itself a leaked 1920×1040 override); memory `chrome-mcp-headless-patch`; owner ruling: own browser per role → superseded by "no in-house browser tool, snap is the one door" |
| P4 | `--base` is a claim about a PORT, not a tree | `snap/ops/flags-handlers.ts:70` `--base` sets a URL and nothing checks who serves it; motion-audit / perf-meter / record have NO stage flags (`motion-audit/ops/parse.ts:30-111`, `cpu-profile/ops/parse.ts:120-146`, `screen-record/ops/parse.ts:51-75`) — only snap and ui-audit own `--isolated/--ref` (`snap/ops/flags-stage.ts`, `ui-audit/ops/stage.ts:15`) | #1186: three AFTER receipts taken off a sibling's tree and discarded; memory `instruments-lie-rendered-audit-hub` "motion-audit has no --isolated/--ref" |
| P5 | Five flag dialects | `snap/ops/parse.ts`, `ui-audit/ops/parse.ts`, `motion-audit/ops/parse.ts`, `cpu-profile/ops/parse.ts`, `screen-record/ops/parse.ts` — see the inventory in §4 | `--help` is an UNKNOWN FLAG (exit 3) on design-audit (20 hits), motion-audit (8), perf-meter (2), ui-audit (4); asked-for flags that do not exist: `--full-page` ×2 (snap has `--full`), `--watch-every` (it is `--every`), `--name` (it is `--out`), `--wait-for-timeout`; `--wait` means a SELECTOR in snap (`flags-handlers.ts:64`) and MILLISECONDS in design-audit (`ui-audit/ops/parse.ts:90`) |
| P6 | A cold stage's first run is not a verdict; the warm stage is torn down at fold | `ui-audit/lib/stage-request.ts:46` `COLD_STAGE_REFUSAL` (measured 14 vs 332 nodes); `snap/ops/drive.ts:59-65` `UNSETTLED_REASON`; `snap/ops/stage.ts:34-44` "warm across runs is the whole feature"; the fold protocol tears the band down (`bridge 113`) | 15 COLD/DEGRADED/readiness refusals; every lane pays install + boot + cold vite (\~55 s+, `stack.sh:104-108`) per fold cycle |
| P7 | Artifact concurrency, three residual holes | `_shared/artifacts.ts:332` unguarded `statSync` in `pruneRuns` (#1029 REFUTED, 80% at 2 concurrent runs / 12 slots, bridge 155); `abandonedRuns` has two readers, both in `tooling/src/verify/ops/show.ts:127,143` — no rendered-instrument reader (#1202); CT `page.screenshot({ path: "reports/snaps/…" })` follows the published symlink into a finished slot (#1201, live collision `tests/client/…/tracker-blocks.ct.tsx:833`) | 159 snap runs on 09-02 took the default artifact name (the `root.png` class #1164 closed by slots); the prune race is the safety layer failing a GOOD run to exit 2 |
| P8 | Teardown cries wolf | `stack.sh:361-363` prints "still has verified survivors after KILL" from `dev_identity clear-absent`; the verdict is only reachable after the file the verb deletes is gone (#1162, memory `instruments-lie-verify-the-verifier`) | 16 of 28 `--stage-down` calls in the window printed the false alarm |
| P9 | Invocation shape fights the worktree guard | the isolation guard refuses `env -C <wt> …`, compound commands and pipes | 173 of 264 error rows are the guard refusing the invocation (`This agent is isolated in the worktree … env …`), 19 more the pipe rule, 16 the CT prefix rule — a substrate CLI must be ONE plain `pnpm <tool> …` |
| P10 | Port literals have no home | 47 literal spellings of 5273/8888/5173/8788 across `tooling/src`, `scripts`, `tests/support`, both playwright configs and `vite.config.ts` (`rg`, devtools-frontend excluded); the fixture is 8790/5175 (`tooling/src/stack/multi-user-fixture.sh`), e2e modes 8796/5181 · 8799/5183 · 8798/5182 (`tests/e2e/support/modes.ts`), model-ab 8901 (`tooling/src/model-ab/ops/serve.ts:4`), CT 3100 (`playwright-ct.config.ts:21`) — hand-picked, never registered | a second stage band today would be a fifth hand-picked pair |
| P11 | Stale premises in the driving docs | `.claude/skills/snap-driving/SKILL.md:9,193,298` and `side-eye-design-review/SKILL.md:243-244,532,550` cite scripts/probes/snap.ts and scripts/probes/\_kit/\* as plain text here because those homes are gone (moved to `tooling/src/{snap,_shared}` at #393); memory `empty-population-vs-broken-probe` says "snap has NO viewport flag" — `snap/ops/flags-handlers.ts:278` has it (85 uses in the window); the #1208 brief names scripts/probes/\_kit/browser.ts (absent — plain text, it does not exist) and `tooling/src/{design-audit,perf-meter}` (the dirs are `ui-audit`, `cpu-profile`) | the \~50% stale-row rate, measured again |
| P13 | Fixed wall-clock budgets and measured rates read as verdicts under load | the inventory is §7.1 (nine budget homes, one test-only mechanism) | 5 browser.int timeouts at loadavg 41 and CT `mount()` timeouts at loadavg 170 on 2026-09-02; #1040 · #1174 · #1222 |
| P12 | Long-lived vite corrupt graph; stage db provenance | memory `long-lived-vite-corrupt-graph`; `snap/ops/stage.ts:146-167` `seedStageData` copies the dev db only into a FRESH stage dir | a `--dirty` stage re-syncs per call (HMR era); a cached stage keeps an older db (`STAGE_DB_NOTE`, `ui-audit/lib/stage-request.ts:24`) |

What the MCP was used for that snap could not do (the arm gaps) is closed in `docs/design/1195-devtools-mcp-retirement.md` §1: Lighthouse (41 calls) and the request log (3 calls). Everything else was "keep the page and poke it" — P2.

## 2. What exists today — the map

Every browser-launching site and every stage-binding site (`ast-grep` over `tooling/src`, `scripts`, `tests`, `playwright`, `packages/client/src/lib`, both `-l ts` and `-l tsx`; positive control = `_shared/browser.ts:262`).

### 2.1 Browser launch sites

| Site | What | Lifecycle | Notes |
| - | - | - | - |
| `tooling/src/_shared/browser.ts:262` `chromium.launch` · `:269` `launchPersistentContext` | THE one legal launch (policy `tooling-browser-door`) | per invocation | persistent-profile arm exists only for the DevTools SDK (`persistentProfileDir` + `--remote-debugging-port=0`, `_shared/devtools-runtime.ts:394`) |
| `launchProbeSession` callers: `snap/ops/session.ts:104`, `snap/ops/materialize-devtools.ts:402`, `ui-audit/ops/run.ts:115`, `ui-audit/ops/matrix.ts:74`, `motion-audit/ops/run.ts:98`, `motion-audit/ops/matrix.ts:47`, `cpu-profile/ops/run.ts:27`, `screen-record/ops/record.ts:25` | 8 tool sites, one launch each | per invocation | the SAME launcher, so contexts, media, shims and capture wiring are already one home |
| CDP sessions: `snap/ops/session.ts:182` (throttle), `_shared/browser-media.ts:76`, `_shared/devtools-runtime.ts:106`, `motion-audit/ops/run.ts:110`, `cpu-profile/ops/run.ts:46`, `ui-audit/ops/hover.ts:334`, `snap/ops/materialize-devtools.ts:200` | 7 tool sites | per page | `newCDPSession(page)` — every arm that needs CDP already reaches it through Playwright |
| `tests/e2e/support/global-setup.ts:198`, `scripts/probes/st-goldens/generate-goldens.ts:255`, 3 `tests/tooling/snap/ops/*.int.test.ts` | runner warm-up / research zone / int tests | test-owned | out of the substrate's scope (a committed proof never depends on the dev stack, `Core-Tooling-Law.md` §4.5) |
| Playwright CT (`playwright-ct.config.ts`, workers 4) · e2e (`playwright.config.ts`, `stack.sh start-fg` per auth mode) | runner-owned browsers | per run | keep their own browsers (§3.9) |
| chrome-devtools MCP (`.claude/settings.json:92-97`, `.claude/agents/side-eye.md:9`) | ONE shared headless Chrome via `--remote-debugging-pipe` | session-wide | retires per `docs/design/1195-devtools-mcp-retirement.md` §2.3 once §6's two arms land |

### 2.2 Stage binding sites

| Site | Binds |
| - | - |
| `snap/lib/stage-plan.ts:9-15,32-40` | the dev ports (8788/5173), the ONE offset, `stagePorts()`, `stageBaseUrl()` |
| `snap/ops/stage.ts:212-258` `bootStage` | `PORT`, `VITE_PORT`, `VITE_API_TARGET`, `DATABASE_URL`, `ASSETS_DIR`, `ENGINES_POSTURE=adopt-only`, `ORB_ENV_NO_FILE`, the two DB-bound keys, a minted `DEBUG_TOKEN`; boots `tooling/src/stack/stack.sh start` at FULL priority (`spawnFullPrioritySync`, the census'd exception) |
| `tooling/src/stack/stack.sh:92-100` | reads `PORT`/`VITE_PORT`/`VITE_API_TARGET`; `STACK_RUN_DIR` for a second stack from one tree (`:75-82`) |
| `snap/ops/stage-marker.ts`, `stage-status.ts`, `stage-probe.ts` | the one marker, status/down/sweep, port-owner probes (`ss -tlnp`), stage-rooted fence (`.cache/snap-stage/` in cwd or argv) |
| consumers: `snap/ops/guards.ts:90`, `ui-audit/ops/stage.ts:45` (`ensureStage` through `#snap`'s front door, #678) | two |
| `tooling/src/stack/multi-user-fixture.sh` (8790/5175), `tests/e2e/support/modes.ts` (three pairs), `model-ab/ops/serve.ts` (8901), CT 3100 | siblings on hand-picked ports, unregistered |
| `_shared/artifact-out.ts` `withInstrumentRun` (5 callers: the five rendered clis) · `_shared/artifacts.ts` `openRunSlot`/`publishRunSlot`/`abandonedRuns` | per-run slots (#1029/#1164) |
| `_shared/nav.ts` (6 `__orb.nav` verbs) · `_shared/page-validate.ts` · `_shared/appearance.ts` (`page.route` settings shim) · `_shared/theme.ts` | the page-side contract every probe drives |
| `_shared/devtools-runtime.ts` + `snap/lib/devtools-frontend/` (479 resources, 9.85 MB, pin Playwright 1.61.1 / Chromium 149.0.7827.55 / CDP 1.3) | the vendored DevTools SDK: a hermetic loopback asset server + `inspector.html` attached to the product page over the ephemeral debugging port. USED ONLY by `--cascade` (`snap/ops/cascade.ts`) and the appearance-invariant matrix (`snap/ops/session.ts:101` `requireCascadeRuntime`). It is the CSS cascade oracle, not Lighthouse and not a general DevTools |

### 2.3 The duplication, named

- **Two boot paths for one browser shape.** The DevTools SDK runtime already launches the persistent-profile + debugging-port browser the session needs (`devtools-runtime.ts:382-396`); the plain path launches without it. A session is that runtime kept alive.
- **The scenario IS a session with file-fed checkpoints.** `snap/ops/scenario.ts:67-95` `inheritScenarioSession` already partitions flags into session-level (base, vnc, debugToken, failureEvidence, strictConsole, viewport, device, colorScheme, media, appearance, theme, cascade, probe, ls) and checkpoint-level (route, actions, evals, captures, out); `scenario.ts:225` `keepLivePage` already drives a live page without re-navigating (`PagePlan.navigatePage`). The session reuses that partition byte-for-byte (§3.3).
- **Two readiness ladders.** `snap/ops/drive.ts:41-55` (`settled|degraded|dataless|absent`) and `ui-audit/ops/drive.ts:86-90` (boolean) — the stage health verdict in §3.6 consumes the snap ladder plus the served-module probe (`tooling/src/stack/ops/served-probe.ts`) rather than minting a third.
- **Five parsers spelling four shared families the same way** (nav / appearance / theme / panel presets are already shared tables — `_shared/nav.ts:28-42`, `_shared/appearance-flags.ts`, `_shared/theme.ts`, `_shared/panel-flags.ts`) and the rest differently (§4).
- **Port literals in five homes** (P10) with no registry — the first thing N bands would collide on.

## 3. The substrate model

Four nouns, each with one home and one enforcer.

| Noun | Meaning | Home | Enforcer |
| - | - | - | - |
| **stage** | a served app (server + vite + its own db/assets) at a REF or the dirty tree, on a registered port BAND, owned by a checkout | `tooling/src/snap/{ops,lib}/stage*` (stays snap-owned; consumers enter through `#snap`) | gate `tooling-front-door` (sibling tools import `#snap` only); the band registry test (§3.6) |
| **session** | a live browser process + its contexts/pages + capture rings + shims, owned by a lane, bound to ONE stage or base URL, served by a daemon behind a unix socket | `tooling/src/snap/ops/session-daemon.ts`, `session-client.ts`, `contract/session.ts`, `lib/session-plan.ts` | gate `tooling-shared-plumbing` arm B (one launch site) + new arm H (one ATTACH site, §3.4); the session marker IS a run slot (`abandonedRuns`, §3.8) |
| **context** | a Playwright BrowserContext inside a session (cookies, storage, emulation, media, shim) — the unit of isolation | `_shared/browser.ts` (`buildContext`, unchanged) | Playwright physics: a context cannot see a sibling's storage/emulation; planted control T1 (§8) |
| **arm** | a capability that runs against a page and publishes evidence (shot, aria, map, eval, contrast, cascade, dead-css, assertions, perf, requests, lighthouse, trace, meter, walker) | `snap/contract/arms.ts` registry + `snap/ops/arms/<arm>.ts`; sibling instruments host their walker/trace/meter arms and ATTACH to a session | `Record<Arm, ArmDef>` — a new tuple member fails `tsc` until every site is filled (`Spine-TypeScript-and-Patterns.md` §string-union dispatch) |

### 3.1 The invariants (what the design must make true)

1. **Bash is the one door.** No MCP in any agent definition or skill; every capability is a `pnpm <tool> …` flag. #1279 records the later owner ruling that a new `agent-def-no-browser-mcp` fs gate would be enforcement theatre after the plugin and grants were removed. The durable control is the standing rule: reaching for a browser MCP means snap has a gap, so name the gap and build the arm (`1195-devtools-mcp-retirement.md` §2.3).
2. **A lane's browser is private by construction.** One session per lane name, owned by the booting checkout; contexts are Playwright contexts; a call from another checkout is refused naming the owner (§3.5). Enforcer: `session-plan.ts` `sessionAccess()` (pure, pinned) + the T1 planted control.
3. **A lane's stage is private by construction.** N bands from a registry; a stage row names its owner; foreign use is `shared-reuse` (same sha, read-only) or refusal — the #108 rules, generalized from one row to a table (§3.6).
4. **One implementation.** The one-shot `pnpm snap <route> …` and `pnpm snap --session x <route> …` run the SAME ops; the daemon is a host for `runOnSession()`, never a second capture path (§5).
5. **Honest exits.** `EXIT.toolError` (2) on every "I could not measure": dead session, dead stage, cap reached, foreign owner, band exhausted, TTL-reaped mid-op. Enforcer: `_shared/run-tool.ts` (unchanged) + `printVerdict` denominators + the T2/T4 controls.
6. **Every byte a call writes lands in that CALL's run slot** (`withInstrumentRun` in the client cli, unchanged arm G); session-lifetime evidence (request ring, console ring, HAR/trace) lives in the session dir and is EXPORTED into a slot on demand (§3.7).
7. **Load is bounded.** Session cap, stage cap, idle TTLs, lazy reap-on-acquire, the nice-19 floor for every daemon (`spawnNicedChild`), full priority only for the stage stack (the census'd exception) (§7).

### 3.2 Process topology

```text
lane shell ── pnpm snap --session p-x <route> --eval … ──► session-client (this process)
                                                          │  parses argv (ops/parse.ts — ONE home)
                                                          │  opens ITS run slot (withInstrumentRun)
                                                          │  connects <main>/.cache/snap-session/p-x.sock
                                                          ▼
                                       session-daemon (niced node, own pgid, TTL timer)
                                       owns: launchProbeSession() browser · contexts · shims · rings
                                       exposes: unix socket (snap ops) + CDP endpoint (sibling attach)
                                       runs: runOnSession(session, args, plan) → lines + exit
                                                          │
                                                          ▼
                                       stage p-x (band k: server 8888+10k · vite 5273+10k)
                                       worktree at <ref> under the OWNING checkout, own db/assets
                                       booted by stack.sh start (full priority), registered in bands.json
```

- The daemon is spawned by the first `--session <name>` call through `_shared/proc.ts` `spawnNicedChild` (own process group; killable by `killGroup`; the existing detached door). Its entry is `node tooling/src/snap/cli.ts --session-daemon <name>` — a cli verb, so it enters through `runTool` and reads argv in `cli.ts` only (gate `tooling-argv-front-door`).
- The socket path is repo-keyed like the stage marker (`markerRoot()` = `git rev-parse --git-common-dir`'s parent, `stage-marker.ts:19-24`), so a session is reachable from every worktree of the repo and the path stays under the 108-byte unix-socket limit (`<main>/.cache/snap-session/<name>.sock`).
- Sibling instruments (`design-audit`, `motion-audit`, `perf-meter`, `record`) attach to a session's browser over its CDP endpoint from THEIR OWN process (§3.4); they never import snap's ops (the front-door law: `#snap` exports `attachSession(name)` and nothing under `ops/`).

### 3.3 Session flag partition (the scenario partition, reused)

`snap/ops/scenario.ts:67-95` already decides what is session-level and what is per-checkpoint. A session adopts it unchanged; a per-call flag that names a session-level property is refused exactly as a checkpoint is today (`scenario.ts:102-116`).

| Level | Flags | Set when |
| - | - | - |
| session (boot only; a later call carrying one REFUSES, exit 3) | `--base` / `--isolated` / `--ref` / `--dirty` / `--fresh` (WHERE) · `--viewport` / `--wide` / `--mobile` / `--desktop` / `--scale` · `--dark` / `--light` / `--reduced-motion` · `--appearance*` / `--full-motion` / `--theme` · `--cascade` (needs the debugging-port launch) · `--probe` · `--local-storage` · `--vnc` · `--debug-token` · `--no-failure-evidence` · `--strict-console` · `--session-ttl <min>` · `--contexts N` / `--as` (the fixture sidecar) | `--session <name>` first call |
| call | route (optional — absent = the live page) · the argv-ordered action queue · `--eval` · `--text`/`--aria`/`--map`/`--contrast`/`--expect-*` · `--shot-of`/`--crop`/`--mask`/`--full`/`--no-shot` · `--out`/`--json` · `--watch`/`--every` · `--checkpoint` · every arm (§6) | every call |
| admin | `--session-status [name]` · `--session-close <name>` · `--session-sweep` · `--session-export <name>` | any checkout; foreign LIVE sessions need `--force` (the #447 teardown-consent rule, `stage-plan.ts:232-242`, applied to sessions) |

A call with no route and no action against a page that has never navigated is refused (exit 3): a session boots to `about:blank`; the first call names the route. `--watch` keeps its page-0 semantics; `--pages N` is a session property (tab count) and `@N` targeting is unchanged.

### 3.4 Daemon protocol (unix socket, NDJSON, versioned)

```ts
// tooling/src/snap/contract/session.ts (shapes only; zod at the seam)
interface SessionRequest {
  readonly v: 1;
  readonly kind: "call" | "status" | "close" | "export" | "ping";
  readonly runId: string;          // the CLIENT's run id — the daemon writes into the client's slot
  readonly slotDir: string;        // absolute reports/runs/snap/<runId>/
  readonly argv: readonly string[]; // raw; re-parsed in the daemon by parseSnapArgs — validation has ONE home
  readonly cwd: string;            // for path-shaped --out / --file resolution
  readonly checkout: string;       // caller's repo root — ownership check
}
type SessionEvent =
  | { readonly kind: "line"; readonly text: string }          // stdout lines, streamed in order
  | { readonly kind: "warn"; readonly text: string }          // stderr lines
  | { readonly kind: "done"; readonly exit: number; readonly pairs: readonly (readonly [string, string | number])[] };
```

- One request at a time per session (`busy` refuses a second caller with the in-flight op and its age — two lanes driving one page is the shared-tab defect wearing a socket).
- The client prints events verbatim, so the RESULT line stays last and `tail -1` / `grep ^RESULT` keep working; the client's exit code is `done.exit` through `runTool` (never-downgrade lattice unchanged).
- `ping` carries the heartbeat and resets the TTL; every `call` resets it; `status` does not.
- Sibling attach: `status` answers `{ cdpEndpoint, pages: [{ index, url, title }], stage: { band, ports, sha }, owner, idleMs }`; `_shared/browser.ts` gains `attachProbeSession(endpoint)` (`chromium.connectOverCDP`) — the ONE attach site, gate arm **H** (a `connectOverCDP(` outside `_shared/browser.ts` is RED). The daemon keeps route shims and rings on ITS connection; an attached sibling wires its own capture for the duration of its run (today's one-shot semantics, nothing lost).

### 3.5 Session lifecycle (the state machine)

```text
absent ──(first --session x)──► booting ──► ready ◄──┐
                                   │          │       │ call done / ping
                                   │          ▼       │
                                   │        busy(op) ─┘
                                   │          │
                                   │          ├──(SIGTERM / --session-close)──► closing ──► closed(marker cleared)
                                   │          ├──(idle > TTL)──────────────────► closing
                                   │          └──(daemon dies)────────────────► dead (marker outlives pid — LOUD, §3.8)
                                   └──(launch/stage failure)──► closed + exit 2 on the caller
```

Ownership: `session.json` in the session dir records `{ name, ownerCheckout, daemonPid, pgid, socket, cdpEndpoint, stage: { band | null, baseUrl }, bootArgv, createdAt, lastUsedAt, lastOp, ttlMs }`. Access (pure, `lib/session-plan.ts`):

| Caller vs owner | live | dead |
| - | - | - |
| same checkout | `ours` — drive it | `reclaim` — reap, clear, reboot |
| other checkout | `refuse` (name owner, pid, idle age; remedies: wait / `--session-close --force`) | `reclaim` |

`--session-sweep` reaps: dead sessions (marker outlived pid), idle > TTL sessions (group kill, stage ref released), orphan session dirs. A LIVE session under TTL is reported, never touched — the #310 liveness-gate lesson.

### 3.6 Stages: N bands, registry, TTL, lazy reap (absorbs #1163)

**Band registry, one home.** `tooling/src/_shared/ports.ts` owns every port literal the tooling tree, the fixture, the e2e modes, model-ab and CT spell today (P10): the dev pair, `STAGE_BANDS = [0..9]` → server `8888 + 10k`, vite `5273 + 10k` (no member touches 8790/5175, 8796–8799/5181–5183, 8901, 3100, 8701–8703 — a unit test proves disjointness), and RESERVED rows for the fixture/e2e/model-ab/CT pairs so `--stage-status` lists them and nothing can be allocated onto them. Enforcer: a new gate arm in `tooling-shared-plumbing` (**I**: a numeric port literal in `tooling/src` / `tests/e2e/support` / `playwright*.config.ts` outside `_shared/ports.ts` is RED; scan-and-allowlist).

**The marker becomes a table.** `<main>/.cache/snap-stage/bands.json`: one row per band `{ band, serverPort, vitePort, sha|"dirty", dir, checkout, ownerPid, startedAt, lastUsedAt, sessions: [names], dbProvenance: { copiedFrom, copiedAt, devDbMtimeAtCopy }, rsyncs }`. `readActive/writeActive/touchActive/clearActive` become row verbs keyed by band; the old `active.json` is read ONCE as a legacy row and deleted (no compat shim — `Core-Tooling-Law.md` §1). `bandAccess` (`stage-plan.ts:72-94`) keeps its four verdicts per row; allocation = the caller's own row for (checkout, sha) → a `shared-reuse` row at the same sha → the lowest FREE band → the lowest `stranded` band (lazy reap-on-acquire, #1163 arm a) → exit 2 naming every row with idle ages when the cap/range is exhausted.

**TTL, both arms of #1163.** `lastUsedAt` is stamped by every `ensureStage`, every session call bound to the band, and every attached sibling run (interaction = any request through the substrate, not only snap CLI calls). A stage with live session refs is never a strand. Defaults: session idle 30 min, stage idle 60 min (`ORB_SESSION_TTL_MIN`, `ORB_STAGE_TTL_MIN`) — owner fork F5.

**Arm (b) AS BUILT (#1163, 2026-09-05) — the ruling survives, its INPUT changed.** This section used to place the active timer inside the session daemon ("it already has a clock") and argued that a stage with NO session needs only arm (a) because "no extra daemon exists to leak". The owner re-raised the row on 2026-09-05 — *"there's supposed to be a whole mechanism, not just 60 minute idle"* — against this measurement: six of ten bands held, bands 0/1/2 stranded 2h56m / 4h51m / 1h37m with live `node --watch-preserve-output` stacks resident and `sessions: none` on every row, inside a loadavg of 50–83 on 24 cores that made three sibling lanes refuse to render a verdict. Every lane that afternoon drove `snap --isolated --ref <sha>` with no `--session`, so the daemon's clock never existed for any of them, and no lane was ever refused a band, so arm (a) never fired either. The mechanism that section defended is intact — **no second reaper was built, and the daemon still only RELEASES its band on session expiry** — but the CONDITION changed: the clock belongs to the BAND, not to whichever process happens to be driving it.

- **The keeper.** `ensureStage` arms one detached, niced, own-pgid child per band at its single exit (`ops/stage-keeper.ts` `armStageKeeper` → `spawnNicedChild(node cli.ts --stage-keeper <band>)`; the argv front door stays `cli.ts`, and `--stage-keeper` is an INTERNAL flag beside `--session-daemon`). Idempotent: a warm reuse whose keeper is alive spawns nothing.
- **Re-arming is FREE because the keeper POLLS the row** (`keeperPollMs` = TTL/10, floored 200 ms, ceilinged 60 s) rather than holding a resettable in-memory timer. Every write the substrate already makes re-arms it with no new coupling: `touchRow`, `bindSessionToBand`, `touchSessionHeartbeat`, an attached sibling run.
- **The third interaction signal is a CONNECTED CLIENT** (`ops/stage-probe.ts` `foreignBandPeer`, one `ss -tnp state established`): an established connection to a row's port from a process that is not one of the stage's own. Without it a 90-minute one-shot drive — which calls `ensureStage` ONCE and then holds a browser for an hour — would be reaped mid-run, because nothing writes the table in between. Unidentified and off-box peers count AS connected.
- **What it refuses:** a row naming a RESERVED port (the dev pair, the fixture, an e2e mode) is exit-2 with nothing touched; a row that is gone, or now names a different LIVE keeper, is RELEASED without acting; a row whose recorded keeper is dead is ADOPTED (the arming race, and the self-heal after a kill).
- **It is never a fence.** Nothing consults `row.keeper` before reaping, so arm (a) and `--stage-sweep` reclaim a band whose keeper died exactly as before — pinned in `tests/tooling/snap/lib/stage-bands.test.ts`. The asymmetry is deliberate: the allocator reads `lastUsedAt` alone because it only fires under band PRESSURE; the timer fires under none, so every uncertainty resolves to `wait`.
- **Which arm ended a stage is now recorded** (`ops/stage-reap-log.ts`, a bounded 20-row ledger beside `bands.json`): `timer` · `acquire` · `sweep` · `down`. `--stage-status` prints it plus each row's remaining timer, because a reaped band leaves no row and "free" would otherwise be indistinguishable from "taken from a lane ninety seconds ago".
- Proofs: `tests/tooling/snap/lib/stage-keeper-plan.test.ts` (the rules) and `tests/tooling/snap/ops/stage-keeper.int.test.ts` (the shipped keeper process against a planted loopback stage on EPHEMERAL ports — never a real band, never a booted stack).

**Health = three probes, one verdict.** `stageHealthy` (`stage.ts:86-88`) becomes `healthz ok` ∧ `vite answers` ∧ `served-probe fresh` (`tooling/src/stack/ops/served-probe.ts`, reached as a `stack.sh` verb) — a dead-watcher stage reads `degraded`, never `warm`. A `--dirty` stage additionally carries an ERA rule: `rsyncs > 20` or age > 6 h ⇒ `rebuild` (the long-lived-vite corrupt-graph class; a `--ref` stage never HMRs and is exempt).

**Teardown honesty (#1162).** `stack.sh:361` prints the survivors line unconditionally after a clean stop because `dev_identity clear-absent` can only succeed once the pidfile it deletes is gone; fix at the launcher (verify group death by pgid before the identity verb, print "waiting for group exit" while it retries), with a planted control: a genuinely surviving child (a `sleep` re-parented into the group) MUST still produce the loud line.

**`--base` fencing (#1186).** A `--base` whose port is a registered band asserts ownership: the row's checkout must be the caller's (or the row is `shared-reuse` at the same sha) else exit 2 naming both; a `--base` on a reserved/foreign row prints which. The session model makes bare `--base` rare: `--session x --isolated --ref <sha>` binds by construction, and sibling instruments inherit the binding from the session.

### 3.7 Artifact slots (integrates #1029 / #1164 / #1201 / #1202)

- **Per call, one slot** — the client opens it (`withInstrumentRun("snap", …)`, arm G unchanged) and passes `slotDir`; the daemon's `artifactDir/artifactFile` resolve into it (`_shared/artifact-out.ts` `beginInstrumentRun` gains an explicit-slot form; `activeRun` stays one-per-process in the CLIENT). A red call publishes; a crashed call leaves `.inflight`.
- **The session is a run slot too**: instrument `snap-session`, `runId` = the session name + boot stamp, `.inflight` marker pid = the daemon pid. Its dir holds `session.json`, the request ring, the console ring, HAR/trace when enabled. `abandonedRuns(root, "snap-session")` therefore lists dead sessions with ZERO new marker machinery (#1202's "reuse, do not re-spell").
- **`--session-export <name> [--out base]`** copies the rings/HAR/trace into a fresh call slot and publishes pointers (`reports/sessions/<name>/…`) — the only path from session-lifetime evidence to `reports/`.
- **Prune race** (#1029 refuted): the `statSync` in `pruneRuns` (`artifacts.ts:332`) is guarded like every other per-slot reader — a vanished slot is "nothing to prune". Pin: a pre-planted 12-slot ring + deadline-synchronized concurrent publishes (the two preconditions the existing pins lack, memory `prune-ring-statsync-is-the-concurrency-hole`).
- **CT writes** (#1201): a planned helper, tests/support/node/snap-out.ts (planned), exports `ctSnapPath(name)`, which resolves into the CT run's own slot (`reports/runs/ct/<runId>/snaps/`); the CT flaky reporter publishes the pointers at the end of the run; a gate arm (`no-direct-reports-write`: a `reports/` path literal handed to `screenshot({ path })` in `tests/**`) REDs the direct spelling. Writes never target the alias, so the symlink is never followed.

### 3.8 Crash recovery and the loud marker (absorbs #1202)

Every `--session <name>` call, `--session-status` and `--stage-status` read `abandonedRuns(root, "snap-session")` first. A dead session prints and exits 2:

```text
SESSION DEAD   p-home-perf died at 2026-09-02T17:41:03Z mid-`--goto settings:appearance --eval …` (daemon pid 2201127 gone; band 2 :8908/:5293 still bound by pid 2201140)
               remedies: `pnpm snap --session-sweep` reaps the browser group + releases band 2; re-run `--session p-home-perf …` to reboot
```

Never a silently-resolving pointer: the client's own slot for that call keeps its `.inflight` marker (it never published), so `reports/snaps/<name>.png` still names the previous COMPLETE run — and the SESSION line above is what a reader sees first. A stage that dies mid-drive (server or vite exits) is detected by the daemon (the leader's `wait -n` teardown, `stack.sh:322-329`, unbinds the band; the daemon's per-call nav fails with `ERR_CONNECTION_REFUSED`) and marked `stage: dead` in `session.json`; the NEXT call refuses (exit 2) naming the stage, the time and the op — T4 in §8 plants exactly this.

### 3.9 Where the CT browser belongs

The CT runner keeps its own Playwright browser and worker pool (`playwright-ct.config.ts:41` workers 4, its own cache rebuild, its own reporter). What the substrate gives it: the port registry (its 3100 is a reserved row), the slot helper for `reports/snaps` writes (§3.7), and NOTHING else — a CT is a committed proof, not a lane's live drive, and coupling it to a daemon would make the static tier depend on a live process. The e2e modes likewise keep `stack.sh start-fg` per mode and register their pairs.

## 4. The unified CLI grammar

### 4.1 The five pre-fold dialects (inventory, frozen)

Every column but `snap` names a tool that no longer exists: #1315 folded all four into snap arms and
deleted their argv doors, so the spellings below are a record of what the migration started from, not
vocabulary a reader can type. The live grammar is §4.3 plus `pnpm snap --help`.

| Family | snap | design-audit (`ui-audit`) | motion-audit | perf-meter (`cpu-profile`) | record (`screen-record`) |
| - | - | - | - | - | - |
| help | `--help`/`-h` | none (exit 3 + help) | none | none | none |
| where | `--base`, `--isolated/--ref/--dirty/--fresh`, `--file`, `--fixture-*` | `--base` (explicit-conflict check), `--isolated/--ref/--dirty/--fresh` | `--base`, `--url` | `--base` | `--base` |
| environment | `--viewport/--wide/--mobile/--desktop`, `--scale`, `--dark/--light`, `--reduced-motion` | `--viewport/--mobile/--desktop` | `--viewport/--mobile/--desktop`, `--os-reduced-motion/--os-full-motion` | `--viewport` | `--viewport` |
| app settings | `--appearance*/--full-motion`, `--theme`, `--panels` | same | same | same | none |
| nav | 6 verbs (`_shared/nav.ts`) | same | same | same (`NAV_FLAG_METHOD`) | none |
| steps | `--click/--dom-click/--force-click/--hover/--fill/--key/--wait-for/--upload` | `--click/--upload` | `--click` (reach) + `--selector` (measured) | `--click/--dom-click/--hover/--fill/--wheel/--wheel-burst/--pause` | `--click/--dom-click/--hover/--fill/--wheel/--pause` |
| settle | `--wait <selector>`, `--stream-settle <s>`, `--idle` | `--wait <ms>` | `--window <ms>` | `--settle <ms>` | `--settle <ms>` |
| load | `--cpu-throttle`, `--network` | none | `--no-throttle` (4× default) | none | none |
| evidence | `--text/--aria/--map/--eval/--contrast/--cascade/--expect-*/--json/--scenario-summary` | `--fail-on`, JSON always | RESULT + JSON | table + JSON, `--cpuprofile`, `--perf-cycles` | webm/gif/strips, `--frames` |
| artifact | `--out` (base or path) | `--out` | (route-derived) | `--out` (default `perf-meter`) | `--out` (default `recording`) |
| stage admin | `--stage-status/--stage-down/--stage-sweep/--force` | none by design | none | none | none |
| matrix | `--matrix` (16-cell) | `--matrix` (13-cell) | `--matrix` (6-cell) | none | none |

### 4.2 The ruling that constrains this section

`Core-Tooling-Law.md` §4.9: "There is deliberately NO generic `parseArgv(spec)`… each existing contract stays byte-stable." That ruling SURVIVES — its input changed. The house already shares flag FAMILIES as data tables consumed by each tool's own `ops/parse.ts` (`NAV_FLAGS`, `APPEARANCE_VALUE_FLAGS`, `THEME_VALUE_FLAGS`, `PANEL_PRESET_VALUE_FLAGS`). Unification means MORE families in that shape, not a spec parser.

### 4.3 The shared families (new, `tooling/src/_shared/instrument-argv.ts`)

| Family | Flags | Semantics (one home) |
| - | - | - |
| `HELP_FLAGS` | `--help`, `-h` | every tool prints its help and exits 0 (ends the 33 misuse hits) |
| `WHERE_FLAGS` | `--base`, `--isolated`, `--ref`, `--dirty`, `--fresh`, `--session <name>` | `--session` implies the session's binding; `--base` + stage flags = exit 3 (the ui-audit rule, `stage-request.ts:52-61`, promoted) |
| `ENVIRONMENT_FLAGS` | `--viewport`, `--wide`, `--mobile`, `--desktop`, `--dark`, `--light`, `--reduced-motion` | **ONE SPELLING, NO ALIASES (owner ruling 2026-09-03, superseding this row's original alias clause).** Every member lands on ALL FIVE tools; a tool that lacks one GAINS it. motion-audit's `--os-reduced-motion`/`--os-full-motion` are RENAMED to the canonical `--reduced-motion` — and at #1315 the old spellings stopped being refused BY NAME too (owner ruling: the product is unlaunched, so nobody outside the repo ever typed them and there is no one to refuse; they are grep-fixed at the call sites and now die as a plain `unknown flag`). A rename is a VALUE change and owes the repo-wide sweep (`tests/**`, `.claude/skills/**`, `.claude/rules/**`, `docs/**`): grep exists, so every call site moves in the same commit rather than a compatibility tail being kept alive |
| `SESSION_ADMIN_FLAGS` | `--session-status`, `--session-close`, `--session-sweep`, `--session-export`, `--session-ttl`, `--force` | snap only (the door); refused on sibling tools with the pointer |
| `STAGE_ADMIN_FLAGS` | `--stage-status`, `--stage-down`, `--stage-sweep`, `--force` | snap only (unchanged ruling: one lifecycle owner) |
| `ARTIFACT_FLAGS` | `--out`, `--json` | `--out` base-or-path contract (`_shared/artifacts.ts:379`) for all five |
| `ALIAS_REFUSALS` | `--full-page→--full`, `--watch-every→--every`, `--name→--out`, `--screenshot→--shot-of`, `--profile→--react-profile`, `--press→--force-click`, `--ls→--local-storage`, `--sse→--stream-settle`, `--summary→--scenario-summary`, `--owner→--stage-owner` | an unknown flag that matches a MEASURED ASK refuses NAMING the real flag (exit 3). This is a REFUSAL table, not an alias table — the old spelling stops working and says where to go; it is never quietly accepted. #1315 narrowed the membership to asks: a RETIRED SPELLING of our own (`--os-reduced-motion`, `--cpuprofile`, `--jsclick`, `--wheelburst`, `--cycles`) is not an ask and left the table, because an unlaunched product grep-fixes its own call sites rather than carrying a translation |

The `--wait` collision (selector in snap, ms in design-audit) is owner fork F1; default: design-audit renames to `--settle <ms>` (perf-meter/record's spelling) with the old spelling refused by name — a value change that owes the `tests/**` literal sweep.

**THE UNIFICATION IS TOTAL, AND THAT IS THE POINT (owner ruling 2026-09-03).** Every family above lands on
ALL FIVE instruments. A tool that does not have a member today GAINS it — that is not scope creep, it is the
whole deliverable: §1's P5 counted five flag dialects and 33 `--help`-as-misuse hits precisely because each
tool grew its own vocabulary. "This flag exists on snap only, so adding it to the siblings is a feature
addition" is NOT a reason to defer; the feature IS the unification.

Two things this ruling forecloses, so nobody re-derives them:

- **No aliases, no compatibility tails.** A renamed flag has ONE spelling; the old one is refused by name
  through `ALIAS_REFUSALS` and every call site moves in the same commit. Grep exists. A second accepted
  spelling is the half-migration `Core-Tooling-Law.md` §1 already bans — the old map left beside the new
  "for now" IS the rot.
- **A value change owes its full sweep, not just `tests/**`.** `.claude/skills/**`, `.claude/rules/**` and
  `docs/**` cite these flags too; #1290's (D) had to repoint 18 such citations for exactly this reason.

What §4.2's ruling still forbids is unchanged and is not in tension with any of this: shared FAMILY TABLES
in the existing data shape, never a generic `parseArgv(spec)`.

### 4.4 The session grammar (snap)

```text
pnpm snap --session <name> [where] [environment] [app settings] <route>      # boot + first call
pnpm snap --session <name> [--goto …|--click …|--eval …|--text|--map|--contrast …|--lighthouse …|--requests …]   # later calls: the LIVE page
pnpm snap --session-status [<name>]     # every session: owner · idle · stage band · cdp endpoint · dead/live
pnpm snap --session-close <name> [--force]
pnpm snap --session-sweep               # dead + idle>TTL + orphan dirs; live ones reported
pnpm snap --session-export <name> [--out <base>]
pnpm snap --session <name> --design-audit [route] …   # every arm attaches to the SAME browser + stage (§3.4)
pnpm snap --session <name> --motion <selector>
pnpm snap --session <name> --perf --click …
```

The last three lines were the retired `pnpm design-audit`/`pnpm motion-audit`/`pnpm perf-meter` in this
design's original text; the sibling doors were deleted at #1315, and the session-attach they were minted for is
now free — an arm on a `--session` call already runs against the live page (§10.10).

Invocation shape is guard-proof by construction (P9): one plain `pnpm snap …`, no `env`, no `cd`, no pipe; the repo-keyed socket makes the cwd irrelevant.

## 5. Op reuse map (which ops become session-reusable, with what change)

| Op | Today | Change for session mode | Enforcer of "one implementation" |
| - | - | - | - |
| `ops/parse.ts` `parseSnapArgs` | one home for validation | + `sessionValidationPairs` (session-level flag on a later call → error; no route on a never-navigated page → error) | the client AND the daemon parse with it; the parse pins in `tests/tooling/snap/index.test.ts` + a session-flag pin beside them (planned) |
| `ops/session.ts` `launchSnapSession` | launches per run | unchanged; the daemon calls it once with the boot args and holds the `ProbeSession`; `applyLoadEmulation` per boot | arm B |
| `ops/run.ts` `runSnapDetailed` | launch + capture + report + finish in one | split at the `try` (`run.ts:80`): `runOnSession(session, opts, plan)` = capture → css evidence → report → verdict; `runSnapDetailed` = launch + `runOnSession` + finish. The daemon calls `runOnSession` | an int test drives the same route one-shot and via session and diffs the RESULT pairs (`out` excepted) |
| `ops/capture.ts` `capture` | navigates unless `plan.navigatePage === false` | unchanged — session calls pass `navigatePage: route !== null` (the scenario `keepLivePage` shape) | scenario suite |
| `ops/drive.ts` | queue + readiness | unchanged; readiness on a no-route call reads the flag without `page.goto` | — |
| `ops/evidence.ts`, `map.ts`, `contrast*.ts`, `dead-css.ts`, `overflow.ts`, `shot.ts` | pure page ops | unchanged (they take `page`) | — |
| `ops/cascade.ts` + `_shared/devtools-runtime.ts` | per-run runtime keyed by session (`CASCADE_RUNTIMES` WeakMap) | the runtime is a session-level property (boot with `--cascade` or any arm declaring `needs.debuggingPort`); `prepareDevToolsCascadeRuntime` splits into `prepareDebuggingEndpoint` (profile + port, reused by lighthouse/attach) + the asset server | `tests/tooling/snap/cascade.suite.int.test.ts` |
| `ops/report.ts`, `verdict.ts`, `manifest.ts` | per run | unchanged; `sessionForEvidence` windows already exist (`--checkpoint` ranges) — every session call is a checkpoint window over the daemon's rings | — |
| `ops/scenario.ts` | file-fed checkpoints | `inheritScenarioSession` + `scenarioErrors` move to `lib/session-plan.ts` (pure) and serve BOTH scenario and session — one partition, one refusal table | tests/tooling/snap/lib/session-plan.test.ts (planned) |
| `ops/watch.ts` | page-0 series | unchanged | — |
| `ops/stage*.ts`, `lib/stage-plan.ts` | one band | table rows + allocation + TTL + lazy reap (§3.6); `ensureStage` gains `{ band?: number, session?: string }` | `stage-plan.test.ts` (both sides of every verdict) |
| `ops/matrix.ts` | boots N cells one-shot | runs its cells THROUGH a session (one browser, N contexts) — a later phase; not required for the seed | — |
| `ui-audit/ops/run.ts:115` | launches | + `--session` → `attachProbeSession(status.cdpEndpoint)` in place of launch; walker/pixels/hover ops unchanged (they take `page`) | arm H |
| `motion-audit/ops/run.ts:98`, `cpu-profile/ops/run.ts:27`, `screen-record/ops/record.ts:25` | launch | same attach shape; `record` needs `recordVideoDir` at CONTEXT creation so it attaches by opening a NEW context on the session browser (`browser.newContext`) rather than reusing a page | arm H |
| `_shared/browser.ts` | one launch site | + `attachProbeSession(endpoint)` (connectOverCDP) — the one attach site; the returned `ProbeSession` shape is identical so every consumer is oblivious | arm B + arm H |
| `_shared/artifact-out.ts` | one run per process | + `beginInstrumentRun(instrument, root, { slotDir })` explicit-slot form for the daemon | arm G |

## 6. The arm plug-in contract (`snap/contract/arms.ts`)

```ts
export const ARMS = ["shot", "aria", "map", "eval", "contrast", "cascade", "dead-css", "assert", "perf", "requests", "lighthouse"] as const;
export type Arm = (typeof ARMS)[number];

export interface ArmDef<TOutcome> {
  readonly flags: readonly FlagSpec[];                 // owned flags; parse.ts derives REQUIRED_VALUE_FLAGS / PAGE_TARGET_FLAGS from the union
  readonly level: "session" | "call";                  // where its flags may appear (§3.3)
  readonly needs: { readonly debuggingPort?: true; readonly devtoolsSdk?: true; readonly trace?: true; readonly requestRing?: true; readonly quietBox?: true }; // quietBox = a RATE arm: withheld under load (§7.1)
  readonly run: (ctx: ArmContext) => Promise<TOutcome>; // ctx: page · session rings · slot dir · args · page index
  readonly failures: (outcome: TOutcome) => number;    // folds into buildFailureSummary
  readonly pairs: (outcome: TOutcome) => readonly ResultPair[];   // RESULT line members
  readonly help: string;                               // SNAP_HELP is derived, never hand-listed
}
export const ARM_DEFS: Record<Arm, ArmDef<unknown>>;   // a new member fails tsc until every site is filled
```

A new arm lands as ONE file `snap/ops/arms/<arm>.ts` + one tuple member; its flags, help, RESULT pairs and verdict fold are derived from the record. Because sibling instruments share the SESSION rather than re-host arms, "available to every instrument and agent" means: any lane attached to a session can ask snap for any arm against the same live page (`pnpm snap --session p-x --lighthouse desktop` after `pnpm snap --session p-x --design-audit …`). Enforcers: the `Record<Arm, …>` exhaustiveness (compile-time); `tooling-instrument-proof` (each arm's `@instrument-proof` / `@instrument-absence-proof` twin under tests/tooling/snap/ops/arms/ (planned)).

### 6.1 Worked arm: `lighthouse` (#1198)

- `needs: { debuggingPort: true }` — the session boots with `prepareDebuggingEndpoint` (the shape `devtools-runtime.ts:382-396` already uses); one-shot `pnpm snap <route> --lighthouse desktop` boots the same way for that run.
- Engine: the `lighthouse` npm package (pinned in `tooling/package.json` via the catalog; dependency note in the catalog: it is the engine the MCP wrapped, nothing lighter audits `label-content-name-mismatch`), `gatherMode: "snapshot"` by default (the page is client state), `navigation` on `--lighthouse desktop --lighthouse-mode navigation`; categories accessibility + best-practices + seo; the mobile arm rides the session's `--mobile` context (touch, coarse, DPR 3) and refuses when the session is desktop.
- Output: `report.json` + `report.html` in the call slot; prints category scores and every failed audit with node count + first three selectors; RESULT pairs `lighthouse-a11y=`, `lighthouse-bp=`, `lighthouse-seo=`, `lighthouse-failed-audits=`, `lighthouse-mode=`.
- Refusals (exit 2): page not `data-app-ready`, run truncated, engine attached to the wrong target (the `targetIdentity` check, `devtools-runtime.ts:105-120`).
- Proof: a `--file` fixture carrying a `label-content-name-mismatch` node must be reported; the clean twin prints `lighthouse-failed-audits=0` with the audited count; the absence proof: an unreachable debugging port must exit 2, never `failed-audits=0`.

### 6.2 Worked arm: `requests` (#1199)

- `needs: { requestRing: true }` — the daemon keeps a bounded ring (4096 entries) from `page.on("request"|"response"|"requestfinished"|"requestfailed")` on every page of every context since boot: method, url, resourceType, status, size (`sizes()`), timing (`request.timing()`), and the BODY for `application/json` responses up to 256 KiB each within a 32 MiB budget (bodies cannot be fetched after the fact; the ring is the only place they survive).
- `--requests [url-substring]` prints one line per matching entry since the session's last `resetEvidence`/`--checkpoint` mark and writes `requests.json` into the call slot; `--request-body <url-substring>` prints the newest matching stored body (or `BODY NOT RETAINED` with the size and the budget when it was over the cap — never a silent empty).
- One-shot runs get the same ring for the run's lifetime (today's `CapturedRequest` map, `_shared/browser-capture.ts:8-15`, widens to the ring shape; `partitionFailedRequests` keeps reading it).
- Proof: a fixture page fetching two JSON endpoints from a loopback server → `--requests` names both with status and size; `--request-body` returns the planted body; an empty filter prints `requests=N` with N > 0 (absence proof: a ring that never attached exits 2).

## 7. Load model and caps

| Unit | Cost (measured/derived) | Cap / floor |
| - | - | - |
| session daemon | one niced node (\~120 MB RSS) + one Chromium (\~250–500 MB per context set) | `ORB_SESSION_CAP` default 3 (= the lane cap, `orchestration.md` §Merge/load); the 4th boot exits 2 listing live sessions with idle ages |
| stage | server node + vite (full priority by census) + a worktree with `pnpm install --prefer-offline` (shared store) + a dev-db copy; cold boot \~55 s+ (`stack.sh:104-108`), install once per sha | `ORB_STAGE_CAP` default 3; bands 0..9 are the hard range; lazy reap-on-acquire before refusal |
| attached sibling run | its own niced node (today's cost) — no extra browser | inherits the session cap |
| TTLs | session idle 30 min · stage idle 60 min (fork F5) | reset by any substrate request |
| drain (orchestrator) | at fold: `--session-close <lane>` + `--stage-down --stage-owner <checkout>`; at a train: `--session-sweep` + `--stage-sweep`; the survivors line is honest after §3.6's fix | replaces "`--stage-down --force` from main" |
| nice | daemons via `spawnNicedChild`; browsers inherit; the stage stack stays the one full-priority exception | `tooling-child-process-door` (one `full-priority-spawn` grant per caller) |
| contention receipts | today: 5 drivers in one hour on 09-02 with ONE band; with 3 bands the same hour needs no refusal | `--stage-status` prints bands used / free / stranded |

### 7.1 Timeouts and load: one budget policy (owner addition 2026-09-02; RATE class re-ruled 2026-09-05, #1616)

**The class.** A wall-clock budget written for a quiet box reads as a RED on a contended one, and a measured RATE taken on a contended box is a number about the box, not the code. Both wear the clothes of a real verdict. Today the fleet carries FOUR unrelated answers to that class; the substrate carries ONE.

**LABEL, DON'T WITHHOLD — owner ruling 2026-09-05 (#1616), superseding "withhold, don't red" for the RATE class.** Shown a snap whose perf arm published NOTHING at loadavg 26–31 — a box that is *always* over the per-core-1.0 boundary while lanes run — the owner's verdict was "that's dumb": the withhold spent the run and returned no number, and every subsequent reader had to re-run on a box that would never be quiet. **The ruling survives; its INPUT changed.** The mechanism #1040 minted — a rate number taken under contention MUST NOT be promoted to a pass or a red — is unchanged and still absolute. What changed is the consequence: the arm now MEASURES, PRINTS, and LABELS the number `load-suspect` with the same loadavg receipt, and the label (not the absence of a number) is what bars the promotion. #1040's receipt is intact and is exactly why the label is not a vote: motion-audit read 47.54% dropped frames at per-core 1.04, then 10%, then clean, on byte-identical source. A `load-suspect` number is evidence for a human, never a verdict for the harness.

The verdict vocabulary is therefore THREE closed members in one home (`tooling/src/_shared/load-budget.ts` `MEASUREMENT_DISPOSITIONS`): `complete` (judgeable — the only member that may vote), `load-suspect` (a real number, published, never promoted), `withheld` (NO number exists — reserved for the causes that yield nothing at all, e.g. snap's acceleration-posture arms, which cannot measure a rate on a box whose compositor is software-rendered). Load alone never produces `withheld`.

Inventory (receipts):

| Site | Budget today | What happens under load |
| - | - | - |
| `tests/tooling/_shared/browser.int.test.ts` | vitest's 5 s default test timeout for the parallel integration lane (`vitest.config.ts:260` sets 30 s only for the serial project); the suite's own children at 30 s (`:47`) and 5 s (`:231`) | 5 timeouts at loadavg 41 on 2026-09-02 — generic reds, no load receipt |
| Playwright CT | `expect`/`expect.poll` 5 s and the 30 s test timeout are Playwright defaults (`playwright-ct.config.ts` pins neither; workers pinned at `:41`) | every test times out at `mount()` at loadavg 170 with zero signal (`.claude/rules/browser-and-instruments.md`) |
| `tests/ui/variant-arm-parity.suite.test.ts:103` | fixed `{ timeout: 30_000 }` | the same class, one file |
| `tests/tooling/gate-ignore-grammar.repo.int.test.ts:154` | fixed 300 s `beforeAll` hook (\~60 s quiet) | 470–485 s at load 40+ with five lanes live — red on both sides of any change (#1174) |
| `tests/tooling/ui-audit/**` CLI int tests | fixed child budgets, no withhold | different tests exit 2 each run at `--maxWorkers=4` and `=2`, clean standalone (#1222) |
| the motion-audit CLI suite (deleted at #1315), lines 136,161 | `withholdMeasurement` (now `labelRateLoad`) on the in-budget twin AND the mobile arm (landed after #1040; the brief's "mobile arm lacks it" premise is stale at this tip) | withholds with the loadavg receipt — the shape the rest lacks |
| `tests/tooling/_load-budget.ts` | THE existing mechanism: `computeLoadFactor` (per-core 1-min loadavg, cap 8), `scaledBudget`, `judgeMeasurementLoad`/`labelRateLoad` (`ORB-LOAD-SUSPECT`; both were `withholdMeasurement`/`ORB-LOAD-WITHHOLD` until #1616), `runNodeWithBudget`/`spawnNodeWithBudget` (`ORB-LOAD-KILL`), `isTimeoutKill` (both node kill shapes); the supervisor counts load-suspect arms per shard (`scripts/vitest-supervised.mjs`) | correct, but TEST-ONLY: 11 suites import it; no instrument, no daemon, no CT config, no launcher reads it |
| instrument budgets: `snap/lib/budgets.ts` (nav 15 s · wait 10 s · step 5 s · stage nav/ready 90/60 s · throttled 90/60 s), `snap/lib/throttle.ts:94-99` `driveBudgets` (widest independent cause wins — memory `throttle-arms-need-their-own-budgets`), `ui-audit/lib/budgets.ts` (nav 15 · wait 10 · click 5 · census observe 2–5 s), `motion-audit/lib/budgets.ts` (nav 20 · ready 10 · step 5), `cpu-profile/lib/budgets.ts`, and — refuted on the tree 2026-09-02 — `screen-record` has NO `lib/budgets.ts` at all: its two ceilings are module consts inside `ops/record.ts:12` and `ops/drive.ts:13` (nav 20 · step 5), `_shared/proc.ts` `spawnNiced` default 120 s | fixed ceilings; load turns a slow-but-fine surface into `app never signalled data-app-ready` / `STEP FAILED … Timeout` — a false red about the app | |
| the readiness ladder `snap/ops/drive.ts:41-55` (`settled` / `degraded` / `dataless` / `absent`) | `degraded` is the APP's own ceiling (`app-ready-signal`) handing over with reads in flight | already an honest NAV ERROR, but nothing says WHY it degraded — a loaded box and a slow query read the same |
| stage boot `tooling/src/stack/stack.sh:107-108` | fixed `SERVER_HEALTHZ_TIMEOUT` 180 s / `READINESS_TIMEOUT` 240 s | a cold boot under a train reads `boot-timeout` (memory `stack-restart-vs-battery-contention`) |

**The law (three classes, three consequences, ONE reading of the box).** `computeLoadFactor`'s quiet/contended boundary (per-core 1-min loadavg ≥ 1.0, factor 1 → >1) is the only threshold; nothing mints a second constant (memory `load-scaling-transfers-to-clocks-not-to-rates`).

| Class | Members | Consequence |
| - | - | - |
| WALL CLOCK | nav / readiness / step / settle ceilings, child-process timeouts, vitest test + hook timeouts, CT test + expect timeouts, stack boot ceilings, session per-call ceilings | `budget(baseMs)` = `baseMs × factor`, factor capped at 8 AND an absolute ceiling (`ORB_BUDGET_CEILING_MS`, default 10 min — fork F11) so a wedged subject still surfaces. A budget that fires is an honest exit 2 (`ORB-LOAD-KILL: <what> exceeded its load-scaled budget (<ms> = <base>×<factor>) at loadavg <la>/<cores>` — could not measure), never a violation |
| RATE | dropped-frame %, CLS deltas, LoAF/INP/blocking ms, rAF gaps, perf-meter's timing columns, any A/B delta | LABELLED at the same boundary before the arm votes: the arm MEASURES and PRINTS, stamped `LOAD-SUSPECT (ORB-LOAD-SUSPECT … loadavg <la>/<cores>)`, the RESULT pair reads `<arm>=load-suspect` and the run line carries `load-suspect=<arm,…>` beside `load=<la>/<cores> budget-factor=<f>`; the number NEVER becomes a pass, a red or a breach — an instrument whose only output is a labelled rate exits 0 with the label, not 2. Never widened, never red, never promoted (#1040's mechanism, #1616's input: "label, don't withhold"). `withheld` survives for the causes that produce NO number at all, and those still exit 2 |
| IDLE | session/stage TTLs | NOT a budget — idle is not load; a TTL is never scaled and never withheld (§3.6) |

**The mechanism, one home.** The pure core of `tests/tooling/_load-budget.ts` moves DOWN to `tooling/src/_shared/load-budget.ts` (the plumbing floor): `readBoxLoad`, `computeLoadFactor`, `budget(baseMs)`, `judgeMeasurementLoad`, `loadReceipt()` (the `load=<la1>/<cores>` + `budget-factor=<f>` RESULT pairs), `isTimeoutKill`, the two markers. `tests/tooling/_load-budget.ts` keeps only the vitest seam (`labelRateLoad` stamping `task.meta` — it labels and does NOT skip, #1616) and imports the core through the @orb/tooling/\_shared/load-budget subpath (planned). Applied uniformly:

- **instruments** — every `lib/budgets.ts` constant becomes a BASE; `driveBudgets` returns `budget(max(...))`; `_shared/proc.ts` doors take `budget(...)`; `printVerdict` prints the two load pairs on every RESULT line by default (a reader can tell a stretched run from a quiet one without the argv); each RATE arm calls `judgeMeasurementLoad` before voting and declares itself in its arm def (`ArmDef.needs.quietBox: true`, §6) so the LABEL is data, not discipline;
- **the session daemon** — per-call ceilings are `budget(base)`; a `busy` refusal names the in-flight op's remaining budget; a call that hits its ceiling is aborted at the Playwright call (the page and the session survive — the NEXT call names the aborted op); the TTL stays unscaled;
- **the CT harness** — `playwright-ct.config.ts` sets `timeout: budget(30_000)`, `expect: { timeout: budget(5_000) }`, `use.actionTimeout: budget(15_000)` at config load (the config already decodes env); a CT that measures a RATE calls `judgeRateLoad`/`annotateRateLoad(test.info())`, which annotates `orb-load-suspect` and RUNS ANYWAY (#1616 — it used to skip) — Playwright's `test.info().annotations` is the reporter-visible channel, the CT twin of `task.meta` — and `ct-flaky-reporter.ts` counts the annotation beside its flake tally;
- **the int tests** — `vitest.config.ts` sets each project's `testTimeout`/`hookTimeout` from `budget(...)` (the 300 s hook of #1174 becomes `budget(120_000)` under the ceiling; the parallel lane's 5 s becomes `budget(5_000)`), and the CLI-spawning ui-audit suites (#1222) take the load-suspect label on their rate-shaped arms and `runNodeWithBudget` on the rest;
- **the launcher** — `stack.sh` reads `SERVER_HEALTHZ_TIMEOUT`/`READINESS_TIMEOUT` from a `budget` answered by the node half it already shells (`prod-entry.ts classify` is the precedent), so a cold stage boot under a train is not a false `boot-timeout`;
- **the readiness ladder** — `degraded`/`absent` carry the load receipt in their message so a reader can separate "the app is slow" from "the box is".

**LANDED, phase 1b (#1232, 2026-09-02).** What the build found that this section did not predict, recorded here because the next reader inherits it:

- the pure core is `tooling/src/_shared/load-budget.ts` (`budget` · `computeLoadFactor` · `judgeMeasurementLoad`/`judgeRateLoad` · `annotateRateLoad` · `loadLine` · `loadKillMessage`/`loadKillError` · `isTimeoutKill`); `tests/tooling/_load-budget.ts` keeps the vitest `task.meta` seam plus the sync CHILD RUNNERS and re-exports the core, so the 11 suites importing it did not churn. `scaledBudget(base, cap?)` survives as the suites' spelling of `budget()`;
- **arm J's REAL census was 20 sites, not the 8 this section listed** — the whole `stack` probe family (`port-health`, `engine-adoption`, `engines-ctl`, `prod-state`, `served-probe`), `model-ab`, `mutation-probe`, `render-trace`, `boot-chunk-ratchet`, `_shared/nav.ts` and `_shared/devtools-runtime.ts` all carried fixed clocks; plus **61 more in `tests/tooling/**`** (every CLI-int suite's spawn ceiling, including the `browser.int.test.ts` 5s/30s that took five timeouts at loadavg 41). All are `budget(...)`/`scaledBudget(...)` now;
- **`*_BUDGET_MS` is NOT a wall-clock spelling.** The first arm-J pattern included it and the census caught `motion-audit/lib/verdicts.ts`'s `BLOCKING_BUDGET_MS = 50` — a VERDICT THRESHOLD. Scaling a threshold widens the verdict, which is the third arm #1040 forbids; a rate-shaped threshold's answer to load is the LOAD-SUSPECT label (the withhold, until #1616);
- **the ceiling caps the STRETCH, never the declared base.** `model-ab`'s 15-minute cold-load boot is a legitimate base above the 10-minute ceiling; shrinking it would have made the ceiling a false-red generator;
- **snap is SCALED (#1266, then #1283).** `tooling/src/snap/**` was fenced to the concurrent session-substrate lane (#1231), so snap's clock sites rode censused, dated, shrink-only `CLOCK_SITES` rows whose end condition was "scaled when the session daemon consumes `budget()`". That end condition came true (the session daemon landed with phase 1) and #1266 spent the four rows the same day — the CENSUS was 14 sites, not 4 (`lib/budgets.ts`'s eight ceilings, three inline dialog waits collapsed to one, the resource-fetch/frontend-nav pair, and `shot.ts`'s owner-ruled exception, PAINT\_SETTLE\_FRAME, whose row was deleted because it is a per-frame settle bound rather than a tolerance — scaling it would change what "settled" means, not just widen a budget). #1283 then closed the gap #1266 left: `printVerdict` did not yet publish the two RESULT pairs (`load=<la>/<cores>`, `budget-factor=<f>`) on any snap RESULT line, so a reader still needed the argv to know whether a run had stretched — every snap `printVerdict` call site now spreads `loadResultPairs()` (the `_shared/load-budget.ts` tuple twin of `loadLine`) into its `pairs` array;
- **the launcher plumbing was NOT disproportionate**: `stack.sh` reads `SERVER_HEALTHZ_TIMEOUT`/`READINESS_TIMEOUT` from a new `boot-budgets` verb (`stack/lib/boot-budgets.ts`), on the boot path only, with a host export still winning — the `debug-env` precedent, one formula.

**Enforcers.** Policies `tooling-clock-budget` (the tree: `tooling/src/**`, `tests/tooling/**`; ordinary) and `tooling-runner-config-literals` (the three root configs through their `exact-file` ids; hard): a numeric wall-clock literal handed to a `timeout`/`timeoutMs`/`{ timeout: N }` option of Playwright, `node:child_process`, vitest or the CT/e2e configs outside `_shared/load-budget.ts` is RED (a deliberately fixed clock is an `@orb-waive tooling-clock-budget(<literal>)` at its site — a settle wait is not a budget); `tooling-instrument-proof`'s `@instrument-absence-proof` for every RATE arm must plant a loaded box and assert the LABEL (a printed number plus a `load-suspect` member that no exit code moves); `check:structure` sees the three config files through the resource policy.

Planted controls (added to §8): **T14** a forced-load reading (`readBoxLoad` injected at per-core 4.0) makes a RATE arm print `LOAD-SUSPECT` with the loadavg receipt, PUBLISH its number, and mark the pair `load-suspect` — never a red, never an exit-2, never a pass (#1616; before it, a withhold + exit 2); **T15** a quiet reading (per-core 0.3) leaves factor 1, budgets byte-identical to their base, and the arm measures (the positive control that the withhold cannot become a way to stop testing); **T16** a genuinely hung subject (a fixture page whose `data-app-ready` never lands) under the same forced load still exits 2 with the `ORB-LOAD-KILL` message naming base × factor and the loadavg — the ceiling is not a way to hang; **T17** the daemon: a call whose step hangs is aborted at its scaled ceiling with exit 2, and the next call on the same session runs (the session survived the abort).

## 8. Test plan (planted controls; the tier is `tests/tooling/**` — node + a real headless chromium over `--file` fixtures and loopback servers; a committed proof never boots the dev stack)

| # | Proof | Planted control (the fence that can fail) |
| - | - | - |
| T1 | leaked emulation cannot reach a sibling: sessions A and B over one fixture; `A --viewport 412x823`; `B --eval innerWidth` = 1280 | `A --eval innerWidth` = 412 in the same run (the instrument measures); and the pre-substrate twin: two `--file` one-shots share nothing — asserted as the FENCE it is, not as a defect proof |
| T2 | a killed daemon: boot A, `SIGKILL` its pid, `--session A --eval 1` exits 2 with `SESSION DEAD … at <ts> mid-<op>`; `--session-sweep` reaps the browser group and clears the marker | a LIVE session B under TTL survives the same sweep; `abandonedRuns(root,"snap-session")` names A and not B |
| T3 | two sessions publish concurrently with the same `--out`: both slots keep their PNG, each pointer names a FINISHED run; plus the prune race: 12 pre-planted slots + deadline-synchronized publishes → zero exit-2 | the pre-fix writer twin (`artifacts.int.test.ts`'s fixed-path replay) still destroys one artifact |
| T4 | a stage dies mid-drive: a planted loopback "stage" registered as band 7 (its row names the caller) is killed between two calls; the second call exits 2 naming the stage, the death time and the op; `--stage-status` shows the band `dead`, `--stage-sweep` frees it | the same sequence with the stage alive passes; a foreign row's stage death never reaps a live sibling's band |
| T5 | TTL: `ORB_SESSION_TTL_MIN` tiny → the daemon exits after idle; a call inside the window resets it (the daemon survives 2× the window) | a session with a call every half-window never dies |
| T6 | cap: three sessions live, the fourth boot exits 2 naming the three with idle ages | closing one admits the fourth |
| T7 | `--base` fencing (#1186): `--base http://localhost:<band port>` against a foreign row exits 2 naming both checkouts | own row passes; `shared-reuse` at the same sha passes |
| T8 | sibling attach: `design-audit --session A` runs its walker against A's live page (the session's viewport/shim observed by the walker's `themeRender` and `browserEnvironment`) | the walker's `census` is non-zero and the environment matches A's boot (`environment-fails=0`); a detached run against a closed session exits 2 |
| T9 | one implementation: the same route one-shot vs via session yields identical RESULT pairs except `out` | a planted contrast defect REDs both ways |
| T10 | arms: §6.1 and §6.2 proofs, plus the `@instrument-absence-proof` twins | — |
| T11 | ports: `_shared/ports.ts` bands are disjoint from every reserved row; gate arm I mustFlag a planted literal | — |
| T12 | CT slot helper (#1201): a CT screenshot through `ctSnapPath` never rewrites a finished snap slot; gate arm `no-direct-reports-write` mustFlag the direct spelling | — |
| T13 | survivors honesty (#1162): a clean `stack.sh stop` prints no survivors line; a re-parented `sleep` in the group still produces it (`STACK_DISPATCH_PROBE`-style seam, `stack.sh:170`) | — |
| T14 | load: an injected per-core 4.0 reading makes a RATE arm print `WITHHELD (ORB-LOAD-WITHHOLD …)` with the loadavg and mark the pair withheld (exit 2 when the rate is the only output) | never a red; the same arm on a quiet reading measures (T15) |
| T15 | load: an injected per-core 0.3 reading leaves factor 1 — every budget byte-identical to its base, the arm votes | the positive control that withholding cannot become a way to stop measuring |
| T16 | load: a fixture whose `data-app-ready` never lands, under the injected 4.0 reading, still exits 2 with `ORB-LOAD-KILL: … (<base>×<factor>) at loadavg …` inside the ceiling | the ceiling is not a way to hang; the message names the load |
| T17 | daemon: a session call whose step hangs is aborted at its scaled ceiling (exit 2, op named); the next call on the same session runs | the session survives an aborted call |

Live receipts (landing, not committed): a real `--isolated --ref <sha>` session on a lane worktree with two sibling sessions on two more bands, driven for one settings surface each; `--stage-status` listing three bands; a fold that closes one session and leaves the others measuring.

## 9. Alternatives weighed

| Alternative | Loses because |
| - | - |
| a separate `pnpm browser` daemon CLI (new tool) | owner ruling 2026-09-02: "NO in-house browser tool — CLI snap = the one door"; and two doors = two grammars, the exact P5 this design ends. The daemon is a snap VERB |
| an MCP (own instance per role, or the shared plugin) | ruled out by the owner (Bash stays the one door; the guard, the memory store, briefs and skills key off Bash); the shared plugin is the P3 leak |
| leave snap one-shot; build only the two arms | fixes #1195's gaps and nothing in P1/P2/P4/P6; the band contention and the fresh-browser cost stay; the 42 re-runs stay |
| the daemon EXECUTES sibling ops (design-audit's walker inside the snap daemon) | snap would import `ui-audit/ops/**` — a front-door violation (`tooling-front-door`, `tooling-internal-direction`); attach-over-CDP keeps every tool's ops in its own process |
| no daemon — every call `connectOverCDP`s to a detached Chromium | the settings/theme shims are `page.route` handlers on a Playwright connection and die with the process; a refetch mid-session would render the REAL settings; console/request rings would not survive between calls; TTL would need a timer somewhere anyway |
| one slot per SESSION instead of per call | a killed session strands every call's evidence unpublished (#1202's shape, made worse); per-call slots keep #1029's contract and make `abandonedRuns` name the exact dead call |
| bands as N marker FILES (`active-<k>.json`) | one table row per band gives `--stage-status` one read and allocation one write; N files re-create the lost-marker class N times |
| moving the stage set into a new `tooling/src/stage/` tool | consumers already enter through `#snap` (#678 precedent); a move is churn with no new physics; revisit only if a non-instrument consumer appears (fork F2) |
| a generic `parseArgv(spec)` | refused by `Core-Tooling-Law.md` §4.9; shared FAMILY tables are the sanctioned shape (§4.2) |
| `chromium.launchServer()` + `connect()` for sibling attach | a `connect()` client cannot see contexts another client created; `connectOverCDP` exposes the existing targets, which is the whole point |

## 10. Phased build plan

Every phase is one lane, one commit, scoped floors; whole-tree gates are the orchestrator's. Floors run `pnpm typecheck --config <path>` for every affected native program selected by the shared compiler reader; biome + eslint on touched files; `pnpm check:structure`; `pnpm knip`; `pnpm exec depcruise packages tooling --config .dependency-cruiser.cjs`; the named suites via `pnpm test:scoped <paths> --maxWorkers=4`; CT via `pnpm test:ct <paths> --workers=2`; `check-gates.int` / `gate-conformance.int` whenever a gate arm changes.

| Phase | Lane / tier | Lands | Files (new ‖ changed) | Floor (suites by path) |
| - | - | - | - | - |
| 0 spike | executor, 1 lane | (a) CDP multi-client: daemon-owned `page.route` shim keeps applying while a second Playwright `connectOverCDP` client drives the same page — a planted int test; (b) `lighthouse` snapshot against a `--remote-debugging-port` browser over a `--file` fixture. Decides fork F3's fallback | tests/tooling/\_shared/browser-attach.int.test.ts (planned) ‖ none | that test + `tests/tooling/_shared/browser.int.test.ts` |
| 1 sessions | forge (the design is the risk), 1 lane | the daemon + client + protocol + TTL + cap + sweep + status + export over `--base`/`--file`; `runOnSession` split; the scenario partition promoted to `lib/session-plan.ts`; per-call slots with explicit `slotDir`; the session run slot + `abandonedRuns` reader; `attachProbeSession` + gate arm H; help/session flags | `snap/ops/session-daemon.ts`, `session-client.ts`, `flags-session.ts`, `contract/session.ts`, `lib/session-plan.ts`, tests/tooling/snap/ops/session-daemon.int.test.ts + tests/tooling/snap/lib/session-plan.test.ts (both planned) ‖ `snap/cli.ts`, `ops/run.ts`, `ops/parse.ts`, `ops/scenario.ts`, `contract/help.ts`, `_shared/browser.ts`, `_shared/artifact-out.ts`, gate `tooling-shared-plumbing` | T1 T2 T3 T5 T6 T9; `tests/tooling/snap/**`, `tests/tooling/_shared/{browser,artifacts,artifact-out}*.test.ts`, `check-gates.int` |
| 1b load budgets | executor, 1 lane (∥ 1) | §7.1: `_shared/load-budget.ts` (the core promoted DOWN), `budget()` through every instrument's `lib/budgets.ts` + `driveBudgets` + `_shared/proc.ts`, the `load=`/`budget-factor=` RESULT pairs in `printVerdict`, RATE-arm withholds (motion-audit, perf-meter, snap's perf pair), CT config + `withholdRate`, vitest config budgets (#1174), the ui-audit suites (#1222), the launcher ceilings; gate arm J | `_shared/load-budget.ts`, tests/support/ct/withhold-rate.ts (planned), tests/tooling/\_shared/load-budget.test.ts (planned) ‖ `tests/tooling/_load-budget.ts`, the five `lib/budgets.ts`, `snap/lib/throttle.ts`, `_shared/evidence.ts`, `_shared/proc.ts`, `playwright-ct.config.ts`, `vitest.config.ts`, `tooling/src/stack/stack.sh`, `tooling/src/verify/ops/ct-flaky-reporter.ts`, gate `tooling-shared-plumbing` | T14 T15 T16 T17; `tests/tooling/load-budget.int.test.ts`, the motion-audit CLI suite (deleted at #1315), the cpu-profile CLI suite (deleted at #1315), `tests/tooling/ui-audit/index.int.test.ts`, `check-gates.int`; the two config literals via `check:structure` |
| 2 stages | forge, 1 lane | `_shared/ports.ts` + gate arm I; `bands.json` table; allocation + lazy reap + TTL arms; health = three probes + the dirty era rule; `--stage-status` lists all bands; `--base` fencing; #1162 survivors fix at the launcher; `ensureStage({ band, session })`; sibling tools gain `--session` (attach) — motion-audit/perf-meter/record therefore gain a branch-side arm without new stage code | `_shared/ports.ts`, tests/tooling/\_shared/ports.test.ts, tests/tooling/snap/ops/stage-bands.int.test.ts, tests/tooling/stack/stop-survivors.int.test.ts (all planned) ‖ `snap/lib/stage-plan.ts`, `ops/stage*.ts`, `ops/guards.ts`, `ui-audit/ops/stage.ts`, `motion-audit/ops/{parse,run}.ts`, `cpu-profile/ops/{parse,run}.ts`, `screen-record/ops/{parse,record}.ts`, `tooling/src/stack/{stack.sh,multi-user-fixture.sh}`, `tests/e2e/support/modes.ts`, `playwright-ct.config.ts`, `model-ab/ops/serve.ts` | T4 T7 T8 T11 T13; `stage-plan.test.ts`, `stage.test.ts`, `tests/tooling/stack/**`, `tests/tooling/dependency-cruiser.int.test.ts`; a live landing receipt on three bands |
| 3 arms | executor, 1 lane (after 1) | `contract/arms.ts` registry + `ops/arms/*` (existing arms re-homed by nature, byte-stable flags); `lighthouse` (#1198) + `requests` (#1199) with both proof classes; help derived | `snap/contract/arms.ts`, `snap/ops/arms/{shot,aria,map,eval,contrast,cascade,dead-css,assert,perf,requests,lighthouse}.ts`, the arm pins under tests/tooling/snap/ops/arms/ (planned) ‖ `ops/capture.ts`, `ops/parse.ts`, `contract/help.ts`, `_shared/browser-capture.ts`, `tooling/package.json` (+ catalog pin) | T10; `tests/tooling/snap/**`; `tooling-instrument-proof` conformance |
| 4 grammar + retirement | executor, 1 lane (after 3) | `_shared/instrument-argv.ts` families consumed by the five parsers; `--help` everywhere; alias refusals; F1's `--wait` decision; CT slot helper + gate arm (#1201); MCP retirement (#1195 §2.3: side-eye def, settings, skill rows); the P11 stale-path sweep in skills/rules/memory index. The proposed `agent-def-no-browser-mcp` gate was later ruled out by the owner (#1279), not left pending. | `_shared/instrument-argv.ts`, tests/support/node/snap-out.ts (planned), gates ‖ the five `ops/parse.ts`, `.claude/agents/side-eye.md`, `.claude/skills/{snap-driving,side-eye-design-review}/**`, `.claude/rules/browser-and-instruments.md`, `docs/architecture/core/Core-Tooling-Law.md` §2.4/§4.4/§4.9 | T12; each tool's `parse.test.ts` + `cli.int.test.ts`; `check:agents`; scoped `check:docs`; the `tests/**` literal sweep for every renamed flag |

**Phase-0 spike receipt (#1226, landed 2026-09-02 — `tests/tooling/_shared/browser-attach.suite.int.test.ts`, 4 arms, `pnpm test:scoped … --maxWorkers=4` green in 11.4s).** Both questions came back YES, each with a planted control that was run RED before the arm was trusted.

- **(a) CDP multi-client — F3 arm (a) CONFIRMED.** A `page.route` shim installed by the OWNING `launchProbeSession` connection keeps applying to a `fetch` a SECOND `chromium.connectOverCDP` client triggers on that page (read `{"origin":"SHIMMED"}` through the second client, against a loopback origin whose real body is `{"origin":"REAL"}`); the second client also navigates and evaluates freely, and the owner's connection survives the sibling's `close()`. Planted control: with the owner's `unroute` the same drive reads the REAL body, and deleting the shim entirely reds the pin (`expected '{"origin":"REAL"}' to be '{"origin":"SHIMMED"}'`). So a sibling attaches from ITS OWN process (§3.4) and the daemon never has to spawn it — F3 arm (b) is not needed.
- **The scope rule the spike also pins, because §3.4 depends on it:** reach follows the SHIM'S SCOPE, not the connection. A CONTEXT-scoped `route` and a context `addInitScript` (what `_shared/appearance.ts` `installSettingsShim` and the localStorage seeds actually use) BOTH cover a tab the second client opens itself; a PAGE-scoped route does not. Phase 1 therefore keeps every session-wide shim at CONTEXT level, or an attached sibling that opens its own tab silently measures the unshimmed app.
- **(b) Lighthouse — seam found, and it is `snapshot(page)` over an ATTACHED page.** Launch shape: `launchProbeSession({ persistentProfileDir, browserArgs: ["--remote-debugging-port=0"] })` (the `devtools-runtime.ts` shape) + Chrome's `<profile>/DevToolsActivePort` for the OS-assigned port. Engine seam: `puppeteer.connect({ browserURL })` → pick the already-open page → `snapshot(page, { config: { extends: "lighthouse:default", settings: { onlyCategories: ["accessibility"] } }, flags: { logLevel: "error" } })`. No second browser and no navigation, so a session's client state survives the audit. Over a `--file` fixture carrying `<button aria-label="Send">Submit the order</button>`: failed audits = exactly `label-content-name-mismatch` with node count 1, out of 40+ scored audits; the clean twin (`aria-label` containing the visible text) reports zero failed audits with a non-zero audited count; \~2.6 s per snapshot solo. Planted control: swapping the defective fixture for the clean one reds the arm (`expected [] to strictly equal [ 'label-content-name-mismatch=1' ]`). Absence proof: an unreachable debugging port makes the connect THROW, never a comfortable zero.
- **The §6.1 RESULT-pair trap this refutes:** the accessibility CATEGORY score stayed a perfect **1** on the page that fails `label-content-name-mismatch` — the audit carries no category weight. An arm reporting only `lighthouse-a11y=` would print a clean score over a real defect, so `lighthouse-failed-audits=` (with the named audits) is the load-bearing output and is asserted as such.
- **Dependency shape (differs from §6.1's letter, with receipts).** The catalog gains `lighthouse: ^13.4.1` AND `puppeteer-core: ^25.9.0`; both are consumed from the ROOT `package.json` devDependencies, and `tooling/package.json` is untouched until phase 3's arm actually imports them — `pnpm knip` reds an unimported `tooling` dependency (`Unused dependencies (1) lighthouse tooling/package.json`, measured). `puppeteer-core` is not a second driver: `snapshot()` takes an `LH.Puppeteer.Page` and there is no port-only SNAPSHOT door (lighthouse's port-only path is `navigation`, which opens a new tab and navigates), and lighthouse already ships puppeteer-core — pnpm's isolated `node_modules` is what makes the declaration necessary. It only ever `connect`s, so `_shared/browser.ts` remains the one launch site.
- **Naming deviation:** this doc named the file `browser-attach.int.test.ts`; that path is `test-layout`-RED (the tooling mirror arm demands `tooling/src/_shared/browser-attach.ts`, which does not and should not exist — §3.4 homes `attachProbeSession` in `browser.ts`). The `.suite.int.test.ts` kind is the sanctioned mirror-exempt cross-cutting form, and this proof spans `_shared/browser.ts`, Chromium's CDP multi-client semantics and an external engine.

Order: 0 → 1 (∥ 1b) → (2 ∥ 3) → 4. Phase 1 lands first because it is the owner's seed and every later phase attaches to it. Phase 2 and 3 are disjoint file sets. Docs: `UNIFIED-VERIFICATION-DESIGN.md` §3.3b gains the `snap-session` instrument and the explicit-slot form; `Core-Tooling-Law.md` §2.4 gains `ports.ts` / `instrument-argv.ts` rows and §4.4 arms H/I; this doc moves to `history/design/` when the program lands.

### 10.1 Phase 1 as built (lane p-substrate-sessions, #1231, 2026-09-02) — the design re-derived against the tree

Written BEFORE the first edit, per the forge contract. Every §10 row above was re-read against `0d07eeb2a`; the premises that died, the arms chosen, the arms refused and the coupled-site census follow. Memory lessons consulted: `instruments-lie-rendered-audit-hub` (the DevTools-SDK launch IS the session-browser shape; `inheritScenarioSession` IS the partition), `ui-probe-blind-spots-hub` (context-scoped shims reach a second CDP client, page-scoped do not; a Lighthouse category score is not a verdict), `snap-stage-db-is-the-cached-dir` (a finished lane's stage outlives it — a session needs the TTL + sweep the stage lacked), `polling-reaps-your-own-background-task`, `guest-job-pump-outside-the-interrupt-handler` + `membrane-async-ctx-alive-guard` (drain in-flight work at dispose — a close mid-call waits for the call), `then-fn-fn-void-handler-swallows-rejection` (cleanup rides `finally`), `prune-ring-statsync-is-the-concurrency-hole` (T3's preconditions).

**Premises re-derived (receipts).** (1) The spike test is NOT on the phase-1 base — it lives on `wt/agent-ada5787744a20165d` at `2e9deb461`; `tooling-shared-plumbing`'s `scanRoot` is `tooling/src/` only (`tooling-shared-plumbing.ts:157`), so a `connectOverCDP(` in `tests/**` is outside arm H by derivation and the spike needs no allowlist row and no re-home (§2.1 already classes test-owned launches out of scope). (2) `Args.route` defaults to `"/"` (`parse.ts:318`) — there is no "no route given" state, which the live-page call needs; `Args` has ONE literal construction site (`parse.ts:305`; `matrix.ts:56/94` spread). (3) `OPTIONAL_SELECTOR_FLAGS` is containment-pinned against `SELECTOR_VALUE_FLAGS` (`selector-shape.ts:22-26`), so `--session-status [name]` cannot ride that class. (4) `spawnNicedChild` pipes stdout/stderr to the PARENT (`proc.ts:267`) — a detached daemon printing after its booter exits dies of EPIPE; `spawnFullPriorityChild` already has the `logPath` shape (`proc.ts:165,197`). (5) Every op prints through `_shared/artifacts.ts` `print` and `_shared/log.ts` `warn` — the only direct `process.stdout/stderr.write`s under `snap/**` + `_shared/**` are `entrypoint.ts:42`, `run-tool.ts:32,50`, `log.ts:6`, `artifacts.ts:17` (rg, 0 others). (6) `runId()` is minted ONCE per (process, root) (`artifacts.ts:108`) — a second id scheme for the session slot would be a two-homes violation. (7) `finishSession` runs BEFORE the manifest and the verdict (`run.ts:122`) because the trace must stop to have a path — the split is "at the session boundary", not literally "at the try" (below).

**The shape (each row names its enforcer).**

| Decision | Chosen | Refused (why) |
| - | - | - |
| daemon stdio | `spawnNicedChild` gains `logPath` (the `spawnFullPriorityChild` shape); the daemon's stdout IS `<session slot>/daemon.log`; the client relays that log during boot | keep the pipe (EPIPE after the client exits — a `stdout.on("error")` swallow would guard a design defect with a caught-failure site) |
| per-request output | an output SINK in `_shared/log.ts` (`installOutputSink`) that `print`/`warn` tee through — the log keeps everything, the in-flight request's socket gets its lines, in order, so RESULT stays last | patch `process.stdout.write` (an ungreppable global mutation); make `runOnSession` return lines (every op prints through `print` today — one implementation means the daemon captures the SAME calls) |
| registry | repo-keyed `<main>/.cache/snap-session/<name>.sock` + `<name>.json` (the ROW: owner checkout · daemon pid/pgid · slot dir · cdp endpoint · environment · stamps · in-flight op); the slot `reports/runs/snap-session/<runId>/` is opened by the DAEMON so its `.inflight` pid is the daemon pid by construction | the row inside the slot only (a foreign checkout cannot see the owner's `reports/`); `runId = name + stamp` (a second mint beside `runId()`; the name lives in the row and `abandonedRuns` joins on `slotDir`) |
| CDP endpoint | always on: the daemon launches with a persistent profile + `--remote-debugging-port=0`; new `_shared/debugging-endpoint.ts` (profile + `DevToolsActivePort` reader) consumed by `devtools-runtime.ts` in place of its private `debugPort` — ONE reader; a `--cascade` boot reuses the cascade runtime's profile | launch plain, add the port later (Chromium cannot); keep the reader private (two copies, and `devtools-runtime.ts` is at 430/450) |
| attach | `attachProbeSession(endpoint, environment)` returns a full `ProbeSession` whose contexts carry `owned: false`; `closeProbeSession` closes only owned contexts (a disconnect is not a takeover — the spike's `second.close()` receipt) | `contexts: []` (every consumer reads `session.contexts`; `readSnapEnvironmentEvidence` throws on zero) |
| per-call slot | `beginInstrumentRun(instrument, root, { slotDir })` ADOPTS the client's slot (no marker, no publish at finish — the OWNER publishes); `adoptRunSlot` is the pure builder the sweep also uses to settle a dead session's marker (`publishRunSlot(root, slot, [])`) | the daemon opening a second slot per call (the client's `run slot` line would name a slot nothing writes into) |
| evidence windows | every session call is a window `[callStart, callEnd]` over the daemon's rings — the scenario's `ScenarioEvidenceRange` shape, set as `outcome.evidenceRange` when the call did not ask for `--checkpoint`; call 1 starts at 0 so its RESULT is one-shot-identical (T9); `session.requests` rolls into the daemon's lifetime `requestLog` before every later call | forcing `--checkpoint` (changes call 1's pairs; needs `__orb`) |
| argv protocol | the client strips `--session <n>` / `--session-ttl <n>` (`stripSessionFlags`, pure) and forwards the rest verbatim; the daemon re-parses with `parseSnapArgs` (validation has ONE home) and merges through `inheritSessionArgs` — the scenario partition promoted to `lib/session-plan.ts`; a later call carrying a `SESSION_ONLY_FLAGS` member is refused by an exact argv scan (exit 3) — the boot call is exempt because its argv IS the boot argv | re-implementing the scanner to strip session flags client-side |
| `json` / `out` | per CALL (each call is a run; the scenario's `json: global` is a per-RUN fact) — the one documented override on top of the partition | — |
| targets | `--file`/route are CALL-level targets (`routeGiven` on `Args`); a call with neither drives the LIVE page (`navigatePage:false`, `__orb.resetEvidence` when present — the `keepLivePage` shape), refused (exit 3) while the session sits at `about:blank` | a route-less default of `/` (silent re-navigation — the P2 defect wearing a socket) |
| ownership / cap / TTL | F4: the DAEMON judges `request.checkout`; the client pre-checks the row. Cap: rows whose pid is live, box-wide across checkouts, checked by the client before spawning and re-checked by the daemon at boot. TTL: a daemon timer reset by `call`/`ping`, never by `status`; unscaled (IDLE class, §7.1) | — |
| busy | `call`/`close`/`export` serialize; `status`/`ping` always answer (read-only, no page drive) | refusing `status` while busy (the cap/status reads would block on one lane's long call) |
| close / sweep | `close`: a live daemon finishes the in-flight call, then `finishSession` → row + socket removed → session slot finished; a dead one is reaped (group kill by pgid, socket/row removed, marker settled). Sweep: dead → reap; live idle > TTL → reap; live under TTL → report; orphan sockets/rows/abandoned slots reconciled | — |
| export | **Historical phase-1 shape, now superseded:** the client's slot received the four diagnostic rings and phase 1 deferred trace/HAR because a per-call stop would end a live session's tracing. The active session-evidence lane closes that deferral at the session lifetime and exports the retained trace/HAR into a call slot without closing the owner. Its implementation and behavioral receipt are the authority for exact artifact names; this historical row deliberately does not mint a second filename contract. | stopping trace/HAR per call (ends the live session's evidence); leaving the deferral open (an export that omits the browser-lifetime evidence is incomplete) |
| phase-1 refusals | `--session` with `--matrix`/`--scenario`/`--contexts`/`--as` (F10: phase 3); `--cascade` on a later call (boot-level runtime); `--session-daemon` is internal (help says so) | — |
| gate arm H | `<engine>.connectOverCDP(` AND `<engine>.connect(` (Playwright's websocket attach, the §9-refused alternative) outside `_shared/browser.ts`, within the gate's `tooling/src/` scan; puppeteer's `connect` is phase 3's call | widening the scan to `tests/` (test-owned browsers are out of the substrate by §2.1) |
| budgets | `SESSION_BOOT_TIMEOUT_MS` (240 s — the launcher's own readiness ceiling) + the ready poll live in `lib/session-plan.ts` as BASES; no per-call ceiling in phase 1 — 1b wraps them in `budget()` (§7.1) | minting a budget in `snap/lib/budgets.ts` (1b's file) |
| `--stage-status` | gains one `sessions :` line (§3.8's third reader) | — |

**Coupled-site census (expect every one to move).** `snap/contract/types.ts` (`Args` +9 session fields + `routeGiven`) → `ops/parse.ts` (the one literal; `sessionValidationPairs` rows; the `OPTIONAL_NAME_FLAGS` scanner class; `routeGiven` in the loop) → `ops/flags-classes.ts` → `ops/flags-session.ts` (new, spread into `FLAG_HANDLERS`) → `contract/help.ts` (a `Sessions` block; the existing help pins in `tests/tooling/snap/index.test.ts:541` keep their literals) → `cli.ts` (`main(opts, argv)`; the daemon verb dispatches BEFORE `withInstrumentRun`; the client verb INSIDE it) → `index.ts` exports → `ops/run.ts` (`runOnSession` split; `runSnapDetailed` = launch + run + finish) → `ops/capture.ts` (`capturePages` gains the navigate flag) → `ops/scenario.ts` (partition + refusal rows moved to `lib/session-plan.ts`) → `ops/session.ts` (`launchSnapSession` `debuggingEndpoint` extra + `debuggingEndpointFor`) → `ops/stage-status.ts` (the sessions line) → `_shared/{proc,log,artifacts,artifact-out,browser,devtools-runtime}.ts` + `_shared/debugging-endpoint.ts` (new) → gate `tooling-shared-plumbing` (arm H + rows) → docs (`UNIFIED-VERIFICATION-DESIGN.md` §3.3b, `Core-Tooling-Law.md` §2.4/§4.4, `Core-Enforcement-Active-Gates.md` row, this doc) → ledger (`docs/reviews/caught-failure-ownership/population.json` re-derived; the test-baseline manifest that once took +2 specs is DELETED, #2217 — every touched `_shared` file carries rows).

**Test plan.** `tests/tooling/snap/lib/session-plan.test.ts` pins the pure core both ways (partition, refusal rows, `sessionAccess` all four cells, name validation, limits from env values, the DEAD/cap/foreign texts, sweep verdict, `stripSessionFlags`). `tests/tooling/snap/ops/session-daemon.int.test.ts` drives the REAL cli over `--file` fixtures with a scratch registry home (`ORB_SNAP_SESSION_HOME`) and a tiny cap/TTL from env: T1 (A `--viewport 412x823` reads 412, B reads 1280 — plus the one-shot twin as the FENCE it is), T2 (SIGKILL A → `SESSION DEAD … mid-` exit 2; `abandonedRuns` names A not B; sweep reaps + settles; B survives), T3 (two sessions, one `--out`, both slots keep the PNG, the pointer names a FINISHED run), T5 (TTL 0.05 min → dies; a half-window call keeps it past 2× the window), T6 (cap 2: the third boot exits 2 naming both with idle ages; closing one admits it), T9 (one-shot vs session RESULT pairs identical except `out`; a planted contrast defect reds both), plus busy (exit 2 naming the op), foreign (a `git init` scratch checkout is refused naming owner/pid/idle) and attach (`attachProbeSession` drives the live page and the owner survives). Gate arm H: conformance rows (planted `connectOverCDP(`/`connect(` outside the home flag; inside passes) via `gate-conformance.int`. Red-first: the new suite against the unmodified cli reds on `unknown flag --session` (the trivial red); the load-bearing reds are the planted controls above.

**Forks stated (defaults taken, escalated in the report).** (a) Scenario checkpoints keep SILENTLY inheriting `--viewport`/`--dark`/… from the outer command (today's behaviour); sessions REFUSE the same flags loudly. Default: leave scenario byte-stable (a value change owes its own sweep), unify in phase 4. (b) The session slot's run id stays the house scheme (`<checkout>-<pid>-<stamp>`) instead of `<name>-<stamp>`; the name is the row's. (c) `--session-export` carries rings only, no trace/HAR, until phase 3.

### 10.2 Phase 2 as built (lane p-stage-bands, #1276, 2026-09-02) — the band table, re-derived against the tree

Chunks 1–2 of the row (`8f853fb55`, `2d8e7f628`) had already landed `_shared/ports.ts` + gate arm I, so the
NUMBERS existed and were protected; this chunk is the table that allocates them. Every §3.6 sentence was
re-read against `3876705f6` before the first edit.

**Premises that held.** `stage-plan.ts:35`'s single `ACTIVE_REL`; `bandAccess`'s four verdicts; the #324
heartbeat; `stack.sh:441`'s `served_probe` (reached as `node prod-entry.ts served-probe` with `VITE_PORT` —
a shell FUNCTION, not a `stack.sh` verb, which is why the stage spawns the node entry directly).

**Premises that died, with receipts.**

- **`ensureStage({ band, session })` (the §10 row's phrasing) is the wrong seam.** A caller cannot name a
  band — that is the allocator's whole job — and the session is bound by the DAEMON after
  `configureStage` has already repointed `bootArgs.base`. `EnsureStageOpts` is therefore unchanged, and the
  binding is `bindSessionToBand(home, urlStageBand(base), name)` in `ops/session-daemon.ts`. The base names
  the band (port-keyed), which is the one fact both halves of the substrate already agree on.
- **The stage path is fully SYNCHRONOUS** (`spawnSync` boots, `ss` probes, `writeFileSync` rows) and
  `probeServedTransform` is async. The third probe is a CHILD (`node <stageDir>/tooling/src/stack/ops/
  prod-entry.ts served-probe`, cwd + `VITE_PORT` = the stage's), i.e. the same door `stack.sh` uses, run
  against the STAGE'S OWN COPY so the comparison is that tree's disk source against that tree's vite.
- **`--stage-down` could no longer mean "the stage".** With ten rows it has to select; the honest default is
  the rows THIS CHECKOUT owns, with `--force` extending it to a sibling's (the #447 refusal is unchanged for
  a foreign LIVE row). #108's cross-checkout teardown SURVIVES — its input changed, again.
- **`ss` per band would be twenty forks and could disagree with itself mid-read** (a band free at question 3
  and bound at question 11). `listeningPids()` answers once; every band verdict reads that snapshot.

**Arms chosen (and why).**

- **The claim is written INSIDE the lock, before the boot.** `withBandsLock` is a mkdir mutex (atomic
  everywhere we run) held across read → decide → claim only; the 55 s boot happens outside it. Two lanes
  entering a millisecond apart therefore see each other's ROW, not each other's intention. A lock whose
  holder pid is gone, or which is older than 30 s, is broken rather than inherited — a crashed allocator
  must not wedge the box.
- **The third probe is asked only of the stage whose source can change.** A `--ref` stage is a frozen
  detached worktree whose watchers never fire (that immunity is why `--isolated` exists), so a dead watcher
  there has nothing stale to serve; the probe could only answer `fresh`/`unverifiable` at the cost of a node
  child on every snap call. §3.6 already grants a `--ref` stage exactly this exemption for the ERA half of
  the rule, and the same "never HMRs" fact is what makes it sound for the freshness half. An `unverifiable`
  is `degraded` for a `--dirty` stage and `warm` for a `--ref` one — the asymmetry is the rule, and both
  arms are pinned.
- **`shortSha` and `baseUrl` left the row.** Both are functions of `sha`/`vitePort`; a serialized copy of a
  derived value is a second home that drifts. Consumers derive them through `#snap` (`shortSha`,
  `stageRowBaseUrl`).
- **Two modules were split off at the line cap** (`Core-Tooling-Law.md` §4.3): `lib/stage-bands.ts` (the
  table's pure rules — limits, strand, allocator, health) and `ops/stage-source.ts` (populating a stage
  dir: the isolation asserts, rsync, install, db seed, worktree add/remove). `ops/stage-census.ts` is the
  new seam that observes the box and performs the locked acquire.

**Arms refused.** The §10 row's "sibling tools gain `--session` (attach)" is NOT in this chunk: it is the
attach half of §3.4 and rides phase 3's endpoint work (lane p-arms-registry holds `ops/session.ts`,
`ops/lighthouse.ts` and `_shared/debugging-endpoint.ts`). `#1162` (launcher survivors) and `#1186` (`--base`
fencing) were already CLOSED; #1186's mechanism is preserved and widened from one hardcoded pair to the whole
range (`stageBandClaim` now takes the row set and keys off `stageBandForPort`). Fork F7's
`--stage-down --stage-owner <checkout>` is NOT built: the owned-rows default plus `--force` covers the ruled
behaviour, and a third selector with no caller would be speculative — if the orchestrator wants per-band
selection at drain, it is a small follow-on.

**Coupled-site census (all moved).** `contract/stage.ts` (`ActiveStage` → `StageRow` + band/sessions/
dbProvenance/rsyncs; `StageBandsFile`, `StageBandView`, `StageAllocation`, `StageHealth*`, `StageLimits`) →
`lib/stage-plan.ts` (per-row access/consent/claim; `BANDS_REL` + `LEGACY_ACTIVE_REL`; `stagePorts` retired
for `stageBandPorts`) → `lib/stage-bands.ts` (new) → `ops/stage-marker.ts` (the table, the mutex, the
one-time legacy read) → `ops/stage-census.ts` (new) → `ops/stage-source.ts` (new) → `ops/stage.ts`
(allocate → claim → boot; `stopStage` takes the row's ports) → `ops/stage-status.ts` (all-band listing,
per-band sweep/teardown) → `ops/stage-probe.ts` (one `ss`, the three probes) → `ops/guards.ts` +
`ui-audit/ops/stage.ts` (derive the base URL) → `ops/session-daemon.ts` + `ops/session-registry.ts` (the
band binding + `liveSessionNames`) → `snap/index.ts` → `biome.json` (the existing `snap/ops/stage.ts`
naming-convention row gains `stage-probe.ts`, same env-object reason) → ledgers.

**Test plan as landed.** `tests/tooling/snap/lib/stage-bands.test.ts` (20 arms, pure): limits + their named
refusals, the strand rule with the live-session fence in BOTH directions, all five allocator arms in §3.6's
order, the exhaustion text naming every row with its idle age, and the health verdict including the
`unverifiable` asymmetry and the ERA rule. `tests/tooling/snap/ops/stage-marker.int.test.ts` (13 arms, real
files + real child processes): the table's shape, row-drop validation, the one-time legacy migration (and
that a second read does not resurrect it), FOUR concurrent processes claiming FOUR distinct bands with a
single-process positive control, and the live-session fence end-to-end — a child binds its name onto the row
and registers a session whose daemon pid is ALIVE (its own), and the six-hour-idle row still reads `live`;
the same child with a dead pid reads `stranded`. `stage-plan.test.ts` keeps what stage-plan still owns.

**What phase 2 does NOT prove.** Every arm here is hermetic by construction (design §8: a committed proof
never boots the dev stack), so "two stages actually serving on two bands" is a LIVE receipt the orchestrator
owes at the barrier, not something a suite can carry. The allocator half of that claim is pinned; the boot
half is `bootOntoBand`, which is one `stack.sh start` per band with no shared state but the table.

### 10.3 Phase 3 as built (lane p-arms-registry, #1277 + #1259, 2026-09-03) — where §6 had to widen

§6's `ArmDef` was written from the two NEWEST arms (`lighthouse`, `requests`), and the nine older ones
did not fit it. The worked-arm exercise did its job: each mismatch below is a member that WIDENED so the
contract describes real arms, and the byte-stability receipt is what proves the widening changed nothing
an operator sees.

| §6 as sketched | As built | Why |
| - | - | - |
| `run: (ctx) => Promise<TOutcome>` | a `lifecycle` UNION: `at: "page"` (the settled-surface pass, once per `--pages` tab, writing its slice of that tab's `CaptureOutcome`) or `at: "run"` (a `begin(session, opts)` instance spanning the run) | `--requests` MUST wire its listeners before anything navigates, and `--cascade` needs the whole browser's SDK runtime. One `run()` would have lost the pre-navigation attach or given nine page arms three empty hooks. Exhaustively dispatched, so neither can be forgotten |
| `failures: (outcome) => number` | `failures(): Partial<Record<keyof SnapFailureSummary, number>>` | `dead-css` owns TWO independent summary members (dead tokens, empty rules). `ops/verdict.ts` reads each by name and THROWS when its arm did not produce it |
| `needs: { debuggingPort, devtoolsSdk, trace, requestRing, quietBox }` | `needs: (opts) => ArmNeeds` with **only** `debuggingPort` and `devtoolsSdk` minted | those two have a live consumer at the ONE launch site (`prepareLaunchProfile`). The request ring IS the `at: "run"` mint; the load withhold is per INSTRUMENT (`_shared/load-budget.ts`); nothing reads `trace`. A `needs` member nothing consumes is the declaration-without-enforcement this registry exists to delete. It is a FUNCTION of the argv so an ordinary run launches byte-identically |
| `export const ARM_DEFS` in `contract/arms.ts` | the TYPES in `contract/arms.ts`, the RECORD in `ops/arms/registry.ts` | the record holds run functions and must import all eleven arm modules, which import the arm types — one file would be a value module in a cycle with every arm |
| `ARMS` listed in prose order | `ARMS` IS the page-pass execution order (`dead-css → aria → eval → contrast → map → assert → perf → shot`, then the run arms) | a second ordering list beside the roster is a second home for one fact, and the order is load-bearing: every settled-surface read happens before the shutter |
| (not sketched) | `defaults: () => Pick<ArmArgs, …>` + `armArgDefaults(): ArmArgs` spreading all eleven BY NAME | the tsc fence for the parse: `Args` splits into `ArmArgs`/`NonArmArgs` (`contract/arms.ts`), so `ops/parse.ts` refuses to compile when an arm stops defaulting a field it owns. A factory, not a literal — several arms default to a fresh array |
| (not sketched) | the RESULT-line LEDGER (`armPairLedger`): `ops/run.ts` CLAIMS the pairs whose position is historical, and `rest()` appends the unclaimed in `ARMS` order | the line's field order is a contract with every script that greps it, so the pairs could not simply be concatenated. A claim for a pair its arm did not produce THROWS |

**What is derived now** (each had a hand-maintained twin before): the four scanner classes
(`ops/flags-classes.ts` — the optional-selector and optional-value classes turned out to be ENTIRELY
arm-owned), the handler table (`...armFlagHandlers()`), the parse defaults, `SESSION_ONLY_FLAGS`'s arm
members (from `level`), the launch provisions (from `needs`), the RESULT pairs, the verdict members, and
`SNAP_HELP`. Help was the loudest gap: `--no-deadcss`, `--mask`, `--full`, `--aria`, `--aria-depth`,
`--aria-boxes` and `--contrast-pixel` had NO operator row at all, and nothing could have caught that.

**#1259 closed here.** `lighthouseEndpoint()` reserved a loopback port and launched with
`--remote-debugging-port=<n>` while a session launched a persistent profile with `=0` and read
`DevToolsActivePort` back — two writers of one launch argument, last-wins and silent, which is why
phase 1 could only refuse the pair. The reserving path and `lib/loopback-port.ts` are DELETED, the
refusal row in `sessionModeValidationPairs` with them, and `debuggingPortFor` reads the one profile.
Live receipt: booting a session on a clean `--file` fixture, planting `aria-label="Zzz unrelated"` on its
LIVE page through a later `--eval` call, then `--session p-arms --lighthouse desktop` reported
`label-content-name-mismatch` (failed-audits=4) while a one-shot audit of the same FILE reported 3 — the
arm read the session's browser, not a second one.

**Byte-stability receipt.** 25 CLI invocations covering every arm and its refusals, captured on the
pre-change tree and on this one: full normalised stdout+stderr byte-identical, RESULT lines
byte-identical, `--json` manifest key set unchanged. `--help` gained the seven missing rows above and one
five-word wording fix. The receipt was proven deterministic first by capturing it twice on the unchanged
tree. **A defect it caught:** the ledger's claim key was minted by two separate template literals, one of
which carried a NUL byte where its separator belonged, so nothing matched and every arm's pairs printed
TWICE at the tail of an otherwise perfect RESULT line — invisible to tsc, biome and every suite.

### 10.4 Phase 4 and final reconciliation as built (#1282/#1287/#1289/#1290, 2026-09-03)

The four recovered slices were folded by exact commit, then re-derived against the whole document rather
than treated as completion evidence. That audit found and closed six remaining substrate defects: the
session-cap check now reserves a boot slot atomically; stage-table heartbeats use a lock plus atomic rename;
a vanished half of a stage pair stamps both registries DEAD and the next call refuses (T4); a session call
has a per-call watchdog that preserves the next call (T17); foreign teardown is owner-targeted per band
(`--stage-down --stage-owner <checkout> --force`, F7); and CT opens exactly one invocation slot whose reporter
publishes the final marker and screenshots.

F10 is the session path, not a parse-only permission: discovery uses the daemon's context and every rated
cell opens a disposable isolated context in that same Chromium. The daemon passes the fully inherited
session binding into the matrix, so a call cannot silently fall back to `:5173`. The matrix context owns its
device/media/settings contract and capture rings, closes after its cell, and leaves the session owner usable.

The five rendered tools now expose the total grammar families in §4: `--help|-h`; the WHERE flags
`--base|--isolated|--ref|--dirty|--fresh|--session`; the environment flags
`--viewport|--wide|--mobile|--desktop|--dark|--light|--reduced-motion`; and the artifact flags
`--out|--json`. The three family tables are consumed by every parser through a planted roster control, so
adding a family member makes all five parsers refuse until they accept it; tool-specific meaning stays in
the five grammars rather than a generic magic parser. Motion's retired OS spellings and design-audit's old
`--wait` spelling refuse by name with the replacement; there are no aliases. Snap also refuses competing
stage sources/locations before boot and derives a help-completeness control from its accepted handler
table. The proposed browser-MCP string gate is deliberately absent per the #1279 owner ruling recorded in
`1195-devtools-mcp-retirement.md`.

The final cold-context verification planted the exact controls the first audit found missing. T4 now
boots a real daemon-bound stage, kills one listening half, proves the next call's sticky refusal and both
registry stamps, then proves status/sweep free only that band while the daemon survives. F10 boots a real
session on a non-default loopback origin, runs all 16 scenario-matrix cells in disposable contexts, proves
the inherited origin and empty per-cell storage, and proves the owner page survives with its original
storage. Those controls exposed and fixed the outer daemon watchdog racing a legal cold navigation, the
daemon's lost inherited matrix binding, scenario cells escaping into one-shot browsers, and matrix
discovery reusing the owner context.

The re-derived Claude A/B Chrome-MCP census found one further arm gap in the retirement dependency: its
single performance trace was a pre-navigation boot trace, not the already-built post-settle interaction
profile. `perf-meter --boot-trace` now begins Chromium tracing before navigation, retains the raw trace,
and refuses unless Lighthouse's shipped DevTools trace engine yields a positive LCP plus all six observed
insight families. `1195-devtools-mcp-retirement.md` carries the exact census correction, control, and
limits.

The CT run slot is one transaction directory per `pnpm test:ct` invocation. The launcher mints it and
passes it through the environment; Playwright adopts it; workers write beneath its `snaps/`; and the flaky
reporter publishes `.published` plus `ct-flaky.json` after the run. No config-load/list operation mints a
slot, and no worker/reporter creates a second one.

### 10.5 React development-renderer arm (#1284, designed before implementation 2026-09-03)

**The collapse.** This is not a React DevTools frontend and not another browser instrument. It is one
Snap run arm over the existing Playwright-owned context: install the compatibility hook before the first
document mounts, retain the development renderer's read-only Fiber evidence, and file that evidence in the
call's existing slot. No React DevTools extension, standalone frontend, product build change, second
browser, or dependency on the retiring `motion-audit`/`perf-meter` command parsers enters the design.

**Why the run lifecycle widens.** `begin(session, opts)` is synchronous and `measure(ctx)` is after
`capturePages`; neither can honestly await `BrowserContext.addInitScript` before navigation. Every run
instance therefore gains a REQUIRED async `prepare()` member, and `RunArms.prepare()` walks every run arm
in `ARMS` order immediately before `capturePages`. Existing arms implement a no-op. The profile arm uses
the seam to install on every context with `owned !== false`; attached sibling contexts are observed by
their owner and never mutated. A planted runtime lifecycle assertion rejects a run-arm instance with no
`prepare`, in addition to the TypeScript required-member fence, so a future cast/JavaScript row cannot
quietly enter after navigation.

`--react-profile` is a **session-level** flag. The boot call must carry it because React calls `hook.inject`
while loading `react-dom`, before any later call can repair the missed mount. The session partition carries
the boot value into every call; later attempts to add it are refused by the already-derived
`SESSION_ONLY_FLAGS`. On a later call to an already-profiled document, `prepare` opens a new call window
over the retained commit stream; a navigation receives a fresh init-script collector. This keeps global
commit ids and timestamps useful while each artifact reports only the call that produced it.

**React 19.2.7 capability census and retained evidence.** The installed development renderer accepts a
hook with `supportsFiber`, calls `inject(internals)` with renderer package/version metadata, then calls
`onCommitFiberRoot(rendererId, root, priority, didError)` before clearing `root.memoizedUpdaters`. The arm
retains these machine-useful facts, bounded and cycle-safe:

This is a deliberately narrow compatibility contract, not best-effort private-API archaeology. A renderer
must identify as `react-dom` 19.2.x development and the first committed root/composite Fiber must carry the
19.2 profiling fields the collector consumes (`actualDuration`, `treeBaseDuration`, links/tags and the
root shape). An observed package/version outside that fence or a failed shape invariant is an evidence gap
and exits 2 with the observed package/version and failed invariant. The arm never emits plausible junk
from a renderer it has not proved compatible.

| Capability | Retained agent-readable evidence | Limit / honesty rule |
| - | - | - |
| renderer and document identity | page/renderer ids, owning context id, URL, renderer package/version, hook/inject timestamps | multiple pages and renderers are exercised and never merge anonymously. Public `--contexts` is excluded below, so context id records ownership rather than claiming a multi-context analyzer mode |
| component tree | flat topology records with stable id, parent/child ids, tag/kind, display name, key, derived path, owner id/path and development source stack | source is React's development `_debugStack`, not a source-map reconstruction; host nodes remain in raw evidence but not the hot-component ranking |
| props/state/context/hooks | bounded read-only previews of memoized props, class/root state, context dependencies and indexed hook slots | hook *names* and custom-hook source stacks require the DevTools backend's inspect protocol and are not invented; redaction/truncation markers are evidence, not silent deletion |
| commit profiling | commit id/time/priority/error flag; per-fiber `actualDuration`, `treeBaseDuration`, subtree time; ranked composite path totals/count/avg/max/self | self time follows React's own development rule: start at `actualDuration`, subtract direct child `actualDuration` only on mount or when child identity changed, then clamp floating-point noise. It is scheduling/profiler time, not CPU attribution |
| render reasons / updates | mount vs update; shallow changed prop names, state/context/hook slot indexes, `PerformedWork`, and the root's memoized updater ids/paths | an unchanged shallow preview is reported as `rendered-without-shallow-change`, never a made-up reason; deep equality is not claimed |
| Suspense and errors | Suspense/dehydrated/offscreen state from fiber tags/memoized state, `didError`, captured class error state and development debug info | the arm observes boundary state; it does not force errors, retry Suspense, or mutate fallback visibility |
| React 19 performance tracks | React-related User Timing measures plus raw Chromium trace events for Components/Scheduler tracks, correlated by monotonic timestamp to call/commit ids | trace event availability is reported as its own count. Hook/renderer/commit denominators are mandatory; an absent optional track family is named, not allowed to erase valid Fiber evidence |
| schedules/unmounts/post-commit | hook schedule, unmount and post-commit events, plus commit updater membership | React exposes no stable full causal update graph through this hook; the artifact says `update-events`, not “why-did-you-render truth” |

The arm deliberately excludes selection, highlight/overlay, inspect-element UI state, edit/delete/rename
props/state/context/hooks, force-error/Suspense controls, standalone frontend panels, and extension install.
Those are human UI or mutating controls. The injected renderer internals expose several of them, but merely
having a callable private method is not an agent evidence requirement. Ordinary production-build support is
also excluded: Snap's rendered surfaces are Vite development/stage surfaces, the contract this program owns.
Compiler-eliminated source components are fundamentally unobservable because no Fiber exists to inspect;
the artifact describes the compiler/memoization output that actually mounted. The real Vite TSX control
requires `_debugStack` to name `main.tsx:<line>:<column>`, which is already a usable development source
location without building a second source-map pipeline. Hook names and custom-hook stacks require a
DevTools-style dispatcher patch that shallowly re-renders the inspected component. That would contaminate
the measured profile, so it is excluded from the rated arm. If an operator ever needs it, it must be an
explicitly separate, non-rated inspect mode whose receipt says that it invoked component code; it cannot be
a post-measure enrichment silently attached to this artifact.

**Artifacts, result and refusal.** The ranked table prints hottest composite paths first and names its
raw profile artifact and raw browser-trace artifact. The profile artifact preserves complete bounded
commit topology as flat Fiber records with parent/child ids, inspection previews, events, identities,
caps and every truncation marker. RESULT always says
`react-profile=off|REFUSED|<artifact>` and, when enabled, prints renderer/commit/component/update/track
counts. Hook absent after prepare, no owned context, zero renderer, zero commits or zero ranked components
is an evidence gap and exits 2; no empty profile can read clean. Trace-track absence is explicit metadata,
but does not veto a non-empty Fiber profile because the development renderer hook is the primary source.

The writer additionally files a bounded `snap-react-profile-summary-v1` sidecar containing counts,
gaps, limitations, the declared collector limits, the hottest 20 component rows, and separate pointers
to the complete raw Fiber and trace artifacts. The browser-free `snap --report --arm react-profile`
reader consumes only this sidecar for its five-row hot table; it never parses or duplicates the complete
raw Fiber population merely to answer a cold-agent overview.

**Coupled-site inventory.** `contract/arms.ts` (roster, `ArmArgs`, required `prepare`) →
`ops/arms/registry.ts` (profile row import/default spread, aggregate `prepare`, runtime lifecycle assertion)
→ every existing run-arm instance (no-op prepare) → `ops/run.ts` (the single pre-navigation await)
→ `contract/types.ts` (`Args.reactProfile`) → `lib/session-plan.ts` (boot inheritance) →
`ops/arms/profile.ts` (collector, trace, aggregation, artifacts, report/refusal) → registry/help/result
derivations → the registry roster/completeness tests and profile behavioral suite. `capture.ts`, the five
parsers and sibling command implementations do not gain a React branch.

**Planted controls.** (1) A local loopback Vite fixture imports this repo's React 19.2.7 development
renderer. `HotComponent` performs deterministic render work beside a clean twin; an interaction schedules
an update. The artifact must rank the named hot path above the twin and carry non-empty tree,
props/state/context/hook/change/updater/boundary/timestamp evidence. (2) Two pages prove page identity;
the session continuation proves the boot-installed hook survives and opens a second call window. (3) A
plain Vite page proves hook-with-no-renderer refuses; a page that imports the renderer but never commits
proves renderer-with-no-commit refuses; deleting the installed hook before measure proves hook absence
refuses. (4) The lifecycle mutant with `prepare` deleted must throw before navigation. (5) A trace positive
control must find React Components/Scheduler or User Timing events before a non-zero track count is trusted;
if the installed Chromium does not expose them, the artifact states that measured limit and the control
pins zero as an explicit optional population, not fabricated success.
(6) A ReactDOM 18.3 injected renderer and a claimed ReactDOM 19.2.7 root missing `actualDuration` both
refuse, proving the version and shape fences can fail. The real Vite fixture asserts a hot Fiber source
stack names `main.tsx`, rather than merely asserting that some opaque debug stack exists.

**Alternatives rejected.** Vendoring `react-devtools-core`/the frontend duplicates a human inspection UI,
adds a private protocol/dependency and still needs the same pre-mount hook. `<Profiler>` alone already feeds
`__orb.renders()` at a few composition points but cannot produce the all-component nested tree. Installing
the hook from `measure` misses the initial mount. A generic hook framework or second capture path creates a
new substrate when one required lifecycle verb solves the real gap. Making trace events the sole profiler
would lose props/state/context/owner identities and make browser trace schema the React contract.

**Recovery note (program state at this design point).** #1284 is the React arm. #1292 is the claimed P1
sole-rendered-instrument program and #1293 its claimed migration child; #1293's mandatory red-first
behavioral tier is `pnpm test:scoped tests/tooling/snap/ops/unified-instrument.suite.int.test.ts --maxWorkers=1`. The independent verifier must still inspect every retained capability population and all
three refusal arms before #1284 closes; typecheck/Biome/structure alone are not graduation.

### 10.6 Sole rendered-instrument CLI and analyzer lifecycle (#1292/#1293, designed 2026-09-03)

**Premise re-derived, not inherited from the issue.** Snap already has the one browser/session capture
path and a real pre-navigation run-arm seam: `runOnSession` mints the registry once, awaits `prepare`, then
enters `capturePages` (`tooling/src/snap/ops/run.ts:98-103`). The remaining duplicate is exactly the
browser DRIVE window: capture navigates, drains one argv-ordered tape, settles and runs page arms in that
order (`tooling/src/snap/ops/capture.ts:57-89`), while the legacy motion and performance commands still
own their own parser, stage resolution, launch/attach and run closure. The current Snap arm roster also
uses `perf` for its always-on navigation snapshot and `profile` for React
(`tooling/src/snap/contract/arms.ts:37`), while the required public vocabulary is selective
`--perf`/`--react-profile`. Those names must be separated rather than quietly overloading the old pair.

The tracked active-corpus baseline is 7,717 files across `tooling/`, `tests/`, `packages/`, `scripts/`,
active `docs/`, `.claude/`, `.Codex/`, `.codex/`, `.agents/` and root `package.json`, excluding only
`docs/history/**`, `docs/reviews/**` and generated catalog receipts. It currently contains 27 command
lines in 24 files for the retired `pnpm motion-audit`, 23 in 19 files for `pnpm perf-meter`, 13 `--cpuprofile`
lines, 28 `--selector` lines and 14 `--window` lines. These are the migration population, not a guessed
list from the issue. The completion census re-derives the tracked list through Git and plants one stale
command and each retired flag spelling into its own in-memory fixture so a zero cannot pass vacuously.

**The lifecycle widening.** `prepare` remains the only pre-navigation context mutation. A run instance
adds four required, total verbs around the existing single drive, all called in registry order:

1. `afterNavigation(page, identity)` — the page has navigated and passed readiness/theme gates, but no
   argv action has dispatched. Boot trace stops here; it never absorbs the interaction tape.
2. `beforeAction(page, indexedAction)` — the action remains Snap's action and executes once. Perf marks
   every non-pause action here; CPU profiling starts at the first measured action; the motion trace starts
   only at the tagged measured-motion action.
3. `afterAction(page, indexedAction, dispatch)` — the same action's result is known. A tagged motion
   action owns its configured observation settle and closes its trace here before the next tape member.
4. `afterActions(ctx)` — post-drive analyzer closure before the ordinary settled page-arm evidence. CPU
   profiling stops here so settle/page-arm work cannot leak into its tape window. Existing `measure(ctx)`
   remains the single settled export/report preparation seam after capture; renaming it would be churn and
   would erase the useful distinction between “close the measured window” and “file settled evidence.”

The aggregate registry supplies no-op implementations for an arm that has nothing at a seam, and the
runtime completeness assertion checks all four in addition to `prepare`, reporting, denominators, pairs
and exit. `capture` receives the one aggregate lifecycle; it does not import or branch on motion/perf/CPU
names. There is no second action dispatcher. `DriveActionReceipt` records tape index, page, kind, label,
start/end monotonic time and failure; every analyzer keys its raw evidence to that receipt.

**`__orb` / browser-native source crosswalk.** One authoritative source answers each fact; the shared
lifecycle may correlate sources, but it never resets or captures the same population twice.

| Fact | Authoritative source and lifetime | Snap consumer / overlap resolution |
| - | - | - |
| cheap settled overview | `__orb.snap()`, one settled-page read (`app-snapshot`) | always-on navigation/app snapshot only; its coarse perf/render/error counts are not the selective `--perf` interaction verdict |
| coarse region render heatmap | `__orb.renders()`, checkpoint lifetime | retained inside app-snapshot/diagnostic evidence; `--react-profile` is the all-Fiber pre-mount-through-commit source and does not merge the coarse regions into its ranking |
| browser/runtime failures | Playwright/CDP diagnostics plus the typed `__orb.consoleErrors()` ring, evidence-window lifetime | browser diagnostics reconcile both named channels and their caps/drops; app-snapshot's count is an overview, never a second diagnostics capture |
| motion/animation facts | `__orb.motion()`, `animations()`, `flags()`, `resetEvidence()`, `motionFlaggersSettled()`/`Drain()` and `setMotionAuditDropTrackingPaused()`, one tagged motion window | the retained motion `runAudit`/drive seam consumes these app-internal classifications; CDP PipelineReporter is authoritative only for browser frame delivery/drop facts |
| appearance matrix | `__orb.appearanceMatrixContract()` plus settings-shim applied/reached receipts, per derived cell | matrix reads the live carrier contract through `readRuntimeAppearanceContract`; no copied preset list becomes the matrix denominator |
| query settlement | `data-app-ready` plus `__orb.queries()`/readiness bridge, navigation lifetime | proves the app settled; CDP Network/HAR remains authoritative for network requests and bodies, so query state is not promoted into a second HAR |
| CPU/boot/perf timing | CDP Profiler/Tracing and browser PerformanceObserver/User Timing, their explicit analyzer windows | browser-native facts stay in their selective artifacts; app-snapshot only supplies the cheap overview |

Unrelated domain actions (`seed`, RPG, plugin logs, automation fires) remain outside the instrument
surface. Their presence on `OrbDebugHandle` does not make them evidence channels.

**One tape, including the missing actions.** Snap's action union gains `pause`, `wheel` and `wheelburst`
and the existing `driveActions` dispatches them in argv order. `--perf-cycles <n>` expands the parsed tape once
after validation, preserving the original order and stable cycle/action indexes; it is legal only with
`--perf` because repetition decay is that analyzer's contract. `--motion [selector]` is an
optional-selector arm flag. With a selector it inserts one `motion-click` action at that exact argv
position; preceding actions are reach/setup, and the arm performs the existing flagger-settle and
evidence-reset barriers after reach but before starting the trace. The tagged click is dispatched once by
Snap's ordinary pointer path and is the only fact that sets `measured-input=true`. Without a selector,
`--motion` audits the entry window and inserts no click. `--motion-window <ms>` preserves the observation
window; `--motion-no-throttle` preserves the legacy default-4x/throttle-off fork. The matrix spelling is
`--matrix --motion <selector>`; a selector is mandatory there because the rated plan retains both entry
and interaction twins. There is no `--motion-matrix`, `--selector`, or un-namespaced `--window`.

**Selective analyzer vocabulary.** The public arms are `--motion [selector]`, `--perf`,
`--cpu-profile`, `--boot-trace` and `--react-profile`. CPU, boot and React never require a redundant
`--perf`. The old React `--profile` spelling refuses by name; the legacy `--cpuprofile` did too until #1315 narrowed `ALIAS_REFUSALS` to measured asks, and now dies as a plain `unknown flag`. Snap's cheap
always-on navigation/`__orb.snap()` observation becomes the internal `navigation` page arm and reports
`navigation-perf=measured|withheld|absent`; `perf=` belongs only to the requested interaction analyzer.
This is a literal-value change and therefore owns the repo-wide `tests/**` sweep and every asserting
suite.

**Motion capability ledger — the Snap arm must be byte/evidence equivalent or a strict superset before
the legacy command can retire.** The pure collectors/verdicts stay callable by both paths during the
differential phase; only after the planted equivalence controls are green does the public legacy CLI
become a refusal.

| Legacy capability | Snap-arm retained mechanism and proof |
| - | - |
| PipelineReporter trace and dropped-frame percentage | same CDP categories and `calibratedDroppedFramePct`; fixture feeds an identical trace corpus to both adapters and compares raw/classified/budgeted frame rows |
| population resolution floor | same `framePopulationBasis`; collapsed and uncomputable controls remain explicitly `frames-budget=unjudged`, never pass/fail |
| LoAF/blocking/style-layout | same `__orb.motion()` snapshot, raw/classified LoAF totals and attribution rows |
| CLS partitions and basis | raw/virtualized/non-virtualized plus observed partitions; only the tagged trusted click chooses observed-non-virtualized |
| active and transient dirty animations | same end-window animation sample plus checkpoint-scoped flag ring, with the same Base UI sanctioned-height classifier |
| reach versus measured interaction | preceding Snap tape actions run before the reset; one tagged motion click alone enters the trace/window; a plant fails if reach LoAF/CLS leaks into the result |
| throttle and headed caveat | default motion CPU throttle retained; explicit `--motion-no-throttle`; `--vnc` remains usable but the receipt labels headed timing as operator-observed/non-comparable |
| rated matrix | same polarity twins and `STATIC-EXPECTED` zero-frame exception through `--matrix --motion <selector>` |
| absence and result contract | bridge/readiness/reset/flagger/trace/frame/observed-CLS gaps, thresholds, result pairs and raw JSON rows compare against the old engine fixture |

**Performance capability ledger.** The requested `--perf` arm is the union of Snap's cheap navigation
read and the legacy meter, never the smaller current Snap arm. Its pre-navigation prepare installs the
same meter; each non-pause action is marked through `beforeAction`; finish reads the raw buckets and
files both raw entries and derived rows.

| Legacy capability | Snap-arm retained mechanism and proof |
| - | - |
| per-step LoAF/longtask | same installed-observer receipt, total/worst/blocking/script fields and raw entries keyed to Snap tape ids |
| EventTiming | input delay, processing and full duration retained per dispatched click/pointer window |
| rAF and layout shift | same 33ms gap band and per-window CLS accumulation |
| pause/wheel/wheelburst/cycles | first-class Snap tape actions plus stable cycle indexes; no private perf tape |
| thresholds/result | breach-step, worst-longtask and worst-click fields are preserved as informational meter evidence; the strict 100ms/101ms boundary and any-long-task rows do not vote exit. Existing action/page failures retain their exit-1 vote; missing/withheld apparatus remains exit 2 |
| CPU profile | `--cpu-profile` starts at the first non-pause action and exports the raw V8 profile after the tape in a separate arm/pass |
| boot trace | `--boot-trace` starts before navigation, stops at `afterNavigation`, retains raw trace and the six DevTools insight families |
| GPU/load honesty | one browser acceleration receipt and one box-load receipt are shared; every rate arm withholds/refuses from those values rather than re-reading independently |
| absence/raw JSON | meter/observer/step/trace insight denominators and all raw arrays remain explicit; no empty table reads clean |

**Shared rate-posture implementation ruling (partition B, 2026-09-04).** `beginRunArms` starts exactly one
run-local, frozen receipt before navigation: one `SystemInfo.getInfo` acceleration read (or its owned error)
and one `readBoxLoad` value. The receipt is passed through the arm lifecycle, not installed on
`ProbeSession`: a named browser may serve many calls, while acceleration/load truth belongs to one call's
measurement window. Page arms and run arms consume the same value, and the terminal load pairs render that
same box reading. Acceleration failure is data in the receipt and makes every requested rate consumer
withhold/refuse consistently; it is not retried by a later arm. The planted control supplies readers whose
second answers disagree and asserts one call to each reader plus the same disposition in app-snapshot,
motion and interaction-perf. This follows the prior instrument-proof lesson in
`MEMORY.md` / `2026-08-21T15-21-19-gDAF-orbweaver_verification_tooling_and_instrumentation_program.md`:
a zero or happy path is not proof unless a nonzero plant can make the instrument disagree.

Rejected: caching on `ProbeSession` would make a long-lived named session reuse stale host posture across
calls; a lazy memo in each arm would preserve three owners and make execution order select the reading; and
letting the RESULT line call `loadResultPairs()` independently would leave the immutable card describing a
different box sample than the analyzers judged.

The differential suite drives one deterministic file/loopback fixture through the legacy engine adapter
and the Snap arm with the same tape, then compares canonicalized evidence rather than console prose. It
plants: reach-only LoAF/CLS that must be absent from the measured motion window; PipelineReporter raw,
collapsed and verdict populations; sanctioned and unsanctioned transient animation; all three CLS
partitions with trusted input; two perf cycles containing click/pause/wheel/wheelburst; EventTiming,
LoAF, rAF gap and shift buckets; meter/bridge/trace absence; and raw artifact schema fields. A capability
ledger row has no right to be marked retained without one nonzero plant or an explicit refusal control.

**Perf meter-not-gate acceptance scar (2026-09-03).** The first unified implementation made a nonzero
`breach-steps` population return exit 1, contradicting the retired tool's explicit “METER, not a gate”
contract. The planted repair proves 100ms is not a breach, 101ms and any long task produce typed problem
rows without changing a clean exit, a pre-existing action/page failure remains exit 1, and missing or
load/GPU-withheld measurement evidence remains an instrument refusal. Composite reporting is likewise a
derived display layer and never acquires an exit vote.

**Interference is a parse-time contract.** `--probe` refuses `--motion` and `--perf` because flooring
motion invalidates both motion/CLS and rAF timing. Lighthouse refuses every boot/motion/perf/CPU/React
rate/profile arm because Lighthouse owns a navigation and a throttling model. `--boot-trace` refuses
`--motion` and React trace capture because Chromium exposes one tracing session. `--cpu-profile` and
`--react-profile` refuse `--motion`/`--perf` because profiler/hook overhead contaminates rate verdicts.
`--motion` and `--perf` refuse each other rather than silently perturbing the same interaction. The
message gives two exact Snap commands as the separate-pass remedy. Pixel, ARIA, map, request/HAR and
assertion arms compose with any analyzer because they run after the analyzer window and do not mutate it.

**Retirement order.** First the Snap arms and differential/superset controls are green. Then root script
names remain as deliberate migration doors whose `cli.ts` prints an exact Snap replacement and exits
misuse without parsing, staging, launching, attaching, adopting a slot or calling an engine. Duplicate
legacy parser/stage/browser/run doors and public index exports are deleted; pure motion/perf
collectors/verdicts remain internal imports until a later by-nature move earns itself. This is a clean cut,
not an alias or a hidden fallback.

**Coupled-site inventory and red-first plan.** The build fans through `contract/actions.ts` and
`contract/types.ts`; the arm roster/lifecycle types; registry aggregation/runtime completeness; capture
and drive seams; motion/perf/CPU/boot/React arm modules; matrix projection; parser flag classes/handlers,
help and session partition; result/failure/denominator folds; the two legacy CLI doors and root scripts;
the existing motion/perf unit/browser suites; `tooling-shared-plumbing` and front-door/roster gates; and
the 7,717-file active-corpus recipes including the synchronized side-eye Claude/Codex surfaces. The exact
red-first suite is `tests/tooling/snap/ops/unified-instrument.suite.int.test.ts`; its initial red must name
missing selective flags/lifecycle verbs/actions, legacy commands still running, and planted stale-corpus
hits before implementation begins.

The suite is a failure matrix, not a happy-path demo. Every retained analyzer/channel gets a planted
positive and a clean twin; malformed selector/duration/cycle/interference argv refuses before browser
work; missing, malformed or incomplete meter/bridge/trace/profile evidence exits 2 or carries an explicit
withhold; frame-population, breach-duration and zero-denominator boundaries are exercised on both sides;
and any bounded diagnostic/table view retains highest severity, names the exact omitted count and points
at the lossless artifact. Engine/adaptor child failures and CDP stop/detach failures must reach the final
Snap result instead of being swallowed. The differential rows above are the no-capability-loss oracle,
not merely additional positive examples.

**Alternatives rejected.** Importing the old CLIs from Snap preserves three parsers and three run doors,
the defect being removed. Measuring the whole tape as motion loses the reach/reset/measured-selector
contract and fabricates interaction CLS attribution. Appending a private motion click or a private perf
tape after Snap's tape is a second drive path. One giant `performance` arm hides interference and makes
CPU/boot/React selectors depend on a meaningless parent flag. Deleting the old engines before a
differential oracle turns “looks equivalent” into the only evidence and is forbidden.

### 10.7 Indexed Snap run bundle and browser-free readers (#1295, designed 2026-09-03)

**The collapse.** This extends the existing run slot; it does not add a store. Today
`withInstrumentRun` opens and prints one slot, calls the run, then `finishInstrumentRun` enumerates and
publishes it (`tooling/src/_shared/artifact-out.ts:116-143`). The missing operation is one Snap-specific
completion callback before publish. That callback writes `run.json` with create-exclusive semantics,
prints the receipt card, and returns the final exit. Non-Snap instruments keep the wrapper's byte-identical
default. Adopted session-daemon slots still publish only from the owning client, so every session call gets
the same completion and index without a second daemon-side store.

**Schema and identity.** `contract/run-index.ts` owns version 1. Each index records the absolute immutable
index path and slot root; run id; primary/linked checkout name and absolute/root-relative checkout paths;
full HEAD SHA and symbolic ref or `detached`; a content-sensitive dirty digest over sorted tracked delta
and untracked file paths plus current bytes; explicit clean/dirty/unknown; optional lane/agent values from
Snap provenance flags or their named orchestrator environment inputs; hostname, PID, argv and start/end;
session name/call/window and binding; stage owner/band/ref/binding; and the `RunSlot.racing` census observed
at open. A Git read failure stores `unknown` plus its failed field; it never substitutes a mutable pointer
or SHA-only identity.

**Partition-B v1 completion ruling (2026-09-04).** Version 1 is completed rather than bumped: these indices
are uncommitted program artifacts and the browser-free reader already has an explicit compatibility duty to
the earlier immutable v1 rows. Current writers always emit the full shape; the reader accepts only the
documented legacy omissions and normalizes them as legacy/unknown rather than fabricating precision. The
full location receipt is `indexPath` + `slotPath` plus `checkouts.primary` and `checkouts.subject`; each
checkout carries name, absolute path and path relative to the Git-common-dir-derived primary checkout, and
the subject additionally states primary versus linked. No checkout root is inferred from the run id.

Stage provenance is a typed value, not the old `isolated` label: mode, bound/unavailable/not-applicable
state, owner checkout, band, ref/SHA, and binding URL. A one-shot isolated run receives those fields from the
exact `StageRow` returned by `ensureStage`; a session call receives them from the daemon-owned session row in
the typed `done` event. A stage refusal after the slot records the requested mode/ref and the owned failure,
with no invented owner or band. Live/file runs explicitly say not-applicable and keep their base/file
binding. Parsing argv, reverse-looking-up a port after completion, or rereading a mutable band table was
rejected because each can disagree with the stage actually used.

Artifact truth uses an allocation declaration written beside the slot as dot metadata (therefore omitted
from both publication and the artifact inventory). `artifactFile` records the immutable path, kind and
published convenience target; Snap producers add media/schema, producer arm/channel, page/context/window,
completeness and structured limit receipts at the call site that owns those facts. Completion reconciles
declarations against actual bytes: an allocation with no file is not an artifact, while an undeclared file
is explicit legacy/unknown rather than guessed from a directory or filename. This also crosses the session
process boundary because the adopted daemon and owning client share the slot; an in-memory registry would
lose daemon declarations. A second artifact manifest/store was rejected: the dot receipt is run-slot
plumbing and `run.json` remains the only public index. Directory-name producer inference and page-number
regexes are removed from current-writer truth.

Diagnostic inventory is normalized into count rows keyed by channel/source/category/level plus exact
context/page/window, with raw channel references for console, page errors, CDP Log, InspectorIssue,
requests and HAR. Each raw reference points at an inventoried artifact; bounded channels carry structured
limit receipts (`policy` plus measured events/original/retained/omitted), never an adjective without the
receipt that justifies it.

Coupled sites are enumerated before build: `_shared/artifact-out.ts`; `contract/run-index.ts`,
`contract/arms.ts` and `contract/session.ts`; `lib/run-bundle-files.ts`, session wire and report query;
`ops/run-bundle.ts`, stage configure/daemon/client provenance, arm registry/capture, the three rate arms and
terminal load-pair rendering; every Snap artifact allocation site; and the bundle, registry/perf,
session-wire and unified behavioral suites. The red-first controls are: primary plus linked checkout at one
SHA; a named-session call bound to an isolated stage with multiple contexts/pages/windows; artifact
declaration reconciliation including published/media/schema/identity and a real truncation receipt;
writer-to-reader filters over the exact diagnostic identity; legacy-v1 omission compatibility paired with
strict rejection of malformed new fields; and the disagreeing-second-read rate plant above. A future
artifact producer that omits its declaration is planted as legacy/unknown, so the current-writer test can
fail when a new Snap call site silently falls back.

The index then owns three closed inventories:

- `results`: every structured RESULT record, final exit and denominators, including explicit
  pass/fail/withheld/refused/absent/off states per arm and shared lifecycle;
- `diagnostics`: lossless counts by severity/source/category/page/context/window plus omitted terminal
  counts and exact raw-artifact references for console, uncaught page errors, CDP Log, InspectorIssue,
  requests and HAR;
- `artifacts`: every non-dot file already in this slot, with absolute immutable path, slot-relative and
  published convenience paths, media/schema kind, producer arm/channel, page/context/window identity,
  completeness, bytes and truncation/measured-limit markers. `run.json` names itself separately, so the
  inventory can be computed once and the index created exactly once rather than rewritten after hashing
  itself.

The result capture is structured, not stdout archaeology: `_shared/artifacts.ts` records the pairs each
`printResult` emitted while a slot is active; the session client records the already-structured `done.pairs`
from the daemon. A refusal after slot with no analyzer RESULT receives one synthesized Snap result from its
known exit/reason. Help, parser misuse, materializer and session/stage admin remain slot-free. File/stage,
fixture, analyzer and run-time refusals occur after the slot and therefore get an index/card.

**End card.** Completion prints, in this order, one identity line; absolute `EVIDENCE <run.json>`; a
single bounded `VERDICT` line with arm states and diagnostic counts; at most six primary immutable
`ARTIFACTS` paths plus an exact omitted count; and
`READ pnpm snap --report <absolute-run.json> --problems`. It then prints one canonical final
`RESULT snap ... index=<the same absolute path>`. Earlier analyzer/matrix RESULT lines may remain as
diagnostic subresults; the last line is the run result. If index creation fails, the completion is itself
an instrument refusal and exits 2 rather than returning a verdict whose canonical evidence is missing.

**Readers.** `--report <absolute-index|exact-run-id|latest>` and `--reports` dispatch before any stage,
slot or browser operation. Absolute paths are read directly. An exact run id enumerates Git's registered
worktree roots and probes only the deterministic `reports/runs/snap/<id>/run.json` path; zero or multiple
matches refuse by name. `latest` enumerates only the caller checkout's `reports/runs/snap/*/run.json` and
chooses the greatest finished timestamp. `--reports` performs that same bounded per-worktree directory
enumeration and prints at most the 20 most recent valid identities plus the exact omitted-valid count and
an exact-id lookup remedy; neither reader walks arbitrary `reports/**` or follows published
aliases.

The report filter is one typed query over the index: `--problems`; `--arm`/`--channel`; diagnostic
`--level`/`--source`/`--category`/`--text`; `--page`/`--context`/`--window`; and explicit `--all`.
Default is a concise derived summary with immutable raw pointers. Any bounded class prints its exact
omitted count and the exact filter command that retrieves it; full rows remain in indexed artifacts.

**Acceptance repair (2026-09-03).** A selective analyzer's terminal state is not an actionable report.
Motion and interaction-perf artifacts therefore carry full typed `problems` rows produced by the analyzer
that owns the threshold: arm, kind, metric, subject/step, observed value, threshold and explanation. The
browser-free reader validates those rows and prints a severity-ordered bounded selection plus an exact
omitted count; it does not re-derive private budgets or ask the operator to reverse-engineer raw JSON.
Motion rows name dropped-frame/CLS/LoAF/style-layout/error/reach failures and each unsanctioned active or
transient animation; perf rows name every failing step and whether its long-task population or click
duration crossed the owned threshold. A failed legacy artifact without problem rows says that structured
problem evidence is unavailable and asks for a current rerun rather than printing a content-free FAIL.

Known artifact producers also receive a classified completeness state and a reason in the index. Motion is
`bounded` because its app-side LoAF/shift evidence uses finite rings; interaction perf and the Snap capture
manifest are `complete` for their finite run/tape, while nested diagnostic/HAR channels keep their own
bounded receipts; Playwright traces remain `raw-fallback`. `unknown` is reserved for an unrecognized
artifact, never the ordinary motion/perf/snaps families.

`--reports` is a tolerant inventory, not N independent report attempts. It counts corrupt/stale candidate
indices, prints at most three example paths and one exact aggregate skipped/omitted/remediation line, then
prints a bounded recent valid list. An explicit `--report <that path>` remains the strict refusal door.
Local Git dirtiness is forensic source identity, not a default problem: the end card, `--reports` and
`--problems` show checkout/lane/commit without declaring the owner's repository dirty or printing an
opaque digest. `--all` alone may add `source=clean|working-tree|unknown digest=<prefix>`; `run.json` always
retains the full state and digest. A bare `dirty=<hash>` spelling is forbidden. `app-snapshot` is attempted
on every settled page. A plain static page has no `window.__orb` overview (N/A) but can still carry measured
navigation timing; when neither population is available the arm is `absent`, with help/detail saying that
explicitly, while absence on an expected app page remains visible for investigation.

**Identity acceptance scar, red to green (2026-09-03).** The first writer used fallback strings from failed
Git commands, so a non-repository root became `sha=unavailable ref=detached` and the fallback bytes were
hashed as if they proved a dirty working tree. The planted non-repository control reproduced that lie.
Every Git read now retains success/status/detail separately: HEAD/ref failures produce `unavailable`,
dirty-source failure produces `{state:"unknown",digest:null}`, and `gitFailures` names each failed field
(`sha`, `ref`, `status`, `tracked-delta`, `untracked-list`, or an unreadable untracked byte path) with a
bounded nonempty detail. A real detached repository is still `ref=detached` only when HEAD resolved and
`symbolic-ref` returned its documented detached status. The index reader rejects unknown identity without
owned failures; default output hides local source state and `--all` alone exposes
`source=unknown digest=unavailable git-failures=…`.

`latest` means the greatest `finishedAt` among validated indices in the current checkout. Candidate
discovery ignores an active slot that still has only `.inflight` and no `run.json`; it does not treat that
in-progress inventory state as corrupt history. An existing corrupt index still refuses, and an explicit
path to the active slot's missing `run.json` remains a strict refusal.

**Planted controls.** The exact red-first suite is
`tests/tooling/snap/ops/run-bundle.suite.int.test.ts`. It creates a primary checkout and linked worktree at
one SHA, dirties one with different bytes at the same path set, opens concurrent slots, and proves distinct
checkout/digest/run/index identities. A planted multi-arm slot carries several artifact families and more
diagnostics than the display cap; the index must account for every file and state, the card's bounded tail
must survive prefix truncation, and its literal READ command must return the problems browser-free.
Separate controls prove exact-id cross-worktree resolution, local-only latest, ambiguous/missing refusal,
create-exclusive immutability, pass/fail/withheld/refusal-after-slot cards, session per-call provenance,
and a filesystem spy that fails if a reader scans outside registered worktree run directories.

The bundle suite also plants malformed query values, corrupt/stale/incomplete indices, an interrupted
callback and a failed child/analyzer result after slot open. Writer → immutable index → browser-free
reader must preserve checkout/run/SHA/dirty identity, severity/category/page/window and exact artifact
path byte-for-byte. Missing/corrupt/stale evidence refuses; an interrupted or failed run still receives a
truthful indexed terminal exit when its slot exists; ambiguity across registered worktrees is named rather
than resolved by recency. Truncation plants low and high severities beyond the cap and proves the highest
severity survives while the omission receipt and `--report` command recover every raw row.

The acceptance-repair controls additionally plant multiple invalid list candidates and prove exactly one
bounded aggregate line; assert default identity omits local dirtiness while `--all` labels source state and digest; write failing motion/perf artifacts whose
typed rows preserve subject, observed value and owned threshold through index/read; assert known
motion/perf/snaps completeness classifications and reasons; and distinguish static app-snapshot absence
from a selective-arm refusal. These are writer-to-index-to-reader controls, not formatter-only fixtures.

**Alternatives rejected.** A second SQLite/JSONL registry duplicates run slots and creates a consistency
problem. Enriching `.published` makes a mutable alias manifest the identity of immutable evidence.
Requiring `--json` preserves the current discoverability failure. Resolving by SHA conflates clean and
dirty worktrees. Scanning all of `reports/` is both unbounded and unable to prove which bytes belong to a
call. Parsing terminal prose to reconstruct arm states makes the receipt card its own lossy database.

**Recovery note (supersedes the §10.5 snapshot).** #1284 is implementation-complete and accepted. #1292
is the parent; this forge owns #1293 and #1295. The two mandatory behavioral commands are
`pnpm test:scoped tests/tooling/snap/ops/unified-instrument.suite.int.test.ts --maxWorkers=1` and
`pnpm test:scoped tests/tooling/snap/ops/run-bundle.suite.int.test.ts --maxWorkers=1`. The session/HAR
lane owns browser diagnostics, session evidence and HAR redaction files; this consolidation must consume
their public receipts and not edit those files. The implementation order is: create both red controls;
build run index/readers; widen the registry/tape; land perf differential; land motion differential/matrix;
only then hard-refuse legacy CLIs and migrate the active corpus.

### 10.8 Operator and cold-agent usability battery (#1292/#1295, ruled 2026-09-03)

The schema is not accepted merely because its writer and reader agree. After convergence, the program
generates real immutable bundles for: an ordinary visual/map/diagnostics run with actual PNGs; a planted
diagnostic/HAR failure; selective motion; selective perf; React profile; stateful session continuation and
export; matrix plus appearance scenario; and an explicit refusal/withhold. Each run's ordinary stdout card
must point to the same immutable index as its final RESULT, and `snap --report <index> --problems` must
reconstruct the useful failure, identity, severity, completeness/truncation and artifact pointers without
source knowledge. PNGs and named structured artifacts must be directly usable at those paths.

Two or three cold low/medium agents receive only normal `pnpm snap --help`, the command's stdout/card and
the browser-free report output. They must identify the run/checkout/session identity (and forensic source
state only after deliberately requesting `--all`), distinguish
always-on `app-snapshot` from a requested selective analyzer, find the highest-severity problem and any
omitted count, open the right primary artifact, and construct a narrower follow-up filter. A side-eye pass
reviews the produced PNGs; a code verifier reviews artifact identity/completeness and round-trip truth.
Needing a source file to discover the evidence, confusing app-snapshot with selective perf, or missing a
truncation receipt fails the UX acceptance even when the schema test is green.

Playwright `trace.zip` is explicitly not an agent-readable primary artifact. It is a raw human/deep-
forensics fallback, excluded from the six-path primary ARTIFACTS shortlist. If a card/report references it,
it labels it `raw fallback` and supplies exactly `pnpm exec playwright show-trace <absolute-trace.zip>`.
If a cold agent must unzip or reverse-engineer a trace to explain an ordinary failure, the CLI UX fails.
There is no Snap trace parser: structured diagnostics, HAR, action, analyzer and run-index artifacts own the
machine path.

The named battery paths are acceptance receipts, not a permanent artifact archive: the existing bounded
run-slot pruner may remove them after newer runs. No second pin/retention registry is introduced. The
battery is generated last, every named `run.json` is existence-checked immediately before handoff, and the
review records its generation/check time. A later document reader must treat a missing path as expired
operational evidence and regenerate the case; the prose must never continue to claim that a pruned path is
live or durable.

**Evidence-driven default findings layer (ruled 2026-09-03).** This contract was frozen only after reading
real completed bundles: motion `main-657130-2026-09-03T23-08-02-501Z` carried an 82.53% dropped-frame row
and a `#spin` dirty-width row; perf `main-655294-2026-09-03T23-07-47-266Z` carried two hot-click
long-task/duration pairs; session request evidence `main-394701-2026-09-03T22-00-40-106Z` carried the same
`ERR_UNSAFE_PORT` observation through console and network sources plus a distinct deprecation issue;
React `main-640171-2026-09-03T23-04-41-297Z` refused with three explicit profile gaps; Lighthouse
`main-788883-2026-09-03T23-36-08-120Z` named two failed audits and blamed selectors; and the map failure
controls proved that a bare non-JSON run otherwise retained only `map=… failures=1` in its index. These
are the actual shapes the default card must explain, not hypothetical categories.

The writer derives a bounded, display-only `findings` population after artifact inventory and persists it
inside `run.json`; the same rows drive the end card and the browser-free reader. It starts no observer,
replays no action and owns no threshold or exit vote. Existing producer artifacts remain authoritative:
redacted browser diagnostics for console/Issue observations; redacted request/HAR evidence for network;
analyzer-owned `problems` for motion/perf; Lighthouse's validated LHR; React's gaps; and one always-written,
bounded `evidence/core-capture.json` projection for redacted structured `runtime|instrument` page errors, request failures and map/surface
failure strings. The projection is written from the one existing capture outcome through the manifest's
established redaction functions; it performs no second page read, capture or walker and removes any
dependency on optional `--json`. Page-error and capture rows carry complete zero-drop receipts. The
request source is a URL-keyed latest-row map rather than an event ring, so its receipt says
`basis=latest-per-url`, `dropped=null`, `complete=false`; the artifact is bounded and HAR remains the
request-event record. Unknown or malformed producer evidence yields an explicit
incomplete/conflict finding while the immutable index still lands; the strict detailed reader continues
to refuse the malformed artifact.

One row has severity (`error|warning|annotation`), `what`, factual `where`
(context/page/window/selector or subject), typed evidence references (source + immutable artifact),
`confidence=direct|correlated`, `completeness=complete|bounded|incomplete`, any disagreement as explicit
`conflicts`, occurrence count and one exact browser-free follow-up command. Grouping is deliberately
narrow: identical normalized observations in the same context/page/window collapse, and matching request
ids may join diagnostic and HAR evidence. It never turns temporal correlation into causation. Selective
CDP motion/perf is the primary numeric source; `__orb.motion/animations/flags/renders` and authenticated
client-log console rows are semantic corroboration only, never a second rate verdict. `[frame]`/`[reflow]` share the motion
LoAF observer, `[cls]` shares its shift observer, `[drop]` is paused while CDP trace owns the window, and
`[anim]`/`[space]` also annotate motion; `[input]` annotates interaction perf, `[perf]` maps to coarse React
render heat, and `[css]` remains dead-CSS attribution. A tag may attach to a producer row only when its
metric and context/page/window identity agree; otherwise it remains a standalone annotation rather than
fabricating correlation. Console warnings remain warnings unless the caller selected
`--strict-console`; perf's 100ms/long-task rows are annotations and never become a gate.

The card prints at most five highest-severity rows in `what | where | evidence | next` form, including
confidence/completeness/conflicts, followed by the exact omitted count and the lossless READ pointer.
`--report … --problems` reads the same indexed population and its arm/channel/context/page/window/text
filters; it does not recompute a different summary. A failed/refused run with no actionable structured row
gets a loud incomplete finding rather than a content-free VERDICT. A passing run may legitimately have
perf annotations or warnings; the finding layer never changes its exit.

The exact run-bundle suite's planted output proves only `source=console-api` with the anchored Chromium
text grammar `^%cHH:MM:SS.mmm [tag]%c` is attribution: `[perf]` maps to React and `[input]` maps to perf.
Early ordinary prose such as `User preference: [perf] …` and an orb-console-ring copy remain warnings;
an unrelated perf threshold cannot absorb the tag. One `ERR_UNSAFE_PORT` row joins console-api,
network, the bounded core projection and a session-owned HAR only because all four share the normalized
symptom and `c0/p0/w7`; the indexed row keeps all four evidence sources, `occurrences=4`,
`confidence=correlated`, and `completeness=bounded`. A malformed latest-per-URL receipt becomes a visible
incomplete error while the pre-existing producer verdict/exit remains unchanged.

Rejected alternatives: parsing terminal prose loses identity and breaks under truncation; parsing or
unzipping Playwright trace violates the raw-fallback ruling; a new cross-arm observer/ring duplicates the
facts being correlated; and inferred causal diagnoses would turn co-occurrence into fiction. The coupled
sites are `contract/run-index.ts`, size-safe `lib/run-finding-{common,browser,analyzers}.ts` producer
readers plus the pure `lib/run-findings.ts` merger, run-bundle writer/card, browser-free
validator/query/printer, map manifest persistence, help and the exact run-bundle/unified suites. Planted
controls cover duplicate diagnostic collapse, diagnostic+request correlation, each retained producer,
clean empty and passing-perf-annotation twins, map persistence without `--json`, malformed/incomplete
evidence, severity ordering/cap/omission, filter round-trip and the invariant that findings cannot change
the terminal exit. The final real battery is regenerated only after these controls and static gates pass.

### 10.9 `--map` is both app atlas and current-surface map (ruled 2026-09-03)

**Problem.** The original `--map` answers only “what can I operate on this rendered DOM?” A sight-unseen
agent also needs “where can this application go?” Grepping source for a section/modal/config/tab name is
the workflow the dev bridge was built to replace. The two questions are related but not interchangeable:
an atlas must not auto-tour and mutate every destination, while a destination list alone says nothing
about the controls and state on the current surface.

**Chosen contract.** One settled-page map capture produces three evidence sheets and prints all three by default:

1. The global **SPA NAV TARGETS** atlas reads the authoritative app-internal vocabulary exactly once from
   `window.__orb.nav.capabilities()`, validates the complete `OrbNavCapabilities` shape at the page boundary,
   and renders bounded groups for sections, modal slots, settings groups, published context tabs and chat
   positions. Every listed member includes directly executable public Snap syntax. An optional `--map <selector>` scopes only the surface sheet; it never hides this global atlas. The block also reads the
   existing `window.__orb.shell()` when present and prints current URL/section/chat/focus identity. It ends
   with the workflow: choose a destination, then run its `--goto … --map` / `--context-tab … --map` /
   `--open-chat … --map` command (or add `--session <name>` to inspect within a live browser lifetime).
   Dynamic chat/character ids and names are accepted lookup syntax but are not enumerated or invented.
2. The **CURRENT SHELL / REGIONS** sheet reads the shell's existing rendered vocabulary rather than
   inventing another layout model. `.shell-grid` owns the current section, list/context modes and focus;
   `__orb.shell()` proves the same section/panel declaration/chat/focus contract; `.shell-rail`,
   `.shell-topbar`, `.shell-panel[data-panel-side]` and `.shell-content` supply the rendered rectangles,
   visibility, inertness, CSS positioning and z-index. The viewport is classified by the shell's existing
   wide / narrow (at or below 64rem) / mobile (at or below 48rem) regimes. Each region says mounted,
   visible, available where the shell publishes that concept, exact mode where one exists, rect,
   position/z-index and whether it is inert. This exposes the real transformations without minting new
   state: desktop docked/collapsed, narrow overlay/collapsed, mobile list-as-screen, context sheet, and
   hidden content behind either sheet/list screen. The content identity is the rendered main landmark's
   accessible label. The context row may name the selected rendered tab, but its relation is
   `unspecified/auxiliary` unless an explicit DOM/bridge owner is published; merely sitting beside a room
   does not make RPG or another context surface subordinate to it.
3. The **SURFACE MAP** keeps the settled DOM census and its unique Playwright locator proof, adds
   implicit landmarks (`main`, `navigation`, `complementary`, named forms/regions), and records useful
   action/orientation state: native/ARIA disabled, `aria-current`, native/ARIA checked and
   `aria-expanded`. Associated HTML labels are read before placeholder fallback, closing the known case
   where the displayed map named a textbox by its placeholder even though Playwright exposed its `<label>`.
   By default only the active rendered surface is listed. `--include-hidden` may inventory attached hidden
   or inert DOM, including host `display:none` descendants that React Activity can retain, but the DOM pass
   neither proves Activity provenance nor claims a complete Activity inventory (text-only hidden children
   can have no DOM output). Every such row carries `visibility=hidden`, its observed inactivity reason and
   `actionability=locator-only`; it is never described as a currently executable click target. Visible
   disabled controls and non-control landmarks are likewise locator-only. The manifest retains the
   structured state, shell and atlas, while terminal output clips names and rows with exact
   totals/omissions.

Static `--file` pages with no bridge remain valid DOM-only maps and print a named “NAV TARGETS unavailable
for static file” state. A non-file/live page with no nav bridge, or any present capabilities bridge that
throws or fails shape/set invariants, is an instrument refusal and exits 2; it can never become an empty
clean atlas. This needs the page-arm twin of the run-arm `exit` seam: every page lifecycle declares a total
`exit(input, code)`, the registry folds it in arm order, and all three page hosts (one-shot, contexts and
scenario) consume it. Map alone changes a code to `EXIT.toolError` when `mapAtlasError` is populated; other
page arms return the code unchanged.

Each atlas group prints at most ten members, with `total`, `shown` and exact `omitted`; the surface retains
the existing ARIA-line cap and exact omitted count. Every surface locator is unique against the settled
page; only a row explicitly marked `actionable` has also passed current Playwright visibility plus the
element's enabled/active boundary. The implementation does **not** add a second navigation registry,
query domain entity datasets, or walk destinations.

**Alternatives rejected.** Auto-touring every capability mutates client state and changes the evidence
surface while multiplying run cost. Dumping dynamic chats/characters is an unbounded domain query, not a
capability atlas. Replacing the current DOM-to-selector pass with per-node CDP Accessibility correlation
adds a second DevTools capture path and an unstable node-identity join; `locator.ariaSnapshot()` is a
human YAML view rather than a typed DOM association. The smaller robust improvement is browser-native
HTML label association plus the existing Playwright selector execution proof; `--aria` remains the full
accessibility-tree authority. Hiding the atlas behind a new flag would preserve the discovery failure.

**Cross-arm active-surface audit.** `--map` is not allowed to become a special truth while another arm
quietly judges retained Activity content as current. The bounded audit found these source decisions:

| Arm / channel | Current-active truth |
| - | - |
| ARIA | Playwright's accessibility snapshot excludes display-none / aria-hidden Activity descendants; intentional AT truth, not a DOM inventory |
| map / assertions / dead CSS | visible is the default; `--include-hidden` is an explicit attached-DOM inventory. Map must label locator-only rows; assertion count already says `scope=all DOM`; dead CSS is a class census and already labels the opt-in in help |
| screenshot | Chromium's framebuffer is the rendered viewport/full-page/element paint; retained hidden Activity DOM contributes no pixels |
| contrast / overflow | explicit selected target; contrast returns offscreen/occluded/unmeasured rather than a clean ratio, and ordinary assertion matching filters to rendered nodes unless the operator opted into all DOM |
| matrix | creates the same rendered cell then invokes the same page arms; it adds no hidden-tree walker |
| app-snapshot | `__orb.snap()` is a coarse settled app snapshot; shell truth inside it is DOM-derived and no component census is inferred from mounted nodes |
| motion / interaction perf | the one dispatched action and browser observers measure painted/current interaction windows; they do not walk hidden DOM |
| React profile | raw Fiber trees intentionally retain Offscreen/Activity boundaries. React 19.2 Activity hides host children with `display:none`, preserves state/retained DOM, cleans up Effects, and may render hidden children at lower priority; every Fiber descendant therefore carries inherited active vs retained-hidden state. The artifact counts hidden composite renders separately and the rated hot table excludes them so background duration cannot read as ordinary current-surface work |
| UI audit / side-eye | separate #1297 consumers now distinguish `dom-walked`, `dom-rendered` and `dom-retained-hidden`; theme and rated samples use rendered nodes, operability additionally excludes inert/ARIA-hidden nodes, and `__orb.shell().chatOpen` requires a visible article. Side-eye scores only the activated rendered surface while a retained-section activation control proves hidden sections are not silently lost |

**#1297 acceptance scar, red to green (2026-09-03).** Independent verification refuted the first
completion receipt because a descendant may override an ancestor's `visibility:hidden` with
`visibility:visible`, and Chromium renders/hit-tests that descendant. The repaired shared predicate reads
the target's computed visibility while still walking ancestors for `display:none`, `hidden` and grouped
opacity. The original counterexample now produces the tap-target and accessible-name findings; accounting
is exact (`6 = 5 rendered + 1 retained-hidden`), the broader control is exact (`22 = 14 + 8`), inert and
ARIA-hidden paint remains rendered but non-operable, the bridge suite is 7/7, the paired Snap map suite is
5/5, and the fresh full structure run is 254/254 at
`reports/runs/structure/main-761472-2026-09-03T23-30-20-042Z/check-structure.json`.

**Coupled sites.** The map shapes live in a size-safe `contract/map.ts`, imported by `contract/types.ts`;
page-boundary validation in
`ops/page-validate.ts`; capture and instrument refusal in `ops/arms/map.ts`; initialization in
`ops/capture.ts`; terminal rendering in a size-safe `lib/map-report.ts` called by `ops/report.ts`; page-arm
exit totality in `contract/arms.ts`, `ops/arms/registry.ts`, the eight page arms and the one-shot/context/
scenario hosts; recipes in `contract/help.ts` and `.claude/skills/snap-driving/SKILL.md`. The JSON manifest
already serializes `CaptureOutcome`, so there is no second writer.

**Non-vacuous controls.** A focused file-mode browser suite plants a valid nav/shell bridge and asserts all
group recipes, current-place/shell identity, desktop region geometry, stateful landmark/control rows,
manifest shape and a printed
selector executed through a second public Snap call. Its twins prove: no bridge on a static file stays
clean and explicitly unavailable; a malformed/throwing bridge exits 2; more than ten targets retains the
first ten and exact omission; selector scoping does not hide the atlas; and an associated label beats a
misleading placeholder. A mobile-width shell fixture proves the bottom rail, list-as-screen/content-hidden
transformation and a context overlay's fixed/sheet geometry. An attached hidden subtree proves the default
omits it and `--include-hidden` retains it only as hidden/inactive/locator-only. Registry tests plant a page
arm missing `exit`, while the existing map corpus keeps duplicate-name, hidden-node, SVG, fallback and
selector-executability controls. The React fixture plants a hidden Activity descendant with duration and
proves it remains labelled in raw evidence but cannot enter the active ranked table.

### 10.10 `--design-audit` as built (lane p-snap-fold, #1315 + #1324/#1325/#1326/#1361, 2026-09-04)

The last sibling, and the retired `pnpm design-audit` has no execution path. The scan is
`pnpm snap <route> --design-audit [--fail-on P0..P3]`. The 14k-line detector engine stayed a sibling tool
dir entered through `ui-audit/index.ts` — the motion precedent (§10.6) — and the parser, stage door, drive
queue, matrix projection, run path and operator help were DELETED rather than deprecated.

**Where §4.1's retirement order had to change.** Owner ruling 2026-09-04: no doors, no shims, no census
tokens, no migration-spec allowances. The product is unlaunched, so a retired spelling is grep-fixed at
its call sites. `snap/lib/retired-instruments.ts` and the whole `screen-record/` dir are gone with it, as
are the four pnpm scripts and the `ALIAS_REFUSALS` rows that named a retired sibling's own vocabulary.
Each folded tool dir keeps a three-line `cli.ts` for ONE reason: gate `tooling-slot-template` arm B
requires an argv door per tool dir. Those files carry no translation and no recipe beyond the one snap
spelling.

**Where §6's lifecycle union had to be READ rather than widened.** The census's plan called the arm a
PAGE arm. `ArmPageContext` carries no session, no settings-shim evidence and no environment contract, and
the walk needs all three (page-error rings for `script-error` and the instrument-page-error gap; theme
provenance; the hover capability the forced-state pass is gated on). A RUN arm receives the session at
`begin()` — exactly why `ops/arms/motion.ts` is one — and its `afterSettle` hook runs on the settled page
after the drive queue and BEFORE the settled-surface page arms. So the pass order is the one the census
asked for and only the union member differs. Nothing widened.

**What the arm publishes.** `ARMS` gains `design-audit` (after `assert`); the fact is
`snap-arm-design-audit-v1` with `state ∈ {passed, failed, withheld, off}` — any EvidenceGap, terminal or
partial, is `withheld` + exit 2, and `--fail-on` decides the rest; the report is one artifact
`<name>-design-audit.json` registered with `producerArm: "design-audit"`, so `ops/run-bundle.ts` binds it
to that fact and `--report … --problems` reads it browser-free through `designAuditProblems()`. The
printed blocks and every RESULT pair name are ui-audit's own, imported unchanged — which is what makes
the byte-stability receipt §10.3 demands provable at all.

**The three merges the fold was the moment for**, each with a same-page A/B receipt rather than a claim:

| # | The defect | The retired logic, re-evaluated in-page | The arm today |
| - | - | - | - |
| #1325 | snap's `--contrast` had its own DOM-ancestor resolver and its own comment naming the gap | `flat rgb(0, 0, 0)` under a `position:fixed; z-index:-1` white band → 21:1 PASS | `CONTRAST #layer-text: 1.00:1 FAIL (pixel-sample)` — `WALKER_PRIMITIVES` + `WALKER_RESOLVE` |
| #1324 | BOTH homes read `aria-label` before `aria-labelledby` (accname 1.2 has 2B before 2C) | `["same label","same label","open menu","close menu"]` — a false duplicate, a real one missed | one spec-ordered key; `duplicate-action-door` fires on `menu` ×2 and not on the shared label |
| #1326 | `describe()` returns a six-step path whether or not it is unique | `div:nth-of-type(1) > … > button.tiny:nth-of-type(1) MATCHES 2` | `[aria-label="First tiny"]` / `"Second tiny"`, `selectors-proven=2 selectors-ambiguous=0` |

`border-contrast` (WCAG 1.4.11) lands with them: every form control's DECLARED boundary is swept against
the paint outside it, which is #1361's class made a rule instead of a per-selector ask.

**Two false verdicts the new pins found, both fixed at the source.** A CDP attach against a `file://`
document makes Chromium log `Unsafe attempt to load URL <U> from frame with URL <U>` and fail one request
with `origin`; snap counts both, so every `--file` mock audit exited 1 on an artifact of the instrument's
own attach. Fenced in `ops/noise.ts` beside the sandbox-trace and vite-churn precedents — identical URLs
and `file:` only, never dropped, counted as `file-origin-noise`. And the selector proof reported the
page-subject sentinel (`script-error` / `off-theme-font` / `flat-type-hierarchy` all name the DOCUMENT) as
unlocatable; `PAGE_SUBJECT_SELECTOR` is now named in `contract/findings.ts` and skipped by the proof.

### 10.11 What the 4 KB stdout budget measures (ruled 2026-09-05, #1556 + #1675)

The end card is an agent-facing contract with a hard size constraint: the Bash tool truncates long output,
and a truncated snap run loses the END CARD — the one block carrying the verdict, the findings and the
READ pointer. `tests/tooling/snap/ops/agent-readable-output.suite.int.test.ts` holds the 4096-byte budget
(4 KB, not 8 — §10.7's citation shrink).

**The budget measures the AGENT-READABLE BODY, not the whole stream.** A line belongs to the body when its
length is a function of THIS run's own arms and findings. The two run-identity lines — `CONCURRENT` and
`PROVENANCE` — are EXCLUDED, because their length is a function of how many OTHER snap runs happen to be
live on this checkout: the racing census names each sibling's run id, pid and start time in both lines.
That is a property of the box, not of snap's output. Measured (#1675): co-scheduled with
`design-audit.suite`, an otherwise 8/8-green run gained \~230 bytes of census and the budget arm read
4204/4096 — a green contract turned red by scheduling alone. Reproduced deterministically 2026-09-05 by
planting one `.inflight` marker naming the test's own pid: 4154 bytes whole, \~3.9 KB in the body.

**Excluded is not unmeasured.** The same arm asserts that the plant reached the census (both lines really
are carrying it), that the exclusion removes EXACTLY those two lines and nothing else (byte arithmetic
against the removed lines), and that both lines are present at all — so the budget cannot be widened later
by relabelling a body line as provenance, and a run that stopped stating its provenance goes red.

**The RESULT line is inside the body and is the thing that will break next.** It is one line of \~40
`key=value` pairs, one per arm-owned result pair; the fold added 38 bytes and #1538 another 22, leaving
roughly 200 bytes of headroom on a quiet box. The deliberate decision: **the budget does not move, and the
RESULT line does not grow without paying for it.** An arm that adds a pair either replaces one, or the arm
that adds it also removes an equivalent-width pair, or its author folds the multi-token group behind a
single derived token (`load-suspect=<arm>` is the existing precedent — one token standing for a whole
paragraph the reader can expand through `--report`). Raising 4096 is not a fix: it re-creates the
truncation the budget exists to prevent, one Bash call later.

**What a load-suspect run does NOT do to the budget.** Under #1616 a contended box LABELS rather than
withholds, and the run-global annotation's \~600-byte reason paragraph IS body — it is about this run. The
suite therefore plants a QUIET box (`BOX_LOAD_ENV`) for every child rather than excusing the bytes: the
output contract is judged on a quiet box, and the loaded-box arm that needs the annotation asserts its
NAMING, not its size.

## 11. Cost

| Item | Estimate |
| - | - |
| code | phase 1 \~1.2k lines + \~0.5k tests · phase 1b \~0.4k + 0.3k · phase 2 \~0.8k + 0.4k · phase 3 \~0.7k + 0.3k · phase 4 \~0.5k + 0.2k (+ doc/skill sweeps) |
| lanes | 6 lanes (one per phase incl. the spike and 1b), forge for 1–2, executor for 0/1b/3/4; 3–4 days of the fleet at the 3-lane cap |
| dependencies | `lighthouse` (tooling only; every dependency is a liability — it is the engine the MCP already wrapped, and it ships no product bytes) |
| runtime | per lane: one daemon (\~120 MB) + one Chromium + one stage (a worktree, a db copy, two node processes) held for the lane's life instead of re-paid per call; box budget = 3 of each |
| what it retires | the chrome-devtools MCP plugin + its headless patch ritual; the "band held" fold-note rule; the per-call browser boot (P2); the `--stage-down --force`-from-main stopgap |

## 12. Forks — ruled and open

### 12.1 Ruled (owner, question tool, 2026-09-02)

| Fork | Ruling |
| - | - |
| F1 `--wait` collision (snap selector vs design-audit ms) | design-audit renames to `--settle <ms>`; the old spelling is refused by name (a value change — it owes the `tests/**` literal sweep in phase 4) |
| F2 stage set home | stays in snap; siblings enter through `#snap` — no `tooling/src/stage/` tool |
| F3 sibling attach | `connectOverCDP` from the sibling's own process, gated by the phase-0 spike (#1226, live) |
| F4 cross-checkout sessions | a foreign caller is REFUSED naming the owner; no read-only share |

### 12.2 Ruled (owner, question tool, 2026-09-02 18:15Z — recorded by lane p-substrate-sessions; the arms stay as posed, the last column is the RULING)

| Fork | Arms | Ruling |
| - | - | - |
| F5 TTL / cap numbers | session 30 min · stage 60 min · caps 3/3 vs the owner's "30 min" for stages | RULED: session idle TTL 30 min, stage idle TTL 60 min, caps 3/3 — env-overridable (`ORB_SESSION_TTL_MIN`, `ORB_SESSION_CAP`; the stage pair lands with phase 2) |
| F6 headed browsers | `--vnc` stays a per-session opt-in; headless default | RULED: headless default, `--vnc` per-session opt-in |
| F7 orchestrator teardown of a foreign LIVE stage | (a) `--stage-down --stage-owner <checkout> --force` (explicit consent, per band); (b) unchanged blanket `--force` | RULED: (a) — per band, naming the owner (phase 2) |
| F8 MCP retirement timing | after phase 3 (`#1195` §2.3) vs after phase 1 | RULED: the MCP retires the day #1198's plain Lighthouse arm folds — not tied to a phase |
| F9 `lighthouse` dependency | pin in tooling vs refuse the arm and keep the MCP for it | RULED: pin BOTH catalog rows — `lighthouse ^13.4.1` + `puppeteer-core ^25.9.0` (the spike measured that snapshot mode needs the puppeteer page handle; both landed as root devDeps with #1226) |
| F10 matrix through a session | run `--matrix` cells as contexts in one session (one browser, N contexts) vs keep one-shot cells | RULED: the appearance MATRIX rides a session in PHASE 3 (the phase-3 row widens accordingly); phase 1 refuses `--session` + `--matrix` |
| F11 budget ceiling (§7.1) | absolute ceiling 10 min per scaled budget vs the factor cap alone | RULED: 10 min absolute wall-clock ceiling |

### 12.3 Ruled (owner, 2026-09-03 — #1292 program / #1293 migration)

Snap is the sole public rendered-instrument CLI. The current public `snap`, `motion-audit`, and
`perf-meter` command surfaces converge into Snap; motion and performance analyzers remain separate engines
behind Snap arms. The old commands hard-refuse with the Snap replacement and have no aliases. One Snap run
owns one ordered action tape, one pre-navigation/settled/post-capture lifecycle, one artifact slot, one load
receipt and one GPU/acceleration receipt. Arms that interfere with one another must declare and refuse the
combination, or execute as explicit separately named passes inside that one run; silent second navigation,
second browser, re-emulation or shared state mutation is forbidden.

The React census retained/excluded contract is §10.5: component/owner/source identity, bounded read-only
props/state/context/hook slots, commit costs and conservative change reasons, boundary state, update events,
React User Timing/track correlation and multi-renderer/page identity are retained; each row also records
its owning context. Public `--contexts` is deliberately excluded from every selective analyzer in this
program because that separate mode bypasses the shared analyzer lifecycle; the parser refuses the
combination instead of claiming unexercised multi-context evidence. Human-only or
mutating DevTools controls and the standalone frontend remain excluded. #1293's red-first unified behavior
suite is the migration proof; #1292 owns final reconciliation and retirement rather than any individual arm.
