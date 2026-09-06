// snap's typed surface — the queue/args/outcome shapes every op speaks (docs/architecture/core/Core-Tooling-Law.md §2.5).
import type { AppearancePatch } from "../../_shared/appearance.ts";
import type { Viewport } from "../../_shared/argv.ts";
import type { BrowserAccelerationEvidence } from "../../_shared/browser-acceleration.ts";
import type { CapturedConsole, CapturedRequest } from "../../_shared/browser-capture.ts";
import type { BrowserEvidenceChannels, BrowserPageError, LocalStorageSeed } from "../../_shared/browser-contract.ts";
import type { BrowserDiagnostic, OrbConsoleCompleteness } from "../../_shared/browser-diagnostics.ts";
import type { EvidenceGap } from "../../_shared/evidence.ts";
import type { ThemeRequest } from "../../_shared/theme.ts";
import type { FileActionReceipt } from "../../_shared/upload.ts";
import type { DesignAuditSeverity } from "../../ui-audit/index.ts";
import type { Assertion, DriveFailure, PagedExpr, SnapAction } from "./actions.ts";
import type { CssCascadeQuery, CssEvidenceReceipt } from "./cascade.ts";
// ONE DIRECTION, `types.ts → contrast.ts`: the printed line (`ContrastOutcome`) and the structured reading
// (`ContrastEvidence`) both live in ./contrast.ts, and the capture sheet below holds them side by side.
import type { ContrastEvidence, ContrastOutcome } from "./contrast.ts";
import type { DeadCssEvidence } from "./dead-css.ts";
import type { DiagnosticQuery } from "./diagnostics.ts";
import type { HeapCaptureRequest, HeapComparisonRequest, HeapPageEvidence, HeapRetainerRequest } from "./heap.ts";
import type { LighthouseDevice, LighthouseMode } from "./lighthouse.ts";
import type { NetworkProfileName } from "./load-emulation.ts";
import type { MapAtlasEvidence, MapEntry, MapShellEvidence } from "./map.ts";

export type { Assertion, DriveFailure, NavAction, PagedExpr, SnapAction, Step } from "./actions.ts";

/** `--scale`'s resolved shape. `mode` is what Playwright's `screenshot({ scale })` receives — it accepts
 *  ONLY "css" | "device", so a numeric ask reaches the pixels through `deviceScaleFactor`, which raises
 *  the browser CONTEXT's DPR (null = leave the context's own, which a device descriptor supplies). The
 *  parse/budget/dimension logic is ../lib/shot-scale.ts. */
export interface ShotScale {
  readonly mode: "css" | "device";
  readonly deviceScaleFactor: number | null;
}

