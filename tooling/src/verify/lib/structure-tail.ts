// `cli.ts structure`'s TOMBSTONE grammar, split out of ops/structure.ts under the tooling line cap (#2247).
// Normal run/inspection argv belongs to `lib/policy-command.ts`; this module owns only the disjoint
// `--void <slot> --reason <why>` mutation and the shared help/refusal text.
//
// PURE, and that is why it can live here: argv in, a `StructureRequest` or a thrown `UsageError` out. It
// opens no run slot, reads no artifact and writes nothing — which is exactly the #1117 property the front
// door depends on, that a typo is refused BEFORE the run slot opens and can never leave an in-flight
// artifact behind.
//
// Every token is imported from `lib/policy-command.ts`, the final-policy grammar that already owns them —
// this door is a second REACH, never a second spelling, and the selector rules (ambiguity, nonempty,
// duplicate, kebab-case) come from that module's `buildSelector` rather than being re-decided here.
import { parseArgs } from "node:util";
import { UsageError } from "@orb/tooling/_shared/run-tool";
import type { PolicySelector } from "../contract/policy-plan.ts";
import { buildSelector, CHECK_FLAG, FAIL_ON_WARNINGS_FLAG, FAMILY_FLAG, isSelectionRefusal, refuseDuplicateOptions } from "./policy-command.ts";

export const VOID_FLAG = "--void";
const REASON_FLAG = "--reason";

/** What the operator asked for. `selection.kind === "all"` is the shipped default and the ONLY shape that
 *  publishes the pointer; `failOnWarnings` DEFAULTS FALSE (ops/structure.ts `runFinalPass`'s header). */
export interface StructureRequest {
  readonly failOnWarnings: boolean;
  readonly selection: PolicySelector;
  /** Present when the operator asked to TOMBSTONE an existing slot instead of running anything (#2167). */
  readonly tombstone: { readonly slot: string; readonly reason: string } | null;
}

const TAIL_OPTIONS = {
  "fail-on-warnings": { type: "boolean" },
  check: { type: "string", multiple: true },
  family: { type: "string", multiple: true },
  void: { type: "string" },
  reason: { type: "string" },
} as const;
/** `--check`/`--family` are the repeatable pair; `--fail-on-warnings` twice stays misuse (the grammar is zero
 *  or one), which is exactly `refuseDuplicateOptions`'s contract. */
const REPEATABLE_TAIL_OPTIONS: ReadonlySet<string> = new Set(["check", "family"]);

/** This verb's usage line — ONE home, read by the tail refusal below and by the front door's pre-dispatch
 *  `--help` answer (cli.ts VERB_HELP, #809). */
export const STRUCTURE_USAGE =
  `usage: node tooling/src/verify/cli.ts structure [--whole|--changed|--file <path>...|--folder <path>|--package <name>|--project <config>] [--tier <changed|static|push|full>] [--strict-scope] [${FAIL_ON_WARNINGS_FLAG}] [${CHECK_FLAG} <id>]... | [${FAMILY_FLAG} <name>]... [--json]\n` +
  "       node tooling/src/verify/cli.ts structure --list [--json]\n" +
  `       node tooling/src/verify/cli.ts structure --explain (${CHECK_FLAG} <id>|${FAMILY_FLAG} <name>) [--json]\n` +
  `       node tooling/src/verify/cli.ts structure ${VOID_FLAG} <slot> ${REASON_FLAG} "<why>"   (tombstone an existing slot; runs nothing)\n` +
  "  Runs final structural policies through the canonical planner; only a whole-scope all-policy verdict publishes reports/check-structure.json.\n" +
  `  ${FAIL_ON_WARNINGS_FLAG} promotes final \`severity: "warning"\` findings into the blocking count (exit 1). It is OFF by default: a warning is reported, counted, and blocks nothing.\n` +
  `  ${CHECK_FLAG} <id> runs only the named final policy; ${FAMILY_FLAG} <name> runs one final family. Without a scope flag they see the whole real tree; with one they execute the planner's exact intersection.\n` +
  "  A selected run is NOT the corpus verdict: it reports only what it was asked about and does NOT republish reports/check-structure.json, so read the slot path it prints.\n" +
  `  ${VOID_FLAG} <slot> ${REASON_FLAG} "<why>" TOMBSTONES a published slot — every reader then refuses it and prints the reason. It runs no gates and carries no run flags.`;

