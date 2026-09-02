---
name: snap-driving
description: "Drive and verify the live Orbweaver app with `pnpm snap`: selector discipline, argv-ordered actions, picker affordances, room/session state, cheap evidence before pixels, appearance and theme arms, scenario/matrix/watch recipes, virtualized targeting, isolated stages, and exit-code triage. Use when composing a snap invocation, navigating to a section/room/modal, checking rendered behavior, watching streams or transients, diagnosing dead controls or NAV/ARG errors, handling wrong-room or stale-selector failures, or running multi-user and staged drives."
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

- Nav flags (`--goto`/`--open-chat`/`--open-character`/`--context-tab`), interaction steps
  (`--click`/`--fill`/`--press`/`--jsclick`/`--key`/`--wait-for`) **and `--eval`** execute as ONE
  queue in the exact order written. A mid-chain `--context-tab` runs where it is written — write
  the chain the way the interaction should happen.
- The PURE captures (`--map`/`--aria`/`--contrast`/`--expect-*`) are NOT in the queue: they observe
  the settled surface once, after the queue drains, so one call reaches AND inspects a surface:

  ```
  pnpm snap / --goto modal:newChat --click 'text=Blank chat' \
              --open-chat current --context-tab members --text
  ```

- **`--eval` was NOT in the queue until 2026-08-16** — every step ran, then every eval, so
  `--eval A --click X` reported A's POST-click state and a sequence walk cost one invocation per
  step. It now runs where it is written; a TRAILING `--eval` (after the last step/nav) still
  observes the settled surface, so the common `--goto x --eval y` shape is unchanged. If you are
  reading an old transcript whose evals disagree with its steps, that is why.
- **`--key` has two forms and only one WALKS.** `--key Tab` (bare, no `=`) presses the page
  keyboard without changing focus — N of them walk N stops, inside a Base UI focus trap included.
  `--key 'selector=Key'` FOCUSES the selector and then presses (the COMMIT idiom:
  `--fill 'input=q' --key 'input=Enter'`), so repeating it re-anchors every time and never walks.
- **`--fill` takes an ENGINE selector.** `--fill 'role=textbox[name="Content"]=a line'` works: the
  pair split steps over the `=` that ends an engine name (`role=`/`text=`/`css=`/`nth=`, including
  per-part in a `>>` chain), so the engine form is part of the SELECTOR, not the value. Until
  2026-08-30 it split at `role` and refused with `--fill selector "role" can never match`, and the
  workaround was `:nth-match(textarea, 2)=value` — that spelling still works and is still the right
  answer when nothing names the field. A value carrying its own `=` (a JS literal) is unaffected.
  Pair the bare form with a queued `--eval` on `document.activeElement` to read the focus order in
  one call, and **end a dialog walk on `--key Escape`, never Enter** (focus starts on Close; Enter
  dismisses, and in an editor it SAVES).
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
- **An `--eval` result is capped at 20 000 chars and the cap keeps BOTH ENDS** (head + tail, middle
  elided behind a loud `[TRUNCATED …]` first line). The old 2 000-char head-only cut silently ate
  the `cls`/`worstShift` tail of `__orb.motion()`, and a capped object read as a complete one.
- **A probe that PLANTS styles must inject a `<style>` tag with `!important`, never
  `element.style`.** A React re-render reverts inline style before the capture phase runs (the
  evals fire in the queue; `--contrast`/`--map` observe afterwards) — three runs were burned on a
  plant that had already been undone by the time it was measured.
- **`--contrast` measures the first IN-VIEWPORT match, not the first DOM match**, and refuses a
  verdict (`OFF-SCREEN … NO VERDICT`, red exit) when every match is off screen. Before that fix it
  lied in BOTH directions off recycled virtualized rows: a `2.44:1 FAIL` on a `dimmed α0.50`
  off-screen node, and a `17.14:1 PASS` for near-white text on white measured against a stale
  backdrop. A line reading `match k/N, first in-viewport` is telling you it skipped some.
- **`--crop` reports its path** — `crop=<path>` on the RESULT line and a `crop  <path>` report
  line. It is not a no-op just because the main PNG path is unchanged.
