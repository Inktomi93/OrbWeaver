---
name: snap-driving
description: "Drive and verify the live Orbweaver app with `pnpm snap` and read what it produced: the run slot, run.json, the browser-free `--report` reader, the evidence cases, selector discipline, argv-ordered actions, picker affordances, room/session state, appearance and theme cases, scenario/matrix/watch recipes, virtualized targeting, isolated stages, and exit-code triage. Use when composing a snap invocation, reading a snap result or run.json, navigating to a section/room/modal, checking rendered behavior, watching streams or transients, diagnosing dead controls or NAV/ARG errors, or running multi-user and staged drives."
---

# Driving the app with snap

One Bash call, snap's own headless browser, evidence out; no MCP in the loop. The flag contract is
`pnpm snap --help`, generated from `tooling/src/snap/contract/help.ts` and
`tooling/src/snap/ops/flag-grammar.ts`; on disagreement the help wins. Worked chains:
`reference/recipes.md`. Every accepted flag, one line each: `reference/flags.md`, read it once at the
start of a drive. A lane reaching for the Chrome DevTools MCP instead of snap signals a missing snap
capability; file the gap.

## Read the output

1. **The first line is the run slot** (`run slot reports/runs/snap/<runId>`). Every artifact of that
   run lives inside it, immutable. `reports/snaps/<name>.png` and similar are mutable "latest"
   pointers a later run re-aims. Cite the slot.
2. **The end card is the verdict**: `RESULT snap key=value …` (`nav=`, `steps-failed=`,
   `assertion-fails=`, `contrast-fails=`, `console-errors=`, `page-errors=`, `population-verdict=`
   where a case has one), then `RUN <runId> checkout= sha= lane=`, then zero or more `FINDING <severity> | what | where | evidence=<path> confidence= completeness= | next=<exact command>`
   rows, then `PROVENANCE …` and `EVIDENCE <abs path to run.json>`. Read every `FINDING` row; each
   carries a copy-pasteable `next=` command narrowed to its case.
3. **Every structured line starts with an uppercase word at column 0** (`RESULT`, `ASSERT`,
   `CONTRAST`, `MAP`, `ARIA`, `FINDING`, `ARG ERROR`, `NAV ERROR`/`NAV FAILED`, `SESSION
   DEAD`/`SESSION BUSY`, `THEME SHIM WARNING` on stderr, `*REFUSED`, and more). Grep the prefix to pull
   what you need from a long log.
4. **Redirect every run to a log and read the log** (CLAUDE.md, "Read the harness artifacts" applies
   to a snap run too):

   ```bash
   pnpm snap / --goto presets --map --text > "$SCRATCHPAD/<lane>-presets.log" 2>&1; echo "EXIT=$?"
   ```

   Pull structured lines with `grep -nE '^(RESULT|ASSERT|FINDING|CONTRAST|POPULATION|ARG ERROR|NAV)' <log>`.
5. **The durable evidence is `run.json`** (the `EVIDENCE`/`INDEX` path): the verdict, a typed fact per
   case (`snap-arm-<arm>-v1`: state `passed|failed|refused|withheld|load-suspect|absent|off` plus
   data), the artifact inventory, and the findings. Replay any run without a browser with `--report`/
   `--reports` (`reference/recipes.md` "Read a finished run without a browser"); neither starts a
   browser, stage, session, or run slot.
6. **Exit codes triage first:** `0` clean · `1` red (a finding, a failed assertion, a failed step, a
   console error) · `2` refusal/tool error, the instrument could not measure, never a product verdict ·
   `3` misuse, argv is wrong, the `ARG ERROR` line names the fix. A rate measured under load is exit
   `0` with a `load-suspect` label on the case; read it as evidence, never as a verdict.

Every case is a typed fact in `run.json`: what it answers and what it refuses to combine with is
`reference/recipes.md` "The evidence cases" — read it once alongside `reference/flags.md`.

**Preconditions.** Dev stack up: `pnpm stack status`, `pnpm stack start` (server `:8788`, vite
`:5173`). A hanging snap or an instant nav error usually means the stack is down. Navigation is client
state, not a URL: the router accepts `/` and `/login`, plus a `/$section` deep-link alias that
redirects to `/` before it renders, so the browser URL only ever settles at `/` or `/login`. "Go to X"
means `--goto <section|config:<group>|modal:<slot>>` / `--open-chat` / `--open-character` /
`--context-tab`, never a URL path. Artifacts land under `reports/` (gitignored); a run writes inside
its own slot and publishes `reports/snaps/<name>.png` and similar as mutable latest pointers. Cite the
slot's `run.json`.

