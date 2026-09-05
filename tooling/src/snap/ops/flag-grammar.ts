// Executable Snap argv grammar projected into operator-facing descriptors. This is the one completeness
// seam: every public FLAG_HANDLERS key becomes exactly one row; the daemon-only entry is deliberately
// hidden from the printed grammar block (still indexed — see below). Help, the generated flag index
// (`.claude/skills/snap-driving/reference/flags.md`, `tooling/src/verify/ops/gen/snap-flags-index.ts`) and
// tests all consume these descriptors rather than searching unrelated prose for tokens — one flag, one
// summary, one group, read from the SAME registry (#1329).
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { armFlags } from "./arms/registry.ts";
import { OPTIONAL_SELECTOR_FLAGS, OPTIONAL_VALUE_FLAGS, PAGE_TARGET_FLAGS, REQUIRED_VALUE_FLAGS } from "./flags-classes.ts";
import { nonArmFlagKind, nonArmFlagMeta, nonArmFlagUniverse } from "./flags-metadata.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --help");

/** The entries snap SPAWNS for itself: the session daemon and the band idle timer (#1163 arm b). Both are
 *  real accepted flags — they are hidden from the printed grammar and the generated index because an
 *  operator typing one would be starting a background process by hand, not asking for evidence. */
const INTERNAL_FLAGS: ReadonlySet<string> = new Set(["--session-daemon", "--stage-keeper"]);
const GRAMMAR_COLUMN_WIDTH = 40;

/** The section order the printed grammar block and the generated flag index both follow — the SAME order
 *  `.claude/skills/snap-driving/reference/flags.md`'s headings already use, so a cold agent reading either
 *  surface sees the same shape. A `group` outside this list is a metadata bug, caught by the pin. */
export const SNAP_FLAG_GROUP_ORDER: readonly string[] = [
  "Where",
  "Reach",
  "Look",
  "Assert",
  "Environment",
  "Measure",
  "Pixels",
  "Stateful sessions",
  "Maintainers only",
];

export interface SnapFlagDescriptor {
  readonly flag: string;
  readonly grammar: "boolean" | "required-value" | "optional-name" | "optional-selector" | "optional-value";
  readonly pageTargetable: boolean;
  readonly group: string;
  readonly summary: string;
}

export interface SnapFlagDescriptorOptions {
  readonly includeInternal?: boolean;
}

function armGrammarOf(flag: string): SnapFlagDescriptor["grammar"] {
  if (REQUIRED_VALUE_FLAGS.has(flag)) {
    return "required-value";
  }
  if (OPTIONAL_SELECTOR_FLAGS.has(flag)) {
    return "optional-selector";
  }
  if (OPTIONAL_VALUE_FLAGS.has(flag)) {
    return "optional-value";
  }
  return "boolean";
}

/** Every accepted flag (arm + non-arm), one row each — the 116-flag universe of #1329. `FLAG_HANDLERS`
 *  already carries the arm flags spread in (`ops/flags-handlers.ts`'s `...armFlagHandlers()`), so keying
 *  off `Object.keys(FLAG_HANDLERS)` union `nonArmFlagUniverse()` would double-count; instead this reads
 *  the arm registry directly for its rows and the non-arm universe for the rest. */
export function snapFlagDescriptors(options: SnapFlagDescriptorOptions = {}): readonly SnapFlagDescriptor[] {
  const armRows: SnapFlagDescriptor[] = armFlags().map((spec) => ({
    flag: spec.flag,
    grammar: armGrammarOf(spec.flag),
    pageTargetable: spec.pageTargetable,
    group: spec.group,
    summary: spec.summary,
  }));
  const armFlagNames = new Set(armRows.map((row) => row.flag));
  const nonArmRows: SnapFlagDescriptor[] = nonArmFlagUniverse()
    .filter((flag) => !armFlagNames.has(flag))
    .filter((flag) => options.includeInternal === true || !INTERNAL_FLAGS.has(flag))
    .map((flag) => {
      const meta = nonArmFlagMeta(flag);
      return { flag, grammar: nonArmFlagKind(flag), pageTargetable: PAGE_TARGET_FLAGS.has(flag), group: meta.group, summary: meta.summary };
    });
  return [...armRows, ...nonArmRows].sort((a, b) => a.flag.localeCompare(b.flag));
}

/** One printed row per flag, `--flag <shape>   summary` — never two flags on one line, so a reader can
 *  grep a single flag's row without a neighbour's meaning leaking onto it. */
function shapeOf(row: SnapFlagDescriptor): string {
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
}

/** The "Complete accepted flag grammar" block in `contract/help.ts`'s `SNAP_HELP` — grouped, one flag per
 *  line, aligned. Prose sections above it stay hand-written; only this block is derived. */
export function snapFlagGrammarHelp(): string {
  const rows = snapFlagDescriptors();
  const byGroup = new Map<string, SnapFlagDescriptor[]>();
  for (const row of rows) {
    const bucket = byGroup.get(row.group) ?? [];
    bucket.push(row);
    byGroup.set(row.group, bucket);
  }
  const groups = [...byGroup.keys()].sort((a, b) => SNAP_FLAG_GROUP_ORDER.indexOf(a) - SNAP_FLAG_GROUP_ORDER.indexOf(b));
  return groups
    .flatMap((group) => [`  # ${group}`, ...(byGroup.get(group) ?? []).map((row) => `  ${shapeOf(row).padEnd(GRAMMAR_COLUMN_WIDTH)} ${row.summary}`)])
    .join("\n");
}
