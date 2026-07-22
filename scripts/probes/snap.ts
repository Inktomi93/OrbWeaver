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
 *                                          # an in-page throw prints EVAL ERROR, doesn't abort.
 *                                          # A function LITERAL is auto-invoked — `async()=>{…}`
 *                                          # / `()=>{…}` run and return their result (no more
 *                                          # silent-undefined from an un-called async arrow;
 *                                          # you may still write `(...)()` explicitly).
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
 *   skipped-with-reason line and stays green (skip ≠ fail). FFMPEG_BIN env overrides.
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
 *   pnpm snap --stage-down                 # stop the stage stack + remove the worktree/dir (ignores route)
 *   First-boot cost: one `git worktree add` (or, for --dirty, an rsync) + `pnpm install` (shared store →
 *   cheap) + a stack boot; the stage then stays WARM across snap calls. A new HEAD sha auto-rebuilds the
 *   commit-pinned stage (the stale one is torn down); --dirty always re-syncs instead. A ref/tree predating
 *   the vite.config VITE_API_TARGET hook is REJECTED (it would proxy /api to the dev stack).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { errorMessage } from "@orb/kit/error-message";
import type { Locator, Page } from "@playwright/test";
import sharp from "sharp";
import { artifactDir, routeSlug } from "./_kit/artifacts.ts";
import type { CapturedRequest, LocalStorageSeed, ProbeSession } from "./_kit/browser.ts";
import { buildUrl, DEFAULT_BASE, DEFAULT_DEBUG_TOKEN, launchProbeSession, settle } from "./_kit/browser.ts";
import { resolveFfmpeg } from "./_kit/ffmpeg.ts";
import type { Viewport } from "./_kit/flags.ts";
import { parseViewport, splitFirstEq, splitLastEq } from "./_kit/flags.ts";
import type { ResultPair } from "./_kit/result.ts";
import { print, printResult } from "./_kit/result.ts";
import { ensureStage, teardownStage } from "./_kit/snap-stage.ts";
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

type Step =
  | { kind: "click"; selector: string }
  | { kind: "jsclick"; selector: string }
  | { kind: "press"; selector: string }
  | { kind: "hover"; selector: string }
  | { kind: "fill"; selector: string; value: string }
  | { kind: "key"; selector: string; key: string }
  | { kind: "waitfor"; selector: string };

type Args = {
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
   *  you still get a PNG of wherever the page ended up. */
  steps: Step[];
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
  /** Raw JS run in-page post-settle (repeatable, argv order). JSON-printed, capped. */
  eval: string[];
  /** Selectors WCAG-contrast-checked post-settle (repeatable): text color vs effective
   *  ancestor background of the FIRST match. */
  contrast: string[];
  /** Force PIXEL-SAMPLE for every --contrast target (even ones the css walk could resolve) — verify a
   *  css-resolve number against the real composite, or sample when you already know a layer paints behind. */
  contrastPixel: boolean;
  /** Emit a selector map (role · accessible name · best stable selector) of interactive/
   *  labeled elements within `mapSelector` — "how do I reach this" instead of grepping source. */
  map: boolean;
  /** Subtree to map (default "body"); scope it (e.g. a just-revealed dialog) to shrink output. */
  mapSelector: string;
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
};

// ── Flag dispatch ───────────────────────────────────────────────────────────
// One handler per flag (Record dispatch, house style) — each consumes what it
// needs from `rest`. Repeatable flags push; order-sensitive steps land in
// args.steps in argv order.
type FlagHandler = (args: Args, rest: string[]) => void;

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

function ariaFlag(args: Args, rest: string[], textMode: boolean): void {
  args.aria = true;
  // --text is the cheap combo: structure-as-text, no pixels.
  if (textMode) {
    args.shot = false;
  }
  const sel = consumeOptionalSelector(rest);
  if (sel !== null) {
    args.ariaSelector = sel;
  }
}

function mapFlag(args: Args, rest: string[]): void {
  args.map = true;
  const sel = consumeOptionalSelector(rest);
  if (sel !== null) {
    args.mapSelector = sel;
  }
}

