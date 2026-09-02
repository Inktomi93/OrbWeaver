---
kind: design
status: active
updated: 2026-09-02
---

# 1208 — the instrument substrate: stateful sessions, per-lane stages, one grammar, arms

> **Status: design (owner-directed 2026-09-02, #1208; build not started).** The owner ruled: no MCP (we own the engine: Playwright + the vendored DevTools SDK), an in-house browser/instrument substrate, design first. The accepted seed is a STATEFUL snap (`pnpm snap --session <lane> …`). This doc widens the seed to the substrate every rendered instrument and every browser-driving agent goes through. #1163 (self-expiring stages, private port pairs) and #1202 (a died session must be loud) are PARKED into this program as sections §3.6 / §3.8, not standalone builds. Every boundary below names its enforcer; a prose-only boundary is a wish. Forks F1–F4 were ruled by the owner on 2026-09-02 (§12.1); the timeout/load policy (§7.1) is an owner addition of the same day.

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
| `tooling/src/_shared/browser.ts:262` `chromium.launch` · `:269` `launchPersistentContext` | THE one legal launch (gate `tooling-shared-plumbing` arm B) | per invocation | persistent-profile arm exists only for the DevTools SDK (`persistentProfileDir` + `--remote-debugging-port=0`, `_shared/devtools-runtime.ts:394`) |
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

1. **Bash is the one door.** No MCP in any agent definition or skill; every capability is a `pnpm <tool> …` flag. Enforcer: a new fs gate `agent-def-no-browser-mcp` over `.claude/agents/*.md` + `.claude/settings.json` (RED on `mcp__plugin_chrome-devtools`), landing with #1195 step 3.
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
| session (boot only; a later call carrying one REFUSES, exit 3) | `--base` / `--isolated` / `--ref` / `--dirty` / `--fresh` (WHERE) · `--viewport` / `--wide` / `--mobile` / `--desktop` / `--scale` · `--dark` / `--light` / `--reduced-motion` · `--appearance*` / `--full-motion` / `--theme` · `--cascade` (needs the debugging-port launch) · `--probe` · `--ls` · `--vnc` · `--debug-token` · `--no-failure-evidence` · `--strict-console` · `--session-ttl <min>` · `--contexts N` / `--as` (the fixture sidecar) | `--session <name>` first call |
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

**TTL, both arms of #1163.** `lastUsedAt` is stamped by every `ensureStage`, every session call bound to the band, and every attached sibling run (interaction = any request through the substrate, not only snap CLI calls). A stage with live session refs is never a strand. Arm (b), the active timer, lives in the session daemon (it already has a clock); a stage with NO session is reaped only by arm (a) or `--stage-sweep` — no extra daemon exists to leak. Defaults: session idle 30 min, stage idle 60 min (`ORB_SESSION_TTL_MIN`, `ORB_STAGE_TTL_MIN`) — owner fork F5.

**Health = three probes, one verdict.** `stageHealthy` (`stage.ts:86-88`) becomes `healthz ok` ∧ `vite answers` ∧ `served-probe fresh` (`tooling/src/stack/ops/served-probe.ts`, reached as a `stack.sh` verb) — a dead-watcher stage reads `degraded`, never `warm`. A `--dirty` stage additionally carries an ERA rule: `rsyncs > 20` or age > 6 h ⇒ `rebuild` (the long-lived-vite corrupt-graph class; a `--ref` stage never HMRs and is exempt).

**Teardown honesty (#1162).** `stack.sh:361` prints the survivors line unconditionally after a clean stop because `dev_identity clear-absent` can only succeed once the pidfile it deletes is gone; fix at the launcher (verify group death by pgid before the identity verb, print "waiting for group exit" while it retries), with a planted control: a genuinely surviving child (a `sleep` re-parented into the group) MUST still produce the loud line.

**`--base` fencing (#1186).** A `--base` whose port is a registered band asserts ownership: the row's checkout must be the caller's (or the row is `shared-reuse` at the same sha) else exit 2 naming both; a `--base` on a reserved/foreign row prints which. The session model makes bare `--base` rare: `--session x --isolated --ref <sha>` binds by construction, and sibling instruments inherit the binding from the session.

### 3.7 Artifact slots (integrates #1029 / #1164 / #1201 / #1202)

- **Per call, one slot** — the client opens it (`withInstrumentRun("snap", …)`, arm G unchanged) and passes `slotDir`; the daemon's `artifactDir/artifactFile` resolve into it (`_shared/artifact-out.ts` `beginInstrumentRun` gains an explicit-slot form; `activeRun` stays one-per-process in the CLIENT). A red call publishes; a crashed call leaves `.inflight`.
- **The session is a run slot too**: instrument `snap-session`, `runId` = the session name + boot stamp, `.inflight` marker pid = the daemon pid. Its dir holds `session.json`, the request ring, the console ring, HAR/trace when enabled. `abandonedRuns(root, "snap-session")` therefore lists dead sessions with ZERO new marker machinery (#1202's "reuse, do not re-spell").
- **`--session-export <name> [--out base]`** copies the rings/HAR/trace into a fresh call slot and publishes pointers (`reports/sessions/<name>/…`) — the only path from session-lifetime evidence to `reports/`.
- **Prune race** (#1029 refuted): the `statSync` in `pruneRuns` (`artifacts.ts:332`) is guarded like every other per-slot reader — a vanished slot is "nothing to prune". Pin: a pre-planted 12-slot ring + deadline-synchronized concurrent publishes (the two preconditions the existing pins lack, memory `prune-ring-statsync-is-the-concurrency-hole`).
- **CT writes** (#1201): a planned helper, tests/support/ct/snap-out.ts (planned), exports `ctSnapPath(name)`, which resolves into the CT run's own slot (`reports/runs/ct/<runId>/snaps/`); the CT flaky reporter publishes the pointers at the end of the run; a gate arm (`no-direct-reports-write`: a `reports/` path literal handed to `screenshot({ path })` in `tests/**`) REDs the direct spelling. Writes never target the alias, so the symlink is never followed.

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

### 4.1 Today's dialects (inventory)

| Family | snap | design-audit (`ui-audit`) | motion-audit | perf-meter (`cpu-profile`) | record (`screen-record`) |
| - | - | - | - | - | - |
| help | `--help`/`-h` | none (exit 3 + help) | none | none | none |
| where | `--base`, `--isolated/--ref/--dirty/--fresh`, `--file`, `--fixture-*` | `--base` (explicit-conflict check), `--isolated/--ref/--dirty/--fresh` | `--base`, `--url` | `--base` | `--base` |
| environment | `--viewport/--wide/--mobile/--desktop`, `--scale`, `--dark/--light`, `--reduced-motion` | `--viewport/--mobile/--desktop` | `--viewport/--mobile/--desktop`, `--os-reduced-motion/--os-full-motion` | `--viewport` | `--viewport` |
| app settings | `--appearance*/--full-motion`, `--theme`, `--panels` | same | same | same | none |
| nav | 6 verbs (`_shared/nav.ts`) | same | same | same (`NAV_FLAG_METHOD`) | none |
| steps | `--click/--jsclick/--press/--hover/--fill/--key/--wait-for/--upload` | `--click/--upload` | `--click` (reach) + `--selector` (measured) | `--click/--jsclick/--hover/--fill/--wheel/--wheelburst/--pause` | `--click/--jsclick/--hover/--fill/--wheel/--pause` |
| settle | `--wait <selector>`, `--sse <s>`, `--idle` | `--wait <ms>` | `--window <ms>` | `--settle <ms>` | `--settle <ms>` |
| load | `--cpu-throttle`, `--network` | none | `--no-throttle` (4× default) | none | none |
| evidence | `--text/--aria/--map/--eval/--contrast/--cascade/--expect-*/--json/--summary` | `--fail-on`, JSON always | RESULT + JSON | table + JSON, `--cpuprofile`, `--cycles` | webm/gif/strips, `--frames` |
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
| `ENVIRONMENT_FLAGS` | `--viewport`, `--wide`, `--mobile`, `--desktop`, `--dark`, `--light`, `--reduced-motion` | motion-audit's `--os-reduced-motion/--os-full-motion` keep their spelling as ALIASES resolved by the family (byte-stable tails) |
| `SESSION_ADMIN_FLAGS` | `--session-status`, `--session-close`, `--session-sweep`, `--session-export`, `--session-ttl`, `--force` | snap only (the door); refused on sibling tools with the pointer |
| `STAGE_ADMIN_FLAGS` | `--stage-status`, `--stage-down`, `--stage-sweep`, `--force` | snap only (unchanged ruling: one lifecycle owner) |
| `ARTIFACT_FLAGS` | `--out`, `--json` | `--out` base-or-path contract (`_shared/artifacts.ts:379`) for all five |
| `ALIAS_REFUSALS` | `--full-page→--full`, `--watch-every→--every`, `--name→--out`, `--screenshot→--shot-of` | an unknown flag that matches a known ask refuses NAMING the real flag (exit 3) |

The `--wait` collision (selector in snap, ms in design-audit) is owner fork F1; default: design-audit renames to `--settle <ms>` (perf-meter/record's spelling) with the old spelling refused by name — a value change that owes the `tests/**` literal sweep.

### 4.4 The session grammar (snap)

```text
pnpm snap --session <name> [where] [environment] [app settings] <route>      # boot + first call
pnpm snap --session <name> [--goto …|--click …|--eval …|--text|--map|--contrast …|--lighthouse …|--requests …]   # later calls: the LIVE page
pnpm snap --session-status [<name>]     # every session: owner · idle · stage band · cdp endpoint · dead/live
pnpm snap --session-close <name> [--force]
pnpm snap --session-sweep               # dead + idle>TTL + orphan dirs; live ones reported
pnpm snap --session-export <name> [--out <base>]
pnpm design-audit --session <name> [route] …   # attaches to the session's browser + stage (§3.4)
pnpm motion-audit --session <name> --selector …
pnpm perf-meter  --session <name> --click …
```

Invocation shape is guard-proof by construction (P9): one plain `pnpm <tool> …`, no `env`, no `cd`, no pipe; the repo-keyed socket makes the cwd irrelevant.

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

A new arm lands as ONE file `snap/ops/arms/<arm>.ts` + one tuple member; its flags, help, RESULT pairs and verdict fold are derived from the record. Because sibling instruments share the SESSION rather than re-host arms, "available to every instrument and agent" means: any lane attached to a session can ask snap for any arm against the same live page (`pnpm snap --session p-x --lighthouse desktop` after `pnpm design-audit --session p-x …`). Enforcers: the `Record<Arm, …>` exhaustiveness (compile-time); `tooling-instrument-proof` (each arm's `@instrument-proof` / `@instrument-absence-proof` twin under tests/tooling/snap/ops/arms/ (planned)).

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
| drain (orchestrator) | at fold: `--session-close <lane>` + `--stage-down --owner <checkout>`; at a train: `--session-sweep` + `--stage-sweep`; the survivors line is honest after §3.6's fix | replaces "`--stage-down --force` from main" |
| nice | daemons via `spawnNicedChild`; browsers inherit; the stage stack stays the one full-priority exception | `tooling-shared-plumbing` arms F/F2 |
| contention receipts | today: 5 drivers in one hour on 09-02 with ONE band; with 3 bands the same hour needs no refusal | `--stage-status` prints bands used / free / stranded |

### 7.1 Timeouts and load: one budget policy (owner addition 2026-09-02)

**The class.** A wall-clock budget written for a quiet box reads as a RED on a contended one, and a measured RATE taken on a contended box is a number about the box, not the code. Both wear the clothes of a real verdict. Today the fleet carries FOUR unrelated answers to that class; the substrate carries ONE.

Inventory (receipts):

| Site | Budget today | What happens under load |
| - | - | - |
| `tests/tooling/_shared/browser.int.test.ts` | vitest's 5 s default test timeout for the parallel integration lane (`vitest.config.ts:260` sets 30 s only for the serial project); the suite's own children at 30 s (`:47`) and 5 s (`:231`) | 5 timeouts at loadavg 41 on 2026-09-02 — generic reds, no load receipt |
| Playwright CT | `expect`/`expect.poll` 5 s and the 30 s test timeout are Playwright defaults (`playwright-ct.config.ts` pins neither; workers pinned at `:41`) | every test times out at `mount()` at loadavg 170 with zero signal (`.claude/rules/browser-and-instruments.md`) |
| `tests/ui/variant-arm-parity.suite.test.ts:103` | fixed `{ timeout: 30_000 }` | the same class, one file |
| `tests/tooling/gate-ignore-grammar.int.test.ts:154` | fixed 300 s `beforeAll` hook (\~60 s quiet) | 470–485 s at load 40+ with five lanes live — red on both sides of any change (#1174) |
| `tests/tooling/ui-audit/**` CLI int tests | fixed child budgets, no withhold | different tests exit 2 each run at `--maxWorkers=4` and `=2`, clean standalone (#1222) |
| `tests/tooling/motion-audit/cli.int.test.ts:136,161` | `withholdMeasurement` on the in-budget twin AND the mobile arm (landed after #1040; the brief's "mobile arm lacks it" premise is stale at this tip) | withholds with the loadavg receipt — the shape the rest lacks |
| `tests/tooling/_load-budget.ts` | THE existing mechanism: `computeLoadFactor` (per-core 1-min loadavg, cap 8), `scaledBudget`, `judgeMeasurementLoad`/`withholdMeasurement` (`ORB-LOAD-WITHHOLD`), `runNodeWithBudget`/`spawnNodeWithBudget` (`ORB-LOAD-KILL`), `isTimeoutKill` (both node kill shapes); the supervisor counts withheld arms per shard (`scripts/vitest-supervised.mjs:238-243`) | correct, but TEST-ONLY: 11 suites import it; no instrument, no daemon, no CT config, no launcher reads it |
| instrument budgets: `snap/lib/budgets.ts` (nav 15 s · wait 10 s · step 5 s · stage nav/ready 90/60 s · throttled 90/60 s), `snap/lib/throttle.ts:94-99` `driveBudgets` (widest independent cause wins — memory `throttle-arms-need-their-own-budgets`), `ui-audit/lib/budgets.ts` (nav 15 · wait 10 · click 5 · census observe 2–5 s), `motion-audit/lib/budgets.ts` (nav 20 · ready 10 · step 5), `cpu-profile/lib/budgets.ts` + `screen-record` (nav 20 · step 5), `_shared/proc.ts` `spawnNiced` default 120 s | fixed ceilings; load turns a slow-but-fine surface into `app never signalled data-app-ready` / `STEP FAILED … Timeout` — a false red about the app | |
| the readiness ladder `snap/ops/drive.ts:41-55` (`settled` / `degraded` / `dataless` / `absent`) | `degraded` is the APP's own ceiling (`app-ready-signal`) handing over with reads in flight | already an honest NAV ERROR, but nothing says WHY it degraded — a loaded box and a slow query read the same |
| stage boot `tooling/src/stack/stack.sh:107-108` | fixed `SERVER_HEALTHZ_TIMEOUT` 180 s / `READINESS_TIMEOUT` 240 s | a cold boot under a train reads `boot-timeout` (memory `stack-restart-vs-battery-contention`) |

**The law (three classes, three consequences, ONE reading of the box).** `computeLoadFactor`'s quiet/contended boundary (per-core 1-min loadavg ≥ 1.0, factor 1 → >1) is the only threshold; nothing mints a second constant (memory `load-scaling-transfers-to-clocks-not-to-rates`).

| Class | Members | Consequence |
| - | - | - |
| WALL CLOCK | nav / readiness / step / settle ceilings, child-process timeouts, vitest test + hook timeouts, CT test + expect timeouts, stack boot ceilings, session per-call ceilings | `budget(baseMs)` = `baseMs × factor`, factor capped at 8 AND an absolute ceiling (`ORB_BUDGET_CEILING_MS`, default 10 min — fork F11) so a wedged subject still surfaces. A budget that fires is an honest exit 2 (`ORB-LOAD-KILL: <what> exceeded its load-scaled budget (<ms> = <base>×<factor>) at loadavg <la>/<cores>` — could not measure), never a violation |
| RATE | dropped-frame %, CLS deltas, LoAF/INP/blocking ms, rAF gaps, perf-meter's timing columns, any A/B delta | WITHHELD at the same boundary before the arm votes: the arm prints `WITHHELD (ORB-LOAD-WITHHOLD … loadavg <la>/<cores>)`, the RESULT pair reads `<arm>=withheld`; an instrument whose ONLY output is the rate (motion-audit, perf-meter) exits 2; a run with other verdict members (snap's `--eval`, design-audit's census) keeps them and marks the rate arm withheld. Never widened, never red (#1040 "withhold, don't red") |
| IDLE | session/stage TTLs | NOT a budget — idle is not load; a TTL is never scaled and never withheld (§3.6) |

**The mechanism, one home.** The pure core of `tests/tooling/_load-budget.ts` moves DOWN to `tooling/src/_shared/load-budget.ts` (the plumbing floor): `readBoxLoad`, `computeLoadFactor`, `budget(baseMs)`, `judgeMeasurementLoad`, `loadReceipt()` (the `load=<la1>/<cores>` + `budget-factor=<f>` RESULT pairs), `isTimeoutKill`, the two markers. `tests/tooling/_load-budget.ts` keeps only the vitest seam (`withholdMeasurement` stamping `task.meta`) and imports the core through the @orb/tooling/\_shared/load-budget subpath (planned). Applied uniformly:

- **instruments** — every `lib/budgets.ts` constant becomes a BASE; `driveBudgets` returns `budget(max(...))`; `_shared/proc.ts` doors take `budget(...)`; `printVerdict` prints the two load pairs on every RESULT line by default (a reader can tell a stretched run from a quiet one without the argv); each RATE arm calls `judgeMeasurementLoad` before voting and declares itself in its arm def (`ArmDef.needs.quietBox: true`, §6) so the withhold is data, not discipline;
- **the session daemon** — per-call ceilings are `budget(base)`; a `busy` refusal names the in-flight op's remaining budget; a call that hits its ceiling is aborted at the Playwright call (the page and the session survive — the NEXT call names the aborted op); the TTL stays unscaled;
- **the CT harness** — `playwright-ct.config.ts` sets `timeout: budget(30_000)`, `expect: { timeout: budget(5_000) }`, `use.actionTimeout: budget(15_000)` at config load (the config already decodes env); a CT that measures a RATE calls `withholdRate(test.info())`, which annotates `orb-load-withheld` and skips — Playwright's `test.info().annotations` is the reporter-visible channel, the CT twin of `task.meta` — and `ct-flaky-reporter.ts` counts the annotation beside its flake tally;
- **the int tests** — `vitest.config.ts` sets each project's `testTimeout`/`hookTimeout` from `budget(...)` (the 300 s hook of #1174 becomes `budget(120_000)` under the ceiling; the parallel lane's 5 s becomes `budget(5_000)`), and the CLI-spawning ui-audit suites (#1222) take the withhold on their rate-shaped arms and `runNodeWithBudget` on the rest;
- **the launcher** — `stack.sh` reads `SERVER_HEALTHZ_TIMEOUT`/`READINESS_TIMEOUT` from a `budget` answered by the node half it already shells (`prod-entry.ts classify` is the precedent), so a cold stage boot under a train is not a false `boot-timeout`;
- **the readiness ladder** — `degraded`/`absent` carry the load receipt in their message so a reader can separate "the app is slow" from "the box is".

**Enforcers.** Gate `tooling-shared-plumbing` arm **J**: a numeric wall-clock literal handed to a `timeout`/`timeoutMs`/`{ timeout: N }` option of Playwright, `node:child_process`, vitest or the CT config anywhere in `tooling/src/**`, `tests/tooling/**`, `vitest.config.ts`, `playwright-ct.config.ts` outside `_shared/load-budget.ts` is RED (scan-and-allowlist with reason rows for the deliberate fixed clocks — a settle wait is not a budget); `tooling-instrument-proof`'s `@instrument-absence-proof` for every RATE arm must plant a loaded box and assert the withhold; `check:structure` sees the two config files through the same arm.

Planted controls (added to §8): **T14** a forced-load reading (`readBoxLoad` injected at per-core 4.0) makes a RATE arm print `WITHHELD` with the loadavg receipt and exit 2 / mark withheld — never a red; **T15** a quiet reading (per-core 0.3) leaves factor 1, budgets byte-identical to their base, and the arm measures (the positive control that the withhold cannot become a way to stop testing); **T16** a genuinely hung subject (a fixture page whose `data-app-ready` never lands) under the same forced load still exits 2 with the `ORB-LOAD-KILL` message naming base × factor and the loadavg — the ceiling is not a way to hang; **T17** the daemon: a call whose step hangs is aborted at its scaled ceiling with exit 2, and the next call on the same session runs (the session survived the abort).

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

Every phase is one lane, one commit, scoped floors; whole-tree gates are the orchestrator's. Floors name the programs: per-package `pnpm typecheck` + `node scripts/ts7.cjs --noEmit -p tsconfig.json` + `-p tooling/tsconfig.json`; biome + eslint on touched files; `pnpm check:structure`; `pnpm knip`; `pnpm exec depcruise packages tooling --config .dependency-cruiser.cjs`; the named suites via `pnpm test:scoped <paths> --maxWorkers=4`; CT via `pnpm ct:scoped <paths> --workers=2`; `check-gates.int` / `gate-conformance.int` whenever a gate arm changes.

| Phase | Lane / tier | Lands | Files (new ‖ changed) | Floor (suites by path) |
| - | - | - | - | - |
| 0 spike | executor, 1 lane | (a) CDP multi-client: daemon-owned `page.route` shim keeps applying while a second Playwright `connectOverCDP` client drives the same page — a planted int test; (b) `lighthouse` snapshot against a `--remote-debugging-port` browser over a `--file` fixture. Decides fork F3's fallback | tests/tooling/\_shared/browser-attach.int.test.ts (planned) ‖ none | that test + `tests/tooling/_shared/browser.int.test.ts` |
| 1 sessions | forge (the design is the risk), 1 lane | the daemon + client + protocol + TTL + cap + sweep + status + export over `--base`/`--file`; `runOnSession` split; the scenario partition promoted to `lib/session-plan.ts`; per-call slots with explicit `slotDir`; the session run slot + `abandonedRuns` reader; `attachProbeSession` + gate arm H; help/session flags | `snap/ops/session-daemon.ts`, `session-client.ts`, `flags-session.ts`, `contract/session.ts`, `lib/session-plan.ts`, tests/tooling/snap/ops/session-daemon.int.test.ts + tests/tooling/snap/lib/session-plan.test.ts (both planned) ‖ `snap/cli.ts`, `ops/run.ts`, `ops/parse.ts`, `ops/scenario.ts`, `contract/help.ts`, `_shared/browser.ts`, `_shared/artifact-out.ts`, gate `tooling-shared-plumbing` | T1 T2 T3 T5 T6 T9; `tests/tooling/snap/**`, `tests/tooling/_shared/{browser,artifacts,artifact-out}*.test.ts`, `check-gates.int` |
| 1b load budgets | executor, 1 lane (∥ 1) | §7.1: `_shared/load-budget.ts` (the core promoted DOWN), `budget()` through every instrument's `lib/budgets.ts` + `driveBudgets` + `_shared/proc.ts`, the `load=`/`budget-factor=` RESULT pairs in `printVerdict`, RATE-arm withholds (motion-audit, perf-meter, snap's perf pair), CT config + `withholdRate`, vitest config budgets (#1174), the ui-audit suites (#1222), the launcher ceilings; gate arm J | `_shared/load-budget.ts`, tests/support/ct/withhold-rate.ts (planned), tests/tooling/\_shared/load-budget.test.ts (planned) ‖ `tests/tooling/_load-budget.ts`, the five `lib/budgets.ts`, `snap/lib/throttle.ts`, `_shared/evidence.ts`, `_shared/proc.ts`, `playwright-ct.config.ts`, `vitest.config.ts`, `tooling/src/stack/stack.sh`, `tooling/src/verify/ops/ct-flaky-reporter.ts`, gate `tooling-shared-plumbing` | T14 T15 T16 T17; `tests/tooling/load-budget.int.test.ts`, `tests/tooling/motion-audit/cli.int.test.ts`, `tests/tooling/cpu-profile/cli.int.test.ts`, `tests/tooling/ui-audit/cli.int.test.ts`, `check-gates.int`; the two config literals via `check:structure` |
| 2 stages | forge, 1 lane | `_shared/ports.ts` + gate arm I; `bands.json` table; allocation + lazy reap + TTL arms; health = three probes + the dirty era rule; `--stage-status` lists all bands; `--base` fencing; #1162 survivors fix at the launcher; `ensureStage({ band, session })`; sibling tools gain `--session` (attach) — motion-audit/perf-meter/record therefore gain a branch-side arm without new stage code | `_shared/ports.ts`, tests/tooling/\_shared/ports.test.ts, tests/tooling/snap/ops/stage-bands.int.test.ts, tests/tooling/stack/stop-survivors.int.test.ts (all planned) ‖ `snap/lib/stage-plan.ts`, `ops/stage*.ts`, `ops/guards.ts`, `ui-audit/ops/stage.ts`, `motion-audit/ops/{parse,run}.ts`, `cpu-profile/ops/{parse,run}.ts`, `screen-record/ops/{parse,record}.ts`, `tooling/src/stack/{stack.sh,multi-user-fixture.sh}`, `tests/e2e/support/modes.ts`, `playwright-ct.config.ts`, `model-ab/ops/serve.ts` | T4 T7 T8 T11 T13; `stage-plan.test.ts`, `stage.test.ts`, `tests/tooling/stack/**`, `tests/tooling/dependency-cruiser.int.test.ts`; a live landing receipt on three bands |
| 3 arms | executor, 1 lane (after 1) | `contract/arms.ts` registry + `ops/arms/*` (existing arms re-homed by nature, byte-stable flags); `lighthouse` (#1198) + `requests` (#1199) with both proof classes; help derived | `snap/contract/arms.ts`, `snap/ops/arms/{shot,aria,map,eval,contrast,cascade,dead-css,assert,perf,requests,lighthouse}.ts`, the arm pins under tests/tooling/snap/ops/arms/ (planned) ‖ `ops/capture.ts`, `ops/parse.ts`, `contract/help.ts`, `_shared/browser-capture.ts`, `tooling/package.json` (+ catalog pin) | T10; `tests/tooling/snap/**`; `tooling-instrument-proof` conformance |
| 4 grammar + retirement | executor, 1 lane (after 3) | `_shared/instrument-argv.ts` families consumed by the five parsers; `--help` everywhere; alias refusals; F1's `--wait` decision; CT slot helper + gate arm (#1201); `agent-def-no-browser-mcp` gate; MCP retirement (#1195 §2.3: side-eye def, settings, skill rows); the P11 stale-path sweep in skills/rules/memory index | `_shared/instrument-argv.ts`, tests/support/ct/snap-out.ts (planned), gates ‖ the five `ops/parse.ts`, `.claude/agents/side-eye.md`, `.claude/skills/{snap-driving,side-eye-design-review}/**`, `.claude/rules/browser-and-instruments.md`, `docs/architecture/core/Core-Tooling-Law.md` §2.4/§4.4/§4.9 | T12; each tool's `parse.test.ts` + `cli.int.test.ts`; `check:agents`; scoped `check:docs`; the `tests/**` literal sweep for every renamed flag |

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
| export | the client's slot receives `sessions/<name>/{session,console,page-errors,requests}.json` → pointers `reports/sessions/<name>/…`. A session records NO Playwright trace/HAR (`failureEvidence` forced off at boot, printed once): a per-call trace stop would end the session's tracing — phase 3's ring widening owns session-lifetime evidence | — |
| phase-1 refusals | `--session` with `--matrix`/`--scenario`/`--contexts`/`--as` (F10: phase 3); `--cascade` on a later call (boot-level runtime); `--session-daemon` is internal (help says so) | — |
| gate arm H | `<engine>.connectOverCDP(` AND `<engine>.connect(` (Playwright's websocket attach, the §9-refused alternative) outside `_shared/browser.ts`, within the gate's `tooling/src/` scan; puppeteer's `connect` is phase 3's call | widening the scan to `tests/` (test-owned browsers are out of the substrate by §2.1) |
| budgets | `SESSION_BOOT_TIMEOUT_MS` (240 s — the launcher's own readiness ceiling) + the ready poll live in `lib/session-plan.ts` as BASES; no per-call ceiling in phase 1 — 1b wraps them in `budget()` (§7.1) | minting a budget in `snap/lib/budgets.ts` (1b's file) |
| `--stage-status` | gains one `sessions :` line (§3.8's third reader) | — |

**Coupled-site census (expect every one to move).** `snap/contract/types.ts` (`Args` +9 session fields + `routeGiven`) → `ops/parse.ts` (the one literal; `sessionValidationPairs` rows; the `OPTIONAL_NAME_FLAGS` scanner class; `routeGiven` in the loop) → `ops/flags-classes.ts` → `ops/flags-session.ts` (new, spread into `FLAG_HANDLERS`) → `contract/help.ts` (a `Sessions` block; the existing help pins in `tests/tooling/snap/index.test.ts:541` keep their literals) → `cli.ts` (`main(opts, argv)`; the daemon verb dispatches BEFORE `withInstrumentRun`; the client verb INSIDE it) → `index.ts` exports → `ops/run.ts` (`runOnSession` split; `runSnapDetailed` = launch + run + finish) → `ops/capture.ts` (`capturePages` gains the navigate flag) → `ops/scenario.ts` (partition + refusal rows moved to `lib/session-plan.ts`) → `ops/session.ts` (`launchSnapSession` `debuggingEndpoint` extra + `debuggingEndpointFor`) → `ops/stage-status.ts` (the sessions line) → `_shared/{proc,log,artifacts,artifact-out,browser,devtools-runtime}.ts` + `_shared/debugging-endpoint.ts` (new) → gate `tooling-shared-plumbing` (arm H + rows) → docs (`UNIFIED-VERIFICATION-DESIGN.md` §3.3b, `Core-Tooling-Law.md` §2.4/§4.4, `Core-Enforcement-Active-Gates.md` row, this doc) → ledgers (`docs/test-baseline/manifest.json` +2 specs; `docs/reviews/caught-failure-ownership/population.json` re-derived — every touched `_shared` file carries rows).

**Test plan.** `tests/tooling/snap/lib/session-plan.test.ts` pins the pure core both ways (partition, refusal rows, `sessionAccess` all four cells, name validation, limits from env values, the DEAD/cap/foreign texts, sweep verdict, `stripSessionFlags`). `tests/tooling/snap/ops/session-daemon.int.test.ts` drives the REAL cli over `--file` fixtures with a scratch registry home (`ORB_SNAP_SESSION_HOME`) and a tiny cap/TTL from env: T1 (A `--viewport 412x823` reads 412, B reads 1280 — plus the one-shot twin as the FENCE it is), T2 (SIGKILL A → `SESSION DEAD … mid-` exit 2; `abandonedRuns` names A not B; sweep reaps + settles; B survives), T3 (two sessions, one `--out`, both slots keep the PNG, the pointer names a FINISHED run), T5 (TTL 0.05 min → dies; a half-window call keeps it past 2× the window), T6 (cap 2: the third boot exits 2 naming both with idle ages; closing one admits it), T9 (one-shot vs session RESULT pairs identical except `out`; a planted contrast defect reds both), plus busy (exit 2 naming the op), foreign (a `git init` scratch checkout is refused naming owner/pid/idle) and attach (`attachProbeSession` drives the live page and the owner survives). Gate arm H: conformance rows (planted `connectOverCDP(`/`connect(` outside the home flag; inside passes) via `gate-conformance.int`. Red-first: the new suite against the unmodified cli reds on `unknown flag --session` (the trivial red); the load-bearing reds are the planted controls above.

**Forks stated (defaults taken, escalated in the report).** (a) Scenario checkpoints keep SILENTLY inheriting `--viewport`/`--dark`/… from the outer command (today's behaviour); sessions REFUSE the same flags loudly. Default: leave scenario byte-stable (a value change owes its own sweep), unify in phase 4. (b) The session slot's run id stays the house scheme (`<checkout>-<pid>-<stamp>`) instead of `<name>-<stamp>`; the name is the row's. (c) `--session-export` carries rings only, no trace/HAR, until phase 3.

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
| F7 orchestrator teardown of a foreign LIVE stage | (a) `--stage-down --owner <checkout> --force` (explicit consent, per band); (b) unchanged blanket `--force` | RULED: (a) — per band, naming the owner (phase 2) |
| F8 MCP retirement timing | after phase 3 (`#1195` §2.3) vs after phase 1 | RULED: the MCP retires the day #1198's plain Lighthouse arm folds — not tied to a phase |
| F9 `lighthouse` dependency | pin in tooling vs refuse the arm and keep the MCP for it | RULED: pin BOTH catalog rows — `lighthouse ^13.4.1` + `puppeteer-core ^25.9.0` (the spike measured that snapshot mode needs the puppeteer page handle; both landed as root devDeps with #1226) |
| F10 matrix through a session | run `--matrix` cells as contexts in one session (one browser, N contexts) vs keep one-shot cells | RULED: the appearance MATRIX rides a session in PHASE 3 (the phase-3 row widens accordingly); phase 1 refuses `--session` + `--matrix` |
| F11 budget ceiling (§7.1) | absolute ceiling 10 min per scaled budget vs the factor cap alone | RULED: 10 min absolute wall-clock ceiling |
