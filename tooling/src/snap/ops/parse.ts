// Argv → Args: the side-effect-free scan (unknown flags, value/type validation, page-suffix rules),
// the parse loop over ops/flags-handlers.ts's table, mode cross-validation, and the ARG WARNING set.
import { splitPageSuffix } from "../../_shared/argv.ts";
import { DEFAULT_BASE, DEFAULT_DEBUG_TOKEN } from "../../_shared/browser.ts";
import { DEFAULT_VIEWPORT } from "../../_shared/browser-environment.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { STAGE_BAND_COUNT } from "../../_shared/ports.ts";
import type { NonArmArgs } from "../contract/arms.ts";
import type { Args } from "../contract/types.ts";
import { parsedArgWarnings } from "../lib/parse-warnings.ts";
import { sessionModeValidationPairs, sessionNameErrors } from "../lib/session-plan.ts";
import { CSS_SHOT_SCALE, shotScaleBudgetRefusal } from "../lib/shot-scale.ts";
import { NO_CPU_THROTTLE } from "../lib/throttle.ts";
import { armArgDefaults } from "./arms/registry.ts";
import { FLAG_HANDLERS } from "./flags-handlers.ts";
import { validatePageTargets } from "./parse-page-targets.ts";
import { validateParsedRouteSection } from "./parse-route.ts";
import { scanArgv } from "./parse-scan.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

// ALIAS_REFUSALS (§4.3, _shared/instrument-argv.ts): snap owns the real targets (--full/--every/
// --shot-of/--out), so an asked-for --full-page/--watch-every/--screenshot/--name refuses BY NAME here.
type ValidationPair = readonly [boolean, string];

function sessionValidationPairs(args: Args, contextsMode: boolean, inheritedSessionBinding: boolean): ValidationPair[] {
  return [
    [args.baseline && args.diff, "--baseline and --diff are mutually exclusive"],
    [args.contexts > 1 && args.pages > 1, "--contexts and --pages cannot both be greater than 1"],
    [args.contexts > 1 && args.as !== null, "--as cannot be combined with --contexts greater than 1"],
    [contextsMode && args.isolated, "--contexts/--as use the fixture stack and cannot be combined with --isolated/--dirty/--ref"],
    [contextsMode && (args.watchMs > 0 || args.baseline || args.diff), "--contexts/--as do not support --watch, --baseline, or --diff"],
    [contextsMode && args.cascade.length > 0, "--cascade does not combine with --contexts/--as (one ephemeral debugging profile owns one context)"],
    // The three stage-admin modes each print and exit; two of them in one argv is an ambiguous ask, not a
    // sequence, and silently honouring the first would hide the half the caller also meant.
    [[args.stageDown, args.stageStatus, args.stageSweep].filter(Boolean).length > 1, "--stage-down, --stage-status and --stage-sweep are mutually exclusive"],
    [args.stageOwner !== null && !args.stageDown, "--stage-owner <checkout> only selects rows for --stage-down"],
    [
      args.stageOwner !== null && args.stageDown && !args.force,
      "--stage-down --stage-owner <checkout> requires --force: cross-checkout teardown is deliberate per band",
    ],
    [
      args.matrix && (args.pages > 1 || contextsMode || args.watchMs > 0 || args.baseline || args.diff),
      "--matrix does not combine with --pages/--contexts/--as/--watch/--baseline/--diff",
    ],
    // #1127 I4: NAME WHAT IS STAGE-SCOPED AND WHY NO SUBSET ESCAPES IT. A lane whose sibling holds the
    // single band read the old one-liner as "pick the cells that don't need the stage" and had no way to
    // learn there are none: `ops/matrix-contract.ts` pins `custom-light`/`custom-dark` as REQUIRED theme
    // axis values (`representativeMatrixThemes` refuses outright unless a rated custom theme with custom
    // CSS exists) and `riskTwins` requires the `density-preview` pair — so EVERY planned cell carries a
    // stage-scoped assignment and a live-`:5173` arm would be a different matrix, not a subset of this one.
    // The remedy is the band, so the refusal names the command that says who holds it.
    [
      args.matrix && !args.isolated && args.session === null && !inheritedSessionBinding,
      "--matrix requires --isolated/--dirty/--ref: EVERY cell is stage-scoped, not just some. The plan's required rows pin the rated custom-light/custom-dark themes (which only exist in a stage db) and its required twins pin the density-preview pair, so there is no live-stack subset to fall back to. If the single stage band is held by a sibling, `pnpm snap --stage-status` names the owner (checkout · pid · age) — wait for it or ask the orchestrator; never tear a sibling's stage down",
    ],
  ];
}

