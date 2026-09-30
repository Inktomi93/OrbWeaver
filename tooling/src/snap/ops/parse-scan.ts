import { splitPageSuffix } from "../../_shared/argv.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { aliasRefusal, instrumentFamilyRosterErrors } from "../../_shared/instrument-argv.ts";
import { validateFlagValue, validateSelectorFlagValue } from "../lib/flag-values.ts";
import { OPTIONAL_NAME_FLAGS, OPTIONAL_SELECTOR_FLAGS, OPTIONAL_VALUE_FLAGS, PAGE_TARGET_FLAGS, REQUIRED_VALUE_FLAGS } from "./flags-classes.ts";
import { FLAG_HANDLERS } from "./flags-handlers.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

const KNOWN_FLAGS = new Set(Object.keys(FLAG_HANDLERS));
const MATRIX_OWNED_INPUT_FLAGS = new Set([
  "--appearance",
  "--appearance-preset",
  "--full-motion",
  "--theme",
  "--mobile",
  "--desktop",
  "--wide",
  "--viewport",
  "--dark",
  "--light",
  "--reduced-motion",
]);

export interface ArgvScan {
  readonly errors: string[];
  readonly seen: Set<string>;
  routeCount: number;
  fileMode: boolean;
}

function consumesOptionalSelector(argv: readonly string[], index: number): boolean {
  const value = argv[index + 1];
  return value !== undefined && !value.startsWith("-") && !value.startsWith("/");
}

function consumesOptionalName(argv: readonly string[], index: number): boolean {
  const value = argv[index + 1];
  return value !== undefined && !value.startsWith("-");
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

function consumeOptionalSelectorArg(argv: readonly string[], index: number, flag: string, errors: string[]): number {
  if (!(OPTIONAL_SELECTOR_FLAGS.has(flag) && consumesOptionalSelector(argv, index))) {
    return 0;
  }
  const selector = argv[index + 1];
  if (selector !== undefined) {
    validateSelectorFlagValue(flag, selector, errors);
  }
  return 1;
}

const OPTIONAL_INLINE_CONSUMERS: readonly (readonly [ReadonlySet<string>, (argv: readonly string[], index: number) => boolean])[] = [
  [OPTIONAL_VALUE_FLAGS, consumesOptionalSelector],
  [OPTIONAL_NAME_FLAGS, consumesOptionalName],
];

function scanArgvToken(argv: readonly string[], index: number, scan: ArgvScan): number {
  const token = argv[index];
  if (token === undefined) {
    throw new Error(`INSTRUMENT ERROR: argv index ${String(index)} disappeared during Snap parsing`);
  }
  const { flag } = splitPageSuffix(token);
  if (FLAG_HANDLERS[flag] === undefined) {
    scan.routeCount += token.startsWith("-") ? 0 : 1;
    if (token.startsWith("-")) {
      scan.errors.push(aliasRefusal(flag, KNOWN_FLAGS) ?? `unknown flag ${token}`);
    }
    return 0;
  }
  scan.seen.add(flag);
  scan.fileMode = scan.fileMode || flag === "--file";
  if (token !== flag && !PAGE_TARGET_FLAGS.has(flag)) {
    scan.errors.push(`${flag} does not accept a @<page> suffix`);
  }
  if (REQUIRED_VALUE_FLAGS.has(flag)) {
    return consumeRequiredArg(argv, index, flag, scan.errors);
  }
  const consumesInline = OPTIONAL_INLINE_CONSUMERS.find(([flags]) => flags.has(flag))?.[1];
  if (consumesInline !== undefined) {
    return consumesInline(argv, index) ? 1 : 0;
  }
  return consumeOptionalSelectorArg(argv, index, flag, scan.errors);
}

export function scanArgv(argv: readonly string[]): ArgvScan {
  const scan: ArgvScan = { errors: [], seen: new Set(), routeCount: 0, fileMode: false };
  for (let index = 0; index < argv.length; index += 1) {
    index += scanArgvToken(argv, index, scan);
  }
  if (scan.routeCount > 1) {
    scan.errors.push(`expected at most one route, got ${scan.routeCount}`);
  }
  if (scan.fileMode && scan.routeCount > 0) {
    scan.errors.push("--file and a positional route are mutually exclusive");
  }
  if (scan.seen.has("--dirty") && scan.seen.has("--ref")) {
    scan.errors.push("--dirty and --ref are mutually exclusive: --dirty serves the working tree; --ref pins a commit");
  }
  if (scan.seen.has("--base")) {
    for (const stageSource of ["--isolated", "--dirty", "--ref", "--fresh", "--stage-auth"]) {
      if (scan.seen.has(stageSource)) {
        scan.errors.push(`--base and ${stageSource} are mutually exclusive: --base selects an existing stack; ${stageSource} boots an isolated stage`);
      }
    }
  }
  if (scan.seen.has("--matrix")) {
    const manualAxes = [...scan.seen].filter((flag) => MATRIX_OWNED_INPUT_FLAGS.has(flag));
    if (manualAxes.length > 0) {
      scan.errors.push(
        `--matrix owns the appearance/theme/device/viewport/color-scheme/reduced-motion axes; remove ${manualAxes.join(", ")} and let the derived matrix plan select each cell`,
      );
    }
  }
  scan.errors.push(...instrumentFamilyRosterErrors("snap", KNOWN_FLAGS));
  return scan;
}
