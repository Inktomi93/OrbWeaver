// Strict final-policy argv grammar. Unknown, incomplete, duplicate, and ambiguous requests are misuse;
// parsing never consults the repository and never inherits the legacy verify-stage scope grammar.
import { parseArgs } from "node:util";
import type { PolicyCommandParseResult, PolicyRunTier, PolicySelector } from "../contract/policy-plan.ts";
import { POLICY_RUN_TIERS } from "../contract/policy-plan.ts";
import type { PolicyScopeRequest } from "../contract/policy-scope.ts";
import { assertPolicyScopeRequest } from "./policy-scope.ts";

/** The warning-promotion opt-in's parseArgs key, and below it the ONE user-typed spelling of the flag.
 *
 *  Owner ruling 2026-09-13: a final `severity: "warning"` stays genuinely non-blocking, with OPT-IN
 *  promotion to error. The mechanism is `lib/gate-authority.ts:404`
 *  (`blocking: errors + alarmErrors + (failOnWarnings ? warnings : 0)`); this grammar is where the
 *  operator asks for it. The real-tree entrypoints that carry NOTHING ELSE from this grammar
 *  (`ops/structure.ts`, `ops/scoped.ts`) import `FAIL_ON_WARNINGS_FLAG` instead of re-spelling the token,
 *  so there is exactly one door spelling on the tree — and when the atomic cutover points `structure` at
 *  `planPolicyArgv` (the gate-runtime planner/CLI integration ruling), the flag an operator already
 *  types is the flag the planner already parses. */
const FAIL_ON_WARNINGS_OPTION = "fail-on-warnings";
export const FAIL_ON_WARNINGS_FLAG = `--${FAIL_ON_WARNINGS_OPTION}`;

/** The two SELECTION spellings, exported for the same reason `FAIL_ON_WARNINGS_FLAG` is (#1964): the
 *  GATE-SCOPED door on the mixed front door (`ops/structure.ts`) is a second REACH into this grammar, never
 *  a second spelling. `--check` names modules by id, `--family` names a final policy family; when the atomic
 *  cutover points `structure` at `planPolicyArgv`, the tokens an operator already types are the tokens the
 *  planner already parses. */
const CHECK_OPTION = "check";
const FAMILY_OPTION = "family";
export const CHECK_FLAG = `--${CHECK_OPTION}`;
export const FAMILY_FLAG = `--${FAMILY_OPTION}`;

/** A grammar refusal carrying only its message: the shape both doors turn into their OWN refusal (this
 *  module's `exitCode: 3` result, `ops/structure.ts`'s `UsageError`) without either re-spelling the rule. */
export interface SelectionRefusal {
  readonly message: string;
}

export function isSelectionRefusal(value: readonly string[] | SelectionRefusal | PolicySelector): value is SelectionRefusal {
  return !Array.isArray(value) && "message" in value;
}

const OPTIONS = {
  tier: { type: "string" },
  static: { type: "boolean" },
  push: { type: "boolean" },
  full: { type: "boolean" },
  whole: { type: "boolean" },
  changed: { type: "boolean" },
  file: { type: "string", multiple: true },
  folder: { type: "string" },
  package: { type: "string" },
  project: { type: "string" },
  check: { type: "string", multiple: true },
  family: { type: "string", multiple: true },
  "strict-scope": { type: "boolean" },
  [FAIL_ON_WARNINGS_OPTION]: { type: "boolean" },
  json: { type: "boolean" },
  list: { type: "boolean" },
  explain: { type: "boolean" },
} as const;
const REPEATABLE_OPTIONS = new Set(["file", CHECK_OPTION, FAMILY_OPTION]);
const POLICY_ID_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;

