// Fail-closed runtime validation shared by policy loading and invocation boundaries. The proof-row grammar
// and the path/fixture primitives it is built on are `policy-validation-proofs.ts` (split out at the size
// cap 2026-09-18); descriptor, fact, resource and hook validation stay here.

import { SyntaxKind } from "ts-morph";
import type { GateFact, GateFactHooks } from "../contract/fact.ts";
import { isDefinedGateFact } from "../contract/fact.ts";
import type { GateAuthority } from "../contract/gate-authority.ts";
import { GATE_AUTHORITIES, GATE_SEVERITIES } from "../contract/gate-authority.ts";
import type { GatePolicy, GatePolicyHooks, PolicyField } from "../contract/policy.ts";
import { GATE_POLICY_EXECUTIONS, POLICY_FIELDS, POLICY_HOOK_KEYS, POLICY_OPTIONAL_FIELDS, POLICY_PROOF_ARMS } from "../contract/policy.ts";
import type { GatePolicyAnalysis } from "../contract/policy-primitives.ts";
import { GATE_POLICY_ANALYSES } from "../contract/policy-primitives.ts";
import type { PopulationExpr } from "../contract/population.ts";
import { NATIVE_CONFIG_RESOURCE_PATHS, PACKAGE_RESOURCE_PATHS, STATIC_CONFIG_RESOURCE_PATHS } from "../contract/resource-config.ts";
import type { GateResourceRequest } from "../contract/resource-declaration.ts";
import { GATE_RESOURCE_REQUEST_KINDS, isGateResourceUnpopulatedKind } from "../contract/resource-declaration.ts";
import { LEDGER_DEFINITIONS } from "../contract/resource-document.ts";
import { EXACT_RESOURCE_PATHS } from "../contract/resource-exact.ts";
import { INSTALLED_PACKAGE_IDS, INSTALLED_PACKAGE_MODES } from "../contract/resource-installed.ts";
import { JSON_RESOURCE_PATHS } from "../contract/resource-json.ts";
import { MIRROR_FAMILY_DEFINITIONS } from "../contract/resource-mirror.ts";
import { AUTHORED_TREE_PATHS } from "../contract/resource-tree.ts";
import {
  assertProofArm,
  assertRepoPathIdentity as assertRepoPath,
  exactKeys,
  invalid,
  nonBlank,
  normalizePathSet as normalizePaths,
  record,
  reviewedGrantWitnessFailure,
} from "./policy-validation-proofs.ts";
import { assertPopulationExpr } from "./population-resolver.ts";

// The key sets DERIVE from the contract's vocabularies (`contract/policy.ts`, one table per vocabulary, held
// two-sided against the interfaces by `tsc`): a field, arm or key added there is refused, required and admitted
// here with no second edit (#2111).
const POLICY_KEYS: ReadonlySet<string> = new Set(POLICY_FIELDS);
const OPTIONAL_POLICY_KEYS: ReadonlySet<PolicyField> = new Set(POLICY_OPTIONAL_FIELDS);
const REQUIRED_POLICY_KEYS: readonly PolicyField[] = POLICY_FIELDS.filter((field) => !OPTIONAL_POLICY_KEYS.has(field));
const HOOK_KEYS: ReadonlySet<string> = new Set(POLICY_HOOK_KEYS);
const VISITOR_KEYS = new Set(["kinds", "visit"]);
const KEBAB_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const RESOURCE_KEYS = new Set(["kind", "id"]);
const RESOURCE_KIND_ONLY_KEYS = new Set(["kind"]);
const INSTALLED_KEYS = new Set(["kind", "id", "mode"]);
const INSTALLED_TEXT_KEYS = new Set(["kind", "id", "mode", "file"]);
const FACT_KEYS = new Set(["id", "population", "analysis", "resources", "create"]);
const REQUIRED_FACT_KEYS = ["id", "population", "analysis", "resources", "create"] as const;
const FACT_HOOK_KEYS = new Set(["visitors", "visitFile", "finish"]);

/** Repo-path identity and path-set normalization — the grammar lives in `policy-validation-proofs.ts` (the
 *  proof rows are built on it); kept here by name because every loading and invocation boundary imports them
 *  from this module. */
export function assertRepoPathIdentity(value: unknown, label = "path"): asserts value is string {
  assertRepoPath(value, label);
}

export function normalizePathSet(values: readonly string[], label: string): readonly string[] {
  return normalizePaths(values, label);
}

function isExplicitNone(population: PopulationExpr): boolean {
  return typeof population === "object" && !Array.isArray(population) && "of" in population && population.of === "none";
}

