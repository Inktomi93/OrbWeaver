// Fail-closed runtime validation shared by policy loading and invocation boundaries.

import { SyntaxKind } from "ts-morph";
import type { GateFact, GateFactHooks } from "../contract/fact.ts";
import { isDefinedGateFact } from "../contract/fact.ts";
import { GATE_AUTHORITIES, GATE_SEVERITIES } from "../contract/gate-authority.ts";
import type { GatePolicy, GatePolicyHooks, GatePolicyProof, GatePolicyProofMode } from "../contract/policy.ts";
import { GATE_POLICY_EXECUTIONS, GATE_POLICY_PROOF_MODES } from "../contract/policy.ts";
import type { GatePolicyAnalysis } from "../contract/policy-primitives.ts";
import { GATE_POLICY_ANALYSES } from "../contract/policy-primitives.ts";
import type { PopulationExpr } from "../contract/population.ts";
import { NATIVE_CONFIG_RESOURCE_PATHS, PACKAGE_RESOURCE_PATHS, STATIC_CONFIG_RESOURCE_PATHS } from "../contract/resource-config.ts";
import type { GateResourceRequest } from "../contract/resource-declaration.ts";
import { GATE_RESOURCE_REQUEST_KINDS } from "../contract/resource-declaration.ts";
import { AUTHORED_TREE_PATHS } from "../contract/resource-tree.ts";
import { isPolicySourceCandidate } from "./policy-source-candidate.ts";
import { assertPopulationExpr } from "./population-resolver.ts";

const POLICY_KEYS = new Set([
  "id",
  "family",
  "authority",
  "severity",
  "workItem",
  "population",
  "analysis",
  "execution",
  "facts",
  "resources",
  "message",
  "fix",
  "create",
  "mustFlag",
  "mustPass",
]);
const REQUIRED_POLICY_KEYS = [
  "id",
  "family",
  "authority",
  "severity",
  "population",
  "analysis",
  "execution",
  "facts",
  "resources",
  "message",
  "create",
  "mustFlag",
  "mustPass",
] as const;
const PROOF_KEYS = new Set(["mode", "files", "expect", "why"]);
const EXPECT_KEYS = new Set(["count", "line", "token", "messageIncludes"]);
const HOOK_KEYS = new Set(["visitors", "visitFile", "evaluate"]);
const VISITOR_KEYS = new Set(["kinds", "visit"]);
const KEBAB_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const ASCII_C0_MAX = 0x1f;
const ASCII_DELETE = 0x7f;
const RESOURCE_KEYS = new Set(["kind", "id"]);
const RESOURCE_KIND_ONLY_KEYS = new Set(["kind"]);
const FACT_KEYS = new Set(["id", "population", "analysis", "resources", "create"]);
const REQUIRED_FACT_KEYS = ["id", "population", "analysis", "resources", "create"] as const;
const FACT_HOOK_KEYS = new Set(["visitors", "visitFile", "finish"]);

function invalid(detail: string): never {
  throw new Error(`Invalid gate policy: ${detail}`);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalid(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, label: string): void {
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown !== undefined) {
    invalid(`${label} has unknown property ${JSON.stringify(unknown)}`);
  }
}

function nonBlank(value: unknown, label: string): value is string {
  if (typeof value !== "string" || value.trim().length === 0 || hasAsciiControl(value)) {
    invalid(`${label} must be a nonempty control-free string`);
  }
  return true;
}

function hasAsciiControl(value: string): boolean {
  return [...value].some((character) => {
    const point = character.codePointAt(0);
    return point !== undefined && (point <= ASCII_C0_MAX || point === ASCII_DELETE);
  });
}

export function assertRepoPathIdentity(value: unknown, label = "path"): asserts value is string {
  nonBlank(value, label);
  const path = value as string;
  if (path.trim() !== path || path.startsWith("/") || /^[A-Za-z]:\//u.test(path) || path.endsWith("/") || path.includes("\\")) {
    invalid(`${label} must be a repo-relative POSIX file path`);
  }
  if (path.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    invalid(`${label} has an invalid segment`);
  }
}

export function normalizePathSet(values: readonly string[], label: string): readonly string[] {
  if (!Array.isArray(values)) {
    invalid(`${label} must be an array`);
  }
  const normalized: string[] = [];
  for (const value of values) {
    assertRepoPathIdentity(value, label);
    normalized.push(value);
  }
  return [...new Set(normalized)].toSorted();
}

