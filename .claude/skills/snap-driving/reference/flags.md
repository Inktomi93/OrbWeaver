# Every snap flag, one line each (hand-indexed from `pnpm snap --help` on 2026-09-04)

`pnpm snap --help` is the CONTRACT (400+ lines, generated from the executable registry). This file is the
index a cold agent reads ONCE so it never has to scroll that help: every accepted flag, what it does, what
it refuses to combine with. When the two disagree the help wins; regenerate from it (recipe at the bottom).

Shape legend: `[@N]` = page/context-targetable (`--click@1`); `[x]` optional value; `<x>` required value.
Exit codes everywhere: `0` clean · `1` red (a finding, a failed assertion, a failed step, a console error)
· `2` REFUSAL / tool error (the instrument could not measure — never a product verdict) · `3` misuse (your
argv is wrong; nothing ran; the `ARG ERROR` line names the fix).

## Where (route, file, stage, base)

| Flag | What it does |
| - | - |
| `[route]` positional | the app route to load — the app has TWO url routes (`/`, `/login`); everything else is client state reached with `--goto`/`--open-chat`/`--open-character`/`--context-tab` |
| `--file <html>` | render a static HTML file (a committed mock) through the same instruments; nav flags, appearance/theme shims and `__orb` are refused there (no bridge) |
| `--base <url>` | an already-running origin (a private stack, a stage you booted). Conflicts with the stage flags — two answers to "where" refuse |
| `--isolated` | boot/reuse snap's ISOLATED STAGE: a detached worktree at HEAD served on an offset port pair with its OWN db (the dev stack is never touched) |
| `--dirty` | stage the WORKING TREE instead of a commit (re-syncs per call; implies `--isolated`) |
| `--ref <sha\|branch\|tag>` | pin the isolated stage to a commit (implies `--isolated`; survives a merge train). A ref this checkout cannot resolve is misuse, never a silent fallback |
| `--fresh` | rebuild the stage instead of reusing the warm one (implies `--isolated`) |
| `--stage-status` | the shared stage-band table: owner · checkout · ref · age · sessions · db provenance |
| `--stage-down` | tear down THIS checkout's stages (`--stage-owner <checkout> --force` for another owner's band — it kills that checkout's run) |
| `--stage-owner <checkout>` | names the owner for a cross-checkout `--stage-down` |
| `--stage-sweep` | reap stages idle past the TTL + prune orphan dirs |
| `--force` | the confirmation half of `--stage-down --stage-owner` and `--session-close` on a live foreign session |
| `--fixture-server <origin>` / `--fixture-base <origin>` | the multi-user FIXTURE stack's server/vite origins (env fallback) — used by `--contexts`/`--as` |
| `--debug-token <token>` | seed `orb:debug-token` before navigation for token-gated development routes |
| `--local-storage <key=json>` | seed localStorage BEFORE navigation (zustand-persisted prefs; first `=` splits, value is JSON) |

## Reach (the ordered action tape — nav, steps and `--eval` run in TRUE argv order)