interface Values {
  readonly tier?: string;
  readonly static?: boolean;
  readonly push?: boolean;
  readonly full?: boolean;
  readonly whole?: boolean;
  readonly changed?: boolean;
  readonly file?: readonly string[];
  readonly folder?: string;
  readonly package?: string;
  readonly project?: string;
  readonly check?: readonly string[];
  readonly family?: readonly string[];
  readonly "strict-scope"?: boolean;
  readonly "fail-on-warnings"?: boolean;
  readonly json?: boolean;
  readonly list?: boolean;
  readonly explain?: boolean;
}

function refuse(message: string): PolicyCommandParseResult {
  return { ok: false, exitCode: 3, message };
}

function sortedNames(values: readonly string[] | undefined, label: string): readonly string[] | SelectionRefusal {
  if (values === undefined) {
    return [];
  }
  if (values.some((value) => value.length === 0 || value.trim() !== value)) {
    return { message: `${label} needs a nonempty value` };
  }
  const sorted = [...values].toSorted();
  const duplicate = sorted.find((value, index) => value === sorted[index - 1]);
  return duplicate === undefined ? sorted : { message: `duplicate ${label} selection ${JSON.stringify(duplicate)}` };
}

/** THE ONE selector grammar: ambiguity, nonempty/duplicate values, kebab-case, and the empty request that
 *  means "all". Both doors call it — this module's full policy grammar and the mixed front door's own tail
 *  (`ops/structure.ts`, #1964) — so `--check`/`--family` cannot drift into two meanings.
 *
 *  It resolves only the GRAMMAR. Whether the names it produces exist is a question about the corpus, and
 *  its one home is `lib/policy-plan.ts`'s `refuseSelection`. */
export function buildSelector(check: readonly string[] | undefined, family: readonly string[] | undefined): PolicySelector | SelectionRefusal {
  if (check !== undefined && family !== undefined) {
    return { message: `selection is ambiguous: choose ${CHECK_FLAG} or ${FAMILY_FLAG}, not both` };
  }
  const kind = check === undefined ? FAMILY_OPTION : CHECK_OPTION;
  const names = sortedNames(check ?? family, `--${kind}`);
  if (isSelectionRefusal(names)) {
    return names;
  }
  const malformed = names.find((name) => !POLICY_ID_RE.test(name));
  if (malformed !== undefined) {
    return { message: `--${kind} selection must be kebab-case: ${JSON.stringify(malformed)}` };
  }
  return names.length === 0 ? { kind: "all" } : { kind, names };
}

function scope(values: Values): PolicyScopeRequest | PolicyCommandParseResult {
  const selected = [
    values.whole === true,
    values.changed === true,
    values.file !== undefined,
    values.folder !== undefined,
    values.package !== undefined,
    values.project !== undefined,
  ];
  if (selected.filter(Boolean).length > 1) {
    return refuse("choose exactly one scope: --whole, --changed, --file, --folder, --package, or --project");
  }
  let request: PolicyScopeRequest = { kind: "whole" };
  if (values.changed === true) {
    request = { kind: "changed" };
  } else if (values.file !== undefined) {
    const paths = sortedNames(values.file, "--file");
    if (isSelectionRefusal(paths)) {
      return refuse(paths.message);
    }
    if (paths.length === 0) {
      return refuse("--file needs at least one value");
    }
    request = { kind: "file", paths };
  } else if (values.folder !== undefined) {
    request = { kind: "folder", path: values.folder };
  } else if (values.package !== undefined) {
    request = { kind: "package", name: values.package };
  } else if (values.project !== undefined) {
    request = { kind: "project", config: values.project };
  }
  try {
    assertPolicyScopeRequest(request);
  } catch (error) {
    return refuse(error instanceof Error ? error.message : String(error));
  }
  return request;
}

function inspectionRequest(values: Values, selected: PolicySelector): PolicyCommandParseResult | void {
  if (values.list === true && values.explain === true) {
    return refuse("choose one inspection mode: --list or --explain");
  }
  if (values.list === true) {
    if (hasRunShape(values) || selected.kind !== "all") {
      return refuse("--list is an inspection request and cannot carry scope, tier, or policy selection");
    }
    return { ok: true, request: { mode: "list", json: values.json === true } };
  }
  if (values.explain === true) {
    if (hasRunShape(values) || selected.kind === "all" || selected.names.length !== 1) {
      return refuse("--explain needs exactly one --check or --family selection and no run scope or tier");
    }
    return { ok: true, request: { mode: "explain", selector: selected, json: values.json === true } };
  }
}

