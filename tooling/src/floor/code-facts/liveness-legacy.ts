// Legacy tests stay outside semantic extraction (D320), so a stored corpus never sees them consume anything.
// Their reach comes from a syntax-only scan resolved by the legacy programs' own module resolution; a legacy
// barrel is followed by syntax to its project origin, and anything the scan cannot place refuses (D328).
import { existsSync } from "node:fs";
import { dirname, relative } from "node:path";
import type { Node, SourceFile } from "ts-morph";
import ts from "typescript";
import { LEGACY_TEST_WORLD_PROGRAMS } from "../compiler/project-worlds.ts";
import type { SourceCorpus } from "../compiler/ts-workspace.ts";
import { isLegacyTestPath } from "../testing/test-population.ts";
import { isInventoryPackageSourcePath } from "./inventory-consumers.ts";
import type { LegacyConsumption } from "./liveness-contract.ts";
import { LivenessRefusalError } from "./liveness-contract.ts";
import { inventoryDeclarationKey, inventoryExports, semanticInventoryOf } from "./semantic-inventory-reader.ts";

const PROJECT_SPECIFIER_RE = /^(?:\.|@orb\/|#)/u;
// Only TypeScript source can re-export a project origin; JSON, declaration files and assets carry none.
const SYNTAX_MODULE_RE = /(?<!\.d)\.[cm]?tsx?$/u;

// `names` undefined is a whole-surface read: `import * as`, `import()`, `export * as ns from`.
interface ModuleRead {
  readonly specifier: string;
  readonly names: readonly string[] | undefined;
  readonly mode: ts.ResolutionMode;
}

interface LegacyImport extends ModuleRead {
  readonly line: number;
}

// How one legacy module exports a name: through another module, or from its own declaration (no project origin).
type ExportRoute = { readonly kind: "from"; readonly read: ModuleRead } | { readonly kind: "local" };

interface LegacyModule {
  readonly imports: readonly LegacyImport[];
  readonly exports: ReadonlyMap<string, ExportRoute>;
  readonly stars: readonly ModuleRead[];
}

interface LegacyProgram {
  readonly corpus: SourceCorpus;
  readonly options: ts.CompilerOptions;
  readonly cache: ts.ModuleResolutionCache;
  readonly ambient: readonly string[];
  readonly modules: Map<string, LegacyModule>;
}

function refuse(message: string): never {
  throw new LivenessRefusalError(`legacy liveness: ${message}`);
}

function parsedLegacyProgram(config: string): ts.ParsedCommandLine {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    config,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => refuse(`cannot read ${config}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`),
    },
  );
  return parsed ?? refuse(`cannot read ${config}`);
}

function readSource(file: string): ts.SourceFile {
  const text = ts.sys.readFile(file) ?? refuse(`cannot read ${file}`);
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
}

// Every `declare module "pattern"` the legacy program types, so an asset import it declares is not a project import.
function ambientModules(files: readonly string[]): string[] {
  return files.flatMap((file) =>
    readSource(file).statements.flatMap((statement) => (ts.isModuleDeclaration(statement) && ts.isStringLiteral(statement.name) ? [statement.name.text] : [])),
  );
}

function matchesAmbient(specifier: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => {
    const star = pattern.indexOf("*");
    return star < 0 ? pattern === specifier : specifier.startsWith(pattern.slice(0, star)) && specifier.endsWith(pattern.slice(star + 1));
  });
}

