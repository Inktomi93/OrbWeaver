// THE PROOF-ROW GRAMMAR of a final policy descriptor — `mustFlag`/`mustPass`/`mustRefuse` rows, their
// expectations, links and the reviewed-grant witness (#2189) — and the path/fixture-destination primitives
// every validator is built on (`assertRepoPathIdentity`, `normalizePathSet`, the exact-key and nonblank
// checks). Split out of `policy-validation.ts` at the size cap (2026-09-18); it is the LEAF, so the
// primitives live here and the descriptor, fact, resource and hook validators import them. One-way: this
// module imports nothing from `policy-validation.ts`.
import type { GateAuthority } from "../contract/gate-authority.ts";
import type { GatePolicy, GatePolicyProof, GatePolicyProofMode, PolicyProofArm } from "../contract/policy.ts";
import { GATE_POLICY_PROOF_MODES, POLICY_EXPECTATION_KEYS, POLICY_PROOF_GRANT_KEYS, POLICY_PROOF_KEYS } from "../contract/policy.ts";
import type { GatePolicyAnalysis } from "../contract/policy-primitives.ts";
import { genericRefusalTextContaining } from "./policy-refusal-envelope.ts";
import { isPolicySourceCandidate } from "./policy-source-candidate.ts";

const PROOF_KEYS: ReadonlySet<string> = new Set(POLICY_PROOF_KEYS);
const PROOF_GRANT_KEYS: ReadonlySet<string> = new Set(POLICY_PROOF_GRANT_KEYS);
const EXPECT_KEYS: ReadonlySet<string> = new Set(POLICY_EXPECTATION_KEYS);

const ASCII_C0_MAX = 0x1f;
const ASCII_DELETE = 0x7f;

export function invalid(detail: string): never {
  throw new Error(`Invalid gate policy: ${detail}`);
}

export function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalid(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function exactKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, label: string): void {
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown !== undefined) {
    invalid(`${label} has unknown property ${JSON.stringify(unknown)}`);
  }
}

export function nonBlank(value: unknown, label: string): value is string {
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

/** A proof FIXTURE destination that names git's control directory (#2333). Both fixture runners create a
 *  real repository in the fixture root, and the resource runner runs `git add --all` after writing the
 *  fixture, so a `.git/config` destination is repository configuration git obeys, including
 *  `core.fsmonitor`, which it executes. Case-insensitive because `.GIT` is the same directory on a
 *  case-insensitive filesystem. This is a fixture-destination rule only: repo-path identity in general
 *  (`assertRepoPathIdentity`) keeps admitting the segment for its other callers.
 *
 *  MODULE-PRIVATE since #2176 Phase F (2026-09-14). It was exported for the legacy conformance runner
 *  (`ops/conformance.ts:59`), which materialised fs-backed legacy examples on real disk and asked the same
 *  question of each key; that runner is deleted with the descriptor contract, and `assertFixtureDestination`
 *  below is the one caller left. The RULE is unchanged and is still the load-bearing defence
 *  `lib/repo-paths.ts` cites. */
function namesGitControlSegment(path: string): boolean {
  return path.split("/").some((segment) => segment.toLowerCase() === ".git");
}

/** A declared proof destination: a repo-path identity that also names no `.git` control segment. */
function assertFixtureDestination(path: string, label: string): void {
  assertRepoPathIdentity(path, label);
  if (namesGitControlSegment(path)) {
    invalid(`${label} names a .git control segment: ${path}`);
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
    assertFixtureDestination(path, `${label}.links path`);
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
    assertFixtureDestination(path, `${label}.files path`);
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

export function assertProofArm(value: unknown, analysis: GatePolicyAnalysis, label: PolicyProofArm, authority: GateAuthority): void {
  if (!Array.isArray(value) || value.length === 0) {
    invalid(`${label} must contain at least one explicit proof example`);
  }
  for (const [index, proof] of value.entries()) {
    assertProof(proof, analysis, `${label}[${index}]`, { arm: label, authority });
  }
}

/** Every reviewed-grant policy owes at least one mustFlag identity witness. Additional witnesses prove
 *  additional identities and remain legal. Called by the descriptor validator at every loading boundary. */
export function reviewedGrantWitnessFailure(policy: GatePolicy): string | null {
  if (policy.authority !== "reviewed-grant") {
    return null;
  }
  return policy.mustFlag.some((proof) => proof.grant !== undefined)
    ? null
    : `descriptor.mustFlag carries no grant identity witness, and ${JSON.stringify(policy.id)} is a reviewed-grant policy — nothing proves its emitted (subject, operation) can bind a central grant row (#2189, docs/law/gate-runtime-standardization.md §4.3). Add \`grant: { subject, operation }\` to the mustFlag row whose finding carries the identity a grant would name.`;
}
