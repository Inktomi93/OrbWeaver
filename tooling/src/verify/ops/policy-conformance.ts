// Runs every final policy proof through runPolicyPass on an isolated example population.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Project } from "ts-morph";
import type { CoordinatedGateFinding } from "../contract/gate-authority.ts";
import type { GatePolicy, GatePolicyProof, GatePolicyProofExpectation } from "../contract/policy.ts";
import type { PolicyConformanceFailure, PolicyProofArm } from "../contract/policy-conformance.ts";
import type { PolicyPassResult } from "../contract/policy-pass.ts";
import { runPolicyPass } from "../lib/policy-pass.ts";
import { assertGatePolicyDescriptor } from "../lib/policy-validation.ts";

const TS_SOURCE_RE = /\.tsx?$/u;
const VIRTUAL_ROOT = "/orb-policy-conformance";
const TEMP_PREFIX = "orb-policy-conformance-";
let exampleSequence = 0;

interface ExampleRun {
  readonly result?: PolicyPassResult;
  readonly thrown?: string;
}

interface ProofRunInput {
  readonly policy: GatePolicy;
  readonly arm: PolicyProofArm;
  readonly proof: GatePolicyProof;
  readonly exampleIndex: number;
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

function runPass(policy: GatePolicy, root: string, project: Project, resourcePaths: readonly string[]): PolicyPassResult {
  return runPolicyPass({
    policies: [policy],
    root,
    project,
    reviewedGrants: [],
    failOnWarnings: false,
    ...(resourcePaths.length === 0 ? {} : { resourcePathsByPolicy: new Map([[policy.id, resourcePaths]]) }),
  });
}

function runVirtualExample(policy: GatePolicy, proof: GatePolicyProof, shared: Project): ExampleRun {
  removeSources(shared);
  exampleSequence += 1;
  const root = `${VIRTUAL_ROOT}-${exampleSequence}`;
  try {
    for (const [path, content] of Object.entries(proof.files).toSorted(([left], [right]) => left.localeCompare(right))) {
      shared.createSourceFile(`${root}/${path}`, content);
    }
    return { result: runPass(policy, root, shared, []) };
  } catch (error) {
    return { thrown: messageOf(error) };
  } finally {
    removeSources(shared);
  }
}

function runResourceExample(policy: GatePolicy, proof: GatePolicyProof): ExampleRun {
  const root = mkdtempSync(join(tmpdir(), TEMP_PREFIX));
  try {
    const project = new Project({ skipAddingFilesFromTsConfig: true });
    const resources: string[] = [];
    for (const [path, content] of Object.entries(proof.files).toSorted(([left], [right]) => left.localeCompare(right))) {
      const absolute = join(root, path);
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, content);
      if (TS_SOURCE_RE.test(path)) {
        project.addSourceFileAtPath(absolute);
      } else {
        resources.push(path);
      }
    }
    return { result: runPass(policy, root, project, resources) };
  } catch (error) {
    return { thrown: messageOf(error) };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runExample(policy: GatePolicy, proof: GatePolicyProof, shared: Project): ExampleRun {
  return proof.mode === "resource" ? runResourceExample(policy, proof) : runVirtualExample(policy, proof, shared);
}

function formatFindingMessages(findings: readonly CoordinatedGateFinding[], policyMessage: string): string {
  return findings.map((finding) => finding.message ?? policyMessage).join("; ");
}

function toolFailure(result: PolicyPassResult, policy: GatePolicy, examplePaths: ReadonlySet<string>): string | null {
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
  if (expectation.line !== undefined && !findings.some(({ line }) => line === expectation.line)) {
    return `expected an effective finding at line=${expectation.line} but got lines ${findings.map(({ line }) => line).join(", ")}`;
  }
  if (expectation.token !== undefined && !findings.some(({ token }) => token === expectation.token)) {
    return `expected an effective finding with token=${JSON.stringify(expectation.token)} but got tokens ${findings
      .map(({ token }) => JSON.stringify(token ?? ""))
      .join(", ")}`;
  }
  if (
    expectation.messageIncludes !== undefined &&
    !findings.some((finding) => (finding.message ?? policyMessage).includes(expectation.messageIncludes as string))
  ) {
    return `expected an effective finding whose message includes ${JSON.stringify(expectation.messageIncludes)} but got ${JSON.stringify(
      formatFindingMessages(findings, policyMessage),
    )}`;
  }
  return null;
}

function proofFailure({ policy, arm, proof, exampleIndex, shared }: ProofRunInput): PolicyConformanceFailure | null {
  const run = runExample(policy, proof, shared);
  let detail: string | null;
  if (run.thrown !== undefined) {
    detail = `PASS THREW ${run.thrown}`;
  } else {
    const result = run.result as PolicyPassResult;
    detail = toolFailure(result, policy, new Set(Object.keys(proof.files)));
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
  return detail === null ? null : { policyId: policy.id, arm, exampleIndex, why: proof.why, detail };
}

/** Verify every policy proof in stable policy/arm/example order. Empty result means every proof holds. */
export function verifyPolicyProofs(policies: readonly GatePolicy[]): readonly PolicyConformanceFailure[] {
  const failures: PolicyConformanceFailure[] = [];
  const shared = new Project({ useInMemoryFileSystem: true });
  for (const policy of [...policies].toSorted((left, right) => left.id.localeCompare(right.id))) {
    assertGatePolicyDescriptor(policy);
    for (const arm of ["mustFlag", "mustPass"] as const) {
      for (const [exampleIndex, proof] of policy[arm].entries()) {
        const failure = proofFailure({ policy, arm, proof, exampleIndex, shared });
        if (failure !== null) {
          failures.push(failure);
        }
      }
    }
  }
  removeSources(shared);
  return failures;
}
