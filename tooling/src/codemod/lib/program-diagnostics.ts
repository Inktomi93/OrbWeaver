// The post-transform diagnostic guard: compiler-world routing + an in-memory transformed-source host.
import { resolve } from "node:path";
import { warn } from "@orb/tooling/_shared/log";
import { predictedProgram, requiresExclusiveRoot } from "@orb/tooling/_shared/project-worlds";
import type { Project, SourceFile } from "ts-morph";
import ts from "typescript";
import type { CompilerProgram } from "#verify";
import type { FileSnapshot, ProgramDiagnosticBaseline } from "../contract/types.ts";
import { CodemodError } from "./errors.ts";
import { physicalPathIdentity, repoRelative } from "./plans.ts";
import { hasGlobalEffect, repoAbsolute, scriptKind } from "./program-consumers.ts";

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

function relocatedProgramIds(relativePath: string, originalRelativePath: string, available: ReadonlySet<string>): readonly string[] {
  const intended = predictedProgram(relativePath);
  if (intended === undefined || !available.has(intended)) {
    throw new CodemodError(
      `No authored compiler program owns moved destination ${relativePath}.`,
      `Move it to a path with a declared compiler world; previous path was ${originalRelativePath}.`,
    );
  }
  return [intended];
}

function exclusiveProgramIds(relativePath: string, actual: readonly string[], intended: string | undefined, available: ReadonlySet<string>): readonly string[] {
  if (actual.length === 0 && intended !== undefined && available.has(intended)) {
    return [intended];
  }
  if (actual.length !== 1 || intended === undefined || actual[0] !== intended) {
    throw new CodemodError(
      `Conflicting compiler ownership for ${relativePath}: intended=${intended ?? "none"}, rooted=${actual.length === 0 ? "none" : actual.join(", ")}.`,
      "A test/harness path must have exactly one rooted compiler owner, matching its declared world.",
    );
  }
  return actual;
}

function rootedProgramIds(opts: {
  relativePath: string;
  actual: readonly string[];
  intended: string | undefined;
  available: ReadonlySet<string>;
}): readonly string[] {
  const { relativePath, actual, intended, available } = opts;
  if (requiresExclusiveRoot(relativePath)) {
    return exclusiveProgramIds(relativePath, actual, intended, available);
  }
  if (actual.length === 0) {
    if (intended === undefined || !available.has(intended)) {
      throw new CodemodError(
        `No authored compiler program owns ${relativePath}.`,
        "Place the file in a compiler-owned path or add the missing authored program before running this codemod.",
      );
    }
    return [intended];
  }
  if (intended !== undefined && !actual.includes(intended)) {
    throw new CodemodError(
      `Compiler ownership disagrees for ${relativePath}: intended=${intended}, rooted=${actual.join(", ")}.`,
      "Repair the compiler-world membership before applying a transform; diagnostics will not guess between worlds.",
    );
  }
  return actual;
}

function programIdsForPath(opts: {
  relativePath: string;
  originalRelativePath?: string;
  programs: readonly CompilerProgram[];
  programsByRootFile: ReadonlyMap<string, readonly string[]>;
}): readonly string[] {
  const { relativePath, originalRelativePath, programs, programsByRootFile } = opts;
  const available = new Set(programs.map((program) => program.id));
  if (originalRelativePath !== undefined) {
    return relocatedProgramIds(relativePath, originalRelativePath, available);
  }
  const actual = programsByRootFile.get(relativePath) ?? [];
  return rootedProgramIds({ relativePath, actual, intended: predictedProgram(relativePath), available });
}

function diagnosticScope(opts: {
  project: Project;
  snapshots: ReadonlyMap<string, FileSnapshot>;
  relocations: ReadonlyMap<string, string>;
  affectedPaths: ReadonlySet<string>;
  globalProgramIdsByPath: ReadonlyMap<string, ReadonlySet<string>>;
  repoRoot: string;
  programs: readonly CompilerProgram[];
}): DiagnosticScope {
  const { project, snapshots, relocations, affectedPaths, globalProgramIdsByPath, repoRoot, programs } = opts;
  const currentByPath = new Map<string, SourceFile>(project.getSourceFiles().map((sourceFile) => [sourceFile.getFilePath(), sourceFile]));
  const seeds = [...snapshots.keys()].flatMap((path) => {
    const sourceFile = currentByPath.get(path);
    return sourceFile === undefined ? [] : [sourceFile];
  });
  const programsByRootFile = new Map<string, string[]>();
  for (const program of programs) {
    for (const file of program.files) {
      const owners = programsByRootFile.get(file) ?? [];
      owners.push(program.id);
      programsByRootFile.set(file, owners);
    }
  }
  const rootAdditionsByProgram = new Map<string, Set<string>>();
  const affected = new Set(affectedPaths);
  for (const sourceFile of reverseConsumerClosure(seeds)) {
    const absolutePath = sourceFile.getFilePath();
    affected.add(absolutePath);
    const relativePath = repoRelative(absolutePath, repoRoot);
    const original = relocations.get(absolutePath);
    const ids = programIdsForPath({
      relativePath,
      ...(original !== undefined ? { originalRelativePath: repoRelative(original, repoRoot) } : {}),
      programs,
      programsByRootFile,
    });
    for (const id of ids) {
      addProgramPath(rootAdditionsByProgram, id, absolutePath);
    }
  }
  const deletedPaths = new Set([...snapshots.keys()].filter((path) => !currentByPath.has(path)));
  const fullProgramIds = new Set<string>();
  for (const path of affected) {
    for (const programId of globalProgramIdsByPath.get(physicalPathIdentity(path, repoRoot)) ?? []) {
      fullProgramIds.add(programId);
    }
  }
  return { rootAdditionsByProgram, affectedPaths: affected, deletedPaths, fullProgramIds };
}