| Flag | What it does |
| - | - |
| `--goto [@N] <section\|settings:<cat>\|modal:<slot>>` | SPA navigation through `__orb.nav` — a section id (`presets`), a settings category, or a modal slot. Unknown target = loud refusal (exit 1, `nav=ACTIONS-FAILED`) |
| `--open-chat [@N] <id\|exact title\|latest\|current>` | open a room. `latest` = the chat list's top row; `current` = the room the app shows RIGHT NOW (the one to use after creating a room in the same chain); an ambiguous title refuses — pass the id |
| `--open-character [@N] <id\|name>` | Characters section + select (same ambiguity refusal) |
| `--context-tab [@N] <tab>` | switch the context panel's tab |
| `--panel [@N] <name>=<docked\|overlay\|collapsed>` | drive one shell pane's layout mode (also the docked↔collapsed FLIP transition) |
| `--panels <preset>` | a NAMED pane configuration in one flag: `both-docked` \| `list-only` \| `context-only` \| `focus` (`tooling/src/_shared/panel-presets.json` is the one home; a later `--panel` composes over it) |
| `--focus [@N] <on\|off>` | the shell's zen/focus-mode toggle |
| `--click [@N] <selector>` | real Playwright click (actionability-checked). FLAKES on virtualized list rows — use `--dom-click` there |
| `--dom-click [@N] <selector>` | in-page `el.click()`, bypasses actionability — THE click for virtualized/composite rows |
| `--force-click [@N] <selector>` | hover-then-forced pointer click for hover-revealed / overlaid controls |
| `--hover [@N] <selector>` | synthetic hover (LOSES `:hover` on any list re-render; prefer the focus path for reveal-state shots) |
| `--fill [@N] <selector=value>` | type into a field; the selector may be an engine form (`role=textbox[name="X"]=value`) |
| `--key [@N] <Key>` / `--key <selector=Key>` | bare form presses the page keyboard WITHOUT re-focusing (N of them WALK N focus stops — the keyboard-walk idiom); the `selector=` form focuses first, then presses (the commit idiom: `--fill 'input=q' --key 'input=Enter'`). End a dialog walk on Escape, never Enter |
| `--wait-for [@N] <selector\|text=phrase>` | wait for a selector, or rendered text (`text=`; a bare phrase is REFUSED as a type-selector chain) |
| `--wait <selector>` | after app readiness, require this selector to become visible before anything else runs |
| `--upload [@N] <selector=path[,path…]>` | choose file(s) through an input or a trigger's filechooser; repo/tmp paths only; a directory only for `webkitdirectory` inputs |
| `--drop-files [@N] <selector=path[,path…]>` | dispatch dragenter/dragover/drop with a real DataTransfer (a dropzone's distinct feeder) |
| `--pause [@N] <ms>` | an ordered pause in the tape (NOT a measurement window). `--settle` is the retired design-audit spelling of this |
| `--wheel [@N] <selector=dy>` / `--wheel-burst [@N] <selector=dy:count>` | one ordered wheel input / repeated wheel inputs with a 30ms tick |
| `--stream-settle <seconds>` | fixed post-drive settle for a streaming surface |
| `--idle` | bounded network-idle settle instead of the default fixed mount settle |
| `--checkpoint` | reset `__orb` evidence after readiness; console/page-error verdicts scope to the actions (boot noise retained in the manifest, split out as `boot-console-warnings`) |
| `--pages <N>` + `@N` suffixes | N tabs in ONE browser context (shared cookies, independent DOM); `--fill@0`, `--eval@1`; shots suffix `-pN`. No user identity claim |
| `--contexts <N>` + `@N` | N ISOLATED fixture users (owner, member) in separate contexts; one-direction comparison, never an alternating multi-human script. Requires the fixture stack UP (`pnpm fixture up` — snap never boots it) |
| `--as <handle>` | one named fixture user |
| `--scenario <file.json\|preset>` | sequential checkpoints in ONE browser lifetime (`{name?, defaults?, checkpoints:[{name,args}]}`); presets: `appearance-chat` \| `appearance-shell-config` \| `orb-app` \| `rpg-game` |
| `--scenario-summary` | one `CHECKPOINT <name> PASS/FAIL` line per checkpoint (pair with `--json`) |
| `--watch <totalMs>` / `--every <ms>` | after nav+steps settle: per-tick screenshot + re-run of every `--eval`, labelled by elapsed ms (page 0 only; `--no-shot --watch` = evals only) |

## Look (pure captures — observe the SETTLED surface after the tape drains)

| Flag | What it does |
| - | - |
| `--map [@N] [selector]` | the global SPA destination atlas + the rendered surface map: every control as `role "name" → unique validated locator` with actionability. RUN THIS FIRST on any surface; never grep source for a selector |
| `--include-hidden` | widen `--map`/CSS/counts to attached hidden/inert DOM — an INVENTORY of retained sections, locator-only, never a current click handle or a score |
| `--aria [@N] [selector]` / `--text [@N] [selector]` | the ARIA tree (Playwright's ariaSnapshot — the browser's own accessible names, the oracle for name questions); `--text` drops the primary PNG |
| `--aria-depth <n>` / `--aria-boxes` | cap the tree depth / annotate each node with its rendered box |
| `--eval [@N] <expression>` | any in-page JS → JSON (repeatable, IN the tape). Pass a bare arrow `'()=>{…; return x}'` with NO trailing `()`. Result capped at 20 000 chars keeping BOTH ends |
| `--contrast [@N] <selector>` | rendered WCAG contrast of that element's text vs its effective backdrop (first IN-VIEWPORT match; OFF-SCREEN/OCCLUDED = NO VERDICT, never a number). Known blind spot: a fixed painted layer under text reads clean on the CSS resolve — add `--contrast-pixel` on such surfaces |
| `--contrast-pixel` | force the framebuffer sample instead of the CSS resolve (requires `--contrast`) |
| `--cascade [@N] <selector=property>` | Chromium's computed value + the official Active/Overloaded declarations for one property (uses the debugging endpoint; not with `--lighthouse`) |
| `--no-deadcss` | skip the dead-class / empty-rule scan (ON by default and RED on findings) |
| `--diagnostics <query>` | print deduped structured browser diagnostics: `all` \| `level=error,source=network,category=cors,text=foo,page=0,window=current` |
| `--strict-console` | console WARNINGS go red too (errors are always red) |

## Assert (first-class receipts — each prints `ASSERT … PASS/FAIL` and votes on the exit code)

| Flag | What it does |
| - | - |
| `--expect-visible [@N] <selector>` | a rendered, visible element exists |
| `--expect-text [@N] <selector=text>` | rendered text contains the value |
| `--expect-count [@N] <selector=N>` | exactly N rendered matches (virtualized lists count MOUNTED rows, not the dataset) |
| `--expect-url [@N] <url-or-path>` | the final browser URL (only ever `/` or `/login` here — never a section) |
| `--expect-no-overflow [@N] [selector]` | scroll bounds fit client bounds AND no descendant box exits the clip on any side; a scrolling axis is not judged; canvas content is invisible to it |
| `--expect-focus [@N] <selector>` | the active element matches (pair with bare `--key Tab` walks) |

## Environment (device, OS media, the app's OWN settings — three different axes that compose)

| Flag | What it does |
| - | - |
| `--viewport <WxH>` | default 1280x800 (`--width` is NOT a flag and refuses as misuse) |
| `--wide` / `--desktop` | 1920x1080 / explicit 1280x800 |
| `--mobile` | iPhone 14 Pro Max: touch, `pointer: coarse`, DPR 3 — the ONLY honest tap-target arm; last of `--mobile`/`--desktop`/`--wide`/`--viewport` wins |
| `--dark` / `--light` | emulate the OS colour-scheme media query (axis 1) |
| `--reduced-motion` | emulate the OS `prefers-reduced-motion` media query (axis 1) — NOT the app's own setting |
| `--full-motion` | render with the APP's reduce-motion setting OFF (axis 2; = `--appearance '{"reducedMotion":false}'`) |
| `--appearance '<json>'` | deep-merge appearance keys over the real settings response (density, elevation, texture, typography…); NOTHING is written; composes over a preset |
| `--appearance-preset <name>` | curated profile: `defaults` \| `maximal` \| `compact` \| `reading` \| `diagnostics` (`tooling/src/_shared/appearance-presets.json` is the one home) |
| `--theme <name\|id>` / `--theme none` | render as if that theme were selected (axis 3: Hearth \| Mocha \| Light or any of the account's themes); `none` = no selection. An unknown name WARNS on stderr with the real list and renders YOUR theme — read stderr. Invisible inside a card-carried chat room by design |
| `--matrix` | the rated pairwise appearance-invariant matrix (16 cells derived from the live 36-axis carrier contract; requires `--isolated`/`--dirty`/`--ref`); read `MATRIX PLAN … cells=N pairs-uncovered=M`, not the cell count. Not an 8-variant sweep any more |
| `--cpu-throttle <n>` | CDP CPU throttle applied BEFORE navigation (4 = the standard "under load" arm; widens the drive budgets) |
| `--network <slow-3g\|fast-3g\|slow-4g\|fast-4g\|offline>` | DevTools network presets, applied before navigation. The DEV build cannot reach readiness under 3G/4G — this arm is for a PROD build or a `--file` fixture |

## Measure (the arms — each is its own typed fact in `run.json`; most refuse to combine with a profiler)

| Flag | What it does |
| - | - |
| app-snapshot (always on) | navigation timing + `window.__orb.snap()` overview on every settled app page; withheld under load/software rendering |
| `--motion [selector]` | one motion window (default 4x CPU throttle): LoAF, CLS (raw / virtualized / non-virtualized — the third is the budget), compositor-dirty animations, dropped frames. With a selector, one trusted native click inside the trace |
| `--motion-window <ms>` / `--motion-no-throttle` | window length (default 2500) / disable the throttle (headless drop rates stay advisory) |
| `--perf` | per-step LoAF/long-task attribution, EventTiming input delay, rAF gaps and CLS over the shared action tape — a METER (breaches are ranked evidence, never an exit vote); missing/withheld measurement refuses |
| `--perf-cycles <n>` | repeat the whole tape N times with stable step indexes (jank that repeats) |
| `--cpu-profile` | V8 sampling profile across the post-navigation tape (Chrome DevTools/speedscope artifact). Run it SEPARATELY from `--perf`/`--motion` |
| `--boot-trace` | Chromium tracing from before navigation; retains the raw trace; requires positive LCP + all six DevTools insight families |
| `--react-profile` | Snap's read-only React dev-renderer hook installed BEFORE mount: hottest component paths, full commit topology, render reasons, boundary/update evidence (session-level: put it on the boot call) |
| `--heap [@N] <label>` | force GC and capture the settled page's V8 heap + parsed sidecar (labels persist only inside one session/scenario browser context) |
| `--heap-compare [@N] <left=right>` | growth/detached findings between two labels or two snapshot paths — diagnostic, NEVER a size budget gate |
| `--heap-retainers [@N] <snapshot=selector>` | retaining paths, dominators, outgoing edges; selector = `@<node-id>` \| `detached` \| `class:<Name>` |
| `--lighthouse <desktop\|mobile>` | Lighthouse (accessibility + best-practices + seo) on THIS run's settled page; prints category scores + every failed audit with node count + first three selectors; `report.json`/`report.html` in the slot; findings RED (exit 1), a not-ready page / throw / truncated report REFUSES (exit 2). `mobile` fills the same device slot as `--mobile`; not with `--cascade` |
| `--lighthouse-mode <snapshot\|navigation>` | default `snapshot` audits the page as your tape left it; `navigation` RELOADS first and loses the drive |
| `--requests [url-substring]` | the ORDERED request log from the 4096-entry ring: method, url, status, type, sizes, timing (the value narrows PRINTED rows only) |
| `--request-body <url-substring>` | one matching JSON response body, retained whole up to 256 KiB (implies `--requests`) |
| `--filmstrip` | the transition eye: a labelled PNG contact sheet from before the tape through settle, one per page/context. REFUSES `--perf`/`--motion`/`--cpu-profile`/`--heap`/`--boot-trace` (encoding would contaminate them). `pnpm record` is retired |

## Pixels

| Flag | What it does |
| - | - |
| `--no-shot` | skip the primary PNG (the cheap evidence path with `--text`/`--eval`/`--watch`) |
| `--shot-of <selector>` | capture ONE element, auto-cropped — the cheapest pixel receipt |
| `--full` | the whole scrollable page, not just the viewport |
| `--crop <WxH+X+Y>` | a bounded region (its path prints as `crop=` on the RESULT line — not a no-op) |
| `--mask <selector>` | pink-overlay a volatile region so it cannot churn `--diff` (repeatable) |
| `--probe` | deterministic pixels: seeded probe mode + animations floored from first paint — VOIDS every motion/CLS number in the run (`PROBE-NEUTERED-MOTION`) |
| `--baseline` / `--diff` | save / compare a visual baseline (mutually exclusive; goldens land in `reports/baselines/`) |
| `--scale <css\|device\|n>` | image pixels per CSS pixel. DEFAULT `css` on purpose (half the image tokens for an agent reader) — raise it only for a human-read mock render; over 16 MP the run REFUSES |
| `--out <name\|path>` | name the run's published artifacts (`reports/snaps/<name>.png` etc.); inside a run everything still lives in the immutable slot |
| `--json` | write the machine-readable run manifest (the LOSSLESS console — the terminal view caps at 200 messages) |
| `--no-failure-evidence` | skip the Playwright trace a red run retains under `reports/traces/` (only when explicitly unwanted) |

## Read back (browser-free — these never start a browser, stage, session or run slot)

| Flag | What it does |
| - | - |
| `--report <run.json path\|run-id\|latest>` | replay one immutable run index: `RUN REPORT`, `VERDICT`, typed `FACT` rows per arm, `FINDING` rows (what \| where \| evidence \| exact next command), `ARTIFACT` rows, `INDEX`. Default `--problems`; `--all` for everything; narrow with `--arm <name>` (`perf` is the public spelling of interaction-perf) / `--channel` / `--level` / `--source` / `--category` / `--text` / `--page` / `--context` / `--window` |
| `--reports` | list every indexed run across registered worktrees: run id, checkout, sha, lane, verdict, time |

## Stateful sessions (ONE browser per lane, kept between calls)

| Flag | What it does |
| - | - |
| `--session <name> [where] [environment] [app settings] <route>` | BOOT call: a daemon holds the browser behind a socket. Browser-lifetime flags (`--base`/stage, `--viewport`/`--mobile`, `--dark`, `--appearance`, `--theme`, `--local-storage`, `--pages`, `--cpu-throttle`, `--react-profile`) go HERE and are refused later (exit 3) |
| `--session <name> [--goto …\|--click …\|--eval …\|--text\|--map\|--contrast …]` | LATER calls drive the LIVE page (no route = no re-navigation; a route or `--file` navigates). Every call is its own run slot + evidence window |
| `--session-ttl <min>` | boot only: idle TTL (default 30); cap 3 live sessions per box — the next boot exits 2 naming the live ones |
| `--session-status [name]` | every session of this repo: owner · pid · live/DEAD · idle · binding · endpoint |
| `--session-close <name> [--force]` | close a live session (a foreign LIVE one needs `--force`) or reap a dead one |
| `--session-sweep` | reap dead + idle-past-TTL sessions and orphan registry entries |
| `--session-export <name> [--out <base>]` | copy console/page-error/request rings + retained trace/HAR into this run's slot, published under `reports/sessions/<name>/` |
| `--vnc` | boot only: watch the daemon's browser |
| `--session-daemon <name>` | the daemon's own entry — spawned by snap, never typed |

Refusals you will meet on sessions: `SESSION DEAD` (exit 2, names the op it died in), `SESSION BUSY` (exit
2, one request at a time), a foreign-checkout call refused naming the owner. `--session` refuses
`--scenario`/`--contexts`/`--as`; `--matrix` on a session runs each cell in a disposable context.

## Maintainers only

| Flag | What it does |
| - | - |
| `--materialize-devtools-assets` | regenerate the pinned DevTools cascade SDK closure (networked; never in a normal run) |
| `--help` / `-h` | print the contract and exit 0 — redirect it to a file and Read the file; never pipe it into head/tail |

## Regenerate this file

```bash
pnpm snap --help > "$SCRATCHPAD/snap-help.txt"   # then Read the whole file (400+ lines) — never head/tail it
```

Diff the "Complete accepted flag grammar" block against the rows above; every accepted flag must have a row,
and a row's meaning comes from the section that documents it, never from a neighbouring flag on the same line.