const FLAG_HANDLERS: Record<string, FlagHandler> = {
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
  "--click": (a, rest) => {
    a.steps.push({ kind: "click", selector: rest.shift() ?? "" });
  },
  // In-page el.click() — bypasses Playwright's actionability checks for
  // stubborn targets (icon divs under overlay stacks).
  "--jsclick": (a, rest) => {
    a.steps.push({ kind: "jsclick", selector: rest.shift() ?? "" });
  },
  // Hover the target's position then FORCE-click — for hover-revealed controls
  // (group-hover kebabs/toolbars stay actionability-invisible) and Radix
  // triggers that want real pointer events but fail visibility checks.
  "--press": (a, rest) => {
    a.steps.push({ kind: "press", selector: rest.shift() ?? "" });
  },
  "--hover": (a, rest) => {
    a.steps.push({ kind: "hover", selector: rest.shift() ?? "" });
  },
  // FIRST '=' splits (localStorage keys never contain '='; JSON values often do).
  "--ls": (a, rest) => {
    const seed = splitFirstEq(rest.shift() ?? "");
    if (seed !== null) {
      a.localStorage.push({ key: seed.head, value: seed.tail });
    }
  },
  // --fill "selector=value" — LAST '=' splits (selectors contain '=').
  "--fill": (a, rest) => {
    const s = splitLastEq(rest.shift() ?? "");
    a.steps.push({ kind: "fill", selector: s.head, value: s.tail });
  },
  // --key "selector=KeyName" (LAST '=' splits; default Enter). Pairs with --fill to
  // COMMIT a search box: `--fill 'input=q' --key 'input=Enter'` snaps a results view.
  "--key": (a, rest) => {
    const s = splitLastEq(rest.shift() ?? "");
    a.steps.push({ kind: "key", selector: s.head, key: s.tail === "" ? "Enter" : s.tail });
  },
  // A POST-STEP wait (vs the page-load `--wait`): waits for `selector` to ATTACH at
  // this point in the step sequence — for content that appears AFTER an interaction.
  // "attached" not "visible": the visibility check false-negatives on full-bleed-
  // modal / portal content that IS painted — pair with `--shot-of`.
  "--wait-for": (a, rest) => {
    a.steps.push({ kind: "waitfor", selector: rest.shift() ?? "" });
  },
  "--no-deadcss": (a) => {
    a.deadCss = false;
  },
  "--aria": (a, rest) => {
    ariaFlag(a, rest, false);
  },
  "--text": (a, rest) => {
    ariaFlag(a, rest, true);
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
  "--wide": (a) => {
    a.viewport = WIDE_VIEWPORT;
  },
  "--viewport": (a, rest) => {
    a.viewport = parseViewport(rest.shift() ?? "") ?? a.viewport;
  },
  "--eval": (a, rest) => {
    const expr = rest.shift();
    if (expr) {
      a.eval.push(expr);
    }
  },
  "--contrast": (a, rest) => {
    const sel = rest.shift();
    if (sel) {
      a.contrast.push(sel);
    }
  },
  "--contrast-pixel": (a) => {
    a.contrastPixel = true;
  },
  "--map": (a, rest) => {
    mapFlag(a, rest);
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
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    route: "/",
    vnc: false,
    waitSelector: null,
    sseSeconds: 0,
    base: DEFAULT_BASE,
    fullPage: false,
    debugToken: DEFAULT_DEBUG_TOKEN,
    steps: [],
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
    shot: true,
    shotOf: null,
    mask: [],
    colorScheme: null,
    reducedMotion: false,
    idle: false,
    eval: [],
    contrast: [],
    contrastPixel: false,
    map: false,
    mapSelector: "body",
    isolated: false,
    ref: null,
    fresh: false,
    dirty: false,
    stageDown: false,
  };
  const rest = [...argv];
  while (rest.length > 0) {
    const tok = rest.shift() as string;
    const handler = FLAG_HANDLERS[tok];
    if (handler !== undefined) {
      handler(args, rest);
    } else if (tok.startsWith("--")) {
      // Unlike neo (silent), a typo'd flag gets a line — agents can't eyeball a
      // missing drawer the way a human watching VNC would.
      print(`UNKNOWN FLAG ${tok} (ignored)`);
    } else {
      args.route = tok;
    }
  }
  return args;
}

// ── Capture phases ──────────────────────────────────────────────────────────

type CaptureOutcome = {
  navError: string | null;
  stepFailures: number;
  deadCss: Array<{ token: string; count: number }>;
  emptyCss: string[];
  ariaText: string | null;
  evalResults: EvalOutcome[];
  contrastResults: ContrastOutcome[];
  mapResult: MapEntry[] | null;
  mapError: string | null;
};

async function navigate(page: Page, opts: Args, url: string): Promise<string | null> {
  const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
  let navError: string | null = null;
  if (!resp) {
    navError = "no response";
  } else if (!resp.ok()) {
    navError = `HTTP ${resp.status()}`;
  }
  // Default readiness gate: agent-bridge.ts sets `data-app-ready` on <html> once the initial reads
  // settle — independent of the never-idle SSE stream. Wait for it so snaps capture the SETTLED app,
  // not mid-hydration skeletons (the "lists sit on skeletons forever" friction). Graceful: a non-app
  // page or an old build that never sets it just falls through (the app self-sets within ~3s), so this
  // only ever adds real load-wait, never a hang.
  await page
    .locator("html[data-app-ready]")
    .waitFor({ state: "attached", timeout: WAIT_SELECTOR_TIMEOUT_MS })
    .catch(() => undefined);
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

async function captureAria(page: Page, opts: Args): Promise<string> {
  try {
    const ariaOpts: { depth?: number; boxes?: boolean } = { boxes: opts.ariaBoxes };
    if (opts.ariaDepth !== null) {
      ariaOpts.depth = opts.ariaDepth;
    }
    return await page.locator(opts.ariaSelector).first().ariaSnapshot(ariaOpts);
  } catch (e) {
    return `ARIA capture failed for "${opts.ariaSelector}": ${errorMessage(e)}`;
  }
}

// ── --eval: arbitrary in-page JS ────────────────────────────────────────────

type EvalOutcome = { expr: string; text: string };

// A bare function LITERAL passed to page.evaluate(string) evaluates to the FUNCTION, never invokes it
// — so `async () => {…}` silently returns undefined (the worst failure mode). Detect a function literal
// (arrow or `function`) and auto-invoke it as `(<expr>)()`. A plain value/expression is left untouched.
const FN_LITERAL_RE = /^\s*(?:async\s+)?(?:function\b|(?:async\s*)?\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/u;
function wrapEvalExpr(expr: string): string {
  return FN_LITERAL_RE.test(expr) ? `(${expr})()` : expr;
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
      const msg = errorMessage(e);
      text = isContextChurn(msg) ? `EVAL ERROR: ${msg}\n${CHURN_LINE}` : `EVAL ERROR: ${msg}`;
    }
    results.push({ expr, text });
  }
  return results;
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

function buildMapScript(selector: string): string {
  return `(() => {
    var root = document.querySelector(${JSON.stringify(selector)});
    if (!root) return null;
    var INTERACTIVE_SELECTOR = ${JSON.stringify(MAP_INTERACTIVE_SELECTOR)};
    var IMPLICIT_ROLE = { a: "link", button: "button", select: "combobox", textarea: "textbox" };
    var INPUT_ROLES = { checkbox: "checkbox", radio: "radio", button: "button", submit: "button", range: "slider", search: "searchbox" };

    function isVisible(el) {
      var style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
      var rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      var cur = el;
      while (cur && cur !== document.body) {
        if (cur.getAttribute("aria-hidden") === "true") return false;
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
      if (text2) return text2.length > 60 ? text2.slice(0, 60) + "…" : text2;
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
    // Fallback #4: a short ancestor-chain path (capped) — not globally unique CSS, but enough
    // to point a human/agent at the right neighborhood when no testid/label/role+name exists.
    function fallbackPath(node) {
      var parts = [];
      var cur = node;
      var depth = 0;
      while (cur && cur !== root && cur !== document.body && depth < 4) {
        parts.unshift(nthOfType(cur));
        cur = cur.parentElement;
        depth += 1;
      }
      return parts.join(" > ");
    }
    // Priority: 1) own data-testid  2) nearest ancestor testid that UNIQUELY wraps this element
    // (its only interactive/labeled descendant)  3) own aria-label  4) role=X[name="Y"]
    // (Playwright locator syntax)  5) fallback ancestor-chain path.
    function bestSelector(el, role, name) {
      var testid = el.getAttribute("data-testid");
      if (testid) return "[data-testid=\\"" + testid + "\\"]";
      var anc = el.parentElement;
      var hops = 0;
      while (anc && hops < 3) {
        var atid = anc.getAttribute("data-testid");
        if (atid) {
          if (anc.querySelectorAll(INTERACTIVE_SELECTOR).length === 1) {
            return "[data-testid=\\"" + atid + "\\"] " + el.tagName.toLowerCase();
          }
          break;
        }
        anc = anc.parentElement;
        hops += 1;
      }
      var ownLabel = el.getAttribute("aria-label");
      if (ownLabel && ownLabel.trim()) return "[aria-label=\\"" + ownLabel.trim() + "\\"]";
      if (role && name) return "role=" + role + "[name=\\"" + name + "\\"]";
      return fallbackPath(el);
    }

    var out = [];
    var els = root.querySelectorAll(INTERACTIVE_SELECTOR);
    for (var i = 0; i < els.length; i += 1) {
      var el = els[i];
      if (!isVisible(el)) continue;
      var role = resolveRole(el);
      var name = accessibleName(el);
      if (!role && !name) continue;
      out.push({ role: role || "(none)", name: name, selector: bestSelector(el, role, name) });
    }
    return out;
  })()`;
}

type MapEntry = { role: string; name: string; selector: string };

async function captureMap(page: Page, selector: string): Promise<{ entries: MapEntry[] | null; error: string | null }> {
  try {
    const result = (await page.evaluate(buildMapScript(selector))) as MapEntry[] | null;
    if (result === null) {
      return { entries: null, error: `no element matches "${selector}"` };
    }
    return { entries: result, error: null };
  } catch (e) {
    return { entries: null, error: errorMessage(e) };
  }
}

async function capture(page: Page, opts: Args, plan: ShotPlan): Promise<CaptureOutcome> {
  const outcome: CaptureOutcome = {
    navError: null,
    stepFailures: 0,
    deadCss: [],
    emptyCss: [],
    ariaText: null,
    evalResults: [],
    contrastResults: [],
    mapResult: null,
    mapError: null,
  };
  // Volatile-region masks (pink overlay) shared by the main shot, --shot-of, and crop.
  const mask = opts.mask.map((s) => page.locator(s));
  try {
    outcome.navError = await navigate(page, opts, plan.url);
    outcome.stepFailures = await runSteps(page, opts.steps);
    await settlePage(page, opts);
    if (opts.deadCss) {
      const scan = await scanDeadCss(page);
      outcome.deadCss = scan.dead;
      outcome.emptyCss = scan.empty;
    }
    if (opts.aria) {
      outcome.ariaText = await captureAria(page, opts);
    }
    if (opts.eval.length > 0) {
      outcome.evalResults = await captureEvals(page, opts.eval);
    }
    if (opts.contrast.length > 0) {
      outcome.contrastResults = await captureContrasts(page, opts.contrast, opts.contrastPixel, opts.viewport);
    }
    if (opts.map) {
      const mapped = await captureMap(page, opts.mapSelector);
      outcome.mapResult = mapped.entries;
      outcome.mapError = mapped.error;
    }
    if (plan.produceShot) {
      await captureShot(page, opts, plan.out, mask);
    }
  } catch (e) {
    outcome.navError = `nav/wait threw: ${errorMessage(e)}`;
    // Try to screenshot whatever we got anyway.
    if (plan.produceShot) {
      try {
        await captureShot(page, opts, plan.out, mask);
      } catch {
        /* best effort — the report + RESULT line still land */
      }
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
async function scanDeadCss(page: Page): Promise<{ dead: Array<{ token: string; count: number }>; empty: string[] }> {
  // NOTE: the body ships as a STRING — tsx (esbuild keepNames) decorates
  // function expressions with a __name helper that doesn't exist inside the
  // browser context; a serialized IIFE evaluates untransformed. (Also the root
  // tsconfig that checks scripts/ is DOM-less — a function body wouldn't compile.)
  return (await page.evaluate(`(() => {
    const used = new Map();
    for (const el of document.querySelectorAll("*")) {
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
      t.startsWith("lucide") || t.startsWith("TanStack") || t.startsWith("tsqd-");
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

type ReportCtx = ShotPlan & { failed: CapturedRequest[] };

function printSummary(session: ProbeSession, outcome: CaptureOutcome, opts: Args, ctx: ReportCtx): void {
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
  print(`console      ${session.consoleLines.length} message(s)`);
  print(`page errors  ${session.pageErrors.length}`);
}

function printAriaBlock(opts: Args, ariaText: string | null): void {
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
  if (!opts.map) {
    return;
  }
  if (error !== null) {
    print(`\n--- MAP (${opts.mapSelector}) ---`);
    print(`  MAP capture failed: ${error}`);
    return;
  }
  const list = entries ?? [];
  print(`\n--- MAP (${list.length} element(s)) ---`);
  for (const e of list.slice(0, ARIA_MAX_LINES)) {
    print(`  ${e.role}  "${e.name}"  →  ${e.selector}`);
  }
  if (list.length > ARIA_MAX_LINES) {
    print(`  … +${list.length - ARIA_MAX_LINES} more — scope with --map <selector>`);
  }
  // Two recurring foot-guns worth reprinting where the selectors are chosen: engine-mixing + virtual rows.
  print("  NOTE: one selector engine per target — never concatenate a CSS selector with a role= selector.");
  print("  NOTE: a virtualized/composite row often needs --jsclick (raw click); role= locators flake.");
}

function printCaptureLog(session: ProbeSession, failed: CapturedRequest[]): void {
  if (failed.length > 0) {
    print("\n--- failed requests ---");
    for (const r of failed) {
      print(`  ${r.method.padEnd(METHOD_PAD)} ${r.type.padEnd(TYPE_PAD)} ${r.status ?? "—"} ${r.failed ?? ""} ${r.url}`);
    }
  }
  if (session.consoleLines.length > 0) {
    print("\n--- console ---");
    for (const m of session.consoleLines) {
      print(`  ${m}`);
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
// skip ≠ fail: NO-BASELINE and SKIPPED-NO-FFMPEG report in the RESULT line but
// never redden the exit — only a real SSIM comparison below threshold does.

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
    return { diffPairs: [["diff", "SKIPPED-NO-FFMPEG"]], ssimFailed: false };
  }
  if (!existsSync(baselinePath)) {
    print(`DIFF         no baseline at ${baselinePath} — run with --baseline first`);
    return { diffPairs: [["diff", "NO-BASELINE"]], ssimFailed: false };
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

async function snap(opts: Args): Promise<number> {
  const url = buildUrl(opts.base, opts.route);
  const name = opts.out ?? routeSlug(opts.route);
  const out = join(await artifactDir("snaps"), `${name}.png`);
  // Whether we write a PNG. --no-shot/--text suppress it, but --baseline/--diff
  // need pixels to compare, and --shot-of is itself a shot — so those force it on.
  const produceShot = opts.shotOf !== null || opts.shot || opts.baseline || opts.diff;

  const session = await launchProbeSession({
    headless: !opts.vnc,
    viewport: opts.viewport,
    colorScheme: opts.colorScheme,
    reducedMotion: opts.reducedMotion || opts.probe,
    localStorage: buildSeeds(opts),
  });
  if (opts.probe) {
    await session.context.addInitScript({ content: PROBE_CSS_SCRIPT });
  }

  const plan: ShotPlan = { url, out, produceShot };
  const outcome = await capture(session.page, opts, plan);
  await session.browser.close();

  const failed = [...session.requests.values()].filter((r) => r.failed !== null || (r.status ?? 0) >= HTTP_ERROR_STATUS_MIN);
  const ctx: ReportCtx = { ...plan, failed };
  printSummary(session, outcome, opts, ctx);
  printAriaBlock(opts, outcome.ariaText);
  printEvalBlock(outcome.evalResults);
  printContrastBlock(outcome.contrastResults);
  printMapBlock(opts, outcome.mapResult, outcome.mapError);
  printCaptureLog(session, failed);
  printCssFindings(outcome);
  printCropNote(opts, ctx);
  const { diffPairs, ssimFailed } = await runBaselineOrDiff(opts, out, name);

  const contrastFails = outcome.contrastResults.filter((c) => c.failed).length;
  // Exit non-zero if anything observably went wrong, so `snap` is CI-usable.
  const red = outcome.navError !== null || session.pageErrors.length > 0 || failed.length > 0 || outcome.stepFailures > 0 || contrastFails > 0 || ssimFailed;
  printResult("snap", [
    ["out", produceShot ? out : "(none)"],
    ["aria", outcome.ariaText === null ? "no" : "yes"],
    ["map", opts.map ? String((outcome.mapResult ?? []).length) : "no"],
    ["evals", outcome.evalResults.length],
    ["contrast-fails", contrastFails],
    ["nav", outcome.navError === null ? "OK" : "ERROR"],
    ["steps-failed", outcome.stepFailures],
    ["page-errors", session.pageErrors.length],
    ["failed-req", failed.length],
    ["deadcss", outcome.deadCss.length],
    ["emptycss", outcome.emptyCss.length],
    ...diffPairs,
  ]);
  return red ? 1 : 0;
}

// Isolated-stage gate: --stage-down tears down and exits; --isolated boots-or-reuses the stage and repoints
// the base URL at it BEFORE the normal snap runs. Everything else (flags, capture, report) is unchanged.
async function main(opts: Args): Promise<number> {
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
  return await snap(opts);
}

const cliArgs = parseArgs(process.argv.slice(2));
void main(cliArgs).then((code) => process.exit(code));