function expectedMode(analysis: GatePolicyAnalysis): GatePolicyProofMode {
  return analysis === "syntax" ? "source" : analysis;
}

function assertExpectation(value: unknown, label: string): void {
  const expectation = record(value, label);
  exactKeys(expectation, EXPECT_KEYS, label);
  if (expectation["count"] !== undefined && !(Number.isInteger(expectation["count"]) && (expectation["count"] as number) > 0)) {
    invalid(`${label}.count must be a positive integer`);
  }
  if (expectation["line"] !== undefined && !(Number.isInteger(expectation["line"]) && (expectation["line"] as number) > 0)) {
    invalid(`${label}.line must be a positive integer`);
  }
  for (const key of ["token", "messageIncludes"] as const) {
    if (expectation[key] !== undefined) {
      nonBlank(expectation[key], `${label}.${key}`);
    }
  }
}

function assertProof(value: unknown, analysis: GatePolicyAnalysis, label: string, allowExpectation: boolean): asserts value is GatePolicyProof {
  const proof = record(value, label);
  exactKeys(proof, PROOF_KEYS, label);
  if (!(GATE_POLICY_PROOF_MODES as readonly unknown[]).includes(proof["mode"])) {
    invalid(`${label}.mode must be source, types, or resource`);
  }
  if (proof["mode"] !== expectedMode(analysis)) {
    invalid(`${label}.mode must match policy analysis ${analysis}`);
  }
  nonBlank(proof["why"], `${label}.why`);
  const files = record(proof["files"], `${label}.files`);
  const entries = Object.entries(files);
  if (entries.length === 0) {
    invalid(`${label}.files must be a nonempty explicit path-to-content map`);
  }
  for (const [path, content] of entries) {
    assertRepoPathIdentity(path, `${label}.files path`);
    if (typeof content !== "string") {
      invalid(`${label}.files content must be a string`);
    }
  }
  if (proof["mode"] !== "resource" && entries.some(([path]) => !isPolicySourceCandidate(path))) {
    invalid(`${label}.files may contain only .ts/.tsx source paths in ${String(proof["mode"])} mode`);
  }
  if (proof["expect"] !== undefined) {
    if (!allowExpectation) {
      invalid(`${label}.expect is valid only for mustFlag proofs`);
    }
    assertExpectation(proof["expect"], `${label}.expect`);
  }
}

function assertProofArm(value: unknown, analysis: GatePolicyAnalysis, label: "mustFlag" | "mustPass"): void {
  if (!Array.isArray(value) || value.length === 0) {
    invalid(`${label} must contain at least one explicit proof example`);
  }
  for (const [index, proof] of value.entries()) {
    assertProof(proof, analysis, `${label}[${index}]`, label === "mustFlag");
  }
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

function resourceIds(kind: GateResourceRequest["kind"]): Readonly<Record<string, string>> | undefined {
  let ids: Readonly<Record<string, string>> | undefined;
  if (kind === "authored-tree") {
    ids = AUTHORED_TREE_PATHS;
  } else if (kind === "package-metadata") {
    ids = PACKAGE_RESOURCE_PATHS;
  } else if (kind === "static-config") {
    ids = STATIC_CONFIG_RESOURCE_PATHS;
  } else if (kind === "native-config") {
    ids = NATIVE_CONFIG_RESOURCE_PATHS;
  }
  return ids;
}

function assertGateResourceDeclaration(candidate: unknown, index: number): string {
  const label = `descriptor.resources[${index}]`;
  const request = record(candidate, label);
  if (!(GATE_RESOURCE_REQUEST_KINDS as readonly unknown[]).includes(request["kind"])) {
    invalid(`${label}.kind is unknown`);
  }
  const kind = request["kind"] as GateResourceRequest["kind"];
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
  if (policy["fix"] !== undefined) {
    nonBlank(policy["fix"], "descriptor.fix");
  }
  if (typeof policy["create"] !== "function") {
    invalid("descriptor.create must be a function");
  }
  assertPopulationExpr(policy["population"]);
  if (isExplicitNone(policy["population"] as PopulationExpr) && policy["analysis"] !== "resource") {
    invalid('population {of:"none"} is valid only for resource analysis');
  }
  assertProofArm(policy["mustFlag"], policy["analysis"] as GatePolicyAnalysis, "mustFlag");
  assertProofArm(policy["mustPass"], policy["analysis"] as GatePolicyAnalysis, "mustPass");
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
