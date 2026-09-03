// Argv → Args: the side-effect-free scan (unknown flags, value/type validation, page-suffix rules),
// the parse loop over ops/flags-handlers.ts's table, mode cross-validation, and the ARG WARNING set.
import { splitPageSuffix } from "../../_shared/argv.ts";
import { DEFAULT_BASE, DEFAULT_DEBUG_TOKEN } from "../../_shared/browser.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { aliasRefusal } from "../../_shared/instrument-argv.ts";
import type { NonArmArgs } from "../contract/arms.ts";
import type { Args } from "../contract/types.ts";
import { validateFlagValue, validateSelectorFlagValue } from "../lib/flag-values.ts";
import { sessionModeValidationPairs, sessionNameErrors } from "../lib/session-plan.ts";
import { CSS_SHOT_SCALE, shotScaleBudgetRefusal } from "../lib/shot-scale.ts";
import { NO_CPU_THROTTLE } from "../lib/throttle.ts";
import { armArgDefaults } from "./arms/registry.ts";
import { OPTIONAL_NAME_FLAGS, OPTIONAL_SELECTOR_FLAGS, OPTIONAL_VALUE_FLAGS, PAGE_TARGET_FLAGS, REQUIRED_VALUE_FLAGS } from "./flags-classes.ts";
import { FLAG_HANDLERS } from "./flags-handlers.ts";
import { DEFAULT_VIEWPORT, MS_PER_SECOND } from "./flags-support.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

// ALIAS_REFUSALS (§4.3, _shared/instrument-argv.ts): snap owns the real targets (--full/--every/
// --shot-of/--out), so an asked-for --full-page/--watch-every/--screenshot/--name refuses BY NAME here.
const KNOWN_FLAGS = new Set(Object.keys(FLAG_HANDLERS));

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

/** The scanner's twin of ops/flags-session.ts `consumeOptionalName`: a name is any next token that is not
 *  a flag (a route-shaped `/x` after `--session-status` is a NAME the name rule then refuses, never a route). */
function consumesOptionalName(argv: readonly string[], index: number): boolean {
  const value = argv[index + 1];
  return value !== undefined && !value.startsWith("-");
}

/** The two OPTIONAL-inline-value classes and the predicate each consumes by. Separate classes because the
 *  RULES differ on a `/`-leading token — a VALUE leaves it alone (`--requests /route` keeps its route), a
 *  NAME swallows it (`--session-status /x` is refused as a bad name rather than read as a route) — but ONE
 *  lookup, so the scanner asks the question once instead of growing a branch per class. */
const OPTIONAL_INLINE_CONSUMERS: readonly (readonly [ReadonlySet<string>, (argv: readonly string[], index: number) => boolean])[] = [
  [OPTIONAL_VALUE_FLAGS, consumesOptionalSelector],
  [OPTIONAL_NAME_FLAGS, consumesOptionalName],
];

function optionalInlineConsumer(flag: string): ((argv: readonly string[], index: number) => boolean) | null {
  return OPTIONAL_INLINE_CONSUMERS.find(([flags]) => flags.has(flag))?.[1] ?? null;
}

interface ArgvScan {
  readonly errors: string[];
  routeCount: number;
  fileMode: boolean;
}

