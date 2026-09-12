---
name: snap-driving
description: "Drive and verify the live Orbweaver app with `pnpm snap` and READ what it produced: the run slot + run.json + browser-free `--report` reader, the 19 evidence arms, selector discipline, argv-ordered actions, picker affordances, room/session state, cheap evidence before pixels, appearance and theme arms, scenario/matrix/watch recipes, virtualized targeting, isolated stages, and exit-code triage. Use when composing a snap invocation, reading a snap result or run.json, navigating to a section/room/modal, checking rendered behavior, watching streams or transients, diagnosing dead controls or NAV/ARG errors, handling wrong-room or stale-selector failures, or running multi-user and staged drives."
---

# Driving the app with snap

One Bash call, snap's own headless browser, evidence out — no MCP in the loop. The FLAG CONTRACT
(every flag, current semantics, refusal combinations) is `pnpm snap --help`, generated from the executable
registry (`tooling/src/snap/contract/help.ts` + `ops/flag-grammar.ts`) — it changes faster than any
distillation, and **on any disagreement the help wins.** This skill is the driving course: where drives go
wrong, how to get receipts cheaply, and how to READ what a run produced. Worked end-to-end chains:
`reference/recipes.md`. **Every accepted flag, one line each: `reference/flags.md` — Read it in full
once at the start of any drive; it is the only way to know the whole vocabulary without scrolling 400
lines of help.**

## §0 Read the output the snap way — never scroll it, never head/tail it

A snap run prints a LOT, and a lazy read of the top or bottom of it is how findings get missed. The output
has a fixed shape; use the shape.

1. **The first line is the run slot** (`run slot reports/runs/snap/<runId>`). Every artifact of THIS run
   lives inside it, immutable; `reports/snaps/<name>.png` and friends are mutable "latest" pointers a later
   run re-aims. Cite the slot, not the pointer.
2. **The end card is the verdict.** The last block is always: `RESULT snap key=value …` (one line, every
   axis: `nav=`, `steps-failed=`, `assertion-fails=`, `contrast-fails=`, `console-errors=`, `page-errors=`,
   `population-verdict=` where an arm has one), then `RUN <runId> checkout= sha= lane=`, then zero or more
   `FINDING <severity> | what | where | evidence=<path> confidence= completeness= | next=<exact command>`
   rows, then `PROVENANCE …` and `EVIDENCE <abs path to run.json>`. Read every FINDING row; each carries a
   copy-pasteable `next=` reader command narrowed to its arm.
3. **Every structured line has an UPPERCASE prefix at column 0**, so you can pull exactly what you need
   from a long log: `RESULT`, `ASSERT`, `CONTRAST`, `MAP`, `ARIA`, `EVAL`, `CHECKPOINT`, `MATRIX PLAN`,
   `POPULATION`, `REACH`, `FINDING`, `ARTIFACT`, `INDEX`, `READ`, `ARG ERROR`, `NAV ERROR`/`NAV FAILED`,
   `SESSION DEAD`/`SESSION BUSY`, `THEME SHIM WARNING` (stderr), `*REFUSED`.
4. **How to run it so you can read it** (the Bash tool truncates long output, and the tool-guard REWRITES
   `pnpm snap … | head` into a redirect anyway):

   ```bash
   pnpm snap / --goto presets --map --text > "$SCRATCHPAD/<lane>-presets.log" 2>&1; echo "EXIT=$?"
   ```

   then `Read` the log file (the Read tool pages with offset/limit — read ALL of it for a verdict), or
   pull the structured lines: `grep -nE '^(RESULT|ASSERT|FINDING|CONTRAST|POPULATION|ARG ERROR|NAV)' <log>`.
   Never `| tail`, never `| head` — a pipeline's exit code is the reader's, and the reader eats the list.
5. **The durable receipt is `run.json`** (the `EVIDENCE`/`INDEX` path). It carries the verdict, a typed
   fact per arm (`snap-arm-<arm>-v1`: state `passed|failed|refused|withheld|load-suspect|absent|off` + data), the
   artifact inventory, and the findings. Replay it WITHOUT a browser:

   ```bash
   pnpm snap --report <run.json path | run-id | latest> --problems      # findings only (default)
   pnpm snap --report <…> --all --arm contrast                           # everything, narrowed
   pnpm snap --reports                                                    # every indexed run: id · sha · lane · verdict
   ```

   `--report`/`--reports` never start a browser, stage, session or run slot — they are free.