export function assertGateResourceDeclarations(value: unknown): asserts value is readonly GateResourceRequest[] {
  if (!Array.isArray(value)) {
    invalid("descriptor.resources must be an array");
  }
  const identities = new Set<string>();
  for (const [index, candidate] of value.entries()) {
    const identity = assertGateResourceDeclaration(candidate, index);
    if (identities.has(identity)) {
      invalid(`descriptor.resources contains duplicate request ${identity}`);
    }
    identities.add(identity);
  }
}

/** The id VOCABULARY per kind, keyed off each door's own closed definition object so this validator can
 *  never drift from the door: a kind whose ids live in a definition record (mirror families, ledgers) is
 *  admitted by its KEYS, which is all this check has ever needed. `undefined` means the kind takes no id. */
function resourceIds(kind: GateResourceRequest["kind"]): Readonly<Record<string, unknown>> | undefined {
  let ids: Readonly<Record<string, unknown>> | undefined;
  if (kind === "authored-tree") {
    ids = AUTHORED_TREE_PATHS;
  } else if (kind === "package-metadata") {
    ids = PACKAGE_RESOURCE_PATHS;
  } else if (kind === "static-config") {
    ids = STATIC_CONFIG_RESOURCE_PATHS;
  } else if (kind === "native-config") {
    ids = NATIVE_CONFIG_RESOURCE_PATHS;
  } else if (kind === "json") {
    ids = JSON_RESOURCE_PATHS;
  } else if (kind === "mirror-index") {
    ids = MIRROR_FAMILY_DEFINITIONS;
  } else if (kind === "ledger") {
    ids = LEDGER_DEFINITIONS;
  } else if (kind === "exact-file") {
    ids = EXACT_RESOURCE_PATHS;
  }
  return ids;
}

/** `installed-package` is the one kind with a shape of its own: a closed mode, and a named file that is
 *  REQUIRED for `text` and FORBIDDEN otherwise — so a `text` declaration cannot silently read nothing and an
 *  `ast` declaration cannot carry a file nobody reads. */
function assertInstalledPackageRequest(request: Readonly<Record<string, unknown>>, label: string): string {
  const textMode = request["mode"] === "text";
  exactKeys(request, textMode ? INSTALLED_TEXT_KEYS : INSTALLED_KEYS, label);
  nonBlank(request["id"], `${label}.id`);
  if (!(INSTALLED_PACKAGE_IDS as readonly unknown[]).includes(request["id"])) {
    invalid(`${label}.id is unknown for installed-package`);
  }
  if (!(INSTALLED_PACKAGE_MODES as readonly unknown[]).includes(request["mode"])) {
    invalid(`${label}.mode must be ast, metadata, or text`);
  }
  if (!textMode) {
    return `installed-package:${String(request["id"])}:${String(request["mode"])}`;
  }
  assertRepoPathIdentity(request["file"], `${label}.file`);
  return `installed-package:${String(request["id"])}:text:${String(request["file"])}`;
}

function assertGateResourceDeclaration(candidate: unknown, index: number): string {
  const label = `descriptor.resources[${index}]`;
  const request = record(candidate, label);
  if (!(GATE_RESOURCE_REQUEST_KINDS as readonly unknown[]).includes(request["kind"])) {
    invalid(`${label}.kind is unknown`);
  }
  const kind = request["kind"] as GateResourceRequest["kind"];
  if (kind === "installed-package") {
    return assertInstalledPackageRequest(request, label);
  }
  const ids = resourceIds(kind);
  exactKeys(request, ids === undefined ? RESOURCE_KIND_ONLY_KEYS : RESOURCE_KEYS, label);
  if (ids === undefined) {
    return kind;
  }
  nonBlank(request["id"], `${label}.id`);
  if (!Object.hasOwn(ids, request["id"] as PropertyKey)) {
    invalid(`${label}.id is unknown for ${kind}`);
  }
  return `${kind}:${String(request["id"])}`;
}

function assertAnalysisResources(policy: Readonly<Record<string, unknown>>): void {
  assertGateResourceDeclarations(policy["resources"]);
  const resources = policy["resources"] as readonly GateResourceRequest[];
  if (policy["analysis"] === "resource" && resources.length === 0) {
    invalid("descriptor.resources must be nonempty when analysis is resource");
  }
  // `authored-text` reads only paths that a SIBLING declaration already admitted, so a policy declaring it
  // alone can receive nothing but `unacquired` refusals — a door that is structurally guaranteed to answer
  // nothing, which reads in a report exactly like a corpus that is genuinely clean.
  if (resources.some((request) => request.kind === "authored-text") && !resources.some((request) => !isGateResourceUnpopulatedKind(request.kind))) {
    invalid("descriptor.resources declaring authored-text must also declare a resource that admits paths");
  }
  if (policy["analysis"] !== "resource" && resources.length > 0) {
    invalid("descriptor.resources must be empty unless analysis is resource");
  }
}