## §1 One selector engine per target

A selector is one engine: CSS, or `role=…`, or `text=…`. Never concatenate engines:
`[aria-label=x] role=button[name=y]` is a parse error, not an AND. Combine with Playwright's
`:has()`/`>>`, or pick one engine.

**Discover destinations and controls with `--map`, never by grepping source.** It prints executable
`--goto`/`--context-tab`/`--open-chat` recipes, the current shell topology, and named landmarks and
controls with a unique locator and actionability. Scope with `--map '<selector>'`. Role-scoping beats
text when names repeat (a topbar chip and a menu item; a list row and its context-panel echo): prefer
the testid/role selector `--map` printed, or scope with `:has()`. `--map`'s accessible name is a
discovery aid, not the truth: its textContent fallback double-counts hidden hover-reveal text. The
real accessible name comes from `--aria`. `--include-hidden` is only an attached-DOM inventory; hidden
rows are not live click handles.

## §2 The action queue is true argv order

Nav flags, interaction steps (`--click`/`--fill`/`--force-click`/`--dom-click`/`--key`/`--wait-for`)
and `--eval` execute as one queue in the order written. The pure captures
(`--map`/`--aria`/`--contrast`/`--expect-*`) are not in the queue: they observe the settled surface
once, after the queue drains, so one call reaches and inspects:

```bash
pnpm snap / --goto modal:newChat --click 'text=Blank chat' \
            --open-chat current --context-tab members --text
```

A trailing `--eval` observes the settled surface; one written earlier runs where it is written.
**`--key` has two forms and only one walks.** `--key Tab` (bare, no `=`) presses the page keyboard
without changing focus; N of them walk N stops, a Base UI focus trap included. `--key
'selector=Key'` focuses the selector then presses (`--fill 'input=q' --key 'input=Enter'`), so
repeating it re-anchors and never walks. End a dialog walk on `--key Escape`, never Enter (Enter
dismisses, and in an editor it saves).

**`--fill` takes an engine selector.** `--fill 'role=textbox[name="Content"]=a line'` works: the pair
splits at the `=` that ends an engine name (`role=`/`text=`/`css=`/`nth=`), so the engine form is part
of the selector, not the value; `:nth-match(textarea, 2)=value` names a field with no other handle. A
one-shot call owns one browser lifetime; chain a short interaction in argv order or use `--scenario`,
or use a named `--session` when driving must continue across calls (§4).

## §3 Two-stage affordances: a "dead button" is usually a menu

Guided/parameterized controls open picker menus as their first stage, for example the composer's
guided cluster and speak-as picker (`packages/client/src/features/chat/components/`). A click that
"does nothing" in the shot usually opened a menu the capture missed: **capture `--aria` (or `--map
'[role=menu]'`) after the click before concluding anything is dead.** Only when the post-click aria
shows no menu/dialog/popup and no state change is "dead control" a real finding.

## §4 Rooms and state: one-shot, scenario, or named session

Bare snap is one-shot; named snap is stateful. A call without `--session` boots a fresh browser, so
create-and-act stays in one argv chain or `--scenario`. `--session <name>` boots one private browser
and later calls drive the live page without re-navigation when no route is given. Browser-lifetime
flags (`--base`/stage, viewport/device, appearance/theme, storage, pages, throttling) belong on the
boot call; later attempts refuse as misuse (exit 3). Export session-lifetime rings, HAR, and trace with
`--session-export <name>`.

`--open-chat`: an id always works; an exact title works unless ambiguous (loud refusal, pass the id);
`latest` is the chat list's top row; `current` is the room the app is showing right now via the dev
bridge, no list query in the path. **After creating a room in the same chain, use `current`, never
`latest`**: a just-created unsent room is unlisted until the chat-list query refetches, so `latest` can
name a different chat; `current` refuses loudly when no room is open.

Seed a persisted store before navigation with `--local-storage 'key={json}'` (first `=` splits; values
are JSON).

## §5 The evidence ladder: text first, assertions as evidence, pixels last

- **`--text` / `--aria [selector]` first**: cheaper than a PNG and greppable. Fall to pixels only when
  something looks off; `--shot-of <sel>` is the cheapest pixel path.
- **Assert with `--expect-*` instead of hand-rolled evals**: `--expect-visible`, `--expect-text <sel=text>`, `--expect-count <sel=N>`, `--expect-url`, `--expect-no-overflow`, `--expect-focus`.
  Each prints an `ASSERT … PASS/FAIL` line and folds into the exit code.
