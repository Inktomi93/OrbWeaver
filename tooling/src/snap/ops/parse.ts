// Argv → Args: the side-effect-free scan (unknown flags, value/type validation, page-suffix rules),
// the parse loop over ops/flags-handlers.ts's table, mode cross-validation, and the ARG WARNING set.
import { appearanceHelpBlock } from "../../_shared/appearance.ts";
import { parseViewport, splitFirstEq, splitLastEq, splitPageSuffix } from "../../_shared/argv.ts";
import { DEFAULT_BASE, DEFAULT_DEBUG_TOKEN } from "../../_shared/browser.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { themeHelpBlock } from "../../_shared/theme.ts";
import type { Args } from "../contract/types.ts";
import { CROP_RE } from "../lib/out-names.ts";
import { selectorRefusalForFlag } from "../lib/selector-shape.ts";
import { OPTIONAL_SELECTOR_FLAGS, PAGE_TARGET_FLAGS, REQUIRED_VALUE_FLAGS } from "./flags-classes.ts";
import { FLAG_HANDLERS } from "./flags-handlers.ts";
import { DEFAULT_VIEWPORT, MS_PER_SECOND } from "./flags-support.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

export const SNAP_HELP = `snap — one browser run, many pieces of UI evidence

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
  --expect-no-overflow [selector]   scroll bounds must fit client bounds AND no descendant's box may
                                    exit the clip on any side (left/top too — scrollWidth cannot see
                                    a justify-end spill); a scrolling axis is not judged
  --expect-focus <selector>         require the active element to match
  --json                            write a machine-readable run manifest
  --summary                         compact scenario output; pair with --json for full evidence
  --strict-console                  make console warnings red (errors are always red)
  --checkpoint                      reset __orb evidence after readiness; scope console verdicts to actions
  --include-hidden                  include Activity/hidden DOM in map, CSS, and counts

Interaction (steps, __orb nav flags AND --eval run in ONE queue in TRUE argv order — anything written
mid-chain runs mid-chain; --map/--aria/--contrast/--expect-* observe the settled surface afterwards):
  --click <selector>      --fill <selector=value>  --key <selector=Key> | --key <Key>
                            bare --key Tab walks focus (no re-focus); the selector= form re-anchors
  --hover <selector>      --wait-for <selector|text=phrase>    --goto <target>
  --upload <selector>=<path[,path...]>   attach local file(s) to a file input — drills a wrapper
                            selector (a decorative dropzone div) down to the real <input type="file">
                            automatically. PATH BOUNDARY: every path must resolve inside this repo or the
                            OS tmp dir (agent scratchpads) — anything else is refused loudly, never
                            silently skipped. Does not reach a surface with no backing <input> at all
                            (the chat composer's raw drag/paste listener).
  --open-chat <id|title|latest|current>   --open-character <id>     --context-tab <tab>
    latest = the chat list's top row; current = the room open right now (no list query — the one to
    use after creating a room, since a fresh room is unlisted until the list refetches)
  --watch <totalMs> [--every <ms>]  poll evals and optional screenshots over time
  Add @N to a page-targeted flag with --pages N, for example --click@1.
  Every selector is CSS unless prefixed: a bare phrase ("choose who speaks next") is a type-selector
  chain for tags that cannot exist, so snap REFUSES it. For rendered text write text=<phrase>.

${appearanceHelpBlock()}

${themeHelpBlock()}

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
  --ref <sha|branch|tag>  pin the isolated stage to a commit instead of HEAD (survives a merge train)
  --fresh                 force a full re-stage even when the stage is warm (implies --isolated)
  --stage-status          what holds the stage band, how long since it was used
  --stage-down [--force]  tear down the active stage; --force is required for a LIVE stage owned by
                          another checkout (it kills that checkout's run — measured, #447)
  --stage-sweep           reap a stage nothing has used past the idle TTL + prune orphan dirs
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
  // --fill splits on the FIRST '=' — its value is a JS literal that often contains '=' itself
  // (`--fill 'input=const a = 1;'`); LAST-'=' would misparse the selector and refuse.
  if (flag === "--fill" && splitFirstEq(raw) === null) {
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
  validateEvidenceFlagValue(flag, raw, errors);
  validatePairFlagValue(flag, raw, errors);
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
    // The three stage-admin modes each print and exit; two of them in one argv is an ambiguous ask, not a
    // sequence, and silently honouring the first would hide the half the caller also meant.
    [[args.stageDown, args.stageStatus, args.stageSweep].filter(Boolean).length > 1, "--stage-down, --stage-status and --stage-sweep are mutually exclusive"],
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
    appearance: null,
    theme: null,
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
    stageSweep: false,
    force: false,
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
  args.warnings.push(...parsedArgWarnings(args));
  return args;
}