/** ONE refusal shape for every way this tail can be wrong. It LEADS with the whole grammar rather than with
 *  `parseArgs`'s bare "Unknown option", because an operator who typed the near-miss needs the legal set — and
 *  because the sentence `structure takes at most --fail-on-warnings` is the literal the #1117 pins were
 *  written against (tests/tooling/verify/cli.int.test.ts, ops/warning-promotion.suite.int.test.ts): it stays
 *  true and stays a prefix as the grammar grows, so widening the tail never silently retires those pins. */
export function tailRefusal(reason: string): string {
  return `structure takes at most ${FAIL_ON_WARNINGS_FLAG} once per invocation; structure argument refusal — ${reason}\n${STRUCTURE_USAGE}`;
}

/** `--void <slot> --reason <why>` — BOTH or NEITHER. A tombstone without a reason is a refusal nobody can
 *  act on, and `--reason` alone is an operator who thinks they voided something and did not. */
function voidRequest(values: { readonly void?: string; readonly reason?: string }): { readonly slot: string; readonly reason: string } | null {
  const slot = values.void?.trim() ?? "";
  const reason = values.reason?.trim() ?? "";
  if (slot.length === 0 && reason.length === 0) {
    return null;
  }
  if (slot.length === 0 || reason.length === 0) {
    throw new UsageError(tailRefusal(`${VOID_FLAG} and ${REASON_FLAG} are used together — a tombstone without a stated reason is a refusal nobody can act on`));
  }
  return { slot, reason };
}

/** Anything not in the grammar above is misuse (exit 3) refused BEFORE the run slot opens: the whole point of
 *  #1117 is that a verb which swallows an unread tail reports a verdict nobody asked for, and the verdicts
 *  here are opposite in two directions (promoted warnings block; a SELECTED run is not the corpus verdict). */
function parseStructureTail(argv: readonly string[]): StructureRequest {
  const duplicate = refuseDuplicateOptions(argv, REPEATABLE_TAIL_OPTIONS);
  if (duplicate !== null) {
    throw new UsageError(tailRefusal(duplicate));
  }
  let values: {
    readonly "fail-on-warnings"?: boolean;
    readonly check?: readonly string[];
    readonly family?: readonly string[];
    readonly void?: string;
    readonly reason?: string;
  };
  try {
    values = parseArgs({ args: [...argv], options: TAIL_OPTIONS, strict: true, allowPositionals: false }).values;
  } catch (error) {
    throw new UsageError(tailRefusal(error instanceof Error ? error.message : String(error)), { cause: error });
  }
  const selection = buildSelector(values.check, values.family);
  if (isSelectionRefusal(selection)) {
    throw new UsageError(tailRefusal(selection.message));
  }
  const tombstone = voidRequest(values);
  if (tombstone !== null && (values["fail-on-warnings"] === true || selection.kind !== "all")) {
    throw new UsageError(tailRefusal(`${VOID_FLAG} tombstones an EXISTING slot and runs nothing — it cannot carry a run's flags`));
  }
  return { failOnWarnings: values["fail-on-warnings"] === true, selection, tombstone };
}

/** Return null without parsing when this is a normal policy command. Once either tombstone token appears,
 *  parse the complete tombstone grammar so a mutation can never smuggle a run or inspection flag beside it. */
export function parseStructureTombstone(argv: readonly string[]): StructureRequest["tombstone"] {
  if (!argv.some((token) => token === VOID_FLAG || token.startsWith(`${VOID_FLAG}=`) || token === REASON_FLAG || token.startsWith(`${REASON_FLAG}=`))) {
    return null;
  }
  return parseStructureTail(argv).tombstone;
}
