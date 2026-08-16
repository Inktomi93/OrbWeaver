#!/usr/bin/env tsx
/**
 * pnpm snap <route> [flags]        (tsx scripts/probes/snap.ts)
 *
 * The "stop staring at the browser through VNC" harness. Boots a headless
 * Playwright chromium against the running dev stack (`pnpm stack start` first),
 * navigates to <route>, and dumps a textual report (console + network + page
 * errors) to stdout plus a PNG to reports/snaps/<slug>.png. Shared plumbing
 * (argv idioms, artifact dirs, browser bootstrap, the RESULT line) lives in
 * scripts/probes/_kit/ — this file owns only snap's own capture logic.
 *
 * USAGE
 *   pnpm stack start                      # once; snap is then a fast loop
 *   pnpm snap /                           # screenshot the home route
 *   pnpm snap /debug --sse 5              # sit on the route 5s capturing events
 *   pnpm snap / --wait "[data-testid=home-chat-list]"
 *   pnpm snap / --full                    # whole scroll, not just viewport
 *   pnpm snap / --vnc                     # headed (when you DO want to look)
 *   pnpm snap /traces --debug-token $T    # seeds orb:debug-token so token-gated
 *                                          # routes render real data (defaults to
 *                                          # env DEBUG_TOKEN if set)
 *   pnpm snap / --click "[data-shell-toggle=drawer-right]" --out right-drawer
 *                                          # interact BEFORE the shot: --click/--hover/
 *                                          # --fill (repeatable, executed in argv order);
 *                                          # --out names the PNG (reports/snaps/<out>.png)
 *   pnpm snap / --press "[data-testid=recent-chats-row-kebab]"
 *                                          # hover-then-FORCED-click for hover-revealed
 *                                          # targets (group-hover kebabs, toolbars) and
 *                                          # Radix triggers failing actionability checks
 *   pnpm snap / --jsclick "[data-slot=list-row-body]"
 *                                          # RAW in-page el.click() — the fallback for
 *                                          # VIRTUALIZED rows (absolute inset-x-0 rows in a
 *                                          # scroll container): role=/actionability locators
 *                                          # FLAKE against them (timeouts on selectors --map
 *                                          # just printed); a plain CSS selector + raw click
 *                                          # is reliable. Reach for --jsclick, not --click, on
 *                                          # a message-list / virtual-list / composite row.
 *   SELECTOR ENGINES ARE STANDALONE — never concatenate them (`[aria-label=x] role=button[name=y]`
 *   is a CSS parse error, not an AND). One engine per selector: a CSS string, OR `role=…`, OR
 *   `text=…`. Combine conditions with Playwright's `:has()`/`>>` or pick the single best engine.
 *   pnpm snap / --ls "orb-draft:character={\"state\":{...}}"
 *                                          # seed localStorage BEFORE navigation
 *                                          # (repeatable; FIRST `=` splits — values are
 *                                          # JSON) — drive zustand-persisted prefs
 *                                          # without bespoke flags per store
 *   pnpm snap / --viewport 1920x1080      # default 1280x800 (--wide = 1920x1080)
 *   pnpm snap / --mobile                   # iPhone 14 Pro Max: 430x932 css, DPR3, TOUCH + mobile UA +
 *                                          # pointer:coarse — REAL device emulation, not a bare narrow
 *                                          # viewport. The app's progressive-disclosure law renders hover-
 *                                          # revealed controls ALWAYS-VISIBLE at coarse pointer, and the
 *                                          # rail flips to a bottom tab bar — a narrow viewport alone
 *                                          # misses both. scale:"css" keeps the DPR3 shot at 1px/css-px.
 *   pnpm snap / --desktop                  # explicit alias for the default 1280x800 (symmetric scripts)
 *                                          # --mobile/--desktop/--wide/--viewport share ONE slot: last wins.
 *   pnpm snap / --crop 360x500+920+0       # ALSO write <out>-crop.png (native
 *                                          # Playwright clip, WxH+X+Y — no ffmpeg)
 *   pnpm snap / --no-deadcss               # skip the dead-class scan (ON by default:
 *                                          # every DOM class token is checked against
 *                                          # the compiled CSSOM; a utility Tailwind
 *                                          # didn't generate — wrong token namespace,
 *                                          # typo'd variant — reports as DEADCSS)
 *
 *   TWO RECURRING FOOTGUNS (reviewers keep paying these — they cost real hand-verification rounds):
 *   • --hover loses :hover on a list RE-RENDER. Hovering a row to reveal its actions works, but if the
 *     list re-renders after the hover (a query settling, a virtualized row recycling), the synthetic
 *     :hover is dropped and the revealed controls vanish before the shot. Prefer the FOCUS path
 *     (Tab/--press to focus-within, which survives re-render) or drive TRUE hover via chrome-devtools MCP
 *     when you specifically need the :hover visual.
 *   • Base UI COMBOBOX accessible names flip label⇄value with timing. A combobox read mid-transition
 *     reports the option label where you expect the committed value (or vice-versa). Always re-run --map
 *     FRESH against the settled surface right before you target it — never reuse a name from an earlier,
 *     pre-settle map.
 *
 *   INTROSPECTION — the "stop dropping to the MCP browser" escape hatches. Run post-settle
 *   (after any --click/--fill/--wait-for steps), so a caller gets computed values / arbitrary
 *   DOM facts in the SAME Bash call that drove the interaction.
 *   pnpm snap / --eval 'document.title'    # run raw JS in-page (repeatable, argv order);
 *                                          # result is JSON-printed, capped ~2000 chars (a cap
 *                                          # is announced by a loud [TRUNCATED n/N] first line);
 *                                          # an in-page throw prints EVAL ERROR, continues capture,
 *                                          # and makes the final RESULT/exit non-zero.
 *                                          # A function LITERAL is auto-invoked — `async()=>{…}`
 *                                          # / `()=>{…}` run and return their result (no more
 *                                          # silent-undefined from an un-called async arrow).
 *                                          # An already-invoked arrow IIFE `(()=>{…})()` is left
 *                                          # alone; it is never mistaken for a bare function and
 *                                          # double-invoked.
 *   pnpm snap / --contrast 'label.field'   # WCAG AA contrast of the FIRST match's text/icon color
 *                                          # vs its resolved backdrop (repeatable). Each line states
 *                                          # its METHOD honestly: `css-resolve` (an opaque ancestor bg,
 *                                          # cheap) or `pixel-sample`. TRANSLUCENT backdrops (glass,
 *                                          # color-mix at <1 alpha) over an opaque ancestor are
 *                                          # alpha-COMPOSITED down before measuring (was a false-FAIL).
 *                                          # THE FALSE-FLAT BLIND SPOT IS FIXED: when the ancestor walk
 *                                          # hits NO opaque background (a fixed/sibling layer — the app's
 *                                          # ThemeBackgroundLayer photo, a scrim — paints behind, unseen
 *                                          # by a DOM walk) OR hits a background-IMAGE, the probe now
 *                                          # SCREENSHOTS the element's box and samples the real composited
 *                                          # pixels (perimeter ring → excludes the glyphs) instead of
 *                                          # fabricating a white baseline that passed 1.8:1 text over a
 *                                          # bright sky. A sample that can't be taken reports UNRESOLVED
 *                                          # (loud, reddens exit) — never a fake number. --contrast-pixel
 *                                          # forces the pixel path for every target (verify a css number).
 *                                          # Also fixed: when the app's bg-image is active ([data-has-bg-
 *                                          # image]), a backdrop resolved only at the opaque <body>/<html>
 *                                          # is DISTRUSTED (ThemeBackgroundLayer's fixed photo paints OVER
 *                                          # body) → pixel-sample. And ancestor OPACITY dims the reading:
 *                                          # the accumulated opacity product over the element+ancestors
 *                                          # composites the foreground onto the backdrop before the ratio
 *                                          # (a 40%-opacity actions row's icon reads ~11:1 raw, ~2.6:1 as
 *                                          # seen — the line tags `dimmed α0.40`).
 *                                          # ROLE/CONTENT-AWARE THRESHOLDS: a target with NO rendered text
 *                                          # (icon button, graphic) is judged as a UI COMPONENT (WCAG
 *                                          # 1.4.11, 3:1), not 4.5:1 text; a control-TRACK role (switch/
 *                                          # slider/progressbar/scrollbar) is SKIPPED with a reason — its
 *                                          # two states are the signal, not track-vs-page (killed the
 *                                          # 1.71:1 Switch false-FAIL). Text keeps 4.5:1 (3:1 large). Any
 *                                          # FAIL reddens the exit code. An EMPTY input/textarea is measured
 *                                          # at its ::placeholder color (not the invisible text color —
 *                                          # a placeholder that fails AA was a silent false PASS).
 *   pnpm snap / --map                      # live selector map of <body>'s interactive/labeled
 *                                          # elements — role, accessible name, and the BEST
 *                                          # stable selector to target it (testid > unique
 *                                          # ancestor testid > aria-label > role=X[name="Y"] >
 *                                          # fallback path); runs post-steps, so
 *                                          # `--click X --wait-for Y --map '[role=dialog]'`
 *                                          # maps a just-revealed surface, no source-grepping.
 *                                          # NB: --map's accessible NAME is a geometry/discovery aid, not
 *                                          # the truth — its naive textContent fallback double-counts
 *                                          # hidden hover-reveal text ("NNikonikoniko · 585"). For the
 *                                          # real accessible name use --aria (Playwright's ARIA snapshot).
 *
 *   TEXT PATH — structure as text, ~5–8× cheaper than a PNG and greppable.
 *   Reach for this FIRST; fall to pixels only when something looks off.
 *   pnpm snap / --aria                    # ARIA tree (roles/labels/text) of <body>
 *   pnpm snap / --aria "[data-testid=home-chat-list]"   # scope to a subtree
 *   pnpm snap / --aria --aria-depth 4      # cap tree depth on deep routes
 *   pnpm snap / --aria --aria-boxes        # append [box=x,y,w,h] viewport geometry
 *   pnpm snap / --text                     # = --aria --no-shot: structure only, ZERO
 *                                          # image tokens (the cheapest verification)
 *   pnpm snap / --no-shot                  # skip the PNG; keep the textual report
 *                                          # (--baseline/--diff still force a shot)
 *
 *   IMAGE PATH — every shot is auto-stabilized (animations off, caret hidden,
 *   scale=css → ~half the tokens on hi-dpi). Native, no probe-mode needed.
 *   pnpm snap / --shot-of "[role=dialog]"  # screenshot ONE element, auto-cropped —
 *                                          # the no-pixel-math crop, cheapest pixels
 *   pnpm snap / --mask "[data-testid=msg-timestamp]" --mask ".avatar"
 *                                          # pink-box volatile regions so --diff is
 *                                          # stable without app-side probe mode
 *   pnpm snap / --dark                     # emulateMedia colorScheme (also --light)
 *   pnpm snap / --reduced-motion           # emulateMedia reducedMotion:reduce
 *   pnpm snap / --idle                     # settle on networkidle (bounded 10s)
 *                                          # instead of a fixed timeout
 *
 *   VISUAL BASELINES (probe mode + ffmpeg SSIM — no extra deps):
 *   pnpm snap / --probe --out home --baseline   # deterministic shot saved to
 *                                               # reports/baselines/home.png (gitignored)
 *   pnpm snap / --probe --out home --diff       # fresh shot vs the baseline: SSIM score +
 *                                               # difference heatmap (<out>-diff.png);
 *                                               # exits 1 below SSIM 0.98 so it's CI-able.
 *   --probe = seed orb:probe-mode (freezes relative-time labels app-side —
 *   packages/client/src/lib/probe-mode.ts) + inject CSS killing all animations/
 *   transitions/carets harness-side.
 *   ffmpeg: NOT in the dev container until a Dockerfile rebuild — --diff then prints a
 *   skipped-with-reason line and exits non-zero (a requested comparison produced no evidence).
 *   FFMPEG_BIN env overrides.
 *
 *   SPA NAVIGATION — the app has only 2 URL routes (/, /login); every surface is CLIENT STATE. Instead of
 *   click-chaining to a section, drive the app's dev nav bridge (window.__orb.nav) directly. These run
 *   BEFORE the regular --click/--fill steps (and before captures), so one call reaches AND inspects a
 *   surface. Each FAILS the run loudly (reddens exit, prints NAV FAILED) on a bad id or a missing bridge —
 *   never a silent no-op.
 *   pnpm snap / --goto presets --map        # switch the rail to a section, then map it — no click chain
 *   pnpm snap / --goto settings:appearance --aria   # open Settings on a category (settings:<category>)
 *   pnpm snap / --goto modal:theme --shot-of '[role=dialog]'   # open a rail modal (modal:<slot>)
 *   pnpm snap / --open-chat "My Chat Title" --text  # make a chat active by id OR exact display title
 *                                          # (resolves against the chat-list query cache, fetching it if
 *                                          # cold). REFUSES loudly (NAV FAILED, exit 1) on an AMBIGUOUS title
 *                                          # matching >1 chat — pass the chat id to disambiguate.
 *                                          # --goto target ∈ section id | settings:<cat> | modal:<slot>.
 *   pnpm snap / --open-chat latest --text   # POSITIONAL: "latest" (or "first") opens the chat list's TOP
 *                                          # row — newest-updated-first, i.e. the most recent chat — so a
 *                                          # caller stops needing an id/title to reach "the chat I was just
 *                                          # in". Reserved words: a chat literally titled "latest" is
 *                                          # reachable by its id. Refuses on an empty chat list.
 *   pnpm snap / --open-character Rev --aria # switch to Characters + select a character by id OR name
 *                                          # (resolves against character.list). Same ambiguity refusal:
 *                                          # a name matching >1 character is rejected — pass the id.
 *   pnpm snap / --context-tab members       # ask the active surface's context panel to open a named tab
 *
 *   WATCH SERIES — `--watch <totalMs> [--every <ms>]` (default --every 1000). After nav+steps settle,
 *   observe PAGE 0 over time: every tick a screenshot (<out>-t<elapsed>.png) AND, if --eval exprs were
 *   given, a re-run of them labeled with elapsed ms. Watch a streaming turn reflow between speakers or
 *   catch a transient state (a raw speaker-tag prefix mid-stream) without eyeballing MCP shots one call at
 *   a time. RESULT gains watch=N-ticks + watch-fails=N; the tick artifacts + eval lines print under
 *   --- WATCH ---. Any failed tick screenshot/eval makes the final exit non-zero.
 *   pnpm snap / --open-chat <id> --watch 5000 --every 500 --eval 'document.querySelectorAll("[role=article]").length'
 *
 *   MULTI-PAGE — `--pages <N>` opens N tabs in ONE browser context (shared auth/localStorage), all on the
 *   route. Target a tab with a `@<idx>` suffix on any step/capture flag (`--click@0`, `--eval@1`,
 *   `--aria@1`, `--goto@1 chats`); unprefixed = page 0. Drive one tab and read the passive tab (does it
 *   flash / jump / reflow when the other sends?). Shots suffix `-p<idx>`; the report gets a per-page
 *   section; RESULT gains pages=N.
 *   pnpm snap / --pages 2 --open-chat@0 <id> --open-chat@1 <id> --fill@0 '[data-testid=composer]=hi' \
 *               --key@0 '[data-testid=composer]=Enter' --eval@1 '__orb.bus().live'
 *
 *   MULTI-USER CONTEXTS — `--contexts <N>` (2..4) opens N ISOLATED browser contexts (own cookies/
 *   localStorage each — unlike --pages tabs, which share ONE context's auth), each logged in as a
 *   DIFFERENT dev user, so host-vs-member views / presence / visibility-floors can be captured in one
 *   run. This ALWAYS targets the multi-user FIXTURE stack (scripts/dev/multi-user-fixture.sh), NEVER the
 *   shared :5173/:8788 dev stack (which is always AUTH_MODE=single-user — one user, no login form,
 *   nothing to authenticate AS). The auth door is the real one a browser uses: `POST /api/auth/login`
 *   (handle+password → the session cookie), seeded into each context BEFORE its first navigation — never
 *   a bypass. THE FIXTURE IS A SIDECAR (2026-08-03, replacing the old honesty note): it boots on its OWN
 *   OFFSET PAIR — server :8790 / vite :5175 — with its own db, assets and stack pidfile, so it runs
 *   ALONGSIDE the owner's dev stack instead of instead-of it. --contexts is therefore usable with the dev
 *   stack up; snap probes the fixture's health AND navigates its vite origin through ONE resolved target
 *   (scripts/probes/_kit/fixture.ts), so an override reaches both halves — the old bug was
 *   SNAP_FIXTURE_SERVER_URL being read by neither. Override with `--fixture-server <origin>` /
 *   `--fixture-base <origin>` (or env SNAP_FIXTURE_SERVER_URL / SNAP_FIXTURE_BASE_URL) when the fixture was
 *   booted on a different pair (FIXTURE_PORT/FIXTURE_VITE_PORT). The fixture's roster is fixed at 2 dev
 *   users today (owner, member — its own header
 *   docstring); `--contexts N` assigns them in that order. Target a context with the SAME `@<idx>` suffix
 *   --pages uses (unsuffixed = context 0); shots suffix `-u<idx>` (distinct from --pages' `-p<idx>`, so
 *   the two never collide); RESULT gains contexts=N + users=<handles>. Combining `--contexts` with
 *   `--pages` is refused (an unexercised combination, not silently under-tested). Context mode also
 *   refuses --watch/--baseline/--diff until those operations have explicit per-context semantics.
 *   pnpm snap / --contexts 2 --eval@0 '__orb.snap()' --eval@1 '__orb.snap()'
 *                                          # context 0 = owner, context 1 = member (roster order)
 *   pnpm snap / --as member --eval '__orb.snap()'
 *                                          # single-context variant (--contexts 1, the default): pick
 *                                          # WHICH fixture user context 0 authenticates as. Mutually
 *                                          # exclusive with --contexts N>1 (that already assigns N
 *                                          # distinct handles) — refused loudly if combined.
 *   REFUSALS (mirror --open-chat's ambiguity-refusal style — a stated reason + the exact remedy, never a
 *   silent fallback to the shared stack):
 *     `--contexts N` bigger than the fixture's seeded roster (today: 2) → "exceeds the fixture's seeded
 *     roster" + the remedy line.
 *     the fixture stack down, or its live process env-pin-mismatched (the same drift `stack.sh status`
 *     surfaces — a stale pidfile serving `local`-shaped /api/auth/config while the bound process is
 *     actually still single-user) → "FIXTURE REFUSED …" + `run scripts/dev/multi-user-fixture.sh up`.
 *   Bringing the fixture up/down is a HUMAN/orchestrator call (`bash scripts/dev/multi-user-fixture.sh
 *   up`) — snap NEVER boots or stops it itself, and never silently restarts the shared stack under a
 *   different AUTH_MODE. Full detection/credential logic lives in scripts/probes/_kit/fixture.ts.
 *
 *   LOCAL FILE — `--file <path>` renders a local HTML file (the committed design mocks) over file://
 *   instead of a dev-stack route: the SAME instruments (--shot/--shot-of/--aria/--map/--contrast/--eval/
 *   the dead-CSS scan/--viewport/--mobile/--dark) with no stack, no server, no route. This is how a mock
 *   gets measured with the same ruler as the built surface (a hand-rolled playwright scratch script used
 *   to be the only way).
 *   pnpm snap --file docs/design/mocks/config-rail/workspace.html          # → reports/snaps/workspace.png
 *   pnpm snap --file docs/design/mocks/config-rail/workspace.html --wide --contrast 'h1' --text
 *   The PNG defaults to the file's basename (reports/snaps/workspace.png); --out overrides. A relative
 *   path resolves against the CWD. The app-readiness wait is skipped (a static file never sets
 *   data-app-ready), and --file REFUSES loudly rather than half-working when combined with a stack mode:
 *   a missing file · --isolated/--dirty/--ref · --contexts/--as · any __orb nav flag (a static file has
 *   no bridge). --click/--fill/--hover/--press still work — mocks with real controls are drivable.
 *
 *   ISOLATED STAGE — serve snaps from a FROZEN HEAD worktree, never the live dev stack. The one-flag
 *   recovery for the crash-loop story: a visual pass against the dev stack fights concurrent lanes' HMR
 *   (tsx-watch/vite crash-looping under a reviewer mid-edit). --isolated boots a SECOND, fully isolated
 *   dev stack from a detached git worktree at local HEAD on OFFSET ports (server :8888 / vite :5273) with
 *   its OWN db/data — zero collision with the dev stack, both run at once, and it keeps window.__orb (a
 *   prod build would strip it). Nothing edits the worktree, so its watchers never fire. `--dirty` stages
 *   the WORKING TREE (uncommitted changes) instead — see the flag doc below. Full lifecycle + the
 *   port/db layout live in scripts/probes/_kit/snap-stage.ts.
 *   pnpm snap / --isolated                 # boot-or-reuse the stage at HEAD, snap the route against it
 *   pnpm snap / --isolated --ref <sha>     # stage a specific commit instead of HEAD (implies --isolated)
 *   pnpm snap / --isolated --fresh         # force-rebuild the stage even if a warm one exists
 *   pnpm snap / --dirty                    # stage the WORKING TREE (uncommitted changes) instead of a
 *                                          # commit — implies --isolated, ignores --ref. rsyncs your
 *                                          # tracked+modified+untracked source (.gitignore-filtered) into
 *                                          # a fixed .cache/snap-stage/dirty/ dir and boots the same
 *                                          # stack.sh stack. REFRESHABLE: re-run `--dirty` after editing
 *                                          # and it re-syncs the diff into the warm stage (no full
 *                                          # re-stage) — the stage's own tsx watch restarts on it, since
 *                                          # only YOUR rsync ever touches those files (never a concurrent
 *                                          # lane's live edits — the crash-loop immunity is preserved).
 *                                          # `--dirty --fresh` forces a full rebuild of the dirty stage.
 *   pnpm snap --stage-down                 # stop the stage stack + remove the worktree/dir (ignores route);
 *                                          # falls back to a marker-less teardown (kill by stage-band port +
 *                                          # sweep stage dirs) when a lost marker left an ownerless stage
 *   pnpm snap --stage-status               # the engines:status-style read, stage edition: marker + stage-band
 *                                          # port owners + worktree dirs (surfaces a lost-marker stage)
 *   First-boot cost: one `git worktree add` (or, for --dirty, an rsync) + `pnpm install` (shared store →
 *   cheap) + a stack boot; the stage then stays WARM across snap calls. A new HEAD sha auto-rebuilds the
 *   commit-pinned stage (the stale one is torn down); --dirty always re-syncs instead. A ref/tree predating
 *   the vite.config VITE_API_TARGET hook is REJECTED (it would proxy /api to the dev stack).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, extname, isAbsolute, join, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { errorMessage } from "@orb/kit/error-message";
import type { Locator, Page } from "@playwright/test";
import sharp from "sharp";
import { artifactDir, routeSlug } from "./_kit/artifacts.ts";
import type { CapturedConsole, CapturedRequest, LocalStorageSeed, ProbeLaunchOptions, ProbeSession } from "./_kit/browser.ts";
import { buildUrl, DEFAULT_BASE, DEFAULT_DEBUG_TOKEN, launchProbeSession, settle } from "./_kit/browser.ts";
import { resolveFfmpeg } from "./_kit/ffmpeg.ts";
import type { FixtureTarget } from "./_kit/fixture.ts";
import { defaultFixtureUsers, fixtureRefusalLine, fixtureStatus, loginFixtureUser, resolveFixtureTarget, resolveFixtureUsers } from "./_kit/fixture.ts";
import type { Viewport } from "./_kit/flags.ts";
import { parseGotoTarget, parseViewport, splitFirstEq, splitLastEq, splitPageSuffix } from "./_kit/flags.ts";
import type { ResultPair } from "./_kit/result.ts";
import { print, printResult } from "./_kit/result.ts";
import { ensureStage, stageStatus, teardownStage } from "./_kit/snap-stage.ts";
import type { Rgb } from "./design-audit-checks.ts";
import { contrastRatio, isLargeText, LARGE_MIN_RATIO, NORMAL_MIN_RATIO } from "./design-audit-checks.ts";

// SSIM floor for --diff. 0.98 tolerates antialiasing wobble while catching any
// real layout/content change; tune per-surface later if flux demands.
const DIFF_SSIM_THRESHOLD = 0.98;
// Cap on ARIA-snapshot lines echoed into the report — a full app route can be
// hundreds of nodes. Past this, the tail is dropped with a "scope it" hint
// (--aria <selector> / --aria-depth N) so the text path never blows the budget
// it exists to save.
const ARIA_MAX_LINES = 400;
const MAP_NAME_MAX_LENGTH = 80;
// Human output is a triage view; --json is the lossless console record.
const CONSOLE_REPORT_CAP = 200;
// Cap on DEADCSS/EMPTYCSS lines echoed (the counts always print in full).
const CSS_FINDINGS_CAP = 15;
// --eval result cap: a runaway selector/object dump shouldn't blow the report budget the
// text path exists to save. Truncation is noted inline, never silent.
const EVAL_RESULT_CAP = 2000;
// --eval block header: the expr itself, truncated so a long one-liner doesn't wrap the report.
const EVAL_LABEL_CAP = 80;
const BOLD_WEIGHT = 700;
// WCAG 1.4.11 non-text contrast floor (a graphical/control boundary) — applied to a --contrast target
// that renders NO text (an icon button, a graphical control), so a 4.5:1 text ratio isn't FALSE-flagged
// against it. Numerically 3:1 like large-text, but a distinct concept, hence its own name.
const UI_COMPONENT_MIN_RATIO = 3;
// Roles whose contrast is a two-STATE signal (the track's on/off colors), NOT track-vs-page — measuring
// the latter is meaningless and produced the 1.71:1 Switch false-FAIL. --contrast SKIPS these with a
// stated reason (the WCAG 1.4.11 state boundary is a separate measurement this axis can't make).
const CONTROL_TRACK_ROLES = new Set(["switch", "slider", "progressbar", "scrollbar"]);
// Perimeter-ring pixel sampling for the pixel-sample backdrop path: glyphs/icons sit in the box
// INTERIOR, so the outer ring is background-dominant — sampling only the ring EXCLUDES the foreground
// by construction (the hard part), instead of hoping a whole-box median outvotes the text.
const SAMPLE_RING_FRAC = 0.15;
const SAMPLE_RING_MAX_PX = 6;
// Below this accumulated ancestor opacity, composite the (dimmed) foreground over the backdrop before
// measuring. Just under 1 so sub-pixel float noise (0.999…) never triggers a pointless composite.
const FOREGROUND_OPACITY_EPS = 0.999;
const NAV_TIMEOUT_MS = 15_000;
const WAIT_SELECTOR_TIMEOUT_MS = 10_000;
// A STAGE (`--isolated`/`--dirty`) is a vite dev server that may be transforming the module graph on demand:
// a freshly-booted one legitimately needs far longer than the shared dev stack's budget for its FIRST
// navigation (measured 2026-08-09: every cold stage blew the 15s goto). These are ceilings, not sleeps — a
// warm stage returns just as fast — so the wide budget costs nothing and buys a first call that isn't a lie.
const STAGE_NAV_TIMEOUT_MS = 90_000;
const STAGE_READY_TIMEOUT_MS = 60_000;
const STEP_TIMEOUT_MS = 5000;
// Let transitions/queries settle between steps (drawer slides, panel drops).
const STEP_SETTLE_MS = 400;
// After a --press hover: give group-hover reveals a beat before the forced click.
const HOVER_REVEAL_MS = 150;
const NETWORKIDLE_TIMEOUT_MS = 10_000;
// Default post-nav settle so onMount queries have a chance to fire.
const MOUNT_SETTLE_MS = 500;
const MS_PER_SECOND = 1000;
const HTTP_ERROR_STATUS_MIN = 400;
const DEFAULT_VIEWPORT: Viewport = { width: 1280, height: 800 };
// --wide: layout sanity at a real monitor width (neo's default 1280 disguised a
// dialog max-width bug for a whole morning).
const WIDE_VIEWPORT: Viewport = { width: 1920, height: 1080 };
// --mobile: a Playwright device descriptor name (registry lookup in _kit/browser.ts). Real touch +
// pointer:coarse + mobile UA + DPR3, so the app's coarse-pointer progressive-disclosure and bottom-tab
// rail both render — a bare narrow viewport misses them. `scale:"css"` in SHOT_BASE keeps the DPR3 shot
// at 1 image px / CSS px (not 3×), so the PNG cost stays sane.
const MOBILE_DEVICE = "iPhone 14 Pro Max";
// Native screenshot stabilization, applied to EVERY shot (page + element):
//   animations:"disabled" — rewinds CSS animations/transitions to a consistent
//     finished state (correct way; supersedes probe-mode's injected killer CSS).
//   caret:"hide"          — no blinking text caret (also Playwright's default).
//   scale:"css"           — one image pixel per CSS pixel; on a hi-dpi context
//     this HALVES pixel count vs the "device" default → ~half the image tokens.
const SHOT_BASE = { animations: "disabled", caret: "hide", scale: "css" } as const;
const CROP_RE = /^(?<w>\d+)x(?<h>\d+)(?:\+(?<x>\d+)\+(?<y>\d+))?$/u;
const PNG_EXT_RE = /\.png$/u;
const SSIM_ALL_RE = /All:(?<all>[\d.]+)/u;
const HTTP_URL_RE = /^https?:\/\//u;
const METHOD_PAD = 4;
const TYPE_PAD = 8;
// localStorage keys the harness seeds. App counterpart for probe-mode:
// packages/client/src/lib/probe-mode.ts; the debug-token reader lands with its route.
const PROBE_MODE_KEY = "orb:probe-mode";
const DEBUG_TOKEN_KEY = "orb:debug-token";
// Harness-side determinism for --probe: floor every animation/transition and hide the
// caret from FIRST PAINT (screenshot-time `animations:"disabled"` only rewinds at capture;
// this kills mid-run flicker during steps too). Raw string — see _kit/browser.ts header.
const PROBE_CSS_SCRIPT = `document.addEventListener("DOMContentLoaded", () => {
  const style = document.createElement("style");
  style.textContent = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}";
  document.head.appendChild(style);
});`;

// `page` = the target page index for --pages multi-tab mode (0 when unprefixed / single-page). Every
// step/capture carries it so one flat argv-ordered list can drive N tabs in one shared context.
type StepAction =
  | { kind: "click"; selector: string }
  | { kind: "jsclick"; selector: string }
  | { kind: "press"; selector: string }
  | { kind: "hover"; selector: string }
  | { kind: "fill"; selector: string; value: string }
  | { kind: "key"; selector: string; key: string }
  | { kind: "waitfor"; selector: string };
type Step = StepAction & { page: number };

// --goto / --open-chat / --context-tab: SPA navigation via the app's dev nav bridge (window.__orb.nav),
// run BEFORE the regular steps. `target` is the raw flag value; the kind picks the __orb.nav method.
type NavAction =
  | { kind: "goto"; target: string; page: number }
  | { kind: "open-chat"; target: string; page: number }
  | { kind: "open-character"; target: string; page: number }
  | { kind: "context-tab"; target: string; page: number };

// A per-page eval/contrast keeps its argv-order expr/selector plus the target page.
type PagedExpr = { expr: string; page: number };
type PagedSelector = { selector: string; page: number };
type Assertion =
  | { kind: "visible"; selector: string; page: number }
  | { kind: "text"; selector: string; expected: string; page: number }
  | { kind: "count"; selector: string; expected: number; page: number }
  | { kind: "url"; expected: string; page: number }
  | { kind: "overflow"; selector: string; page: number }
  | { kind: "focus"; selector: string; page: number };

export type Args = {
  /** Print the operator cookbook and exit without touching a browser or stage. */
  help: boolean;
  /** Parse/validation failures collected without side effects; any entry is CLI misuse. */
  errors: string[];
  /** JSON scenario file: checkpoint args execute sequentially in one browser lifetime. */
  scenario: string | null;
  /** Run the bounded desktop/mobile × light/dark × normal/reduced-motion matrix. */
  matrix: boolean;
  /** Write a structured manifest beside the PNG artifacts. */
  json: boolean;
  /** Print one compact line per scenario checkpoint; --json remains the lossless evidence. */
  summary: boolean;
  /** Save a Playwright trace when the run fails. */
  failureEvidence: boolean;
  /** Console errors always fail; this also promotes warnings to failures. */
  strictConsole: boolean;
  /** Reset app diagnostics after the initial page reaches readiness and scope console/page-error
   *  verdicts to the subsequent navigation, interaction, and capture window. The full boot log remains
   *  in JSON so interaction truth does not erase startup truth. */
  checkpoint: boolean;
  /** Include React Activity/inert/hidden DOM in dead-CSS scans. Default is rendered DOM only. */
  includeHidden: boolean;
  route: string;
  vnc: boolean;
  waitSelector: string | null;
  sseSeconds: number;
  base: string;
  fullPage: boolean;
  /** Seeds `orb:debug-token` BEFORE navigation so token-gated routes render real data.
   *  Defaults to env DEBUG_TOKEN if set; `--debug-token …` overrides; empty skips the
   *  seed. The token never leaves the headless context. */
  debugToken: string;
  /** Pre-shot interaction steps, executed in argv order. Each waits for its selector
   *  (5s) then acts; failures are REPORTED (and fail the exit code) but don't abort —
   *  you still get a PNG of wherever the page ended up. A `@<idx>` flag suffix targets a
   *  --pages tab (`--click@1 …`); unprefixed = page 0. */
  steps: Step[];
  /** SPA navigation via the app's dev nav bridge (`__orb.nav`), run BEFORE steps so
   *  `--goto presets --map` maps the presets surface in one call. Fails the step loudly
   *  (reddens exit) on a rejected target. Carries a `@<idx>` page suffix like steps. */
  navActions: NavAction[];
  /** How many pages (tabs) to open in ONE shared browser context (shared auth/localStorage).
   *  Default 1 (byte-identical single-page path). Steps/captures target a tab via `@<idx>`. */
  pages: number;
  /** `--contexts N` (2..4): N ISOLATED browser contexts, each authenticated as a DIFFERENT dev user
   *  against the multi-user FIXTURE stack (scripts/dev/multi-user-fixture.sh) — own cookies/localStorage,
   *  so host-vs-member views/presence/visibility-floors can be captured in one run. Default 1 (the
   *  ordinary single-context path, untouched). Steps/captures target a context via the SAME `@<idx>`
   *  suffix `--pages` uses (unsuffixed = context 0); combining `--contexts >1` with `--pages >1` is
   *  refused (unexercised combination, not silently under-tested). */
  contexts: number;
  /** `--as <handle>`: with `--contexts 1` (the default), pick WHICH fixture dev user context 0
   *  authenticates as, instead of the roster default (context 0 = "owner"). Ignored/refused combined with
   *  `--contexts N>1` (that already assigns N distinct handles in roster order) — pass N contexts instead. */
  as: string | null;
  /** `--fixture-server <origin>` — where the multi-user fixture's SERVER answers (health probe + the login
   *  door). Defaults to env SNAP_FIXTURE_SERVER_URL, then the fixture's offset pair (:8790). */
  fixtureServer: string | null;
  /** `--fixture-base <origin>` — the fixture's VITE origin (what the browser navigates). Defaults to env
   *  SNAP_FIXTURE_BASE_URL, then :5175. Pair it with --fixture-server; both flow through ONE resolve. */
  fixtureBase: string | null;
  /** `--file <path>` — render a LOCAL HTML file (a committed mock) over file:// instead of a dev-stack
   *  route. Every instrument (shot/aria/map/contrast/eval/deadcss) is unchanged; the app-readiness wait and
   *  the __orb nav bridge are skipped (a static file has neither). Refused with --isolated/--contexts. */
  file: string | null;
  /** Timed observation series after nav+steps settle: total window (ms). 0 = disabled (single-shot).
   *  Every tick re-runs --eval exprs and, when shots are enabled, captures `<out>-t<elapsed>.png`. */
  watchMs: number;
  /** --watch tick interval (ms). Default 1000. */
  watchEveryMs: number;
  /** Output basename override (reports/snaps/<out>.png). Defaults to the route slug. */
  out: string | null;
  viewport: Viewport;
  /** localStorage seeds applied BEFORE navigation (`--ls key=value`, repeatable). */
  localStorage: LocalStorageSeed[];
  /** Deterministic-render mode: seed orb:probe-mode + kill animations via injected CSS. */
  probe: boolean;
  /** Save the shot as the baseline (reports/baselines/<out>.png) instead of diffing. */
  baseline: boolean;
  /** Compare the shot against the stored baseline via ffmpeg SSIM; exit 1 below threshold. */
  diff: boolean;
  /** Dead-class scan (default on): DOM class tokens vs compiled CSSOM selectors. */
  deadCss: boolean;
  /** Optional crop "WxH+X+Y" → <out>-crop.png (native Playwright clip, no ffmpeg). */
  crop: string | null;
  // ── TEXT PATH (cheap structure-as-text — feed this instead of pixels) ───────
  /** Emit a Playwright ARIA snapshot of `ariaSelector` into the report. */
  aria: boolean;
  /** Subtree to snapshot (default "body"); scope it to shrink the output. */
  ariaSelector: string;
  /** Cap ARIA tree depth (Playwright `depth`) — bounds output on deep routes. */
  ariaDepth: number | null;
  /** Append each node's `[box=x,y,w,h]` viewport geometry (Playwright `boxes`). */
  ariaBoxes: boolean;
  /** Which --pages tab to snapshot (default 0), set by a `@<idx>` suffix on --aria/--text. */
  ariaPage: number;
  // ── IMAGE PATH ──────────────────────────────────────────────────────────────
  /** Produce a PNG at all. `--no-shot`/`--text` set false; --baseline/--diff force it. */
  shot: boolean;
  /** Screenshot ONLY this element (locator.screenshot, auto-cropped). Overrides full-page. */
  shotOf: string | null;
  /** Selectors painted over (#FF00FF) before the shot — volatile regions. */
  mask: string[];
  /** emulateMedia colorScheme — exercise the app's dark/light surfaces. */
  colorScheme: "light" | "dark" | null;
  /** emulateMedia reducedMotion:"reduce" (also implied by --probe). */
  reducedMotion: boolean;
  /** Settle on networkidle (bounded) instead of a fixed timeout before capture. */
  idle: boolean;
  // ── INTROSPECTION (the "skip the MCP hop" escape hatches) ───────────────────
  /** Raw JS run in-page post-settle (repeatable, argv order). JSON-printed, capped. `@<idx>` targets a
   *  --pages tab (default page 0). Also re-run every --watch tick. */
  eval: PagedExpr[];
  /** Selectors WCAG-contrast-checked post-settle (repeatable): text color vs effective
   *  ancestor background of the FIRST match. `@<idx>` targets a --pages tab (default page 0). */
  contrast: PagedSelector[];
  /** Force PIXEL-SAMPLE for every --contrast target (even ones the css walk could resolve) — verify a
   *  css-resolve number against the real composite, or sample when you already know a layer paints behind. */
  contrastPixel: boolean;
  /** First-class post-settle assertions; selector assertions target visible/rendered matches by default. */
  assertions: Assertion[];
  /** Emit a selector map (role · accessible name · best stable selector) of interactive/
   *  labeled elements within `mapSelector` — "how do I reach this" instead of grepping source. */
  map: boolean;
  /** Subtree to map (default "body"); scope it (e.g. a just-revealed dialog) to shrink output. */
  mapSelector: string;
  /** Which --pages tab to map (default 0), set by a `@<idx>` suffix on --map. */
  mapPage: number;
  // ── DEVICE PRESETS ──────────────────────────────────────────────────────────
  /** A Playwright device descriptor name (e.g. "iPhone 14 Pro Max") — full touch + mobile-UA + DPR
   *  emulation, not just a narrow viewport. null = the raw `viewport` field drives (desktop). Last of
   *  --mobile/--desktop/--wide/--viewport wins the slot. */
  device: string | null;
  // ── ISOLATED STAGE (serve from a frozen HEAD worktree, not the live dev stack) ─────────────
  /** Serve snaps from an ISOLATED snap-stage (detached HEAD worktree, offset ports + own db/data) — never
   *  the live dev stack. Immune to the dev stack's HMR/crash-loops. See scripts/probes/_kit/snap-stage.ts. */
  isolated: boolean;
  /** Stage git ref override (default HEAD). Implies --isolated. */
  ref: string | null;
  /** Force-rebuild the stage even when a warm one at this sha exists. Implies --isolated. */
  fresh: boolean;
  /** Stage the WORKING TREE (uncommitted changes), not a commit — rsyncs tracked+modified+untracked
   *  source (gitignore-filtered) into a fixed stage dir and re-syncs on every call (refreshable, no
   *  full re-stage when warm). Implies --isolated; takes priority over --ref. */
  dirty: boolean;
  /** Tear down the active stage (stop its stack + remove the worktree) and exit — ignores the route. */
  stageDown: boolean;
  /** Print the stage's visibility (marker + stage-band port owners + worktree dirs) and exit — the
   *  engines:status-style read, stage edition. Surfaces a lost-marker ownerless stage. Ignores the route. */
  stageStatus: boolean;
};