- `--eval` auto-invokes a bare function literal: pass `'()=>{…; return x}'` with no trailing `()`;
  `'(()=>{…})()'` double-invokes and throws. The result is capped, both ends kept, middle elided behind
  `[TRUNCATED …]`. A probe that plants styles must inject a `<style>` tag with `!important`, never
  `element.style`; a React re-render reverts inline style before the capture phase runs.
- `--contrast` measures the first in-viewport match, not the first DOM match, and refuses a verdict
  (`OFF-SCREEN … NO VERDICT`, red exit) when every match is off screen. `--crop` reports its path
  (`crop=<path>` on the `RESULT` line) even when the main PNG path looks unchanged.
- `--scale <css|device|n>`: the css default is one image pixel per CSS pixel, half the image tokens on
  a hi-dpi context; raise it only for a human reader. `--mobile` and `--viewport` compose. Read the
  `RESULT` line's `device=<pointer>:dpr<n>:<WxH>` token before trusting any geometry number.
- `--probe` voids every motion/CLS number in the run: it floors animations from first paint, which
  kills the FLIP transitions that keep track changes CLS-free, so the harness manufactures
  layout-shift findings (`PROBE-NEUTERED-MOTION` on the run). Take motion/CLS evidence without it.
  `__orb.motion()` carries three CLS totals: `cls` (the CWV metric), `virtualizedCls` (virtual-row
  reconciliation), and `nonVirtualizedCls` (the budgeted remainder the budget gates on).
- Two scroll containers, two different lists: `[data-slot=virtual-list-scroll]` is the sidebar chat
  list, `[data-slot=message-list-scroll]` is the transcript. Name the slot you mean. `--json` is the
  lossless record; the terminal console view caps at 200 messages.
- `--filmstrip` records the page from before the action tape through bounded settle as a labelled PNG
  contact sheet; it refuses motion/perf/CPU/heap/trace cases since screencast encoding would
  contaminate their measurement. `sandbox-trace-noise` on the `RESULT` line is harness-induced, never
  an app finding: Playwright's own tracing script trips in the app's script-dead sandboxed card frames.
- A red run (exit 1) is read off the `RESULT` line's `nav`/`steps-failed`/`assertion-fails`/
  `contrast-fails`/`console-errors`/`page-errors` axes, then the trace under `reports/traces/`. A
  `data-app-ready=degraded` readiness is a NAV ERROR: the capture is mid-hydration, rerun it.

## §5b Appearance and theme: the account state is one case, not the default one

The dev account stores its own appearance choices (density/elevation/texture/typography, possibly
`reducedMotion`), and the owner changes them over time. Probe the state at drive start (`--eval` the
settings response, or read `<html data-reduced-motion>`) and state which state the evidence used.
`--reduced-motion` emulates the OS media query (`prefers-reduced-motion`); `--full-motion` (=
`--appearance '{"reducedMotion":false}'`) shims the app setting. They compose; neither implies the
other.

`--appearance '<json>'` deep-merges keys over the real settings response
(`tooling/src/_shared/appearance.ts`); untouched keys keep the account's own value.
`--appearance-preset <name>` loads a named profile from `tooling/src/_shared/appearance-presets.json`
(that file is the one home for a new curated preset). `--appearance` composes over a preset (later
keys win); an unknown name is `ARG ERROR`. A motion/visual verdict owes both the bare run and
`--full-motion` / `--appearance-preset maximal`.

`--theme <name|id>` is a separate axis (`config.theme.selectedThemeId`), same non-mutating shim;
`--theme none` = no selection. A typo prints `THEME SHIM WARNING` on stderr with the real list and
renders your theme anyway. Take a theme case on a non-carried surface (Home, Configuration): inside a
chat room whose card carries a theme, `<html>` has no `data-theme` and the room's `ThemeScope` governs
by design. `--dark`/`--light` emulate the OS color scheme, `--appearance` is the app's appearance
settings, `--theme` is the palette selection: three composing axes. `--file` and scenario checkpoints
refuse all three; the shim goes on the outer call of a scenario.

## §6 Scenario, matrix, watch (recipes: `reference/recipes.md`)

`--scenario <file.json>` runs sequential checkpoints in one browser lifetime (`{name?, defaults?,
checkpoints:[{name, args}]}`). A checkpoint on the same url keeps the live page, so client state
carries: the instrument for multi-step flows. `--scenario-summary` prints one `CHECKPOINT <name>
PASS/FAIL` line each; pair with `--json`. Checkpoints cannot carry
`--pages`/`--contexts`/`--as`/`--watch`/`--baseline`/`--diff`, cannot nest, and stage flags go on the
outer command.

