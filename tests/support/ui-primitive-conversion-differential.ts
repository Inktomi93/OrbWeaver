// Physical final-policy replay for the UI primitive conversion differential. Authored-tree resources
// read the real temporary directory; the Project and dispatcher consume those same materialized bytes.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Project } from "ts-morph";
import type { GateDescriptor } from "../../tooling/src/verify/contract/gate.ts";
import type { ReviewedGateGrant } from "../../tooling/src/verify/contract/gate-authority.ts";
import type { GatePolicy } from "../../tooling/src/verify/contract/policy.ts";
import { runPass } from "../../tooling/src/verify/lib/pass.ts";
import { runPolicyPass } from "../../tooling/src/verify/lib/policy-pass.ts";
import { isPolicySourceCandidate } from "../../tooling/src/verify/lib/policy-source-candidate.ts";
import type { Files } from "./legacy-differential.ts";
import { stagedReplayTarget } from "./legacy-differential.ts";

export function runUiPrimitiveFinalReplay(
  scratch: string,
  policies: readonly GatePolicy[],
  files: Files,
  grants: readonly ReviewedGateGrant[],
): ReturnType<typeof runPolicyPass> {
  const root = mkdtempSync(join(scratch, "ui-primitive-final-"));
  try {
    const project = new Project({ skipAddingFilesFromTsConfig: true });
    for (const [path, source] of Object.entries(files).toSorted(([left], [right]) => left.localeCompare(right))) {
      const target = stagedReplayTarget(root, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, source);
      if (isPolicySourceCandidate(path)) {
        project.addSourceFileAtPath(target);
      }
    }
    return runPolicyPass({
      knownPolicies: [...policies],
      policies: [...policies],
      root,
      project,
      reviewedGrants: [...grants],
      failOnWarnings: false,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

export function runUiPrimitiveLegacyReplay(scratch: string, gate: GateDescriptor, files: Files): ReturnType<typeof runPass> {
  const root = mkdtempSync(join(scratch, "ui-primitive-legacy-"));
  try {
    const project = new Project({ skipAddingFilesFromTsConfig: true });
    for (const [path, source] of Object.entries(files).toSorted(([left], [right]) => left.localeCompare(right))) {
      const target = stagedReplayTarget(root, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, source);
      if (isPolicySourceCandidate(path)) {
        project.addSourceFileAtPath(target);
      }
    }
    return runPass([gate], {
      root,
      project,
      scope: { kind: "project" },
      files: project.getSourceFiles(),
      checker: () => project.getTypeChecker(),
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
