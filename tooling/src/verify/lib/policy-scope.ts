// Resolve final-policy scope intent once into authored paths plus compiler ownership. This API is read-only,
// has no ambient root/cache, and deliberately carries no ESLint host or legacy stage-planner decisions.
import type {
  PolicyProgramMembership,
  PolicyRepositoryInventory,
  PolicyScopeInventoryReceipt,
  PolicyScopeRequest,
  PolicyScopeResolution,
  PolicySemanticPath,
  PolicyWorkspacePackage,
} from "../contract/policy-scope.ts";
import { POLICY_SCOPE_KINDS, POLICY_SEMANTIC_PATH_STATUSES } from "../contract/policy-scope.ts";
import {
  mergePolicyPrograms,
  policyProgramPaths,
  readAvailablePolicyPrograms,
  readPolicyProgramGraph,
  resolvePolicyPathOwnership,
} from "./policy-program-membership.ts";
import {
  assertPolicyRepoPath,
  readPolicyChangedSelection,
  readPolicyRepositoryInventory,
  readPolicyWorkspacePackages,
  resolveExistingPolicyPath,
} from "./policy-repo-inventory.ts";

const REQUEST_KEYS = {
  whole: new Set(["kind"]),
  changed: new Set(["kind"]),
  file: new Set(["kind", "paths"]),
  folder: new Set(["kind", "path"]),
  package: new Set(["kind", "name"]),
  project: new Set(["kind", "config"]),
} as const satisfies Readonly<Record<PolicyScopeRequest["kind"], ReadonlySet<string>>>;
const ASCII_C0_MAX = 0x1f;
const ASCII_DELETE = 0x7f;
/** Enough merge-base sha for a human to resolve it; the full commit stays in the receipt. */
const SHORT_SHA = 12;

function compare(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("policy scope request must be an object");
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): void {
  const unknown = Object.keys(value)
    .filter((key) => !allowed.has(key))
    .toSorted(compare);
  if (unknown.length > 0) {
    throw new Error(`policy scope request has unknown properties ${unknown.map((key) => JSON.stringify(key)).join(", ")}`);
  }
}

function nonBlank(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    [...value].some((character) => {
      const point = character.codePointAt(0);
      return point !== undefined && (point <= ASCII_C0_MAX || point === ASCII_DELETE);
    })
  ) {
    throw new Error(`policy scope request ${label} must be a nonempty control-free string`);
  }
}

export function assertPolicyScopeRequest(value: unknown): asserts value is PolicyScopeRequest {
  const request = record(value);
  if (typeof request["kind"] !== "string" || !(POLICY_SCOPE_KINDS as readonly string[]).includes(request["kind"] as string)) {
    throw new Error("policy scope request kind is invalid");
  }
  const kind = request["kind"] as PolicyScopeRequest["kind"];
  exactKeys(request, REQUEST_KEYS[kind]);
  if (kind === "file") {
    const paths = request["paths"];
    if (!Array.isArray(paths) || paths.length === 0) {
      throw new Error("policy scope request file paths must be a nonempty array");
    }
    for (const path of paths) {
      assertPolicyRepoPath(path, "file scope path");
    }
    if (new Set(paths).size !== paths.length) {
      throw new Error("policy scope request file paths must be unique");
    }
  } else if (kind === "folder") {
    if (request["path"] !== ".") {
      assertPolicyRepoPath(request["path"], "folder scope path");
    }
  } else if (kind === "package") {
    nonBlank(request["name"], "package name");
  } else if (kind === "project") {
    assertPolicyRepoPath(request["config"], "project config path");
  }
}

function snapshotRequest(request: PolicyScopeRequest): PolicyScopeRequest {
  return request.kind === "file" ? { kind: "file", paths: [...request.paths] } : { ...request };
}

function semanticPresent(paths: readonly string[]): readonly PolicySemanticPath[] {
  return [...new Set(paths)].toSorted(compare).map((path) => ({ path, status: "present", previousPath: null }));
}

function folderPaths(inventory: PolicyRepositoryInventory, requestPath: string): readonly string[] {
  const folder = resolveExistingPolicyPath(inventory, requestPath, "folder");
  const prefix = folder === "." ? "" : `${folder}/`;
  const paths = inventory.paths.filter((path) => path.startsWith(prefix));
  if (paths.length === 0) {
    throw new Error(`folder scope selected zero authored files: ${requestPath}`);
  }
  return paths;
}

