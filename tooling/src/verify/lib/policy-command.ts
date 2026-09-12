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
 *  `planPolicyArgv` (docs/reviews/gate-runtime/planner-cli-integration.md), the flag an operator already
 *  types is the flag the planner already parses. */
const FAIL_ON_WARNINGS_OPTION = "fail-on-warnings";
export const FAIL_ON_WARNINGS_FLAG = `--${FAIL_ON_WARNINGS_OPTION}`;

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
const REPEATABLE_OPTIONS = new Set(["file", "check", "family"]);
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

function sortedNames(values: readonly string[] | undefined, label: string): readonly string[] | PolicyCommandParseResult {
  if (values === undefined) {
    return [];
  }
  if (values.some((value) => value.length === 0 || value.trim() !== value)) {
    return refuse(`${label} needs a nonempty value`);
  }
  const sorted = [...values].toSorted();
  const duplicate = sorted.find((value, index) => value === sorted[index - 1]);
  return duplicate === undefined ? sorted : refuse(`duplicate ${label} selection ${JSON.stringify(duplicate)}`);
}

function isParseFailure(value: readonly string[] | PolicyCommandParseResult): value is PolicyCommandParseResult {
  return !Array.isArray(value);
}

function selector(values: Values): PolicySelector | PolicyCommandParseResult {
  if (values.check !== undefined && values.family !== undefined) {
    return refuse("selection is ambiguous: choose --check or --family, not both");
  }
  const kind = values.check === undefined ? "family" : "check";
  const names = sortedNames(values[kind], `--${kind}`);
  if (isParseFailure(names)) {
    return names;
  }
  const malformed = names.find((name) => !POLICY_ID_RE.test(name));
  if (malformed !== undefined) {
    return refuse(`--${kind} selection must be kebab-case: ${JSON.stringify(malformed)}`);
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
    if (isParseFailure(paths)) {
      return paths;
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

export function parsePolicyCommand(argv: readonly string[]): PolicyCommandParseResult {
  const seen = new Set<string>();
  for (const token of argv) {
    if (!token.startsWith("--")) {
      continue;
    }
    const name = token.slice(2).split("=", 1)[0] ?? "";
    if (!REPEATABLE_OPTIONS.has(name) && seen.has(name)) {
      return refuse(`duplicate option --${name}`);
    }
    seen.add(name);
  }
  let values: Values;
  try {
    const parsed = parseArgs({ args: [...argv], options: OPTIONS, strict: true, allowPositionals: false });
    values = parsed.values as Values;
  } catch (error) {
    return refuse(error instanceof Error ? error.message : String(error));
  }
  const selected = selector(values);
  if (!("kind" in selected)) {
    return selected;
  }
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