// ── Flag dispatch ───────────────────────────────────────────────────────────
// One handler per flag (Record dispatch, house style) — each consumes what it
// needs from `rest`. Repeatable flags push; order-sensitive steps land in
// args.steps in argv order. `page` is the --pages tab index parsed off a `@<idx>`
// flag suffix (0 when unprefixed / single-page) — steps + per-page captures stamp it.
type FlagHandler = (args: Args, rest: string[], page: number) => void;
// A `@<idx>` suffix on a flag (`--click@1`, `--eval@0`, `--aria@2`) selects a --pages tab — parsed by
// splitPageSuffix (_kit/flags.ts, unit-tested there).

// Optional inline selector: consume the next token ONLY if it's not a flag (--…) and not a
// route (/…). Selectors start with [ . # or a tag name. Shared by --aria/--text/--map's
// "defaults to a broad scope, narrow it inline" idiom.
function consumeOptionalSelector(rest: string[]): string | null {
  const next = rest[0];
  if (next !== undefined && !next.startsWith("-") && !next.startsWith("/")) {
    return rest.shift() as string;
  }
  return null;
}

function ariaFlag(args: Args, rest: string[], textMode: boolean, page: number): void {
  args.aria = true;
  args.ariaPage = page;
  // --text is the cheap combo: structure-as-text, no pixels.
  if (textMode) {
    args.shot = false;
  }
  const sel = consumeOptionalSelector(rest);
  if (sel !== null) {
    args.ariaSelector = sel;
  }
}

function mapFlag(args: Args, rest: string[], page: number): void {
  args.map = true;
  args.mapPage = page;
  const sel = consumeOptionalSelector(rest);
  if (sel !== null) {
    args.mapSelector = sel;
  }
}