function hasRunShape(values: Values): boolean {
  return (
    values.tier !== undefined ||
    values.static === true ||
    values.push === true ||
    values.full === true ||
    values.whole === true ||
    values.changed === true ||
    values.file !== undefined ||
    values.folder !== undefined ||
    values.package !== undefined ||
    values.project !== undefined ||
    values["strict-scope"] === true ||
    values[FAIL_ON_WARNINGS_OPTION] === true
  );
}

function runTier(values: Values, scopeKind: PolicyScopeRequest["kind"]): PolicyRunTier | PolicyCommandParseResult {
  const tiers = new Set<PolicyRunTier>();
  if (values.changed === true) {
    tiers.add("changed");
  }
  for (const tier of POLICY_RUN_TIERS) {
    if (tier !== "changed" && values[tier] === true) {
      tiers.add(tier);
    }
  }
  if (values.tier !== undefined) {
    if (!(POLICY_RUN_TIERS as readonly string[]).includes(values.tier)) {
      return refuse(`--tier must be one of ${POLICY_RUN_TIERS.join(", ")}`);
    }
    tiers.add(values.tier as PolicyRunTier);
  }
  if (tiers.size > 1) {
    return refuse(`choose at most one tier: ${[...tiers].toSorted().join(", ")}`);
  }
  return [...tiers][0] ?? (scopeKind === "whole" ? "static" : "changed");
}

/** `parseArgs` accepts a repeated boolean silently (last wins), so the DUPLICATE sweep is ours — and it is
 *  the same sweep on both doors (#1964): `structure --fail-on-warnings --fail-on-warnings` is misuse for the
 *  same reason `verify run --static --static` is. `repeatable` names the options that legitimately appear
 *  more than once, so a caller with a smaller grammar passes its own set rather than re-spelling the rule. */
export function refuseDuplicateOptions(argv: readonly string[], repeatable: ReadonlySet<string>): string | null {
  const seen = new Set<string>();
  for (const token of argv) {
    if (!token.startsWith("--")) {
      continue;
    }
    const name = token.slice(2).split("=", 1)[0] ?? "";
    if (!repeatable.has(name) && seen.has(name)) {
      return `duplicate option --${name}`;
    }
    seen.add(name);
  }
  return null;
}

export function parsePolicyCommand(argv: readonly string[]): PolicyCommandParseResult {
  const duplicate = refuseDuplicateOptions(argv, REPEATABLE_OPTIONS);
  if (duplicate !== null) {
    return refuse(duplicate);
  }
  let values: Values;
  try {
    const parsed = parseArgs({ args: [...argv], options: OPTIONS, strict: true, allowPositionals: false });
    values = parsed.values as Values;
  } catch (error) {
    return refuse(error instanceof Error ? error.message : String(error));
  }
  const built = buildSelector(values.check, values.family);
  if (isSelectionRefusal(built)) {
    return refuse(built.message);
  }
  const selected = built;
  const inspection = inspectionRequest(values, selected);
  if (inspection !== undefined) {
    return inspection;
  }
  const requestedScope = scope(values);
  if (!("kind" in requestedScope)) {
    return requestedScope;
  }
  const tier = runTier(values, requestedScope.kind);
  if (typeof tier !== "string") {
    return tier;
  }
  return {
    ok: true,
    request: {
      mode: "run",
      tier,
      scope: requestedScope,
      selector: selected,
      strictScope: values["strict-scope"] === true,
      failOnWarnings: values[FAIL_ON_WARNINGS_OPTION] === true,
      json: values.json === true,
    },
  };
}
