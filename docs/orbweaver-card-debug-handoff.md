# Orbweaver — immersive-card debugging handoff

Context: diagnosing why hosted models (Sonnet 5 via OpenRouter) weren't producing rendered
`:::card` immersive HTML cards in rpg-lite, while local vLLM appeared to. Session of 2026-08-03/04.
Everything below is verified against the LIVE prod stack unless explicitly marked as inference.

---

## 0. Read this first (repo law)

`CLAUDE.md` points at `docs/architecture/core/AGENTS.md` — the constitution. **Read it in full before
changing anything.** Also `docs/Mission.md` and `docs/architecture/core/Documentation-Law.md`.
Per-domain law is the CODE + its file headers. The D-ledger
(`docs/architecture/core/Core-Laws-and-Precedents.md`) wins on any conflict.

Note: global KISS/YAGNI is **suspended** in this repo — build maximal, not minimal.

---

## 1. The stack (prod)

| fact | value |
| - | - |
| start command | `pnpm stack up prod` |
| under it | `NODE_ENV=production node packages/server/src/entry/index.ts` (= `pnpm start`, foreground) |
| port | `8788`, public at `https://orbweaver.inktomi.tech` |
| supervisor | `scripts/dev/stack-prod.ts` owns the lifecycle (spawn / identity-verified adopt / bounded-drain stop). There is still no *restart-on-crash* supervisor: if the process dies, nothing brings it back. |
| pidfile | `.cache/stack/prod.json` — pid + pgid + port + /proc start-ticks + debug flag |
| logs | `.cache/stack/prod.log` |
| env | `.env` in repo root, read at boot via `node:util`'s `parseEnv` (dotenv was removed) |
| server build step | **none** — node 26 runs `.ts` directly (tsx was shed) |
| client | prebuilt at `packages/client/dist` (`vite build`). Server-only changes need **no rebuild**, just a restart. |
| auth | `AUTH_MODE=oidc` |

### The commands

```bash
pnpm stack up prod                 # boot production, detached, verified by INSTANCE IDENTITY
pnpm stack up prod --build         # …after rebuilding the client bundle (build runs FIRST, before any stop)
pnpm stack up prod --debug         # …with the /api/_debug surface + wire capture armed (see §2)
pnpm stack restart prod            # SIGTERM → watch the bounded drain → boot → verify the NEW instance
pnpm stack down prod               # SIGTERM → watch the drain → confirm gone
pnpm stack status prod             # mode, pid, uptime, port, debug posture, client-bundle freshness
pnpm stack logs prod 100
```

Mode is positional and defaults to `dev`, so `pnpm stack up` is still the dev stack (watched server +
vite) and behaves exactly as it always did. `up`/`down` are aliases for `start`/`stop`.

**Run from anywhere.** The supervisor derives the repo root from its own file location, so the two cwd
traps that used to bite (`.env` and `CLIENT_DIST_DIR` are both cwd-relative) are closed by construction.

**What each verb guarantees:**

- **`up` is idempotent.** On an already-running instance it *adopts in place* and reports — it never
  spawns a second server. On a port held by anything it cannot prove is its own, it **refuses** and names
  the likely owner (`:8788` is also the dev-stack port; see §1c).
