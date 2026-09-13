// Fail-closed runtime validation shared by policy loading and invocation boundaries.

import { SyntaxKind } from "ts-morph";
import type { GateFact, GateFactHooks } from "../contract/fact.ts";
import { isDefinedGateFact } from "../contract/fact.ts";
import type { GateAuthority } from "../contract/gate-authority.ts";
import { GATE_AUTHORITIES, GATE_SEVERITIES } from "../contract/gate-authority.ts";
import type { GatePolicy, GatePolicyHooks, GatePolicyProof, GatePolicyProofMode, PolicyField, PolicyProofArm } from "../contract/policy.ts";
import {
  GATE_POLICY_EXECUTIONS,
  GATE_POLICY_PROOF_MODES,
  POLICY_EXPECTATION_KEYS,
  POLICY_FIELDS,
  POLICY_HOOK_KEYS,
  POLICY_OPTIONAL_FIELDS,
  POLICY_PROOF_ARMS,
  POLICY_PROOF_GRANT_KEYS,
  POLICY_PROOF_KEYS,
} from "../contract/policy.ts";
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
import { genericRefusalTextContaining } from "./policy-refusal-envelope.ts";
import { isPolicySourceCandidate } from "./policy-source-candidate.ts";
import { assertPopulationExpr } from "./population-resolver.ts";

// The key sets DERIVE from the contract's vocabularies (`contract/policy.ts`, one table per vocabulary, held
// two-sided against the interfaces by `tsc`): a field, arm or key added there is refused, required and admitted
// here with no second edit (#2111).
const POLICY_KEYS: ReadonlySet<string> = new Set(POLICY_FIELDS);
const OPTIONAL_POLICY_KEYS: ReadonlySet<PolicyField> = new Set(POLICY_OPTIONAL_FIELDS);
const REQUIRED_POLICY_KEYS: readonly PolicyField[] = POLICY_FIELDS.filter((field) => !OPTIONAL_POLICY_KEYS.has(field));
const PROOF_KEYS: ReadonlySet<string> = new Set(POLICY_PROOF_KEYS);
const PROOF_GRANT_KEYS: ReadonlySet<string> = new Set(POLICY_PROOF_GRANT_KEYS);
const EXPECT_KEYS: ReadonlySet<string> = new Set(POLICY_EXPECTATION_KEYS);
const HOOK_KEYS: ReadonlySet<string> = new Set(POLICY_HOOK_KEYS);
const VISITOR_KEYS = new Set(["kinds", "visit"]);
const KEBAB_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const ASCII_C0_MAX = 0x1f;
const ASCII_DELETE = 0x7f;
const RESOURCE_KEYS = new Set(["kind", "id"]);
const RESOURCE_KIND_ONLY_KEYS = new Set(["kind"]);
const INSTALLED_KEYS = new Set(["kind", "id", "mode"]);
const INSTALLED_TEXT_KEYS = new Set(["kind", "id", "mode", "file"]);
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
  if (Object.hasOwn(expectation, "count") && !(Number.isInteger(expectation["count"]) && (expectation["count"] as number) > 0)) {
    invalid(`${label}.count must be a positive integer`);
  }
  if (Object.hasOwn(expectation, "line") && !(Number.isInteger(expectation["line"]) && (expectation["line"] as number) > 0)) {
    invalid(`${label}.line must be a positive integer`);
  }
  for (const key of ["token", "messageIncludes", "countFrom"] as const) {
    if (Object.hasOwn(expectation, key)) {
      nonBlank(expectation[key], `${label}.${key}`);
    }
  }
  // A row declares its count EITHER as a literal OR as the registry constant that drives it, never both —
  // two answers to one question is the shape where the pair silently disagrees (#2001).
  if (Object.hasOwn(expectation, "count") && Object.hasOwn(expectation, "countFrom")) {
    invalid(`${label} declares both count and countFrom — a row names the literal or the constant driving it, not both`);
  }
}