const FLAG_HANDLERS: Record<string, FlagHandler> = {
  "--help": (a) => {
    a.help = true;
  },
  "-h": (a) => {
    a.help = true;
  },
  "--scenario": (a, rest) => {
    a.scenario = rest.shift() ?? null;
  },
  "--matrix": (a) => {
    a.matrix = true;
  },
  "--json": (a) => {
    a.json = true;
  },
  "--summary": (a) => {
    a.summary = true;
  },
  "--no-failure-evidence": (a) => {
    a.failureEvidence = false;
  },
  "--strict-console": (a) => {
    a.strictConsole = true;
  },
  "--checkpoint": (a) => {
    a.checkpoint = true;
  },
  "--include-hidden": (a) => {
    a.includeHidden = true;
  },
  "--vnc": (a) => {
    a.vnc = true;
  },
  "--full": (a) => {
    a.fullPage = true;
  },
  "--wait": (a, rest) => {
    a.waitSelector = rest.shift() ?? null;
  },
  "--sse": (a, rest) => {
    a.sseSeconds = Number(rest.shift() ?? "0");
  },
  "--base": (a, rest) => {
    a.base = rest.shift() ?? DEFAULT_BASE;
  },
  "--debug-token": (a, rest) => {
    a.debugToken = rest.shift() ?? "";
  },
  "--click": (a, rest, page) => {
    a.steps.push({ kind: "click", selector: rest.shift() ?? "", page });
  },
  // In-page el.click() — bypasses Playwright's actionability checks for
  // stubborn targets (icon divs under overlay stacks).
  "--jsclick": (a, rest, page) => {
    a.steps.push({ kind: "jsclick", selector: rest.shift() ?? "", page });
  },
  // Hover the target's position then FORCE-click — for hover-revealed controls
  // (group-hover kebabs/toolbars stay actionability-invisible) and Radix
  // triggers that want real pointer events but fail visibility checks.
  "--press": (a, rest, page) => {
    a.steps.push({ kind: "press", selector: rest.shift() ?? "", page });
  },
  "--hover": (a, rest, page) => {
    a.steps.push({ kind: "hover", selector: rest.shift() ?? "", page });
  },
  // FIRST '=' splits (localStorage keys never contain '='; JSON values often do).
  "--ls": (a, rest) => {
    const seed = splitFirstEq(rest.shift() ?? "");
    if (seed !== null) {
      a.localStorage.push({ key: seed.head, value: seed.tail });
    }
  },
  // --fill "selector=value" — LAST '=' splits (selectors contain '=').
  "--fill": (a, rest, page) => {
    const s = splitLastEq(rest.shift() ?? "");
    a.steps.push({ kind: "fill", selector: s.head, value: s.tail, page });
  },
  // --key "selector=KeyName" (LAST '=' splits; default Enter). Pairs with --fill to
  // COMMIT a search box: `--fill 'input=q' --key 'input=Enter'` snaps a results view.
  "--key": (a, rest, page) => {
    const s = splitLastEq(rest.shift() ?? "");
    a.steps.push({ kind: "key", selector: s.head, key: s.tail === "" ? "Enter" : s.tail, page });
  },
  // A POST-STEP wait (vs the page-load `--wait`): waits for `selector` to ATTACH at
  // this point in the step sequence — for content that appears AFTER an interaction.
  // "attached" not "visible": the visibility check false-negatives on full-bleed-
  // modal / portal content that IS painted — pair with `--shot-of`.
  "--wait-for": (a, rest, page) => {
    a.steps.push({ kind: "waitfor", selector: rest.shift() ?? "", page });
  },
  // ── SPA navigation (dev nav bridge __orb.nav) — runs BEFORE the regular steps ──
  "--goto": (a, rest, page) => {
    a.navActions.push({ kind: "goto", target: rest.shift() ?? "", page });
  },
  "--open-chat": (a, rest, page) => {
    a.navActions.push({ kind: "open-chat", target: rest.shift() ?? "", page });
  },
  "--open-character": (a, rest, page) => {
    a.navActions.push({ kind: "open-character", target: rest.shift() ?? "", page });
  },
  "--context-tab": (a, rest, page) => {
    a.navActions.push({ kind: "context-tab", target: rest.shift() ?? "", page });
  },
  "--pages": (a, rest) => {
    a.pages = Math.max(1, Number(rest.shift() ?? "1") || 1);
  },
  "--contexts": (a, rest) => {
    a.contexts = Math.max(1, Number(rest.shift() ?? "1") || 1);
  },
  "--as": (a, rest) => {
    a.as = rest.shift() ?? null;
  },
  "--fixture-server": (a, rest) => {
    a.fixtureServer = rest.shift() ?? null;
  },
  "--fixture-base": (a, rest) => {
    a.fixtureBase = rest.shift() ?? null;
  },
  // Render a local HTML file (a committed mock) instead of a dev-stack route — same instruments over file://.
  "--file": (a, rest) => {
    a.file = rest.shift() ?? null;
  },
  "--watch": (a, rest) => {
    a.watchMs = Math.max(0, Number(rest.shift() ?? "0") || 0);
  },
  "--every": (a, rest) => {
    a.watchEveryMs = Math.max(1, Number(rest.shift() ?? "0") || MS_PER_SECOND);
  },
  "--no-deadcss": (a) => {
    a.deadCss = false;
  },
  "--aria": (a, rest, page) => {
    ariaFlag(a, rest, false, page);
  },
  "--text": (a, rest, page) => {
    ariaFlag(a, rest, true, page);
  },
  "--aria-depth": (a, rest) => {
    a.ariaDepth = Number(rest.shift() ?? "0") || null;
  },
  "--aria-boxes": (a) => {
    a.ariaBoxes = true;
  },
  "--no-shot": (a) => {
    a.shot = false;
  },
  "--shot-of": (a, rest) => {
    a.shotOf = rest.shift() ?? null;
  },
  "--mask": (a, rest) => {
    const sel = rest.shift();
    if (sel) {
      a.mask.push(sel);
    }
  },
  "--dark": (a) => {
    a.colorScheme = "dark";
  },
  "--light": (a) => {
    a.colorScheme = "light";
  },
  "--reduced-motion": (a) => {
    a.reducedMotion = true;
  },
  "--idle": (a) => {
    a.idle = true;
  },
  "--crop": (a, rest) => {
    a.crop = rest.shift() ?? null;
  },
  "--probe": (a) => {
    a.probe = true;
  },
  "--baseline": (a) => {
    a.baseline = true;
  },
  "--diff": (a) => {
    a.diff = true;
  },
  "--out": (a, rest) => {
    a.out = rest.shift() ?? null;
  },
  // --wide/--viewport/--mobile/--desktop all fill ONE slot — last wins. The device presets and the raw
  // viewport are mutually exclusive, so each clears the other.
  "--wide": (a) => {
    a.viewport = WIDE_VIEWPORT;
    a.device = null;
  },
  "--viewport": (a, rest) => {
    a.viewport = parseViewport(rest.shift() ?? "") ?? a.viewport;
    a.device = null;
  },
  // Full mobile emulation (touch + mobile UA + DPR), not just a narrow viewport — the app's
  // progressive-disclosure law renders hover-revealed controls ALWAYS-VISIBLE at pointer:coarse, and the
  // rail flips to a bottom tab bar; a bare narrow viewport would miss both.
  "--mobile": (a) => {
    a.device = MOBILE_DEVICE;
  },
  // Explicit alias for the default desktop viewport — lets a script pair --mobile/--desktop symmetrically.
  "--desktop": (a) => {
    a.viewport = DEFAULT_VIEWPORT;
    a.device = null;
  },
  "--eval": (a, rest, page) => {
    const expr = rest.shift();
    if (expr) {
      a.eval.push({ expr, page });
    }
  },
  "--contrast": (a, rest, page) => {
    const sel = rest.shift();
    if (sel) {
      a.contrast.push({ selector: sel, page });
    }
  },
  "--contrast-pixel": (a) => {
    a.contrastPixel = true;
  },
  "--expect-visible": (a, rest, page) => {
    a.assertions.push({ kind: "visible", selector: rest.shift() ?? "", page });
  },
  "--expect-text": (a, rest, page) => {
    const value = splitLastEq(rest.shift() ?? "");
    a.assertions.push({ kind: "text", selector: value.head, expected: value.tail, page });
  },
  "--expect-count": (a, rest, page) => {
    const value = splitLastEq(rest.shift() ?? "");
    a.assertions.push({ kind: "count", selector: value.head, expected: Number(value.tail), page });
  },
  "--expect-url": (a, rest, page) => {
    a.assertions.push({ kind: "url", expected: rest.shift() ?? "", page });
  },
  "--expect-no-overflow": (a, rest, page) => {
    a.assertions.push({ kind: "overflow", selector: consumeOptionalSelector(rest) ?? "html", page });
  },
  "--expect-focus": (a, rest, page) => {
    a.assertions.push({ kind: "focus", selector: rest.shift() ?? "", page });
  },
  "--map": (a, rest, page) => {
    mapFlag(a, rest, page);
  },
  "--isolated": (a) => {
    a.isolated = true;
  },
  "--ref": (a, rest) => {
    a.ref = rest.shift() ?? null;
    a.isolated = true;
  },
  "--fresh": (a) => {
    a.fresh = true;
    a.isolated = true;
  },
  "--dirty": (a) => {
    a.dirty = true;
    a.isolated = true;
  },
  "--stage-down": (a) => {
    a.stageDown = true;
  },
  "--stage-status": (a) => {
    a.stageStatus = true;
  },
};

const REQUIRED_VALUE_FLAGS = new Set([
  "--scenario",
  "--wait",
  "--sse",
  "--base",
  "--debug-token",
  "--click",
  "--jsclick",
  "--press",
  "--hover",
  "--ls",
  "--fill",
  "--key",
  "--wait-for",
  "--goto",
  "--open-chat",
  "--open-character",
  "--context-tab",
  "--pages",
  "--contexts",
  "--as",
  "--fixture-server",
  "--fixture-base",
  "--file",
  "--watch",
  "--every",
  "--aria-depth",
  "--shot-of",
  "--mask",
  "--crop",
  "--out",
  "--viewport",
  "--eval",
  "--contrast",
  "--expect-visible",
  "--expect-text",
  "--expect-count",
  "--expect-url",
  "--expect-focus",
  "--ref",
]);

const OPTIONAL_SELECTOR_FLAGS = new Set(["--aria", "--text", "--map", "--expect-no-overflow"]);

const PAGE_TARGET_FLAGS = new Set([
  "--click",
  "--jsclick",
  "--press",
  "--hover",
  "--fill",
  "--key",
  "--wait-for",
  "--goto",
  "--open-chat",
  "--open-character",
  "--context-tab",
  "--aria",
  "--text",
  "--eval",
  "--contrast",
  "--expect-visible",
  "--expect-text",
  "--expect-count",
  "--expect-url",
  "--expect-no-overflow",
  "--expect-focus",
  "--map",
]);

const SNAP_HELP = `snap — one browser run, many pieces of UI evidence

Usage:
  pnpm snap [route] [flags]
  pnpm snap --file <html> [flags]

Cheap evidence:
  --text [selector]       ARIA tree, no primary screenshot
  --map [selector]        interactive roles, names, and selectors
  --eval <expression>     in-page JSON result (repeatable)
  --contrast <selector>   rendered WCAG contrast check (repeatable)

Assertions and reports:
  --expect-visible <selector>       require a rendered, visible element
  --expect-text <selector=text>     require rendered text to contain a value
  --expect-count <selector=N>       require N rendered matches
  --expect-url <url-or-path>        require the final URL
  --expect-no-overflow [selector]   require scroll bounds to fit client bounds
  --expect-focus <selector>         require the active element to match
  --json                            write a machine-readable run manifest
  --summary                         compact scenario output; pair with --json for full evidence
  --strict-console                  make console warnings red (errors are always red)
  --checkpoint                      reset __orb evidence after readiness; scope console verdicts to actions
  --include-hidden                  include Activity/hidden DOM in map, CSS, and counts

Interaction:
  --click <selector>      --fill <selector=value>  --key <selector=Key>
  --hover <selector>      --wait-for <selector>    --goto <target>
  --open-chat <id|title|latest>     --open-character <id>     --context-tab <tab>
  --watch <totalMs> [--every <ms>]  poll evals and optional screenshots over time
  Add @N to a page-targeted flag with --pages N, for example --click@1.

Pixels:
  --no-shot               skip the primary PNG
  --shot-of <selector>    capture one element
  --crop <WxH+X+Y>        capture a bounded region
  --baseline | --diff     save or compare a visual baseline (mutually exclusive)

Sessions:
  --pages <N>             shared-context tabs
  --contexts <N>          isolated fixture users (no watch/baseline/diff)
  --as <handle>           one named fixture user
  --isolated | --dirty    warm isolated stage from HEAD or working tree
  --scenario <json>       sequential checkpoints in one browser lifetime
  --matrix                desktop/mobile × light/dark × motion/reduced motion

Failure evidence:
  Red runs retain a Playwright trace under reports/traces/. Use
  --no-failure-evidence only when the trace cost is explicitly unwanted.

Run pnpm snap --help from the repository for this contract; the source header contains the full cookbook.`;

function validateInteger(raw: string, flag: string, min: number, errors: string[]): void {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    errors.push(`${flag} expects an integer >= ${min}, got ${JSON.stringify(raw)}`);
  }
}

function validateNumericFlag(flag: string, raw: string, errors: string[]): void {
  if (flag === "--pages" || flag === "--contexts" || flag === "--every" || flag === "--aria-depth") {
    validateInteger(raw, flag, 1, errors);
    return;
  }
  if (flag === "--watch" || flag === "--sse") {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      errors.push(`${flag} expects a non-negative number, got ${JSON.stringify(raw)}`);
    }
  }
}

function validateEvidenceFlagValue(flag: string, raw: string, errors: string[]): void {
  if (flag === "--viewport" && parseViewport(raw) === null) {
    errors.push(`--viewport expects positive WxH, got ${JSON.stringify(raw)}`);
  }
  if (flag === "--crop" && !CROP_RE.test(raw)) {
    errors.push(`--crop expects WxH or WxH+X+Y, got ${JSON.stringify(raw)}`);
  }
  if (flag === "--ls" && splitFirstEq(raw) === null) {
    errors.push(`--ls expects key=value with a non-empty key, got ${JSON.stringify(raw)}`);
  }
}

function validatePairFlagValue(flag: string, raw: string, errors: string[]): void {
  const split = splitLastEq(raw);
  if (flag === "--fill" && (!raw.includes("=") || split.head === "")) {
    errors.push(`--fill expects selector=value with a non-empty selector, got ${JSON.stringify(raw)}`);
  }
  if (flag === "--key" && split.head === "") {
    errors.push(`--key expects a non-empty selector, got ${JSON.stringify(raw)}`);
  }
  if (flag === "--expect-text" && (!raw.includes("=") || split.head === "")) {
    errors.push(`--expect-text expects selector=text, got ${JSON.stringify(raw)}`);
  }
  if (flag === "--expect-count" && (!raw.includes("=") || split.head === "" || !Number.isInteger(Number(split.tail)) || Number(split.tail) < 0)) {
    errors.push(`--expect-count expects selector=nonNegativeInteger, got ${JSON.stringify(raw)}`);
  }
}

function validateFlagValue(flag: string, raw: string, errors: string[]): void {
  if (raw === "" && flag !== "--debug-token") {
    errors.push(`${flag} requires a non-empty value`);
    return;
  }
  validateNumericFlag(flag, raw, errors);
  validateEvidenceFlagValue(flag, raw, errors);
  validatePairFlagValue(flag, raw, errors);
}

function consumeRequiredArg(argv: readonly string[], index: number, flag: string, errors: string[]): number {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    errors.push(`${flag} requires a value`);
    return 0;
  }
  validateFlagValue(flag, value, errors);
  return 1;
}

function consumesOptionalSelector(argv: readonly string[], index: number): boolean {
  const value = argv[index + 1];
  return value !== undefined && !value.startsWith("-") && !value.startsWith("/");
}

type ArgvScan = { readonly errors: string[]; routeCount: number; fileMode: boolean };

function scanArgvToken(argv: readonly string[], index: number, scan: ArgvScan): number {
  const token = argv[index] as string;
  const { flag } = splitPageSuffix(token);
  if (FLAG_HANDLERS[flag] === undefined) {
    scan.routeCount += token.startsWith("-") ? 0 : 1;
    if (token.startsWith("-")) {
      scan.errors.push(`unknown flag ${token}`);
    }
    return 0;
  }
  scan.fileMode = scan.fileMode || flag === "--file";
  if (token !== flag && !PAGE_TARGET_FLAGS.has(flag)) {
    scan.errors.push(`${flag} does not accept a @<page> suffix`);
  }
  if (REQUIRED_VALUE_FLAGS.has(flag)) {
    return consumeRequiredArg(argv, index, flag, scan.errors);
  }
  return OPTIONAL_SELECTOR_FLAGS.has(flag) && consumesOptionalSelector(argv, index) ? 1 : 0;
}

function scanArgv(argv: readonly string[]): string[] {
  const scan: ArgvScan = { errors: [], routeCount: 0, fileMode: false };
  for (let index = 0; index < argv.length; index += 1) {
    index += scanArgvToken(argv, index, scan);
  }
  const { errors, routeCount } = scan;
  if (routeCount > 1) {
    errors.push(`expected at most one route, got ${routeCount}`);
  }
  if (scan.fileMode && routeCount > 0) {
    errors.push("--file and a positional route are mutually exclusive");
  }
  return errors;
}

function targetedPages(args: Args): number[] {
  return [
    ...args.steps.map((step) => step.page),
    ...args.navActions.map((action) => action.page),
    ...args.eval.map((entry) => entry.page),
    ...args.contrast.map((entry) => entry.page),
    ...args.assertions.map((assertion) => assertion.page),
    ...(args.aria ? [args.ariaPage] : []),
    ...(args.map ? [args.mapPage] : []),
  ];
}

function validatePageTargets(args: Args, contextsMode: boolean): string[] {
  const targetCount = contextsMode ? args.contexts : args.pages;
  const errors: string[] = [];
  for (const page of targetedPages(args)) {
    if (page >= targetCount) {
      errors.push(`page target @${page} is out of range for ${contextsMode ? "contexts" : "pages"}=${targetCount}`);
    }
  }
  return errors;
}

type ValidationPair = readonly [boolean, string];

function sessionValidationPairs(args: Args, contextsMode: boolean): ValidationPair[] {
  return [
    [args.baseline && args.diff, "--baseline and --diff are mutually exclusive"],
    [args.contexts > 1 && args.pages > 1, "--contexts and --pages cannot both be greater than 1"],
    [args.contexts > 1 && args.as !== null, "--as cannot be combined with --contexts greater than 1"],
    [contextsMode && args.isolated, "--contexts/--as use the fixture stack and cannot be combined with --isolated/--dirty/--ref"],
    [contextsMode && (args.watchMs > 0 || args.baseline || args.diff), "--contexts/--as do not support --watch, --baseline, or --diff"],
    [args.stageDown && args.stageStatus, "--stage-down and --stage-status are mutually exclusive"],
    [
      args.matrix && (args.pages > 1 || contextsMode || args.watchMs > 0 || args.baseline || args.diff),
      "--matrix does not combine with --pages/--contexts/--as/--watch/--baseline/--diff",
    ],
  ];
}

function evidenceValidationPairs(args: Args, producesShot: boolean): ValidationPair[] {
  return [
    [args.crop !== null && !producesShot, "--crop requires a screenshot; drop --no-shot/--text or request --shot-of/baseline/diff"],
    [args.crop !== null && args.shotOf !== null, "--crop and --shot-of are mutually exclusive"],
    [args.mask.length > 0 && !producesShot, "--mask requires a screenshot; drop --no-shot/--text"],
    [args.fullPage && !producesShot, "--full requires a screenshot; drop --no-shot/--text"],
    [args.fullPage && args.shotOf !== null, "--full and --shot-of are mutually exclusive"],
    [(args.ariaDepth !== null || args.ariaBoxes) && !args.aria, "--aria-depth/--aria-boxes require --aria or --text"],
    [args.contrastPixel && args.contrast.length === 0, "--contrast-pixel requires at least one --contrast selector"],
  ];
}

function validateParsedArgs(args: Args): string[] {
  const contextsMode = args.contexts > 1 || args.as !== null;
  const producesShot = args.shotOf !== null || args.shot || args.baseline || args.diff;
  const invalidModes = [...sessionValidationPairs(args, contextsMode), ...evidenceValidationPairs(args, producesShot)];
  return [...validatePageTargets(args, contextsMode), ...invalidModes.filter(([invalid]) => invalid).map(([, message]) => message)];
}

export function parseSnapArgs(argv: string[]): Args {
  const errors = scanArgv(argv);
  const args: Args = {
    help: false,
    errors,
    scenario: null,
    matrix: false,
    json: false,
    summary: false,
    failureEvidence: true,
    strictConsole: false,
    checkpoint: false,
    includeHidden: false,
    route: "/",
    vnc: false,
    waitSelector: null,
    sseSeconds: 0,
    base: DEFAULT_BASE,
    fullPage: false,
    debugToken: DEFAULT_DEBUG_TOKEN,
    steps: [],
    navActions: [],
    pages: 1,
    contexts: 1,
    as: null,
    fixtureServer: null,
    fixtureBase: null,
    file: null,
    watchMs: 0,
    watchEveryMs: MS_PER_SECOND,
    out: null,
    viewport: DEFAULT_VIEWPORT,
    localStorage: [],
    probe: false,
    baseline: false,
    diff: false,
    deadCss: true,
    crop: null,
    aria: false,
    ariaSelector: "body",
    ariaDepth: null,
    ariaBoxes: false,
    ariaPage: 0,
    shot: true,
    shotOf: null,
    mask: [],
    colorScheme: null,
    reducedMotion: false,
    idle: false,
    eval: [],
    contrast: [],
    contrastPixel: false,
    assertions: [],
    map: false,
    mapSelector: "body",
    mapPage: 0,
    device: null,
    isolated: false,
    ref: null,
    fresh: false,
    dirty: false,
    stageDown: false,
    stageStatus: false,
  };
  const rest = [...argv];
  while (rest.length > 0) {
    const tok = rest.shift() as string;
    // Strip a `@<idx>` --pages suffix (0 when absent) so `--click@1` dispatches the SAME handler as
    // `--click`, just stamped with the target tab.
    const { flag, page } = splitPageSuffix(tok);
    const handler = FLAG_HANDLERS[flag];
    if (handler !== undefined) {
      handler(args, rest, page);
    } else if (tok.startsWith("--")) {
      // scanArgv already recorded it; parsing remains side-effect free for tests/importers.
    } else {
      args.route = tok;
    }
  }
  args.errors.push(...validateParsedArgs(args));
  return args;
}

// ── Capture phases ──────────────────────────────────────────────────────────

type CaptureOutcome = {
  /** The --pages tab this outcome belongs to (0 in single-page mode). */
  pageIndex: number;
  navError: string | null;
  stepFailures: number;
  /** --goto/--open-chat/--context-tab actions that failed on this page (reddens exit). */
  navFailures: number;
  deadCss: Array<{ token: string; count: number }>;
  emptyCss: string[];
  ariaText: string | null;
  ariaError: string | null;
  evalResults: EvalOutcome[];
  contrastResults: ContrastOutcome[];
  mapResult: MapEntry[] | null;
  mapError: string | null;
  assertions: AssertionOutcome[];
  perf: PerfEvidence | null;
  /** Indices into this capture's ProbeSession arrays when --checkpoint owns the verdict window. */
  evidenceRange: EvidenceRange | null;
};

type EvidenceRange = {
  readonly consoleStart: number;
  readonly consoleEnd: number;
  readonly pageErrorStart: number;
  readonly pageErrorEnd: number;
};

/** Did the app reach a SETTLED state? `settled` = the flag went up on a real query-cache idle; `degraded` =
 *  agent-bridge's ceiling handed the flag over with reads still running; `absent` = it never went up. */
type AppReadiness = "settled" | "degraded" | "absent";

async function appReadiness(page: Page, timeoutMs: number): Promise<AppReadiness> {
  const flag = page.locator("html[data-app-ready]");
  const attached = await flag
    .waitFor({ state: "attached", timeout: timeoutMs })
    .then(() => true)
    .catch(() => false);
  if (!attached) {
    return "absent";
  }
  return (await flag.getAttribute("data-app-ready")) === "degraded" ? "degraded" : "settled";
}

async function navigate(page: Page, opts: Args, url: string): Promise<string | null> {
  const navTimeout = opts.isolated ? STAGE_NAV_TIMEOUT_MS : NAV_TIMEOUT_MS;
  const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: navTimeout });
  let navError: string | null = null;
  if (!resp) {
    navError = "no response";
  } else if (!resp.ok()) {
    navError = `HTTP ${resp.status()}`;
  }
  // Default readiness gate: agent-bridge.ts sets `data-app-ready` on <html> once the initial reads
  // settle — independent of the never-idle SSE stream. Wait for it so snaps capture the SETTLED app,
  // not mid-hydration skeletons (the "lists sit on skeletons forever" friction). Graceful: a non-app
  // page or an old build that never sets it just falls through, so this only ever adds real load-wait,
  // never a hang.
  // --file (a static mock over file://) has no app and never sets the flag — waiting would burn the full
  // timeout on EVERY mock snap, so skip it there rather than pay a guaranteed-useless wait.
  //
  // THE RESULT IS REPORTED, NOT SWALLOWED (2026-08-09). This used to `.catch(() => undefined)` the whole
  // wait, so a page that never signalled ready produced a mid-hydration capture and a clean report — the
  // instrument failing open. It now reads the flag's VALUE too: agent-bridge hands over `degraded` when its
  // ceiling fires with reads still in flight. Either shape is a nav error on a route we are serving,
  // because the capture below is NOT of the settled app and every downstream assertion about it is void.
  if (opts.file === null) {
    const readiness = await appReadiness(page, opts.isolated ? STAGE_READY_TIMEOUT_MS : WAIT_SELECTOR_TIMEOUT_MS);
    if (readiness !== "settled" && navError === null) {
      navError =
        readiness === "absent"
          ? "app never signalled data-app-ready — the capture is MID-HYDRATION, not the settled app (a cold stage's first navigation is the usual cause; re-run against the now-warm stage)"
          : "data-app-ready came up DEGRADED — reads were still in flight at the readiness ceiling, so the capture is mid-hydration, not the settled app";
    }
  }
  // Even a non-OK nav may still render something worth waiting for (SPA error page).
  if (opts.waitSelector !== null) {
    await page.locator(opts.waitSelector).first().waitFor({ state: "visible", timeout: WAIT_SELECTOR_TIMEOUT_MS });
  }
  return navError;
}

// One step, one wait discipline. Throws on failure; runSteps counts + reports.
async function runStep(page: Page, step: Step): Promise<void> {
  const loc = page.locator(step.selector).first();
  if (step.kind === "waitfor") {
    // "attached" (in-DOM) is robust against the full-bleed-modal visibility
    // false-negative; the settle after handles paint.
    await loc.waitFor({ state: "attached", timeout: WAIT_SELECTOR_TIMEOUT_MS });
    return;
  }
  if (step.kind === "jsclick") {
    await loc.waitFor({ state: "attached", timeout: STEP_TIMEOUT_MS });
    // No HTMLElement cast: the root tsconfig that checks scripts/ is DOM-less.
    await loc.evaluate((el) => (el as unknown as { click: () => void }).click());
    return;
  }
  if (step.kind === "press") {
    await loc.waitFor({ state: "attached", timeout: STEP_TIMEOUT_MS });
    await loc.hover({ force: true });
    await settle(page, HOVER_REVEAL_MS);
    await loc.click({ force: true, timeout: STEP_TIMEOUT_MS });
    return;
  }
  await loc.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
  if (step.kind === "click") {
    await loc.click({ timeout: STEP_TIMEOUT_MS });
  } else if (step.kind === "hover") {
    await loc.hover();
  } else if (step.kind === "key") {
    await loc.press(step.key);
  } else {
    await loc.fill(step.value);
  }
}