/** The band idle timer's own entry (#1163 arm b). It is a whole PROCESS MODE, like `--session-daemon`: it
 *  polls one band until it reaps or releases and never navigates anything, so an argv that also asks for a
 *  mode is an ambiguous ask. A band outside the registry is refused before a timer exists for a pair
 *  nobody reserved — `stageBandPorts` would throw, and a thrown RangeError is not an operator message. */
function stageKeeperValidationPairs(args: Args): ValidationPair[] {
  const band = args.stageKeeper;
  return [
    [
      band !== null && (band < 0 || band >= STAGE_BAND_COUNT),
      `--stage-keeper <band> takes a band in 0..${STAGE_BAND_COUNT - 1} (tooling/src/_shared/ports.ts STAGE_BANDS)`,
    ],
    [
      band !== null && (args.stageDown || args.stageStatus || args.stageSweep || args.session !== null || args.sessionDaemon !== null),
      "--stage-keeper is the band idle timer's own entry and does not combine with another mode",
    ],
  ];
}

function evidenceValidationPairs(args: Args, producesShot: boolean): ValidationPair[] {
  return [
    [args.crop !== null && !producesShot, "--crop requires a screenshot; drop --no-shot/--text or request --shot-of/baseline/diff"],
    // A numeric --scale overrides the CONTEXT's DPR; a device descriptor CARRIES one (--mobile = DPR3).
    // Honouring both would silently pick a winner, so the ask is refused and the composing spelling named.
    [
      args.scale.deviceScaleFactor !== null && args.device !== null,
      "--scale <n> and --mobile are mutually exclusive (the device descriptor carries its own DPR) — use --scale device",
    ],
    [args.crop !== null && args.shotOf !== null, "--crop and --shot-of are mutually exclusive"],
    [args.mask.length > 0 && !producesShot, "--mask requires a screenshot; drop --no-shot/--text"],
    [args.fullPage && !producesShot, "--full requires a screenshot; drop --no-shot/--text"],
    [args.fullPage && args.shotOf !== null, "--full and --shot-of are mutually exclusive"],
    [(args.ariaDepth !== null || args.ariaBoxes) && !args.aria, "--aria-depth/--aria-boxes require --aria or --text"],
    [args.contrastPixel && args.contrast.length === 0, "--contrast-pixel requires at least one --contrast selector"],
  ];
}

/** The `--lighthouse`/`--requests` arms' cross-flag rules. Every one refuses a run that would produce a
 *  receipt whose LABEL and CONTENT disagree — the failure class ops/lighthouse.ts's header calls out. */
function lighthouseValidationPairs(args: Args, analyzerRequested: boolean): ValidationPair[] {
  return [
    [
      args.lighthouse === "mobile" && args.device === null,
      "--lighthouse mobile needs the mobile device descriptor, but a later --desktop/--viewport/--wide cleared it — the audit would be labelled mobile and taken on a desktop context (tooling/src/snap/ops/lighthouse.ts)",
    ],
    [
      args.lighthouse === "desktop" && args.device !== null,
      "--lighthouse desktop cannot run on the --mobile device descriptor — pass --lighthouse mobile, or drop --mobile",
    ],
    [
      args.lighthouse !== null && args.cascade.length > 0,
      "--lighthouse and --cascade are mutually exclusive: both need the browser's debugging endpoint, and --cascade owns it through a persistent profile (tooling/src/_shared/devtools-runtime.ts). Take the two receipts in two runs",
    ],
    [args.lighthouse === null && args.lighthouseMode !== "snapshot", "--lighthouse-mode requires --lighthouse <desktop|mobile>"],
    [
      (args.scenario !== null || args.matrix || args.contexts > 1 || args.as !== null) && (args.lighthouse !== null || args.requests),
      "--lighthouse/--requests run only on the ordinary single-run path: --scenario, --contexts/--as and --matrix drive their own sessions or their own device axis and would silently ignore the arm (tooling/src/snap/ops/run.ts)",
    ],
    [
      args.lighthouse !== null && analyzerRequested,
      "--lighthouse owns navigation and cannot combine with --motion/--perf/--cpu-profile/--boot-trace/--react-profile; take explicit separate passes",
    ],
  ];
}

function motionValidationPairs(args: Args, motionSelectors: readonly (string | null)[]): ValidationPair[] {
  return [
    [motionSelectors.length > 1, "--motion may appear once: one run has one explicitly tagged measured selector/window"],
    [
      args.matrix && args.motion && motionSelectors[0] === null,
      "--matrix --motion requires a measured selector so the derived plan can retain both entry and interaction controls",
    ],
    [
      args.matrix && args.motion && args.scenario !== null,
      "--matrix --motion and --matrix --scenario are distinct plans; choose the rated motion matrix or the appearance scenario matrix",
    ],
    [!Number.isFinite(args.motionWindowMs) || args.motionWindowMs <= 0, "--motion-window requires a positive finite duration in milliseconds"],
    [
      args.motion && (args.cpuProfile || args.reactProfile),
      "--motion cannot combine with --cpu-profile/--react-profile: profiler overhead contaminates frame and LoAF rates",
    ],
    [args.bootTrace && args.motion, "--boot-trace cannot combine with --motion: Chromium exposes one tracing session; take separate passes"],
  ];
}

