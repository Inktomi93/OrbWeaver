// The post-transform diagnostic guard: compiler-world routing + an in-memory transformed-source host.
import { resolve } from "node:path";
import { warn } from "@orb/tooling/_shared/log";
import { predictedProgram, requiresExclusiveRoot } from "@orb/tooling/_shared/project-worlds";
import type { Project, SourceFile } from "ts-morph";
import ts from "typescript";
import type { CompilerProgram } from "../../_shared/compiler-programs.ts";
import type { FileSnapshot, ProgramDiagnosticBaseline } from "../contract/types.ts";
import { CodemodError } from "./errors.ts";
import { physicalPathIdentity, repoRelative } from "./plans.ts";
import { repoPhysicalIdentity, scriptKind } from "./program-consumers.ts";

interface DiagnosticScope {
  readonly rootAdditionsByProgram: ReadonlyMap<string, ReadonlySet<string>>;
  readonly affectedPaths: ReadonlySet<string>;
  readonly deletedPaths: ReadonlySet<string>;
  readonly fullProgramIds: ReadonlySet<string>;
}

const DIAGNOSTIC_DETAIL_LIMIT = 20;

function compare(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function reverseConsumerClosure(seeds: readonly SourceFile[]): readonly SourceFile[] {
  const pending = [...seeds];
  const seen = new Set<SourceFile>();
  while (pending.length > 0) {
    const sourceFile = pending.shift();
    if (sourceFile === undefined || seen.has(sourceFile)) {
      continue;
    }
    seen.add(sourceFile);
    pending.push(...sourceFile.getReferencingSourceFiles());
  }
  return [...seen];
}

function addProgramPath(pathsByProgram: Map<string, Set<string>>, programId: string, absolutePath: string): void {
  const paths = pathsByProgram.get(programId) ?? new Set<string>();
  paths.add(absolutePath);
  pathsByProgram.set(programId, paths);
}

function addProgramRoot(rootsByPath: Map<string, string[]>, programId: string, file: string, repoRoot: string): void {
  const identities = new Set([file, repoRelative(physicalPathIdentity(resolve(repoRoot, file), repoRoot), repoRoot)]);
  for (const identity of identities) {
    const owners = rootsByPath.get(identity) ?? [];
    if (!owners.includes(programId)) {
      owners.push(programId);
    }
    rootsByPath.set(identity, owners);
  }
}

function strictPostRootProgramIds(relativePath: string, subject: string, rooted: readonly string[]): readonly string[] {
  if (rooted.length === 0) {
    throw new CodemodError(`No authored compiler program owns ${subject} ${relativePath}.`, "The post-transform authored config roots do not include it.");
  }
  if (requiresExclusiveRoot(relativePath) && rooted.length > 1) {
    throw new CodemodError(
      `Conflicting compiler ownership for ${relativePath}: rooted=${rooted.join(", ")}.`,
      "A moved test/harness destination must have exactly one post-transform authored root owner.",
    );
  }
  return rooted;
}

/** Existing exclusive roots are current authored truth during a staged migration; the predictive world
 * becomes authoritative only where no root exists yet. Multiple current roots remain ambiguous. */
function exclusiveProgramIds(opts: {
  relativePath: string;
  rooted: readonly string[];
  containing: readonly string[];
  intended: string | undefined;
  available: ReadonlySet<string>;
}): readonly string[] {
  const { relativePath, rooted, containing, intended, available } = opts;
  if (rooted.length > 1) {
    throw new CodemodError(
      `Conflicting compiler ownership for ${relativePath}: intended=${intended ?? "none"}, rooted=${rooted.join(", ")}.`,
      "An existing test/harness path may have one rooted compiler owner and multiple legitimate containing compiler closures.",
    );
  }
  const actual = [...new Set([...rooted, ...containing])];
  if (actual.length > 0) {
    return actual;
  }
  if (intended !== undefined && available.has(intended)) {
    return [intended];
  }
  throw new CodemodError(
    `Conflicting compiler ownership for ${relativePath}: intended=${intended ?? "none"}, rooted=none.`,
    "An unchanged existing test/harness path must have one rooted compiler owner; intended ownership is the final fallback only when no authored root or containing closure owns that existing path.",
  );
}

function rootedProgramIds(opts: {
  relativePath: string;
  actual: readonly string[];
  containing: readonly string[];
  intended: string | undefined;
  available: ReadonlySet<string>;
}): readonly string[] {
  const { relativePath, actual, containing, intended, available } = opts;
  if (requiresExclusiveRoot(relativePath)) {
    return exclusiveProgramIds({ relativePath, rooted: actual, containing, intended, available });
  }
  const authored = [...new Set([...actual, ...containing])];
  if (authored.length === 0) {
    if (intended === undefined || !available.has(intended)) {
      throw new CodemodError(
        `No authored compiler program owns ${relativePath}.`,
        "Place the file in a compiler-owned path or add the missing authored program before running this codemod.",
      );
    }
    return [intended];
  }
  // Existing authored roots are the diagnostic authority during staged migration. Predictive ownership
  // describes the destination state; it must not block the prerequisite edit that makes that state true.
  return authored;
}

function programIdsForPath(opts: {
  relativePath: string;
  originalRelativePath?: string;
  created: boolean;
  programs: readonly CompilerProgram[];
  programsByRootFile: ReadonlyMap<string, readonly string[]>;
  containingProgramIds: readonly string[];
}): readonly string[] {
  const { relativePath, originalRelativePath, created, programs, programsByRootFile, containingProgramIds } = opts;
  const available = new Set(programs.map((program) => program.id));
  const actual = programsByRootFile.get(relativePath) ?? [];
  if (originalRelativePath !== undefined) {
    return strictPostRootProgramIds(relativePath, "moved destination", actual);
  }
  if (created) {
    return strictPostRootProgramIds(relativePath, "created path", actual);
  }
  return rootedProgramIds({ relativePath, actual, containing: containingProgramIds, intended: predictedProgram(relativePath), available });
}

function diagnosticScope(opts: {
  project: Project;
  snapshots: ReadonlyMap<string, FileSnapshot>;
  relocations: ReadonlyMap<string, string>;
  affectedPaths: ReadonlySet<string>;
  globalProgramIdsByPath: ReadonlyMap<string, ReadonlySet<string>>;
  containingProgramIdsByPath: ReadonlyMap<string, ReadonlySet<string>>;
  repoRoot: string;
  programs: readonly CompilerProgram[];
}): DiagnosticScope {
  const { project, snapshots, relocations, affectedPaths, globalProgramIdsByPath, containingProgramIdsByPath, repoRoot, programs } = opts;
  const currentByPath = new Map<string, SourceFile>(project.getSourceFiles().map((sourceFile) => [sourceFile.getFilePath(), sourceFile]));
  const seeds = [...snapshots.keys()].flatMap((path) => {
    const sourceFile = currentByPath.get(path);
    return sourceFile === undefined ? [] : [sourceFile];
  });
  const programsByRootFile = new Map<string, string[]>();
  for (const program of programs) {
    for (const file of program.files) {
      addProgramRoot(programsByRootFile, program.id, file, repoRoot);
    }
  }
  const rootAdditionsByProgram = new Map<string, Set<string>>();
  const affected = new Set(affectedPaths);
  for (const sourceFile of reverseConsumerClosure(seeds)) {
    const absolutePath = sourceFile.getFilePath();
    affected.add(absolutePath);
    const relativePath = repoRelative(absolutePath, repoRoot);
    const original = relocations.get(absolutePath);
    const created = snapshots.get(absolutePath)?.wasCreated === true && original === undefined;
    const ids = programIdsForPath({
      relativePath,
      ...(original !== undefined ? { originalRelativePath: repoRelative(original, repoRoot) } : {}),
      created,
      programs,
      programsByRootFile,
      containingProgramIds: [...(containingProgramIdsByPath.get(physicalPathIdentity(absolutePath, repoRoot)) ?? [])],
    });
    for (const id of ids) {
      addProgramPath(rootAdditionsByProgram, id, absolutePath);
    }
  }
  const deletedPaths = new Set([...snapshots.keys()].filter((path) => !currentByPath.has(path)));
  const fullProgramIds = new Set<string>();
  for (const path of affected) {
    const baselinePath = relocations.get(path) ?? path;
    for (const programId of globalProgramIdsByPath.get(physicalPathIdentity(baselinePath, repoRoot)) ?? []) {
      fullProgramIds.add(programId);
    }
  }
  return { rootAdditionsByProgram, affectedPaths: affected, deletedPaths, fullProgramIds };
}

function transformedOverlay(project: Project, repoRoot: string): ReadonlyMap<string, string> {
  const entries = new Map<string, { readonly text: string; readonly changed: boolean }>();
  for (const sourceFile of project.getSourceFiles()) {
    const identity = repoPhysicalIdentity(sourceFile.getFilePath(), repoRoot);
    if (identity === undefined) {
      continue;
    }
    const changed = !sourceFile.isSaved();
    const existing = entries.get(identity);
    if (existing?.changed === true && !changed) {
      continue;
    }
    entries.set(identity, { text: sourceFile.getFullText(), changed });
  }
  return new Map([...entries].map(([identity, entry]) => [identity, entry.text]));
}

function transformedCompilerHost(opts: { project: Project; program: CompilerProgram; deletedPaths: ReadonlySet<string>; repoRoot: string }): ts.CompilerHost {
  const { project, program, deletedPaths, repoRoot } = opts;
  const overlay = transformedOverlay(project, repoRoot);
  const deleted = new Set([...deletedPaths].map((path) => physicalPathIdentity(path, repoRoot)));
  const virtualDirectories = new Set<string>();
  for (const path of overlay.keys()) {
    let parent = resolve(path, "..");
    while (!virtualDirectories.has(parent)) {
      virtualDirectories.add(parent);
      const next = resolve(parent, "..");
      if (next === parent) {
        break;
      }
      parent = next;
    }
  }
  const host = ts.createCompilerHost(program.commandLine.options, true);
  const baseFileExists = host.fileExists.bind(host);
  const baseReadFile = host.readFile.bind(host);
  const baseGetSourceFile = host.getSourceFile.bind(host);
  const baseDirectoryExists = host.directoryExists?.bind(host);
  const baseRealpath = host.realpath?.bind(host);
  const authoredIdentity = (fileName: string): string | undefined => repoPhysicalIdentity(fileName, repoRoot);
  host.fileExists = (fileName): boolean => {
    const identity = authoredIdentity(fileName);
    return (identity === undefined || !deleted.has(identity)) && (identity !== undefined && overlay.has(identity) ? true : baseFileExists(fileName));
  };
  host.readFile = (fileName): string | undefined => {
    const identity = authoredIdentity(fileName);
    if (identity !== undefined && deleted.has(identity)) {
      return;
    }
    return (identity === undefined ? undefined : overlay.get(identity)) ?? baseReadFile(fileName);
  };
  host.directoryExists = (directoryName): boolean => {
    const identity = authoredIdentity(directoryName);
    return (identity !== undefined && virtualDirectories.has(identity)) || baseDirectoryExists?.(directoryName) === true;
  };
  host.realpath = (fileName): string => authoredIdentity(fileName) ?? baseRealpath?.(fileName) ?? fileName;
  host.getSourceFile = (fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile): ts.SourceFile | undefined => {
    const identity = authoredIdentity(fileName);
    if (identity !== undefined && deleted.has(identity)) {
      return;
    }
    const text = identity === undefined ? undefined : overlay.get(identity);
    if (text === undefined) {
      return baseGetSourceFile(fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile);
    }
    const createOptions: ts.CreateSourceFileOptions =
      typeof languageVersionOrOptions === "number" ? { languageVersion: languageVersionOrOptions } : languageVersionOrOptions;
    return ts.createSourceFile(
      fileName,
      text,
      {
        ...createOptions,
        impliedNodeFormat: createOptions.impliedNodeFormat ?? ts.getImpliedNodeFormatForFile(fileName, undefined, host, program.commandLine.options),
      },
      true,
      scriptKind(fileName),
    );
  };
  return host;
}

function errorIdentity(programId: string, diagnostic: ts.DiagnosticWithLocation): string {
  return `${programId}\0${diagnostic.file.fileName}\0${diagnostic.start}\0${diagnostic.code}\0${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`;
}

function hasLocation(diagnostic: ts.Diagnostic): diagnostic is ts.DiagnosticWithLocation {
  const file: ts.SourceFile | undefined = diagnostic.file;
  const start: number | undefined = diagnostic.start;
  const length: number | undefined = diagnostic.length;
  return file !== undefined && start !== undefined && length !== undefined;
}

function programContainsAffectedPath(program: ts.Program, affectedPaths: ReadonlySet<string>, repoRoot: string): boolean {
  const affected = new Set([...affectedPaths].map((path) => physicalPathIdentity(path, repoRoot)));
  return program.getSourceFiles().some((sourceFile) => {
    const identity = repoPhysicalIdentity(sourceFile.fileName, repoRoot);
    return identity !== undefined && affected.has(identity);
  });
}

function collectProgramErrors(opts: {
  compilerProgram: CompilerProgram;
  scope: DiagnosticScope;
  project: Project;
  repoRoot: string;
}): ReadonlyMap<string, string> {
  const { compilerProgram, scope, project, repoRoot } = opts;
  const rootAdditions = scope.rootAdditionsByProgram.get(compilerProgram.id) ?? [];
  const configuredRoots = compilerProgram.commandLine.fileNames.filter((path) => !scope.deletedPaths.has(resolve(path)));
  const configuredIdentities = new Set(configuredRoots.map((path) => physicalPathIdentity(path, repoRoot)));
  const rootNames = [...configuredRoots, ...[...rootAdditions].filter((path) => !configuredIdentities.has(physicalPathIdentity(path, repoRoot)))];
  const host = transformedCompilerHost({ project, program: compilerProgram, deletedPaths: scope.deletedPaths, repoRoot });
  const program = ts.createProgram({
    rootNames,
    options: compilerProgram.commandLine.options,
    host,
    ...(compilerProgram.commandLine.projectReferences !== undefined ? { projectReferences: compilerProgram.commandLine.projectReferences } : {}),
    configFileParsingDiagnostics: compilerProgram.commandLine.errors,
  });
  const errors = new Map<string, string>();
  if (!(scope.fullProgramIds.has(compilerProgram.id) || programContainsAffectedPath(program, scope.affectedPaths, repoRoot))) {
    return errors;
  }
  // One native verdict over the affected program keeps conditional exports, resolution attributes,
  // path/type references and every imported closure in TypeScript's own dependency vocabulary.
  for (const diagnostic of ts.getPreEmitDiagnostics(program)) {
    if (diagnostic.category !== ts.DiagnosticCategory.Error) {
      continue;
    }
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
    const location = hasLocation(diagnostic) ? `${repoRelative(diagnostic.file.fileName, repoRoot)}@${diagnostic.start}` : "<program>";
    const identity = hasLocation(diagnostic)
      ? errorIdentity(compilerProgram.id, diagnostic)
      : `${compilerProgram.id}\0<program>\0${diagnostic.code}\0${message}`;
    errors.set(identity, `${compilerProgram.id}: ${location} TS${diagnostic.code} ${message}`);
  }
  return errors;
}

/** Count the full native post-transform TypeScript errors in every authored compiler program reached by
 *  a changed path, its pre-transform consumers, or a global-effect source. */
export function countProgramDiagnostics(opts: {
  project: Project;
  snapshots: ReadonlyMap<string, FileSnapshot>;
  relocations: ReadonlyMap<string, string>;
  affectedPaths: ReadonlySet<string>;
  repoRoot: string;
  baseline: ProgramDiagnosticBaseline;
  postPrograms: readonly CompilerProgram[];
}): number {
  const { project, snapshots, relocations, affectedPaths, repoRoot, baseline, postPrograms } = opts;
  if (snapshots.size === 0) {
    return 0;
  }
  const scope = diagnosticScope({
    project,
    snapshots,
    relocations,
    affectedPaths,
    globalProgramIdsByPath: baseline.globalProgramIdsByPath,
    containingProgramIdsByPath: baseline.containingProgramIdsByPath,
    repoRoot,
    programs: postPrograms,
  });
  const errors = new Map<string, string>();
  for (const compilerProgram of postPrograms) {
    for (const [identity, detail] of collectProgramErrors({ compilerProgram, scope, project, repoRoot })) {
      errors.set(identity, detail);
    }
  }
  if (errors.size > 0) {
    const details = [...errors.values()].toSorted(compare);
    const omitted = details.length - DIAGNOSTIC_DETAIL_LIMIT;
    warn(`${details.slice(0, DIAGNOSTIC_DETAIL_LIMIT).join("\n")}${omitted > 0 ? `\n… ${omitted} more diagnostic(s) omitted` : ""}\n`);
  }
  return errors.size;
}