async function runSteps(page: Page, steps: readonly Step[]): Promise<number> {
  let failures = 0;
  for (const step of steps) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: interaction steps are SEQUENTIAL by contract — argv order, each step may reveal the next step's target.
      await runStep(page, step);
      await settle(page, STEP_SETTLE_MS);
    } catch (e) {
      const msg = errorMessage(e);
      // Dev-server churn (HMR/restart/5xx) tears down the realm mid-run — say so distinctly and give the
      // step ONE retry after a settle, rather than reporting an environmental blip as an app failure.
      if (isContextChurn(msg)) {
        print(`${CHURN_LINE} — retrying: ${step.kind} ${step.selector}`);
        try {
          await settle(page, STEP_SETTLE_MS);
          await runStep(page, step);
          continue;
        } catch (retryErr) {
          failures += 1;
          print(`STEP FAILED (after churn retry)  ${step.kind} ${step.selector}: ${errorMessage(retryErr)}`);
          continue;
        }
      }
      failures += 1;
      print(`STEP FAILED  ${step.kind} ${step.selector}: ${msg}`);
    }
  }
  return failures;
}

// ── SPA navigation via the app's dev nav bridge (__orb.nav) ──────────────────
// Each --goto/--open-chat/--context-tab awaits app-readiness + __orb.ready, invokes the matching
// __orb.nav method IN-PAGE, and FAILS loudly (reddens exit like a STEP FAILED) on {ok:false} or a
// missing bridge. Runs BEFORE the regular steps so `--goto presets --map` maps the presets surface.
// __orb is dev-only (installAgentDebugHandle gates on IS_DEV) — a prod/old build with no bridge fails
// the action with a clear reason rather than silently no-op'ing.
const NAV_METHOD: Record<Exclude<NavAction["kind"], "goto">, string> = {
  "open-chat": "openChat",
  "open-character": "openCharacter",
  "context-tab": "contextTab",
};

// The in-page bridge call. --goto's target is a namespaced string the app doesn't understand directly
// (`settings:appearance`, `modal:theme`, or a bare section id) — DECODE it in Node via parseGotoTarget
// (unit-tested, _kit/flags.ts) to the right __orb.nav method, then emit a call to just that method. All
// other kinds map 1:1. Returns the NavResult shape.
function buildNavScript(action: NavAction): string {
  const method = action.kind === "goto" ? parseGotoTarget(action.target).method : NAV_METHOD[action.kind];
  const arg = JSON.stringify(action.kind === "goto" ? parseGotoTarget(action.target).arg : action.target);
  return `(async () => {
    const nav = window.__orb && window.__orb.nav;
    if (!nav) return { ok: false, reason: "__orb.nav unavailable (not a dev build?)" };
    return await nav.${method}(${arg});
  })()`;
}

type NavResultShape = { ok: boolean; reason?: string };

// Run one page's nav actions in argv order; returns the failure count (each failure prints + reddens exit).
async function runNavActions(page: Page, actions: readonly NavAction[]): Promise<number> {
  let failures = 0;
  for (const action of actions) {
    // Every nav action needs the app hydrated AND the bridge installed — wait on both, gracefully bounded.
    // biome-ignore lint/performance/noAwaitInLoops: nav actions are argv-ordered and each may depend on the prior surface being live (open a modal, then a settings pane) — sequential by contract.
    await page
      .locator("html[data-app-ready]")
      .waitFor({ state: "attached", timeout: WAIT_SELECTOR_TIMEOUT_MS })
      .catch(() => undefined);
    let result: NavResultShape;
    try {
      // (Awaits below share the loop's one noAwaitInLoops suppression above — sequential by contract:
      // the bridge must be ready, then the nav call + its store write must settle before the next action.)
      await page.evaluate("window.__orb && window.__orb.ready").catch(() => undefined);
      result = (await page.evaluate(buildNavScript(action))) as NavResultShape;
    } catch (e) {
      failures += 1;
      print(`NAV FAILED  ${action.kind} ${action.target}: ${errorMessage(e)}`);
      continue;
    }
    if (!result.ok) {
      failures += 1;
      print(`NAV FAILED  ${action.kind} ${action.target}: ${result.reason ?? "rejected"}`);
      continue;
    }
    // Let the store write + view transition settle before the next action / the shot.
    await settle(page, STEP_SETTLE_MS);
  }
  return failures;
}

async function settlePage(page: Page, opts: Args): Promise<void> {
  if (opts.idle) {
    // Wait for the network to go quiet (bounded) — a real settle for routes whose
    // content lands via deferred queries, instead of guessing a timeout.
    // biome-ignore lint/nursery/noPlaywrightNetworkidle: explicit opt-in (--idle) with a hard bound — settling on network-quiet IS the flag's contract.
    await page.waitForLoadState("networkidle", { timeout: NETWORKIDLE_TIMEOUT_MS }).catch(() => {
      /* bounded — a chatty stream must never block the shot */
    });
  }
  if (opts.sseSeconds > 0) {
    await settle(page, opts.sseSeconds * MS_PER_SECOND);
  } else if (!opts.idle) {
    await settle(page, MOUNT_SETTLE_MS);
  }
}

type AriaOutcome = { readonly text: string | null; readonly error: string | null };

async function captureAria(page: Page, opts: Args): Promise<AriaOutcome> {
  try {
    const root = page.locator(opts.ariaSelector).first();
    await root.waitFor({ state: "attached", timeout: WAIT_SELECTOR_TIMEOUT_MS });
    const ariaOpts: { depth?: number; boxes?: boolean } = { boxes: opts.ariaBoxes };
    if (opts.ariaDepth !== null) {
      ariaOpts.depth = opts.ariaDepth;
    }
    return { text: await root.ariaSnapshot(ariaOpts), error: null };
  } catch (e) {
    return { text: null, error: `ARIA capture failed for "${opts.ariaSelector}": ${errorMessage(e)}` };
  }
}

// ── --eval: arbitrary in-page JS ────────────────────────────────────────────

type EvalOutcome = { expr: string; text: string; failed: boolean };

// A bare function LITERAL passed to page.evaluate(string) evaluates to the FUNCTION, never invokes it
// — so `async () => {…}` silently returns undefined (the worst failure mode). Detect a function literal
// (arrow or `function`) and auto-invoke it as `(<expr>)()`. A plain value/expression is left untouched.
const FN_LITERAL_RE = /^\s*(?:async\s+)?(?:function\b|(?:async\s*)?\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/u;
const INVOKED_ARROW_RE = /^\s*\(\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>[\s\S]*\)\s*\(\s*\)\s*$/u;
function wrapEvalExpr(expr: string): string {
  return !INVOKED_ARROW_RE.test(expr) && FN_LITERAL_RE.test(expr) ? `(${expr})()` : expr;
}

// A dev-server churn (HMR reload / Vite restart / tRPC 5xx mid-run) tears down the page's JS realm; its
// error text is indistinguishable from an app bug unless we name it. These are the Playwright/Chromium
// signatures for "the world moved under us," NOT "your selector/logic is wrong."
const CHURN_SIGNATURES = [
  "Execution context was destroyed",
  "context was destroyed",
  "Target closed",
  "Target page, context or browser has been closed",
  "frame was detached",
];
function isContextChurn(message: string): boolean {
  return CHURN_SIGNATURES.some((sig) => message.includes(sig));
}
const CHURN_LINE = "[snap] server churned mid-run (HMR/restart?) — step failed for environmental reasons";

async function captureEvals(page: Page, exprs: readonly string[]): Promise<EvalOutcome[]> {
  const results: EvalOutcome[] = [];
  for (const expr of exprs) {
    let text: string;
    let failed = false;
    try {
      // biome-ignore lint/performance/noAwaitInLoops: evals are argv-ordered and independent — sequential to keep report order matching argv, same discipline as runSteps.
      const value: unknown = await page.evaluate(wrapEvalExpr(expr));
      text = value === undefined ? "undefined" : JSON.stringify(value, null, 2);
      if (text.length > EVAL_RESULT_CAP) {
        // Loud, on its OWN first line (a quiet suffix hid mid-array cuts) so a capped result is never
        // mistaken for the whole thing.
        text = `[TRUNCATED ${EVAL_RESULT_CAP}/${text.length} chars]\n${text.slice(0, EVAL_RESULT_CAP)}`;
      }
    } catch (e) {
      failed = true;
      const msg = errorMessage(e);
      text = isContextChurn(msg) ? `EVAL ERROR: ${msg}\n${CHURN_LINE}` : `EVAL ERROR: ${msg}`;
    }
    results.push({ expr, text, failed });
  }
  return results;
}

type AssertionOutcome = { readonly line: string; readonly failed: boolean };

async function visibleLocators(locator: Locator, includeHidden: boolean): Promise<Locator[]> {
  const count = await locator.count();
  const candidates = Array.from({ length: count }, (_, index) => locator.nth(index));
  if (includeHidden) {
    return candidates;
  }
  const visible = await Promise.all(candidates.map((candidate) => candidate.isVisible()));
  return candidates.filter((_, index) => visible[index]);
}

function urlMatches(actual: string, expected: string): boolean {
  if (HTTP_URL_RE.test(expected)) {
    return actual === expected;
  }
  const url = new URL(actual);
  return `${url.pathname}${url.search}${url.hash}` === expected;
}

function assertUrl(page: Page, assertion: Extract<Assertion, { kind: "url" }>): AssertionOutcome {
  const actual = page.url();
  const pass = urlMatches(actual, assertion.expected);
  return { line: `ASSERT url ${JSON.stringify(assertion.expected)}: ${pass ? "PASS" : `FAIL actual=${JSON.stringify(actual)}`}`, failed: !pass };
}

function assertCount(assertion: Extract<Assertion, { kind: "count" }>, candidates: readonly Locator[], includeHidden: boolean): AssertionOutcome {
  const pass = candidates.length === assertion.expected;
  const scope = includeHidden ? "all DOM" : "rendered";
  return {
    line: `ASSERT count ${assertion.selector}: ${pass ? "PASS" : "FAIL"} actual=${candidates.length} expected=${assertion.expected} scope=${scope}`,
    failed: !pass,
  };
}

async function runMatchedAssertion(
  assertion: Exclude<Assertion, { kind: "url" | "visible" }>,
  candidates: readonly Locator[],
  includeHidden: boolean,
): Promise<AssertionOutcome> {
  if (assertion.kind === "count") {
    return assertCount(assertion, candidates, includeHidden);
  }
  const first = candidates[0];
  if (first === undefined) {
    return { line: `ASSERT ${assertion.kind} ${assertion.selector}: FAIL no ${includeHidden ? "attached" : "rendered"} match`, failed: true };
  }
  if (assertion.kind === "text") {
    const actual = (await first.textContent()) ?? "";
    const pass = actual.includes(assertion.expected);
    return {
      line: `ASSERT text ${assertion.selector}: ${pass ? "PASS" : `FAIL expected=${JSON.stringify(assertion.expected)} actual=${JSON.stringify(actual)}`}`,
      failed: !pass,
    };
  }
  if (assertion.kind === "focus") {
    const pass = await first.evaluate((element) => (element as unknown as { matches: (selector: string) => boolean }).matches(":focus"));
    return { line: `ASSERT focus ${assertion.selector}: ${pass ? "PASS" : "FAIL"}`, failed: !pass };
  }
  const overflow = await first.evaluate((element) => {
    const box = element as unknown as { scrollWidth: number; clientWidth: number; scrollHeight: number; clientHeight: number };
    return { x: box.scrollWidth - box.clientWidth, y: box.scrollHeight - box.clientHeight };
  });
  const pass = overflow.x <= 1 && overflow.y <= 1;
  return {
    line: `ASSERT no-overflow ${assertion.selector}: ${pass ? "PASS" : "FAIL"} overflow=${overflow.x}x${overflow.y}`,
    failed: !pass,
  };
}

async function runAssertion(page: Page, assertion: Assertion, includeHidden: boolean): Promise<AssertionOutcome> {
  if (assertion.kind === "url") {
    return assertUrl(page, assertion);
  }
  const locator = page.locator(assertion.selector);
  if (assertion.kind === "visible") {
    const pass = await locator
      .first()
      .isVisible()
      .catch(() => false);
    return { line: `ASSERT visible ${assertion.selector}: ${pass ? "PASS" : "FAIL"}`, failed: !pass };
  }
  return await runMatchedAssertion(assertion, await visibleLocators(locator, includeHidden), includeHidden);
}

async function runAssertions(page: Page, assertions: readonly Assertion[], includeHidden: boolean): Promise<AssertionOutcome[]> {
  const outcomes: AssertionOutcome[] = [];
  for (const assertion of assertions) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: assertions preserve argv order and may read focus/state established by the preceding assertion target.
      outcomes.push(await runAssertion(page, assertion, includeHidden));
    } catch (error) {
      outcomes.push({ line: `ASSERT ${assertion.kind}: ERROR ${errorMessage(error)}`, failed: true });
    }
  }
  return outcomes;
}

type PerfEvidence = {
  readonly navigation: { readonly domContentLoadedMs: number; readonly loadMs: number; readonly responseMs: number } | null;
  readonly orb: unknown;
};

async function capturePerfEvidence(page: Page): Promise<PerfEvidence | null> {
  try {
    return (await page.evaluate(`(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      return {
        navigation: nav ? {
          domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
          loadMs: Math.round(nav.loadEventEnd),
          responseMs: Math.round(nav.responseEnd),
        } : null,
        orb: window.__orb ? window.__orb.snap() : null,
      };
    })()`)) as PerfEvidence;
  } catch {
    return null;
  }
}

// ── --contrast: WCAG AA text/background contrast of the first selector match ─

// RAW STRING (JSON.stringify-interpolated selector), not a function reference — see
// scanDeadCss's header note: tsx's keepNames __name helper breaks a serialized function in
// the browser context. This IIFE gathers RAW facts only (colors as strings, size, weight) —
// ALL classification (large-text/ratio/pass-fail) happens back in Node, reusing
// design-audit-checks.ts's WCAG math, same split as design-audit.ts's walker.
function buildContrastScript(selector: string): string {
  return `(() => {
    var el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    // Tailwind v4 tokens are oklch(); Chromium's getComputedStyle SERIALIZES CSS Color 4
    // functions (oklch/oklab/lab/lch/color()) back verbatim rather than converting to rgb() —
    // so style.color can read "oklch(0.7 0.1 200)". Round-tripping through fillStyle does NOT
    // fix this (Chromium 149 preserves oklch() there too, verified empirically) — but actually
    // COMPOSITING to a canvas pixel and reading the byte values back DOES force real sRGB
    // conversion (canvas is an 8-bit raster surface; un-premultiply cancels any source alpha,
    // so this is accurate even for translucent colors). One shared 1x1 probe canvas, reused
    // across every color this script converts.
    var probeCanvas = document.createElement("canvas");
    probeCanvas.width = 1;
    probeCanvas.height = 1;
    var probeCtx = probeCanvas.getContext("2d", { willReadFrequently: true });
    function toRgbString(cssColor) {
      probeCtx.clearRect(0, 0, 1, 1);
      probeCtx.fillStyle = cssColor;
      probeCtx.fillRect(0, 0, 1, 1);
      var d = probeCtx.getImageData(0, 0, 1, 1).data;
      return "rgb(" + d[0] + ", " + d[1] + ", " + d[2] + ")";
    }
    function isTransparent(c) { return c === "rgba(0, 0, 0, 0)" || c === "transparent"; }
    // TRUE opacity test: composite the color over pure black AND pure white; identical bytes ⇒ alpha 1.
    // (Avoids parsing oklch()/oklab() alpha in-page.)
    function compositeOver(cssColor, baseRgb) {
      probeCtx.clearRect(0, 0, 1, 1);
      probeCtx.fillStyle = baseRgb;
      probeCtx.fillRect(0, 0, 1, 1);
      probeCtx.fillStyle = cssColor; // source-over IS alpha compositing
      probeCtx.fillRect(0, 0, 1, 1);
      var d = probeCtx.getImageData(0, 0, 1, 1).data;
      return "rgb(" + d[0] + ", " + d[1] + ", " + d[2] + ")";
    }
    function isOpaque(cssColor) {
      return compositeOver(cssColor, "rgb(0,0,0)") === compositeOver(cssColor, "rgb(255,255,255)");
    }
    // Walk ancestors collecting every non-transparent background from the element DOWN to the first
    // OPAQUE one (the real base), then composite the translucent layers over it bottom-to-top. A glass
    // panel (color-mix at 0.7 alpha) over a dark base now yields the VISUAL backdrop the eye sees — the
    // old code took a translucent layer's own rgb as if opaque (the 1.11-vs-2.6 false-FAIL side-eye hit).
    //
    // THE FALSE-FLAT BLIND SPOT: this ancestor walk sees only the DOM chain — a FIXED-position sibling
    // layer (the app's ThemeBackgroundLayer photo, or a scrim painting under .shell-grid) is invisible
    // to it. If the chain resolves with NO opaque background found, the old code fabricated a white base
    // and passed text that was actually ~1.8:1 over a bright photo. We now REFUSE that: a walk that
    // never hits an opaque bg returns "transparent" (Node pixel-samples the real composite), and a
    // background-image ancestor returns "indeterminate" (Node pixel-samples too) — never a fake baseline.
    //
    // FIXED SIBLING OVER AN OPAQUE ROOT (blind-spot round 2): ThemeBackgroundLayer paints its photo as a
    // fixed z-base sibling OVER the opaque <body>/<html>. So an "opaque base" found only at the root is
    // NOT what's visually behind the element — the photo occludes it. When the app's bg-image is active
    // (its own [data-has-bg-image] shell signal), a root-level base is untrustworthy → pixel-sample.
    // (GENERIC GAP not covered: any app that paints a fixed sibling over the body without this signal
    // would still fool the root-base trust — a generic "root base + a fixed painted layer exists" →
    // indeterminate rule could catch it, but is left out here as it can't be verified app-agnostically.)
    var bgImageActive = document.querySelector("[data-has-bg-image]") !== null;
    function resolveBackdrop(node) {
      var layers = []; // element-first (topmost) → base-last (bottommost non-transparent)
      var base = null;
      while (node) {
        var s = getComputedStyle(node);
        if (s.backgroundImage && s.backgroundImage !== "none") return { kind: "indeterminate" };
        var bc = s.backgroundColor;
        if (!isTransparent(bc)) {
          if (isOpaque(bc)) {
            if (bgImageActive && (node === document.body || node === document.documentElement)) {
              return { kind: "transparent" };
            }
            base = toRgbString(bc);
            break;
          }
          layers.push(bc);
        }
        node = node.parentElement;
      }
      // No opaque base anywhere in the chain — a fixed/sibling layer may be painting behind, unseen.
      // Don't invent white; tell Node to pixel-sample the actual rendered pixels.
      if (base === null) return { kind: "transparent" };
      // Paint the opaque base, then the translucent layers bottom-up (reverse of the element-first array).
      var acc = base;
      for (var i = layers.length - 1; i >= 0; i--) acc = compositeOver(layers[i], acc);
      return { kind: "flat", color: acc };
    }
    var style = getComputedStyle(el);
    var fw = style.fontWeight;
    var fontWeight = fw === "bold" ? 700 : fw === "normal" ? 400 : Number(fw) || 400;
    // ::placeholder blind spot: an EMPTY input/textarea paints its PLACEHOLDER, not its text color —
    // reading style.color measures the (invisible) text color and reports a false PASS. When the field
    // is empty, measure the pseudo-element's color instead (the pixels the eye actually sees).
    var tag = el.tagName;
    var colorSource = style.color;
    if ((tag === "INPUT" || tag === "TEXTAREA") && !el.value) {
      var phColor = getComputedStyle(el, "::placeholder").color;
      if (phColor && !isTransparent(phColor)) colorSource = phColor;
    }
    // Role/content awareness (Node applies the threshold): a target that renders NO text is a UI
    // COMPONENT (WCAG 1.4.11, 3:1), not a 4.5:1 text target; a control-track role is skipped entirely.
    var role = el.getAttribute("role") || "";
    if (!role) {
      if (tag === "INPUT") {
        var inputType = (el.getAttribute("type") || "text").toLowerCase();
        if (inputType === "range") role = "slider";
        else if (inputType === "checkbox") role = "checkbox";
      } else if (tag === "PROGRESS") role = "progressbar";
    }
    var hasText = (el.textContent || "").replace(/\\s+/g, " ").trim().length > 0;
    var inactive = el.matches(":disabled,[aria-disabled='true']") || el.closest("[inert]") !== null;
    // ANCESTOR opacity dims the FOREGROUND (blind-spot round 2): a message-actions row at opacity-40
    // paints the whole subtree — the icon's glyph included — at 0.4 over its backdrop, but style.color
    // still reads the UN-dimmed rgb (a ~11:1 false PASS where the eye sees ~2.6:1). CSS opacity groups
    // multiply down the chain, so accumulate the product over the element + every ancestor. Node then
    // composites the foreground rgb at this alpha over the resolved backdrop before the ratio (the
    // BACKGROUND half is already handled — css-resolve/pixel-sample sees the true bg; the FOREGROUND
    // dimming is the half only this multiply can fix). Note: a background INSIDE the dimmed group is an
    // unhandled edge (rare) — the common case is a transparent-bg row over an opaque backdrop.
    var foregroundOpacity = 1;
    var opNode = el;
    while (opNode) {
      var opRaw = getComputedStyle(opNode).opacity;
      var opVal = opRaw === "" ? 1 : Number(opRaw);
      if (!Number.isNaN(opVal)) foregroundOpacity *= opVal;
      opNode = opNode.parentElement;
    }
    var rect = el.getBoundingClientRect();
    return {
      color: toRgbString(colorSource),
      fontSizePx: Number.parseFloat(style.fontSize) || 16,
      fontWeight: fontWeight,
      backdrop: resolveBackdrop(el),
      hasText: hasText,
      inactive: inactive,
      role: role,
      tag: tag,
      foregroundOpacity: foregroundOpacity,
      box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    };
  })()`;
}

type ContrastFacts = {
  color: string;
  fontSizePx: number;
  fontWeight: number;
  // "flat" = a trustworthy opaque ancestor bg (css-resolve path); "transparent"/"indeterminate" = the
  // ancestor walk couldn't see the real backdrop (a fixed sibling layer / a background-image) — Node
  // pixel-samples the composite instead of trusting a fabricated baseline.
  backdrop: { kind: "flat"; color: string } | { kind: "transparent" } | { kind: "indeterminate" };
  hasText: boolean;
  inactive: boolean;
  role: string;
  tag: string;
  /** Product of `opacity` over the element + ancestors — <1 means the foreground is painted dimmed and
   *  must be composited at this alpha over the backdrop before measuring. */
  foregroundOpacity: number;
  box: { x: number; y: number; width: number; height: number };
} | null;

// buildContrastScript's toRgbString ALWAYS emits this exact "rgb(r, g, b)" shape (it composites
// to a canvas pixel and reads the bytes back itself, sidestepping getComputedStyle's oklch()
// passthrough) — so this is the only shape parseRgbString ever needs to handle.
const RGB_STRING_RE = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/u;

function parseRgbString(s: string): Rgb | null {
  const m = RGB_STRING_RE.exec(s);
  if (!(m?.[1] && m[2] && m[3])) {
    return null;
  }
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
}

type ContrastOutcome = { line: string; failed: boolean };
type Box = { x: number; y: number; width: number; height: number };

function medianChannel(values: number[]): number {
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)] ?? 0;
}

