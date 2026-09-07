// TypeScript owns config inheritance, include/exclude expansion, and project-reference paths. This leaf
// only bounds those compiler facts to the authored repository and assigns exact or named-conservative owners.
import { existsSync, realpathSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { ts } from "ts-morph";
import type { PolicyPathOwnership, PolicyProgramMembership, PolicyRepositoryInventory, PolicySemanticPath } from "../contract/policy-scope.ts";
import { assertPolicyRepoPath } from "./policy-repo-inventory.ts";

const TSCONFIG_RE = /(?:^|\/)tsconfig(?:[.-][^/]*)?\.json$/u;
const EMPTY_FILES_LIST_DIAGNOSTIC = 18_002;
const NO_INPUT_FILES_DIAGNOSTIC = 18_003;
const EMPTY_CONFIG_DIAGNOSTICS = new Set([EMPTY_FILES_LIST_DIAGNOSTIC, NO_INPUT_FILES_DIAGNOSTIC]);

interface CanonicalConfig {
  readonly absolute: string;
  readonly relative: string;
}

interface ParsedConfig {
  readonly canonical: CanonicalConfig;
  readonly raw: Record<string, unknown>;
  readonly parsed: ts.ParsedCommandLine;
}

function compare(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function containedRelative(root: string, canonical: string, label: string): string {
  const rel = relative(root, canonical);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`${label} resolves outside repository`);
  }
  const posix = rel.split(sep).join("/");
  assertPolicyRepoPath(posix, label);
  return posix;
}

function canonicalConfig(inventory: PolicyRepositoryInventory, config: string): CanonicalConfig {
  assertPolicyRepoPath(config, "project config path");
  if (!TSCONFIG_RE.test(config)) {
    throw new Error(`project must name a repo-relative tsconfig*.json: ${config}`);
  }
  const candidate = resolve(inventory.root, config);
  if (!existsSync(candidate)) {
    throw new Error(`project config does not exist: ${config}`);
  }
  const target = realpathSync(candidate);
  containedRelative(inventory.root, target, `project config ${config}`);
  if (!statSync(target).isFile()) {
    throw new Error(`project config is not a file: ${config}`);
  }
  if (!inventory.paths.includes(config)) {
    throw new Error(`project config is not authored: ${config}`);
  }
  return { absolute: candidate, relative: config };
}

function diagnosticText(diagnostic: ts.Diagnostic): string {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
}

function parseConfig(inventory: PolicyRepositoryInventory, config: string): ParsedConfig {
  const canonical = canonicalConfig(inventory, config);
  const read = ts.readConfigFile(canonical.absolute, ts.sys.readFile);
  if (read.error !== undefined) {
    throw new Error(`could not read ${config}: ${diagnosticText(read.error)}`);
  }
  if (typeof read.config !== "object" || read.config === null || Array.isArray(read.config)) {
    throw new Error(`project config is not an object: ${config}`);
  }
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, dirname(canonical.absolute), undefined, canonical.absolute);
  const fatal = parsed.errors.filter((diagnostic) => !EMPTY_CONFIG_DIAGNOSTICS.has(diagnostic.code));
  if (fatal.length > 0) {
    throw new Error(`could not parse ${config}: ${fatal.map(diagnosticText).join("\n")}`);
  }
  return { canonical, raw: read.config as Record<string, unknown>, parsed };
}

function referenceConfigs(inventory: PolicyRepositoryInventory, parsed: ts.ParsedCommandLine): readonly string[] {
  return (parsed.projectReferences ?? [])
    .map((reference) => ts.resolveProjectReferencePath(reference))
    .map((path) => {
      let canonical: string;
      try {
        canonical = realpathSync(path);
      } catch (error) {
        throw new Error(`project reference config cannot be resolved: ${path}`, { cause: error });
      }
      containedRelative(inventory.root, canonical, "project reference config target");
      const lexical = relative(inventory.root, resolve(path)).split(sep).join("/");
      assertPolicyRepoPath(lexical, "project reference config");
      return lexical;
    })
    .toSorted(compare);
}

function authoredCompilerFiles(inventory: PolicyRepositoryInventory, parsed: ts.ParsedCommandLine, config: string): readonly string[] {
  const authored = new Set(inventory.paths);
  const files: string[] = [];
  for (const file of parsed.fileNames) {
    let canonical: string;
    try {
      canonical = realpathSync(file);
    } catch (error) {
      throw new Error(`compiler member from ${config} cannot be resolved: ${file}`, { cause: error });
    }
    containedRelative(inventory.root, canonical, `compiler member target from ${config}`);
    const lexical = relative(inventory.root, resolve(file)).split(sep).join("/");
    assertPolicyRepoPath(lexical, `compiler member from ${config}`);
    if (authored.has(lexical)) {
      files.push(lexical);
    }
  }
  return [...new Set(files)].toSorted(compare);
}

export function readPolicyProgramMembership(inventory: PolicyRepositoryInventory, config: string): PolicyProgramMembership {
  const { canonical, parsed } = parseConfig(inventory, config);
  const files = authoredCompilerFiles(inventory, parsed, config);
  const references = referenceConfigs(inventory, parsed);
  const configPaths = transitiveConfigPaths(inventory, config);
  return { id: canonical.relative, config: canonical.relative, files, references, configPaths };
}

