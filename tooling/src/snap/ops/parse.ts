// Argv → Args: the side-effect-free scan (unknown flags, value/type validation, page-suffix rules),
// the parse loop over ops/flags-handlers.ts's table, mode cross-validation, and the ARG WARNING set.
import { parseViewport, splitFirstEq, splitLastEq, splitPageSuffix, splitSelectorEq } from "../../_shared/argv.ts";
import { DEFAULT_BASE, DEFAULT_DEBUG_TOKEN } from "../../_shared/browser.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { Args } from "../contract/types.ts";
import { CROP_RE } from "../lib/out-names.ts";
import { selectorRefusalForFlag } from "../lib/selector-shape.ts";
import { sessionModeValidationPairs, sessionNameErrors } from "../lib/session-plan.ts";
import { CSS_SHOT_SCALE, parseShotScale, shotScaleBudgetRefusal } from "../lib/shot-scale.ts";
import { NETWORK_PROFILE_SPELLINGS, NO_CPU_THROTTLE, parseNetworkProfile } from "../lib/throttle.ts";
import { OPTIONAL_NAME_FLAGS, OPTIONAL_SELECTOR_FLAGS, PAGE_TARGET_FLAGS, REQUIRED_VALUE_FLAGS } from "./flags-classes.ts";
import { FLAG_HANDLERS } from "./flags-handlers.ts";
import { DEFAULT_VIEWPORT, MS_PER_SECOND } from "./flags-support.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

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
  // A fractional TTL is legal (a 0.05-minute calibration drive); zero or less is a session that never
  // idles out — the strand class the TTL exists to end — so it is refused, never defaulted.
  if (flag === "--session-ttl" && !(Number.isFinite(Number(raw)) && Number(raw) > 0)) {
    errors.push(`--session-ttl expects a positive number of minutes, got ${JSON.stringify(raw)}`);
  }
}

/** The load-emulation arms REFUSE on a bad value instead of falling back to "no throttle": a run whose
 *  argv asked for 4× CPU and silently measured at 1× is a false rest-state receipt (#826). */
