# ST-Goldens — SillyTavern Provider Wire-Parity Probe

> **This README is the brain of this rig.** We compact often. Read it fully before
> touching anything. It captures architecture, findings, gotchas, and what to do next.

**Home: `scripts/probes/st-goldens/` — this is a PROBE HARNESS, not a test** (re-homed from
`tests/goldens/` on 2026-08-06). It boots a third-party app, drives a real browser, and writes JSON
captures for a human to read; it asserts nothing and no runner executes it. `tests/` is the sacred
1:1 mirror of `packages/` (every file there must prefix-swap to a source module), and living there
cost NINE quarantine carve-outs across the gate harness, two gates, two membership verifiers, biome,
tsconfig, and knip. `scripts/probes/` is where manual harnesses live (see `../rpg-extraction/`).

---

## Mission

Prove that Orbweaver sends **identical (or intentionally equivalent) payloads** to LLM providers
as SillyTavern does, for the same conversation context — per provider, per turn shape.

These tests are the ground truth for:
- Message assembly (role attribution, ordering)
- System prompt injection (where it lands, how it's wrapped)
- Turn shaping (how user/assistant pairs are built)
- Provider-specific formatting (Claude's Human:/Assistant: wrapping, Gemini's parts structure, etc.)

**The strategy:** run ST headless against a Playwright-intercepted mock, capture the exact HTTP
body ST sends, then compare against what Orbweaver sends for the same fixture. Match = parity
proven. Diverge = diff to investigate, document as known intentional delta or fix.

---

## SCOPE — Read Before Writing Any Code

**Chat completion ONLY.**

Orbweaver does NOT do text completion. Never add fixtures or harness code for:
- `/v1/completions` (text completion)
- `prompt:` based generation
- Legacy instruct formats that aren't chat completion

Every fixture provider must route through ST's `openai_settings.chat_completion_source`. The
`main_api` is always `'openai'` (ST uses this as the umbrella API type for ALL chat completion
sources — setting it to `'claude'` or `'google'` activates their TEXT completion paths, which
we don't care about).

---

## Architecture

```
scripts/probes/st-goldens/
  README.md                   # this file — the brain
  build-fixtures.ts           # writes ST V2 character PNGs + demo chats INTO the runtime
  write-v2-png.cjs            # the V2 tEXt-chunk PNG writer build-fixtures.ts loads
  generate-goldens.ts         # ST arm: boots ST, sets config, intercepts, captures
  capture-orbweaver.ts        # ORB arm: replays the fixture through our real turn engine
  compare-runner.ts           # diffs the two captures, structurally
  run-demo-goldens.sh         # 16-combo post-processing/squash/prefill sweep
  run-demo-complex.sh         # depth-injection + per-model tool-calling sweep
  fixtures/<id>.json          # test case: provider, character, messages, model (GITIGNORED — emitted)
  output/<id>.json            # captured ST payload (GITIGNORED)
  orbweaver-output/<model>_<id>.json  # captured Orbweaver payload (GITIGNORED)
  sillytavern-runtime/        # ST install (GITIGNORED, ~500MB, managed separately)
    data/default-user/
      settings.json           # ← patched before each run
      secrets.json            # ← patched with fake keys per provider
      characters/<name>.json  # ← written fresh from fixture
      chats/<name>/           # ← written fresh from fixture
```

**Every script anchors its paths to `import.meta.dirname` (the `.sh` pair to `$BASH_SOURCE`)** — none
is cwd-relative, so you can run any of them by absolute path from anywhere.

### How ST routing works

```
settings.json:
  main_api: 'openai'                    ← ALWAYS 'openai' for chat completion
  openai_settings:
    chat_completion_source: '<source>'  ← the actual provider: 'openai', 'claude', 'makersuite'...
    reverse_proxy: 'http://...'         ← our Playwright interceptor URL

secrets.json:
  api_key_<provider>: 'sk-mock-...'    ← fake key, so ST's key-presence check passes
```

### Proxy support: which sources honor reverse_proxy

From ST `openai.js:2679` (`proxySupportedSources`):
```
CLAUDE, OPENAI, MISTRALAI, MAKERSUITE, VERTEXAI, DEEPSEEK, XAI, ZAI, MOONSHOT
```

Sources NOT in this list (OPENROUTER, CUSTOM, AI21, COHERE, etc.) do NOT route through
`reverse_proxy`. For those we'd need a different interception strategy (see "CUSTOM" below).

### Playwright interception vs Mock Server (CRITICAL)

We **DO NOT** use Playwright's `context.route()` anymore. Why?
Because ST does **not** make the LLM request from the browser. It makes the request from its Node.js backend. Playwright can only intercept browser traffic.
Instead, we boot a tiny `http.createServer` listening on port 19999, and point ST's `reverse_proxy` directly to it. This captures the exact payload ST's backend sends via `node-fetch`.

### The Proxy Settings Gotchas

1. **`selected_proxy` Override**: When ST's frontend loads, it uses its Proxy Manager to overwrite `settings.oai_settings.reverse_proxy` with whatever is in `settings.selected_proxy.url`. If `selected_proxy.url` is empty, your injected `reverse_proxy` is instantly deleted on boot. You MUST patch `selected_proxy` in `settings.json`.
2. **"Connecting to Proxy" Modal**: ST shows a blocking confirmation dialog if it doesn't recognize the proxy URL. This blocks UI actions (like clicking Connect). It remembers proxy approval in `accountStorage` (persisted in `settings.json`, NOT `localStorage`). The key is `Proxy_SkipConfirm_<hash>` where hash is ST's custom MurmurHash2. We pre-seed this in `settings.accountStorage` before boot.

---

## Fixture Schema

```json
{
  "id": "basic_turn",
  "provider": "openai",
  "model": "mock-model",
  "user": { "name": "User" },
  "character": {
    "name": "Seraphina",
    "description": "A helpful assistant.",
    "system_prompt": "You are Seraphina.",
    "persona": "",
    "mes_example": ""
  },
  "messages": [
    { "role": "user", "content": "Hello!" }
  ]
}
```

**`provider`** = the `chat_completion_source` value in ST's `openai_settings`.

Valid provider values (from ST `openai.js:175`):
```
openai, claude, openrouter, ai21, makersuite, vertexai, mistralai, custom,
cohere, perplexity, groq, electronhub, chutes, nanogpt, deepseek, aimlapi,
xai, pollinations, moonshot, fireworks, cometapi, azure_openai, zai,
siliconflow, workers_ai, minimax
```

**`model`** = the model name. Maps to different `settings.json` keys per provider:
- `openai` → `model_openai`
- `claude` → `model_claude`
- `makersuite` / `vertexai` → `model_google`
- `mistralai` → `model_mistralai`
- `deepseek` → `model_deepseek`
- `xai` → `model_xai`
- `openrouter` → `model_openrouter`
- `groq` → `model_groq`
- `cohere` → `model_cohere`

---

## Running

```bash
# Kill any leftover ST processes
fuser -k 8001/tcp 2>/dev/null; true

# 0. Seed the ST runtime with our demo characters + chats (idempotent; re-run between fixtures)
node scripts/probes/st-goldens/build-fixtures.ts

# 1. ST arm — capture what SillyTavern sends for one fixture
node scripts/probes/st-goldens/generate-goldens.ts basic_turn

# 2. ORB arm — capture what we send for every claude fixture on disk
node scripts/probes/st-goldens/capture-orbweaver.ts

# 3. Diff them
node scripts/probes/st-goldens/compare-runner.ts

# …or run a whole sweep (writes its own fixtures, then does all four steps):
scripts/probes/st-goldens/run-demo-goldens.sh
scripts/probes/st-goldens/run-demo-complex.sh
```

**Requirements:**
- Node 26 — bare `node file.ts` strips types natively. **No tsx** (shed from this repo), no ts-node,
  and no `--experimental-strip-types` flag (it is the default now).
- Playwright chromium (`pnpm playwright install chromium` if not installed)
- ST runtime in `sillytavern-runtime/` with `node_modules/` installed

---

## What We've Found (Findings Log)

### 2026-08-05 — Initial build + full investigation

**ST's API taxonomy — CRITICAL gotcha:**
- `main_api = 'openai'` for ALL chat completion providers, not just OpenAI.
  Setting `main_api = 'claude'` activates ST's Anthropic TEXT COMPLETION path. Wrong.
- The real provider selector is `openai_settings.chat_completion_source`.
- `reverse_proxy` is under `openai_settings` and applies to proxySupportedSources only.

**Character activation — most fragile part:**
- `active_character` in `settings.json` does NOT activate a character in the browser.
  The page must CLICK the character card for ST to load the chat and set `context.character`.
- `Generate entered` + `Undefined character cannot be unshallowed` = no active character.
- Character cards: `.character_select` divs with `data-chid` (numeric index).
- Find by: `card.querySelector('.ch_name')?.textContent?.trim() === name`
- Click via raw `el.click()` — NEVER `locator.click()` (snap.ts --jsclick rule):
  these are absolutely-positioned virtualized rows; Playwright actionability checks fail.

**Generation trigger:**
- `#send_but` is `display:none` when textarea is empty → actionability fail.
- Call ST's global `Generate('normal')` directly instead. Same code path as the button.

**Playwright route interception:**
- `context.route('**/v1/chat/completions', handler)` — set on context before page opens.
  Routes are context-scoped so they work across any page in the context.
- `request.postDataJSON()` — parses the captured body as JSON.
- `route.fulfill({ status, contentType, body })` — reply with a valid mock response.
- For Claude: ST sends to `**/v1/messages` (Anthropic API), not `/v1/chat/completions`.
  Intercept pattern must cover both.

**Proxy confirmation dialog:**
- ST shows a "Connecting to Proxy" confirmation dialog when `reverse_proxy` is set.
  This blocks generation. May need to: pre-confirm via localStorage/settings flag, or
  intercept and dismiss the dialog via `page.on('dialog', d => d.accept())`.
  The confirm key: `Proxy_SkipConfirm_<hash>` stored in localStorage — can pre-seed it.

**snap.ts patterns we use:**
- `--jsclick` = wait for 'attached' (not 'visible'), then raw `el.click()`.
- `waitFor: 'attached'` prevents false-negative on full-bleed panels.
- `addInitScript()` could pre-seed localStorage to skip the proxy confirmation dialog.
- `context.route()` preferred over `page.route()` for coverage across the whole context.

**Playwright 1.61 (installed) — features we use + type receipts:**
- `context.route(url, handler)` [`types.d.ts:L9384`] — covers all pages; `url` accepts string, RegExp, or `URLPattern`
- `route.fulfill({ json: ... })` [`types.d.ts:L20933`] — `json` shorthand auto-sets `Content-Type: application/json`
- `request.postDataJSON()` [`types.d.ts:L20326`] — **sync**, auto-parses JSON AND form-encoded; no try/catch needed
- `request.headers()` [`types.d.ts:L20272`] — **sync**, lowercase keys; excludes security/cookie headers
- `page.evaluate(fn, arg)` — raw DOM clicks; `addInitScript(fn, arg)` [`types.d.ts:L8248`] — run before any page JS
- `newContext({ serviceWorkers: 'block' })` [`types.d.ts:L23912`] — **critical**: without this, an active SW can swallow route intercepts before our handler sees them
- `context.addInitScript(fn, arg)` — pre-seed localStorage before ST's JS runs (proxy confirm skip)

**Playwright 1.61 — available but not yet used:**
- `page.clock.setFixedTime(t)` [`types.d.ts:L18566`] — freeze Date for deterministic timestamps (NOT `freeze()`, that doesn't exist)
- `page.clock.install({ time })` [`types.d.ts:L18488`] — fakes Date + setTimeout + setInterval + performance
- `context.routeFromHAR(path)` [`types.d.ts:L9404`] — replay recorded ST sessions without booting ST
- `context.routeWebSocket()` [`types.d.ts:L9467`] — WebSocket interception if ST ever uses streaming WS
- `locator.ariaSnapshot({ mode: 'ai' })` [`types.d.ts:L13066`] — structural verification with element refs
- `request.allHeaders()` async [`types.d.ts:L20202`] — includes cookies/auth headers (sync `headers()` excludes them)

**Key gotchas from scout:**
- `request.postDataJSON()` is sync (not async) — don't await it
- `request.headers()` excludes security/cookie headers — use `request.allHeaders()` (async) for auth verification
- `route.fulfill({ json: X })` and `route.fulfill({ body: JSON.stringify(X), contentType: 'application/json' })` are equivalent; `json` is cleaner
- Clock API method is `setFixedTime()` not `freeze()` — docs on older pages say `freeze`, types say `setFixedTime`

### 2026-08-06 — ST quirks (moved here from the root README, where they never belonged)

**Settings locations:**
- Most core settings (`oai_settings.custom_prompt_post_processing`, `oai_settings.assistant_prefill`,
  `power_user.always_force_name2`) live in `data/default-user/settings.json`.
- The newer `names_behavior` flag moved to its own file: `data/default-user/OpenAI Settings/Default.json`.

**UI automation quirks:**
- You cannot bypass ST's UI to load a chat file by dropping it into the filesystem — ST caches and
  reloads based on its own in-memory timestamps on boot.
- The past-chats modal opener is `#option_select_chat` (may be hidden — needs `btn.click()` via
  evaluate, not a Playwright `.click()`).
- Chat items in the history modal are `.select_chat_block` (NOT `.past_chat_item`).

**Triggering generation:**
- `window.Generate()` is often unbound/masked headless; clicking `#send_but` is the parity-compliant
  trigger.

**Context assembly / truncation:**
- ST drops messages that exceed context length — raise max context in settings or the captured payload
  holds only a subset of the chat.

**Runtime patch (generate-goldens.ts does this silently):** ST excludes OPENROUTER from
`proxySupportedSources`; the runner patches `public/scripts/openai.js` in the runtime (idempotent,
marker-guarded) so OpenRouter traffic also routes to the mock server.

---

## Known Issues / TODO

- [x] **Proxy confirmation dialog** — handled. It is bypassed by injecting the `Proxy_SkipConfirm_<hash> = true` into `settings.accountStorage`.
- [x] **Claude interception** — handled. The Mock Server captures any request to the proxy, whether it's `/v1/chat/completions` or `/v1/messages`.
- [x] **`serviceWorkers: 'block'`** — handled. Still good practice in Playwright, even though we use a backend mock server now.
- [x] **Character activation confirmed working** — Yes, the Playwright `el.click()` triggers the character activation properly.
- [x] **ST-side capture** — Successfully intercepts and outputs to `output/<id>.json`.
- [x] **Orbweaver-side capture** — BUILT: `capture-orbweaver.ts` drives the REAL turn engine
      (`driveRound`) behind a wire-capturing OpenRouter backend and writes
      `orbweaver-output/<model>_<id>.json`. It does NOT POST to a running server — it replays
      in-process against a `freshDb()`, so no stack has to be up.
- [x] **Comparison runner** — BUILT: `compare-runner.ts` normalizes ST's Anthropic-shaped tools +
      leading fake-user message to our OpenAI shape, then diffs key-sorted structure with `content`
      blanked (prose differs by construction; SHAPE + ordering is the parity claim).
- [ ] **Multi-turn fixture** — N user/assistant pairs.
- [ ] **System prompt fixture** — verify where it lands in the messages array.
- [ ] **Wire into node:test** — proper assertions on payload shape, not just capture. NOTE: if this
      ever lands, the assertions belong in `tests/` under a real mirror path; the CAPTURE harness
      stays here (it boots a foreign app and cannot be a runner-executed test).
- [ ] **Clock freezing** — use `page.clock.setFixedTime()` (NOT `freeze()`) before `goto()` to make `send_date` timestamps in ST deterministic across runs.

---

## Ignored Paths

Already in `.gitignore` (all four — the runtime AND everything the rig generates; only the scripts +
this README are tracked):

```
/scripts/probes/st-goldens/sillytavern-runtime/
/scripts/probes/st-goldens/fixtures/
/scripts/probes/st-goldens/output/
/scripts/probes/st-goldens/orbweaver-output/
```

A gitignore is not enough on its own — two instruments glob the filesystem directly and each needs
its own fence for the runtime. Both are in place and are the ONLY quarantine this rig still owes:

- `scripts/ts-workspace.ts` — `searchGlobs` sweeps `scripts/**/*.ts`; a negated glob keeps the
  runtime's ~4,300 `.ts` files out of the ts-morph search project.
- `tsconfig.json` — its `exclude` names the runtime, because a specified `exclude` replaces tsc's
  default `node_modules` skip and ST ships four root `.d.ts` files (one declares browser globals).
