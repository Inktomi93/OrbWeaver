// Reconcile the planner's compiler manifests with the exact ts-morph workspace the dispatcher will walk.
// Compiler ownership remains scope evidence; it cannot add a path that execution cannot visit.
import type { PolicyPlannerInput } from "../contract/policy-plan.ts";
import type { PolicyScopeResolution } from "../contract/policy-scope.ts";
import { policySourceCandidates } from "./policy-source-candidate.ts";
import { normalizePathSet } from "./policy-validation.ts";

export function planSourceCandidates(input: PolicyPlannerInput, scope: PolicyScopeResolution): readonly string[] {
  if (input.executionWorkspacePaths === undefined) {
    return policySourceCandidates(scope.inventory.source === "workspace" ? scope.currentPaths : scope.programs.flatMap(({ files }) => files));
  }
  const workspacePaths = normalizePathSet(input.executionWorkspacePaths, "execution workspace path");
  const candidates = policySourceCandidates(workspacePaths);
  if (candidates.length !== workspacePaths.length) {
    throw new Error("execution workspace contains a non-policy source path");
  }
  const permitted = new Set(scope.inventory.source === "workspace" ? scope.currentPaths : scope.programs.flatMap(({ files }) => files));
  const outside = candidates.filter((path) => !permitted.has(path));
  if (outside.length > 0) {
    throw new Error(`execution workspace paths have no authored compiler membership: ${outside.join(", ")}`);
  }
  return candidates;
}