function perfValidationPairs(args: Args): ValidationPair[] {
  return [
    [!Number.isInteger(args.perfCycles) || args.perfCycles < 1, "--perf-cycles requires a positive integer"],
    [args.perfCycles !== 1 && !args.interactionPerf, "--perf-cycles requires --perf"],
    [
      args.interactionPerf && args.cpuProfile,
      "--perf cannot combine with --cpu-profile: sampling profiler overhead contaminates interaction rates; take explicit separate passes",
    ],
    [args.interactionPerf && args.reactProfile, "--perf cannot combine with --react-profile: Fiber collection contaminates interaction rates"],
  ];
}

function analyzerValidationPairs(args: Args): ValidationPair[] {
  const analyzerRequested = args.motion || args.interactionPerf || args.cpuProfile || args.bootTrace || args.reactProfile;
  return [
    ...lighthouseValidationPairs(args, analyzerRequested),
    [args.bootTrace && args.reactProfile, "--boot-trace cannot combine with --react-profile: both own a Chromium tracing window"],
    [
      (args.scenario !== null || args.contexts > 1 || args.as !== null) && analyzerRequested,
      "--motion/--perf/--cpu-profile/--boot-trace/--react-profile currently require the ordinary or session run path; scenario/contexts would bypass the analyzer lifecycle",
    ],
  ];
}

function filmstripValidationPairs(args: Args): ValidationPair[] {
  const conflicts = [
    [args.motion, "--motion"],
    [args.interactionPerf, "--perf"],
    [args.cpuProfile, "--cpu-profile"],
    [args.heapCaptures.length > 0 || args.heapComparisons.length > 0 || args.heapRetainers.length > 0, "--heap/--heap-compare/--heap-retainers"],
    [args.bootTrace, "--boot-trace"],
    [args.reactProfile, "--react-profile"],
    [args.probe, "--probe"],
  ] as const;
  return conflicts.map(
    ([invalid, flag]): ValidationPair => [
      args.filmstrip && invalid,
      `--filmstrip cannot combine with ${flag}: screencast encoding contaminates that measurement window`,
    ],
  );
}

function armValidationPairs(args: Args): ValidationPair[] {
  const motionSelectors = args.actions.flatMap((entry) => (entry.type === "step" && entry.action.kind === "motion-click" ? [entry.action.selector] : []));
  return [
    ...motionValidationPairs(args, motionSelectors),
    ...perfValidationPairs(args),
    ...analyzerValidationPairs(args),
    [
      args.probe && (args.motion || args.interactionPerf),
      "--probe cannot combine with --motion/--perf: deterministic animation suppression contaminates motion and interaction rates",
    ],
    [
      args.motion && args.interactionPerf,
      "--motion and --perf require separate passes: the per-step observers and settle windows contaminate the rated motion window",
    ],
  ];
}

/** `--tap`'s own door (#2445). A touch tap on a context with no touch support is not a degraded tap — it
 *  is `locator.tap()` throwing "The page does not support tap" per step, i.e. a whole run of failed steps
 *  whose SHOTS still look like a drive that happened. The refusal names the device flag because the whole
 *  point of the verb is that `--click --mobile` is still a MOUSE: it fires pointerenter/mouseover and
 *  opens hover-only affordances (Base UI's tooltip trigger is `mouseOnly: true`) that a finger cannot. */
function tapValidationPairs(args: Args): ValidationPair[] {
  const taps = args.actions.filter((entry) => entry.type === "step" && entry.action.kind === "tap").length;
  return [
    [
      taps > 0 && args.device === null,
      "--tap needs a touch-capable context: pass --mobile (the iPhone 14 Pro Max descriptor carries hasTouch + pointer:coarse). A desktop context has no touchscreen, so every tap would throw. --click is NOT the fallback — it is a mouse dispatch even under --mobile, which is the difference this verb exists to measure",
    ],
  ];
}