function packagePaths(inventory: PolicyRepositoryInventory, pkg: PolicyWorkspacePackage): readonly string[] {
  const prefix = pkg.path === "." ? "" : `${pkg.path}/`;
  const paths = inventory.paths.filter((path) => path.startsWith(prefix));
  if (paths.length === 0) {
    throw new Error(`workspace package selected zero authored files: ${pkg.name}`);
  }
  return paths;
}

function semanticCurrentPaths(inventory: PolicyRepositoryInventory, semanticPaths: readonly PolicySemanticPath[]): readonly string[] {
  const current = semanticPaths.filter((path) => path.status !== "deleted").map((path) => path.path);
  for (const path of current) {
    if (!inventory.paths.includes(path)) {
      throw new Error(`scope selected a current path outside the authored inventory: ${path}`);
    }
  }
  return [...new Set(current)].toSorted(compare);
}

function assertSortedUniquePaths(paths: readonly string[], label: string): void {
  for (const path of paths) {
    assertPolicyRepoPath(path, label);
  }
  if (new Set(paths).size !== paths.length || JSON.stringify(paths) !== JSON.stringify([...paths].toSorted(compare))) {
    throw new Error(`${label} must be sorted and unique`);
  }
}

function semanticIdentity(path: PolicySemanticPath): string {
  return `${path.path}\0${path.status}\0${path.previousPath ?? ""}`;
}

function assertSortedUniqueSemanticPaths(paths: readonly PolicySemanticPath[]): void {
  const identities = paths.map(semanticIdentity);
  if (new Set(identities).size !== identities.length || JSON.stringify(identities) !== JSON.stringify([...identities].toSorted(compare))) {
    throw new Error("policy scope semantic paths must be sorted and unique");
  }
}

function validateSemanticResolution(resolution: PolicyScopeResolution, inventory: PolicyRepositoryInventory): void {
  assertSortedUniquePaths(resolution.currentPaths, "policy scope current paths");
  assertSortedUniqueSemanticPaths(resolution.semanticPaths);
  for (const path of resolution.semanticPaths) {
    assertPolicyRepoPath(path.path, "policy scope semantic path");
    if (!(POLICY_SEMANTIC_PATH_STATUSES as readonly string[]).includes(path.status)) {
      throw new Error(`policy scope semantic status is invalid: ${path.path}`);
    }
    if ((path.status === "renamed-existing") !== (path.previousPath !== null)) {
      throw new Error(`policy scope semantic rename identity is invalid: ${path.path}`);
    }
    if (path.previousPath !== null) {
      assertPolicyRepoPath(path.previousPath, "policy scope previous path");
    }
  }
  if (resolution.requestedPaths !== null && JSON.stringify(resolution.requestedPaths) !== JSON.stringify(resolution.semanticPaths)) {
    throw new Error("policy scope requested and semantic manifests disagree");
  }
  if (resolution.kind !== "whole" && JSON.stringify(resolution.currentPaths) !== JSON.stringify(semanticCurrentPaths(inventory, resolution.semanticPaths))) {
    throw new Error("policy scope current manifest disagrees with semantic status");
  }
}

function validatePrograms(resolution: PolicyScopeResolution): void {
  const programIds = resolution.programs.map((program) => program.id);
  assertSortedUniquePaths(programIds, "policy scope program ids");
  assertSortedUniquePaths(resolution.requestedProgramIds, "policy scope requested program ids");
  for (const program of resolution.programs) {
    if (program.id !== program.config) {
      throw new Error(`policy scope program id/config disagree: ${program.id}`);
    }
    assertSortedUniquePaths(program.files, `policy scope program ${program.id} files`);
    assertSortedUniquePaths(program.references, `policy scope program ${program.id} references`);
    assertSortedUniquePaths(program.configPaths, `policy scope program ${program.id} config paths`);
    if (!program.configPaths.includes(program.config)) {
      throw new Error(`policy scope program ${program.id} does not own its config`);
    }
    if (program.references.some((reference) => !programIds.includes(reference))) {
      throw new Error(`policy scope program ${program.id} has an unresolved reference`);
    }
  }
  if (resolution.requestedProgramIds.some((id) => !programIds.includes(id))) {
    throw new Error("policy scope requested a program absent from the returned graph");
  }
}

