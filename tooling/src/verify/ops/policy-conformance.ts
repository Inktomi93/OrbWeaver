// Runs every final policy proof through runPolicyPass on an isolated example population.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import type { SourceFile } from "ts-morph";
import { Project } from "ts-morph";
import type { CoordinatedGateFinding, ReviewedGateGrant } from "../contract/gate-authority.ts";
import type { GatePolicy, GatePolicyProof, GatePolicyProofExpectation, GatePolicyProofGrant } from "../contract/policy.ts";
import { isDefinedGatePolicy } from "../contract/policy.ts";
import type { PolicyConformanceFailure, PolicyProofArm } from "../contract/policy-conformance.ts";
import { POLICY_REFUSAL_PREFIXES } from "../contract/policy-conformance.ts";
import type { PolicyPassResult } from "../contract/policy-pass.ts";
import type { ResourceHostOptions } from "../contract/resource-host.ts";
import { declaresModuleName } from "../lib/policy-descriptor-read.ts";
import { runPolicyPass } from "../lib/policy-pass.ts";
import { policyProofRows } from "../lib/policy-proof-rows.ts";
import { isPolicySourceCandidate } from "../lib/policy-source-candidate.ts";
import { assertGatePolicyDescriptor } from "../lib/policy-validation.ts";
import { ROOT, repoGitEnvironment } from "../lib/repo-paths.ts";

refuseDirectInvocation(import.meta.url, "pnpm test:scoped tests/tooling/verify/ops/policy-conformance.test.ts");

const countFromProject = new Project({ useInMemoryFileSystem: true });
const VIRTUAL_ROOT = "/orb-policy-conformance";
/** The resource-proof temp root names its OWNING PROCESS. `tmpdir()` is a SHARED namespace — every
 *  checkout on the box mkdtemps into the same directory — so a census over `orb-policy-conformance-*`
 *  answers a question about the BOX, not about this run. Measured 2026-09-12: the leak assertion in
 *  `tests/tooling/verify/ops/policy-conformance.test.ts` went red against a sibling worktree's concurrent
 *  conformance run, with a temp root that was gone seconds later, then passed alone and on re-run — an
 *  instrument reporting a defect from LOAD. With the pid in the name the census is scoped to the process
 *  that owns the roots, which is the only process whose cleanup it can speak for. */
export const POLICY_CONFORMANCE_TEMP_PREFIX = `orb-policy-conformance-${String(process.pid)}-`;
/** The reader's own non-authored vocabulary (`ops/resource-reader.ts`), in path-segment form. */
const NON_AUTHORED_SEGMENT_RE = /(?:^|\/)(?:node_modules|\.git|dist|\.cache)(?:\/|$)/u;

interface ExampleRun {
  readonly result?: PolicyPassResult;
  readonly thrown?: string;
  readonly root: string;
}

