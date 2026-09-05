// Fail-closed runtime validation shared by policy loading and invocation boundaries.

import { SyntaxKind } from "ts-morph";
import { GATE_AUTHORITIES, GATE_SEVERITIES } from "../contract/gate-authority.ts";
import type { GatePolicy, GatePolicyAnalysis, GatePolicyHooks, GatePolicyProof, GatePolicyProofMode } from "../contract/policy.ts";
import { GATE_POLICY_ANALYSES, GATE_POLICY_EXECUTIONS, GATE_POLICY_PROOF_MODES } from "../contract/policy.ts";
import type { PopulationExpr } from "../contract/population.ts";
import { assertPopulationExpr } from "./population-resolver.ts";

const POLICY_KEYS = new Set([
  "id",
  "family",
  "authority",
  "severity",
  "population",
  "analysis",
  "execution",
  "message",
  "fix",
  "create",
  "mustFlag",
  "mustPass",
]);
const PROOF_KEYS = new Set(["mode", "files", "expect", "why"]);
const EXPECT_KEYS = new Set(["count", "line", "token", "messageIncludes"]);
const HOOK_KEYS = new Set(["visitors", "visitFile", "evaluate"]);
const VISITOR_KEYS = new Set(["kinds", "visit"]);
const KEBAB_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const TS_SOURCE_RE = /\.tsx?$/u;
const ASCII_C0_MAX = 0x1f;
const ASCII_DELETE = 0x7f;

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

function assertProof(value: unknown, analysis: GatePolicyAnalysis, label: string): asserts value is GatePolicyProof {
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
  if (proof["mode"] === "resource") {
    if (!entries.some(([path]) => !TS_SOURCE_RE.test(path))) {
      invalid(`${label}.files must include an explicit non-TypeScript resource path`);
    }
  } else if (entries.some(([path]) => !TS_SOURCE_RE.test(path))) {
    invalid(`${label}.files may contain only .ts/.tsx source paths in ${String(proof["mode"])} mode`);
  }
  if (proof["expect"] !== undefined) {
    assertExpectation(proof["expect"], `${label}.expect`);
  }
}

function assertProofArm(value: unknown, analysis: GatePolicyAnalysis, label: "mustFlag" | "mustPass"): void {
  if (!Array.isArray(value) || value.length === 0) {
    invalid(`${label} must contain at least one explicit proof example`);
  }
  for (const [index, proof] of value.entries()) {
    assertProof(proof, analysis, `${label}[${index}]`);
  }
}

function isExplicitNone(population: PopulationExpr): boolean {
  return typeof population === "object" && !Array.isArray(population) && "of" in population && population.of === "none";
}

export function assertGatePolicyDescriptor(value: unknown): asserts value is GatePolicy {
  const policy = record(value, "descriptor");
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
  if (!(GATE_POLICY_ANALYSES as readonly unknown[]).includes(policy["analysis"])) {
    invalid("descriptor.analysis is required and invalid");
  }
  if (!(GATE_POLICY_EXECUTIONS as readonly unknown[]).includes(policy["execution"])) {
    invalid("descriptor.execution is required and invalid");
  }
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