// Alpha-composite a foreground rgb at `opacity` over the backdrop (source-over) — the visible color of a
// glyph painted inside an opacity<1 group. opacity 1 is a no-op; opacity 0 is the pure backdrop.
function compositeForeground(fg: Rgb, bg: Rgb, opacity: number): Rgb {
  const mix = (f: number, b: number): number => Math.round(opacity * f + (1 - opacity) * b);
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b) };
}

// Per-channel median of the box's PERIMETER RING (raw RGBA from sharp). The ring is background by
// construction (text/icon glyphs live in the interior), so this yields the composited backdrop the eye
// sees behind the foreground — the fixed photo layer + any scrim + the element's own translucent bg all
// baked into real pixels — without the glyphs contaminating the number.
function ringBackdrop(data: Buffer, width: number, height: number, channels: number): Rgb {
  const ring = Math.max(1, Math.min(SAMPLE_RING_MAX_PX, Math.floor(Math.min(width, height) * SAMPLE_RING_FRAC)));
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  for (let y = 0; y < height; y += 1) {
    const edgeRow = y < ring || y >= height - ring;
    for (let x = 0; x < width; x += 1) {
      if (!(edgeRow || x < ring || x >= width - ring)) {
        continue;
      }
      const i = (y * width + x) * channels;
      rs.push(data[i] ?? 0);
      gs.push(data[i + 1] ?? 0);
      bs.push(data[i + 2] ?? 0);
    }
  }
  return { r: medianChannel(rs), g: medianChannel(gs), b: medianChannel(bs) };
}

// Screenshot the element's box (clamped into the viewport — an overflowing clip makes Playwright throw)
// and read the composited backdrop from real pixels. Returns an error (never a fabricated color) when the
// box is empty/off-screen or the shot/decode fails — the caller reports UNRESOLVED loudly.
async function pixelSampleBackdrop(page: Page, box: Box, viewport: Viewport): Promise<{ rgb: Rgb } | { error: string }> {
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  const width = Math.min(Math.ceil(box.width), viewport.width - x);
  const height = Math.min(Math.ceil(box.height), viewport.height - y);
  if (width < 1 || height < 1) {
    return { error: "element box is empty or fully off-screen" };
  }
  let buf: Buffer;
  try {
    buf = await page.screenshot({ clip: { x, y, width, height }, animations: "disabled" });
  } catch (e) {
    return { error: `screenshot failed: ${errorMessage(e)}` };
  }
  try {
    const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    return { rgb: ringBackdrop(data, info.width, info.height, info.channels) };
  } catch (e) {
    return { error: `pixel decode failed: ${errorMessage(e)}` };
  }
}

// Resolve the backdrop as an { rgb, method } pair — trusting the cheap css-resolve ONLY for a genuine
// opaque ancestor; every transparent/indeterminate resolve (the false-flat blind spot) pixel-samples.
async function resolveContrastBackdrop(
  page: Page,
  facts: NonNullable<ContrastFacts>,
  forcePixel: boolean,
  viewport: Viewport,
): Promise<{ rgb: Rgb; method: "css-resolve" | "pixel-sample" } | { error: string }> {
  if (!forcePixel && facts.backdrop.kind === "flat") {
    const rgb = parseRgbString(facts.backdrop.color);
    return rgb === null ? { error: `unparseable backdrop (${facts.backdrop.color})` } : { rgb, method: "css-resolve" };
  }
  const sampled = await pixelSampleBackdrop(page, facts.box, viewport);
  if ("error" in sampled) {
    const why = facts.backdrop.kind === "indeterminate" ? "over background-image" : "transparent ancestor chain";
    return {
      error: `UNRESOLVED  ${why}; pixel sample failed (${sampled.error}) — refusing a fabricated flat baseline`,
    };
  }
  return { rgb: sampled.rgb, method: "pixel-sample" };
}

async function checkContrast(page: Page, selector: string, forcePixel: boolean, viewport: Viewport): Promise<ContrastOutcome> {
  let facts: ContrastFacts;
  try {
    facts = (await page.evaluate(buildContrastScript(selector))) as ContrastFacts;
  } catch (e) {
    return { line: `CONTRAST ${selector}: EVAL ERROR: ${errorMessage(e)}`, failed: true };
  }
  if (facts === null) {
    return { line: `CONTRAST ${selector}: NOT FOUND`, failed: true };
  }
  // WCAG contrast criteria exempt inactive controls. Reporting their deliberate dimming as a defect
  // trains reviewers to ignore the instrument, so state the exemption and leave the run green.
  if (facts.inactive) {
    return { line: `CONTRAST ${selector}: SKIPPED  inactive control (WCAG contrast exemption)`, failed: false };
  }
  // (2) Control-track roles: text-vs-page contrast is meaningless here — the two STATES are the signal,
  // and WCAG 1.4.11 governs the state boundary (a separate measurement). Skip with a reason rather than
  // emit the bogus 1.71:1 text-math FAIL reviewers had to learn to ignore.
  if (CONTROL_TRACK_ROLES.has(facts.role)) {
    return {
      line: `CONTRAST ${selector}: SKIPPED  ${facts.role} track — two-state control; text-vs-page contrast N/A (WCAG 1.4.11 boundary unmeasured here)`,
      failed: false,
    };
  }
  const backdrop = await resolveContrastBackdrop(page, facts, forcePixel, viewport);
  if ("error" in backdrop) {
    return { line: `CONTRAST ${selector}: ${backdrop.error}`, failed: true };
  }
  const rawFg = parseRgbString(facts.color);
  if (rawFg === null) {
    return { line: `CONTRAST ${selector}: unparseable color (${facts.color})`, failed: true };
  }
  // Ancestor opacity dims the foreground — composite it at the accumulated alpha over the resolved
  // backdrop before measuring (a 40%-opacity actions row's icon reads ~11:1 raw, ~2.6:1 as seen).
  const dimmed = facts.foregroundOpacity < FOREGROUND_OPACITY_EPS;
  const fg = dimmed ? compositeForeground(rawFg, backdrop.rgb, facts.foregroundOpacity) : rawFg;
  const dimNote = dimmed ? ` · dimmed α${facts.foregroundOpacity.toFixed(2)}` : "";
  // (2) Role/content-aware threshold: NO rendered text ⇒ a UI-COMPONENT boundary (WCAG 1.4.11, 3:1);
  // text keeps 4.5:1 (3:1 where the size/weight qualifies it as large).
  const isComponent = !facts.hasText;
  const large = isLargeText(facts.fontSizePx, facts.fontWeight);
  const textRatio = large ? LARGE_MIN_RATIO : NORMAL_MIN_RATIO;
  const needRatio = isComponent ? UI_COMPONENT_MIN_RATIO : textRatio;
  const kindLabel = isComponent ? "ui-component" : "text";
  const fontDisplay = `${Math.round(facts.fontSizePx)}px${facts.fontWeight >= BOLD_WEIGHT ? "b" : ""}`;
  const ratio = contrastRatio(fg, backdrop.rgb);
  const pass = ratio >= needRatio;
  const tail = `(${kindLabel} · font ${fontDisplay} · need ${needRatio.toFixed(1)} · ${backdrop.method}${dimNote})`;
  return {
    line: `CONTRAST ${selector}: ${ratio.toFixed(2)}:1  ${pass ? "PASS" : "FAIL"}  ${tail}`,
    failed: !pass,
  };
}

async function captureContrasts(page: Page, selectors: readonly string[], forcePixel: boolean, viewport: Viewport): Promise<ContrastOutcome[]> {
  const results: ContrastOutcome[] = [];
  for (const selector of selectors) {
    // biome-ignore lint/performance/noAwaitInLoops: argv-ordered, independent checks — same discipline as captureEvals/runSteps.
    results.push(await checkContrast(page, selector, forcePixel, viewport));
  }
  return results;
}

// ── --map: a live selector map (role · accessible name · best stable selector) ──────────────
// "How do I reach this" instead of grepping source. Runs POST-STEPS so `--click X --map` maps
// a just-revealed surface (a settings dialog). RAW STRING IIFE (JSON.stringify-interpolated
// scope selector) — same keepNames constraint as scanDeadCss/buildContrastScript. Unlike
// --contrast, this whole decision (role/name resolution, selector priority) has no WCAG-style
// fixed threshold to unit-test in Node, so it's formatted entirely in-page — nothing for
// design-audit-checks.ts to own.
const MAP_INTERACTIVE_SELECTOR = "a,button,[role],input,select,textarea,[tabindex],[aria-label]";

function buildMapScript(selector: string, includeHidden: boolean): string {
  return `(() => {
    var root = document.querySelector(${JSON.stringify(selector)});
    if (!root) return null;
    var INTERACTIVE_SELECTOR = ${JSON.stringify(MAP_INTERACTIVE_SELECTOR)};
    var IMPLICIT_ROLE = { a: "link", aside: "complementary", button: "button", form: "form", img: "img", main: "main", nav: "navigation", select: "combobox", svg: "img", textarea: "textbox" };
    var INPUT_ROLES = { checkbox: "checkbox", radio: "radio", button: "button", submit: "button", range: "slider", search: "searchbox" };
    var NON_TARGET_ROLES = { generic: true, listitem: true, none: true, presentation: true };
    var LABELED_STRUCTURE_ROLES = { article: true, complementary: true, form: true, group: true, list: true, log: true, main: true, navigation: true, region: true, status: true };

    function isVisible(el) {
      if (${JSON.stringify(includeHidden)}) return true;
      if (typeof el.checkVisibility === "function" && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true })) return false;
      var style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
      var rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      var cur = el;
      while (cur && cur !== document.body) {
        if (cur.hidden || cur.inert || cur.getAttribute("aria-hidden") === "true") return false;
        cur = cur.parentElement;
      }
      return true;
    }
    function resolveRole(el) {
      var explicit = el.getAttribute("role");
      if (explicit) return explicit;
      var tag = el.tagName.toLowerCase();
      if (tag === "input") {
        var type = (el.getAttribute("type") || "text").toLowerCase();
        return INPUT_ROLES[type] || "textbox";
      }
      if (IMPLICIT_ROLE[tag]) return IMPLICIT_ROLE[tag];
      return el.hasAttribute("tabindex") ? "generic" : "";
    }
    function accessibleName(el) {
      var al = el.getAttribute("aria-label");
      if (al && al.trim()) return al.trim();
      var lbId = el.getAttribute("aria-labelledby");
      if (lbId) {
        var text = lbId.split(/\\s+/).map(function (id) {
          var t = document.getElementById(id);
          return t ? t.textContent.trim() : "";
        }).join(" ").trim();
        if (text) return text;
      }
      var text2 = (el.textContent || "").trim().replace(/\\s+/g, " ");
      if (text2) return text2;
      var title = el.getAttribute("title");
      if (title && title.trim()) return title.trim();
      if (el.tagName === "INPUT") {
        var ph = el.getAttribute("placeholder");
        if (ph && ph.trim()) return ph.trim();
      }
      var alt = el.getAttribute("alt");
      if (alt && alt.trim()) return alt.trim();
      return "";
    }
    function nthOfType(node) {
      var idx = 1;
      var sib = node.previousElementSibling;
      while (sib) {
        if (sib.tagName === node.tagName) idx += 1;
        sib = sib.previousElementSibling;
      }
      return node.tagName.toLowerCase() + ":nth-of-type(" + idx + ")";
    }
    // Fallback #4: a complete nth-of-type path from body. Verbose but unique in this live DOM; captureMap
    // validates it before exposing it. A short "neighborhood" path is not an executable agent handle.
    function fallbackPath(node) {
      var parts = [];
      var cur = node;
      while (cur && cur !== document.body) {
        parts.unshift(nthOfType(cur));
        cur = cur.parentElement;
      }
      return "body > " + parts.join(" > ");
    }
    // Priority: 1) own data-testid  2) nearest ancestor testid that UNIQUELY wraps this element
    // (its only interactive/labeled descendant)  3) own aria-label  4) role=X[name="Y"]
    // (Playwright locator syntax)  5) fallback ancestor-chain path.
    function bestSelector(el, role, name) {
      var testid = el.getAttribute("data-testid");
      if (testid) return "[data-testid=" + JSON.stringify(testid) + "]";
      var anc = el.parentElement;
      var hops = 0;
      while (anc && hops < 3) {
        var atid = anc.getAttribute("data-testid");
        if (atid) {
          if (anc.querySelectorAll(INTERACTIVE_SELECTOR).length === 1) {
            return "[data-testid=" + JSON.stringify(atid) + "] " + el.tagName.toLowerCase();
          }
          break;
        }
        anc = anc.parentElement;
        hops += 1;
      }
      var ownLabel = el.getAttribute("aria-label");
      if (ownLabel && ownLabel.trim()) {
        var visibleOnly = ${JSON.stringify(includeHidden)} ? "" : ":visible";
        return "[aria-label=" + JSON.stringify(ownLabel.trim()) + "]" + visibleOnly;
      }
      if (role && name) return "role=" + role + "[name=" + JSON.stringify(name) + "]";
      return fallbackPath(el);
    }

    var out = [];
    var els = root.querySelectorAll(INTERACTIVE_SELECTOR);
    for (var i = 0; i < els.length; i += 1) {
      var el = els[i];
      if (!isVisible(el)) continue;
      var role = resolveRole(el);
      if (NON_TARGET_ROLES[role]) continue;
      if (LABELED_STRUCTURE_ROLES[role] && !el.hasAttribute("aria-label") && !el.hasAttribute("aria-labelledby")) continue;
      var name = accessibleName(el);
      if (!role && !name) continue;
      out.push({
        role: role || "(none)",
        name: name,
        selector: bestSelector(el, role, name),
        semanticFallback: role && name ? "role=" + role + "[name=" + JSON.stringify(name) + "]" : "",
        fallback: fallbackPath(el)
      });
    }
    // An ambiguous selector is not navigation help. Preserve the best semantic selector, then add the
    // Playwright-native nth engine only when repeated names/labels make it non-unique on this surface.
    var totals = Object.create(null);
    var seen = Object.create(null);
    for (var j = 0; j < out.length; j += 1) totals[out[j].selector] = (totals[out[j].selector] || 0) + 1;
    for (var k = 0; k < out.length; k += 1) {
      var base = out[k].selector;
      if (totals[base] > 1) {
        var occurrence = seen[base] || 0;
        out[k].selector = base + " >> nth=" + occurrence;
        seen[base] = occurrence + 1;
      }
    }
    return out;
  })()`;
}

type MapEntry = { role: string; name: string; selector: string; source: "semantic" | "dom" };
type RawMapEntry = Omit<MapEntry, "source"> & { fallback: string; semanticFallback: string };

async function mapSelectorIsExecutable(page: Page, selector: string, includeHidden: boolean): Promise<boolean> {
  const locator = page.locator(selector);
  const count = await locator.count().catch(() => 0);
  return count === 1 && (includeHidden || locator.isVisible().catch(() => false));
}

async function validateMapEntry(page: Page, entry: RawMapEntry, includeHidden: boolean): Promise<MapEntry> {
  if (await mapSelectorIsExecutable(page, entry.selector, includeHidden)) {
    return {
      role: entry.role,
      name: entry.name,
      selector: entry.selector,
      source: entry.selector === entry.fallback ? "dom" : "semantic",
    };
  }
  if (
    entry.semanticFallback !== "" &&
    entry.semanticFallback !== entry.selector &&
    (await mapSelectorIsExecutable(page, entry.semanticFallback, includeHidden))
  ) {
    return { role: entry.role, name: entry.name, selector: entry.semanticFallback, source: "semantic" };
  }
  if (await mapSelectorIsExecutable(page, entry.fallback, includeHidden)) {
    return { role: entry.role, name: entry.name, selector: entry.fallback, source: "dom" };
  }
  throw new Error(`map could not mint one visible selector for ${entry.role} ${JSON.stringify(entry.name)}`);
}

async function captureMap(page: Page, selector: string, includeHidden: boolean): Promise<{ entries: MapEntry[] | null; error: string | null }> {
  try {
    const result = (await page.evaluate(buildMapScript(selector, includeHidden))) as RawMapEntry[] | null;
    if (result === null) {
      return { entries: null, error: `no element matches "${selector}"` };
    }
    return { entries: await Promise.all(result.map((entry) => validateMapEntry(page, entry, includeHidden))), error: null };
  } catch (e) {
    return { entries: null, error: errorMessage(e) };
  }
}

// The shot path for a page: `<out>.png` on page 0 / single-page (byte-identical), `<out>-p<idx>.png` on
// a --pages tab so N tabs never clobber one file.
function pageOut(out: string, pageIndex: number, totalPages: number): string {
  return totalPages > 1 ? out.replace(PNG_EXT_RE, `-p${pageIndex}.png`) : out;
}

// `--contexts` mirrors pageOut's suffix idiom with its OWN letter ("-u<idx>", user) so a run combining
// reports never collides with a --pages "-p<idx>" file — the two modes are mutually exclusive (refused
// together), but the naming stays self-documenting regardless.
function contextOut(out: string, contextIndex: number, totalContexts: number): string {
  return totalContexts > 1 ? out.replace(PNG_EXT_RE, `-u${contextIndex}.png`) : out;
}

// One page's full capture pass. Nav actions + steps + captures are FILTERED to this page's index, so a
// flat argv list drives N tabs. On single-page (totalPages 1) every filter is a no-op and the flow is
// byte-identical to the original. `unit` picks the shot suffix: "p" (--pages, the default) or "u"
// (--contexts) — the two modes are mutually exclusive so only one is ever requested per run.
type PagePlan = ShotPlan & { pageIndex: number; totalPages: number; unit?: "p" | "u"; navigatePage?: boolean };

// Extracted (not inlined) purely to keep `capture`'s cognitive-complexity count under the gate — the
// suffix decision itself is trivial.
function planOut(plan: PagePlan, pageIndex: number, totalPages: number): string {
  return plan.unit === "u" ? contextOut(plan.out, pageIndex, totalPages) : pageOut(plan.out, pageIndex, totalPages);
}

async function captureEvidence(page: Page, opts: Args, outcome: CaptureOutcome, pageIndex: number): Promise<void> {
  if (opts.deadCss) {
    const scan = await scanDeadCss(page, opts.includeHidden);
    outcome.deadCss = scan.dead;
    outcome.emptyCss = scan.empty;
  }
  if (opts.aria && opts.ariaPage === pageIndex) {
    const aria = await captureAria(page, opts);
    outcome.ariaText = aria.text;
    outcome.ariaError = aria.error;
  }
  const pageEvals = opts.eval.filter((entry) => entry.page === pageIndex).map((entry) => entry.expr);
  outcome.evalResults = pageEvals.length > 0 ? await captureEvals(page, pageEvals) : [];
  const pageContrasts = opts.contrast.filter((entry) => entry.page === pageIndex).map((entry) => entry.selector);
  if (pageContrasts.length > 0) {
    outcome.contrastResults = await captureContrasts(page, pageContrasts, opts.contrastPixel, page.viewportSize() ?? opts.viewport);
  }
  if (opts.map && opts.mapPage === pageIndex) {
    const mapped = await captureMap(page, opts.mapSelector, opts.includeHidden);
    outcome.mapResult = mapped.entries;
    outcome.mapError = mapped.error;
  }
  const pageAssertions = opts.assertions.filter((entry) => entry.page === pageIndex);
  outcome.assertions = pageAssertions.length > 0 ? await runAssertions(page, pageAssertions, opts.includeHidden) : [];
  outcome.perf = await capturePerfEvidence(page);
}

async function capture(page: Page, opts: Args, plan: PagePlan, evidence: Pick<ProbeSession, "consoleMessages" | "pageErrors">): Promise<CaptureOutcome> {
  const { pageIndex, totalPages } = plan;
  const outcome: CaptureOutcome = {
    pageIndex,
    navError: null,
    stepFailures: 0,
    navFailures: 0,
    deadCss: [],
    emptyCss: [],
    ariaText: null,
    ariaError: null,
    evalResults: [],
    contrastResults: [],
    mapResult: null,
    mapError: null,
    assertions: [],
    perf: null,
    evidenceRange: null,
  };
  const forThisPage = <T extends { page: number }>(items: readonly T[]): T[] => items.filter((i) => i.page === pageIndex);
  const out = planOut(plan, pageIndex, totalPages);
  // Volatile-region masks (pink overlay) shared by the main shot, --shot-of, and crop.
  const mask = opts.mask.map((s) => page.locator(s));
  try {
    outcome.navError = plan.navigatePage === false ? null : await navigate(page, opts, plan.url);
    if (opts.checkpoint) {
      await page.evaluate(() => globalThis.__orb?.resetEvidence());
      outcome.evidenceRange = {
        consoleStart: evidence.consoleMessages.length,
        consoleEnd: evidence.consoleMessages.length,
        pageErrorStart: evidence.pageErrors.length,
        pageErrorEnd: evidence.pageErrors.length,
      };
    }
    // SPA nav (dev bridge) runs BEFORE the regular steps so `--goto presets --map` maps the presets surface.
    outcome.navFailures = await runNavActions(page, forThisPage(opts.navActions));
    outcome.stepFailures = await runSteps(page, forThisPage(opts.steps));
    await settlePage(page, opts);
    await captureEvidence(page, opts, outcome, pageIndex);
    if (plan.produceShot) {
      await captureShot(page, opts, out, mask);
    }
  } catch (e) {
    outcome.navError = `nav/wait threw: ${errorMessage(e)}`;
    // Try to screenshot whatever we got anyway.
    if (plan.produceShot) {
      try {
        await captureShot(page, opts, out, mask);
      } catch {
        /* best effort — the report + RESULT line still land */
      }
    }
  } finally {
    const range = outcome.evidenceRange;
    if (range !== null) {
      outcome.evidenceRange = {
        ...range,
        consoleEnd: evidence.consoleMessages.length,
        pageErrorEnd: evidence.pageErrors.length,
      };
    }
  }
  return outcome;
}

// ── Screenshot capture ──────────────────────────────────────────────────────
// One place that decides element-shot vs page-shot, applies native stabilization
// (SHOT_BASE), masks volatile regions, and does the native crop.
async function captureShot(page: Page, opts: Args, out: string, mask: Locator[]): Promise<void> {
  if (opts.shotOf !== null) {
    // Just the element — Playwright auto-crops to its bounding box. The
    // no-pixel-math crop: the cheapest pixels that still show the thing.
    await page
      .locator(opts.shotOf)
      .first()
      .screenshot({ path: out, ...SHOT_BASE, mask });
    return;
  }
  await page.screenshot({ path: out, fullPage: opts.fullPage, ...SHOT_BASE, mask });
  // Native crop via clip (WxH+X+Y) → <out>-crop.png. No ffmpeg, and the cropped
  // PNG is itself a smaller (cheaper) image to read than the full viewport.
  if (opts.crop !== null) {
    const m = CROP_RE.exec(opts.crop);
    const g = m?.groups;
    if (g?.["w"] !== undefined && g["h"] !== undefined) {
      await page.screenshot({
        path: out.replace(PNG_EXT_RE, "-crop.png"),
        clip: {
          x: Number(g["x"] ?? 0),
          y: Number(g["y"] ?? 0),
          width: Number(g["w"]),
          height: Number(g["h"]),
        },
        ...SHOT_BASE,
        mask,
      });
    }
  }
}