- **`--scale <css|device|n>` and the css default is DELIBERATE.** One image pixel per CSS pixel ≈
  half the image tokens on a hi-dpi context, which is the whole point for an agent reader — do not
  "fix" it. Raise it only when a HUMAN is the reader (a committed design-mock render): `device` uses
  the context's own DPR (1 desktop, 3 under `--mobile`), a number raises the context DPR and does
  not combine with `--mobile`. Past the 16 000 000 px budget the run REFUSES rather than writing a
  huge PNG, and `scale=<ask>/<WxH>` on the RESULT line states what it actually produced.
- **`--probe` VOIDS every motion/CLS number in the run** — it floors all animations/transitions
  from first paint, which kills the FLIP animations that make track changes CLS-free, so the
  harness manufactures layout-shift findings. Such a run prints `PROBE-NEUTERED-MOTION` and stamps
  `motion=PROBE-NEUTERED-MOTION` on the RESULT line. Take motion/CLS receipts WITHOUT `--probe`.
- **`__orb.motion()` carries THREE CLS totals; the budget gates on the third.** `cls` (the CWV spec
  metric) · `virtualizedCls` (the share the instrument classified as virtual-row reconciliation) ·
  `nonVirtualizedCls` = the budgeted remainder. A long transcript's `cls` is dominated by the message
  list settling on mount (~0.26 measured), which no app fix can move — so cite all three and judge
  `nonVirtualizedCls`. `pnpm motion-audit` prints them labeled and fails only on the non-virtualized
  one (`cls-raw` / `cls-virtualized` / `cls-non-virtualized` on its RESULT line).
- **Two scroll containers, two different lists** — `[data-slot=virtual-list-scroll]` is the SIDEBAR
  chat list (`packages/ui/src/primitives/virtual-list/virtual-list.tsx:158`); the TRANSCRIPT's
  scroller is `[data-slot=message-list-scroll]`
  (`packages/ui/src/primitives/message-list/message-list.tsx:421`). A whole virtualizer finding was
  once minted entirely off confusing the two — name the slot you mean.
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
     **`nav=OK` no longer coexists with `nav-actions-failed>0`**: a run whose page loaded but whose
     `--goto`/`--open-chat` was rejected reads `nav=ACTIONS-FAILED`, because its captures describe a
     surface you never reached. (It printed `nav=OK` beside `nav-actions-failed=1` until 2026-08-16.)
  3. **exit 0 = clean.** The last stdout line is always `RESULT <tool> key=value …` — machine-
     parsable; grep `^RESULT`.
- A `data-app-ready=degraded` readiness is reported as a NAV ERROR: the capture is mid-hydration —
  rerun, never assert on it. Mid-run HMR/dev-server churn is named and retried once by snap
  itself, so an environmental blip reads differently from an app failure.

## §5b Appearance: the account state is ONE arm, and it is not the default one

The dev account stores its OWN appearance choices (density/elevation/texture/typography — and possibly
`reducedMotion`), and the owner CHANGES them: `reducedMotion` measured `true` on 2026-08-18 and `false`
on 2026-08-22. So NEVER assume the account state — PROBE it at drive start (`--eval` the settings
response, or read `<html data-reduced-motion>`) and STATE which state your receipts were taken under.
Every un-flagged drive reviews whatever the account holds that day — motion audits once spent months
judging an app whose own setting had frozen the animations they were measuring.

- **TWO DIFFERENT MOTION GATES, and they diverge.** `--reduced-motion` emulates the **OS media query**
  (`prefers-reduced-motion`). `--full-motion` / `--appearance` shim the **app setting** (`<html
  data-reduced-motion>`, written by `useAppearanceRootEffects` off `settings.getUserSettings`).
  `motion-audit`/`perf-meter` already pass the media query as "full motion" and STILL measured a frozen
  app. They compose; neither implies the other. Naming the wrong one is a wrong verdict, not a typo.
- **`--full-motion`** = `--appearance '{"reducedMotion":false}'` — the flag a motion sweep types.
- **`--appearance '<json>'`** deep-merges ANY appearance keys over the REAL settings response
  (`page.route` response shim, `scripts/probes/_kit/appearance.ts`). Keys you name are pretended; every
  other key keeps the account's own value. **NOTHING IS WRITTEN** — no db row, no durable state, and the
  next flagless run sees the account again. Unparseable JSON or a non-object is ARG ERROR (exit 2).