/** A link is only expressible on a real filesystem, so it is `resource` mode only; its PATH is a repo
 *  identity while its TARGET is left free, because an escaping target is the thing under test. A link may
 *  not collide with a declared file — the runtime would then have written one and linked the other, and the
 *  resulting proof would describe whichever won.
 *
 *  Nor may a link be an ANCESTOR of another declared destination (#2333). A free target means a link can
 *  point outside the fixture root, and `ops/policy-conformance.ts` creates each later destination by
 *  resolving its parent directories on disk — so `links: { a: "/outside", "a/b": "x" }` would create
 *  `/outside/b`. Lexical grammar alone cannot see that; the segment relation between declared keys can. */
function assertProofLinks(proof: Readonly<Record<string, unknown>>, label: string, files: Readonly<Record<string, unknown>>): void {
  if (!Object.hasOwn(proof, "links")) {
    return;
  }
  if (proof["mode"] !== "resource") {
    invalid(`${label}.links is valid only in resource mode`);
  }
  const links = record(proof["links"], `${label}.links`);
  const entries = Object.entries(links);
  if (entries.length === 0) {
    invalid(`${label}.links must be a nonempty path-to-target map when present`);
  }
  for (const [path, target] of entries) {
    assertRepoPathIdentity(path, `${label}.links path`);
    nonBlank(target, `${label}.links target`);
    if (Object.hasOwn(files, path)) {
      invalid(`${label}.links path is also a declared file: ${path}`);
    }
  }
  for (const destination of [...Object.keys(files), ...Object.keys(links)]) {
    const ancestor = Object.keys(links).find((path) => destination.startsWith(`${path}/`));
    if (ancestor !== undefined) {
      invalid(`${label}.links path ${ancestor} is an ancestor of declared destination ${destination}`);
    }
  }
}

/** The `mustRefuse` expectation is the INVERSE of the other two arms': the pass produces no findings at all,
 *  so finding counts and coordinates have nothing to describe, and `messageIncludes` is the only thing that can
 *  discriminate a fired refusal from an unreachable branch. Requiring it here — at load, for every row — is
 *  what stops the arm becoming the sanctioned home for a proof that passes either way (#1977).
 *
 *  AND THE SUBSTRING MUST NAME THE POLICY'S OWN REFUSAL, NOT THE RUNNER'S WRAPPER (#2111, #2109 item 3). The
 *  runner proves the row by `refusal.includes(messageIncludes)` over a text it wraps in its own words, so a
 *  needle that sits inside a GENERIC piece — `"ERROR"` in `PASS TOOL ERROR`, `"[evaluate]"`, `"OWNER"`,
 *  `"resolved zero members"` — holds on ANY refusal of that shape and proves nothing about this policy. The
 *  envelope is derived from the same contract constants the runner and the dispatcher compose from
 *  (`lib/policy-refusal-envelope.ts`), so the refusal here cannot drift from the text out there. */
function assertRefusalExpectation(value: unknown, label: string): void {
  const expectation = record(value, label);
  exactKeys(expectation, EXPECT_KEYS, label);
  for (const key of POLICY_EXPECTATION_KEYS) {
    if (key !== "messageIncludes" && Object.hasOwn(expectation, key)) {
      invalid(`${label}.${key} is forbidden for a mustRefuse proof; a refusal reports no finding to describe`);
    }
  }
  nonBlank(expectation["messageIncludes"], `${label}.messageIncludes`);
  const generic = genericRefusalTextContaining(expectation["messageIncludes"] as string);
  if (generic !== undefined) {
    invalid(
      `${label}.messageIncludes names only the runner's generic refusal text (${JSON.stringify(expectation["messageIncludes"])} sits inside ${JSON.stringify(generic)}), which every refusal of that shape carries — name the text this policy's OWN refusal emits`,
    );
  }
}

/** THE REVIEWED-GRANT IDENTITY WITNESS (#2189, P7). The annotation is only meaningful where all three of its
 *  premises hold, so each is refused by name rather than being tolerated as a no-op:
 *
 *  - a `mustFlag` row, because the witness is a SECOND verdict over a fixture that already produced the finding;
 *    a `mustPass` row reports nothing to bind and a `mustRefuse` row never reaches the authority coordinator;
 *  - a `reviewed-grant` policy, because `hard` has no suppression door at all and `ordinary` consumes markers,
 *    not grants (`lib/gate-authority.ts#processPolicy` never routes either into `processReviewed`);
 *  - nonblank AUTHORED strings, because the runner mints its grant from THESE and a blank one would be refused
 *    by `isGateAuthorityIdentity` inside the run, turning an authoring mistake into a confusing grant tool error
 *    instead of a load refusal naming the row.
 *
 *  DECLARED MEANS OWN-PROPERTY PRESENT, never "holds a defined value" (#2189 L3, sec-p7 review). Every other
 *  admission rule in this file already reads presence — `exactKeys`, the mustRefuse expectation rule, the
 *  optional-arm rule, `workItem` — and an own `grant: undefined` reaching this rule through the `as never` cast
 *  hand-built descriptors use was silently ADMITTED on the forbidden arms while `grant: {…}` was refused by name.
 *  It is not a witness either way (`reviewedGrantWitnessFailure` filters on a defined value), so refusing the
 *  declaration is what makes the two halves of the rule say the same thing. */
