// snap's typed surface — the queue/args/outcome shapes every op speaks (docs/design/tooling-package.md §2.5).
import type { AppearancePatch } from "../../_shared/appearance.ts";
import type { Viewport } from "../../_shared/argv.ts";
import type { ResultPair } from "../../_shared/artifacts.ts";
import type { CapturedConsole, CapturedRequest, LocalStorageSeed } from "../../_shared/browser.ts";
import type { NavMethod } from "../../_shared/nav.ts";
import type { ThemeRequest } from "../../_shared/theme.ts";

// `page` = the target page index for --pages multi-tab mode (0 when unprefixed / single-page). Every
// step/capture carries it so one flat argv-ordered list can drive N tabs in one shared context.
type StepAction =
  | { kind: "click"; selector: string }
  | { kind: "jsclick"; selector: string }
  | { kind: "press"; selector: string }
  | { kind: "hover"; selector: string }
  | { kind: "fill"; selector: string; value: string }
  | { kind: "key"; selector: string; key: string }
  // A BARE key (`--key Tab`) — dispatched to the page keyboard with NO focus change, which is what
  // makes a Tab WALK possible. The `selector=Key` arm above re-FOCUSES its selector before every press,
  // so N of them land N times on the same neighbour instead of walking (2026-08-16: the settings
  // dialog's tab order was unmeasurable, and the audit concluded "Tab never advances focus").
  | { kind: "keyboard"; key: string }
  | { kind: "waitfor"; selector: string };
export type Step = StepAction & { page: number };

// --goto / --open-chat / --open-character / --context-tab: SPA navigation via the app's dev nav bridge
// (window.__orb.nav). `target` is the raw flag value; the kind picks the __orb.nav method. These are
// INTERLEAVED with the interaction steps in one argv-ordered queue (see SnapAction) — a nav in the middle
// of a chain runs where it was written, not before the chain.
// The kind axis IS `_kit/nav.ts`'s NavMethod — one importable union for every probe, so a new nav verb
// lands in one place and every probe's dispatch fails to compile until it is handled.
export interface NavAction {
  kind: NavMethod;
  target: string;
  page: number;
}

/** ONE argv-ordered queue of everything that DRIVES the page before capture: bridge navigations,
 *  interaction steps, and `--eval` expressions, tagged by which they are. A flat command reads as
 *  ordered, so it must BE ordered — the old shape kept two arrays and ran every nav before every step as
 *  a CLASS, which silently reordered `--goto modal:newChat --click <create> --context-tab rpg.game` into
 *  a context-tab against the landing page (2026-08-15, one live chain lost to it), and `--eval` stayed
 *  out of the queue entirely until 2026-08-16, so `--eval A --click X` reported A's POST-click state.
 *  Every member carries `.action.page`, so per-page filtering for `--pages @<idx>` reads the same on all.
 *  Only the three ACTION-BEARING flag families live here; the pure captures (--map/--aria/--contrast/
 *  --expect-*) observe the settled surface once, after the queue drains. */
export type SnapAction =
  | { readonly type: "nav"; readonly action: NavAction }
  | { readonly type: "step"; readonly action: Step }
  | { readonly type: "eval"; readonly action: PagedExpr };

// A per-page eval/contrast keeps its argv-order expr/selector plus the target page.
export interface PagedExpr {
  expr: string;
  page: number;
}
interface PagedSelector {
  selector: string;
  page: number;
}
export type Assertion =
  | { kind: "visible"; selector: string; page: number }
  | { kind: "text"; selector: string; expected: string; page: number }
  | { kind: "count"; selector: string; expected: number; page: number }
  | { kind: "url"; expected: string; page: number }
  | { kind: "overflow"; selector: string; page: number }
  | { kind: "focus"; selector: string; page: number };