function transformedOverlay(project: Project, repoRoot: string): ReadonlyMap<string, string> {
  const entries = new Map<string, { readonly text: string; readonly changed: boolean }>();
  for (const sourceFile of project.getSourceFiles()) {
    const identity = physicalPathIdentity(sourceFile.getFilePath(), repoRoot);
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
  host.fileExists = (fileName): boolean => {
    const authored = repoAbsolute(fileName, repoRoot);
    const identity = authored === undefined ? undefined : physicalPathIdentity(authored, repoRoot);
    return (identity === undefined || !deleted.has(identity)) && (identity !== undefined && overlay.has(identity) ? true : baseFileExists(fileName));
  };
  host.readFile = (fileName): string | undefined => {
    const authored = repoAbsolute(fileName, repoRoot);
    const identity = authored === undefined ? undefined : physicalPathIdentity(authored, repoRoot);
    if (identity !== undefined && deleted.has(identity)) {
      return;
    }
    return (identity === undefined ? undefined : overlay.get(identity)) ?? baseReadFile(fileName);
  };
  host.directoryExists = (directoryName): boolean => virtualDirectories.has(resolve(directoryName)) || baseDirectoryExists?.(directoryName) === true;
  host.getSourceFile = (fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile): ts.SourceFile | undefined => {
    const authored = repoAbsolute(fileName, repoRoot);
    const identity = authored === undefined ? undefined : physicalPathIdentity(authored, repoRoot);
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

function affectedProgramSources(
  program: ts.Program,
  affectedPaths: ReadonlySet<string>,
  repoRoot: string,
  forceFullProgram: boolean,
): readonly ts.SourceFile[] {
  const sourceByPhysicalPath = new Map(
    program.getSourceFiles().flatMap((sourceFile) => {
      const authored = repoAbsolute(sourceFile.fileName, repoRoot);
      return authored === undefined ? [] : [[physicalPathIdentity(authored, repoRoot), sourceFile] as const];
    }),
  );
  const affected = [...affectedPaths].flatMap((path) => {
    const sourceFile = sourceByPhysicalPath.get(physicalPathIdentity(path, repoRoot));
    return sourceFile === undefined ? [] : [sourceFile];
  });
  if (!(forceFullProgram || affected.some(hasGlobalEffect))) {
    return affected;
  }
  return program.getSourceFiles().filter((sourceFile) => repoAbsolute(sourceFile.fileName, repoRoot) !== undefined);
}

function collectProgramErrors(opts: {
  compilerProgram: CompilerProgram;
  scope: DiagnosticScope;
  project: Project;
  repoRoot: string;
}): ReadonlyMap<string, string> {
  const { compilerProgram, scope, project, repoRoot } = opts;
  const rootAdditions = scope.rootAdditionsByProgram.get(compilerProgram.id) ?? [];
  const rootNames = [...new Set([...compilerProgram.commandLine.fileNames.filter((path) => !scope.deletedPaths.has(resolve(path))), ...rootAdditions])];
  const host = transformedCompilerHost({ project, program: compilerProgram, deletedPaths: scope.deletedPaths, repoRoot });
  const program = ts.createProgram({
    rootNames,
    options: compilerProgram.commandLine.options,
    host,
    ...(compilerProgram.commandLine.projectReferences !== undefined ? { projectReferences: compilerProgram.commandLine.projectReferences } : {}),
    configFileParsingDiagnostics: compilerProgram.commandLine.errors,
  });
  const errors = new Map<string, string>();
  for (const sourceFile of affectedProgramSources(program, scope.affectedPaths, repoRoot, scope.fullProgramIds.has(compilerProgram.id))) {
    const diagnostics = [
      ...program.getSyntacticDiagnostics(sourceFile),
      ...program.getSemanticDiagnostics(sourceFile),
      ...program.getDeclarationDiagnostics(sourceFile),
    ];
    for (const diagnostic of diagnostics) {
      if (diagnostic.category !== ts.DiagnosticCategory.Error || !hasLocation(diagnostic)) {
        continue;
      }
      errors.set(
        errorIdentity(compilerProgram.id, diagnostic),
        `${compilerProgram.id}: ${repoRelative(diagnostic.file.fileName, repoRoot)}@${diagnostic.start} TS${diagnostic.code} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`,
      );
    }
  }
  return errors;
}

/** Count post-transform TypeScript errors in the files and real consumers affected by the transform,
 *  under each authored compiler program that owns those paths. */
export function countProgramDiagnostics(opts: {
  project: Project;
  snapshots: ReadonlyMap<string, FileSnapshot>;
  relocations: ReadonlyMap<string, string>;
  affectedPaths: ReadonlySet<string>;
  repoRoot: string;
  baseline: ProgramDiagnosticBaseline;
}): number {
  const { project, snapshots, relocations, affectedPaths, repoRoot, baseline } = opts;
  if (snapshots.size === 0) {
    return 0;
  }
  const { programs } = baseline;
  const scope = diagnosticScope({
    project,
    snapshots,
    relocations,
    affectedPaths,
    globalProgramIdsByPath: baseline.globalProgramIdsByPath,
    repoRoot,
    programs,
  });
  const errors = new Map<string, string>();
  for (const compilerProgram of programs) {
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
