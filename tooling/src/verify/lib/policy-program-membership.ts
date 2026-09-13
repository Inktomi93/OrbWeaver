// TypeScript owns config inheritance, include/exclude expansion, and project-reference paths. This leaf
// only bounds those compiler facts to the authored repository and assigns exact or named-conservative owners.
import { existsSync, realpathSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { ts } from "ts-morph";
import type {
  CompilerConfigEntries,
  CompilerConfigEntry,
  CompilerConfigField,
  CompilerProgram,
  CompilerSourceOverlay,
  PolicyPathOwnership,
  PolicyProgramMembership,
  PolicyRepositoryInventory,
  PolicySemanticPath,
} from "../contract/policy-scope.ts";
import { COMPILER_CONFIG_FIELDS } from "../contract/policy-scope.ts";
import { createCompilerSourceFilenameReader } from "./compiler-source-filename-overlay.ts";
import { assertPolicyRepoPath, readPolicyRepositoryInventory } from "./policy-repo-inventory.ts";

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

type CompilerSourceFilenameReader = ReturnType<typeof createCompilerSourceFilenameReader>;

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

function parseConfig(inventory: PolicyRepositoryInventory, config: string, sourceReader?: CompilerSourceFilenameReader): ParsedConfig {
  const canonical = canonicalConfig(inventory, config);
  const read = ts.readConfigFile(canonical.absolute, ts.sys.readFile);
  if (read.error !== undefined) {
    throw new Error(`could not read ${config}: ${diagnosticText(read.error)}`);
  }
  if (typeof read.config !== "object" || read.config === null || Array.isArray(read.config)) {
    throw new Error(`project config is not an object: ${config}`);
  }
  const parsed = ts.parseJsonConfigFileContent(read.config, sourceReader?.parseHost ?? ts.sys, dirname(canonical.absolute), undefined, canonical.absolute);
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

function authoredCompilerFiles(
  inventory: PolicyRepositoryInventory,
  parsed: ts.ParsedCommandLine,
  config: string,
  sourceReader?: CompilerSourceFilenameReader,
): readonly string[] {
  const authored = new Set(inventory.paths);
  const authoredPhysical = new Set(inventory.paths.map((path) => realpathSync(resolve(inventory.root, path))));
  const files: string[] = [];
  for (const file of parsed.fileNames) {
    if (sourceReader?.isDeleted(file) === true) {
      throw new Error(`compiler member from ${config} cannot be resolved after source deletion: ${sourceReader.repoRelative(file)}`);
    }
    if (sourceReader?.isAdded(file) === true) {
      files.push(sourceReader.repoRelative(file));
      continue;
    }
    let canonical: string;
    try {
      canonical = realpathSync(file);
    } catch (error) {
      throw new Error(`compiler member from ${config} cannot be resolved: ${file}`, { cause: error });
    }
    containedRelative(inventory.root, canonical, `compiler member target from ${config}`);
    const lexical = relative(inventory.root, resolve(file)).split(sep).join("/");
    assertPolicyRepoPath(lexical, `compiler member from ${config}`);
    if (sourceReader?.isAuthored(file) === true || authored.has(lexical) || authoredPhysical.has(canonical)) {
      files.push(lexical);
    }
  }
  return [...new Set(files)].toSorted(compare);
}

function readProgramMembership(inventory: PolicyRepositoryInventory, config: string, sourceReader?: CompilerSourceFilenameReader): PolicyProgramMembership {
  const { canonical, parsed } = parseConfig(inventory, config, sourceReader);
  const files = authoredCompilerFiles(inventory, parsed, config, sourceReader);
  const references = referenceConfigs(inventory, parsed);
  const configPaths = transitiveConfigPaths(inventory, config);
  return { id: canonical.relative, config: canonical.relative, files, references, configPaths };
}

function readProgramGraph(
  inventory: PolicyRepositoryInventory,
  rootConfigs: readonly string[],
  sourceReader?: CompilerSourceFilenameReader,
  allowEmptyPrograms = false,
): readonly PolicyProgramMembership[] {
  const pending = [...rootConfigs];
  const programs = new Map<string, PolicyProgramMembership>();
  while (pending.length > 0) {
    const config = pending.shift();
    if (config === undefined || programs.has(config)) {
      continue;
    }
    const program = readProgramMembership(inventory, config, sourceReader);
    programs.set(program.id, program);
    pending.push(...program.references);
  }
  const result = [...programs.values()].toSorted((left, right) => compare(left.id, right.id));
  for (const program of result) {
    const physicallyNonEmpty =
      allowEmptyPrograms && program.files.length === 0 && program.references.length === 0 && readProgramMembership(inventory, program.config).files.length > 0;
    if (program.files.length === 0 && program.references.length === 0 && !physicallyNonEmpty) {
      throw new Error(`project config resolved zero authored files: ${program.config}`);
    }
  }
  return result;
}

export function readPolicyProgramGraph(inventory: PolicyRepositoryInventory, rootConfigs: readonly string[]): readonly PolicyProgramMembership[] {
  return readProgramGraph(inventory, rootConfigs);
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

function discoverProgramConfigs(inventory: PolicyRepositoryInventory, sourceReader?: CompilerSourceFilenameReader): readonly string[] {
  const configs = inventory.paths.filter((path) => TSCONFIG_RE.test(path));
  if (configs.length === 0) {
    return [];
  }
  const parsed = configs.map((config) => parseConfig(inventory, config, sourceReader));
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
  return readPolicyProgramGraph(inventory, discoverProgramConfigs(inventory));
}

/** Shares the validated authored graph and native options with transformation tools. */
export function readCompilerProgramsFromInventory(inventory: PolicyRepositoryInventory, overlay?: CompilerSourceOverlay): readonly CompilerProgram[] {
  if (overlay === undefined) {
    return readAvailablePolicyPrograms(inventory).map((program) => ({
      ...program,
      commandLine: parseConfig(inventory, program.config).parsed,
    }));
  }
  const sourceReader = createCompilerSourceFilenameReader(inventory, overlay);
  const programs = readProgramGraph(inventory, discoverProgramConfigs(inventory, sourceReader), sourceReader, true);
  return programs.map((program) => {
    const commandLine = parseConfig(inventory, program.config, sourceReader).parsed;
    const acceptedEmpty = program.files.length === 0 && program.references.length === 0;
    return {
      ...program,
      commandLine: acceptedEmpty
        ? { ...commandLine, errors: commandLine.errors.filter((diagnostic) => !EMPTY_CONFIG_DIAGNOSTICS.has(diagnostic.code)) }
        : commandLine,
    };
  });
}

export function readCompilerPrograms(root: string, overlay?: CompilerSourceOverlay): readonly CompilerProgram[] {
  return readCompilerProgramsFromInventory(readPolicyRepositoryInventory(root), overlay);
}

/** The config ROSTER as declared data, derived from an already-acquired path inventory rather than from a
 *  directory walk: a reader that enumerates configs by `readdirSync` is blind to every config outside the
 *  three directories it happens to look in, and cannot run at all where there is no disk to walk. */
export function compilerConfigRoster(paths: readonly string[]): readonly string[] {
  return paths.filter((path) => TSCONFIG_RE.test(path)).toSorted(compare);
}

/** The RAW `include`/`exclude` entries of ONE config, with line identity, from its TEXT alone.
 *
 *  PURE — no filesystem, no `extends` folding, no glob expansion. This is the half `parseConfig` above
 *  consumes and destroys: `parseJsonConfigFileContent` answers *which files*, and an entry that expands to
 *  nothing leaves no trace in that answer, so a liveness reader has to judge the QUESTION instead. It stays
 *  in this module because the config grammar has ONE home (#1351) — a second JSONC parse anywhere else is a
 *  private reader wearing a contract's clothes (`docs/design/gate-runtime-standardization.md` §4). */
export function readCompilerConfigEntries(config: string, text: string): CompilerConfigEntries {
  // The VERDICT comes from the same public reader `parseConfig` uses, so "this config is readable" has one
  // answer; `parseJsonText` is asked only for the positions that reader discards.
  const json = ts.parseConfigFileTextToJson(config, text);
  if (json.error !== undefined) {
    return { status: "unparseable", config, reason: diagnosticText(json.error) };
  }
  const source = ts.parseJsonText(config, text);
  const root = source.statements[0]?.expression;
  if (root === undefined || !ts.isObjectLiteralExpression(root)) {
    return { status: "unparseable", config, reason: "config root is not a JSON object" };
  }
  return { status: "read", config, entries: root.properties.flatMap((property) => configEntryValues(source, property)) };
}

/** The entries of ONE top-level property, or none when it is not an authored `include`/`exclude` array. */
function configEntryValues(source: ts.JsonSourceFile, property: ts.ObjectLiteralElementLike): readonly CompilerConfigEntry[] {
  if (!ts.isPropertyAssignment(property)) {
    return [];
  }
  if (!ts.isStringLiteral(property.name)) {
    return [];
  }
  if (!ts.isArrayLiteralExpression(property.initializer)) {
    return [];
  }
  const name = property.name.text;
  const field: CompilerConfigField | undefined = COMPILER_CONFIG_FIELDS.find((candidate) => candidate === name);
  if (field === undefined) {
    return [];
  }
  return property.initializer.elements
    .filter((element): element is ts.StringLiteral => ts.isStringLiteral(element))
    .map((element) => ({ field, value: element.text, line: source.getLineAndCharacterOfPosition(element.getStart(source)).line + 1 }));
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