function validateOwnershipEntry(
  ownership: PolicyScopeResolution["ownership"][number],
  semantic: PolicySemanticPath | undefined,
  everyProgram: readonly string[],
  index: number,
): void {
  if (semantic === undefined || semanticIdentity(ownership) !== semanticIdentity(semantic)) {
    throw new Error(`policy scope ownership identity disagrees at index ${String(index)}`);
  }
  assertSortedUniquePaths(ownership.programIds, `policy scope ownership ${ownership.path} program ids`);
  if (ownership.programIds.some((id) => !everyProgram.includes(id))) {
    throw new Error(`policy scope ownership names an unavailable program: ${ownership.path}`);
  }
  if (ownership.status === "deleted" && JSON.stringify(ownership.programIds) !== JSON.stringify(everyProgram)) {
    throw new Error(`policy scope deleted ownership is not conservative: ${ownership.path}`);
  }
  let expectedReason = "outside-compiler-programs";
  if (ownership.status === "deleted") {
    expectedReason = "deleted-conservative-all-programs";
  } else if (ownership.programIds.length > 0) {
    expectedReason = "compiler-membership";
  }
  if (ownership.reason !== expectedReason) {
    throw new Error(`policy scope ownership reason disagrees with compiler evidence: ${ownership.path}`);
  }
}

function validateOwnership(resolution: PolicyScopeResolution): void {
  if (resolution.ownership.length !== resolution.semanticPaths.length) {
    throw new Error("policy scope ownership does not cover every semantic path");
  }
  const everyProgram = resolution.programs.map((program) => program.id);
  for (const [index, ownership] of resolution.ownership.entries()) {
    validateOwnershipEntry(ownership, resolution.semanticPaths[index], everyProgram, index);
  }
}

function validateResolution(resolution: PolicyScopeResolution, inventory: PolicyRepositoryInventory): void {
  if (resolution.kind !== resolution.request.kind) {
    throw new Error("policy scope resolution kind disagrees with request");
  }
  if ((resolution.kind === "whole") !== (resolution.requestedPaths === null)) {
    throw new Error("policy scope resolution whole/requested-path identity is invalid");
  }
  validateSemanticResolution(resolution, inventory);
  validatePrograms(resolution);
  validateOwnership(resolution);
  if (resolution.inventory.authoredCount !== inventory.paths.length) {
    throw new Error("policy scope inventory receipt count is inconsistent");
  }
}

interface ScopeSelection {
  readonly semanticPaths: readonly PolicySemanticPath[];
  readonly currentPaths: readonly string[];
  readonly programs: readonly PolicyProgramMembership[];
  readonly requestedProgramIds: readonly string[];
  readonly workspacePackage: PolicyWorkspacePackage | null;
  readonly projectConfig: string | null;
  readonly receipt: PolicyScopeInventoryReceipt;
}

function affectedProgramIds(programs: readonly PolicyProgramMembership[], semanticPaths: readonly PolicySemanticPath[]): readonly string[] {
  const ownership = resolvePolicyPathOwnership(programs, semanticPaths);
  return [...new Set(ownership.flatMap((path) => path.programIds))].toSorted(compare);
}