function assertProofGrant(proof: Readonly<Record<string, unknown>>, label: string, authority: GateAuthority, isMustFlagRow: boolean): void {
  if (!Object.hasOwn(proof, "grant")) {
    return;
  }
  if (!isMustFlagRow) {
    invalid(`${label}.grant is valid only for a mustFlag proof — a reviewed-grant identity is a second verdict over a row that already reports a finding`);
  }
  if (authority !== "reviewed-grant") {
    invalid(`${label}.grant is valid only for a reviewed-grant policy, and descriptor.authority is ${JSON.stringify(authority)}, which has no grant door`);
  }
  const grant = record(proof["grant"], `${label}.grant`);
  exactKeys(grant, PROOF_GRANT_KEYS, `${label}.grant`);
  for (const key of POLICY_PROOF_GRANT_KEYS) {
    nonBlank(grant[key], `${label}.grant.${key}`);
  }
}

/** The descriptor context one row is judged in. It carries the ARM rather than a pair of booleans because two
 *  rules now key off it (expectation admission and the #2189 grant witness) and a third would otherwise be a
 *  fourth positional flag; `arm` also replaces the `label.startsWith("mustRefuse")` string test, which was the
 *  arm identity travelling as prose. */
interface ProofRowContext {
  readonly arm: PolicyProofArm;
  readonly authority: GateAuthority;
}

function assertProof(value: unknown, analysis: GatePolicyAnalysis, label: string, context: ProofRowContext): asserts value is GatePolicyProof {
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
  assertProofLinks(proof, label, files);
  assertProofGrant(proof, label, context.authority, context.arm === "mustFlag");
  if (context.arm === "mustRefuse") {
    // The one REQUIREMENT rule here, so it reads the value rather than the key: an own `expect: undefined` is a
    // missing expectation whichever way it is spelled, and this message names the omission the author made.
    if (proof["expect"] === undefined) {
      invalid(`${label}.expect.messageIncludes is required for a mustRefuse proof`);
    }
    assertRefusalExpectation(proof["expect"], `${label}.expect`);
    return;
  }
  if (Object.hasOwn(proof, "expect")) {
    if (context.arm !== "mustFlag") {
      invalid(`${label}.expect is valid only for mustFlag proofs`);
    }
    assertExpectation(proof["expect"], `${label}.expect`);
  }
}

function assertProofArm(value: unknown, analysis: GatePolicyAnalysis, label: PolicyProofArm, authority: GateAuthority): void {
  if (!Array.isArray(value) || value.length === 0) {
    invalid(`${label} must contain at least one explicit proof example`);
  }
  for (const [index, proof] of value.entries()) {
    assertProof(proof, analysis, `${label}[${index}]`, { arm: label, authority });
  }
}

/** Every reviewed-grant policy owes at least one mustFlag identity witness. Additional witnesses prove
 *  additional identities and remain legal. Called by the descriptor validator at every loading boundary. */
function reviewedGrantWitnessFailure(policy: GatePolicy): string | null {
  if (policy.authority !== "reviewed-grant") {
    return null;
  }
  return policy.mustFlag.some((proof) => proof.grant !== undefined)
    ? null
    : `descriptor.mustFlag carries no grant identity witness, and ${JSON.stringify(policy.id)} is a reviewed-grant policy — nothing proves its emitted (subject, operation) can bind a central grant row (#2189, gate-runtime-standardization.md §4.3). Add \`grant: { subject, operation }\` to the mustFlag row whose finding carries the identity a grant would name.`;
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
