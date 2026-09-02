// snap's typed surface — the queue/args/outcome shapes every op speaks (docs/architecture/core/Core-Tooling-Law.md §2.5).
import type { AppearancePatch } from "../../_shared/appearance.ts";
import type { Viewport } from "../../_shared/argv.ts";
import type { CapturedConsole, CapturedRequest, LocalStorageSeed } from "../../_shared/browser.ts";
import type { EvidenceGap } from "../../_shared/evidence.ts";
import type { NavMethod } from "../../_shared/nav.ts";
import type { ThemeRequest } from "../../_shared/theme.ts";
import type { CssCascadeQuery, CssEvidenceReceipt } from "./cascade.ts";
import type { DeadCssEvidence } from "./dead-css.ts";
import type { LighthouseDevice, LighthouseMode } from "./lighthouse.ts";
import type { NetworkProfileName } from "./load-emulation.ts";

/** `--scale`'s resolved shape. `mode` is what Playwright's `screenshot({ scale })` receives — it accepts
 *  ONLY "css" | "device", so a numeric ask reaches the pixels through `deviceScaleFactor`, which raises
 *  the browser CONTEXT's DPR (null = leave the context's own, which a device descriptor supplies). The
 *  parse/budget/dimension logic is ../lib/shot-scale.ts. */