function lineOf(node: ts.Node, source: ts.SourceFile): number {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

function specifierOf(node: ts.Expression | undefined): string | undefined {
  return node !== undefined && ts.isStringLiteral(node) ? node.text : undefined;
}

function importOf(statement: ts.ImportDeclaration, line: number, mode: ts.ResolutionMode, bindings: Map<string, ModuleRead>): LegacyImport | undefined {
  const specifier = specifierOf(statement.moduleSpecifier);
  const clause = statement.importClause;
  if (specifier === undefined || clause === undefined) {
    return;
  }
  const named = clause.namedBindings;
  if (named !== undefined && ts.isNamespaceImport(named)) {
    bindings.set(named.name.text, { specifier, names: undefined, mode });
    return { specifier, names: undefined, mode, line };
  }
  const elements =
    named === undefined ? [] : named.elements.map((element) => ({ local: element.name.text, name: (element.propertyName ?? element.name).text }));
  const all = clause.name === undefined ? elements : [{ local: clause.name.text, name: "default" }, ...elements];
  for (const { local, name } of all) {
    bindings.set(local, { specifier, names: [name], mode });
  }
  return { specifier, names: all.map(({ name }) => name), mode, line };
}

// Static imports and their local bindings: a re-exported binding routes to the module it was imported from.
function importsOf(source: ts.SourceFile, mode: ts.ResolutionMode, bindings: Map<string, ModuleRead>): LegacyImport[] {
  return source.statements.flatMap((statement) => {
    const found = ts.isImportDeclaration(statement) ? importOf(statement, lineOf(statement, source), mode, bindings) : undefined;
    return found === undefined ? [] : [found];
  });
}

function dynamicImportsOf(source: ts.SourceFile): LegacyImport[] {
  const imports: LegacyImport[] = [];
  const visit = (node: ts.Node): void => {
    const specifier = ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword ? specifierOf(node.arguments[0]) : undefined;
    if (specifier !== undefined) {
      imports.push({ specifier, names: undefined, mode: ts.ModuleKind.ESNext, line: lineOf(node, source) });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return imports;
}

function exportDeclarationRoutes(
  statement: ts.ExportDeclaration,
  mode: ts.ResolutionMode,
  bindings: ReadonlyMap<string, ModuleRead>,
  module: LegacyModuleBuilder,
): void {
  const specifier = specifierOf(statement.moduleSpecifier);
  const clause = statement.exportClause;
  if (clause === undefined) {
    module.stars.push({ specifier: specifier ?? refuse("an `export *` without a module specifier"), names: undefined, mode });
    return;
  }
  if (ts.isNamespaceExport(clause)) {
    module.exports.set(clause.name.text, {
      kind: "from",
      read: { specifier: specifier ?? refuse("an `export * as` without a module specifier"), names: undefined, mode },
    });
    return;
  }
  for (const element of clause.elements) {
    const source = (element.propertyName ?? element.name).text;
    const imported = specifier === undefined ? bindings.get(source) : { specifier, names: [source], mode };
    module.exports.set(element.name.text, imported === undefined ? { kind: "local" } : { kind: "from", read: imported });
  }
}

interface LegacyModuleBuilder {
  readonly exports: Map<string, ExportRoute>;
  readonly stars: ModuleRead[];
}

function hasModifier(statement: ts.Statement, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(statement) && (ts.getModifiers(statement) ?? []).some((modifier) => modifier.kind === kind);
}

function boundNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) {
    return [name.text];
  }
  return name.elements.flatMap((element) => (ts.isOmittedExpression(element) ? [] : boundNames(element.name)));
}

// The names a legacy module declares and exports itself; none of them is a project origin.
function declaredNames(statement: ts.Statement): string[] {
  if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
    return [];
  }
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.flatMap((declaration) => boundNames(declaration.name));
  }
  if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) {
    return ["default"];
  }
  if (ts.isModuleDeclaration(statement)) {
    return ts.isIdentifier(statement.name) ? [statement.name.text] : [];
  }
  const named =
    ts.isFunctionDeclaration(statement) ||
    ts.isClassDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    ts.isEnumDeclaration(statement)
      ? statement.name?.text
      : undefined;
  return named === undefined ? [] : [named];
}

function statementRoutes(statement: ts.Statement, mode: ts.ResolutionMode, bindings: ReadonlyMap<string, ModuleRead>, module: LegacyModuleBuilder): void {
  if (ts.isExportDeclaration(statement)) {
    exportDeclarationRoutes(statement, mode, bindings, module);
    return;
  }
  if (ts.isExportAssignment(statement)) {
    const binding = ts.isIdentifier(statement.expression) ? bindings.get(statement.expression.text) : undefined;
    module.exports.set("default", binding === undefined ? { kind: "local" } : { kind: "from", read: binding });
    return;
  }
  for (const name of declaredNames(statement)) {
    module.exports.set(name, { kind: "local" });
  }
}

function legacyModuleOf(file: string, program: LegacyProgram): LegacyModule {
  const cached = program.modules.get(file);
  if (cached !== undefined) {
    return cached;
  }
  const source = readSource(file);
  const mode = ts.getImpliedNodeFormatForFile(file, program.cache.getPackageJsonInfoCache(), ts.sys, program.options);
  const bindings = new Map<string, ModuleRead>();
  const imports = [...importsOf(source, mode, bindings), ...dynamicImportsOf(source)];
  const module: LegacyModuleBuilder = { exports: new Map(), stars: [] };
  for (const statement of source.statements) {
    statementRoutes(statement, mode, bindings, module);
  }
  const built = { imports, ...module };
  program.modules.set(file, built);
  return built;
}

