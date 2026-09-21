// Verifier policy names over the neutral native compiler-program reader. Keep scope ownership here;
// `_shared` publishes compiler facts and reaches up to no tool.

import { compilerProgramPaths, mergeCompilerPrograms, readAvailableCompilerPrograms, readCompilerProgramGraph } from "../../_shared/compiler-programs.ts";
import type { CompilerProgramMembership } from "../../_shared/compiler-programs-contract.ts";
import type { PolicyPathOwnership, PolicyProgramMembership, PolicyRepositoryInventory, PolicySemanticPath } from "../contract/policy-scope.ts";

// biome-ignore lint/performance/noBarrelFile: compatibility front door keeps existing verifier imports stable after the neutral reader extraction.
export { compilerConfigRoster, readCompilerConfigEntries, readCompilerPrograms, readCompilerProgramsFromInventory } from "../../_shared/compiler-programs.ts";

export function readPolicyProgramGraph(inventory: PolicyRepositoryInventory, rootConfigs: readonly string[]): readonly PolicyProgramMembership[] {
  return readCompilerProgramGraph(inventory, rootConfigs);
}

export function readAvailablePolicyPrograms(inventory: PolicyRepositoryInventory): readonly PolicyProgramMembership[] {
  return readAvailableCompilerPrograms(inventory);
}

export function mergePolicyPrograms(
  available: readonly PolicyProgramMembership[],
  requested: readonly PolicyProgramMembership[],
): readonly PolicyProgramMembership[] {
  return mergeCompilerPrograms(available, requested);
}

export function policyProgramPaths(programs: readonly PolicyProgramMembership[]): readonly string[] {
  return compilerProgramPaths(programs);
}

function compare(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function referencedProgramClosure(programs: ReadonlyMap<string, CompilerProgramMembership>, rootId: string): readonly string[] {
  const pending = [rootId];
  const seen = new Set<string>();
  while (pending.length > 0) {
    const id = pending.shift();
    if (id === undefined || seen.has(id)) {
      continue;
    }
    const program = programs.get(id);
    if (program === undefined) {
      throw new Error(`compiler program reference is absent from graph: ${id}`);
    }
    seen.add(id);
    pending.push(...program.references);
  }
  return [...seen].toSorted(compare);
}

function configProgramIds(programs: readonly PolicyProgramMembership[], path: string): readonly string[] {
  const direct = programs.filter((program) => program.configPaths.includes(path)).map((program) => program.id);
  if (direct.length === 0) {
    return [];
  }
  const byId = new Map(programs.map((program) => [program.id, program]));
  const closures = new Map(programs.map((program) => [program.id, referencedProgramClosure(byId, program.id)]));
  const affected = new Set(direct);
  for (const id of direct) {
    for (const referenced of closures.get(id) ?? []) {
      affected.add(referenced);
    }
  }
  for (const program of programs) {
    if ((closures.get(program.id) ?? []).some((id) => direct.includes(id))) {
      affected.add(program.id);
    }
  }
  return [...affected].toSorted(compare);
}

export function resolvePolicyPathOwnership(programs: readonly PolicyProgramMembership[], paths: readonly PolicySemanticPath[]): readonly PolicyPathOwnership[] {
  const byFile = new Map<string, string[]>();
  for (const program of programs) {
    for (const file of program.files) {
      const owners = byFile.get(file) ?? [];
      owners.push(program.id);
      byFile.set(file, owners);
    }
  }
  const everyProgram = programs.map((program) => program.id);
  return paths.map((path) => {
    if (path.status === "deleted") {
      return { ...path, programIds: everyProgram, reason: "deleted-conservative-all-programs" };
    }
    const configOwners = configProgramIds(programs, path.path);
    const programIds = configOwners.length > 0 ? configOwners : [...new Set(byFile.get(path.path) ?? [])].toSorted(compare);
    return programIds.length > 0 ? { ...path, programIds, reason: "compiler-membership" } : { ...path, programIds: [], reason: "outside-compiler-programs" };
  });
}