`--matrix` runs the rated pairwise appearance-invariant matrix, derived from the live Appearance
carrier contract (theme × device × os-color × os-motion × contrast × transparency × the app's own
Appearance rows), never a Cartesian product. Requires `--isolated`/`--dirty`/`--ref`. Read the plan
line, not the cell count: `MATRIX PLAN … cells=N pairs-uncovered=M`; a non-empty `uncoveredPairs` is a
stated hole. Composes with `--scenario`; refuses the same flags as scenario. Verified by
`tests/tooling/snap/ops/session-matrix.suite.int.test.ts`.

`--watch <totalMs> [--every <ms>]` runs a timed series after nav and steps settle: per-tick screenshot
plus a re-run of every `--eval`, labelled by elapsed ms, page 0 only. `--no-shot --watch` is the cheap
state-series path.

**Multi-target identity:** `--pages N` opens N tabs in one BrowserContext (shared cookies, `@N` targets
a page, shots use `-pN`), no identity claim. `--contexts N` opens isolated fixture BrowserContexts in
owner/member roster order (`@N` targets that user, shots use `-uN`), a one-direction comparison. For
alternating host/member choreography, use E2E with one explicit actor per human.

`--cpu-throttle <n>` / `--network <slow-3g|fast-3g|slow-4g|fast-4g|offline>` apply CDP throttling to
every page before it navigates (echoed as `throttle=cpu:4x/net:slow-4g` on the `RESULT` line). A
layout shift within 500ms of a real click carries `hadRecentInput: true` and is excluded from CLS, so
an unthrottled reading says nothing about the margin; only `--click` reproduces the exclusion, a
synthetic `el.click()` never sets it. 4x CPU plus 3G/4G never reaches `data-app-ready` on the dev
build; use a production build or `--file` for the network case. A bad rate refuses at parse (exit 3).

## §7 Hover-reveal vs virtualized rows

`--click` is a mouse dispatch even under `--mobile`: it fires `pointerenter`/`mouseover` and can open a
hover-only tooltip no finger could reach. `--tap <sel>` is a real touch tap (requires `--mobile`) and
fires none of those. For hover-revealed targets (group-hover kebabs, row toolbars), `--force-click`
hovers then force-clicks; synthetic `--hover` loses `:hover` on re-render, so prefer the focus path for
reveal-state evidence.

For virtualized/composite rows (message list, list panes), `--dom-click <css>` (raw in-page
`el.click()`) is the answer; `--click` with role locators flakes against them. `--wheel-burst` must go
the direction that unpins the list, since firing the direction a list is already pinned to records zero
blocking work and reads clean. An `--expect-count` or eval against a virtual list asserts mounted rows,
not the dataset; get dataset truth from `__orb.queries()` or `/api/_debug/db/*` instead. Two staleness
traps: `--map` names go stale across state changes, and Base UI combobox accessible names flip
label/value mid-transition.

## §8 The stage band

`--isolated` (frozen HEAD worktree) / `--dirty` (working tree, re-syncs per call) acquire one allocator
band from the repo-shared registry (`<main-checkout>/.cache/snap-stage/bands.json`); `--fresh` forces a
rebuild. Stage when a drive window overlaps active lanes. Band `k` owns server `8888 + 10k` and Vite
`5273 + 10k`; `--stage-status` shows the table, `--stage-sweep` reaps dead/idle rows. A foreign dirty
rebuild or a full table refuses (exit 2) naming owners and never kills an incumbent. `--stage-down`
targets this checkout's rows; cross-checkout teardown needs `--stage-owner <checkout> --force`. Never
hand-kill stage pids; that strands registry ownership instead of releasing the band. When the band is
occupied and you need a private pair, point snap at a private stack with `--base
http://localhost:<port>`.

The multi-user fixture (`--contexts N` / `--as <handle>`) is a sidecar on its own pair (server `:8790`
/ vite `:5175`, roster `owner`, `member`). snap never boots it; `pnpm fixture up` is an operator call.

## §9 Refusals are answers; shared-stack manners

`ARG ERROR` (exit 3), `NAV FAILED` (exit 1), and every tool/instrument `*REFUSED` (exit 2) line is a
designed answer, not an obstacle: each carries the reason and the remedy. Follow the remedy; never
route around a refusal or retry the identical command.

`:5173`/`:8788` is the owner's live stack: read-only unless the task is itself a dogfood turn. The
restart/stop rule for the stack, the fixture, and the engines is in `skills/lane`; it binds a drive
too. Never reseed the dev DB mid-session; stage when in doubt about writes. Stage db provenance:
`rules/instruments.md`. A "the seeded chat is gone" report on a stage usually means the dev db changed
after the stage was built.
