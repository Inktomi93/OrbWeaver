---
name: snap-driving
description: "Craft doctrine for driving the live Orbweaver app with the `pnpm snap` probe — selector-engine discipline, the argv-ordered action queue, two-stage picker affordances, room/session state (`current` vs `latest`, the one-browser-lifetime rule), the cheap-evidence ladder (--text/--aria → --expect-* → pixels), scenario/matrix/watch recipes, hover-reveal vs virtualized targeting, the isolated stage band, and exit-code triage. Use whenever you drive or verify the running app headlessly: composing any snap invocation, reaching a section/room/modal, verifying a rendered change, watching a stream or transient, diagnosing a 'dead button', a NAV FAILED or ARG ERROR, a wrong-room drive, or a stale selector — and for multi-user (--contexts) or staged (--isolated/--dirty) drives. The flag contract lives in scripts/probes/snap.ts's header and `pnpm snap --help`; this skill teaches how to drive, not what the flags are."
---

# Driving the app with snap

One Bash call, snap's own headless browser, evidence out — no MCP in the loop. The FLAG CONTRACT
(every flag, current semantics, refusal combinations) is `scripts/probes/snap.ts`'s header plus
`pnpm snap --help` — read those fresh; they change faster than any distillation. This skill is the
driving course: where drives go wrong, and how to get receipts cheaply. **On any disagreement, the
header wins.** Worked end-to-end recipes: `reference/recipes.md` in this skill dir.

Preconditions and geography:

- The dev stack must be up: `pnpm stack status`, `pnpm stack start` (server :8788, vite :5173).
  A hanging snap or instant nav error usually means it is not.
- **Navigation is client state, not URLs** — the app has 2 URL routes (`/`, `/login`). "Go to X"
  means `--goto <section|settings:<cat>|modal:<slot>>` / `--open-chat` / `--open-character` /
  `--context-tab`, never a URL path. Snapping `/some-path` renders the home shell under a
  misleading PNG name.
- Every artifact lands under `reports/` (gitignored) — snaps, traces, JSON manifests. Never write
  to the repo root.

## §1 One selector engine per target

- A selector is ONE engine: a CSS string, OR `role=…`, OR `text=…`. **Never concatenate engines**
  — `[aria-label=x] role=button[name=y]` is a CSS parse error, not an AND. Combine conditions with
  Playwright's `:has()`/`>>`, or pick the single best engine.
- **Discover targets with `--map`, never by grepping source.** It prints every interactive element
  as `role "name" → best selector`, validated unique + visible.
- **Role-scoping beats text when names repeat.** The same label routinely exists twice (a topbar
  chip and a menu item; a list row and its context-panel echo) — `text=Presets` matches both.
  Prefer the testid/role selector `--map` printed, or scope with `:has()` from a unique ancestor.
- `--map`'s accessible NAME is a discovery aid, not the truth — its textContent fallback
  double-counts hidden hover-reveal text. The real accessible name comes from `--aria`.

## §2 The action queue is TRUE ARGV ORDER

- Nav flags (`--goto`/`--open-chat`/`--open-character`/`--context-tab`) and interaction steps
  (`--click`/`--fill`/`--press`/`--jsclick`/`--key`/`--wait-for`) execute as ONE queue in the
  exact order written. A mid-chain `--context-tab` runs where it is written — write the chain the
  way the interaction should happen.
- All drives run BEFORE the captures (`--map`/`--aria`/`--eval`/`--contrast`/`--expect-*`), so one
  call reaches AND inspects a surface:

  ```
  pnpm snap / --goto modal:newChat --click 'text=Blank chat' \
              --open-chat current --context-tab members --text
  ```

- If you catch yourself splitting one interaction across two snap calls, stop — state does not
  carry between calls (§4). Chain it, or use `--scenario`.

## §3 Two-stage affordances: a "dead button" is usually a menu

This app's guided/parameterized controls open PICKER MENUS as their first stage — the composer's
guided cluster opens a person picker before impersonating
(`packages/client/src/features/chat/components/composer-guided-cluster.tsx`), speak-as is a
speaker picker (`features/chat/components/speak-as-select.tsx`), and the pattern repeats across
parameterized actions.

- A click that "does nothing" in the shot usually opened a menu the capture missed. **Capture
  `--aria` (or `--map '[role=menu]'`) AFTER the click before concluding anything is dead.**