type Resolved = { readonly kind: "corpus"; readonly source: SourceFile } | { readonly kind: "legacy"; readonly file: string } | { readonly kind: "external" };

// A project specifier that resolves nowhere, or to package source the corpus lacks, is an unknown, never a clean zero.
function resolve(program: LegacyProgram, file: string, read: ModuleRead): Resolved {
  const resolved = ts.resolveModuleName(read.specifier, file, program.options, ts.sys, program.cache, undefined, read.mode).resolvedModule?.resolvedFileName;
  if (resolved === undefined) {
    return PROJECT_SPECIFIER_RE.test(read.specifier) && !matchesAmbient(read.specifier, program.ambient)
      ? refuse(`import ${read.specifier} in ${file} resolves to no module`)
      : { kind: "external" };
  }
  const source = program.corpus.getSourceFile(resolved);
  if (source !== undefined) {
    return { kind: "corpus", source };
  }
  if (isInventoryPackageSourcePath(resolved)) {
    return refuse(`import ${read.specifier} in ${file} resolves to ${resolved}, which the stored corpus does not hold`);
  }
  return SYNTAX_MODULE_RE.test(resolved) && !resolved.includes("/node_modules/") ? { kind: "legacy", file: resolved } : { kind: "external" };
}

// The project origins one module read reaches, following legacy barrels by syntax; `seen` stops a re-export cycle.
function originsOf(program: LegacyProgram, file: string, read: ModuleRead, seen: Set<string>): Node[] {
  const target = resolve(program, file, read);
  if (target.kind === "external") {
    return [];
  }
  if (target.kind === "corpus") {
    const exported = inventoryExports(target.source);
    return read.names === undefined ? [...exported.values()].flat() : read.names.flatMap((name) => exported.get(name) ?? []);
  }
  const key = `${target.file}\0${read.names?.join(",") ?? "*"}`;
  if (seen.has(key)) {
    return [];
  }
  seen.add(key);
  const barrel = legacyModuleOf(target.file, program);
  const follow = (route: ExportRoute): Node[] => (route.kind === "from" ? originsOf(program, target.file, route.read, seen) : []);
  const stars = (names: readonly string[] | undefined): Node[] => barrel.stars.flatMap((star) => originsOf(program, target.file, { ...star, names }, seen));
  if (read.names === undefined) {
    return [...[...barrel.exports.values()].flatMap(follow), ...stars(undefined)];
  }
  return read.names.flatMap((name) => {
    const route = barrel.exports.get(name);
    if (route !== undefined) {
      return follow(route);
    }
    return name !== "default" && barrel.stars.length > 0 ? stars([name]) : refuse(`legacy barrel ${target.file} exports no ${name} that ${file} imports`);
  });
}

function legacyFileConsumptions(program: LegacyProgram, file: string): LegacyConsumption[] {
  return legacyModuleOf(file, program).imports.flatMap((found) =>
    originsOf(program, file, found, new Set()).map((declaration) => ({ originKey: inventoryDeclarationKey(declaration), file, line: found.line })),
  );
}

/** Every origin a legacy test imports, when `project` is a stored corpus that omits the legacy programs. A native
 *  corpus holds whatever legacy sources it loaded and reads them as ordinary consumers. */
export function legacyConsumptions(project: SourceCorpus): readonly LegacyConsumption[] {
  const inventory = semanticInventoryOf(project);
  if (inventory === undefined) {
    return [];
  }
  return Object.values(LEGACY_TEST_WORLD_PROGRAMS).flatMap((config) => {
    const path = inventory.canonicalPath(config);
    // A repository without this legacy program has no legacy sources to count.
    if (!existsSync(path)) {
      return [];
    }
    const root = dirname(path);
    const parsed = parsedLegacyProgram(path);
    const program: LegacyProgram = {
      corpus: project,
      options: parsed.options,
      cache: ts.createModuleResolutionCache(root, (name) => name, parsed.options),
      ambient: ambientModules(parsed.fileNames.filter((file) => file.endsWith(".d.ts"))),
      modules: new Map(),
    };
    return parsed.fileNames
      .filter((file) => isLegacyTestPath(relative(root, file)) && project.getSourceFile(file) === undefined)
      .flatMap((file) => legacyFileConsumptions(program, file));
  });
}