export interface ShotScale {
  readonly mode: "css" | "device";
  readonly deviceScaleFactor: number | null;
}

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
  | { kind: "waitfor"; selector: string }
  // --upload <selector>=<path[,path...]> (#651): attach local files to a file input. `selector` is
  // whatever the caller wrote (often the DECORATIVE dropzone wrapper, not the input itself) — ops/upload.ts
  // drills to the real `<input type="file">` at drive time. `paths` are boundary-checked (repo/scratchpad
  // only) and existence-checked there too, so a bad path is a LOUD step failure, never a silent no-op.
  | { kind: "upload"; selector: string; paths: readonly string[] };
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
  /** Maintainer-only exact-revision DevTools asset refresh; exits without driving a product surface. */
  materializeDevToolsAssets: boolean;
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
  /** `--scale <css|device|n>` — how many IMAGE pixels one CSS pixel becomes. Defaults to `css`, which is
   *  what every pre-#915 invocation produced; the WHY (image-token cost) lives in ../lib/shot-scale.ts. */
  scale: ShotScale;
  /** emulateMedia colorScheme — exercise the app's dark/light surfaces. */
  colorScheme: "light" | "dark" | null;
  /** emulateMedia reducedMotion:"reduce" (also implied by --probe). THE OS MEDIA QUERY — a DIFFERENT gate
   *  from `appearance` below (the app's own setting); they diverge and they compose. */
  reducedMotion: boolean;
  /** Matrix-owned browser media arm. The ordinary CLI leaves this absent; `--matrix` sets both
   *  polarities and the shared launcher proves the applied value against live matchMedia evidence. */
  browserContrast?: "more" | "no-preference";
  /** Matrix-owned Chromium `prefers-reduced-transparency` arm. Kept separate from Appearance because it
   *  is an OS/browser contract, applied through the shared CDP rail and read back from the page. */
  reducedTransparency?: boolean;
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
  /** Official Chromium/DevTools declaration-state queries (`--cascade selector=property`). The result
   * joins #949's unchanged merge receipt under one machine-readable `cssEvidence` manifest member. */
  cascade: CssCascadeQuery[];
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
  // ── THE TWO MCP-RETIRING ARMS (#1198/#1199 — docs/design/1195-devtools-mcp-retirement.md §2) ──
  /** `--lighthouse <desktop|mobile>`: audit the SETTLED page with the Lighthouse engine over this run's
   *  own browser (ops/lighthouse.ts). null = the arm is off, which is every ordinary run — the engine
   *  and its puppeteer attach are dynamically imported, so a run without this flag pays nothing.
   *  `--lighthouse mobile` also fills the DEVICE slot with `--mobile`'s descriptor, so one device story
   *  governs the pixels and the audit; a later --desktop/--viewport/--wide clears it and is REFUSED. */
  lighthouse: LighthouseDevice | null;
  /** `--lighthouse-mode <snapshot|navigation>`. snapshot (the default) audits the page as the drive queue
   *  left it; navigation RELOADS and therefore audits a different, freshly-booted page. */
  lighthouseMode: LighthouseMode;
  /** `--requests [url-substring]`: print + file the ORDERED log of every request this run's pages issued
   *  (method, url, status, type, size, timing). The optional value narrows what is PRINTED, never what is
   *  recorded — the artifact is always the complete log, and the block states both counts. */
  requests: boolean;
  requestsFilter: string | null;
  /** `--request-body <url-substring>`: capture ONE matching response body, capped and truncation-accounted
   *  (lib/request-log.ts). Implies --requests: a body with no log leaves the reader unable to see which
   *  request it came from, or that a second one matched. */
  requestBody: string | null;
  // ── LOAD EMULATION (CDP — the margin a rest-state measurement cannot see) ───
  /** `--cpu-throttle <n>`: CDP `Emulation.setCPUThrottlingRate`, applied to EVERY page before it
   *  navigates. 1 = no throttle (the default). The measurement it exists for: a settle that is free at
   *  rest (inside the browser's 500ms `hadRecentInput` window) becomes PAID under CPU load — 4× moved the
   *  "This chat" tab's last wave from +384ms to +795ms and cost a real 0.30837 CLS (#819/#826). */
  cpuThrottle: number;
  /** `--network <profile>`: CDP `Network.emulateNetworkConditions` with DevTools' own presets. null = the
   *  real link. NOTE (measured, #826): 4× CPU PLUS a 3G/4G profile never reaches `data-app-ready` on the
   *  DEV build (~250 unbundled ESM resources) — throttle CPU alone unless you are on a prod build. */
  network: NetworkProfileName | null;
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
   *  now. No effect on your own stage, an idle one, or a dead one. Also the consent `--session-close`
   *  needs for a foreign LIVE session. */
  force: boolean;
  // ── STATEFUL SESSIONS (one browser per lane, kept between calls — docs/design/1208-instrument-substrate.md) ──
  /** `--session <name>`: drive the named session's LIVE browser, booting its daemon on first use. Every
   *  later call forwards its argv to the daemon over the repo-keyed socket; a call carrying a browser-
   *  lifetime flag is refused (lib/session-plan.ts SESSION_ONLY_FLAGS). null = the one-shot path, untouched. */
  session: string | null;
  /** `--session-daemon <name>`: the DAEMON'S OWN entry — spawned by ops/session-client.ts through
   *  _shared/proc.ts, never typed by an operator. The rest of the argv is the session's BOOT argv. */
  sessionDaemon: string | null;
  /** `--session-status [<name>]`: every session of this repo — owner · pid · live/dead · idle · binding —
   *  then exit. Ignores the route. */
  sessionStatus: boolean;
  sessionStatusName: string | null;
  /** `--session-close <name>`: close a live session (a foreign LIVE one needs --force) or reap a dead one. */
  sessionClose: string | null;
  /** `--session-sweep`: reap dead and idle-past-TTL sessions plus orphan registry entries; live ones are
   *  reported and never touched. */
  sessionSweep: boolean;
  /** `--session-export <name>`: copy the session's console / page-error / request rings into THIS run's
   *  slot, published as reports/sessions/<name>/…. */
  sessionExport: string | null;
  /** `--session-ttl <min>`: the boot call's idle TTL (default 30 min; env ORB_SESSION_TTL_MIN). */
  sessionTtlMin: number | null;
  /** Did the argv carry a positional route? `route` keeps its "/" default for every reader; a session call
   *  with NO route and no --file drives the LIVE page instead of re-navigating (§3.3). */
  routeGiven: boolean;
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
  deadCssEvidence: DeadCssEvidence | null;
  ariaText: string | null;
  ariaError: string | null;
  evalResults: EvalOutcome[];
  contrastResults: ContrastOutcome[];
  mapResult: MapEntry[] | null;
  mapError: string | null;
  assertions: AssertionOutcome[];
  perf: PerfEvidence | null;
  /** Null when no --cascade query targeted this page. */
  cssEvidence: CssEvidenceReceipt | null;
  /** #1227: the `--theme` stamp this page was supposed to carry and did not. Non-null means the capture
   *  describes the DEFAULT palette while the run was labelled with a theme — an instrument error (exit 2),
   *  never a finding about the app (ops/theme-stamp.ts). */
  themeStampGap: EvidenceGap | null;
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

// `--expect-no-overflow`'s shapes (OverflowSide/OverflowEscape/OverflowProbe) live in ./overflow.ts.
// The `--network`/`--cpu-throttle` vocabulary and the drive ceilings live in ./load-emulation.ts.

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