function scanArgvToken(argv: readonly string[], index: number, scan: ArgvScan): number {
  const token = argv[index] as string;
  const { flag } = splitPageSuffix(token);
  if (FLAG_HANDLERS[flag] === undefined) {
    scan.routeCount += token.startsWith("-") ? 0 : 1;
    if (token.startsWith("-")) {
      scan.errors.push(aliasRefusal(flag, KNOWN_FLAGS) ?? `unknown flag ${token}`);
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
  // An optional inline value (`--requests trpc`, `--session-status p-x`): consumed so it is never counted
  // as the route, and deliberately NOT passed to the selector refusal — see OPTIONAL_INLINE_CONSUMERS.
  const consumesInline = optionalInlineConsumer(flag);
  if (consumesInline !== null) {
    return consumesInline(argv, index) ? 1 : 0;
  }
  if (!(OPTIONAL_SELECTOR_FLAGS.has(flag) && consumesOptionalSelector(argv, index))) {
    return 0;
  }
  // The optional inline selector never reaches validateFlagValue (it has no REQUIRED_VALUE_FLAGS row),
  // so its unmatchable-shape refusal is applied here — `--map choose who speaks next` lied the same way.
  validateSelectorFlagValue(flag, argv[index + 1] as string, scan.errors);
  return 1;
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
    ...args.actions.map((entry) => entry.action.page),
    ...args.eval.map((entry) => entry.page),
    ...args.contrast.map((entry) => entry.page),
    ...args.cascade.map((entry) => entry.page),
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
    [contextsMode && args.cascade.length > 0, "--cascade does not combine with --contexts/--as (one ephemeral debugging profile owns one context)"],
    // The three stage-admin modes each print and exit; two of them in one argv is an ambiguous ask, not a
    // sequence, and silently honouring the first would hide the half the caller also meant.
    [[args.stageDown, args.stageStatus, args.stageSweep].filter(Boolean).length > 1, "--stage-down, --stage-status and --stage-sweep are mutually exclusive"],
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
      args.matrix && !args.isolated,
      "--matrix requires --isolated/--dirty/--ref: EVERY cell is stage-scoped, not just some. The plan's required rows pin the rated custom-light/custom-dark themes (which only exist in a stage db) and its required twins pin the density-preview pair, so there is no live-stack subset to fall back to. If the single stage band is held by a sibling, `pnpm snap --stage-status` names the owner (checkout · pid · age) — wait for it or ask the orchestrator; never tear a sibling's stage down",
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
function armValidationPairs(args: Args): ValidationPair[] {
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
  ];
}

function validateParsedArgs(args: Args): string[] {
  const contextsMode = args.contexts > 1 || args.as !== null;
  const producesShot = args.shotOf !== null || args.shot || args.baseline || args.diff;
  const invalidModes = [
    ...sessionValidationPairs(args, contextsMode),
    ...sessionModeValidationPairs(args, contextsMode),
    ...evidenceValidationPairs(args, producesShot),
    ...armValidationPairs(args),
  ];
  // The image budget is checked against the RAW viewport, which is the one a numeric --scale can reach
  // (the device arm is refused above, so a descriptor's own viewport is never the multiplicand here).
  const budget = args.device === null ? shotScaleBudgetRefusal(args.scale, args.viewport) : null;
  return [
    ...validatePageTargets(args, contextsMode),
    ...invalidModes.filter(([invalid]) => invalid).map(([, message]) => message),
    ...sessionNameErrors(args),
    ...(budget === null ? [] : [budget]),
  ];
}

/** Combinations that are LEGAL but do less than the argv asked for. A parse error refuses the run; a
 *  warning runs it and says what it dropped. The one live case: `--out` names the artifact BASE (the
 *  PNG, the trace/har, the --json manifest), so `--text`/`--no-shot` silently leave nothing named by it
 *  unless one of those other artifacts was also requested. Measured cost of the silence: a
 *  `--goto corpus --out corpus-cartographer-merged --text` run reported `out=(none)`, wrote no image and
 *  exited 0, and the caller lost the capture. It is NOT an error — naming the manifest of a text-only
 *  run is a real use — so it warns. */
function parsedArgWarnings(args: Args): string[] {
  const producesShot = args.shotOf !== null || args.shot || args.baseline || args.diff;
  if (args.out === null || producesShot) {
    return [];
  }
  const stillNamed = args.json ? " (it still names the --json manifest and any trace/har)" : "";
  return [
    `--out "${args.out}" names an artifact base, but --text/--no-shot suppresses the PNG — NO IMAGE WILL BE WRITTEN${stillNamed}. ` +
      "Drop --text/--no-shot, or add --shot-of <selector>, to capture one.",
  ];
}

export function parseSnapArgs(argv: string[]): Args {
  const errors = scanArgv(argv);
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
    watchEveryMs: MS_PER_SECOND,
    out: null,
    viewport: DEFAULT_VIEWPORT,
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
      args.routeGiven = true;
    }
  }
  args.errors.push(...validateParsedArgs(args));
  args.warnings.push(...parsedArgWarnings(args));
  return args;
}