function selectRequest(
  request: PolicyScopeRequest,
  inventory: PolicyRepositoryInventory,
  availablePrograms: readonly PolicyProgramMembership[],
): ScopeSelection {
  switch (request.kind) {
    case "whole":
      return {
        semanticPaths: [],
        currentPaths: inventory.paths,
        programs: availablePrograms,
        requestedProgramIds: availablePrograms.map((program) => program.id),
        workspacePackage: null,
        projectConfig: null,
        receipt: inventory.receipt,
      };
    case "changed": {
      const changed = readPolicyChangedSelection(inventory);
      return {
        semanticPaths: changed.semanticPaths,
        currentPaths: semanticCurrentPaths(inventory, changed.semanticPaths),
        programs: availablePrograms,
        requestedProgramIds: affectedProgramIds(availablePrograms, changed.semanticPaths),
        workspacePackage: null,
        projectConfig: null,
        receipt: { ...inventory.receipt, mergeBase: changed.mergeBase },
      };
    }
    case "file": {
      const semanticPaths = semanticPresent(request.paths.map((path) => resolveExistingPolicyPath(inventory, path, "file")));
      return {
        semanticPaths,
        currentPaths: semanticCurrentPaths(inventory, semanticPaths),
        programs: availablePrograms,
        requestedProgramIds: affectedProgramIds(availablePrograms, semanticPaths),
        workspacePackage: null,
        projectConfig: null,
        receipt: inventory.receipt,
      };
    }
    case "folder": {
      const semanticPaths = semanticPresent(folderPaths(inventory, request.path));
      return {
        semanticPaths,
        currentPaths: semanticCurrentPaths(inventory, semanticPaths),
        programs: availablePrograms,
        requestedProgramIds: affectedProgramIds(availablePrograms, semanticPaths),
        workspacePackage: null,
        projectConfig: null,
        receipt: inventory.receipt,
      };
    }
    case "package": {
      const workspacePackage = readPolicyWorkspacePackages(inventory).find((pkg) => pkg.name === request.name) ?? null;
      if (workspacePackage === null) {
        throw new Error(`unknown workspace package: ${request.name}`);
      }
      const semanticPaths = semanticPresent(packagePaths(inventory, workspacePackage));
      return {
        semanticPaths,
        currentPaths: semanticCurrentPaths(inventory, semanticPaths),
        programs: availablePrograms,
        requestedProgramIds: affectedProgramIds(availablePrograms, semanticPaths),
        workspacePackage,
        projectConfig: null,
        receipt: inventory.receipt,
      };
    }
    case "project": {
      const requestedPrograms = readPolicyProgramGraph(inventory, [request.config]);
      const programs = mergePolicyPrograms(availablePrograms, requestedPrograms);
      const currentPaths = policyProgramPaths(requestedPrograms);
      if (currentPaths.length === 0) {
        throw new Error(`project scope selected zero authored files: ${request.config}`);
      }
      return {
        semanticPaths: semanticPresent(currentPaths),
        currentPaths,
        programs,
        requestedProgramIds: requestedPrograms.map((program) => program.id),
        workspacePackage: null,
        projectConfig: request.config,
        receipt: inventory.receipt,
      };
    }
  }
}

/** THE CHANGED LABEL NAMES ITS BASE (#2472). A count alone is unreadable: `changed (2932 paths)` and
 *  `changed (0 paths)` are the SAME sentence about two completely different questions, and for two years
 *  the first one was what `--changed` actually measured on this checkout — the base was a far-behind
 *  `origin/main`. A scope is only interpretable beside the ref and commit it was taken from, so the label
 *  every policy pass prints carries them. This is the policy half of the same visibility rule
 *  `ops/instrument-affected.ts` satisfies through the `[verify-notice]` channel; a pure resolver has no
 *  business writing to stdout, so its channel is the label it already returns. */
function scopeLabel(request: PolicyScopeRequest, count: number, mergeBase: PolicyScopeInventoryReceipt["mergeBase"]): string {
  switch (request.kind) {
    case "whole":
      return "whole repository";
    case "changed":
      return `changed (${String(count)} paths since ${mergeBase === null ? "an unresolved base" : `${mergeBase.ref} @ ${mergeBase.commit.slice(0, SHORT_SHA)}`})`;
    case "file":
      return `files (${String(count)})`;
    case "folder":
      return `folder ${request.path}`;
    case "package":
      return `package ${request.name}`;
    case "project":
      return `project ${request.config}`;
  }
}

export function resolvePolicyScope(root: string, input: PolicyScopeRequest): PolicyScopeResolution {
  assertPolicyScopeRequest(input);
  const request = snapshotRequest(input);
  const inventory = readPolicyRepositoryInventory(root);
  const selected = selectRequest(request, inventory, readAvailablePolicyPrograms(inventory));
  const ownership = resolvePolicyPathOwnership(selected.programs, selected.semanticPaths);
  const resolution: PolicyScopeResolution = {
    request,
    kind: request.kind,
    label: scopeLabel(request, selected.semanticPaths.length, selected.receipt.mergeBase),
    requestedPaths: request.kind === "whole" ? null : selected.semanticPaths,
    currentPaths: selected.currentPaths,
    semanticPaths: selected.semanticPaths,
    programs: selected.programs,
    requestedProgramIds: selected.requestedProgramIds,
    ownership,
    workspacePackage: selected.workspacePackage,
    projectConfig: selected.projectConfig,
    inventory: selected.receipt,
  };
  validateResolution(resolution, inventory);
  return resolution;
}
