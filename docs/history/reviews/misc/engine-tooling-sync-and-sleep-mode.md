---
kind: history
status: archived
updated: 2026-08-08
---

# Engine/stack tooling sync audit + vLLM sleep-mode design

> Phase-1 READ-ONLY deliverable (2026-07-27). No source/package edits made — this file is the only write.
> Prepared against: vLLM 0.22.1 (venv source read), live engines :8701/:8702/:8703 (GET-only probes),
> box = 2×RTX A6000 48GiB · 125Gi RAM.

---

## PART A — the actual management surface (what is live today)

### A.1 The live call graph

```
pnpm dev            → scripts/dev/dev.sh
                        ├─ export STACK_ENGINES=yes
                        ├─ scripts/dev/engines.sh   (venv bootstrap shim → exec tsx engines.ts)
                        │    └─ scripts/dev/engines.ts   ← the TS engine OWNER (foreground)
                        │         └─ buildEngineSpawnSpec → buildEngineArgv   (SHARED with the server)
                        └─ tsx watch entry/index.ts  → in-server supervisor ADOPTS the warm engines

pnpm stack <verb>   → scripts/dev/stack.sh {start|start-fg|stop|restart|status|logs}
                        pins VLLM_DISABLED=true → the stack NEVER runs engines (server+vite only)
                        start   = setsid + pidfile (detached, group-kill stop)
                        start-fg = SAME leader body, foreground (Playwright webServer entrypoint)

pnpm engines        → scripts/dev/engines.sh → engines.ts (FOREGROUND owner, Ctrl-C to stop)

pnpm e2e / e2e:smoke / e2e:live
                    → playwright.config.ts webServer = `stack.sh start-fg`
                        + stackEnv pin mirror + reuseExistingServer (local)
                        + tests/e2e/support/global-setup.ts (seeds KNOWN state via tRPC)

pnpm check / verify / test → scripts/verify/run.ts battery (static vs suites) — no engine involvement
pnpm seed:demo [--fresh]   → the ONLY deliberate DB wipe path (--fresh rm db + re-migrate + seed)
```

In-server adoptive supervisor (`packages/server/src/infra/providers/vllm/engine/supervisor.ts`):
probes each port /health on a 21s tick → adopt / spawn+own (pipe-watchdog, setsid group) / restart
(backoff + breaker) / orphan-EngineCore reap. `STACK_ENGINES=yes` = wait-and-adopt grace (15 min).
Admin restart rides `engine-control.ts` (controller registry). Argv + spawn env have ONE home
(`build-argv.ts` + `spawn-engine.ts`) shared by both owners — drift between them is impossible by
construction. Engines bind `--host 127.0.0.1` (hardcoded `LOOPBACK_HOST`).

### A.2 sh-era vs TS-era status

| File | Status | Verdict |
| - | - | - |
| `scripts/dev/engines.ts` | LIVE — the engine owner | canonical |
| `scripts/dev/engines.sh` | LIVE but reduced: venv-bootstrap shim, then `exec tsx engines.ts` | correct survivor (the bootstrap must precede the venv the engines exec); NOT a remnant |
| `scripts/dev/vllm-engine.sh` | GONE — absorbed into `build-argv.ts`/`spawn-engine.ts` | clean; referenced only in comments as history |
| `scripts/dev/stack.sh` | LIVE, load-bearing (pgid discipline, env pins, e2e entrypoint) | keep in sh — process-group choreography is its point |
| `scripts/dev/dev.sh` | LIVE (`pnpm dev`) | keep |
| `scripts/dev/vllm-setup.sh` | LIVE (first-run venv bootstrap, called by engines.sh) | keep |
| `scripts/dev/sandbox.sh` | LIVE (`pnpm sandbox`) | out of engine scope |
| `scripts/dev/multi-user-fixture.sh` | LIVE (consumed by probes `_kit/fixture.ts`, `snap.ts`, `multi-user-seed.ts`) | keep |
| `scripts/dev/oracle-steady-clone.sh` | RETIRED-CAMPAIGN tool (neo parity capture; campaign complete per constitution §7). Its committed output (`tests/support/fixtures/parity/neo-reference.json`) is still consumed by `tests/support/parity-runner.ts` | candidate for `history` annotation, not deletion — owner call |

**No live disagreement found** between the two engine owners (shared builder), or between stack.sh
and playwright stackEnv (values byte-identical; the mirror is annotated in both files — acceptable
duplication, the config comment says MUST match).

### A.3 Drift / gap findings

1. **Workboard STANDING-FACTS claim is WRONG about the DB.** `docs/retro-workboard.md:349` says
   `pnpm engines` = no DB reset "unlike `stack.sh restart`". Verified in code: **`stack.sh restart`
   does NOT reset the DB either.** Nothing in stack.sh/dev.sh touches the DB; server boot
   (`entry/boot/migrate.ts`) resets a *dev* DB **only on baseline-migration-hash mismatch**
   (launched DBs are boot-FATAL instead, never auto-wiped). The only deliberate wipe is
   `pnpm seed:demo --fresh`. The `pnpm engines`-touches-nothing half is TRUE (engines.ts
   deliberately never reads the DB). → fix the workboard line post-GO.
2. **No engine stop/status verbs.** `pnpm engines` is the ONLY engine front door; stop = Ctrl-C the
   foreground owner (or kill its pid). `stack.sh status` reports server+vite only — engine health is
   invisible from package.json (you curl :870x/health by hand).
3. **No detached engine launch — the bit-us-twice gap.** engines.ts traps SIGINT/SIGTERM and
   **group-kills all three engines** on exit (`process.kill(-pid)`). Run from an agent-harness/SSH
   session, session teardown TERMs the foreground owner → the trap deliberately takes the engines
   down. The engines themselves are setsid group leaders and would survive an *untrapped* parent
   death — it is the owner's cleanup that kills them. stack.sh solved this exact class years ago
   (setsid + pidfile + group-kill-on-stop); the engines path never got the same treatment, hence the
   manual `setsid nohup pnpm engines & disown` workaround.