- **`--appearance-preset <name>`** loads a curated profile from `scripts/probes/appearance-presets.json`:
  `defaults` (the schema's born values — NOT the owner's row) · `maximal` (all the nice stuff: glow
  elevation, glass everywhere, grain, colorization, motion on) · `compact` (compact density, minimal
  chrome — where row height/truncation defects surface) · `reading` (big type, wide column, document
  style, every `--reading-*` var off default) · `diagnostics` (every per-message chip + expanded action
  row — a second metadata line's worth of geometry). An unknown name is ARG ERROR listing the valid ones.
  `--appearance` composes OVER a preset (preset first, then the patch; later keys win).
- **That file is the ONE home for curated appearance points.** New coverage = a new PROFILE there, with
  its `why`. Never a new flag for an appearance point: on this axis the CLI carries exactly
  `--appearance` / `--appearance-preset` / `--full-motion`, by owner ruling. (`--theme` in §5c is a
  DIFFERENT settings axis, not an appearance point — owner-filed as #225.)
- **BOTH ARMS OR IT IS HALF AN ANSWER.** A motion/visual verdict owes the bare run (the owner's real
  state — does the floor hold?) AND `--full-motion` / `--appearance-preset maximal` (is the nice stuff
  good?). A full-battery surface pass drives bare + `maximal` at minimum; transcript/chat surfaces add
  `compact` and `reading` wherever density or typography is the question.
- Same three flags on `pnpm design-audit`, `pnpm motion-audit` and `pnpm perf-meter` — one vocabulary
  (`_kit/appearance.ts`), so a probe cannot offer half of it. `--json` records the applied patch under
  `environment.appearance`, so a manifest states which arm it measured.
- `--file` (static mock) REFUSES them: a local HTML file makes no settings request. Scenario checkpoints
  refuse them too — one shared browser context, so the shim goes on the OUTER command.

## §5c The ACTIVE THEME is its own axis — `--theme` (light-arm coverage off carried rooms)

`--appearance` reaches `config.appearance` only. The app's ACTIVE THEME is a different settings key
(`config.theme.selectedThemeId`, read by `use-selected-theme` → `settings.getTheme` → app-shell), so
before #225 "score this surface under the Light theme" meant WRITING the owner's settings, and
theme-polarity coverage rode only on chat rooms whose card carries a theme.

- **`--theme <name|id>`** renders as if that theme were selected — seeds `Hearth` | `Mocha` | `Light`,
  or any of your own themes, by name (case-insensitive) or id. **`--theme none`** = no selection (the
  shipped Hearth default a fresh account sees).
- Same non-mutating contract as the appearance shim: the run patches only the SELECTION over the real
  `settings.getUserSettings` response, the app then fetches the REAL theme row itself, and nothing is
  written. Same four probes (`snap`, `design-audit`, `motion-audit`, `perf-meter`); `--json` records it
  under `environment.theme`; `--file` and scenario checkpoints refuse it for the same reasons.
- The name is resolved against the account's OWN `settings.listThemes`, so a typo prints
  `THEME SHIM WARNING` on stderr with the real list and the run renders YOUR theme — read stderr before
  trusting a theme arm's verdict.
- **THIRD axis, not a synonym.** `--dark`/`--light` emulate the OS color scheme; `--appearance` is the
  app's appearance settings; `--theme` is the app's palette selection. They compose.
- **Take a theme arm on a NON-CARRIED surface** (Home, Configuration, Analytics…). Inside a chat room
  whose CARD carries a theme, `<html>` has NO `data-theme` and the room's `ThemeScope` governs — a
  pretended app theme is invisible there BY DESIGN (D44 §12 takeover), not a broken shim.

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
  `--scenario`; refuses `--pages`/`--contexts`/`--as`/`--watch`/`--baseline`/`--diff`. Its motion axis
  is the OS MEDIA QUERY only — the app's own setting rides the run's `--appearance`/`--full-motion`
  (§5b) across all 8 variants, so a "motion" variant of a reduced ACCOUNT is still reduced.
- **`--watch <totalMs> [--every <ms>]`** = timed series after nav+steps settle: per-tick
  screenshot + a re-run of every `--eval`, labeled by elapsed ms. THE instrument for streaming
  turns and transient states. It observes PAGE 0 only; `--no-shot --watch` is the cheap
  state-series path (evals without minting dozens of PNGs).

## §6b Load emulation: `--cpu-throttle` / `--network` (the margin a rest measurement cannot see)

- **`--cpu-throttle <n>` / `--network <slow-3g|fast-3g|slow-4g|fast-4g|offline>`** apply CDP
  `Emulation.setCPUThrottlingRate` / `Network.emulateNetworkConditions` to EVERY page BEFORE it
  navigates, so boot is measured under the arm too. Both are echoed on the RESULT line as
  `throttle=cpu:4x/net:slow-4g` — every number in that run was measured under it.
- **WHY it exists:** a layout shift within 500ms of a REAL click carries `hadRecentInput: true` and is
  excluded from CLS, so an unthrottled reading of a "settles after you click it" surface reports
  `0.000 paid` and says nothing about the margin. `--cpu-throttle 4` is what reveals it — measured on
  the "This chat" tab (#819): the last settle wave moved from +384ms to +795ms and the host paid
  0.30837 in one entry. Note a synthetic `el.click()` is UNTRUSTED and never sets `hadRecentInput`;
  only `--click` (a real CDP input dispatch) reproduces the exclusion.
- **MEASURED LIMIT — throttle CPU alone on the dev build.** 4× CPU **plus** a 3G/4G profile never
  reaches `data-app-ready` within snap's readiness window on `:5173` (~250 unbundled ESM resources).
  The network arm is for a production build or a `--file` fixture.
- A bad rate or an unknown profile REFUSES at parse time (exit 3) — a silently-ignored throttle would
  turn every verdict in that run into a false rest-state receipt.

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
- **THE OWNER MARKER IS SHARED ACROSS CHECKOUTS** (issue #108, 2026-08-16). It is ONE file keyed by the
  REPO, not by the checkout snap ran from: `<main-checkout>/.cache/snap-stage/active.json`, resolved via
  `git rev-parse --git-common-dir`, and it records the owner's **checkout path, pid and start time**. So
  `--stage-status` and `--stage-down` see and act on the same stage from a lane worktree and from main.
  (Before this, a lane's stage left main's marker dir empty and the only tell was `ss -tlnp` + ps.)
- `--stage-status` = the visibility read: marker + **owner (checkout · pid · age)** + stage-band port
  owners + this checkout's stage dirs (a lost-marker stage is SEEN, with the warning naming the remedy).
  `--stage-down` tears down from ANY checkout, and falls back to a marker-less teardown (kill by
  stage-band port + sweep stage dirs) when a lost marker left an ownerless stage.
- **THE BAND IS ONE FIXED PAIR — there is no per-lane band.** Two lanes cannot each hold a stage, and
  snap no longer silently kills the incumbent. Against a LIVE stage owned by another checkout:
  `--isolated` at the SAME commit reuses it read-only (it is the same frozen source); anything that
  would rebuild, `--fresh`, or `--dirty`-rsync it **REFUSES**, naming the owner's checkout, pid and age.
  A marker whose band is unbound is a corpse and gets reclaimed automatically. Read the refusal, then
  either wait, `pnpm snap --stage-down` deliberately, or boot a private pair (below) — never hand-kill
  pids: a hand kill leaves the marker lying about a stage that no longer exists.
- **Band occupied / need your own pair:** `scripts/dev/stack.sh` reads `VITE_PORT` and
  `VITE_API_TARGET` from env — boot a private stack on a free pair and point snap at it with
  `--base http://localhost:<vitePort>`.
- The multi-user fixture (`--contexts N` / `--as <handle>`) is a SIDECAR on its own pair
  (server :8790 / vite :5175, roster: `owner`, `member`). snap NEVER boots it — bringing it up
  (`pnpm fixture up`) is an operator call, and a down/mismatched fixture
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