- Only when the post-click aria shows no menu/dialog/popup AND no state change is "dead control" a
  finding — and then it is a real one (the no-dead-toggles law).

## §4 Rooms and state: one browser lifetime

- **Every snap invocation boots a FRESH browser with a fresh profile.** Nothing in-page carries
  between calls: composer drafts (zustand-persisted,
  `packages/client/src/state/create-entity-draft-store.ts`) and refinery selection (in-memory,
  `packages/client/src/state/refinery-selection-store.ts`) are device-local — a new browser has
  neither. **Create-and-act must happen in ONE browser lifetime**: one argv chain, or one
  `--scenario`.
- `--open-chat` resolution: an id always works; an exact title works unless AMBIGUOUS (matches >1
  → loud refusal; pass the id); `latest` = the chat list's top row; `current` = the room the app
  is showing RIGHT NOW via the dev bridge, no list query in the path.
- **After creating a room in the same chain, use `current`, never `latest`.** A just-created
  unsent room is an unlisted husk until the chat-list query refetches, so `latest` names a
  DIFFERENT chat (measured 2026-08-15: a probe message landed in the wrong room this way).
  `current` refuses loudly on the landing surface — that refusal means no room is open.
- Seed a persisted store BEFORE navigation with `--ls 'key={json}'` when a pref matters to the
  drive (first `=` splits; values are JSON).

## §5 The evidence ladder: text first, assertions as receipts, pixels last

- **`--text` / `--aria [selector]` first** — structure as text, ~5–8× cheaper than a PNG and
  greppable. Fall to pixels only when something looks off; `--shot-of <sel>` is the cheapest
  pixel path (one element, auto-cropped).
- **Assert with `--expect-*` instead of hand-rolled evals**: `--expect-visible`, `--expect-text
  <sel=text>`, `--expect-count <sel=N>`, `--expect-url`, `--expect-no-overflow`, `--expect-focus`.
  Each prints an `ASSERT … PASS/FAIL` line and folds into the exit code — the printed line IS the
  receipt. They match RENDERED elements by default (`--include-hidden` widens).
- `--eval` auto-invokes a bare function literal — pass `'()=>{…; return x}'` with NO trailing
  `()`; `'(()=>{…})()'` double-invokes and throws. Plain expressions need no wrapping.
- **`--json` is the lossless record** — the terminal console view caps at 200 messages
  (errors/warnings prioritized); the manifest keeps everything. Cite it whenever the terminal view
  was capped, and prefer it as the durable receipt for a red run.
- **`sandbox-trace-noise` is harness-induced, never an app finding** — Playwright tracing (snap's
  default failure evidence) injects its script into the app's deliberately script-dead sandboxed
  card frames; the resulting console error is excluded from the verdict but counted in the RESULT
  line. Do not file it; do not "fix" it.
- **Exit triage, in this order:**
  1. **exit 2 = ARG ERROR** — your invocation is wrong; nothing ran. Fix the flag per the printed
     message (`pnpm snap --help` for the contract) and rerun.
  2. **exit 1 = the run went red** — read the RESULT line's axes (`nav`, `nav-actions-failed`,
     `steps-failed`, `assertion-fails`, `contrast-fails`, `eval-fails`, `console-errors`,
     `page-errors`), then the retained Playwright trace under `reports/traces/`. NAV FAILED and
     the `*REFUSED` lines land here — see §9 before retrying anything.
  3. **exit 0 = clean.** The last stdout line is always `RESULT <tool> key=value …` — machine-
     parsable; grep `^RESULT`.
- A `data-app-ready=degraded` readiness is reported as a NAV ERROR: the capture is mid-hydration —
  rerun, never assert on it. Mid-run HMR/dev-server churn is named and retried once by snap
  itself, so an environmental blip reads differently from an app failure.

## §6 Scenario, matrix, watch (recipes: `reference/recipes.md`)

- **`--scenario <file.json>`** = sequential checkpoints in ONE browser lifetime
  (`{name?, defaults?, checkpoints:[{name, args}]}` — args are ordinary snap argv). A checkpoint
  on the SAME url keeps the live page, so client state carries across checkpoints — THE instrument
  for multi-step flows (wizard, settings walk, open-edit-save-reopen). `--summary` prints one
  compact `CHECKPOINT <name> PASS/FAIL` line each; pair with `--json` for the full evidence.
  Checkpoints cannot carry `--pages`/`--contexts`/`--as`/`--watch`/`--baseline`/`--diff`, cannot
  nest scenarios, and stage flags go on the OUTER command.