export function readPolicyProgramGraph(inventory: PolicyRepositoryInventory, rootConfigs: readonly string[]): readonly PolicyProgramMembership[] {
  const pending = [...rootConfigs];
  const programs = new Map<string, PolicyProgramMembership>();
  while (pending.length > 0) {
    const config = pending.shift();
    if (config === undefined || programs.has(config)) {
      continue;
    }
    const program = readPolicyProgramMembership(inventory, config);
    programs.set(program.id, program);
    pending.push(...program.references);
  }
  const result = [...programs.values()].toSorted((left, right) => compare(left.id, right.id));
  for (const program of result) {
    if (program.files.length === 0 && program.references.length === 0) {
      throw new Error(`project config resolved zero authored files: ${program.config}`);
    }
  }
  return result;
}

function extendsValues(raw: Record<string, unknown>, config: string): readonly string[] {
  const value = raw["extends"];
  if (value === undefined) {
    return [];
  }
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
    return value;
  }
  throw new Error(`project config ${config} has an invalid extends value`);
}

function localExtendsTargets(inventory: PolicyRepositoryInventory, config: ParsedConfig): readonly string[] {
  return extendsValues(config.raw, config.canonical.relative).flatMap((value) => {
    if (!value.startsWith(".")) {
      return [];
    }
    const candidate = resolve(dirname(config.canonical.absolute), value);
    const target = extname(candidate) === ".json" ? candidate : `${candidate}.json`;
    if (!existsSync(target)) {
      throw new Error(`local extends config cannot be resolved from ${config.canonical.relative}: ${value}`);
    }
    const lexical = relative(inventory.root, target).split(sep).join("/");
    canonicalConfig(inventory, lexical);
    return [lexical];
  });
}

interface ConfigPathWalk {
  readonly inventory: PolicyRepositoryInventory;
  readonly visited: Set<string>;
  readonly active: Set<string>;
  readonly paths: Set<string>;
}

function collectConfigPaths(walk: ConfigPathWalk, config: string): void {
  if (walk.active.has(config)) {
    throw new Error(`project config extends cycle reaches ${config}`);
  }
  if (walk.visited.has(config)) {
    return;
  }
  walk.active.add(config);
  const parsed = parseConfig(walk.inventory, config);
  walk.paths.add(config);
  for (const target of localExtendsTargets(walk.inventory, parsed)) {
    collectConfigPaths(walk, target);
  }
  walk.active.delete(config);
  walk.visited.add(config);
}

function transitiveConfigPaths(inventory: PolicyRepositoryInventory, config: string): readonly string[] {
  const paths = new Set<string>();
  collectConfigPaths({ inventory, visited: new Set(), active: new Set(), paths }, config);
  return [...paths].toSorted(compare);
}

export function discoverPolicyProgramConfigs(inventory: PolicyRepositoryInventory): readonly string[] {
  const configs = inventory.paths.filter((path) => TSCONFIG_RE.test(path));
  if (configs.length === 0) {
    return [];
  }
  const parsed = configs.map((config) => parseConfig(inventory, config));
  const extended = new Set(parsed.flatMap((config) => localExtendsTargets(inventory, config)));
  const referenced = new Set(parsed.flatMap((config) => referenceConfigs(inventory, config.parsed)));
  const candidates = parsed.filter((config) => !extended.has(config.canonical.relative) || referenced.has(config.canonical.relative));
  if (candidates.length === 0) {
    throw new Error("TypeScript config discovery found no runnable program roots");
  }
  return candidates
    .filter((config) => !isExplicitTemplate(config))
    .map((config) => config.canonical.relative)
    .toSorted(compare);
}

function isExplicitTemplate(config: ParsedConfig): boolean {
  const files = config.raw["files"];
  const include = config.raw["include"];
  const hasEmptyRoots = (Array.isArray(files) && files.length === 0) || (Array.isArray(include) && include.length === 0);
  const hasNoInclude = include === undefined || (Array.isArray(include) && include.length === 0);
  // An unmatched nonempty include is a broken program, even when it inherits an empty files array.
  return hasEmptyRoots && hasNoInclude && config.parsed.fileNames.length === 0 && (config.parsed.projectReferences?.length ?? 0) === 0;
}

export function readAvailablePolicyPrograms(inventory: PolicyRepositoryInventory): readonly PolicyProgramMembership[] {
  return readPolicyProgramGraph(inventory, discoverPolicyProgramConfigs(inventory));
}

export function mergePolicyPrograms(
  available: readonly PolicyProgramMembership[],
  requested: readonly PolicyProgramMembership[],
): readonly PolicyProgramMembership[] {
  const programs = new Map<string, PolicyProgramMembership>();
  for (const program of [...available, ...requested]) {
    const existing = programs.get(program.id);
    if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(program)) {
      throw new Error(`compiler program ${program.id} resolved inconsistently`);
    }
    programs.set(program.id, program);
  }
  return [...programs.values()].toSorted((left, right) => compare(left.id, right.id));
}

export function policyProgramPaths(programs: readonly PolicyProgramMembership[]): readonly string[] {
  return [...new Set(programs.flatMap((program) => program.files))].toSorted(compare);
}

function referencedProgramClosure(programs: ReadonlyMap<string, PolicyProgramMembership>, rootId: string): readonly string[] {
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