interface ProofRunInput {
  readonly policy: GatePolicy;
  readonly arm: PolicyProofArm;
  readonly proof: GatePolicyProof;
  readonly exampleIndex: number;
  readonly sequence: number;
  readonly shared: Project;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The policy modules already parsed for a `countFrom` resolution, by repo-relative path. Reading a module is
 *  per-POLICY work, not per-row, and a corpus run asks the same question once per module at most. */
const countFromModules = new Map<string, SourceFile | undefined>();

function policyModule(path: string, project: Project): SourceFile | undefined {
  if (countFromModules.has(path)) {
    return countFromModules.get(path);
  }
  const absolute = join(ROOT, path);
  // ABSENT is the ROW's failure and is reported as one below. UNREADABLE is a TOOL error and propagates
  // deliberately: a conformance run that could not read the corpus it is judging is not a verdict.
  const sourceFile = existsSync(absolute) ? project.createSourceFile(`/orb-countfrom/${path}`, readFileSync(absolute, "utf8"), { overwrite: true }) : undefined;
  countFromModules.set(path, sourceFile);
  return sourceFile;
}

/** `expect.countFrom` is a DECLARED EXEMPTION and it reds when the thing it declares is not there (#2001).
 *  The runner cannot compute the count a registry drives — that is the whole reason the row exists — so what
 *  it proves is the exemption's honesty: the named driver is a real module-level binding in the policy's own
 *  module. A name that does not resolve is a row back to asserting only "at least one finding", wearing an
 *  exemption's clothes. `id` equals the filename by contract (`lib/policy-validation.ts`). */
function countFromFailure(policy: GatePolicy, expectation: GatePolicyProofExpectation | undefined): string | null {
  const name = expectation?.countFrom;
  if (name === undefined) {
    return null;
  }
  const path = `tooling/src/verify/gates/${policy.id}.ts`;
  const sourceFile = policyModule(path, countFromProject);
  if (sourceFile === undefined) {
    return `expect.countFrom names ${name} but the policy module ${path} could not be read`;
  }
  return declaresModuleName(sourceFile, name) ? null : `expect.countFrom names ${name}, which ${path} declares nowhere at module scope`;
}

function removeSources(project: Project): void {
  for (const sourceFile of project.getSourceFiles()) {
    project.removeSourceFile(sourceFile);
  }
}

/** ONE MATERIALIZED FIXTURE, N PASSES — the reason the substrate runners take a LIST of grant sets and return a
 *  LIST of runs (#2189). The reviewed-grant identity verdict is a SECOND pass over the SAME input with a grant
 *  supplied, and "the same input" has to mean the same bytes on the same substrate: a re-materialized `resource`
 *  root is a different directory with a different git index, so two verdicts taken across two roots would be two
 *  verdicts about two inputs. {@link NO_GRANTS} — one pass, no grants — is the default every unannotated row
 *  still gets, and it is byte-identical to the single-pass behaviour that preceded this. */
type GrantSets = readonly (readonly ReviewedGateGrant[])[];
const NO_GRANTS: GrantSets = [[]];

/** One materialized fixture, ready to be passed over. `resourceOptions` is absent for the virtual substrates. */
interface PassTarget {
  readonly policy: GatePolicy;
  readonly root: string;
  readonly project: Project;
  readonly resourceOptions?: Omit<ResourceHostOptions, "root">;
}

function runPass({ policy, root, project, resourceOptions }: PassTarget, reviewedGrants: readonly ReviewedGateGrant[] = []): PolicyPassResult {
  return runPolicyPass({
    knownPolicies: [policy],
    policies: [policy],
    root,
    project,
    reviewedGrants,
    failOnWarnings: false,
    ...(resourceOptions === undefined ? {} : { resourceOptions }),
  });
}

function runPasses(target: PassTarget, grantSets: GrantSets): ExampleRun[] {
  return grantSets.map((reviewedGrants) => {
    try {
      return { result: runPass(target, reviewedGrants), root: target.root };
    } catch (error) {
      return { thrown: messageOf(error), root: target.root };
    }
  });
}

/** One example's whole request: which policy, which row, on which shared project, at which sequence, under which
 *  grant sets. Bundled because the substrate runners now carry five inputs, and a positional fifth with a default
 *  is exactly how a caller silently swaps it with its neighbour. */
interface ExampleInput {
  readonly policy: GatePolicy;
  readonly proof: GatePolicyProof;
  readonly shared: Project;
  readonly sequence: number;
  readonly grantSets?: GrantSets;
}

function runVirtualExample({ policy, proof, shared, sequence, grantSets = NO_GRANTS }: ExampleInput): ExampleRun[] {
  removeSources(shared);
  const root = `${VIRTUAL_ROOT}-${sequence}`;
  try {
    for (const [path, content] of Object.entries(proof.files).toSorted(([left], [right]) => left.localeCompare(right))) {
      shared.createSourceFile(`${root}/${path}`, content);
    }
    return runPasses({ policy, root, project: shared }, grantSets);
  } catch (error) {
    return [{ thrown: messageOf(error), root }];
  } finally {
    removeSources(shared);
  }
}

function runResourceExample({ policy, proof, grantSets = NO_GRANTS }: Omit<ExampleInput, "shared" | "sequence">): ExampleRun[] {
  const root = mkdtempSync(join(tmpdir(), POLICY_CONFORMANCE_TEMP_PREFIX));
  try {
    const project = new Project({ skipAddingFilesFromTsConfig: true });
    for (const [path, content] of Object.entries(proof.files).toSorted(([left], [right]) => left.localeCompare(right))) {
      const absolute = join(root, path);
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, content);
      if (isPolicySourceCandidate(path)) {
        project.addSourceFileAtPath(absolute);
      }
    }
    // Links are created AFTER every file, so a link may point at a fixture file, and are never added to the
    // Project: a symlink is a subject for the resource doors, not a compiler input.
    for (const [path, target] of Object.entries(proof.links ?? {}).toSorted(([left], [right]) => left.localeCompare(right))) {
      const absolute = join(root, path);
      mkdirSync(dirname(absolute), { recursive: true });
      symlinkSync(target, absolute);
    }
    // Resource proofs own their index, including native config and tracked-file consumers.
    const env = repoGitEnvironment();
    for (const args of [
      ["init", "--quiet"],
      ["add", "--all"],
    ]) {
      const git = runNicedSync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd: root, env });
      if (git.status !== 0) {
        throw new Error(`proof Git ${args[0]} failed: ${git.stderr.trim()}`);
      }
    }
    const parser = new Project({ useInMemoryFileSystem: true });
    // The overlay is the AUTHORED transaction, and the reader refuses a non-authored segment outright
    // (`ops/resource-reader.ts`). An `installed-package` fixture legitimately plants `node_modules/…`, which
    // belongs on disk for node's resolver and must NOT enter the overlay — otherwise every such proof dies
    // in host construction rather than in the arm it was written to test.
    const overlay = Object.fromEntries(Object.entries(proof.files).filter(([path]) => !NON_AUTHORED_SEGMENT_RE.test(path)));
    const resourceOptions: Omit<ResourceHostOptions, "root"> = {
      overlay,
      parseSource: (path, text) => parser.createSourceFile(`${root}/${path}`, text, { overwrite: true }),
    };
    return runPasses({ policy, root, project, resourceOptions }, grantSets);
  } catch (error) {
    return [{ thrown: messageOf(error), root }];
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** Every pass the row asked for, in grant-set order, all over ONE materialization. A materialization that throws
 *  yields a SINGLE thrown run whatever was asked for — the fixture never existed, so there is no second verdict to
 *  report about it, and the caller reads the first run's throw as the whole row's failure. */
function runExample(input: ExampleInput): ExampleRun[] {
  const { policy, proof, grantSets } = input;
  return proof.mode === "resource" ? runResourceExample({ policy, proof, ...(grantSets === undefined ? {} : { grantSets }) }) : runVirtualExample(input);
}

function proofIdentities(proof: GatePolicyProof): ReadonlySet<string> {
  const identities = new Set(Object.keys(proof.files));
  if (proof.mode !== "resource") {
    return identities;
  }
  for (const path of Object.keys(proof.files)) {
    const segments = path.split("/");
    while (segments.length > 1) {
      segments.pop();
      identities.add(segments.join("/"));
    }
  }
  return identities;
}

function formatFindingMessages(findings: readonly CoordinatedGateFinding[], policyMessage: string): string {
  return findings.map((finding) => finding.message ?? policyMessage).join("; ");
}

function sanitizeProofRoot(detail: string, root: string): string {
  return detail.split(`${root}/`).join("").split(root).join("<proof-root>");
}

function toolFailure(result: PolicyPassResult, policy: GatePolicy, examplePaths: ReadonlySet<string>): string | null {
  if (result.factErrors.length > 0) {
    return `${POLICY_REFUSAL_PREFIXES.factToolError} ${result.factErrors.map(({ factId, phase, message }) => `[${factId}:${phase}] ${message}`).join("; ")}`;
  }
  if (result.toolErrors.length > 0) {
    return `${POLICY_REFUSAL_PREFIXES.passToolError} ${result.toolErrors.map(({ phase, message }) => `[${phase}] ${message}`).join("; ")}`;
  }
  if (result.authority.toolErrors.length > 0) {
    return `${POLICY_REFUSAL_PREFIXES.authorityToolError} ${result.authority.toolErrors.map(({ kind, message }) => `[${kind}] ${message}`).join("; ")}`;
  }
  if (result.authority.authorityAlarms.length > 0) {
    return `${POLICY_REFUSAL_PREFIXES.authorityAlarm} ${result.authority.authorityAlarms.map(({ kind, message }) => `[${kind}] ${message}`).join("; ")}`;
  }
  const owner = result.policies.find(({ id }) => id === policy.id);
  if (owner === undefined) {
    return POLICY_REFUSAL_PREFIXES.ownerMissing;
  }
  if (owner.owner.status !== "success") {
    const reason = "reason" in owner.owner ? `: ${owner.owner.reason}` : "";
    return `${POLICY_REFUSAL_PREFIXES.owner} ${owner.owner.status}/${owner.owner.population}${reason}`;
  }
  if (result.authority.withheldPolicyIds.includes(policy.id)) {
    return POLICY_REFUSAL_PREFIXES.ownerWithheld;
  }
  const outside = result.authority.effectiveFindings.find(({ file }) => !examplePaths.has(file));
  if (outside !== undefined) {
    return `${POLICY_REFUSAL_PREFIXES.findingOutsideExample} ${outside.file}:${outside.line}:${outside.column}`;
  }
  return null;
}

function expectationFailure(
  findings: readonly CoordinatedGateFinding[],
  expectation: GatePolicyProofExpectation | undefined,
  policyMessage: string,
): string | null {
  if (findings.length === 0) {
    return "expected at least one effective finding but got 0";
  }
  if (expectation === undefined) {
    return null;
  }
  // `countFrom` rows carry no literal to compare — their count is a registry's cardinality and the row says
  // so by name; `countFromFailure` has already proven the name resolves, and the identity fields below are
  // what carry the row (#2001).
  if (expectation.count !== undefined && findings.length !== expectation.count) {
    return `expected effective finding count=${expectation.count} but got ${findings.length}`;
  }
  const { line, token, messageIncludes } = expectation;
  const identity = [
    ...(line === undefined ? [] : [`line=${line}`]),
    ...(token === undefined ? [] : [`token=${JSON.stringify(token)}`]),
    ...(messageIncludes === undefined ? [] : [`messageIncludes=${JSON.stringify(messageIncludes)}`]),
  ];
  if (
    identity.length > 0 &&
    !findings.some(
      (finding) =>
        (line === undefined || finding.line === line) &&
        (token === undefined || finding.token === token) &&
        (messageIncludes === undefined || (finding.message ?? policyMessage).includes(messageIncludes)),
    )
  ) {
    return `expected one effective finding matching ${identity.join(", ")} but no single finding matched`;
  }
  return null;
}

/** THE REFUSAL ARM'S VERDICT, which is the other two arms' INVERTED (#1977).
 *
 *  For `mustFlag`/`mustPass` a refusal is the failure. Here it is the requirement: the row holds when the
 *  pass throws, or reports a tool error / authority alarm / non-success owner status — anything
 *  {@link toolFailure} names — AND that text contains the row's declared `messageIncludes`.
 *
 *  The substring is load-REQUIRED (`lib/policy-validation.ts`) rather than optional here, because a row that
 *  merely demands "something refused" passes on ANY refusal: a fixture that fails to parse, a population that
 *  admits nothing, a resource door that was never wired. Those are the refusals a policy did not design, and
 *  accepting them is how a green arm stops discriminating. */
function refusalFailure(run: ExampleRun, policy: GatePolicy, proof: GatePolicyProof): string | null {
  const refusal = run.thrown ?? (run.result === undefined ? null : toolFailure(run.result, policy, proofIdentities(proof)));
  const expected = proof.expect?.messageIncludes;
  if (refusal === null) {
    const findings = run.result?.authority.effectiveFindings ?? [];
    return `expected the pass to REFUSE but it completed with ${findings.length} effective finding(s)`;
  }
  if (expected === undefined) {
    return "mustRefuse proof has no expect.messageIncludes";
  }
  return refusal.includes(expected) ? null : `expected the refusal to include ${JSON.stringify(expected)} but it was: ${refusal}`;
}

/** The grant the identity run supplies. Its `(subject, operation)` is the row's AUTHORED pair and NOTHING ELSE —
 *  never the identity of the finding the baseline run just produced, which would make the verdict a tautology
 *  that holds for every emitted pair including a typo. The two wrong-identity controls in
 *  `tests/tooling/verify/ops/policy-conformance.test.ts` exist to keep that true. `why`/`endsWhen` are
 *  fixture-only prose: `lib/gate-authority-validation.ts` requires them nonblank and reads no further. */
function identityProofGrant(policy: GatePolicy, identity: GatePolicyProofGrant): ReviewedGateGrant {
  return {
    id: `${policy.id}:conformance-identity-proof`,
    policyId: policy.id,
    subject: identity.subject,
    operation: identity.operation,
    why: "conformance identity proof — the row's authored (subject, operation) must bind this policy's own finding through the production authority path",
    endsWhen: "the mustFlag row drops its grant annotation",
  };
}

/** THE REVIEWED-GRANT IDENTITY VERDICT (#2189, P7), a SECOND verdict over a row whose FIRST verdict already held.
 *
 *  The baseline `mustFlag` pass ran with no reviewed grants and satisfied its own expectation — the detection
 *  proof is untouched. This run replays the same fixture with ONE grant minted from the row's authored identity
 *  and holds only when every part is true together:
 *
 *  - the pass neither threw nor refused ({@link toolFailure} covers tool errors, authority ALARMS, a non-success
 *    owner and withholding — which is where a wrong authored subject or operation lands: the finding matches no
 *    grant, stays effective, and the unused generated row alarms `stale-reviewed-grant`; two findings sharing the
 *    authored identity alarm `over-broad-reviewed-grant` and license nothing, §12.5);
 *  - EXACTLY ONE granted finding, and it is this policy's, under this generated grant;
 *  - ZERO effective findings left for this policy.
 *
 *  Accepting any of those alone is the failure mode this exists to prevent: "one granted" without "zero
 *  effective" is satisfiable by a policy emitting a second unlicensable finding, and "zero effective" without
 *  "one granted" is satisfiable by a policy that stopped flagging at all. */
function grantIdentityFailure(input: ProofRunInput, identity: GatePolicyProofGrant): string | null {
  const { policy, proof, shared, sequence } = input;
  const grant = identityProofGrant(policy, identity);
  const runs = runExample({ policy, proof, shared, sequence, grantSets: [[grant]] });
  const run = runs[0];
  if (run === undefined) {
    return "grant identity run: the substrate produced no run";
  }
  if (run.thrown !== undefined) {
    return `grant identity run: ${POLICY_REFUSAL_PREFIXES.passThrew} ${sanitizeProofRoot(run.thrown, run.root)}`;
  }
  const result = run.result as PolicyPassResult;
  const refusal = toolFailure(result, policy, proofIdentities(proof));
  if (refusal !== null) {
    return `grant identity run for subject=${JSON.stringify(grant.subject)} operation=${JSON.stringify(grant.operation)}: ${sanitizeProofRoot(refusal, run.root)}`;
  }
  const granted = result.authority.grantedFindings.filter(({ finding, grantId }) => finding.policyId === policy.id && grantId === grant.id);
  if (granted.length !== 1) {
    return `grant identity run: expected EXACTLY ONE finding granted by ${grant.id} (subject=${JSON.stringify(grant.subject)}, operation=${JSON.stringify(grant.operation)}) but got ${granted.length}`;
  }
  const effective = result.authority.effectiveFindings.filter(({ policyId }) => policyId === policy.id);
  return effective.length === 0
    ? null
    : `grant identity run: expected ZERO effective findings once the authored identity is granted but got ${effective.length}: ${formatFindingMessages(effective, policy.message)}`;
}

function mustFlagFailure(input: ProofRunInput, result: PolicyPassResult): string | null {
  const { policy, proof } = input;
  const detail = countFromFailure(policy, proof.expect) ?? expectationFailure(result.authority.effectiveFindings, proof.expect, policy.message);
  if (detail !== null || proof.grant === undefined) {
    return detail;
  }
  return grantIdentityFailure(input, proof.grant);
}

function mustPassFailure(findings: readonly CoordinatedGateFinding[], policyMessage: string): string | null {
  return findings.length === 0 ? null : `expected zero effective findings but got ${findings.length}: ${formatFindingMessages(findings, policyMessage)}`;
}

function proofFailure(input: ProofRunInput): PolicyConformanceFailure | null {
  const { policy, arm, proof, exampleIndex, sequence, shared } = input;
  const runs = runExample({ policy, proof, shared, sequence });
  const run = runs[0] ?? { thrown: "the substrate produced no run", root: VIRTUAL_ROOT };
  let detail: string | null;
  if (arm === "mustRefuse") {
    detail = refusalFailure(run, policy, proof);
  } else if (run.thrown !== undefined) {
    detail = `${POLICY_REFUSAL_PREFIXES.passThrew} ${run.thrown}`;
  } else {
    const result = run.result as PolicyPassResult;
    detail = toolFailure(result, policy, proofIdentities(proof));
    if (detail === null) {
      const findings = result.authority.effectiveFindings;
      detail = arm === "mustFlag" ? mustFlagFailure(input, result) : mustPassFailure(findings, policy.message);
    }
  }
  return detail === null ? null : { policyId: policy.id, arm, exampleIndex, why: proof.why, detail: sanitizeProofRoot(detail, run.root) };
}

function invocationPolicies(policies: readonly GatePolicy[]): readonly GatePolicy[] {
  const candidates: unknown = policies;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error("verifyPolicyProofs requires a nonempty policy array");
  }
  const ids = new Set<string>();
  const validated: GatePolicy[] = [];
  for (const candidate of candidates) {
    if (!isDefinedGatePolicy(candidate)) {
      throw new Error("verifyPolicyProofs accepts only policies branded by defineGate");
    }
    assertGatePolicyDescriptor(candidate);
    if (ids.has(candidate.id)) {
      throw new Error(`verifyPolicyProofs received duplicate policy id ${candidate.id}`);
    }
    ids.add(candidate.id);
    validated.push(candidate);
  }
  return validated.toSorted((left, right) => left.id.localeCompare(right.id));
}

/** Verify every policy proof in stable policy/arm/example order. Empty result means every proof holds. */
export function verifyPolicyProofs(policies: readonly GatePolicy[]): readonly PolicyConformanceFailure[] {
  const ordered = invocationPolicies(policies);
  const failures: PolicyConformanceFailure[] = [];
  const shared = new Project({ useInMemoryFileSystem: true });
  let sequence = 0;
  for (const policy of ordered) {
    // Every arm the contract names (`POLICY_PROOF_ARMS`, through the one enumeration in `lib/policy-proof-rows.ts`):
    // `mustRefuse` is OPTIONAL, so an absent arm contributes no row and a corpus in which no module declares one
    // runs byte-identically to before the arm existed.
    for (const { arm, index: exampleIndex, proof } of policyProofRows(policy)) {
      sequence += 1;
      const failure = proofFailure({ policy, arm, proof, exampleIndex, sequence, shared });
      if (failure !== null) {
        failures.push(failure);
      }
    }
  }
  removeSources(shared);
  return failures;
}