- **`--matrix`** = the bounded 8-variant sweep (desktop/mobile × light/dark × motion/reduced-
  motion) in one command, each variant its own report + `<out>-<variant>.png`. Composes with
  `--scenario`; refuses `--pages`/`--contexts`/`--as`/`--watch`/`--baseline`/`--diff`.
- **`--watch <totalMs> [--every <ms>]`** = timed series after nav+steps settle: per-tick
  screenshot + a re-run of every `--eval`, labeled by elapsed ms. THE instrument for streaming
  turns and transient states. It observes PAGE 0 only; `--no-shot --watch` is the cheap
  state-series path (evals without minting dozens of PNGs).

## §7 Hover-reveal vs virtualized rows

- **Hover-revealed targets** (group-hover kebabs, row toolbars): `--press` = hover-then-forced-
  click. Synthetic `--hover` LOSES `:hover` on any list re-render (a query settling, a row
  recycling) — the revealed controls vanish before the shot; prefer the focus path for
  reveal-state evidence.
- **Virtualized/composite rows** (message list, list panes — absolute inset rows in a scroll
  container): `--jsclick <css>` = raw in-page `el.click()`. `--click` with role locators FLAKES
  against them (actionability timeouts on selectors `--map` just printed). Reach for `--jsclick`
  first on any list-row target.
- **Virtualized row counts are VIEWPORT rows.** An `--expect-count` or eval against a virtual list
  asserts the mounted rows, not the dataset — get dataset truth from `__orb.queries()` or the
  `/api/_debug/db/*` endpoints instead.
- **Two staleness footguns:** `--map` names go stale across state changes — re-map FRESH against
  the settled surface right before targeting; and Base UI combobox accessible names flip
  label⇄value mid-transition — never reuse a pre-settle name.

## §8 The stage band

- `--isolated` (frozen HEAD worktree) / `--dirty` (working tree, re-syncs per call) boot ONE stage
  on the fixed offset pair — **server :8888 / vite :5273** (dev pair + 100,
  `scripts/probes/_kit/snap-stage.ts`). One stage at a time, keyed by sha; a new HEAD auto-
  rebuilds; `--fresh` forces it. Stage when your drive window overlaps active lanes — a
  crash-looping dev vite mid-drive is not a product finding.
- `--stage-status` = the visibility read: marker + stage-band port owners + worktree dirs (a
  lost-marker stage is SEEN, with the warning naming the remedy). `--stage-down` tears down, and
  falls back to a marker-less teardown (kill by stage-band port + sweep stage dirs) when a lost
  marker left an ownerless stage.
- **Band occupied / need your own pair:** `scripts/dev/stack.sh` reads `VITE_PORT` and
  `VITE_API_TARGET` from env — boot a private stack on a free pair and point snap at it with
  `--base http://localhost:<vitePort>`.
- The multi-user fixture (`--contexts N` / `--as <handle>`) is a SIDECAR on its own pair
  (server :8790 / vite :5175, roster: `owner`, `member`). snap NEVER boots it — bringing it up
  (`bash scripts/dev/multi-user-fixture.sh up`) is an operator call, and a down/mismatched fixture
  is a loud `FIXTURE REFUSED` with the exact remedy, never a silent fallback to the shared stack.

## §9 Refusals are answers; shared-stack manners

- **ARG ERROR (exit 2), NAV FAILED, and every `*REFUSED` line are designed answers, not
  obstacles.** Each carries the reason and the remedy: an ambiguous title says pass the id; a down
  fixture prints the up command; `--file` + nav flags says drop them (a static mock has no
  bridge). Read the message, follow its remedy — never route around a refusal, and never retry the
  identical command hoping for a different answer.
- **:5173/:8788 is the owner's live stack.** Read-only drives unless the task IS a dogfood turn.
  Never restart or stop the stack, the fixture, or the engines from a drive; never reseed the dev
  DB mid-session. When in doubt about writes, stage (`--isolated`/`--dirty` — own DB) and write
  there: the stage DB is disposable by construction.
- The dev stack and the stage have SEPARATE databases — fixture ids from one do not exist in the
  other. "The seeded chat is gone" usually means you are on the other base; check before
  concluding data loss.