// A per-page contrast keeps its argv-order selector plus the target page.
interface PagedSelector {
  selector: string;
  page: number;
}
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
  /** Optional terminal query over the always-captured lossless diagnostics ring. */
  diagnostics: DiagnosticQuery | null;
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
  /** THE pre-capture drive queue: interaction steps (--click/--fill/--hover/--force-click/--dom-click/--key/
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
  /** --watch tick interval (ms). 0 = the argv stated none; every reader resolves that through
   *  `ops/flags-support.ts`'s `watchIntervalMs` (default 1000). The sentinel is load-bearing: session
   *  inheritance must be able to tell "no --every" from "--every 1000". */
  watchEveryMs: number;
  /** Output basename override (reports/snaps/<out>.png), or — when path-shaped (absolute / `./` / `../`) —
   *  the exact file to write. Defaults to the route slug. Resolution lives in _shared/artifacts.ts. */
  out: string | null;
  viewport: Viewport;
  /** Did the CALLER spell `--viewport`? A size override is not a device change (#1668): under `--mobile`
   *  the descriptor's touch/DPR/UA survive it, and the context is built at this size. `--wide`/`--desktop`
   *  are device PRESETS and clear it. */
  viewportExplicit: boolean;
  /** localStorage seeds applied BEFORE navigation (`--local-storage key=value`, repeatable). */
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
  /** Selectors whose BORDER is measured per side against the surface outside it (WCAG 1.4.11, 3:1) — the
   *  boundary question neither the ink nor the fill arm can answer (#1346). `@<idx>` targets a --pages tab. */
  contrastEdge: PagedSelector[];
  /** First-class post-settle assertions; selector assertions target visible/rendered matches by default. */
  assertions: Assertion[];
  /** `--design-audit`: the deterministic UI defect scan over the settled surface — the whole ui-audit
   *  walker + rule engine, entered through that tool's front door (ops/arms/design-audit.ts). Folded in
   *  at #1315; `pnpm design-audit` no longer exists. */
  designAudit: boolean;
  /** `--fail-on <P0..P3>`: the severity `--design-audit` exits 1 at (default P1). Only that arm reads it. */
  failOn: DesignAuditSeverity;
  /** Print the whole SPA destination atlas rather than its one-line summary (#1372). The atlas is a
   *  property of the APP, not of the surface under test: reprinting all ~27 targets on every `--map` call
   *  cost 2.1 KB a run to say what the previous call already said. */
  atlas: boolean;
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
  /** `--requests [url-substring]`: print + file the ORDERED checkpoint window from the session's bounded
   *  lifetime ring (method, url, status, type, sizes, timing). The optional value narrows what is PRINTED,
   *  never what is recorded; eviction is explicit in the receipt. */
  requests: boolean;
  requestsFilter: string | null;
  /** `--request-body <url-substring>`: read one retained application/json body (whole at at most 256 KiB inside
   *  the 32 MiB aggregate budget) or name why it was not retained. Implies --requests. */
  requestBody: string | null;
  /** Settled-page heap checkpoints and browser-free queries. Labels persist only in this BrowserContext. */
  heapCaptures: HeapCaptureRequest[];
  heapComparisons: HeapComparisonRequest[];
  heapRetainers: HeapRetainerRequest[];
  /** `--filmstrip`: bounded exact-page CDP screencast rendered as one labelled PNG contact sheet. */
  filmstrip: boolean;
  /** `--react-profile`: install the React development-renderer hook before the first mount and retain a
   *  read-only component/commit profile for every owned context and page in this browser lifetime. */
  reactProfile: boolean;
  /** Selective interaction analyzers over the one shared action tape. */
  motion: boolean;
  motionWindowMs: number;
  motionThrottle: boolean;
  interactionPerf: boolean;
  perfCycles: number;
  cpuProfile: boolean;
  bootTrace: boolean;
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
  /** `--stage-keeper <band>`: the band idle TIMER'S OWN entry (#1163 arm b) — spawned by `ensureStage`
   *  through ops/stage-keeper.ts, never typed by an operator. It polls that band's row and tears the stage
   *  down through the `--stage-down` path once nothing has used it for the TTL. null = not a keeper. */
  stageKeeper: number | null;
  /** Explicit checkout selector for stage teardown. Cross-checkout teardown is deliberate per band and
   *  therefore requires --force; a bare --force never broadens the default owned-row selection. */
  stageOwner: string | null;
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
  /** `--session-export <name>`: copy the session's console / page-error / request rings and retained trace/HAR into THIS run's
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
  /** The structured half of `stepFailures`/`navFailures` (#1344): one row per failed drive action, which
   *  becomes its own FINDING row instead of a single token on the RESULT line. */
  driveFailures: DriveFailure[];
  /** --goto/--open-chat/--context-tab actions that failed on this page (reddens exit). */
  navFailures: number;
  /** Successful browser file actions, including the exact feeder and complete selected identity/tree. */
  fileActions: FileActionReceipt[];
  /** Null unless the heap page arm was requested for this page/checkpoint. */
  heap: HeapPageEvidence | null;
  deadCss: Array<{ token: string; count: number }>;
  emptyCss: string[];
  deadCssEvidence: DeadCssEvidence | null;
  ariaText: string | null;
  ariaError: string | null;
  evalResults: EvalOutcome[];
  contrastResults: ContrastOutcome[];
  /** The STRUCTURED reading behind each printed CONTRAST line — ratio, threshold, the two colours, the
   *  sampling method, the refusal reason. Kept beside the lines because only this half is filable
   *  evidence (#1342): a reviewer taking a colour to the token vault needs the numbers, not the sentence. */
  contrastEvidence: ContrastEvidence[];
  mapResult: MapEntry[] | null;
  mapError: string | null;
  mapAtlas: MapAtlasEvidence | null;
  mapAtlasError: string | null;
  mapShell: MapShellEvidence | null;
  mapShellError: string | null;
  assertions: AssertionOutcome[];
  perf: PerfEvidence | null;
  /** Null when no --cascade query targeted this page. */
  cssEvidence: CssEvidenceReceipt | null;
  /** #1227: the `--theme` stamp this page was supposed to carry and did not. Non-null means the capture
   *  describes the DEFAULT palette while the run was labelled with a theme — an instrument error (exit 2),
   *  never a finding about the app (ops/theme-stamp.ts). */
  themeStampGap: EvidenceGap | null;
  /** Monotonic cursors into this capture's bounded evidence rings when --checkpoint owns the verdict. */
  evidenceRange: EvidenceRange | null;
}