4. **Engine posture asymmetry (deliberate, but surprising — document, don't change):**
   env floor `VLLM_DISABLED` defaults **false** → bare `pnpm dev` boots engines; `pnpm stack` and
   the e2e stack pin `VLLM_DISABLED=true` → never engines. So "the dev stack" means engines-on via
   `pnpm dev` but engines-off via `pnpm stack start`. The workboard's operating mode (stack up +
   `pnpm engines` separately) is a third topology: stack's server has no supervisor (disabled), so
   the standalone owner is the ONLY thing holding the engines.
5. **`pnpm engines` blocks forever by design** (foreground owner) — fine interactively, hostile to
   automation; every scripted caller needs backgrounding ceremony today.

### A.4 Sync plan — THE FLEET MODEL (owner keystone 2026-07-27) + package.json as the ONE front door

**The organizing principle (owner-directed): engines are a box-level SINGLETON FLEET; every app
stack is an ADOPTER.** "Multiple orbs running one stack" — dev server, snap stage, playwright e2e,
alt/E2E stacks all share the three engines; nothing ever spawns a second set, and nothing
cold-starts engines as a side effect of a test or a snap. The supervisor's adopt-if-healthy logic
(`decideTick` → adopt on a healthy probe — already proven across the alt-stack runs) is elevated
from an env-combo trick to the DEFAULT posture everywhere.

**Ownership inversion — completes the detached-launch fix (A.3-3) at the root.** No stack ever
owns engines as process children again; the children-die-with-launcher class dies permanently.
The detached verb is the ONE spawner:

```
pnpm engines            # adopt-or-start + follow logs: ensures the fleet (detached), tails
                        #   .cache/stack/vllm-*.log; Ctrl-C DETACHES (fleet stays warm) — explicit
                        #   engines:stop is the only kill. The bit-us-twice class is unmakeable.
pnpm engines:start      # THE spawner: reconcile → VRAM pre-check → setsid-detached boot +
                        #   .cache/stack/engines.pgid; idempotent (pidfile+port preflight), so
                        #   concurrent triggers from N adopters collapse to one spawn
pnpm engines:stop       # group-kill by pidfile, family-verified (hygiene #2)
pnpm engines:status     # the fleet's single pane: per-engine pid/family · /health · /is_sleeping
                        #   · posture of known adopters · per-GPU tenants · RESULT line
pnpm engines:sleep      # Part B — loopback POST /sleep (+ hold marker; see B.6/B.7-4)
pnpm engines:wake       # Part B — VRAM headroom pre-check → refuse-naming-holders OR wake + wait
```

**Posture vocabulary** — ONE env knob, `ENGINES_POSTURE ∈ off | adopt-only | adopt-or-start`,
replacing the `VLLM_DISABLED`/`STACK_ENGINES` combo folklore:

| Posture | Meaning | Default for |
| - | - | - |
| `off` | backend not registered, no supervisor (GPU-less/cloud-only box) | container/CI without GPU |
| `adopt-only` | backend registered; supervisor adopts healthy engines, NEVER spawns; engines down → honest fail-fast ("engines down — `pnpm engines:start`"), no implicit 3-min cold boot; passive consumer (no auto-sleep management; on-demand wake allowed — it's a consumer need) | **snap stage · playwright e2e · alt/E2E stacks** |
| `adopt-or-start` | fleet MANAGER: adopts when healthy, triggers the detached spawner (through `engines:start` — never in-process children) when down, owns restart/breaker + the auto-sleep timer (B.5) | **the dev/prod server** |

- **Dev posture argued: `adopt-or-start` (detached) wins.** Bare `pnpm dev` must keep just-working
  on a cold box (the one-command story), but the spawn goes THROUGH the verb, so the engines land
  in the pidfile-owned detached group — a dev Ctrl-C leaves the fleet warm for the next orb, which
  is the whole fleet point. `adopt-only` for dev would re-introduce a mandatory two-command boot
  ceremony for zero safety gain (the VRAM pre-check + verb idempotency already guard the spawn).
- **Supervisor refactor implied**: `spawnOwned`'s in-process child + pipe-watchdog death-coupling
  is DELETED (death-coupling is the anti-goal now); the supervisor's `spawn` action becomes
  "invoke the detached spawner" (breaker + backoff retained, VRAM-gated inside the verb).
  `STACK_ENGINES` and its `stack-pending` grace re-key onto posture + spawner-pidfile presence.
- **Adoption probe is ONE probe everywhere**: /health + (post-sleep) the `is_sleeping` arm — the
  same `probeEngine`, one home, compiled into every adopter (A.5-4).
- **Back-compat mapping (visible deprecation log line, never silent re-semantics):**
  `VLLM_DISABLED=true` → `off` · `VLLM_DISABLED=false` (or unset) without `STACK_ENGINES` →
  `adopt-or-start` (matches today's spawn-if-down intent; the CHILD-spawn mechanics change is the
  fix, not a semantics change) · `STACK_ENGINES=yes` → `adopt-only` + boot grace. Fact-check
  carried from the read: playwright's stackEnv pins `VLLM_DISABLED: "true"` today
  (playwright.config.ts:27) — it maps to `off`; flipping e2e to `adopt-only` is what makes the
  post-skin-retirement `E2E_LIVE=1` runs honest (the live spec needs the vllm backend registered
  and adopts the fleet; engines down → the live cell fails fast with the named message instead of
  a timeout).
- Split by wheelhouse: `start`/`stop` pgid choreography stays bash (engines.sh); `status`/`sleep`/
  `wake`/reconcile logic lands in `scripts/dev/engines-ctl.ts` importing the server module — the
  wake-budget math and util fractions stay ONE-homed (B.6), never re-spelled in bash.
- `RESULT …` last-line machine contract, same as stack.sh (probe convention).
- Workboard STANDING-FACTS correction (A.3-1) rides the same commit.
- **How it composes (the keystone's payoff):** the VRAM pre-check guards the ONE spawner; the
  orphan sweep reconciles the ONE fleet; auto-sleep is owned by the manager posture, auto-wake by
  every adopter's shared `client.ts` gate; `engines:status` is the single pane over all of it.

**Supervision hygiene (owner addendum 2026-07-27 — "make this as clean as possible").** Each
engine is a process FAMILY (APIServer → EngineCore → Worker\_TP0/TP1 + multiproc resource
trackers); an unclean death orphans VRAM-holding EngineCores/Workers with no live APIServer — the
recurring zoo. The verb dispatcher owns the whole lifecycle:

1. **Reconcile-before-spawn** (`engines:start`, and the same body callable as `engines:reconcile`):
   stale pidfile (pid dead / start-time mismatch) → clean it; then orphan sweep — engine-family
   processes with no live owner, identified PRECISELY: the proven `/proc/<pid>/cwd == repoRoot AND
   parent's cwd != repoRoot` marker the in-server supervisor's `reapOrphanedEngineCores`
   (`supervisor.ts:151`) already uses, EXTRACTED to a shared module and widened from
   `EngineCore`-only to the full family cmdline set (`EngineCore` · `Worker_TP` · `vllm serve` on
   OUR ports/models). **Never a bare `vllm`/`api_server` substring grep** — the false-positive
   class is live (an IDE language server matched `api_server` today). Kill order: TERM → bounded
   wait → KILL, per process group. Cross-check: nvidia-smi compute-apps pids vs the identified
   family — an orphan holding VRAM is OURS to reap, and reaping it FIRST is what keeps the B.6
   wake pre-check honest (otherwise the refusal would name our own corpse as a "foreign tenant").
2. **`engines:stop` kills the FAMILY, verified**: group-TERM via pidfile pgid, then poll the known
   pids AND the three ports until gone (bounded), escalate stragglers to KILL, and REPORT what it
   killed (pids per engine) — never "sent a signal and hoped."
3. **`engines:status` shows the family**: per engine — APIServer pid + child tree state (alive /
   partial / orphaned), port health, `is_sleeping`, plus the per-GPU compute-tenant list. A
   half-dead tree becomes something you SEE, not something you diagnose from a hung request.
4. **Pid-reuse-safe pidfiles**: record pgid + `/proc/<pid>/stat` start-time at spawn; a match on
   pid alone is never trusted.

(Context note: the owner has mused about replacing the three servers outright with a node-driven
Python offline-inference module. Not a directive and not addressed here — but the pain behind the
musing is exactly this orphan/zoo class, and the reconcile/verified-stop/visible-family loop above
is its direct cure inside the current architecture.)

### A.5 The snap warm stage (`snap --isolated` / `--dirty`) — second addendum audit

The stage (`scripts/probes/_kit/snap-stage.ts`, wired by `scripts/probes/snap.ts`) boots a SECOND
full stack from a detached worktree (`.cache/snap-stage/<short-sha>/`, or `dirty/` rsync) on offset
ports **8888/5273**, via the WORKTREE's own stack.sh, setsid-detached + warm, with its own DB copy
and an `active.json` marker. Five questions settled by reads:

1. **Engine posture is currently LUCK — pin it.** `bootStage` (snap-stage.ts:290) spreads the
   operator's ambient env deliberately (the biome-ignore note even says "VLLM pins") and pins only
   ports/DB/assets. stack.sh's `: "${VLLM_DISABLED:=true}"` yields to a host export — so an ambient
   `VLLM_DISABLED=false` (plausible in an engines-running shell) boots the stage's server WITH the
   vLLM supervisor, `STACK_ENGINES` unset: healthy dev engines on 8701-8703 (the stage does NOT
   offset engine ports) get ADOPTED (benign today), but engines DOWN → the stage server
   **SPAWNS AND OWNS its own engine trio** — a surprise GPU claim from a visual-review surface,
   racing the real launcher. Post-sleep-mode it would also be a SECOND auto-sleep manager fighting
   the primary. Fix (one line, folded into the plan, SUPERSEDED-UPGRADED by the A.4 fleet model):
   pin **`ENGINES_POSTURE: "adopt-only"`** in the `bootStage` env map — the stage adopts the
   shared fleet when it's up (so live-model surfaces snap correctly, a free capability the old
   `VLLM_DISABLED=true` pin would have cost) and NEVER spawns or manages it.
2. **The :55 comment is a VOCAB collision, not a factual error.** "dodges the vLLM loopback
   engines (8701-8703, disabled in-stack)" — the engines still bind those ports; what was RETIRED
   today (owner ruling, workboard) is the **agent-sdk×vllm "loopback" SKIN** (`buildClaudeVllmEnv`
   → `/v1/messages` on the gen port) — a different thing wearing the same word. The offset's real
   job is dodging the live dev pair (8788/5173). Reword in the doc-fix step ("dodges the live dev
   pair; the vLLM engine ports 8701-8703 sit outside the band anyway") so "loopback" stops
   pointing at the deleted skin. Bonus fact the retirement fixes: the workboard KEY-FACT
   ("E2E drives the engine even with VLLM\_DISABLED=true via the loopback") is now HISTORY — with
   the skin gone, `VLLM_DISABLED=true` stacks genuinely never touch the engines, which firms up
   B.7-trap-2's "e2e is moot" claim.
3. **Pidfile scoping: per-TREE singleton — no cross-stack collision, one surprise.**
   stack.sh derives `RUN_DIR` from its OWN script path → each tree gets its own
   `.cache/stack/stack.pgid`: dev (main tree, :8788) and stage (worktree, :8888) can never clobber
   each other. Main-tree e2e `start-fg` vs the main-tree dev stack: same ports by design —
   playwright's `reuseExistingServer` rides the running stack, else `preflight` refuses honestly
   (pidfile-group alive or port busy). The surprise: `preflight` checks the pidfile group
   REGARDLESS of port env — stack.sh is a one-stack-per-TREE singleton, so an alt-port stack
   (:8790) cannot boot from a tree whose stack is up; alt stacks must run from another
   tree/worktree. Worth knowing, not worth changing. **Orphan-sweep safety (the A.4 design)**: the
   sweep's match is family-cmdline (`EngineCore`/`Worker_TP`/`vllm serve`) AND `/proc/<pid>/cwd`
   **EQUALITY** with the sweeping tree's root — a stage's server family (tsx/vite, cwd = the stage
   dir, which is UNDER but never EQUAL to the main root) misses BOTH keys; and a stage-side
   supervisor's own reaper uses the STAGE root as its marker, so it can never reap dev engines.
   Encode "equality, never prefix" as a reaper test case.
4. **Sleep-mode forward-interaction: the gates land everywhere automatically — verified.** Every
   stack instance (dev, stage, e2e, alt) compiles the same server package, so the `client.ts`
   pre-dispatch wake gate and the supervisor's `is_sleeping` adopt-arm ride into ALL of them by
   construction. Verified `client.ts` is the one dispatch seam: all vllm surfaces funnel through
   the injected `VllmEngineClient`; the single bypass is `gen-window.ts`'s metadata GET — served
   by the FastAPI frontend, scheduler-free, answers while asleep → needs no gate. With A.5-1's
   pin, a stage runs no supervisor at all — exactly one auto-sleep timer exists (the dev/prod
   server's), which is the design's single-manager assumption made true by construction.
5. **Teardown honesty: self-healing except ONE marker-loss window.** Reboot/crash: stale pidfiles
   self-heal (`group_alive` check), a same-sha unhealthy stage reboots in place (worktree +
   node\_modules + db reused, idempotent), sha-change tears down the predecessor, `worktree prune`
   runs on remove, a killed-mid-write marker reads as "no stage" → clean rebuild. The gap: a LOST
   marker with a still-running stage stack = an ownerless :8888/:5273 pair — the next boot gets
   stack.sh's honest port-conflict refusal (no clobber), but `--stage-down` can't find it (the
   marker is the only index) and dead stage WORKTREE DIRS can linger. Lean parity fix, folded into
   the front-door step: a `snap --stage-status` read (marker + port owners + worktree list under
   `.cache/snap-stage/`) and a marker-less `--stage-down` fallback (kill by stage-band port pids +
   sweep stage dirs) — the `engines:status`-style visibility, stage edition.

### A.6 The operational env-var inventory (the folklore killer — owner addendum)

Every var the stack/engines/e2e/snap/probe tooling reads, with what it ACTUALLY does (not what its
name implies), its reader, and its fate under the A.4 posture vocabulary. Scope: the OPERATIONAL
surface — pure app config (OIDC/auth headers, rate limits, egress/IP allowlists, import/debug
knobs) lives in the same `foundation/env` schema but is deliberately not this table.

| Var | ACTUAL semantics (watch the name-gaps) | Read by | Fate |
| - | - | - | - |
| `VLLM_DISABLED` | **Gates BACKEND REGISTRATION + supervisor startup ONLY.** Does NOT stop already-running engines, and did NOT stop the agent-sdk×vllm loopback skin driving the engine (the gap that cost a diagnosis cycle — skin now retired). Name lies: nothing about vLLM processes is "disabled". Default **false** (env floor) but stack.sh/e2e pin **true** — the A.3-4 posture asymmetry | `foundation/env` → compose + supervisor; pinned by stack.sh + playwright stackEnv | **DEPRECATED-BY `ENGINES_POSTURE`** (`true`→`off`, else→`adopt-or-start`); mapped with a visible log, then removed |
| `STACK_ENGINES` | `yes` = "a stack leader owns the engines — ADOPT, don't spawn" + 15-min boot grace (`stack-pending`). Set only by dev.sh | `foundation/env` → `supervisor.ts` | **DEPRECATED-BY `ENGINES_POSTURE=adopt-only`** (+ grace keyed on spawner-pidfile presence) |
| `ENGINES_POSTURE` *(incoming)* | `off` \| `adopt-only` \| `adopt-or-start` — the ONE topology knob (A.4 table) | `foundation/env` → compose + supervisor + client gate | **THE survivor** |
| `VLLM_EMBED/RERANK/GEN_MODEL` · `*_MAX_MODEL_LEN` · `*_GPU_UTIL(_MULTI/_SINGLE)` · `VLLM_POOLING/GEN_MAX_PIXELS` · `VLLM_GEN_REPETITION_PENALTY` | The engine LAUNCH floor (admin AppSettings override wins per-field); argv-affecting, restart-to-apply | `engineLaunchEnvFloor` → both spawn owners via `buildEngineArgv` | survive (launch config) |
| `VLLM_EMBED/RERANK/GEN_PORT` | Deployment facts — env-only, displayed never admin-edited (#14) | env floor → argv + `client.ts` PORTS | survive |
| `VLLM_BIN` · `VLLM_PY` · `VLLM_STORE_ROOT` · `HF_HOME` · `VLLM_CACHE_ROOT` | Deployment overrides: binary/interpreter/shared-store/cache relocation (worktrees share the store via git-common-dir when unset) | `engineDeploymentEnv` → `spawn-engine.ts`; engines.sh (venv bootstrap path) | survive |
| `VLLM_EMBED_DIM` · `VLLM_EMBED_CHUNK_SIZE` | Embedding runtime shape (MRL dim, chunking) — request-time, not launch | env → embed surface | survive |
| `CORPUS_AUTOINDEX` | `false` pauses background post-turn corpus embedding ("offload the GPU" — the soft-yield knob sleep mode largely obsoletes for idle GPUs) | env → indexer | survive; revisit post-sleep |
| `VLLM_SLEEP_MODE` *(incoming)* | Emits `--enable-sleep-mode` + child `VLLM_SERVER_DEV_MODE=1`; default on | env floor → argv/spawn-env builders | new survivor |
| `VLLM_AUTO_SLEEP_IDLE_MS` *(incoming)* | Manager-posture auto-sleep idle window; `0` disables; default 600 000 | env → supervisor | new survivor |
| `VLLM_SERVER_DEV_MODE` | **vLLM's env, not ours** — set on the engine CHILD process only (never app env); unlocks the loopback /sleep endpoints | engine child env (spawn-spec) | survive (child-scoped) |
| `PORT` / `VITE_PORT` / `VITE_API_TARGET` | Backend port (8788) / vite port + proxy target — the offset seam snap-stage rides (8888/5273) | server env · stack.sh · vite.config · snap-stage | survive |
| `DATABASE_URL` | libSQL file URL; default `file:./data/orbweaver.db`; stage points it INTO the stage dir | env → db; snap-stage · e2e | survive |
| `ASSETS_DIR` | Blob-store dir override; stage points at its symlink | env → infra/storage; snap-stage | survive |
| `ORB_ENV_NO_OVERRIDE` | `1` = the `.env` load runs with `override:false` so explicit process env beats a stray `.env` (stage + multi-user fixture + probe-fire guard) | `foundation/env` (the parseEnv loader) · snap-stage · multi-user-fixture.sh · probe-fire | survive |
| `AUTH_MODE` · `SESSION_SECRET` · `CREDENTIALS_KEY` · `LOCAL_INITIAL_PASSWORD` | The stack.sh/e2e determinism pins (dev-only literals, insecure by design; single-user ignores the secrets) | env schema; pinned by stack.sh + stackEnv | survive (auth scope, not engine scope) |
| `E2E_LIVE` | `1` un-excludes the `@live` real-model specs (`grepInvert` on the tag) — a PLAYWRIGHT-process var, never reaches the server | playwright.config · verify registry/membership | survive |
| `WIRE_CAPTURE` | `on` wires the provider wire-body ring sink (`/api/_debug/wire/captures`); off = ring never written. e2e pins `on` | env → observability wire-capture | survive |
| `RPG_TRACE` | In the schema but the flight-recorder seam is UNBUILT (contract-only) — setting it does nothing observable | env schema only | survive as inert seam; don't document as working |
| `RUNNER_OVERRIDE` | **DANGLER — NO READER EXISTS** (swept packages/ + tests/): only two comments (stack.sh, playwright.config) carefully "don't clobber" it. Folklore protecting a seam that never landed or was retired | nothing | **owner call in step 8**: delete the two comments, or land the reader it promises |
| `CI` | Playwright behavior flips (forbidOnly, retries, no server reuse) | playwright.config | survive |
| `NODE_ENV` / `LOG_LEVEL` | Prod mode (`pnpm start`) / pino level | env → foundation | survive |

**The minimum honest surviving set** after the plan lands: `ENGINES_POSTURE` (topology) + the
launch floor + deployment overrides + the two sleep knobs + data paths (`PORT`/`VITE_*`/
`DATABASE_URL`/`ASSETS_DIR`/`ORB_ENV_NO_OVERRIDE`) + probe gates (`E2E_LIVE`/`WIRE_CAPTURE`/`CI`).
Deleted outright: `VLLM_DISABLED`, `STACK_ENGINES` (after one mapped-deprecation release),
`RUNNER_OVERRIDE`'s ghost comments. Name-gap lesson encoded: topology vars describe POSTURE, not
process state.

---

## PART B — vLLM sleep mode: verified facts + design

### B.1 Facts verified against the 0.22.1 source in `.cache/vllm/venv` (+ live probes)

| Question | Answer (source-verified) |
| - | - |
| Endpoint gating | `entrypoints/serve/sleep/api_router.py` — `POST /sleep?level=&mode=` · `POST /wake_up?tags=` · `GET /is_sleeping`, attached **only when `VLLM_SERVER_DEV_MODE=1`** (`envs.py:1239`, truthy-int parse). Registration logs a SECURITY warning — loopback-only bind is mandatory and we already have it (`build-argv.ts` `LOOPBACK_HOST` hardcoded). |
| Sleep levels | `v1/engine/core.py sleep()`: level 0 = pause scheduling only (no GPU change) · level 1 = weights→CPU, KV discarded · level 2 = discard everything. |
| `mode` param (not in the owner's docs find) | `PauseMode = "abort" \| "wait" \| "keep"` — what happens to in-flight requests at sleep time (default **abort**). |
| Requests while asleep | **Accepted and queued, never errored** — "Requests are still accepted but not processed" (scheduler paused). A chat request against a sleeping engine HANGS until wake or client abort. There is no error shape to react to → auto-wake must be a gate *before* dispatch. |
| `/health` while asleep | **200.** `instrumentator/health.py` → `check_health()` raises only `EngineDeadError`; sleeping ≠ errored. Today's supervisor would classify a sleeping engine `healthy`→`adopted` (won't respawn it — safe — but the status would LIE and requests would hang). |
| `is_sleeping` semantics | `scheduler paused OR executor sleeping` (`core.py:758`). Fresh under partial (tag-scoped) wake — stays true until fully woken; v1 avoids tag-partial wakes entirely, so no freshness trap. |
| Cost when NOT sleeping | `enable_sleep_mode` force-enables the **cumem allocator** (`config/model.py:537`) — CUDA-VMM-backed alloc for weights/KV. **No pinned-CPU allocation at startup**: the pinned backup tensor is `torch.empty(..., pin_memory=…)`'d **inside `sleep()`** (`device_allocator/cumem.py:208`) and freed on the pointer's release. Steady-state inference cost ≈ nil (allocation-path overhead only); worth one post-GO A/B sanity throughput glance, not a blocker. |
| Wake | `wake_up(tags)` remaps + copies pinned backup back; `"scheduling"` is a special tag (resume-only). Full wake = copy \~weights-size host→device over PCIe (pinned) + scheduler resume → seconds, no model reload, no process churn. |
| Live engines now | :8701/:8702/:8703 → `/health` 200, `/is_sleeping` **404** on all three (flag absent from their argv, endpoints unregistered) — confirmed harmlessly, nothing slept. |

### B.2 RAM feasibility (this box, measured)

- Level-1 backup ≈ GPU **weight** bytes (KV is discarded, not backed up):
  gen Qwen3-VL-8B bf16 ≈ **17 GiB** (TP=2 → two per-rank pinned buffers, same total) ·
  embed 2B ≈ **4 GiB** · rerank 2B ≈ **4 GiB** → **\~25 GiB pinned host RAM** while all three sleep.
- Box: **125 Gi total, 72 Gi available** right now (with everything running). \~25 GiB pinned
  (non-swappable — note swap is 1.9 Gi and already full, irrelevant to pinned) leaves \~47 Gi
  headroom. **Comfortable, >2× margin. GO.**
- VRAM recovered: engines currently hold \~34.8 + 35.1 GiB of 2×48 GiB. Level-1 sleep frees the
  weights+KV allocations on both cards — ComfyUI-class tenants get effectively whole GPUs without
  touching the 0.55 gen-util provisioning (`foundation/env/index.ts:37-42`'s "drop back toward
  0.28 if a ComfyUI-class tenant returns" note is SUPERSEDED by sleep — annotate it post-GO).

### B.3 Per-engine decision: sleep ALL THREE

Gen is the prize (\~0.55×2 cards). But the 2B poolers still pin \~7 GiB (embed, GPU0) + \~8 GiB
(rerank, GPU1) of util-fraction; their wake is <1 s (4 GiB pinned copy) and their traffic is
machine-generated (indexer/search) so auto-wake needs no human patience. One policy for the trio is
also the simpler supervisor state machine. Thrash guard: the idle timer only arms when ALL requests
are quiet per engine (B.5); an indexing burst keeps embed awake on its own merits.

### B.4 Argv/env changes (prepared — snapshot-test-verified, never launch-verified)

- `build-argv.ts`: append `--enable-sleep-mode` in all three arms (emit gated on a new
  `sleepMode: boolean` field of `EngineLaunchConfig`, resolved `override ?? env floor`, default
  **true**; env knob `VLLM_SLEEP_MODE` in `foundation/env` + `engineLaunchEnvFloor`).
- `spawn-engine.ts`: merge `VLLM_SERVER_DEV_MODE: "1"` into the spawn env when sleepMode — beside
  the cache env, so BOTH owners inherit it (loopback bind already enforced by argv).
- Tests: `tests/server/infra/providers/vllm/engine/build-argv.test.ts` + `spawn-engine.test.ts`
  snapshots; env-floor wiring test. **No live launch to verify the diff** (standing law
  \[\[never-run-engine-launcher-live]]); live sleep/wake characterization happens post-GO on a
  RELAUNCHED set (B.8).

### B.5 Auto-sleep (owner extension — the centerpiece)

**Idle seam: engine-side `/metrics`, not app-side timestamps.** Verified live on :8703 — vLLM
exposes `vllm:num_requests_running`, `vllm:num_requests_waiting`, `vllm:request_success_total`
(per-finish-reason counters). Idle(engine) := running == 0 AND waiting == 0 AND Σ success\_total
unchanged since the last tick. This is client-agnostic (catches probes, E2E stacks, hand curls —
anything that can reach the loopback port), needs zero app coupling, and survives server restarts
(the counters live in the engine). App-side last-dispatch timestamps see only OUR dispatches and
reset on every tsx-watch reload — strictly worse. Cost: one loopback GET per engine per tick.

**Timer home: the IN-SERVER adoptive supervisor (`supervisor.ts`), scoped by POSTURE (A.4): only
`adopt-or-start` (manager) stacks run the auto-sleep timer; `adopt-only` stacks are passive
consumers (on-demand wake only).** Arguing the placement: (a) the supervisor already owns the 21s
reconcile tick and the status registry — idle detection is one more probe on an existing loop;
(b) auto-WAKE must live in the server regardless (it's the only process that sees requests), and
split sleep/wake owners re-introduce exactly the two-owner drift the shared-builder refactor
killed; (c) sleep is a loopback POST, so the manager can sleep engines it merely ADOPTED;
(d) engines.ts stays a dumb leader body with no poll loop — its virtue. The posture scoping is
what keeps the fleet model honest: N adopter stacks never mean N sleep managers (a snap stage or
e2e run can't sleep the fleet under the dev server), and the residual manager-vs-manager race (two
`adopt-or-start` orbs on one box) is tolerated by an is\_sleeping-guarded, catch-and-ignore sleep
call — duplicate sleeps are idempotent in effect. The engines-up-with-NO-manager case (fleet
started by the verb, no server running) has no requests and no timer — that is the *manual*
verbs' case (`pnpm engines:sleep`), and a v2 `--auto-sleep` on the detached owner stays open if it
ever matters.

**The knob.** `VLLM_AUTO_SLEEP_IDLE_MS`, env floor + AppSettings override arm (the launch-slice
`override ?? floor` precedent), `0` = disabled. **Default 10 min**: wake is seconds (cheap to be
wrong toward shorter), but in-chat thinking pauses routinely hit 5 min — 10 min keeps a live
session warm while reclaiming the GPU within one coffee break of walking away. 15 min buys little.
Knob-wire discipline: new env member + floor projection + supervisor opts + knob-gate registration
\= one coupled set, landed together.

**Sleep call:** `POST /sleep?level=1` (mode default `abort` is fine — the idle gate guarantees no
in-flight requests; level 2 stays a manual/model-swap tool, not auto policy).

### B.6 Auto-wake on demand

**Gate home: `client.ts`** — already "the family's ONE loopback HTTP seam"; every role's dispatch
funnels through `enginePost`/`engineStream`. Before dispatch, when the status registry says
sleeping (cheap process-local read — no per-request HTTP): single-flight per-engine wake promise →
`POST /wake_up` (no tags = full) → poll `GET /is_sleeping` until `false` (bounded **30 s**; wake
measures in seconds, 30 s = generous ceiling) → dispatch. On bound-exceeded: honest retryable
`ProviderError` ("engine waking timed out"), never a hang. Because a request sent to a sleeping
engine silently QUEUES (B.1), the gate must be belt-and-suspenders: the pre-dispatch status check
is the belt; the tiny check→dispatch race loses nothing (the supervisor never auto-sleeps with
running/waiting > 0, and a race-lost request just rides the queue out on the next wake).

**VRAM pre-check before ANY wake (owner ruling 2026-07-27 — supersedes any "who wins" contention
framing; the physics make it moot).** A wake into insufficient free VRAM cannot evict a co-tenant —
it OOMs mid-`create_and_map` and leaves a half-woken engine. `wake_up` remaps the engine's FULL
original allocation set (weights handles get their pinned backup copied back; KV handles are
remapped as empty memory — `cumem.py wake_up()` walks ALL of `pointer_to_data`), so the need is the
engine's original footprint, derivable from our own config with zero new knowledge:
**need(engine, gpu) ≈ its `gpu-memory-utilization` fraction × card total** (embed 0.14 × GPU0 ·
rerank 0.16 × GPU1 (multi) · gen 0.55 × BOTH cards) + a fixed \~1 GiB safety pad. The gate runs
before EVERY wake attempt — auto-wake-on-request AND manual `engines:wake`: query per-GPU free
memory + the compute-app process list (`nvidia-smi --query-gpu=index,memory.free` +
`--query-compute-apps=pid,process_name,used_memory` — plain NVML facts), compare per touched GPU;
on insufficient → **REFUSE LOUDLY, the engine STAYS ASLEEP**, and the message NAMES the holders:

```
wake refused: gen needs ~26.9GiB on GPU0, 9.2GiB free — held by python3 (pid 3356292, 38.0GiB)
```

**Generic by design — ZERO tenant-specific logic.** This is the \[\[plan-for-small-hardware]]
visible-refusal doctrine applied to GPU contention, not a this-box special: any deployment sharing
GPUs gets the same honest behavior, and process-naming makes ANY tenant self-identifying (a
ComfyUI, someone else's training job). No ComfyUI sniffing, no tenant allowlists — the generic
process list IS the diagnosis. The "forgot ComfyUI on" case resolves itself: the refusal names it,
to the script and every caller above it. One honesty precondition: the orphan reconcile (A.4
hygiene block) runs FIRST wherever both apply — a dead engine's own EngineCore still holding VRAM
must be reaped as ours, never named as a "foreign tenant" in a refusal.

**Both surfaces, caller-visible:** (a) CLI — `engines:wake` prints the refusal + holders, exits
non-zero, RESULT line carries the verdict; (b) the on-demand path throws a typed `ProviderError`
carrying the refusal reason verbatim — the chat turn fails with "engine cannot wake: GPU0 held by
python3 (pid …, 38GiB)", a GREAT error, instead of a CUDA OOM stack. `retryable: false` (backoff
cannot free someone else's VRAM; the user retries after freeing). The structured log rides the
same message. `engines:status` grows the natural companion: per-engine sleep state + current
per-GPU compute tenants.

**The same check guards COLD STARTS.** `pnpm engines` under a resident GPU tenant fails the same
ugly way today (vLLM's memory profiler OOMs mid-boot — the 0.28-era coexistence pain). The
identical headroom gate runs in BOTH spawn paths: the standalone launcher (engines.ts, before each
sequential boot) and the in-server supervisor's spawn gate (before `spawnOwned` — mark `down` with
the refusal detail, NO breaker charge: a held GPU is not a crash loop). One pure decision module
(`wake-budget` beside `gpu.ts`: fractions × totals vs free list → verdict + holder-naming message)
serves all four call sites; only the nvidia-smi query is I/O, injected for tests.

**Lean by owner ruling:** the pre-check + refusal + naming is the WHOLE feature. No reservation
system, no queue-until-free (doorway note at most), no eviction of anything.

**Warm-up visibility (v1 = honest logs + status, no gold-plating):** structured
`vllm-engines: waking` at wake-start and `woke` with `durMs` on ready (the existing `mark()`
transition logging pattern); the status registry carries `sleeping` → `starting`-like detail so
`engines:status` and the admin Engines panel tell the truth mid-wake. The turn surface showing a
"waking the local engine…" phase is a real seam (bus-driven turn surface + freshness-indicator
precedent) but is deferred — the wake is seconds and the log + honest latency cover v1.

### B.7 The trap ledger (all answered from source/code)

1. **Supervisor misreading sleep**: `/health` is 200 asleep → today's classifier says
   healthy/adopted (no respawn — benign) but lies. Fix: probe gains an `is_sleeping` arm (only when
   sleepMode on); new lifecycle statuses **`sleeping`** (auto) and **`sleeping-held`** (manual hold)
   in `ENGINE_LIFECYCLE_STATUSES`. Status-vocab widening = tuple + every exhaustive consumer +
   `engine-status.test.ts`/`supervisor.test.ts` (the snake-case-vocab coupled-sites lesson —
   enumerate consumers in the landing commit).
2. **Alt/E2E stack adopting sleeping engines**: the e2e stack runs `VLLM_DISABLED=true` — never
   talks to engines; moot. A second dev server adopting them wakes them via its own first-request
   gate — same path, no special case.
3. **rpg flush barrier (15 s)**: worst case now contains a wake (\~1–3 s) + the state round
   (measured \~4.5 s turn) ≈ 6–8 s — fits with margin, but the barrier absorbs the wake, so a
   cold-engine rpg turn eats most of its slack. Noted; no change needed.
4. **Manual-vs-auto contention — SUPERSEDED by the VRAM pre-check (owner ruling, B.6)**: once a
   tenant OCCUPIES the VRAM, every wake refuses on physics alone — no policy needed, no "who wins."
   The hold marker survives with ONE narrow job: **intent ahead of occupancy** — engines slept for
   a tenant that hasn't grabbed its VRAM yet; without the marker a stray chat request would wake
   the engines and take the memory back first. So: *auto-slept* → auto-wake (headroom-gated);
   *held* (`pnpm engines:sleep` = manual → POSTs /sleep + writes `.cache/stack/engines.hold`) →
   the wake gate refuses on the MARKER even with VRAM free ("engines held — `pnpm engines:wake`
   releases"); `engines:wake` clears it (then runs the same headroom gate as everyone). The
   supervisor tick reads the marker → `sleeping-held`. Marker-file over server-API so the verb
   works with the server down (the actual tenant workflow), and both owners see one truth.
5. **KV/prefix-cache loss per wake**: level 1 discards KV by design — every first turn after wake
   is cache-cold (prefix-cache warm expectations reset; sdk-injection-cache probe numbers don't
   apply across a sleep). Honest note, no fix.
6. **`is_sleeping` freshness under partial wake**: true until fully woken; v1 never issues
   tag-partial wakes → no trap.

### B.8 Prepared implementation plan (awaiting GO — nothing landed)

| # | Change | Files | Proof |
| - | - | - | - |
| 1 | `--enable-sleep-mode` + `VLLM_SERVER_DEV_MODE=1` behind `VLLM_SLEEP_MODE` (default on) | `build-argv.ts` · `spawn-engine.ts` · `foundation/env/index.ts` (+floor) | argv/env snapshot tests ONLY |
| 2 | The wake-budget module: pure `need(engine)×gpu` vs free-list verdict + holder-naming message (nvidia-smi query injected) | new `wake-budget.ts` beside `gpu.ts` | pure-fn unit tests: fits/refuses/message format |
| 3 | **The fleet front door (A.4)**: `engines:start` = THE spawner (reconcile → VRAM pre-check → setsid-detached + pidfile); `engines:stop/status/sleep/wake`; `pnpm engines` = adopt-or-start + log-follow (Ctrl-C detaches). `start`/`stop` pgid choreography in bash; `status/sleep/wake`/reconcile in `scripts/dev/engines-ctl.ts` importing the server module (budget math ONE-homed) + hold marker. **Supervision hygiene**: reconcile-before-spawn (stale pidfile + precise orphan-family sweep via the extracted+widened `reapOrphanedEngineCores` marker — never substring-grep; cwd EQUALITY never prefix), verified family-kill stop with report, family-tree status, pid-reuse-safe pidfiles (pgid + start-time) | `scripts/dev/engines.sh` · new `scripts/dev/engines-ctl.ts` · extract shared reaper from `supervisor.ts` · root `package.json` | `engines:status` RESULT-line self-check; reaper identification unit tests (family-match + false-positive class + stage-tree exclusion); no live launch in the diff |
| 4 | **Posture vocabulary + ownership inversion**: `ENGINES_POSTURE ∈ off\|adopt-only\|adopt-or-start` knob + back-compat mapping with visible deprecation logs (`VLLM_DISABLED=true`→off · unset/false→adopt-or-start · `STACK_ENGINES=yes`→adopt-only+grace); supervisor refactor — DELETE `spawnOwned`'s in-process child + pipe watchdog, `spawn` action invokes the detached verb (breaker retained); dev.sh switches to `engines:start`; snap stage pins `adopt-only` (A.5-1); e2e stackEnv flips `VLLM_DISABLED=true` → `ENGINES_POSTURE=adopt-only` | `foundation/env/index.ts` · `supervisor.ts` · `scripts/dev/dev.sh` · `scripts/probes/_kit/snap-stage.ts` · `playwright.config.ts` + `stack.sh` pins | posture-mapping unit tests · `decideTick` posture cases · adopt-only fail-fast case ("engines down — pnpm engines:start") |
| 5 | Status vocab: `sleeping` / `sleeping-held` + the ONE adoption probe everywhere (/health + `is_sleeping` arm) + hold-marker read; cold-start headroom gate in the spawner path (refusal detail, no breaker charge) | `engine-status.ts` · `supervisor.ts` · `scripts/dev/engines.ts` (+ exhaustive consumers) | `decideTick` unit cases · status tests · spawn-gate refusal case |
| 6 | Auto-sleep (MANAGER posture only): metrics idle probe + `VLLM_AUTO_SLEEP_IDLE_MS` knob (default 600 000) + `/sleep?level=1` on idle, is\_sleeping-guarded | `supervisor.ts` · env + knob-gate wiring arm | injected-clock unit tests (idle arm/disarm/thrash guard · adopt-only never sleeps) |
| 7 | Auto-wake gate (EVERY adopter, via the shared seam): headroom pre-check (refusal → holder-naming non-retryable ProviderError) + single-flight wake + bounded readiness + honest errors + waking/woke logs | `client.ts` (or a thin gate module beside it) + `wake-budget.ts` | unit tests: gate paths (sleeping→wake→send · held→refuse · no-headroom→named refusal · timeout→ProviderError) |
| 8 | Docs + small parity: workboard STANDING-FACTS DB-claim fix (A.3-1) + supersede the 0.28-fallback env comment (B.2) + snap-stage :55 "loopback" reword (A.5-2) + `snap --stage-status` / marker-less `--stage-down` fallback (A.5-5) + delete the reader-less `RUNNER_OVERRIDE` comments or land its reader (A.6, owner call) | `docs/retro-workboard.md` · `foundation/env/index.ts` · `scripts/probes/_kit/snap-stage.ts` · `scripts/probes/snap.ts` · `playwright.config.ts` · `stack.sh` | check:docs · snap-stage unit tests |
| 9 | POST-GO live characterization, relaunched fleet: sleep → `nvidia-smi` delta → wake `durMs` → request round-trip; queued-request-during-sleep confirm; wake-refusal drill (synthetic VRAM holder or ComfyUI itself) proving the named refusal on both surfaces; adopt-only stack against the fleet (snap + e2e); supervisor-tick observation | (no diff — observability harness run) | logged in the landing report |

Sequencing: 1+5 together (flag without honest status = lying supervisor), 2 rides anywhere (pure
module), then 3 (the spawner must exist before inversion), then 4 (inversion + postures), then
6+7, then 8; 9 closes. Each step keeps `pnpm check` + scoped tests green independently.