export interface Args {
  /** Print the operator cookbook and exit without touching a browser or stage. */
  help: boolean;
  /** Parse/validation failures collected without side effects; any entry is CLI misuse. */
  errors: string[];
  /** Combinations that RUN but quietly do less than the argv asked for. Printed as `ARG WARNING` before
   *  the browser boots; never changes the exit code (an error is what refuses a run). */
  warnings: string[];
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
  /** THE pre-capture drive queue: interaction steps (--click/--fill/--hover/--press/--jsclick/--key/
   *  --wait-for), dev-bridge navigations (--goto/--open-chat/--open-character/--context-tab) AND --eval
   *  expressions in ONE list, executed in TRUE argv order — anything written mid-chain runs mid-chain.
   *  Each step waits for its selector (5s) then acts (the bare-key arm presses straight at the page
   *  keyboard); each nav waits for app-readiness + the bridge then calls `__orb.nav`.
   *  Failures are REPORTED (and redden the exit code) but don't abort — you still get a PNG of wherever
   *  the page ended up. A `@<idx>` flag suffix targets a --pages tab (`--click@1 …`); unprefixed = page 0. */
  actions: SnapAction[];
  /** How many pages (tabs) to open in ONE shared browser context (shared auth/localStorage).
   *  Default 1 (byte-identical single-page path). Steps/captures target a tab via `@<idx>`. */
  pages: number;
  /** `--contexts N` (2..4): N ISOLATED browser contexts, each authenticated as a DIFFERENT dev user
   *  against the multi-user FIXTURE stack (`pnpm fixture up`) — own cookies/localStorage,
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
  /** Output basename override (reports/snaps/<out>.png), or — when path-shaped (absolute / `./` / `../`) —
   *  the exact file to write. Defaults to the route slug. Resolution lives in _shared/artifacts.ts. */
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
  /** emulateMedia reducedMotion:"reduce" (also implied by --probe). THE OS MEDIA QUERY — a DIFFERENT gate
   *  from `appearance` below (the app's own setting); they diverge and they compose. */
  reducedMotion: boolean;
  /** `--appearance '<json>'` / `--appearance-preset <name>` / `--full-motion`: the deep-merge patch shimmed
   *  over the REAL `settings.getUserSettings` response for this run (never written — _shared/appearance.ts).
   *  Accumulated in argv order, later keys winning. null = drive the account's real state (the default, and
   *  a valid arm — it is the owner's actual experience). */
  appearance: AppearancePatch | null;
  /** `--theme <name|id|none>`: the ACTIVE THEME this run pretends is selected, shimmed over the same
   *  `settings.getUserSettings` response (never written — _shared/theme.ts). Last spelling wins. null = the
   *  account's own theme. A carried-theme chat room overrides it on purpose (D44 §12). */
  theme: ThemeRequest | null;
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
   *  the live dev stack. Immune to the dev stack's HMR/crash-loops. See ../ops/stage.ts. */
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
  /** Reap a STRANDED stage (a stage-rooted band process nothing has used inside the idle TTL) and prune
   *  orphaned stage dirs, then exit — the safe reaper (#324). A live stage, ours or a sibling's, is left
   *  standing; use --stage-down to tear down one you know you are finished with. Ignores the route. */
  stageSweep: boolean;
  /** Consent for --stage-down to tear down a stage owned by ANOTHER checkout while its band is still
   *  bound (#447 follow-on) — the #108 cross-checkout teardown is unchanged, it just says so out loud
   *  now. No effect on your own stage, an idle one, or a dead one. */
  force: boolean;
}

export interface CaptureOutcome {
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
}

export interface EvidenceRange {
  readonly consoleStart: number;
  readonly consoleEnd: number;
  readonly pageErrorStart: number;
  readonly pageErrorEnd: number;
}

// ── --eval: arbitrary in-page JS ────────────────────────────────────────────

export interface EvalOutcome {
  expr: string;
  text: string;
  failed: boolean;
}

export interface AssertionOutcome {
  readonly line: string;
  readonly failed: boolean;
}

