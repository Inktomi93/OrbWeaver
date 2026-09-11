// Runs every final policy proof through runPolicyPass on an isolated example population.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { Project } from "ts-morph";
import type { CoordinatedGateFinding } from "../contract/gate-authority.ts";
import type { GatePolicy, GatePolicyProof, GatePolicyProofExpectation } from "../contract/policy.ts";
import { isDefinedGatePolicy } from "../contract/policy.ts";
import type { PolicyConformanceFailure, PolicyProofArm } from "../contract/policy-conformance.ts";
import type { PolicyPassResult } from "../contract/policy-pass.ts";
import type { ResourceHostOptions } from "../contract/resource-host.ts";
import { runPolicyPass } from "../lib/policy-pass.ts";
import { isPolicySourceCandidate } from "../lib/policy-source-candidate.ts";
import { assertGatePolicyDescriptor } from "../lib/policy-validation.ts";
import { repoGitEnvironment } from "../lib/repo-paths.ts";

refuseDirectInvocation(import.meta.url, "pnpm test:scoped tests/tooling/verify/ops/policy-conformance.test.ts");

const VIRTUAL_ROOT = "/orb-policy-conformance";
const TEMP_PREFIX = "orb-policy-conformance-";

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

function removeSources(project: Project): void {
  for (const sourceFile of project.getSourceFiles()) {
    project.removeSourceFile(sourceFile);
  }
}

function runPass(policy: GatePolicy, root: string, project: Project, resourceOptions?: Omit<ResourceHostOptions, "root">): PolicyPassResult {
  return runPolicyPass({
    knownPolicies: [policy],
    policies: [policy],
    root,
    project,
    reviewedGrants: [],
    failOnWarnings: false,
    ...(resourceOptions === undefined ? {} : { resourceOptions }),
  });
}

function runVirtualExample(policy: GatePolicy, proof: GatePolicyProof, shared: Project, sequence: number): ExampleRun {
  removeSources(shared);
  const root = `${VIRTUAL_ROOT}-${sequence}`;
  try {
    for (const [path, content] of Object.entries(proof.files).toSorted(([left], [right]) => left.localeCompare(right))) {
      shared.createSourceFile(`${root}/${path}`, content);
    }
    return { result: runPass(policy, root, shared), root };
  } catch (error) {
    return { thrown: messageOf(error), root };
  } finally {
    removeSources(shared);
  }
}

function runResourceExample(policy: GatePolicy, proof: GatePolicyProof): ExampleRun {
  const root = mkdtempSync(join(tmpdir(), TEMP_PREFIX));
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
    const resourceOptions: Omit<ResourceHostOptions, "root"> = {
      overlay: proof.files,
      parseSource: (path, text) => parser.createSourceFile(`${root}/${path}`, text, { overwrite: true }),
    };
    return { result: runPass(policy, root, project, resourceOptions), root };
  } catch (error) {
    return { thrown: messageOf(error), root };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runExample(policy: GatePolicy, proof: GatePolicyProof, shared: Project, sequence: number): ExampleRun {
  return proof.mode === "resource" ? runResourceExample(policy, proof) : runVirtualExample(policy, proof, shared, sequence);
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
    return `FACT TOOL ERROR ${result.factErrors.map(({ factId, phase, message }) => `[${factId}:${phase}] ${message}`).join("; ")}`;
  }
  if (result.toolErrors.length > 0) {
    return `PASS TOOL ERROR ${result.toolErrors.map(({ phase, message }) => `[${phase}] ${message}`).join("; ")}`;
  }
  if (result.authority.toolErrors.length > 0) {
    return `AUTHORITY TOOL ERROR ${result.authority.toolErrors.map(({ kind, message }) => `[${kind}] ${message}`).join("; ")}`;
  }
  if (result.authority.authorityAlarms.length > 0) {
    return `AUTHORITY ALARM ${result.authority.authorityAlarms.map(({ kind, message }) => `[${kind}] ${message}`).join("; ")}`;
  }
  const owner = result.policies.find(({ id }) => id === policy.id);
  if (owner === undefined) {
    return "OWNER RESULT missing";
  }
  if (owner.owner.status !== "success") {
    const reason = "reason" in owner.owner ? `: ${owner.owner.reason}` : "";
    return `OWNER ${owner.owner.status}/${owner.owner.population}${reason}`;
  }
  if (result.authority.withheldPolicyIds.includes(policy.id)) {
    return "OWNER complete result was withheld by authority coordination";
  }
  const outside = result.authority.effectiveFindings.find(({ file }) => !examplePaths.has(file));
  if (outside !== undefined) {
    return `FINDING OUTSIDE EXAMPLE ${outside.file}:${outside.line}:${outside.column}`;
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

function proofFailure({ policy, arm, proof, exampleIndex, sequence, shared }: ProofRunInput): PolicyConformanceFailure | null {
  const run = runExample(policy, proof, shared, sequence);
  let detail: string | null;
  if (run.thrown !== undefined) {
    detail = `PASS THREW ${run.thrown}`;
  } else {
    const result = run.result as PolicyPassResult;
    detail = toolFailure(result, policy, proofIdentities(proof));
    if (detail === null) {
      const findings = result.authority.effectiveFindings;
      if (arm === "mustFlag") {
        detail = expectationFailure(findings, proof.expect, policy.message);
      } else {
        detail =
          findings.length === 0 ? null : `expected zero effective findings but got ${findings.length}: ${formatFindingMessages(findings, policy.message)}`;
      }
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
    for (const arm of ["mustFlag", "mustPass"] as const) {
      for (const [exampleIndex, proof] of policy[arm].entries()) {
        sequence += 1;
        const failure = proofFailure({ policy, arm, proof, exampleIndex, sequence, shared });
        if (failure !== null) {
          failures.push(failure);
        }
      }
    }
  }
  removeSources(shared);
  return failures;
}