- **Identity, not health.** A health check validates the *port*, and a stale incumbent answers it. Every
  adopt/stop decision matches the pidfile's pid **and /proc start-ticks** against the process actually
  serving the port (or against `/api/_debug/info`'s self-reported `pid` when that surface answers).
- **A harness stack is untouchable.** `/healthz` reports `harness:true` for a Playwright-owned stack
  (`E2E_HARNESS=on`). `up` never adopts one and `down` never kills one out from under a running battery.
- **The bundle is checked before anything is stopped.** Production boot *throws* without
  `packages/client/dist/index.html` (`resolveSpaDistDir`, `entry/http/spa.ts:32`), so a missing bundle is
  a refusal naming the build command, never a dead boot in a log file. A bundle *older* than
  `packages/client/src` or `packages/ui/src` is a **WARN** only — server-only restarts legitimately keep
  an older bundle, because node runs the server's `.ts` directly.
- **The drain is watched, not eyeballed.** `down`/`restart` SIGTERM, then read `prod.log` for the
  lifecycle's own `shutdown: complete` / `shutdown: drain deadline hit`, bounded by `SHUTDOWN_DRAIN_MS`
  (10s) + 5s margin, then escalate to a group SIGKILL. `drain deadline hit` is expected during a deploy —
  it means a long-lived SSE stream was force-closed and that client saw a truncated stream.

**Still true, and worth keeping in your head:**

- There is **no root `build` script**. The only build in this repo is `@orb/client`'s `vite build`; the
  server has no build step at all.
- `pnpm start` runs the same server in the FOREGROUND — fine for a quick check, wrong for leaving it up.
- Restarting prod drops live SSE connections and disconnects any player.

---

## 1b'. Vite, `--build`, and two words called "mode"

**There are two unrelated "mode" vocabularies. They do not interact, and that is deliberate.**

| | `pnpm stack …` mode | vite mode |
| - | - | - |
| values | `dev` \| `prod` | `development` (serve) \| `production` (build) |
| what it selects | which SUPERVISOR runs (watched server + vite, or detached prod server) | which `.env.[mode]` files vite loads and what `import.meta.env.MODE` says |
| set by | the positional arg | `vite`/`vite build` defaults; `--mode` overrides |

We do **not** adopt vite's `.env.[mode]` convention, and the reason is that we do not use the mechanism it
feeds. Vite's env files live in `envDir` (default = the vite **root**, i.e. `packages/client/`) and only
surface variables through `import.meta.env` behind the `VITE_` prefix. A sweep of `packages/client/src` +
`packages/ui/src` finds **zero** `import.meta.env.VITE_*` reads — the only uses are `import.meta.env.DEV`,
which is a built-in constant driven by `NODE_ENV`, not by an env file. So there is nothing for a
`.env.production` to configure, and adding one would create a second config surface competing with the
repo-root `.env` that `foundation/env` owns. Runtime config is the server's job (`foundation/env`); the
bundle is configuration-free by design.

Related, and easy to get wrong: `VITE_PORT` / `VITE_API_TARGET` in `packages/client/vite.config.ts` are
read from `process.env` **at config-evaluation time**, which is exactly what vite documents as the only
env available there — `.env*` files are loaded *after* the config resolves. That is why the snap stage and
the e2e projects can set them as real process env and have them take effect.

**What `--build` runs:** `pnpm --filter @orb/client build` — the package's own `vite build` script, never a
hand-rolled vite invocation. There is no other build in this repo.

**Staleness is measured by mtime, not by a manifest.** `build.manifest` is deliberately `false` (see the
comment in `vite.config.ts`: Hono serves `index.html` as-is, so there is nothing to read a manifest for;
the documented revisit trigger is Hono injecting hashed asset tags server-side, which it does not do). The
freshness check therefore compares `dist/index.html`'s mtime against the newest of
`packages/client/src`, `packages/ui/src`, `packages/client/public` (copied verbatim into `dist`),
`packages/client/index.html` (vite's build **entry**, part of the module graph) and
`packages/client/vite.config.ts` (a config change requires a rebuild).

**A rebuild soft-reloads every open tab, by design.** `emptyOutDir: true` deletes the previous build's
hashed chunks, so a tab that was loaded before the deploy fails its next lazy chunk import. `main.tsx`
listens for vite's `vite:preloadError` and reloads once (guarded by a `sessionStorage` flag against a
reload loop). Expected during a `restart prod --build`; it is not a bug report.

**`vite preview` exists (`pnpm --filter @orb/client preview`) but is NOT part of prod mode.** It serves
`dist` on :4173 as a plain static server with no `/api` — useful only to answer "did the bundle build",
never to check the app. Our production server serves the same `dist` *with* the API, which is the real
check.

---

## 1c. Who else spawns a stack on this box

Reference for reading `ss` output and for understanding why `stack up prod` refuses what it refuses. The
machine-readable copy is `STACK_SPAWNERS` in `scripts/dev/_kit/stack-mode.ts` (status uses it to *name* a
foreign port holder instead of printing a bare pid).

| spawner | server | vite | how to tell it apart |
| - | - | - | - |
| dev stack (`pnpm stack up`) | 8788 | 5173 | `DEV_SEED=on`; pidfile `.cache/stack/stack.pgid` |
| **prod stack** (`pnpm stack up prod`) | **8788** | — | `NODE_ENV=production`; pidfile `.cache/stack/prod.json`; no vite at all |
| vLLM engine fleet | — | — | ports 8701/8702/8703; pidfile `.cache/stack/engines.pgid` |
| multi-user fixture | 8790 | 5175 | `AUTH_MODE=local`; own `STACK_RUN_DIR` |
| e2e single-user | 8796 | 5181 | `/healthz` → `harness:true`; booted `start-fg`, no pidfile |
| e2e fixture provider | 8797 | — | a scripted BYO provider, not an orbweaver server |
| e2e forward-header | 8798 | 5182 | `/healthz` → `harness:true` |
| e2e local | 8799 | 5183 | `/healthz` → `harness:true` |
| `snap --isolated` / `--dirty` stage | 8888 | 5273 | runs from `.cache/snap-stage/<sha>`; its own pidfile under that tree |
| playwright-ct | — | 3100 | vite only — a CT run contains no orbweaver server |

**Prod and dev deliberately share :8788** — two ways to serve one app on one box, and they must never run
at once. That collision is a loud refusal, not a race. Everything else is on a distinct port, and the
three e2e stacks additionally self-stamp as harnesses.

---

## 1b. Instruments added 2026-08-04 — read this before debugging anything

Four new instruments exist because the old ones could not answer the questions a live session actually asks.
All are gated the same way (`WIRE_CAPTURE=on` / `DEBUG_TOKEN`), all are prod-safe off.

| instrument | answers | where |
| - | - | - |
| `GET /api/_debug/wire/outcomes` | **what came back** — finish/stop reason, tokens, content+reasoning LENGTHS, tool-call names + raw args | new route |
| `.cache/wire-capture/captures.jsonl` | survives a restart (the ring is 256 slots, in-memory, and wiped exactly when you need it) | 32 MiB + 1 rotation |
| `chat.generation.empty` (warn) | a REFUSED turn, with the fields that tell a tool-only completion from a dead provider | `prod.log` |
| `droppedIssues` / `salvagedFields` on `rpg.extraction.*` | WHICH FIELD failed and **the value the model sent** — not just the tool name | `prod.log` |

**The request ring alone will mislead you.** It records requests only; inferring a cause from request shape
produced a confidently wrong root cause during the session that built these. Read the outcome, not the shape.

Two behavioural changes worth knowing while operating:

- **Shutdown is now bounded at 10s** (`SHUTDOWN_DRAIN_MS`). An open SSE stream used to hold a restart for
  \~6 minutes; the drain now force-closes at the deadline and logs `shutdown: drain deadline hit` — a **warn**,
  because that is the case where a client saw a truncated stream. Seeing it during a deploy is expected.
- **Tests no longer read the repo `.env`** (`ORB_ENV_NO_FILE=1`, set globally in `vitest.config.ts`). Your
  live `AUTH_MODE=oidc` / `WIRE_CAPTURE=on` can stay as they are without turning correct tests red. Applies
  to tests ONLY — production env loading is byte-unchanged.

### The one-command triage for "the model did something weird"

```bash
TOK=$(cat .cache/stack/debug-token)   # minted by `pnpm stack … --debug`; see §2
curl -s -H "x-debug-token: $TOK" "http://127.0.0.1:8788/api/_debug/wire/outcomes?limit=5" -o /tmp/out.json
curl -s -H "x-debug-token: $TOK" "http://127.0.0.1:8788/api/_debug/wire/captures?limit=5" -o /tmp/req.json
# To see domain-level settings (presets, trustHtml) BEFORE they compile into the wire payload:
# curl -s -H "x-debug-token: $TOK" "http://127.0.0.1:8788/api/_debug/config/chat/<ID>" -o /tmp/chat-config.json
grep -aE "chat.generation.empty|rpg.extraction" .cache/stack/prod.log | tail -20
```

Outcome first (what came back), request second (what we sent), log third (what we dropped and why).

---

## 2. Debug surface — how to watch the wire

`/api/_debug/*` is gated by `DEBUG_TOKEN` (sent as `x-debug-token`) or an admin cookie.

### Arming it: `--debug`, not an `.env` edit

```bash
pnpm stack restart prod --debug     # or: pnpm stack restart --debug   (dev mode)
pnpm stack status prod              # reports the posture; never prints the token
```

`--debug` is **orthogonal to mode** and arms every debug knob the env schema declares — `DEBUG_TOKEN`,
`WIRE_CAPTURE=on`, `RPG_TRACE=on` — as a **process env overlay applied at spawn**. It does not write to
`.env`, so there is nothing to remember to strip afterwards: relaunch without the flag and the surface is
off. The overlay lives on the spawned server's env object only — your shell is not modified, so an e2e
run or a `snap` you start later in the same terminal does not inherit a debug posture.

**The token** is minted once (24 random bytes) and stored at `.cache/stack/debug-token`, mode `0600`. It
is reused across launches, so a saved `curl` keeps working. Its **value is never printed** by any stack
command — read it with `cat` when you need it.

```bash
TOK=$(cat .cache/stack/debug-token)
```

**Precedence, and why `--debug` can refuse.** `foundation/env` loads `.env` with `override:true` — a key
in the file **beats** the spawn env. So:

- `.env` is silent about a knob → the overlay arms it.
- `.env` already sets the same value (e.g. `WIRE_CAPTURE=on`) → adopted, and the command says the file is
  what armed it. A `DEBUG_TOKEN` in `.env` is used as *the* token.
- `.env` sets a **conflicting** value (e.g. `WIRE_CAPTURE=off`) → **`--debug` refuses**, naming the line
  to delete. Arming it would be a silent no-op, and a debug flag that silently does nothing is worse than
  no flag.

**Migration note (2026-08-06):** the live `.env` still carries the hand-added
`DEBUG_TOKEN` / `WIRE_CAPTURE=on` / `RPG_TRACE=on` block from the card-bug session, plus a
`.env.bak-predebug-*` backup. Delete those three lines (and the backup) once — after that `--debug`
controls the surface per-launch and the file stays clean. Until then the file is what arms the surface,
and `--debug` will tell you so.

**`RPG_TRACE` is NOT a dead knob** (the old note here cited finding #7). It is wired end to end:
`env.RPG_TRACE === "on"` → `entry/compose/services.ts:622` builds the recorder → `lifecycle.ts:403` →
`app.ts:279` registers `/api/_debug/rpg/traces`. If that route 404s on an armed stack, that is a *new*
bug, not the documented one.

### Endpoints (all need the header)

| route | what it gives |
| - | - |
| `/api/_debug/info` | pid, uptime, nodeEnv, providers |
| `/api/_debug/wire/captures?limit=N` | **outbound provider request bodies** — literal network wire payload |
| `/api/_debug/wire/outcomes?limit=N` | **what came back** — token counts, tool calls, finish reasons |
| `/api/_debug/config/app` | loaded models, supported params, prices (resolved + raw settings rows) |
| `/api/_debug/config/presets` | `PresetRow`s including full config blob (markers, guidedActions, limits) |
| `/api/_debug/config/chat/:id` | **room config + rpgGame** — full settings payload for the chat |
| `/api/_debug/config/characters` | character sweep — **EXPOSES `renderPolicy`** (tierA/tierB verdicts) |
| `/api/_debug/config/character/:id` | full character row with render policy and prompts |
| `/api/_debug/db/chat/:id` | chat row, participants, messages (**selected variant only**), recentEvents |
| `/api/_debug/logs`, `/errors`, `/requests`, `/traces` | observability rings |
| `/api/_debug/db/stats`, `/db/integrity`, `/db/assets` | db probes |
| `/api/_debug/rpg/traces` | **404 always** — see finding #7 |

### Do not look for presets/settings in the wire capture
The ring at `wire/captures` logs the **literal wire payload** (e.g. Anthropic/OpenRouter API shape). By the time the request hits the wire, Orbweaver has already compiled settings, presets, and character overrides into raw `messages`, system prompts, and sampling parameters.
**If you need to see a preset, guided action, or trust tier, query the `/api/_debug/config/*` endpoints.** The wire capture will only show you the result.

### Reading a capture

Write to a file first, then parse. Do **not** pipe a network fetch into a shell/interpreter.

```bash
curl -s -H "x-debug-token: $TOK" \
  "http://127.0.0.1:8788/api/_debug/wire/captures?limit=20" -o /tmp/wire.json
```

Each capture is `{chatId, api, backend, model, body, at}`. `body` is the literal provider payload:
`messages[]`, `tools[]`, `tool_choice`, `model`, `reasoning`, `provider`, `plugins`.

Useful probes on `body`:

- `body.tools.length` + `body.tool_choice` — is this a folded (tool-bearing) turn?
- last message content — the rpg injection is **spliced into the final user message**, not a separate row
- search for `EAST CROSSING` → is the card-teach worked example intact?
- search for `[card: Crossing sign]` → the example got **stubbed** (see finding #1)
- search for `STATE BOOKKEEPING` → the reconcile note fired this turn

### Tokenizing content offline (proving render behaviour)

Node runs the source directly. Import by **absolute path**:

```ts
import { tokenizeContent } from "/home/inktomi/inktomi-stack/development/orbweaver/packages/kit/src/content/index.ts";
const spans = tokenizeContent(body, { committed: true });
console.log(spans.map(s => s.kind).join(", "));   // e.g. "text, card, text"
```

`text` only ⇒ the fence was rejected and the card degraded to literal prose.

### DB access — HARD RULE

**Never run `sqlite3` against `data/orbweaver.db` while the server is up.** libSQL (the server's
driver) and a sqlite3 CLI attach don't coordinate WAL checkpointing; the CLI can delete the WAL out
from under the running server. Use, in order: the app → `/api/_debug/*` → a *copied* snapshot
(`db` + `-wal` + `-shm` together) opened as a copy. Never a live attach.

---

## 3. The card pipeline — file:line map

**Server, prompt side**

| what | where |
| - | - |
| teach constants (`RPG_CARD_TEACH`, `_STATIC`, `_EXAMPLE`) | `packages/server/src/domain/rpg/substrate/reminder.ts:100-129` |
| teach gate (`features.immersiveHtml`) | `reminder.ts:426-428` |
| reminder block ORDER | `reminder.ts:475-541` |
| gather / folded decision / injection assembly | `packages/server/src/domain/rpg/chat-ops/gather.ts:143-196` |
| reconcile note append | `gather.ts:165-169` |
| `FOLDED_RECONCILE_NOTE` text | `packages/server/src/entry/compose/rpg.ts:1044` |
| folded turn builder (7 tools) | `compose/rpg.ts:1064-1072` |
| `foldGuarded` (capability) | `compose/rpg.ts:1604` |
| reconcile cadence | `domain/rpg/chat-ops/reconcile-cadence.ts` |

**Server, wire side**

| what | where |
| - | - |
| tokenize every fitted row | `packages/server/src/domain/chat/engine/pipeline.ts:934` |
| keep-last-X window | `pipeline.ts:822-828` |
| card → stub-or-full decision | `pipeline.ts:852` |
| `cardWireStub` | `packages/kit/src/content/index.ts:923-927` |
| fence grammar + F2a leniency | `packages/kit/src/content/index.ts:245-287`, `:445-479` |
| in-chat injection splice/order | `domain/chat/assembly/injections.ts:120-200` |
| shape stages (full order, discarded) | `domain/chat/assembly/shape.ts:172-243` → collapsed at `assembly/trace.ts:40` |

**Client, render side**

| what | where |
| - | - |
| trust resolver | `packages/client/src/lib/render-trust.ts:45-59` |
| trust → tierA/tierB | `features/chat/components/message-content.tsx:92` |
| card render branch | `message-content.tsx:54-67` |
| settled-row tokenize | `features/chat/lib/content-blocks.ts:33` (`committed:true` hardcoded) |
| streaming ghost scanner | `features/chat/components/ghost-message-row.tsx` → `scanGhostContent` |
| assembly preview UI | `features/chat/components/assembly-preview-panel.tsx` + `assembly-preview-diagnostics.tsx` |

**Contracts / defaults**

| what | where |
| - | - |
| `RPG_CARD_KEEP_LAST_DEFAULT = 0` | `packages/contracts/src/rpg/config.ts:26` |
| `immersiveHtml` default `true` | `contracts/src/rpg/config.ts:57` |
| `extractionContext` default `window` | `contracts/src/rpg/config.ts:209` |

---

## 4. How a card actually gets to the screen

1. `buildLiteReminder` composes: game state → delta → **teaching blocks** → steering license → steering note
2. `gather` appends `FOLDED_RECONCILE_NOTE` on reconcile beats, wraps as one `ChatInjection`
   (`position:"in_chat"`, `depth:0`, `role:"system"`)
3. Assembly splices it into the **final user message**
4. `buildWireHistory` **tokenizes every row** — including the injection — and stubs card spans
   outside the keep-last-X window
5. Model emits `:::card title="…"` … `:::`
6. Client tokenizes the committed row and renders `tierB` → `ImmersiveCard` → sandboxed srcdoc iframe

**Diagnostic tell:** the streaming ghost shows a "forming" chip (its scanner only needs a completed
open line), then the settled row collapses to plain text ⇒ the failure is **downstream of the fence** —
trust routing or render, not the model.

---

## 4b. STATE AS OF 2026-08-04 — resume here

**Landed live** (prod pid restarted, all verified: `pnpm check` PASS, targeted suites green):
`CARD-KEEP-ZERO` · `SCENE-DROPPED` salvage · weather copy reframed · `TOOLDROP-BLIND` · `EMPTYGEN-UNLOGGED` ·
`WIRE-OUTCOMES` + spill · `DRAIN-UNBOUNDED` (**proved in prod**: 6-min hang → 10.002s, deadline warn fired) ·
`ENV-BLEEDS-INTO-TESTS`. Details + evidence per entry in `dogfood-tracking.md`.

### Steps forward, in order

1. **Fire a turn on the Charlotte chat and check the reminder.** The scene plane never established there
   (12/12 `update_scene` drops). With salvage + the reworded weather copy live, `Scene:` and `Recent beats:`
   should appear for the first time. If weather still drops, `prod.log` now names the field AND the value —
   that is the whole point of the new logging. **This is the highest-value next action: it validates four
   fixes at once.**

2. ✅ **DONE — full node suite green.** `10,065 passed / 0 failed` (1,207 files, 24 skipped, 406s,
   `reports/tool-guard/fullsuite-2.log`, exit 0) with the operator's live `AUTH_MODE=oidc` still armed.
   Pre-change baseline was 10,062 passed / 3 failed — all three were the `.env` bleed, all three gone.

3. **`INJECT-NAMED-AS-PLAYER`** — the biggest UNFIXED defect. Every hosted game currently tells the model the
   PLAYER wrote the game state. It is an ordering inversion (demote→name→squash instead of name→squash→demote);
   ST is the reference implementation, cited in the entry. **S.**

4. **`EMPTYGEN-REASONING`** — reasoning + folded discards whole turns INCLUDING valid tool calls. Needs a
   design call first (re-measure 6/6 co-emission with reasoning on, vs extend the fold guard). Reasoning off
   avoids it today. **M.**

5. **Owner ruling still open:** `RPG_WEATHER_TYPES` has no interior member. The reframe means the model should
   now omit rather than force — but if `salvagedFields: ["update_scene.weather"]` keeps appearing, the
   vocabulary genuinely needs widening.

6. **Tests owed** — every dogfood entry carries a "Gate/test to write" line. The one that matters most:
   a long-lived stream + SIGTERM asserting bounded shutdown (the forced path has now been proved in prod but
   has no test).

7. **Two card-chain rows were RE-DIAGNOSED on 2026-08-04 — re-read them before acting:**
   - `CARD-TRUST-INVERTED` — the original "labels got swapped" root cause is **false** (Tier-A is a
     deliberate tier, documented at `message-content.tsx:48-50`) and its "swap the tier routing" advice
     would invert the security posture. It also **does not explain the missing cards** unless the character
     carries `renderPolicy.trustHtml` — normal model output is untrusted ⇒ tierB ⇒ `ImmersiveCard`, which
     is correct today. **Check Charlotte's `trustHtml` before spending anything here.**
   - `CARD-TEACH-RECENCY` — the fix still stands, but its "violates the file's own intent" argument was
     backwards, and the reorder moves the *license* off the end. A/B a live turn; don't land it blind.

### Do not repeat these

- Don't infer a cause from the REQUEST shape — read `wire/outcomes`. That mistake produced a wrong root cause
  and a filed entry that had to be retracted (`MAXTOKENS-SUPERSEDED`).
- Don't trust a red without checking the ambient env first (fixed for tests, but the instinct stands).
- A fixture that disagrees with a correct change may be the thing that is wrong — but prove it from
  PRODUCTION code before "fixing" the test (`shape.ts:312,321` is what justified it this time).

---

## 5. Where the issues live

**This doc teaches ACCESS, CONTROL and INVESTIGATION only. Actual issues do NOT go here.**

Every finding from this investigation — and every dogfood bug — lives in
[`docs/history/dogfood-tracking-2026-08-08.md`](./dogfood-tracking.md), in that file's house format
(severity / status / effort / reporter / scout-coverage, with `#### What's broken`,
`#### Root cause`, `#### Evidence`, `#### Advice`).

Card-engine entries are under `## ═══ RPG / Card Engine ═══`:
`CARD-KEEP-ZERO` · `CARD-TEACH-RECENCY` · `CARD-FENCE-LENIENT` · `CARD-TRUST-INVERTED` ·
`CARD-EXTERNAL-MEDIA` · `INJECT-NAMED-AS-PLAYER`. Engine-gap entries (dead knobs, missing
prompt-debug view) are under `## ═══ RPG / Engine Gaps ═══`.

When you find something new: add it to the dogfood doc, not here.

---

## 6. Verification discipline

- `pnpm check` runs **NO tests** — it's static gates only. Read `reports/`.
- `pnpm test` = vitest + CT. `pnpm verify --push` runs the whole battery, \~16–17 min — background it.
- Tests live at **repo root** `tests/`, never under `packages/**`.
- Work directly on `main`; no feature branches.

---

## Appendix A — DEMOTED: the manual incantations `pnpm stack … prod` replaces

> **Do not use these.** They are kept only so you can recognise them in older notes, and as a break-glass
> fallback if `scripts/dev/stack-prod.ts` is itself the thing that is broken. Every one of them has a
> failure mode the supervisor now closes; those are named per block.

### A.1 Manual production launch (replaced by `pnpm stack up prod`)

```bash
cd /home/inktomi/inktomi-stack/development/orbweaver   # MANDATORY: .env and CLIENT_DIST_DIR are cwd-relative
setsid nohup env NODE_ENV=production node packages/server/src/entry/index.ts \
  >> .cache/stack/prod.log 2>&1 < /dev/null & disown
```

Closed by the supervisor: the cwd trap (root is derived from the script's own location) · the dead boot on
a missing `packages/client/dist/index.html` (checked first, reported as the build command) · no pidfile,
so nothing could later prove which process was ours.

### A.2 Manual stop / restart (replaced by `pnpm stack down|restart prod`)

```bash
PID=$(ss -ltnp 2>/dev/null | grep :8788 | grep -oP 'pid=\K[0-9]+' | head -1)
kill -TERM "$PID"
tail -f .cache/stack/prod.log     # eyeball for "shutdown: complete"; drain is bounded at 10s
curl -s http://127.0.0.1:8788/healthz     # {"status":"ok","harness":false}
ss -ltnp | grep 8788
```

Closed by the supervisor: pid-hunting through `ss | grep | grep -oP` (the pidfile + /proc start-ticks are
the identity now) · the human drain-watch (the log is read to a verdict, bounded, then escalated) · and
the trap this recipe's own footnote warned about — **a health check validates the PORT, not your
process**, so this could kill or "verify" a stack that was never yours. It could also have SIGTERM'd an
e2e harness stack mid-battery; `down` now refuses on `harness:true`.

### A.3 Arming the debug surface by editing `.env` (replaced by `--debug`)

The old procedure was: back up `.env`, hand-add `DEBUG_TOKEN=` / `WIRE_CAPTURE=on` / `RPG_TRACE=on`,
restart, **and remember to strip the three lines afterwards**. The last step is the one that never
happened — the block is still in the live `.env` as of 2026-08-06 (see §2's migration note). `--debug`
arms the same knobs as a spawn-time env overlay, so there is nothing to strip and nothing to forget, and
the posture cannot leak into a later e2e run or `snap` from the same shell.