// ── --expect-no-overflow: the scroll-delta arm AND the child-rect sweep ──────
// `scrollWidth - clientWidth` is a POSITIVE-ONLY measure: content pushed off the LEFT or TOP edge of a
// clipping box does not grow the scroll box at all, so the delta reads 0 on a frame where a control is
// painted outside the container and cut (#439/#444 — measured, a `justify-end` nowrap footer put a
// button 35px left of a dialog while this assertion printed `overflow=0x0`). The predicate that decides
// what the rect sweep judges lives with the measurement, in ops/overflow.ts.

const OVERFLOW_SIDES = ["bottom", "left", "right", "top"] as const;
export type OverflowSide = (typeof OVERFLOW_SIDES)[number];

export interface OverflowEscape {
  /** A locatable path to the OUTERMOST escaping element, with its text as a recognition hint. */
  readonly selector: string;
  readonly side: OverflowSide;
  readonly px: number;
}

export interface OverflowProbe {
  /** `scrollWidth - clientWidth` / `scrollHeight - clientHeight` — the historical arm, unchanged. */
  readonly scrollX: number;
  readonly scrollY: number;
  /** Which SIDES the rect sweep judged, and therefore which it did not. Scrolling sanctions content
   *  past the RIGHT/BOTTOM edge — that content is reachable, and the scroll arm above measures it —
   *  but it sanctions nothing on the LEFT/TOP: there is no negative scroll offset, so content before
   *  the content origin is unreachable and cut whatever the overflow value says. (Measured on the live
   *  new-chat dialog, which is `overflow: auto` with a zero scroll delta — an axis-level decline would
   *  have left the instrument blind on the exact surface #439 was found on.) */
  readonly judged: readonly OverflowSide[];
  readonly escapes: readonly OverflowEscape[];
}

export interface PerfEvidence {
  readonly navigation: { readonly domContentLoadedMs: number; readonly loadMs: number; readonly responseMs: number } | null;
  readonly orb: unknown;
}

export interface ContrastOutcome {
  line: string;
  failed: boolean;
}

export interface MapEntry {
  role: string;
  name: string;
  selector: string;
  source: "semantic" | "dom";
}
export type RawMapEntry = Omit<MapEntry, "source"> & { fallback: string; semanticFallback: string };

/** Which page this evidence pass belongs to, plus the evals the drive queue deliberately LEFT for it
 *  (the ones written after the last step/nav — they observe the settled surface). */
export interface EvidencePass {
  readonly pageIndex: number;
  readonly trailingEvals: readonly string[];
}

export interface ShotPlan {
  url: string;
  out: string;
  produceShot: boolean;
}

// `label` is the multi-item banner word ("PAGE" for --pages, "CONTEXT" for --contexts) — printPageReport
// reads it so the two modes share one printer without a 5th positional param.
export type ReportCtx = ShotPlan & { failed: CapturedRequest[]; totalPages: number; label?: string };

// Structural subset printSummary needs — a ProbeSession OR a ProbeContext both satisfy it, so --contexts'
// per-context report can call the SAME function as the single-context/--pages path.
export interface SessionCounts {
  readonly requests: ReadonlyMap<string, CapturedRequest>;
  readonly consoleLines: readonly string[];
  readonly consoleMessages: readonly CapturedConsole[];
  readonly pageErrors: readonly string[];
}

export interface DiffOutcome {
  diffPairs: ResultPair[];
  ssimFailed: boolean;
}

// if --eval exprs were given, re-run them labeled with elapsed ms. Runs on PAGE 0's evals only (the
// series is a single-surface time-lapse). Returns the tick count + the artifact/eval lines to report.
export interface WatchTick {
  elapsedMs: number;
  shot: string | null;
  shotError: string | null;
  evals: EvalOutcome[];
}

export interface ScenarioCheckpoint {
  readonly name: string;
  readonly args: readonly string[];
}
export interface ScenarioSpec {
  readonly name: string;
  readonly defaults: readonly string[];
  readonly checkpoints: readonly ScenarioCheckpoint[];
}

export interface SnapFailureSummary {
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
}