6. **Exit codes are the first triage, before you read anything else:** `0` clean · `1` red (a finding, a
   failed assertion, a failed step, a console error) · `2` REFUSAL / tool error — the instrument COULD NOT
   MEASURE (a withheld arm, a dead session, a cold stage); never a product verdict and never a clean
   row · `3` misuse — your argv is wrong, nothing ran, the `ARG ERROR` line names the fix. Load is NOT a
   refusal (owner ruling 2026-09-05, #1616): a rate measured under load is exit `0` with a `load-suspect`
   label on the arm and a `load-suspect=<arms>` token on the `RESULT` line — read the number as evidence,
   never as a verdict.
7. **`--help` is 400+ lines.** `pnpm snap --help > "$SCRATCHPAD/snap-help.txt"` then `Read` the file when
   you need the exact contract; `reference/flags.md` is the one-line-per-flag index for everything else.

### The 18 arms (each is its own typed fact in `run.json`; "arm" = one kind of evidence)

| Arm | Flag | What it answers | Refuses to combine with |
| - | - | - | - |
| shot | (default) / `--shot-of` / `--full` / `--crop` | what it looks like (PNG, 1 image px per CSS px) | — |
| dead-css | on by default (`--no-deadcss`) | Tailwind classes that never compiled, used-but-empty rules | — |
| aria | `--aria` / `--text` | the accessible tree — the ORACLE for names, roles, landmarks | — |
| map | `--map [sel]` | every control → a unique validated locator + actionability; the SPA destination atlas | — |
| eval | `--eval <js>` | any in-page value, incl. `__orb.*` | — |
| contrast | `--contrast <sel>` (+`--contrast-pixel`) | WCAG ratio vs the effective backdrop | — |
| cascade | `--cascade <sel=prop>` | why a property has that value (Active/Overloaded declarations) | `--lighthouse` |
| assert | `--expect-*` | a rendered fact, as a PASS/FAIL receipt | — |
| app-snapshot | always on | coarse boot timing + `__orb.snap()` overview | measured under load and labelled `load-suspect`; withheld only on an unproven or software-rendered browser |
| motion | `--motion [sel]` | one motion window: LoAF, CLS (judge non-virtualized), dirty animations, dropped frames | `--filmstrip`, `--cpu-profile` |
| perf | `--perf` | per-step input delay, long tasks, rAF gaps, CLS over the action tape (a meter, not a gate) | `--filmstrip`, `--cpu-profile` |
| cpu-profile | `--cpu-profile` | who burns the frame (V8 sampling profile) | `--perf`, `--motion`, `--filmstrip` |
| boot-trace | `--boot-trace` | the boot as a Chromium trace + DevTools insights (LCP required) | `--filmstrip` |
| react-profile | `--react-profile` | hottest components, commit topology, render reasons (boot call on a session) | — |
| heap | `--heap <label>` / `--heap-compare` / `--heap-retainers` | memory growth, detached trees, retainers (diagnostic, never a budget) | `--filmstrip` |
| lighthouse | `--lighthouse desktop\|mobile` | axe/best-practices/seo audits on THIS run's settled page | `--cascade`; mobile fills the device slot |
| requests | `--requests [url]` / `--request-body <url>` | which reads the surface issued, and one JSON body | — |
| filmstrip | `--filmstrip` | a transition as a labelled contact sheet | every profiler/measurement arm |
| design-audit | `--design-audit` | the deterministic UI defect scanner (60 rules, population verdict, `--fail-on`, `--mobile`) | see the flag index; positive control = a trailing `--eval` (it runs before the walk, #1659); cold `--dirty` needs `--idle` |

`pnpm snap <route> --design-audit` (the deterministic UI defect scanner: 60 rules, population accounting,
`--mobile` for tap targets, `--fail-on P0..P3` for the failing severity) is a snap arm since #1315; it shares
every reach/environment flag above and prints the same kind of end card. The old record, motion-audit and
perf-meter commands are RETIRED — snap's `--filmstrip`, `--motion` and `--perf` arms are their homes.

POSITIVE CONTROL: `--eval` is the channel. A trailing `--eval` runs on the settled surface BEFORE the design-audit
walk (#1659), so an expression that appends a defective element is counted by the census in the same invocation —
no second stage cycle, no source plant. On a COLD `--dirty` stage pass `--idle`: two consecutive audits answered NO
VERDICT (`data-app-ready DEGRADED`) without it, and "run it twice" is not the remedy.

Preconditions and geography:

- The dev stack must be up: `pnpm stack status`, `pnpm stack start` (server :8788, vite :5173).
  A hanging snap or instant nav error usually means it is not.
- **Navigation is client state, not URLs** — the app has 2 URL routes (`/`, `/login`). "Go to X"
  means `--goto <section|settings:<cat>|modal:<slot>>` / `--open-chat` / `--open-character` /
  `--context-tab`, never a URL path. Snapping `/some-path` renders the home shell under a
  misleading PNG name.
- Every artifact lands under `reports/` (gitignored) — snaps, traces, JSON manifests. Never write
  to the repo root. Since #1164 a run writes them inside its OWN slot
  (`reports/runs/snap/<runId>/…`, printed as the run's first line) and publishes
  `reports/snaps/<name>.png` and friends as mutable latest pointers when it finishes. The immutable
  receipt is the printed absolute `run.json` plus its slot artifacts; cite those for a verdict. A
  later run may re-aim a published pointer even though concurrent runs cannot overwrite slot bytes.

## §1 One selector engine per target

- A selector is ONE engine: a CSS string, OR `role=…`, OR `text=…`. **Never concatenate engines**
  — `[aria-label=x] role=button[name=y]` is a CSS parse error, not an AND. Combine conditions with
  Playwright's `:has()`/`>>`, or pick the single best engine.
- **Discover destinations and current controls with `--map`, never by grepping source.** Its global
  SPA NAV TARGETS block prints executable `--goto`/`--context-tab`/`--open-chat` recipes; CURRENT
  SHELL / REGIONS explains the rendered rail/list/content/context topology; SURFACE MAP prints named
  landmarks and controls with a unique locator plus explicit actionability. Scope the current surface
  with `--map '<selector>'`; the global atlas remains visible.
- **Role-scoping beats text when names repeat.** The same label routinely exists twice (a topbar
  chip and a menu item; a list row and its context-panel echo) — `text=Presets` matches both.
  Prefer the testid/role selector `--map` printed, or scope with `:has()` from a unique ancestor.
- `--map`'s accessible NAME is a discovery aid, not the truth — its textContent fallback
  double-counts hidden hover-reveal text. The real accessible name comes from `--aria`.
- Default map rows describe the active rendered surface. `--include-hidden` is only an attached-DOM
  inventory: hidden/inert rows are labelled locator-only and do not prove React Activity provenance or
  a complete hidden Fiber inventory. Never use those rows as current click handles.

## §2 The action queue is TRUE ARGV ORDER

- Nav flags (`--goto`/`--open-chat`/`--open-character`/`--context-tab`), interaction steps
  (`--click`/`--fill`/`--force-click`/`--dom-click`/`--key`/`--wait-for`) **and `--eval`** execute as ONE
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

- A one-shot call owns one browser lifetime. Chain a short interaction in argv order or use
  `--scenario`; use a named `--session` when inspection or driving must continue across calls (§4).

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

## §4 Rooms and state: one-shot, scenario, or named session

- **Bare Snap is one-shot; named Snap is stateful.** A call without `--session` boots a fresh browser,
  so create-and-act stays in one argv chain or `--scenario`. `--session <name>` boots one private
  lane-owned browser and later calls drive the live page without re-navigation when no route is given.
  Browser-lifetime flags (`--base`/stage, viewport/device, appearance/theme, storage, pages, throttling)
  belong on the boot call and later attempts refuse as misuse (exit 3). Every call still gets its own
  immutable run slot/evidence window; export session-lifetime rings, HAR, and trace with
  `--session-export <name>`.
- `--open-chat` resolution: an id always works; an exact title works unless AMBIGUOUS (matches >1
  → loud refusal; pass the id); `latest` = the chat list's top row; `current` = the room the app
  is showing RIGHT NOW via the dev bridge, no list query in the path.
- **After creating a room in the same chain, use `current`, never `latest`.** A just-created
  unsent room is an unlisted husk until the chat-list query refetches, so `latest` names a
  DIFFERENT chat (measured 2026-08-15: a probe message landed in the wrong room this way).
  `current` refuses loudly on the landing surface — that refusal means no room is open.
- Seed a persisted store BEFORE navigation with `--local-storage 'key={json}'` when a pref matters to the
  drive (first `=` splits; values are JSON).

## §5 The evidence ladder: text first, assertions as receipts, pixels last

- **`--text` / `--aria [selector]` first** — structure as text, ~5–8× cheaper than a PNG and
  greppable. Fall to pixels only when something looks off; `--shot-of <sel>` is the cheapest
  pixel path (one element, auto-cropped).
- **Assert with `--expect-*` instead of hand-rolled evals**: `--expect-visible`, `--expect-text <sel=text>`, `--expect-count <sel=N>`, `--expect-url`, `--expect-no-overflow`, `--expect-focus`.
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
- **`--mobile` and `--viewport` COMPOSE (#1668).** `--mobile --viewport 320x740` is "the iPhone, windowed to
  320x740" — `pointer: coarse`, DPR 3 and the mobile UA all survive, in either argv order. `--wide`/`--desktop`
  are device PRESETS and do clear the device. Before trusting any geometry number, read the RESULT line's
  `device=<pointer>:dpr<n>:<WxH>` token: it is what the PAGE answered (`matchMedia`, `devicePixelRatio`), so
  `device=fine:dpr1:320x740` on a run you thought was mobile means the emulation did not apply. The CT browser
  with `test.use({ hasTouch: true })` is no longer the only coarse-at-320 channel.
- **`--probe` VOIDS every motion/CLS number in the run** — it floors all animations/transitions
  from first paint, which kills the FLIP animations that make track changes CLS-free, so the
  harness manufactures layout-shift findings. Such a run prints `PROBE-NEUTERED-MOTION` and stamps
  `motion-evidence=PROBE-NEUTERED-MOTION` on the RESULT line. Take motion/CLS receipts WITHOUT `--probe`.
- **`__orb.motion()` carries THREE CLS totals; the budget gates on the third.** `cls` (the CWV spec
  metric) · `virtualizedCls` (the share the instrument classified as virtual-row reconciliation) ·
  `nonVirtualizedCls` = the budgeted remainder. A long transcript's `cls` is dominated by the message
  list settling on mount (~0.26 measured), which no app fix can move — so cite all three and judge
  `nonVirtualizedCls`. `pnpm snap --motion` prints them labeled and fails only on the non-virtualized
  one (`cls-raw` / `cls-virtualized` / `cls-non-virtualized` on its RESULT line).
- **Two scroll containers, two different lists** — `[data-slot=virtual-list-scroll]` is the SIDEBAR
  chat list (`packages/ui/src/primitives/virtual-list/virtual-list.tsx:158`); the TRANSCRIPT's
  scroller is `[data-slot=message-list-scroll]`
  (`packages/ui/src/primitives/message-list/message-list.tsx:421`). A whole virtualizer finding was
  once minted entirely off confusing the two — name the slot you mean.
- **`--json` is the lossless record** — the terminal console view caps at 200 messages
  (errors/warnings prioritized); the manifest keeps everything. Cite it whenever the terminal view
  was capped, and prefer it as the durable receipt for a red run.
- **`--filmstrip` is the transition-eye path** — it records the existing exact page from before the
  argv action tape through bounded settle, then writes a labelled PNG contact sheet. Its timestamps and
  action labels make the result readable without extracting video. It refuses motion/perf/CPU/heap/trace
  arms because screencast encoding would contaminate their measurement. `pnpm record` no longer
  exists; `--filmstrip` is the only recording recipe.
- **`sandbox-trace-noise` is harness-induced, never an app finding** — Playwright tracing (snap's
  default failure evidence) injects its script into the app's deliberately script-dead sandboxed
  card frames; the resulting console error is excluded from the verdict but counted in the RESULT
  line. Do not file it; do not "fix" it.
- **Exit triage, in this order:**
  1. **exit 3 = misuse** — your invocation is wrong; nothing ran. Fix the `ARG ERROR` per
     `pnpm snap --help` and rerun.
  2. **exit 2 = tool error / refusal** — the instrument could not measure. Read the named reason;
     a dead/busy/foreign session, exhausted stage bands, absent evidence, or broken analyzer is never
     a product verdict.
  3. **exit 1 = the run went red** — read the RESULT line's axes (`nav`, `nav-actions-failed`,
     `steps-failed`, `assertion-fails`, `contrast-fails`, `eval-fails`, `console-errors`,
     `page-errors`), then the retained Playwright trace under `reports/traces/`. Navigation/action
     refusals land here; instrument/tool refusals use exit 2 — see §9 before retrying anything.
     **`nav=OK` no longer coexists with `nav-actions-failed>0`**: a run whose page loaded but whose
     `--goto`/`--open-chat` was rejected reads `nav=ACTIONS-FAILED`, because its captures describe a
     surface you never reached. (It printed `nav=OK` beside `nav-actions-failed=1` until 2026-08-16.)
  4. **exit 0 = clean.** The last stdout line is always `RESULT <tool> key=value …` — machine-
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
  The Snap motion/perf analyzers already pass the media query as "full motion" and STILL measured a frozen
  app. They compose; neither implies the other. Naming the wrong one is a wrong verdict, not a typo.
- **`--full-motion`** = `--appearance '{"reducedMotion":false}'` — the flag a motion sweep types.
- **`--appearance '<json>'`** deep-merges ANY appearance keys over the REAL settings response
  (`page.route` response shim, `tooling/src/_shared/appearance.ts`). Keys you name are pretended; every
  other key keeps the account's own value. **NOTHING IS WRITTEN** — no db row, no durable state, and the
  next flagless run sees the account again. Unparseable JSON or a non-object is misuse (exit 3).
- **`--appearance-preset <name>`** loads a curated profile from `tooling/src/_shared/appearance-presets.json`:
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
- Same three flags on the `pnpm snap --design-audit` / `--motion` / `--perf` arms — one vocabulary
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
  written. The same shim feeds `snap`, its motion/perf analyzers, and `design-audit`; `--json` records it
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
  for multi-step flows (wizard, settings walk, open-edit-save-reopen). `--scenario-summary` prints one
  compact `CHECKPOINT <name> PASS/FAIL` line each; pair with `--json` for the full evidence.
  Checkpoints cannot carry `--pages`/`--contexts`/`--as`/`--watch`/`--baseline`/`--diff`, cannot
  nest scenarios, and stage flags go on the OUTER command.
- **`--matrix`** = the rated PAIRWISE appearance-invariant matrix (16 representative cells derived from
  the live 36-axis Appearance carrier contract — theme × device × os-color × os-motion × contrast ×
  transparency × the app's own Appearance rows; never a Cartesian product, and no longer the old
  "8-variant desktop/mobile × light/dark × motion" sweep). Requires `--isolated`/`--dirty`/`--ref`; each
  cell is a disposable context in the one browser and gets its own report + `<out>-<variant>.png`. Read the
  plan receipt, not the cell count: `MATRIX PLAN … cells=N pairs-uncovered=M` — a non-empty
  `uncoveredPairs` is a stated hole in your sweep. Composes with `--scenario`; refuses
  `--pages`/`--contexts`/`--as`/`--watch`/`--baseline`/`--diff`. Its OS-motion axis is the media query;
  the app's own setting rides `--appearance`/`--full-motion` (§5b) across every cell.
- **`--watch <totalMs> [--every <ms>]`** = timed series after nav+steps settle: per-tick
  screenshot + a re-run of every `--eval`, labeled by elapsed ms. THE instrument for streaming
  turns and transient states. It observes PAGE 0 only; `--no-shot --watch` is the cheap
  state-series path (evals without minting dozens of PNGs).

### Multi-target identity boundary

- `--pages N` opens N tabs in one BrowserContext: cookies/localStorage are shared, DOM is per page,
  `@N` targets a page, and screenshots use `-pN`. It makes no user/context identity claim.
- `--contexts N` opens isolated fixture BrowserContexts in owner/member roster order: cookies/storage are
  separate, `@N` targets that context/user, and screenshots use `-uN`. It is a one-direction comparison,
  not an alternating multi-human script.
- Matrix creates disposable environment contexts for device/theme/media cells and preserves its owner;
  those contexts are not identities. For alternating host/member action choreography, use E2E with one
  explicit browser actor per human. Snap deliberately has no global actor-scheduler flag.

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

- **Hover-revealed targets** (group-hover kebabs, row toolbars): `--force-click` = hover-then-forced-
  click. Synthetic `--hover` LOSES `:hover` on any list re-render (a query settling, a row
  recycling) — the revealed controls vanish before the shot; prefer the focus path for
  reveal-state evidence.
- **Virtualized/composite rows** (message list, list panes — absolute inset rows in a scroll
  container): `--dom-click <css>` = raw in-page `el.click()`. `--click` with role locators FLAKES
  against them (actionability timeouts on selectors `--map` just printed). Reach for `--dom-click`
  first on any list-row target.
- **Virtualized row counts are VIEWPORT rows.** An `--expect-count` or eval against a virtual list
  asserts the mounted rows, not the dataset — get dataset truth from `__orb.queries()` or the
  `/api/_debug/db/*` endpoints instead.
- **Two staleness footguns:** `--map` names go stale across state changes — re-map FRESH against
  the settled surface right before targeting; and Base UI combobox accessible names flip
  label⇄value mid-transition — never reuse a pre-settle name.

## §8 The stage band

- `--isolated` (frozen HEAD worktree) / `--dirty` (working tree, re-syncs per call) acquire one
  allocator band; `--fresh` forces its rebuild. Stage when your drive window overlaps active lanes —
  a crash-looping dev Vite mid-drive is not a product finding.
- **The registry is repo-shared and multi-band.** `<main-checkout>/.cache/snap-stage/bands.json`, resolved
  through the git common dir, carries up to ten allocator rows. Band `k` owns server `8888 + 10k` and
  Vite `5273 + 10k`, plus checkout, ref/dirty identity, owner pid, age, sessions, and DB provenance.
  `--stage-status` shows the table from any checkout; `--stage-sweep` reaps dead/idle rows.
- Allocation prefers this checkout's matching row, then a same-SHA read-only shared reuse, then the
  lowest free/reclaimable band. A foreign dirty rebuild or a full table **REFUSES** (exit 2) naming
  owners and ages; it never kills an incumbent. `--stage-down` targets this checkout's rows by default;
  cross-checkout teardown requires `--stage-owner <checkout> --force`. Never hand-kill stage pids — that
  strands registry ownership instead of releasing the band.
- **Band occupied / need your own pair:** `scripts/dev/stack.sh` reads `VITE_PORT` and
  `VITE_API_TARGET` from env — boot a private stack on a free pair and point snap at it with
  `--base http://localhost:<vitePort>`.
- The multi-user fixture (`--contexts N` / `--as <handle>`) is a SIDECAR on its own pair
  (server :8790 / vite :5175, roster: `owner`, `member`). snap NEVER boots it — bringing it up
  (`pnpm fixture up`) is an operator call, and a down/mismatched fixture
  is a loud `FIXTURE REFUSED` with the exact remedy, never a silent fallback to the shared stack.

## §9 Refusals are answers; shared-stack manners

- **ARG ERROR (exit 3), NAV FAILED (exit 1), and every tool/instrument `*REFUSED` (exit 2) line are
  designed answers, not obstacles.** Each carries the reason and the remedy: an ambiguous title says pass the id; a down
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