export function assertGateFactDescriptor(value: unknown): asserts value is GateFact {
  if (!isDefinedGateFact(value)) {
    invalid("fact must be branded by defineFact");
  }
  const fact = record(value, "fact");
  if (Object.getPrototypeOf(fact) !== Object.prototype) {
    invalid("fact must be a direct plain object with no custom prototype");
  }
  for (const key of Reflect.ownKeys(fact)) {
    if (typeof key !== "string") {
      invalid("fact may contain only string contract properties");
    }
    if (!Object.prototype.propertyIsEnumerable.call(fact, key)) {
      invalid(`fact.${key} must be an own enumerable property`);
    }
  }
  exactKeys(fact, FACT_KEYS, "fact");
  for (const key of REQUIRED_FACT_KEYS) {
    if (!Object.prototype.propertyIsEnumerable.call(fact, key)) {
      invalid(`fact.${key} must be an own enumerable property`);
    }
  }
  nonBlank(fact["id"], "fact.id");
  if (!KEBAB_RE.test(fact["id"] as string)) {
    invalid("fact.id must be kebab-case");
  }
  if (!(GATE_POLICY_ANALYSES as readonly unknown[]).includes(fact["analysis"])) {
    invalid("fact.analysis is required and invalid");
  }
  assertAnalysisResources(fact);
  assertPopulationExpr(fact["population"]);
  if (isExplicitNone(fact["population"] as PopulationExpr) && fact["analysis"] !== "resource") {
    invalid('fact population {of:"none"} is valid only for resource analysis');
  }
  if (typeof fact["create"] !== "function") {
    invalid("fact.create must be a function");
  }
}

function assertFacts(value: unknown, execution: unknown): void {
  if (!Array.isArray(value)) {
    invalid("descriptor.facts must be an array");
  }
  const ids = new Set<string>();
  for (const candidate of value) {
    assertGateFactDescriptor(candidate);
    if (ids.has(candidate.id)) {
      invalid(`descriptor.facts contains duplicate provider id ${candidate.id}`);
    }
    ids.add(candidate.id);
  }
  if (value.length > 0 && execution !== "entire-population") {
    invalid("a policy using shared facts must execute over its entire population");
  }
}

function assertDirectDescriptor(policy: Readonly<Record<string, unknown>>): void {
  if (Object.getPrototypeOf(policy) !== Object.prototype) {
    invalid("descriptor must be a direct plain object with no custom prototype");
  }
  for (const key of Reflect.ownKeys(policy)) {
    if (typeof key !== "string") {
      invalid("descriptor may contain only string contract properties");
    }
    if (!Object.prototype.propertyIsEnumerable.call(policy, key)) {
      invalid(`descriptor.${key} must be an own enumerable property`);
    }
  }
  for (const key of REQUIRED_POLICY_KEYS) {
    if (!Object.prototype.propertyIsEnumerable.call(policy, key)) {
      invalid(`descriptor.${key} must be an own enumerable property`);
    }
  }
}

function assertSeverityWorkItem(policy: Readonly<Record<string, unknown>>): void {
  // Warning severity is temporary work debt regardless of authority. A hard warning remains effective and
  // unwaivable; only its default contribution to the blocking count changes.
  if (policy["severity"] === "warning") {
    if (!Object.prototype.propertyIsEnumerable.call(policy, "workItem")) {
      invalid("descriptor.workItem must be an own enumerable property when severity is warning");
    }
    if (!(Number.isSafeInteger(policy["workItem"]) && (policy["workItem"] as number) > 0)) {
      invalid("descriptor.workItem must be a positive safe integer when severity is warning");
    }
  } else if (Object.hasOwn(policy, "workItem")) {
    invalid("descriptor.workItem is forbidden when severity is error");
  }
}