function validateLoadFlagValue(flag: string, raw: string, errors: string[]): void {
  if (flag === "--cpu-throttle" && !(Number.isFinite(Number(raw)) && Number(raw) >= NO_CPU_THROTTLE)) {
    errors.push(`--cpu-throttle expects a rate >= ${NO_CPU_THROTTLE} (1 = off, 4 = the standard load arm), got ${JSON.stringify(raw)}`);
  }
  if (flag === "--network" && parseNetworkProfile(raw) === null) {
    errors.push(`--network expects one of ${NETWORK_PROFILE_SPELLINGS.join(" | ")}, got ${JSON.stringify(raw)}`);
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
  // A rejected --scale must REFUSE, never fall back to the css default: a run that asked for device
  // pixels and silently produced CSS pixels is the same false-receipt class as the load-arm flags above.
  if (flag === "--scale" && parseShotScale(raw) === null) {
    errors.push(`--scale expects css | device | a number >= 1, got ${JSON.stringify(raw)}`);
  }
}

function validatePairFlagValue(flag: string, raw: string, errors: string[]): void {
  const split = splitLastEq(raw);
  // --fill splits on the FIRST '=' — its value is a JS literal that often contains '=' itself
  // (`--fill 'input=const a = 1;'`); LAST-'=' would misparse the selector and refuse.
  if (flag === "--fill" && splitSelectorEq(raw) === null) {
    errors.push(`--fill expects sel=value with a non-empty selector, got ${JSON.stringify(raw)}`);
  }
  // `--key Tab` (no '=') is the BARE-KEY form — a key name, not a selector. Only the pair form owes a
  // non-empty selector.
  if (flag === "--key" && raw.includes("=") && split.head === "") {
    errors.push(`--key expects selector=Key with a non-empty selector (or a bare key name), got ${JSON.stringify(raw)}`);
  }
  if (flag === "--expect-text" && (!raw.includes("=") || split.head === "")) {
    errors.push(`--expect-text expects selector=text, got ${JSON.stringify(raw)}`);
  }
  if (flag === "--expect-count" && (!raw.includes("=") || split.head === "" || !Number.isInteger(Number(split.tail)) || Number(split.tail) < 0)) {
    errors.push(`--expect-count expects selector=nonNegativeInteger, got ${JSON.stringify(raw)}`);
  }
  if (flag === "--upload" && (!raw.includes("=") || split.head === "" || split.tail.trim() === "")) {
    errors.push(`--upload expects selector=path[,path...] with a non-empty selector and at least one path, got ${JSON.stringify(raw)}`);
  }
  validateCascadePair(flag, raw, split, errors);
}

/** `--panel <name>=<mode>` (the same `<a>=<b>` shape --fill/--key/--expect-text use — a panel NAME never
 *  carries `=`) and `--focus <on|off>`, the one nav verb whose value is a bare boolean rather than a
 *  selector/pair. Own function so validatePairFlagValue and validateFlagValue's dispatch both stay under
 *  the biome cognitive-complexity cap. */
function validateShellNavFlagValue(flag: string, raw: string, errors: string[]): void {
  if (flag === "--panel") {
    const { head, tail } = splitLastEq(raw);
    if (head === "" || tail === "") {
      errors.push(`--panel expects name=mode, got ${JSON.stringify(raw)}`);
    }
  }
  if (flag === "--focus" && raw !== "on" && raw !== "off") {
    errors.push(`--focus expects on|off, got ${JSON.stringify(raw)}`);
  }
}

function validateCascadePair(flag: string, raw: string, split: { readonly head: string; readonly tail: string }, errors: string[]): void {
  if (flag !== "--cascade") {
    return;
  }
  if (!raw.includes("=") || split.head === "" || !/^(?:--[A-Za-z0-9_-]+|-?[A-Za-z][A-Za-z0-9-]*)$/u.test(split.tail)) {
    errors.push(`--cascade expects selector=css-property, got ${JSON.stringify(raw)}`);
  }
}

/** REFUSE a selector that can never match rather than letting it time out as a false "not rendered"
 *  (#550 — the whole reason lib/selector-shape.ts exists). */
function validateSelectorFlagValue(flag: string, raw: string, errors: string[]): void {
  const refusal = selectorRefusalForFlag(flag, raw);
  if (refusal !== null) {
    errors.push(refusal);
  }
}

function validateFlagValue(flag: string, raw: string, errors: string[]): void {
  if (raw === "" && flag !== "--debug-token") {
    errors.push(`${flag} requires a non-empty value`);
    return;
  }
  validateNumericFlag(flag, raw, errors);
  validateLoadFlagValue(flag, raw, errors);
  validateEvidenceFlagValue(flag, raw, errors);
  validatePairFlagValue(flag, raw, errors);
  validateShellNavFlagValue(flag, raw, errors);
  validateSelectorFlagValue(flag, raw, errors);
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

/** The scanner's twin of ops/flags-session.ts `consumeOptionalName`: a name is any next token that is not
 *  a flag (a route-shaped `/x` after `--session-status` is a NAME the name rule then refuses, never a route). */
function consumesOptionalName(argv: readonly string[], index: number): boolean {
  const value = argv[index + 1];
  return value !== undefined && !value.startsWith("-");
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
  if (OPTIONAL_NAME_FLAGS.has(flag)) {
    return consumesOptionalName(argv, index) ? 1 : 0;
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

function validateParsedArgs(args: Args): string[] {
  const contextsMode = args.contexts > 1 || args.as !== null;
  const producesShot = args.shotOf !== null || args.shot || args.baseline || args.diff;
  const invalidModes = [
    ...sessionValidationPairs(args, contextsMode),
    ...sessionModeValidationPairs(args, contextsMode),
    ...evidenceValidationPairs(args, producesShot),
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
  const args: Args = {
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
    fullPage: false,
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
    scale: CSS_SHOT_SCALE,
    colorScheme: null,
    reducedMotion: false,
    appearance: null,
    theme: null,
    idle: false,
    eval: [],
    cascade: [],
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