export interface EvidenceRange {
  readonly consoleStart: number;
  readonly consoleEnd: number;
  readonly pageErrorStart: number;
  readonly pageErrorEnd: number;
  readonly diagnosticWindow: number;
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
  /** The requirement was never ASKED — its selector matched nothing rendered (#1343). Distinct from
   *  `failed` on purpose: a violated requirement is a verdict about the app (exit 1), an unasked one is an
   *  instrument refusal (exit 2), and printing both as FAIL is how "the composer does not overflow" was
   *  nearly published about a selector that matched no composer at all. */
  readonly refused: boolean;
}

// `--expect-no-overflow`'s shapes (OverflowSide/OverflowEscape/OverflowProbe) live in ./overflow.ts.
// The `--network`/`--cpu-throttle` vocabulary and the drive ceilings live in ./load-emulation.ts.

export interface PerfEvidence {
  /** The three members of the ONE rate vocabulary (`_shared/load-budget.ts` `MEASUREMENT_DISPOSITIONS`),
   *  spelled in this arm's own words: `measured` = `complete`. `load-suspect` carries a REAL number that
   *  nothing may promote (#1616); `withheld` carries none at all (an unproven browser). */
  readonly rate: { readonly status: "measured" | "load-suspect" | "withheld"; readonly reason: string };
  readonly acceleration: BrowserAccelerationEvidence;
  readonly navigation: { readonly domContentLoadedMs: number; readonly loadMs: number; readonly responseMs: number } | null;
  readonly orb: unknown;
}

// `ContrastOutcome` moved to ./contrast.ts with #1346: this file now holds the STRUCTURED reading on
// `CaptureOutcome`, and a shape cannot live here while its own contract imports back — one direction,
// `types.ts → contrast.ts` (dep-cruiser `no-circular` is the enforcer).

/** Which page this evidence pass belongs to, plus the evals the drive queue deliberately LEFT for it
 *  (the ones written after the last step/nav — they observe the settled surface). */
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
  readonly pageErrors: readonly BrowserPageError[];
  readonly diagnostics: readonly BrowserDiagnostic[];
  readonly diagnosticCompleteness: readonly OrbConsoleCompleteness[];
  readonly diagnosticWindow: { readonly value: number };
  readonly evidence?: BrowserEvidenceChannels;
}

// if --eval exprs were given, re-run them labeled with elapsed ms. Runs on PAGE 0's evals only (the
// series is a single-surface time-lapse). Returns the tick count + the artifact/eval lines to report.
export interface WatchTick {
  elapsedMs: number;
  shot: string | null;
  shotError: string | null;
  evals: EvalOutcome[];
}
