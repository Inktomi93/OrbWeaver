// Native pre-transform dependency census. This stays independent of the edit Project's replaceGlobs.
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import ts from "typescript";
import type { CompilerProgram } from "#verify";
import type { ProgramDiagnosticBaseline } from "../contract/types.ts";
import { physicalPathIdentity } from "./plans.ts";

export function repoAbsolute(fileName: string, repoRoot: string): string | undefined {
  const absolute = resolve(fileName);
  const rel = relative(repoRoot, absolute);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel) || rel.split(sep).includes("node_modules")) {
    return;
  }
  return absolute;
}

function declarationModuleLiteral(node: ts.Node): ts.StringLiteralLike | undefined {
  const moduleSpecifier = ts.isImportDeclaration(node) || ts.isExportDeclaration(node) ? node.moduleSpecifier : undefined;
  return moduleSpecifier !== undefined && ts.isStringLiteralLike(moduleSpecifier) ? moduleSpecifier : undefined;
}

function importEqualsModuleLiteral(node: ts.Node): ts.StringLiteralLike | undefined {
  const expression = ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) ? node.moduleReference.expression : undefined;
  return expression !== undefined && ts.isStringLiteralLike(expression) ? expression : undefined;
}

function importTypeModuleLiteral(node: ts.Node): ts.StringLiteralLike | undefined {
  const literal = ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) ? node.argument.literal : undefined;
  return literal !== undefined && ts.isStringLiteralLike(literal) ? literal : undefined;
}

function dynamicImportModuleLiteral(node: ts.Node): ts.StringLiteralLike | undefined {
  const argument = ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword ? node.arguments[0] : undefined;
  return argument !== undefined && ts.isStringLiteralLike(argument) ? argument : undefined;
}

function moduleSpecifierLiteral(node: ts.Node): ts.StringLiteralLike | undefined {
  return declarationModuleLiteral(node) ?? importEqualsModuleLiteral(node) ?? importTypeModuleLiteral(node) ?? dynamicImportModuleLiteral(node);
}

function moduleSpecifierLiterals(sourceFile: ts.SourceFile): readonly ts.StringLiteralLike[] {
  const literals: ts.StringLiteralLike[] = [];
  const visit = (node: ts.Node): void => {
    const literal = moduleSpecifierLiteral(node);
    if (literal !== undefined) {
      literals.push(literal);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  return literals;
}

export function scriptKind(fileName: string): ts.ScriptKind {
  if (fileName.endsWith(".tsx")) {
    return ts.ScriptKind.TSX;
  }
  if (fileName.endsWith(".jsx")) {
    return ts.ScriptKind.JSX;
  }
  if (fileName.endsWith(".js") || fileName.endsWith(".mjs") || fileName.endsWith(".cjs")) {
    return ts.ScriptKind.JS;
  }
  if (fileName.endsWith(".json")) {
    return ts.ScriptKind.JSON;
  }
  return ts.ScriptKind.TS;
}

export function hasGlobalEffect(sourceFile: ts.SourceFile): boolean {
  if (sourceFile.isDeclarationFile || !ts.isExternalModule(sourceFile)) {
    return true;
  }
  let found = false;
  const visit = (node: ts.Node): void => {
    // `declare global`, ambient namespaces, and `declare module "specifier"` augmentations can all
    // change files that import something else (or nothing), so module-edge closure cannot bound them.
    if (ts.isModuleDeclaration(node)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  return found;
}

function addConsumer(consumers: Map<string, Set<string>>, target: string, consumer: string): void {
  const paths = consumers.get(target) ?? new Set<string>();
  paths.add(consumer);
  consumers.set(target, paths);
}

function addGlobalProgram(globalPrograms: Map<string, Set<string>>, path: string, programId: string): void {
  const ids = globalPrograms.get(path) ?? new Set<string>();
  ids.add(programId);
  globalPrograms.set(path, ids);
}

function resolvedProgramTarget(opts: {
  literal: ts.StringLiteralLike;
  sourceFile: ts.SourceFile;
  fileName: string;
  program: ts.Program;
  cache: ts.ModuleResolutionCache;
  repoRoot: string;
}): string | undefined {
  const { literal, sourceFile, fileName, program, cache, repoRoot } = opts;
  const compilerOptions = program.getCompilerOptions();
  const mode = program.getModeForUsageLocation(sourceFile, literal);
  const resolved = ts.resolveModuleName(literal.text, fileName, compilerOptions, ts.sys, cache, undefined, mode).resolvedModule?.resolvedFileName;
  const targetPath = resolved === undefined ? undefined : repoAbsolute(resolved, repoRoot);
  return targetPath === undefined ? undefined : physicalPathIdentity(targetPath, repoRoot);
}

function collectPathReferenceConsumers(sourceFile: ts.SourceFile, consumer: string, repoRoot: string, consumers: Map<string, Set<string>>): void {
  for (const reference of sourceFile.referencedFiles) {
    const targetPath = repoAbsolute(resolve(dirname(sourceFile.fileName), reference.fileName), repoRoot);
    if (targetPath !== undefined) {
      addConsumer(consumers, physicalPathIdentity(targetPath, repoRoot), consumer);
    }
  }
}

function collectProgramConsumers(
  compilerProgram: CompilerProgram,
  repoRoot: string,
  consumers: Map<string, Set<string>>,
  globalPrograms: Map<string, Set<string>>,
): void {
  const options = compilerProgram.commandLine.options;
  const host = ts.createCompilerHost(options, true);
  const program = ts.createProgram({
    rootNames: compilerProgram.commandLine.fileNames,
    options,
    host,
    ...(compilerProgram.commandLine.projectReferences !== undefined ? { projectReferences: compilerProgram.commandLine.projectReferences } : {}),
    configFileParsingDiagnostics: compilerProgram.commandLine.errors,
  });
  const cache = ts.createModuleResolutionCache(repoRoot, (fileName) => (ts.sys.useCaseSensitiveFileNames ? fileName : fileName.toLowerCase()), options);
  for (const sourceFile of program.getSourceFiles()) {
    const fileName = sourceFile.fileName;
    const consumer = repoAbsolute(fileName, repoRoot);
    if (consumer === undefined) {
      continue;
    }
    if (hasGlobalEffect(sourceFile)) {
      addGlobalProgram(globalPrograms, physicalPathIdentity(consumer, repoRoot), compilerProgram.id);
    }
    for (const literal of moduleSpecifierLiterals(sourceFile)) {
      const target = resolvedProgramTarget({ literal, sourceFile, fileName, program, cache, repoRoot });
      if (target !== undefined) {
        addConsumer(consumers, target, consumer);
      }
    }
    collectPathReferenceConsumers(sourceFile, consumer, repoRoot, consumers);
  }
}

/** Capture authored module edges before any Plan can mutate or delete their targets. The compiler
 *  program file sets come from the shared native config parser and do not inherit replaceGlobs. */
export function createProgramDiagnosticBaseline(repoRoot: string, programs: readonly CompilerProgram[]): ProgramDiagnosticBaseline {
  const consumers = new Map<string, Set<string>>();
  const globalPrograms = new Map<string, Set<string>>();
  for (const program of programs) {
    collectProgramConsumers(program, repoRoot, consumers, globalPrograms);
  }
  return { programs, consumersByPath: consumers, globalProgramIdsByPath: globalPrograms };
}
