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
| start command | `NODE_ENV=production node packages/server/src/entry/index.ts` (= `pnpm start`) |
| port | `8788`, public at `https://orbweaver.inktomi.tech` |
| supervisor | **none** — started detached, reparented to `systemd --user`. If you kill it, nothing restarts it. |
| logs | `.cache/stack/prod.log` |
| env | `.env` in repo root, read at boot via `node:util`'s `parseEnv` (dotenv was removed) |
| server build step | **none** — node 26 runs `.ts` directly |
| client | prebuilt at `packages/client/dist`. Server-only env changes need **no rebuild**, just a restart. |
| auth | `AUTH_MODE=oidc` |

### Full rebuild + relaunch (production)

Run **from the repo root** — `.env` and `CLIENT_DIST_DIR` are both cwd-relative.

```bash
cd /home/inktomi/inktomi-stack/development/orbweaver

# 1. Rebuild the client bundle — ONLY needed if CLIENT code changed.
#    Server-only changes need no build: node 26 runs .ts directly.
pnpm --filter @orb/client build

# 2. Stop the running server gracefully.
PID=$(ss -ltnp 2>/dev/null | grep :8788 | grep -oP 'pid=\K[0-9]+' | head -1)
kill -TERM "$PID"
# Drain is BOUNDED at 10s (SHUTDOWN_DRAIN_MS): open SSE streams are force-closed at the deadline.
# Watch for "shutdown: complete":
tail -f .cache/stack/prod.log

# 3. Launch detached (survives the shell; there is no supervisor).
setsid nohup env NODE_ENV=production node packages/server/src/entry/index.ts \
  >> .cache/stack/prod.log 2>&1 < /dev/null & disown

# 4. Verify — check BOTH, and confirm the pid is NEW.
curl -s http://127.0.0.1:8788/healthz     # {"status":"ok","harness":false}
ss -ltnp | grep 8788
```

**Gotchas:**

- `CLIENT_DIST_DIR` defaults to `./packages/client/dist` (`foundation/env/index.ts:184`). In production
  `resolveSpaDistDir` **throws at boot** if `index.html` is missing (`entry/http/spa.ts:32`) — so a failed
  or partial `vite build` means the server refuses to start. Check `prod.log` if boot dies.
- There is **no root `build` script**. The only build in the tree is `@orb/client`'s `vite build`.
- Launching from the wrong cwd silently loads no `.env` and looks for the bundle in the wrong place.
- `pnpm start` runs the same command in the FOREGROUND — fine for a quick check, wrong for leaving it up.

**Restart procedure** (this is prod — it drops live SSE connections and disconnects any player):

```bash
kill -TERM <pid>
# graceful drain, bounded at 10s — a held-open SSE no longer stalls the restart.
# watch for "shutdown: complete" in .cache/stack/prod.log
setsid nohup env NODE_ENV=production node packages/server/src/entry/index.ts \
  >> .cache/stack/prod.log 2>&1 < /dev/null & disown
# then poll until healthy:
curl -s http://127.0.0.1:8788/healthz    # {"status":"ok","harness":false}
```

Verify the NEW pid is listening (`ss -ltnp | grep 8788`) — a health check validates the *port*, not
your process. A stale incumbent can answer for you.

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
TOK=$(grep '^DEBUG_TOKEN=' .env | cut -d= -f2-)
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
**Currently armed in `.env`:**

```
DEBUG_TOKEN=<read it from .env — do not paste it into a chat window>
WIRE_CAPTURE=on
RPG_TRACE=on      # DEAD KNOB, see finding #7 — has no effect
```

A backup of the pre-change `.env` is at `.env.bak-predebug-*`. Strip these three lines and restart
when done.

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