// ── Dead-class scan ─────────────────────────────────────────────────────────
// Two failure modes, one walk:
//   1. DEAD TOKENS — a class on an element with NO matching rule anywhere: a
//      utility Tailwind didn't GENERATE (wrong theme namespace — neo's
//      sm:max-w-dialog-* bug: max-w resolves --container-*, the tokens only
//      mapped --width-*; or a typo'd variant / stale class). Marker-only
//      classes that legitimately have no rules (group/peer + named forms) are
//      skipped, as are known third-party marker namespaces.
//   2. EMPTY RULES — the rule compiled but every declaration was INVALID CSS,
//      so the browser dropped them at parse time and CSSOM holds an empty
//      block (style.length === 0). Canonical case: v3 var syntax `w-[--foo]`
//      compiling under v4 to `width: --foo` (bare ident, no var()). Mode 1
//      can't see it because the SELECTOR exists.
async function scanDeadCss(page: Page, includeHidden: boolean): Promise<{ dead: Array<{ token: string; count: number }>; empty: string[] }> {
  // NOTE: the body ships as a STRING — tsx (esbuild keepNames) decorates
  // function expressions with a __name helper that doesn't exist inside the
  // browser context; a serialized IIFE evaluates untransformed. (Also the root
  // tsconfig that checks scripts/ is DOM-less — a function body wouldn't compile.)
  return (await page.evaluate(`(() => {
    const used = new Map();
    for (const el of document.querySelectorAll("*")) {
      if (!${JSON.stringify(includeHidden)}) {
        const visible = typeof el.checkVisibility === "function"
          ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true })
          : el.getClientRects().length > 0;
        if (!visible || el.closest('[hidden],[inert],[aria-hidden="true"]')) continue;
      }
      for (const t of el.classList) used.set(t, (used.get(t) ?? 0) + 1);
    }
    const defined = new Set();
    const empty = new Set();
    // BACKSLASH DOUBLING IS DELIBERATE — do not "fix" it. This whole IIFE is a
    // RAW STRING (see the keepNames note above), NOT a JS regex literal. Every
    // backslash that must survive into the browser-side regex has to be escaped
    // once here so the string literal yields it. The regex the browser actually
    // compiles is /.((?:\\.|[A-Za-z0-9_-])+)/g — i.e. a literal dot, then a run
    // of either an escaped char (\\.) or a CSS ident char. Halving these (.→.,
    // \\.→.) would change the in-browser regex and break dead-class matching.
    const re = /\\.((?:\\\\.|[A-Za-z0-9_-])+)/g;
    const walk = (rules) => {
      for (const r of rules) {
        const sel = r.selectorText;
        if (typeof sel === "string") {
          re.lastIndex = 0;
          let m;
          while ((m = re.exec(sel)) !== null) defined.add(m[1].replace(/\\\\(.)/g, "$1"));
          // A style rule with zero surviving declarations AND no nested
          // child rules = the browser rejected every value in it. (Tailwind
          // v4 variants emit nesting — hover utilities hold an &:hover child
          // rule and no own declarations — hence the child check. NB: this
          // comment lives inside the evaluate string; no backticks here.)
          if (r.style && r.style.length === 0 && (!r.cssRules || r.cssRules.length === 0)) {
            empty.add(sel);
          }
        }
        if (r.cssRules) walk(r.cssRules);
      }
    };
    for (const sheet of document.styleSheets) {
      try { walk(sheet.cssRules); } catch { /* cross-origin */ }
    }
    const skip = (t) =>
      t === "group" || t === "peer" || t.startsWith("group/") || t.startsWith("peer/") ||
      // third-party marker classes that ship no stylesheet rules
      t === "echarts-for-react" || t.startsWith("lucide") || t.startsWith("TanStack") || t.startsWith("tsqd-");
    const dead = [];
    for (const [token, count] of used) {
      if (!defined.has(token) && !skip(token)) dead.push({ token, count });
    }
    dead.sort((a, b) => b.count - a.count);
    // Only report empty rules whose class is actually ON an element right
    // now — Tailwind's source scanner also compiles class-shaped strings out
    // of comments/docs (w-[--foo] in a code comment becomes a real, empty
    // rule) and those are harmless until something wears them.
    const emptyUsed = [...empty].filter((sel) => {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(sel)) !== null) {
        if (used.has(m[1].replace(/\\\\(.)/g, "$1"))) return true;
      }
      return false;
    });
    return { dead, empty: emptyUsed.sort() };
  })()`)) as { dead: Array<{ token: string; count: number }>; empty: string[] };
}

// ── Report printing ─────────────────────────────────────────────────────────

type ShotPlan = {
  url: string;
  out: string;
  produceShot: boolean;
};

// `label` is the multi-item banner word ("PAGE" for --pages, "CONTEXT" for --contexts) — printPageReport
// reads it so the two modes share one printer without a 5th positional param.
type ReportCtx = ShotPlan & { failed: CapturedRequest[]; totalPages: number; label?: string };

// Structural subset printSummary needs — a ProbeSession OR a ProbeContext both satisfy it, so --contexts'
// per-context report can call the SAME function as the single-context/--pages path.
type SessionCounts = {
  readonly requests: ReadonlyMap<string, CapturedRequest>;
  readonly consoleLines: readonly string[];
  readonly consoleMessages: readonly CapturedConsole[];
  readonly pageErrors: readonly string[];
};

function consoleForEvidence(messages: readonly CapturedConsole[], outcomes: readonly CaptureOutcome[]): readonly CapturedConsole[] {
  const ranges = outcomes.map((outcome) => outcome.evidenceRange);
  if (ranges.some((range) => range === null)) {
    return messages;
  }
  const first = ranges[0] as EvidenceRange | undefined;
  const last = ranges.at(-1) as EvidenceRange | undefined;
  return first === undefined || last === undefined ? messages : messages.slice(first.consoleStart, last.consoleEnd);
}

function pageErrorsForEvidence(errors: readonly string[], outcomes: readonly CaptureOutcome[]): readonly string[] {
  const ranges = outcomes.map((outcome) => outcome.evidenceRange);
  if (ranges.some((range) => range === null)) {
    return errors;
  }
  const first = ranges[0] as EvidenceRange | undefined;
  const last = ranges.at(-1) as EvidenceRange | undefined;
  return first === undefined || last === undefined ? errors : errors.slice(first.pageErrorStart, last.pageErrorEnd);
}

function extendEvidenceThroughWatch(outcomes: readonly CaptureOutcome[], session: ProbeSession): void {
  const outcome = outcomes.findLast((candidate) => candidate.evidenceRange !== null);
  const range = outcome?.evidenceRange;
  if (outcome !== undefined && range !== null && range !== undefined) {
    outcome.evidenceRange = {
      ...range,
      consoleEnd: session.consoleMessages.length,
      pageErrorEnd: session.pageErrors.length,
    };
  }
}

function sessionForEvidence(session: SessionCounts, outcomes: readonly CaptureOutcome[]): SessionCounts {
  const consoleMessages = consoleForEvidence(session.consoleMessages, outcomes);
  return {
    requests: session.requests,
    consoleMessages,
    consoleLines: consoleMessages.map((message) => message.line),
    pageErrors: pageErrorsForEvidence(session.pageErrors, outcomes),
  };
}

function printCheckpointScope(full: SessionCounts, scoped: SessionCounts): void {
  const bootConsole = full.consoleMessages.length - scoped.consoleMessages.length;
  const bootPageErrors = full.pageErrors.length - scoped.pageErrors.length;
  if (bootConsole > 0 || bootPageErrors > 0) {
    print(`checkpoint   interaction verdict excludes ${bootConsole} boot console message(s) and ${bootPageErrors} boot page error(s); JSON retains both`);
  }
}

function printSummary(session: SessionCounts, outcome: CaptureOutcome, opts: Args, ctx: ReportCtx): void {
  let shotDisplay = ctx.out;
  if (!ctx.produceShot) {
    shotDisplay = "(none — --no-shot)";
  } else if (opts.shotOf !== null) {
    shotDisplay = `${ctx.out}  (element: ${opts.shotOf})`;
  }
  print(`URL          ${ctx.url}`);
  print(`screenshot   ${shotDisplay}`);
  if (opts.colorScheme !== null) {
    print(`colorScheme  ${opts.colorScheme}`);
  }
  if (outcome.navError !== null) {
    print(`NAV ERROR    ${outcome.navError}`);
  }
  print(`requests     ${session.requests.size} (${ctx.failed.length} failed/4xx-5xx)`);
  const consoleErrors = session.consoleMessages.filter((entry) => entry.type === "error").length;
  const consoleWarnings = session.consoleMessages.filter((entry) => entry.type === "warning").length;
  print(`console      ${session.consoleLines.length} message(s) (${consoleErrors} error, ${consoleWarnings} warning)`);
  print(`page errors  ${session.pageErrors.length}`);
}

function printAriaBlock(opts: Args, ariaText: string | null, ariaError: string | null): void {
  if (ariaError !== null) {
    print(`\n--- ARIA (${opts.ariaSelector}) ---`);
    print(`  ${ariaError}`);
    return;
  }
  if (ariaText === null) {
    return;
  }
  // The text path. For "did it render / is the list populated / is the dialog
  // open / what's the label" this is the whole answer — no pixels needed.
  const lines = ariaText.split("\n");
  const scope = `${opts.ariaSelector}${opts.ariaDepth !== null ? ` depth≤${opts.ariaDepth}` : ""}`;
  print(`\n--- ARIA (${scope}, ${lines.length} line(s)) ---`);
  for (const l of lines.slice(0, ARIA_MAX_LINES)) {
    print(`  ${l}`);
  }
  if (lines.length > ARIA_MAX_LINES) {
    print(`  … +${lines.length - ARIA_MAX_LINES} more — scope with --aria <selector> or --aria-depth N`);
  }
}

function printEvalBlock(evals: readonly EvalOutcome[]): void {
  evals.forEach((e, i) => {
    const label = e.expr.length > EVAL_LABEL_CAP ? `${e.expr.slice(0, EVAL_LABEL_CAP)}…` : e.expr;
    print(`\n--- EVAL[${i}] (${label}) ---`);
    print(e.text);
  });
}

function printContrastBlock(contrasts: readonly ContrastOutcome[]): void {
  if (contrasts.length > 0) {
    print("");
  }
  for (const c of contrasts) {
    print(c.line);
  }
}

function printMapBlock(opts: Args, entries: MapEntry[] | null, error: string | null): void {
  // Gate on whether the map actually RAN on this page (multi-tab: --map targets one page). A null
  // result + null error means it didn't run here.
  if (entries === null && error === null) {
    return;
  }
  if (error !== null) {
    print(`\n--- MAP (${opts.mapSelector}) ---`);
    print(`  MAP capture failed: ${error}`);
    return;
  }
  const list = entries ?? [];
  const fallbackCount = list.filter((entry) => entry.source === "dom").length;
  print(`\n--- MAP (${list.length} element(s), ${fallbackCount} DOM fallback(s)) ---`);
  for (const e of list.slice(0, ARIA_MAX_LINES)) {
    const name = e.name.length > MAP_NAME_MAX_LENGTH ? `${e.name.slice(0, MAP_NAME_MAX_LENGTH - 1)}…` : e.name;
    print(`  ${e.role}  "${name}"  →  ${e.selector}  [${e.source}]`);
  }
  if (list.length > ARIA_MAX_LINES) {
    print(`  … +${list.length - ARIA_MAX_LINES} more — scope with --map <selector>`);
  }
  // Two recurring foot-guns worth reprinting where the selectors are chosen: engine-mixing + virtual rows.
  print("  NOTE: one selector engine per target — never concatenate a CSS selector with a role= selector.");
  print("  NOTE: a virtualized/composite row often needs --jsclick (raw click); role= locators flake.");
}

function printAssertionBlock(assertions: readonly AssertionOutcome[]): void {
  if (assertions.length === 0) {
    return;
  }
  print(`\n--- ASSERTIONS (${assertions.length}) ---`);
  for (const assertion of assertions) {
    print(`  ${assertion.line}`);
  }
}

/** Bound terminal noise without hiding the evidence that decides a run. Errors win, then warnings, then
 *  the newest informational tail; the JSON manifest remains the lossless record. */
export function selectConsoleMessagesForReport(
  messages: readonly CapturedConsole[],
  cap = CONSOLE_REPORT_CAP,
): { readonly messages: readonly CapturedConsole[]; readonly omitted: number } {
  if (messages.length <= cap) {
    return { messages, omitted: 0 };
  }
  const indexed = messages.map((message, index) => ({ message, index }));
  const errors = indexed.filter(({ message }) => message.type === "error");
  const warnings = indexed.filter(({ message }) => message.type === "warning");
  const ordinary = indexed.filter(({ message }) => message.type !== "error" && message.type !== "warning");
  const selected = errors.slice(-cap);
  selected.push(...warnings.slice(-Math.max(0, cap - selected.length)));
  selected.push(...ordinary.slice(-Math.max(0, cap - selected.length)));
  selected.sort((left, right) => left.index - right.index);
  return { messages: selected.map(({ message }) => message), omitted: messages.length - selected.length };
}

function printCaptureLog(session: SessionCounts, failed: CapturedRequest[]): void {
  if (failed.length > 0) {
    print("\n--- failed requests ---");
    for (const r of failed) {
      print(`  ${r.method.padEnd(METHOD_PAD)} ${r.type.padEnd(TYPE_PAD)} ${r.status ?? "—"} ${r.failed ?? ""} ${r.url}`);
    }
  }
  if (session.consoleLines.length > 0) {
    const selected = selectConsoleMessagesForReport(session.consoleMessages);
    print("\n--- console ---");
    if (selected.omitted > 0) {
      print(`  … ${selected.omitted} message(s) omitted — errors/warnings prioritized; use --json for the complete structured log`);
    }
    for (const message of selected.messages) {
      print(`  ${message.line}`);
    }
  }
  if (session.pageErrors.length > 0) {
    print("\n--- page errors ---");
    for (const e of session.pageErrors) {
      print(e);
    }
  }
}

function printCssFindings(outcome: CaptureOutcome): void {
  if (outcome.deadCss.length > 0) {
    // Advisory, not gating: a class token in the DOM that NO stylesheet rule matches
    // is a utility Tailwind didn't generate (wrong token namespace, typo'd variant)
    // or third-party noise — eyeball before trusting layout.
    print("\n--- DEADCSS (class tokens with no matching CSS rule) ---");
    for (const d of outcome.deadCss.slice(0, CSS_FINDINGS_CAP)) {
      print(`  ${d.token} (×${d.count})`);
    }
    if (outcome.deadCss.length > CSS_FINDINGS_CAP) {
      print(`  … +${outcome.deadCss.length - CSS_FINDINGS_CAP} more`);
    }
  }
  if (outcome.emptyCss.length > 0) {
    // The selector compiled but the browser threw away every declaration — the value
    // was invalid CSS. Canonical case: Tailwind v3 var syntax `w-[--foo]` compiling to
    // `width: --foo` (no var()) under v4; the v4 form is `w-(--foo)`. Invisible to the
    // dead-token scan above because the RULE exists.
    print("\n--- EMPTYCSS (rules whose declarations the browser dropped — invalid values) ---");
    for (const sel of outcome.emptyCss.slice(0, CSS_FINDINGS_CAP)) {
      print(`  ${sel}`);
    }
    if (outcome.emptyCss.length > CSS_FINDINGS_CAP) {
      print(`  … +${outcome.emptyCss.length - CSS_FINDINGS_CAP} more`);
    }
  }
}

// Crop is captured natively in captureShot (Playwright clip) — just report it.
function printCropNote(opts: Args, ctx: ReportCtx): void {
  if (opts.crop === null) {
    return;
  }
  if (!CROP_RE.test(opts.crop)) {
    print(`crop         IGNORED — expected WxH+X+Y, got "${opts.crop}"`);
  } else if (!ctx.produceShot) {
    print("crop         IGNORED — needs a shot (drop --no-shot/--text)");
  } else if (opts.shotOf !== null) {
    print("crop         IGNORED — mutually exclusive with --shot-of");
  } else {
    print(`crop         ${ctx.out.replace(PNG_EXT_RE, "-crop.png")}`);
  }
}

// ── Baseline / diff (probe-mode visual regression, ffmpeg SSIM) ─────────────
// A requested comparison is evidence: missing ffmpeg or a missing baseline is a failed comparison,
// not a green skip. Agents must never infer visual parity from a run that compared nothing.

type DiffOutcome = { diffPairs: ResultPair[]; ssimFailed: boolean };

function compareSsim(ffmpeg: string, out: string, baselinePath: string): DiffOutcome {
  // SSIM via ffmpeg (no extra deps): stderr ends with "... All:0.9876 (…)".
  const ssimRes = spawnSync(ffmpeg, ["-i", out, "-i", baselinePath, "-lavfi", "ssim", "-f", "null", "-"], { stdio: ["ignore", "ignore", "pipe"] });
  const ssimAll = SSIM_ALL_RE.exec(ssimRes.stderr?.toString() ?? "")?.groups?.["all"];
  const ssim = ssimAll === undefined ? null : Number(ssimAll);
  // Difference heatmap — bright pixels = changed regions.
  const diffPng = out.replace(PNG_EXT_RE, "-diff.png");
  spawnSync(ffmpeg, ["-y", "-i", out, "-i", baselinePath, "-filter_complex", "blend=all_mode=difference", diffPng], { stdio: ["ignore", "ignore", "pipe"] });
  const pass = ssim !== null && ssim >= DIFF_SSIM_THRESHOLD;
  print(`DIFF         ssim=${ssim ?? "unparseable"} (threshold ${DIFF_SSIM_THRESHOLD}) → ${pass ? "PASS" : "FAIL"}`);
  print(`diff heatmap ${diffPng}`);
  return {
    diffPairs: [
      ["diff", pass ? "PASS" : "FAIL"],
      ["ssim", ssim ?? "?"],
    ],
    ssimFailed: !pass,
  };
}

async function runBaselineOrDiff(opts: Args, out: string, name: string): Promise<DiffOutcome> {
  const none: DiffOutcome = { diffPairs: [], ssimFailed: false };
  if (opts.baseline) {
    const baselinePath = join(await artifactDir("baselines"), `${name}.png`);
    await copyFile(out, baselinePath);
    print(`baseline     saved → ${baselinePath}`);
    return none;
  }
  if (!opts.diff) {
    return none;
  }
  const baselinePath = join(await artifactDir("baselines"), `${name}.png`);
  const ffmpeg = resolveFfmpeg();
  if (ffmpeg === null) {
    print("DIFF         skipped — ffmpeg not found (set FFMPEG_BIN or rebuild the dev container); SSIM unavailable");
    return { diffPairs: [["diff", "SKIPPED-NO-FFMPEG"]], ssimFailed: true };
  }
  if (!existsSync(baselinePath)) {
    print(`DIFF         no baseline at ${baselinePath} — run with --baseline first`);
    return { diffPairs: [["diff", "NO-BASELINE"]], ssimFailed: true };
  }
  return compareSsim(ffmpeg, out, baselinePath);
}

// ── Orchestration ───────────────────────────────────────────────────────────

// Pre-navigation localStorage seeds: the generic --ls pairs plus the two harness
// keys (all ride _kit's one init script — same timing, before any page script).
function buildSeeds(opts: Args): LocalStorageSeed[] {
  const seeds: LocalStorageSeed[] = [...opts.localStorage];
  if (opts.debugToken !== "") {
    seeds.push({ key: DEBUG_TOKEN_KEY, value: opts.debugToken });
  }
  if (opts.probe) {
    seeds.push({ key: PROBE_MODE_KEY, value: "1" });
  }
  return seeds;
}

// ── --watch: a timed observation series after nav+steps settle ────────────────
// Watch a streaming turn reflow / catch a transient state (a raw speaker-tag prefix mid-stream) without
// eyeballing MCP screenshots one call at a time. Every tick: a screenshot (`<out>-t<elapsed>.png`) and,
// if --eval exprs were given, re-run them labeled with elapsed ms. Runs on PAGE 0's evals only (the
// series is a single-surface time-lapse). Returns the tick count + the artifact/eval lines to report.
type WatchTick = { elapsedMs: number; shot: string | null; shotError: string | null; evals: EvalOutcome[] };

async function runWatchSeries(page: Page, opts: Args, out: string): Promise<WatchTick[]> {
  const ticks: WatchTick[] = [];
  const page0Evals = opts.eval.filter((e) => e.page === 0).map((e) => e.expr);
  const start = Date.now();
  let elapsed = 0;
  while (elapsed <= opts.watchMs) {
    const shotPath = shouldProduceShot(opts) ? out.replace(PNG_EXT_RE, `-t${elapsed}.png`) : null;
    // `--no-shot --watch` is the cheap state-series path: repeat evals without minting dozens of images.
    // biome-ignore lint/performance/noAwaitInLoops: the series is INHERENTLY sequential — each tick observes the surface at a distinct wall-clock moment.
    const shotError = shotPath === null ? null : await page.screenshot({ path: shotPath, ...SHOT_BASE }).then(() => null, errorMessage);
    const evals = page0Evals.length > 0 ? await captureEvals(page, page0Evals) : [];
    ticks.push({ elapsedMs: elapsed, shot: shotPath, shotError, evals });
    if (elapsed >= opts.watchMs) {
      break;
    }
    await settle(page, opts.watchEveryMs);
    elapsed = Date.now() - start;
  }
  return ticks;
}

function printWatchBlock(ticks: readonly WatchTick[]): void {
  if (ticks.length === 0) {
    return;
  }
  print(`\n--- WATCH (${ticks.length} tick(s)) ---`);
  let previousEvalSignature: string | null = null;
  let omitted = 0;
  for (const t of ticks) {
    const evalSignature = JSON.stringify(t.evals.map((entry) => ({ text: entry.text, failed: entry.failed })));
    const unchangedEvalOnly = t.shot === null && t.shotError === null && previousEvalSignature === evalSignature;
    previousEvalSignature = evalSignature;
    if (unchangedEvalOnly) {
      omitted += 1;
      continue;
    }
    if (omitted > 0) {
      print(`  … ${omitted} unchanged tick(s) omitted`);
      omitted = 0;
    }
    print(`  t+${t.elapsedMs}ms  →  ${t.shot ?? "(no shot — --no-shot)"}${t.shotError === null ? "" : `  FAILED: ${t.shotError}`}`);
    t.evals.forEach((e, i) => {
      const label = e.expr.length > EVAL_LABEL_CAP ? `${e.expr.slice(0, EVAL_LABEL_CAP)}…` : e.expr;
      // Collapse a multi-line eval result to keep the series scannable; the single-shot --eval block
      // (post-watch) still prints the full pretty-printed value.
      const oneLine = e.text.replace(/\s+/g, " ").slice(0, EVAL_LABEL_CAP);
      print(`    eval[${i}] (${label}): ${oneLine}`);
    });
  }
  if (omitted > 0) {
    print(`  … ${omitted} unchanged tick(s) omitted`);
  }
}

// One page's report section. Multi-tab prefixes a `=== PAGE N ===` banner; single-page prints exactly
// the original layout. Session-wide logs (requests/console/pageErrors) print ONCE after all pages.
// ctx.label lets --contexts reuse this for a `=== CONTEXT N ===` banner instead.
function printPageReport(session: SessionCounts, outcome: CaptureOutcome, opts: Args, ctx: ReportCtx): void {
  if (ctx.totalPages > 1) {
    print(`\n========== ${ctx.label ?? "PAGE"} ${outcome.pageIndex} ==========`);
  }
  printSummary(session, outcome, opts, ctx);
  printAriaBlock(opts, outcome.ariaText, outcome.ariaError);
  printEvalBlock(outcome.evalResults);
  printContrastBlock(outcome.contrastResults);
  printMapBlock(opts, outcome.mapResult, outcome.mapError);
  printAssertionBlock(outcome.assertions);
  printCssFindings(outcome);
}

// --file: resolve the (possibly relative) path to an absolute one + its file:// URL + the default artifact
// slug (the file's basename, so `--file …/config-rail/workspace.html` writes reports/snaps/workspace.png).
// A relative path resolves against the CWD the operator typed it in — `pnpm snap --file docs/design/mocks/…`
// from the repo root is the documented shape.
type FileTarget = { readonly path: string; readonly url: string; readonly slug: string };
function fileTarget(pathArg: string): FileTarget {
  const abs = isAbsolute(pathArg) ? pathArg : resolve(process.cwd(), pathArg);
  return { path: abs, url: pathToFileURL(abs).href, slug: routeSlug(basename(abs, extname(abs))) };
}

