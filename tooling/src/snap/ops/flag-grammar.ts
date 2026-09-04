// Executable Snap argv grammar projected into operator-facing descriptors. This is the one completeness
// seam: every public FLAG_HANDLERS key becomes exactly one row; the daemon-only entry is deliberately
// hidden. Help and tests consume these descriptors rather than searching unrelated prose for tokens.
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { OPTIONAL_NAME_FLAGS, OPTIONAL_SELECTOR_FLAGS, OPTIONAL_VALUE_FLAGS, PAGE_TARGET_FLAGS, REQUIRED_VALUE_FLAGS } from "./flags-classes.ts";
import { FLAG_HANDLERS } from "./flags-handlers.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --help");

const INTERNAL_FLAGS: ReadonlySet<string> = new Set(["--session-daemon"]);
const GRAMMAR_COLUMN_WIDTH = 48;

export interface SnapFlagDescriptor {
  readonly flag: string;
  readonly grammar: "boolean" | "required-value" | "optional-name" | "optional-selector" | "optional-value";
  readonly pageTargetable: boolean;
}

export interface SnapFlagDescriptorOptions {
  readonly includeInternal?: boolean;
}

function grammarOf(flag: string): SnapFlagDescriptor["grammar"] {
  if (REQUIRED_VALUE_FLAGS.has(flag)) {
    return "required-value";
  }
  if (OPTIONAL_NAME_FLAGS.has(flag)) {
    return "optional-name";
  }
  if (OPTIONAL_SELECTOR_FLAGS.has(flag)) {
    return "optional-selector";
  }
  if (OPTIONAL_VALUE_FLAGS.has(flag)) {
    return "optional-value";
  }
  return "boolean";
}

export function snapFlagDescriptors(options: SnapFlagDescriptorOptions = {}): readonly SnapFlagDescriptor[] {
  return Object.keys(FLAG_HANDLERS)
    .filter((flag) => options.includeInternal === true || !INTERNAL_FLAGS.has(flag))
    .sort()
    .map((flag) => ({ flag, grammar: grammarOf(flag), pageTargetable: PAGE_TARGET_FLAGS.has(flag) }));
}

export function snapFlagGrammarHelp(): string {
  const value = (row: SnapFlagDescriptor): string => {
    const suffix = row.pageTargetable ? " [@N]" : "";
    if (row.grammar === "required-value") {
      return `${row.flag}${suffix} <value>`;
    }
    if (row.grammar === "optional-name") {
      return `${row.flag}${suffix} [name]`;
    }
    if (row.grammar === "optional-selector") {
      return `${row.flag}${suffix} [selector]`;
    }
    if (row.grammar === "optional-value") {
      return `${row.flag}${suffix} [value]`;
    }
    return `${row.flag}${suffix}`;
  };
  return snapFlagDescriptors()
    .map((row) => `  ${value(row).padEnd(GRAMMAR_COLUMN_WIDTH)} ${row.grammar}`)
    .join("\n");
}