function modifierValidationPairs(args: Args, seen: ReadonlySet<string>, scenarioCheckpoint: boolean): ValidationPair[] {
  return [
    [seen.has("--scenario-summary") && args.scenario === null && !scenarioCheckpoint, "--scenario-summary requires --scenario"],
    [seen.has("--every") && !seen.has("--watch"), "--every requires --watch"],
    [seen.has("--motion-window") && !args.motion, "--motion-window requires --motion"],
    [seen.has("--motion-no-throttle") && !args.motion, "--motion-no-throttle requires --motion"],
    [seen.has("--force") && !(args.stageDown || args.sessionClose !== null), "--force requires --stage-down or --session-close"],
    [
      (seen.has("--fixture-server") || seen.has("--fixture-base")) && !(args.contexts > 1 || args.as !== null),
      "--fixture-server/--fixture-base require --contexts <N> or --as <handle>",
    ],
  ];
}

function validateParsedArgs(args: Args, inheritedSessionBinding: boolean, seen: ReadonlySet<string>, scenarioCheckpoint: boolean): string[] {
  const contextsMode = args.contexts > 1 || args.as !== null;
  const producesShot = args.shotOf !== null || args.shot || args.baseline || args.diff;
  const invalidModes = [
    ...sessionValidationPairs(args, contextsMode, inheritedSessionBinding),
    ...stageKeeperValidationPairs(args),
    ...sessionModeValidationPairs(args, contextsMode),
    ...evidenceValidationPairs(args, producesShot),
    ...tapValidationPairs(args),
    ...armValidationPairs(args),
    ...filmstripValidationPairs(args),
    ...modifierValidationPairs(args, seen, scenarioCheckpoint),
  ];
  // The image budget is checked against the RAW viewport, which is the one a numeric --scale can reach
  // (the device arm is refused above, so a descriptor's own viewport is never the multiplicand here).
  const budget = args.device === null ? shotScaleBudgetRefusal(args.scale, args.viewport) : null;
  return [
    ...validatePageTargets(args, contextsMode),
    ...validateParsedRouteSection(args, inheritedSessionBinding || scenarioCheckpoint),
    ...invalidModes.filter(([invalid]) => invalid).map(([, message]) => message),
    ...sessionNameErrors(args),
    ...(budget === null ? [] : [budget]),
  ];
}

export function parseSnapArgs(argv: string[], options: { readonly inheritedSessionBinding?: boolean; readonly scenarioCheckpoint?: boolean } = {}): Args {
  const scan = scanArgv(argv);
  const errors = scan.errors;
  // The RUN's own defaults; every ARM-owned field comes from `armArgDefaults()` below, and tsc refuses
  // this assignment if the registry stops supplying one (contract/types.ts `ArmArgs`/`NonArmArgs`).
  const runDefaults: NonArmArgs = {
    help: false,
    materializeDevToolsAssets: false,
    errors,
    warnings: [],
    scenario: null,
    matrix: false,
    json: false,
    summary: false,
    failureEvidence: true,
    strictConsole: false,
    diagnostics: null,
    checkpoint: false,
    includeHidden: false,
    route: "/",
    vnc: false,
    waitSelector: null,
    sseSeconds: 0,
    base: DEFAULT_BASE,
    debugToken: DEFAULT_DEBUG_TOKEN,
    actions: [],
    pages: 1,
    contexts: 1,
    as: null,
    fixtureServer: null,
    fixtureBase: null,
    file: null,
    watchMs: 0,
    watchEveryMs: 0,
    out: null,
    viewport: DEFAULT_VIEWPORT,
    viewportExplicit: false,
    cpuThrottle: NO_CPU_THROTTLE,
    network: null,
    localStorage: [],
    probe: false,
    baseline: false,
    diff: false,
    scale: CSS_SHOT_SCALE,
    colorScheme: null,
    reducedMotion: false,
    appearance: null,
    theme: null,
    idle: false,
    device: null,
    isolated: false,
    ref: null,
    fresh: false,
    dirty: false,
    stageDown: false,
    stageStatus: false,
    stageSweep: false,
    stageOwner: null,
    stageKeeper: null,
    force: false,
    session: null,
    sessionDaemon: null,
    sessionStatus: false,
    sessionStatusName: null,
    sessionClose: null,
    sessionSweep: false,
    sessionExport: null,
    sessionTtlMin: null,
    routeGiven: false,
  };
  const args: Args = { ...runDefaults, ...armArgDefaults() };
  const rest = [...argv];
  while (rest.length > 0) {
    const tok = rest.shift();
    if (tok === undefined) {
      break;
    }
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
      args.routeGiven = true;
    }
  }
  args.errors.push(...validateParsedArgs(args, options.inheritedSessionBinding === true, scan.seen, options.scenarioCheckpoint === true));
  if (args.perfCycles > 1) {
    const once = [...args.actions];
    for (let cycle = 1; cycle < args.perfCycles; cycle += 1) {
      args.actions.push(...once);
    }
  }
  args.warnings.push(...parsedArgWarnings(args));
  return args;
}
