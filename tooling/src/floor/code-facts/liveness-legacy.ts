// Legacy tests stay outside semantic extraction (D320), so a stored corpus never sees them consume anything.
// Their reach comes from a syntax-only import scan resolved by the legacy programs' own module resolution.
import { existsSync } from "node:fs";
import { dirname, relative } from "node:path";
import type { SourceFile } from "ts-morph";
import ts from "typescript";
import { LEGACY_TEST_WORLD_PROGRAMS } from "../compiler/project-worlds.ts";
import type { SourceCorpus } from "../compiler/ts-workspace.ts";
import { isLegacyTestPath } from "../testing/test-population.ts";
import type { LegacyConsumption } from "./liveness-contract.ts";
import { LivenessRefusalError } from "./liveness-contract.ts";
import { inventoryDeclarationKey, inventoryExports, semanticInventoryOf } from "./semantic-inventory-reader.ts";

function parsedLegacyProgram(config: string): ts.ParsedCommandLine {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    config,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new LivenessRefusalError(`legacy liveness cannot read ${config}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`);
      },
    },
  );
  if (parsed === undefined) {
    throw new LivenessRefusalError(`legacy liveness cannot read ${config}`);
  }
  return parsed;
}

interface LegacyImport {
  readonly specifier: string;
  readonly line: number;
  // undefined marks a whole-surface arm: `import * as`, or `import()`.
  readonly names: readonly string[] | undefined;
}

function staticImport(statement: ts.ImportDeclaration, source: ts.SourceFile): LegacyImport | undefined {
  const clause = statement.importClause;
  if (!ts.isStringLiteral(statement.moduleSpecifier) || clause === undefined) {
    return;
  }
  const line = source.getLineAndCharacterOfPosition(statement.getStart(source)).line + 1;
  const bindings = clause.namedBindings;
  if (bindings !== undefined && ts.isNamespaceImport(bindings)) {
    return { specifier: statement.moduleSpecifier.text, line, names: undefined };
  }
  const named = bindings === undefined ? [] : bindings.elements.map((element) => (element.propertyName ?? element.name).text);
  return { specifier: statement.moduleSpecifier.text, line, names: clause.name === undefined ? named : ["default", ...named] };
}

// Re-export pass-throughs never consume; a side-effect import binds no member.
function legacyImports(source: ts.SourceFile): LegacyImport[] {
  const imports: LegacyImport[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const found = staticImport(node, source);
      if (found !== undefined) {
        imports.push(found);
      }
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [specifier] = node.arguments;
      if (specifier !== undefined && ts.isStringLiteral(specifier)) {
        imports.push({ specifier: specifier.text, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, names: undefined });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return imports;
}

const PACKAGE_SOURCE_RE = /\/packages\/[^/]+\/src\//u;
const PROJECT_SPECIFIER_RE = /^(?:\.|@orb\/|#)/u;

interface LegacyProgram {
  readonly options: ts.CompilerOptions;
  readonly cache: ts.ModuleResolutionCache;
}

// A project specifier that resolves nowhere, or to package source the corpus lacks, is an unknown, never a clean zero.
function legacyTarget(project: SourceCorpus, program: LegacyProgram, file: string, specifier: string): SourceFile | undefined {
  const resolved = ts.resolveModuleName(specifier, file, program.options, ts.sys, program.cache).resolvedModule?.resolvedFileName;
  if (resolved === undefined) {
    if (PROJECT_SPECIFIER_RE.test(specifier)) {
      throw new LivenessRefusalError(`legacy import ${specifier} in ${file} resolves to no module`);
    }
    return;
  }
  const target = project.getSourceFile(resolved);
  if (target === undefined && PACKAGE_SOURCE_RE.test(resolved)) {
    throw new LivenessRefusalError(`legacy import ${specifier} in ${file} resolves to ${resolved}, which the stored corpus does not hold`);
  }
  return target;
}

function legacyFileConsumptions(project: SourceCorpus, program: LegacyProgram, file: string): LegacyConsumption[] {
  const text = ts.sys.readFile(file);
  if (text === undefined) {
    throw new LivenessRefusalError(`legacy liveness cannot read ${file}`);
  }
  return legacyImports(ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)).flatMap((found) => {
    const target = legacyTarget(project, program, file, found.specifier);
    if (target === undefined) {
      return [];
    }
    const exported = inventoryExports(target);
    const declarations = found.names === undefined ? [...exported.values()].flat() : found.names.flatMap((name) => exported.get(name) ?? []);
    return declarations.map((declaration) => ({ originKey: inventoryDeclarationKey(declaration), file, line: found.line }));
  });
}

/** Every origin a legacy test imports, when `project` is a stored corpus that omits the legacy programs. A native
 *  corpus holds whatever legacy sources it loaded and reads them as ordinary consumers. */
export function legacyConsumptions(project: SourceCorpus): readonly LegacyConsumption[] {
  const inventory = semanticInventoryOf(project);
  if (inventory === undefined) {
    return [];
  }
  return Object.values(LEGACY_TEST_WORLD_PROGRAMS).flatMap((program) => {
    const config = inventory.canonicalPath(program);
    // A repository without this legacy program has no legacy sources to count.
    if (!existsSync(config)) {
      return [];
    }
    const root = dirname(config);
    const parsed = parsedLegacyProgram(config);
    const legacy = { options: parsed.options, cache: ts.createModuleResolutionCache(root, (path) => path, parsed.options) };
    return parsed.fileNames
      .filter((file) => isLegacyTestPath(relative(root, file)) && project.getSourceFile(file) === undefined)
      .flatMap((file) => legacyFileConsumptions(project, legacy, file));
  });
}