export function assertGatePolicyDescriptor(value: unknown): asserts value is GatePolicy {
  const policy = record(value, "descriptor");
  assertDirectDescriptor(policy);
  exactKeys(policy, POLICY_KEYS, "descriptor");
  for (const key of ["id", "family"] as const) {
    nonBlank(policy[key], `descriptor.${key}`);
    if (!KEBAB_RE.test(policy[key] as string)) {
      invalid(`descriptor.${key} must be kebab-case`);
    }
  }
  if (!(GATE_AUTHORITIES as readonly unknown[]).includes(policy["authority"])) {
    invalid("descriptor.authority is required and invalid");
  }
  if (!(GATE_SEVERITIES as readonly unknown[]).includes(policy["severity"])) {
    invalid("descriptor.severity is required and invalid");
  }
  assertSeverityWorkItem(policy);
  if (!(GATE_POLICY_ANALYSES as readonly unknown[]).includes(policy["analysis"])) {
    invalid("descriptor.analysis is required and invalid");
  }
  if (!(GATE_POLICY_EXECUTIONS as readonly unknown[]).includes(policy["execution"])) {
    invalid("descriptor.execution is required and invalid");
  }
  assertFacts(policy["facts"], policy["execution"]);
  assertAnalysisResources(policy);
  nonBlank(policy["message"], "descriptor.message");
  if (Object.hasOwn(policy, "fix")) {
    nonBlank(policy["fix"], "descriptor.fix");
  }
  if (typeof policy["create"] !== "function") {
    invalid("descriptor.create must be a function");
  }
  assertPopulationExpr(policy["population"]);
  if (isExplicitNone(policy["population"] as PopulationExpr) && policy["analysis"] !== "resource") {
    invalid('population {of:"none"} is valid only for resource analysis');
  }
  // Every arm the contract names, in its order. An OPTIONAL arm (`mustRefuse`) is validated only when present,
  // and an EMPTY array is refused rather than tolerated: `mustRefuse: []` reads as "this policy has a refusal
  // arm" while proving nothing, which is the declared-limit-shaped lie the arm exists to replace.
  for (const arm of POLICY_PROOF_ARMS) {
    if (OPTIONAL_POLICY_KEYS.has(arm) && !Object.hasOwn(policy, arm)) {
      continue;
    }
    assertProofArm(policy[arm], policy["analysis"] as GatePolicyAnalysis, arm, policy["authority"] as GateAuthority);
  }
  assertReviewedGrantWitness(value as GatePolicy);
}

function assertReviewedGrantWitness(policy: GatePolicy): void {
  const witnessFailure = reviewedGrantWitnessFailure(policy);
  if (witnessFailure !== null) {
    invalid(witnessFailure);
  }
}

function assertVisitors(value: unknown): void {
  if (!Array.isArray(value) || value.length === 0) {
    invalid("create result visitors must be a nonempty array when present");
  }
  for (const [index, candidate] of value.entries()) {
    const visitor = record(candidate, `visitor[${index}]`);
    exactKeys(visitor, VISITOR_KEYS, `visitor[${index}]`);
    const kinds = visitor["kinds"];
    if (
      !Array.isArray(kinds) ||
      kinds.length === 0 ||
      kinds.some((kind) => !(Number.isInteger(kind) && (kind as number) > SyntaxKind.Unknown && (kind as number) < SyntaxKind.Count))
    ) {
      invalid(`visitor[${index}].kinds must be a nonempty SyntaxKind array`);
    }
    if (new Set(kinds).size !== kinds.length) {
      invalid(`visitor[${index}].kinds must be unique`);
    }
    if (typeof visitor["visit"] !== "function") {
      invalid(`visitor[${index}].visit must be a function`);
    }
  }
}

function assertOptionalHook(value: unknown, label: "visitFile" | "evaluate"): void {
  if (value !== undefined && typeof value !== "function") {
    invalid(`create result ${label} must be a function`);
  }
}

export function assertGatePolicyHooks(value: unknown): asserts value is GatePolicyHooks {
  const hooks = record(value, "create result");
  exactKeys(hooks, HOOK_KEYS, "create result");
  if (hooks["visitors"] !== undefined) {
    assertVisitors(hooks["visitors"]);
  }
  for (const key of ["visitFile", "evaluate"] as const) {
    assertOptionalHook(hooks[key], key);
  }
  if (hooks["visitors"] === undefined && hooks["visitFile"] === undefined && hooks["evaluate"] === undefined) {
    invalid("create result must expose at least one hook");
  }
}

export function assertGateFactHooks(value: unknown): asserts value is GateFactHooks<unknown> {
  const hooks = record(value, "fact create result");
  exactKeys(hooks, FACT_HOOK_KEYS, "fact create result");
  if (hooks["visitors"] !== undefined) {
    assertVisitors(hooks["visitors"]);
  }
  assertOptionalHook(hooks["visitFile"], "visitFile");
  if (typeof hooks["finish"] !== "function") {
    invalid("fact create result finish must be a function");
  }
}