// WHERE this run navigates + what its artifacts are called: a local file (--file) or a route on the base
// URL. Split out of snap() so the file/route fork lives in one named place (and snap() stays under the
// cognitive-complexity gate).
function snapDestination(opts: Args): { readonly url: string; readonly name: string } {
  if (opts.file !== null) {
    const target = fileTarget(opts.file);
    return { url: target.url, name: opts.out ?? target.slug };
  }
  return { url: buildUrl(opts.base, opts.route), name: opts.out ?? routeSlug(opts.route) };
}

type ScenarioCheckpoint = { readonly name: string; readonly args: readonly string[] };
type ScenarioSpec = { readonly name: string; readonly defaults: readonly string[]; readonly checkpoints: readonly ScenarioCheckpoint[] };

function stringArray(value: unknown): readonly string[] | null {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string") ? value : null;
}

function scenarioCheckpoint(value: unknown, index: number): ScenarioCheckpoint {
  if (typeof value !== "object" || value === null) {
    throw new Error(`scenario checkpoint ${index} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const args = stringArray(record["args"]);
  if (typeof record["name"] !== "string" || record["name"].trim() === "" || args === null) {
    throw new Error(`scenario checkpoint ${index} requires a non-empty name and string[] args`);
  }
  return { name: record["name"], args };
}

export function parseScenarioSpec(source: string, fallbackName: string): ScenarioSpec {
  const value = JSON.parse(source) as unknown;
  if (typeof value !== "object" || value === null) {
    throw new Error("scenario root must be an object");
  }
  const record = value as Record<string, unknown>;
  const defaults = record["defaults"] === undefined ? [] : stringArray(record["defaults"]);
  if (defaults === null) {
    throw new Error("scenario defaults must be a string[]");
  }
  if (!Array.isArray(record["checkpoints"]) || record["checkpoints"].length === 0) {
    throw new Error("scenario requires at least one checkpoint");
  }
  const checkpoints = record["checkpoints"].map(scenarioCheckpoint);
  const name = typeof record["name"] === "string" && record["name"].trim() !== "" ? record["name"] : fallbackName;
  return { name: routeSlug(name), defaults, checkpoints };
}

function inheritScenarioSession(globalArgs: Args, checkpoint: Args, name: string): Args {
  return {
    ...checkpoint,
    base: globalArgs.base,
    vnc: globalArgs.vnc,
    debugToken: globalArgs.debugToken,
    failureEvidence: globalArgs.failureEvidence,
    strictConsole: globalArgs.strictConsole,
    checkpoint: globalArgs.checkpoint || checkpoint.checkpoint,
    includeHidden: globalArgs.includeHidden || checkpoint.includeHidden,
    json: globalArgs.json,
    summary: globalArgs.summary || checkpoint.summary,
    viewport: globalArgs.viewport,
    device: globalArgs.device,
    colorScheme: globalArgs.colorScheme,
    reducedMotion: globalArgs.reducedMotion,
    probe: globalArgs.probe,
    localStorage: [...globalArgs.localStorage, ...checkpoint.localStorage],
    out: checkpoint.out ?? name,
  };
}

function scenarioCheckpointArgs(globalArgs: Args, spec: ScenarioSpec): Args[] {
  return spec.checkpoints.map((checkpoint) => {
    const args = parseSnapArgs([...spec.defaults, ...checkpoint.args]);
    const inherited = inheritScenarioSession(globalArgs, args, `${spec.name}-${routeSlug(checkpoint.name)}`);
    inherited.errors.push(
      ...[
        [inherited.pages > 1 || inherited.contexts > 1 || inherited.as !== null, "scenario checkpoints do not support --pages/--contexts/--as"],
        [inherited.watchMs > 0 || inherited.baseline || inherited.diff, "scenario checkpoints do not support --watch/--baseline/--diff"],
        [inherited.scenario !== null || inherited.matrix, "scenario checkpoints cannot nest --scenario/--matrix"],
        [
          inherited.isolated || inherited.stageDown || inherited.stageStatus,
          "scenario checkpoint args cannot manage stages; put stage flags on the outer command",
        ],
      ]
        .filter(([invalid]) => invalid)
        .map(([, message]) => `${checkpoint.name}: ${message}`),
    );
    return inherited;
  });
}

function scenarioErrors(checkpoints: readonly Args[]): string[] {
  const errors = checkpoints.flatMap((checkpoint) => {
    const fileRefusal = refuseFileMode(checkpoint);
    return fileRefusal === null ? checkpoint.errors : [...checkpoint.errors, fileRefusal];
  });
  const firstSeeds = JSON.stringify(checkpoints[0]?.localStorage ?? []);
  if (checkpoints.some((checkpoint) => JSON.stringify(checkpoint.localStorage) !== firstSeeds)) {
    errors.push("scenario checkpoints must use identical --ls seeds because they share one browser lifetime");
  }
  return errors;
}

type PreparedScenario = { readonly spec: ScenarioSpec; readonly checkpoints: readonly Args[] };

async function prepareScenario(opts: Args, path: string): Promise<PreparedScenario> {
  const loaded = await loadScenario(path);
  const spec = opts.out === null ? loaded : { ...loaded, name: routeSlug(opts.out) };
  return { spec, checkpoints: scenarioCheckpointArgs(opts, spec) };
}

type EvidenceFailureCounts = {
  readonly aria: number;
  readonly map: number;
  readonly eval: number;
};

type ConsoleFailureCounts = { readonly errors: number; readonly warnings: number };

/** HARNESS-INDUCED console error, not the app's (measured 2026-08-15, three-arm probe): Playwright
 *  TRACING — snap's default failure-evidence — injects its snapshot script into EVERY frame, and the
 *  app's script-dead sandboxed card frames (srcdoc floor AND the routed /api/card-frame document) block
 *  it with exactly this line. Without tracing the error never fires; a real browser never shows it. It is
 *  therefore excluded from the console-error VERDICT (it false-redded every card-bearing room) but never
 *  dropped: the report still prints these lines, the JSON manifest keeps them, and the RESULT line counts
 *  them under `sandbox-trace-noise`. A sandboxed frame the APP scripted would match too — acceptable,
 *  because scripting a sandboxed frame is barred by the srcdoc.ts security posture and would be its own
 *  loud defect at review, not something to detect through Chrome's noise line. */
export const SANDBOX_TRACE_NOISE_RE =
  /^Blocked script execution in '[^']*' because the document's frame is sandboxed and the 'allow-scripts' permission is not set\./u;
const CONSOLE_TYPE_PREFIX_RE = /^\[error\]\s*/u;

export function isSandboxTraceNoise(entry: CapturedConsole): boolean {
  return entry.type === "error" && SANDBOX_TRACE_NOISE_RE.test(entry.line.replace(CONSOLE_TYPE_PREFIX_RE, ""));
}

function consoleFailureCounts(messages: readonly CapturedConsole[], strict: boolean): ConsoleFailureCounts {
  const errors = messages.filter((entry) => entry.type === "error" && !isSandboxTraceNoise(entry)).length;
  const warnings = strict ? messages.filter((entry) => entry.type === "warning").length : 0;
  return { errors, warnings };
}

async function finishFailureTraces(session: ProbeSession, failed: boolean, name: string): Promise<string[]> {
  const traces = await artifactDir("traces");
  const paths = await Promise.all(
    session.contexts.map(async ({ context }, index): Promise<string | null> => {
      const tracePath = join(traces, `${name}${session.contexts.length > 1 ? `-u${index}` : ""}.zip`);
      if (failed) {
        await context.tracing.stop({ path: tracePath });
        return tracePath;
      }
      await context.tracing.stop();
      return null;
    }),
  );
  return paths.filter((path): path is string => path !== null);
}

type FailureArtifacts = { readonly traces: readonly string[]; readonly hars: readonly string[] };

async function finishSession(session: ProbeSession, failed: boolean, name: string, enabled: boolean): Promise<FailureArtifacts> {
  const traces = enabled ? await finishFailureTraces(session, failed, name) : [];
  await Promise.all(session.contexts.map(({ context }) => context.close()));
  await session.browser.close();
  const recordedHars = session.contexts.flatMap(({ harPath }) => (harPath === null ? [] : [harPath]));
  if (failed) {
    return { traces, hars: recordedHars };
  }
  await Promise.all(recordedHars.map(async (path) => (existsSync(path) ? await unlink(path) : undefined)));
  return { traces, hars: [] };
}

type SnapManifest = {
  readonly schemaVersion: 1;
  readonly status: "pass" | "fail";
  readonly target: { readonly url: string; readonly name: string };
  readonly environment: { readonly viewport: Viewport; readonly device: string | null; readonly colorScheme: string | null; readonly reducedMotion: boolean };
  readonly failures: SnapFailureSummary;
  readonly traces: readonly string[];
  readonly hars: readonly string[];
  readonly console: readonly CapturedConsole[];
  readonly pageErrors: readonly string[];
  /** Interaction-scoped diagnostics when --checkpoint is active; console/pageErrors above remain the
   *  lossless browser-lifetime record. */
  readonly evidence?: {
    readonly scope: "checkpoint";
    readonly console: readonly CapturedConsole[];
    readonly pageErrors: readonly string[];
  };
  readonly failedRequests: CapturedRequest[];
  readonly captures: readonly CaptureOutcome[];
  /** Watch-only timeline. Present when --watch ran; ticks remain durable even when terminal output dedupes them. */
  readonly watch?: {
    readonly totalMs: number;
    readonly intervalMs: number;
    readonly ticks: readonly WatchTick[];
  };
  /** Scenario-only attribution. `captures[index]` and `scenario.checkpoints[index]` describe one checkpoint. */
  readonly scenario?: {
    readonly checkpoints: ReadonlyArray<{
      readonly name: string;
      /** Null when this checkpoint deliberately ran with --no-shot. */
      readonly screenshot: string | null;
      readonly console: readonly CapturedConsole[];
      readonly pageErrors: readonly string[];
    }>;
  };
};

async function writeManifest(name: string, manifest: SnapManifest): Promise<string> {
  const path = join(await artifactDir("snaps"), `${name}.json`);
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return path;
}

function evidenceFailureCounts(outcomes: readonly CaptureOutcome[]): EvidenceFailureCounts {
  return {
    aria: outcomes.filter((outcome) => outcome.ariaError !== null).length,
    map: outcomes.filter((outcome) => outcome.mapError !== null).length,
    eval: outcomes.reduce((count, outcome) => count + outcome.evalResults.filter((entry) => entry.failed).length, 0),
  };
}

export type SnapFailureSummary = {
  readonly navigation: number;
  readonly navActions: number;
  readonly pageErrors: number;
  readonly failedRequests: number;
  readonly steps: number;
  readonly contrast: number;
  readonly aria: number;
  readonly map: number;
  readonly eval: number;
  readonly watch: number;
  readonly diff: number;
  readonly assertions: number;
  readonly consoleErrors: number;
  readonly consoleWarnings: number;
};

export function hasSnapFailure(summary: SnapFailureSummary): boolean {
  return Object.values(summary).some((count) => count > 0);
}

type OutcomeTotals = {
  readonly navigation: number;
  readonly navActions: number;
  readonly steps: number;
  readonly contrast: number;
  readonly assertions: number;
  readonly deadCss: number;
  readonly emptyCss: number;
  readonly evals: number;
  readonly ariaSeen: boolean;
  readonly mapped: CaptureOutcome | undefined;
};

function mapOutputSummary(enabled: boolean, outcomes: readonly CaptureOutcome[]): { readonly count: string; readonly domFallbacks: string } {
  if (!enabled) {
    return { count: "no", domFallbacks: "no" };
  }
  const entries = outcomes.find((outcome) => outcome.mapResult !== null)?.mapResult ?? [];
  return {
    count: String(entries.length),
    domFallbacks: String(entries.filter((entry) => entry.source === "dom").length),
  };
}

function outcomeTotals(outcomes: readonly CaptureOutcome[]): OutcomeTotals {
  return {
    navigation: outcomes.filter((outcome) => outcome.navError !== null).length,
    navActions: outcomes.reduce((count, outcome) => count + outcome.navFailures, 0),
    steps: outcomes.reduce((count, outcome) => count + outcome.stepFailures, 0),
    contrast: outcomes.reduce((count, outcome) => count + outcome.contrastResults.filter((entry) => entry.failed).length, 0),
    assertions: outcomes.reduce((count, outcome) => count + outcome.assertions.filter((entry) => entry.failed).length, 0),
    deadCss: outcomes.reduce((count, outcome) => count + outcome.deadCss.length, 0),
    emptyCss: outcomes.reduce((count, outcome) => count + outcome.emptyCss.length, 0),
    evals: outcomes.reduce((count, outcome) => count + outcome.evalResults.length, 0),
    ariaSeen: outcomes.some((outcome) => outcome.ariaText !== null),
    mapped: outcomes.find((outcome) => outcome.mapResult !== null || outcome.mapError !== null),
  };
}

type FailureSummaryInput = {
  readonly outcomes: readonly CaptureOutcome[];
  readonly pageErrors: number;
  readonly failedRequests: number;
  readonly consoleMessages: readonly CapturedConsole[];
  readonly strictConsole: boolean;
  readonly watch?: number;
  readonly diff?: number;
};

function buildFailureSummary(input: FailureSummaryInput): SnapFailureSummary {
  const totals = outcomeTotals(input.outcomes);
  const evidence = evidenceFailureCounts(input.outcomes);
  const console = consoleFailureCounts(input.consoleMessages, input.strictConsole);
  return {
    navigation: totals.navigation,
    navActions: totals.navActions,
    pageErrors: input.pageErrors,
    failedRequests: input.failedRequests,
    steps: totals.steps,
    contrast: totals.contrast,
    aria: evidence.aria,
    map: evidence.map,
    eval: evidence.eval,
    watch: input.watch ?? 0,
    diff: input.diff ?? 0,
    assertions: totals.assertions,
    consoleErrors: console.errors,
    consoleWarnings: console.warnings,
  };
}

type LaunchExtras = Partial<Pick<ProbeLaunchOptions, "pages" | "contexts" | "contextCookies" | "cookieDomain">>;

async function launchSnapSession(opts: Args, name: string, extras: LaunchExtras = {}): Promise<ProbeSession> {
  const traceDir = opts.failureEvidence ? await artifactDir("traces") : null;
  const session = await launchProbeSession({
    headless: !opts.vnc,
    viewport: opts.viewport,
    colorScheme: opts.colorScheme,
    reducedMotion: opts.reducedMotion || opts.probe,
    localStorage: buildSeeds(opts),
    device: opts.device,
    trace: opts.failureEvidence,
    ...(traceDir === null ? {} : { harPathPrefix: join(traceDir, name) }),
    ...extras,
  });
  if (opts.probe) {
    await Promise.all(session.contexts.map(({ context }) => context.addInitScript({ content: PROBE_CSS_SCRIPT })));
  }
  return session;
}

function shouldProduceShot(opts: Args): boolean {
  return opts.shotOf !== null || opts.shot || opts.baseline || opts.diff;
}

async function capturePages(session: ProbeSession, opts: Args, plan: ShotPlan): Promise<CaptureOutcome[]> {
  const outcomes: CaptureOutcome[] = [];
  for (let index = 0; index < opts.pages; index += 1) {
    const page = session.pages[index] as Page;
    // biome-ignore lint/performance/noAwaitInLoops: pages are driven sequentially so later tabs observe earlier-tab actions.
    outcomes.push(await capture(page, opts, { ...plan, pageIndex: index, totalPages: opts.pages }, session));
  }
  return outcomes;
}

type ManifestInput = Omit<SnapManifest, "schemaVersion">;

async function writeManifestIfRequested(opts: Args, name: string, input: ManifestInput): Promise<string | null> {
  return opts.json ? await writeManifest(name, { schemaVersion: 1, ...input }) : null;
}

async function snap(opts: Args): Promise<number> {
  const { url, name } = snapDestination(opts);
  const out = join(await artifactDir("snaps"), `${name}.png`);
  // Whether we write a PNG. --no-shot/--text suppress it, but --baseline/--diff
  // need pixels to compare, and --shot-of is itself a shot — so those force it on.
  const produceShot = shouldProduceShot(opts);
  const totalPages = opts.pages;
  const session = await launchSnapSession(opts, name, { pages: totalPages });

  const plan: ShotPlan = { url, out, produceShot };
  const outcomes = await capturePages(session, opts, plan);
  const evidenceSession = sessionForEvidence(session, outcomes);
  // --watch: a timed series on PAGE 0 after everything settled (a streaming turn reflow, transient states).
  const watchTicks = opts.watchMs > 0 ? await runWatchSeries(session.pages[0] as Page, opts, pageOut(out, 0, totalPages)) : [];
  extendEvidenceThroughWatch(outcomes, session);
  const failed = [...session.requests.values()].filter((r) => r.failed !== null || (r.status ?? 0) >= HTTP_ERROR_STATUS_MIN);
  for (const outcome of outcomes) {
    const ctx: ReportCtx = { ...plan, out: pageOut(out, outcome.pageIndex, totalPages), failed, totalPages };
    printPageReport(sessionForEvidence(session, [outcome]), outcome, opts, ctx);
  }
  printWatchBlock(watchTicks);
  printCheckpointScope(session, evidenceSession);
  printCaptureLog(evidenceSession, failed);
  printCropNote(opts, { ...plan, failed, totalPages });
  // Baseline/diff compares PAGE 0's shot (the canonical surface); multi-page baselines aren't a use case yet.
  const { diffPairs, ssimFailed } = await runBaselineOrDiff(opts, pageOut(out, 0, totalPages), name);

  const totals = outcomeTotals(outcomes);
  const evidenceFailures = evidenceFailureCounts(outcomes);
  const watchFailures =
    watchTicks.filter((tick) => tick.shotError !== null).length +
    watchTicks.reduce((count, tick) => count + tick.evals.filter((entry) => entry.failed).length, 0);
  // Exit non-zero if anything observably went wrong, so `snap` is CI-usable.
  const failureSummary = buildFailureSummary({
    outcomes,
    pageErrors: evidenceSession.pageErrors.length,
    failedRequests: failed.length,
    consoleMessages: evidenceSession.consoleMessages,
    strictConsole: opts.strictConsole,
    watch: watchFailures,
    diff: Number(ssimFailed),
  });
  const red = hasSnapFailure(failureSummary);
  const artifacts = await finishSession(session, red, name, opts.failureEvidence);
  const manifestPath = await writeManifestIfRequested(opts, name, {
    status: red ? "fail" : "pass",
    target: { url, name },
    environment: {
      viewport: opts.viewport,
      device: opts.device,
      colorScheme: opts.colorScheme,
      reducedMotion: opts.reducedMotion || opts.probe,
    },
    failures: failureSummary,
    traces: artifacts.traces,
    hars: artifacts.hars,
    console: session.consoleMessages,
    ...(opts.checkpoint
      ? {
          evidence: {
            scope: "checkpoint" as const,
            console: evidenceSession.consoleMessages,
            pageErrors: evidenceSession.pageErrors,
          },
        }
      : {}),
    pageErrors: session.pageErrors,
    failedRequests: failed,
    captures: outcomes,
    ...(watchTicks.length === 0 ? {} : { watch: { totalMs: opts.watchMs, intervalMs: opts.watchEveryMs, ticks: watchTicks } }),
  });
  const mapSummary = mapOutputSummary(opts.map, outcomes);
  printResult("snap", [
    ["out", produceShot ? pageOut(out, 0, totalPages) : "(none)"],
    ["pages", totalPages],
    ["watch", watchTicks.length],
    ["watch-fails", watchFailures],
    ["aria", totals.ariaSeen ? "yes" : "no"],
    ["aria-fails", evidenceFailures.aria],
    ["map", mapSummary.count],
    ["map-dom-fallbacks", mapSummary.domFallbacks],
    ["map-fails", evidenceFailures.map],
    ["evals", totals.evals],
    ["eval-fails", evidenceFailures.eval],
    ["contrast-fails", totals.contrast],
    ["assertion-fails", totals.assertions],
    ["console-errors", failureSummary.consoleErrors],
    ["sandbox-trace-noise", session.consoleMessages.filter(isSandboxTraceNoise).length],
    ["console-warnings", evidenceSession.consoleMessages.filter((entry) => entry.type === "warning").length],
    [
      "boot-console-warnings",
      session.consoleMessages.filter((entry) => entry.type === "warning").length -
        evidenceSession.consoleMessages.filter((entry) => entry.type === "warning").length,
    ],
    ["trace", artifacts.traces[0] ?? "none"],
    ["har", artifacts.hars[0] ?? "none"],
    ["json", manifestPath ?? "none"],
    ["nav", totals.navigation > 0 ? "ERROR" : "OK"],
    ["nav-actions-failed", totals.navActions],
    ["steps-failed", totals.steps],
    ["page-errors", evidenceSession.pageErrors.length],
    ["failed-req", failed.length],
    ["deadcss", totals.deadCss],
    ["emptycss", totals.emptyCss],
    ...diffPairs,
  ]);
  return red ? 1 : 0;
}

async function loadScenario(pathArg: string): Promise<ScenarioSpec> {
  const path = isAbsolute(pathArg) ? pathArg : resolve(process.cwd(), pathArg);
  const source = await readFile(path, "utf8");
  return parseScenarioSpec(source, basename(path, extname(path)));
}

function scenarioFailureSummary(
  outcomes: readonly CaptureOutcome[],
  session: ProbeSession,
  failedRequests: readonly CapturedRequest[],
  strictConsole: boolean,
): SnapFailureSummary {
  const evidence = evidenceFailureCounts(outcomes);
  const consoleFailures = consoleFailureCounts(consoleForEvidence(session.consoleMessages, outcomes), strictConsole);
  return {
    navigation: outcomes.filter((outcome) => outcome.navError !== null).length,
    navActions: outcomes.reduce((count, outcome) => count + outcome.navFailures, 0),
    pageErrors: pageErrorsForEvidence(session.pageErrors, outcomes).length,
    failedRequests: failedRequests.length,
    steps: outcomes.reduce((count, outcome) => count + outcome.stepFailures, 0),
    contrast: outcomes.reduce((count, outcome) => count + outcome.contrastResults.filter((entry) => entry.failed).length, 0),
    aria: evidence.aria,
    map: evidence.map,
    eval: evidence.eval,
    watch: 0,
    diff: 0,
    assertions: outcomes.reduce((count, outcome) => count + outcome.assertions.filter((entry) => entry.failed).length, 0),
    consoleErrors: consoleFailures.errors,
    consoleWarnings: consoleFailures.warnings,
  };
}

type ScenarioEvidenceRange = {
  readonly consoleStart: number;
  readonly consoleEnd: number;
  readonly pageErrorStart: number;
  readonly pageErrorEnd: number;
};

async function resetScenarioEvidence(page: Page): Promise<void> {
  await page.evaluate(() => globalThis.__orb?.resetEvidence());
}

async function captureScenarioCheckpoints(
  session: ProbeSession,
  checkpoints: readonly Args[],
): Promise<{ outcomes: CaptureOutcome[]; plans: ShotPlan[]; evidenceRanges: ScenarioEvidenceRange[] }> {
  const outcomes: CaptureOutcome[] = [];
  const plans: ShotPlan[] = [];
  const evidenceRanges: ScenarioEvidenceRange[] = [];
  const snapsDir = await artifactDir("snaps");
  let priorUrl: string | null = null;
  for (const checkpoint of checkpoints) {
    const destination = snapDestination(checkpoint);
    const plan: ShotPlan = { url: destination.url, out: join(snapsDir, `${destination.name}.png`), produceShot: shouldProduceShot(checkpoint) };
    plans.push(plan);
    const keepLivePage = HTTP_URL_RE.test(plan.url) && plan.url === priorUrl;
    const consoleStart = session.consoleMessages.length;
    const pageErrorStart = session.pageErrors.length;
    if (keepLivePage) {
      // biome-ignore lint/performance/noAwaitInLoops: each checkpoint owns a distinct evidence window.
      await resetScenarioEvidence(session.page);
    }
    outcomes.push(await capture(session.page, checkpoint, { ...plan, pageIndex: 0, totalPages: 1, navigatePage: !keepLivePage }, session));
    evidenceRanges.push({
      consoleStart,
      consoleEnd: session.consoleMessages.length,
      pageErrorStart,
      pageErrorEnd: session.pageErrors.length,
    });
    priorUrl = plan.url;
  }
  return { outcomes, plans, evidenceRanges };
}

type ScenarioReportArgs = {
  readonly spec: ScenarioSpec;
  readonly session: ProbeSession;
  readonly checkpoints: readonly Args[];
  readonly outcomes: readonly CaptureOutcome[];
  readonly plans: readonly ShotPlan[];
  readonly evidenceRanges: readonly ScenarioEvidenceRange[];
  readonly failedRequests: CapturedRequest[];
};

function scenarioCheckpointSession(session: ProbeSession, outcome: CaptureOutcome, range: ScenarioEvidenceRange): SessionCounts {
  if (outcome.evidenceRange !== null) {
    return sessionForEvidence(session, [outcome]);
  }
  const consoleMessages = session.consoleMessages.slice(range.consoleStart, range.consoleEnd);
  return {
    requests: session.requests,
    consoleMessages,
    consoleLines: consoleMessages.map((message) => message.line),
    pageErrors: session.pageErrors.slice(range.pageErrorStart, range.pageErrorEnd),
  };
}

function printScenarioReports(args: ScenarioReportArgs): void {
  const { spec, session, checkpoints, outcomes, plans, evidenceRanges, failedRequests } = args;
  for (let index = 0; index < outcomes.length; index += 1) {
    const plan = plans[index] as ShotPlan;
    const range = evidenceRanges[index] as ScenarioEvidenceRange;
    const outcome = outcomes[index] as CaptureOutcome;
    const checkpointSession = scenarioCheckpointSession(session, outcome, range);
    if (checkpoints[index]?.summary) {
      const failedAssertions = outcome.assertions.filter((entry) => entry.failed).length;
      const errors = checkpointSession.consoleMessages.filter((message) => message.type === "error" && !isSandboxTraceNoise(message)).length;
      const warnings = checkpointSession.consoleMessages.filter((message) => message.type === "warning").length;
      const failed =
        outcome.navError !== null ||
        outcome.navFailures > 0 ||
        outcome.stepFailures > 0 ||
        failedAssertions > 0 ||
        errors > 0 ||
        ((checkpoints[index]?.strictConsole ?? false) && warnings > 0);
      print(
        `CHECKPOINT ${spec.checkpoints[index]?.name ?? index} ${failed ? "FAIL" : "PASS"} ` +
          `shot=${plan.produceShot ? plan.out : "(none)"} nav=${outcome.navFailures} steps=${outcome.stepFailures} assertions=${failedAssertions} ` +
          `console=${errors}e/${warnings}w page-errors=${checkpointSession.pageErrors.length}`,
      );
      continue;
    }
    print(`\n========== CHECKPOINT ${spec.checkpoints[index]?.name ?? index} ==========`);
    printPageReport(checkpointSession, outcomes[index] as CaptureOutcome, checkpoints[index] as Args, { ...plan, failed: [], totalPages: 1 });
  }
  if (failedRequests.length > 0) {
    print(`\n${failedRequests.length} failed request(s) occurred across the scenario; the aggregate log follows.`);
  }
  const evidenceSession = sessionForEvidence(session, outcomes);
  printCheckpointScope(session, evidenceSession);
  printCaptureLog(evidenceSession, failedRequests);
}

async function snapScenario(opts: Args): Promise<number> {
  const scenarioPath = opts.scenario;
  if (scenarioPath === null) {
    return 2;
  }
  let prepared: PreparedScenario;
  try {
    prepared = await prepareScenario(opts, scenarioPath);
  } catch (error) {
    print(`SCENARIO ERROR: ${errorMessage(error)}`);
    return 2;
  }
  const { spec, checkpoints } = prepared;
  const errors = scenarioErrors(checkpoints);
  if (errors.length > 0) {
    for (const error of errors) {
      print(`SCENARIO ARG ERROR: ${error}`);
    }
    return 2;
  }
  const first = checkpoints[0] as Args;
  const session = await launchSnapSession(first, spec.name);
  const { outcomes, plans, evidenceRanges } = await captureScenarioCheckpoints(session, checkpoints);
  const evidenceConsole = consoleForEvidence(session.consoleMessages, outcomes);
  const evidencePageErrors = pageErrorsForEvidence(session.pageErrors, outcomes);
  const failedRequests = [...session.requests.values()].filter((request) => request.failed !== null || (request.status ?? 0) >= HTTP_ERROR_STATUS_MIN);
  const failureSummary = scenarioFailureSummary(outcomes, session, failedRequests, opts.strictConsole);
  const red = hasSnapFailure(failureSummary);
  const artifacts = await finishSession(session, red, spec.name, opts.failureEvidence);
  printScenarioReports({ spec, session, checkpoints, outcomes, plans, evidenceRanges, failedRequests });
  const manifestPath = await writeManifestIfRequested(opts, spec.name, {
    status: red ? "fail" : "pass",
    target: { url: scenarioPath, name: spec.name },
    environment: {
      viewport: first.viewport,
      device: first.device,
      colorScheme: first.colorScheme,
      reducedMotion: first.reducedMotion || first.probe,
    },
    failures: failureSummary,
    traces: artifacts.traces,
    hars: artifacts.hars,
    console: session.consoleMessages,
    pageErrors: session.pageErrors,
    ...(opts.checkpoint ? { evidence: { scope: "checkpoint" as const, console: evidenceConsole, pageErrors: evidencePageErrors } } : {}),
    failedRequests,
    captures: outcomes,
    scenario: {
      checkpoints: evidenceRanges.map((range, index) => ({
        name: spec.checkpoints[index]?.name ?? String(index),
        screenshot: (plans[index] as ShotPlan).produceShot ? (plans[index] as ShotPlan).out : null,
        console: session.consoleMessages.slice(range.consoleStart, range.consoleEnd),
        pageErrors: session.pageErrors.slice(range.pageErrorStart, range.pageErrorEnd),
      })),
    },
  });
  printResult("snap-scenario", [
    ["name", spec.name],
    ["checkpoints", outcomes.length],
    ["assertion-fails", failureSummary.assertions],
    ["console-errors", failureSummary.consoleErrors],
    ["console-warnings", evidenceConsole.filter((entry) => entry.type === "warning").length],
    [
      "boot-console-warnings",
      session.consoleMessages.filter((entry) => entry.type === "warning").length - evidenceConsole.filter((entry) => entry.type === "warning").length,
    ],
    ["trace", artifacts.traces[0] ?? "none"],
    ["har", artifacts.hars[0] ?? "none"],
    ["json", manifestPath ?? "none"],
  ]);
  return red ? 1 : 0;
}

type MatrixVariant = {
  readonly id: string;
  readonly device: string | null;
  readonly viewport: Viewport;
  readonly colorScheme: "light" | "dark";
  readonly reducedMotion: boolean;
};

const MATRIX_VARIANTS: readonly MatrixVariant[] = [
  { id: "desktop-light-motion", device: null, viewport: DEFAULT_VIEWPORT, colorScheme: "light", reducedMotion: false },
  { id: "desktop-light-reduced", device: null, viewport: DEFAULT_VIEWPORT, colorScheme: "light", reducedMotion: true },
  { id: "desktop-dark-motion", device: null, viewport: DEFAULT_VIEWPORT, colorScheme: "dark", reducedMotion: false },
  { id: "desktop-dark-reduced", device: null, viewport: DEFAULT_VIEWPORT, colorScheme: "dark", reducedMotion: true },
  { id: "mobile-light-motion", device: MOBILE_DEVICE, viewport: DEFAULT_VIEWPORT, colorScheme: "light", reducedMotion: false },
  { id: "mobile-light-reduced", device: MOBILE_DEVICE, viewport: DEFAULT_VIEWPORT, colorScheme: "light", reducedMotion: true },
  { id: "mobile-dark-motion", device: MOBILE_DEVICE, viewport: DEFAULT_VIEWPORT, colorScheme: "dark", reducedMotion: false },
  { id: "mobile-dark-reduced", device: MOBILE_DEVICE, viewport: DEFAULT_VIEWPORT, colorScheme: "dark", reducedMotion: true },
];

async function snapMatrix(opts: Args): Promise<number> {
  const baseName = opts.out ?? (opts.scenario === null ? routeSlug(opts.route) : routeSlug(basename(opts.scenario, extname(opts.scenario))));
  let failures = 0;
  for (const variant of MATRIX_VARIANTS) {
    const runArgs: Args = {
      ...opts,
      matrix: false,
      out: `${baseName}-${variant.id}`,
      device: variant.device,
      viewport: variant.viewport,
      colorScheme: variant.colorScheme,
      reducedMotion: variant.reducedMotion,
    };
    print(`\n========== MATRIX ${variant.id} ==========`);
    // biome-ignore lint/performance/noAwaitInLoops: variants are sequential to cap local Chromium/resource pressure.
    const code = runArgs.scenario === null ? await snap(runArgs) : await snapScenario(runArgs);
    failures += Number(code !== 0);
  }
  printResult("snap-matrix", [
    ["variants", MATRIX_VARIANTS.length],
    ["failed", failures],
  ]);
  return failures > 0 ? 1 : 0;
}

// ── --contexts N: N isolated, differently-authenticated browser contexts ────────────────────────────
// A SEPARATE top-level path from `snap()` (not threaded through the --pages loop): contexts have their
// OWN cookies/console/requests (unlike --pages tabs, which share one context's auth) — reusing the
// generic `capture()`/print* helpers (widened to `SessionCounts`) but iterating `session.contexts`
// instead of `session.pages`, one page (page 0) per context. `--pages` + `--contexts` together is refused
// in `main()` before this ever runs.
type FixtureUser = { readonly handle: string; readonly password: string };

// Log in EACH user via the real form door (POST /api/auth/login) BEFORE any browser context opens — the
// session cookie is then seeded into its matching context (buildContext in _kit/browser.ts), so the very
// first navigation is already authenticated as that user, no in-page login-form drive needed. Returns
// null (having already printed the failing line) on the first login that doesn't mint a cookie.
async function loginAllFixtureUsers(users: readonly FixtureUser[], target: FixtureTarget): Promise<(string | null)[] | null> {
  const cookies: (string | null)[] = [];
  for (const u of users) {
    // biome-ignore lint/performance/noAwaitInLoops: N logins (≤4) against the fixture's per-IP throttle — sequential is deliberate, not a bottleneck worth parallelizing.
    const login = await loginFixtureUser(target.serverUrl, u.handle, u.password);
    if ("error" in login) {
      print(`LOGIN FAILED  ${u.handle}: ${login.error}`);
      return null;
    }
    cookies.push(login.cookie);
  }
  return cookies;
}

type ContextReportArgs = {
  readonly opts: Args;
  readonly session: ProbeSession;
  readonly outcomes: readonly CaptureOutcome[];
  readonly users: readonly FixtureUser[];
  readonly plan: ShotPlan;
  readonly out: string;
  readonly totalContexts: number;
};

// One context's report section + its running request/error totals — factored out of snapContexts to
// keep that function's cognitive complexity under the gate. A single params object dodges the
// too-many-positional-params rule while keeping every field self-documenting at the call site.
function reportOneContext(args: ContextReportArgs, i: number): { readonly failedReq: number; readonly pageErrors: number } {
  const { opts, session, outcomes, users, plan, out, totalContexts } = args;
  const ctxSession = session.contexts[i] as (typeof session.contexts)[number];
  const outcome = outcomes[i] as CaptureOutcome;
  const evidenceSession = sessionForEvidence(ctxSession, [outcome]);
  const failed = [...ctxSession.requests.values()].filter((r) => r.failed !== null || (r.status ?? 0) >= HTTP_ERROR_STATUS_MIN);
  const ctx: ReportCtx = { ...plan, out: contextOut(out, i, totalContexts), failed, totalPages: totalContexts, label: "CONTEXT" };
  print(`\nuser         ${users[i]?.handle} (context ${i})`);
  printPageReport(evidenceSession, outcome, opts, ctx);
  printCheckpointScope(ctxSession, evidenceSession);
  printCaptureLog(evidenceSession, failed);
  printCropNote(opts, ctx);
  return { failedReq: failed.length, pageErrors: evidenceSession.pageErrors.length };
}

async function captureContexts(session: ProbeSession, opts: Args, plan: ShotPlan, totalContexts: number): Promise<CaptureOutcome[]> {
  const outcomes: CaptureOutcome[] = [];
  for (let index = 0; index < totalContexts; index += 1) {
    const page = session.contexts[index]?.pages[0] as Page;
    outcomes.push(
      // biome-ignore lint/performance/noAwaitInLoops: contexts are driven sequentially so later users observe earlier-user actions.
      await capture(
        page,
        opts,
        { ...plan, pageIndex: index, totalPages: totalContexts, unit: "u" },
        session.contexts[index] as (typeof session.contexts)[number],
      ),
    );
  }
  return outcomes;
}

function reportContexts(args: ContextReportArgs): { readonly failedRequests: number; readonly pageErrors: number } {
  let pageErrors = 0;
  let failedRequests = 0;
  for (let index = 0; index < args.totalContexts; index += 1) {
    const totals = reportOneContext(args, index);
    failedRequests += totals.failedReq;
    pageErrors += totals.pageErrors;
  }
  return { failedRequests, pageErrors };
}

async function snapContexts(opts: Args, users: readonly FixtureUser[], target: FixtureTarget): Promise<number> {
  const url = buildUrl(opts.base, opts.route);
  const name = opts.out ?? routeSlug(opts.route);
  const out = join(await artifactDir("snaps"), `${name}.png`);
  const produceShot = shouldProduceShot(opts);
  const totalContexts = users.length;

  const cookies = await loginAllFixtureUsers(users, target);
  if (cookies === null) {
    return 1;
  }

  const session = await launchSnapSession(opts, name, {
    contexts: totalContexts,
    contextCookies: cookies,
    cookieDomain: new URL(opts.base).hostname,
  });

  const plan: ShotPlan = { url, out, produceShot };
  const outcomes = await captureContexts(session, opts, plan, totalContexts);
  const reportArgs: ContextReportArgs = { opts, session, outcomes, users, plan, out, totalContexts };
  const reportTotals = reportContexts(reportArgs);
  const totals = outcomeTotals(outcomes);
  const evidenceFailures = evidenceFailureCounts(outcomes);
  const allConsole = session.contexts.flatMap((context) => context.consoleMessages);
  const allEvidenceConsole = session.contexts.flatMap((context, index) => consoleForEvidence(context.consoleMessages, [outcomes[index] as CaptureOutcome]));
  const allPageErrors = session.contexts.flatMap((context) => context.pageErrors);
  const allEvidencePageErrors = session.contexts.flatMap((context, index) => pageErrorsForEvidence(context.pageErrors, [outcomes[index] as CaptureOutcome]));
  const failureSummary = buildFailureSummary({
    outcomes,
    pageErrors: reportTotals.pageErrors,
    failedRequests: reportTotals.failedRequests,
    consoleMessages: allEvidenceConsole,
    strictConsole: opts.strictConsole,
  });
  const red = hasSnapFailure(failureSummary);
  const artifacts = await finishSession(session, red, name, opts.failureEvidence);
  const manifestPath = await writeManifestIfRequested(opts, name, {
    status: red ? "fail" : "pass",
    target: { url, name },
    environment: {
      viewport: opts.viewport,
      device: opts.device,
      colorScheme: opts.colorScheme,
      reducedMotion: opts.reducedMotion || opts.probe,
    },
    failures: failureSummary,
    traces: artifacts.traces,
    hars: artifacts.hars,
    console: allConsole,
    pageErrors: allPageErrors,
    ...(opts.checkpoint ? { evidence: { scope: "checkpoint" as const, console: allEvidenceConsole, pageErrors: allEvidencePageErrors } } : {}),
    failedRequests: session.contexts.flatMap((context) =>
      [...context.requests.values()].filter((request) => request.failed !== null || (request.status ?? 0) >= HTTP_ERROR_STATUS_MIN),
    ),
    captures: outcomes,
  });
  const mapSummary = mapOutputSummary(opts.map, outcomes);
  printResult("snap", [
    ["out", produceShot ? contextOut(out, 0, totalContexts) : "(none)"],
    ["contexts", totalContexts],
    ["users", users.map((u) => u.handle).join(",")],
    ["aria", totals.ariaSeen ? "yes" : "no"],
    ["aria-fails", evidenceFailures.aria],
    ["map", mapSummary.count],
    ["map-dom-fallbacks", mapSummary.domFallbacks],
    ["map-fails", evidenceFailures.map],
    ["evals", totals.evals],
    ["eval-fails", evidenceFailures.eval],
    ["contrast-fails", totals.contrast],
    ["assertion-fails", totals.assertions],
    ["console-errors", failureSummary.consoleErrors],
    ["console-warnings", allEvidenceConsole.filter((entry) => entry.type === "warning").length],
    [
      "boot-console-warnings",
      allConsole.filter((entry) => entry.type === "warning").length - allEvidenceConsole.filter((entry) => entry.type === "warning").length,
    ],
    ["trace", artifacts.traces[0] ?? "none"],
    ["har", artifacts.hars[0] ?? "none"],
    ["json", manifestPath ?? "none"],
    ["nav", totals.navigation > 0 ? "ERROR" : "OK"],
    ["nav-actions-failed", totals.navActions],
    ["steps-failed", totals.steps],
    ["page-errors", reportTotals.pageErrors],
    ["failed-req", reportTotals.failedRequests],
    ["deadcss", totals.deadCss],
    ["emptycss", totals.emptyCss],
  ]);
  return red ? 1 : 0;
}

// Isolated-stage gate: --stage-down tears down and exits; --isolated boots-or-reuses the stage and repoints
// the base URL at it BEFORE the normal snap runs. Everything else (flags, capture, report) is unchanged.
// `--contexts N>1` (or `--as`) targets the multi-user FIXTURE stack, NEVER the shared :5173/:8788 —
// resolves its users + repoints opts.base at its client port, or returns a loud refusal line (the
// fixture down/mismatched, or N exceeding its seeded roster) — never a silent fallback to the shared
// stack. `null` return = proceed on the ordinary (single-context) path; `{ users }` = drive snapContexts.
function resolveContextsMode(opts: Args, target: FixtureTarget): { readonly users: readonly FixtureUser[] } | { readonly refuse: string } | null {
  if (opts.contexts <= 1 && opts.as === null) {
    return null;
  }
  if (opts.contexts > 1 && opts.as !== null) {
    return {
      refuse: "--as is only for a single context (--contexts 1, the default) — a --contexts N>1 run already assigns N distinct handles in roster order",
    };
  }
  if (opts.pages > 1) {
    return { refuse: "--contexts + --pages together is an unexercised combination — drive one at a time" };
  }
  const status = fixtureStatus(target);
  if (!status.up) {
    return { refuse: fixtureRefusalLine(status.reason) };
  }
  const resolved = opts.as !== null ? resolveFixtureUsers([opts.as]) : defaultFixtureUsers(opts.contexts);
  if ("error" in resolved) {
    return { refuse: fixtureRefusalLine(resolved.error) };
  }
  // The SAME resolved target drives both halves — the health probe above and the browser's origin here.
  // (The old shape hard-coded them separately, so an override reached neither.)
  opts.base = target.baseUrl;
  return { users: resolved.users };
}

// `--file` is a static-mock mode: it cannot mean anything alongside a stack-serving mode (an isolated stage
// or the fixture's authenticated contexts), and a static file has no `__orb` bridge for the nav flags. Refuse
// with the reason + the remedy rather than snapping something the caller didn't ask for.
function refuseFileMode(opts: Args): string | null {
  if (opts.file === null) {
    return null;
  }
  if (!existsSync(fileTarget(opts.file).path)) {
    return `FILE REFUSED  no such file: ${fileTarget(opts.file).path} — pass a path relative to the CWD or an absolute one`;
  }
  if (opts.isolated) {
    return "FILE REFUSED  --file renders a local file over file://; --isolated/--dirty/--ref boot a stack to serve a ROUTE — drive one at a time";
  }
  if (opts.contexts > 1 || opts.as !== null) {
    return "FILE REFUSED  --file has no server to authenticate against — drop --contexts/--as (a static mock has no users)";
  }
  if (opts.navActions.length > 0) {
    return "FILE REFUSED  --goto/--open-chat/--open-character/--context-tab drive the app's __orb nav bridge; a static file has none — drop them (--click/--fill still work)";
  }
  return null;
}

function configureStage(opts: Args): number | null {
  if (opts.stageStatus) {
    print(stageStatus());
    return 0;
  }
  if (opts.stageDown) {
    print(`[snap-stage] ${teardownStage()}`);
    return 0;
  }
  if (opts.isolated) {
    try {
      const stage = opts.dirty
        ? ensureStage({ fresh: opts.fresh, dirty: true })
        : ensureStage(opts.ref === null ? { fresh: opts.fresh } : { ref: opts.ref, fresh: opts.fresh });
      opts.base = stage.baseUrl;
    } catch (e) {
      print(`STAGE ERROR: ${errorMessage(e)}`);
      return 1;
    }
  }
  return null;
}

async function runResolvedMode(opts: Args): Promise<number> {
  if (opts.matrix) {
    return await snapMatrix(opts);
  }
  if (opts.scenario !== null) {
    return await snapScenario(opts);
  }
  // ONE resolve of the fixture's origins (flag > env > the offset-pair defaults), threaded into BOTH the
  // health probe and the login door / browser base — see _kit/fixture.ts's PORTS note.
  const fixtureTarget = resolveFixtureTarget({ serverUrl: opts.fixtureServer, baseUrl: opts.fixtureBase });
  const contextsMode = resolveContextsMode(opts, fixtureTarget);
  if (contextsMode !== null) {
    if ("refuse" in contextsMode) {
      print(contextsMode.refuse);
      return 1;
    }
    return await snapContexts(opts, contextsMode.users, fixtureTarget);
  }
  return await snap(opts);
}

async function main(opts: Args): Promise<number> {
  const cliExit = printCliPreamble(opts);
  if (cliExit !== null) {
    return cliExit;
  }
  const fileRefusal = refuseFileMode(opts);
  if (fileRefusal !== null) {
    print(fileRefusal);
    return 1;
  }
  const stageExit = configureStage(opts);
  if (stageExit !== null) {
    return stageExit;
  }
  return await runResolvedMode(opts);
}

function printCliPreamble(opts: Args): number | null {
  if (opts.errors.length > 0) {
    for (const error of opts.errors) {
      print(`ARG ERROR    ${error}`);
    }
    print("Run pnpm snap --help for supported flags and combinations.");
    return 2;
  }
  if (opts.help) {
    print(SNAP_HELP);
    return 0;
  }
  return null;
}

const cliEntry = process.argv[1];
if (cliEntry !== undefined && import.meta.url === pathToFileURL(cliEntry).href) {
  process.exitCode = await main(parseSnapArgs(process.argv.slice(2)));
}
