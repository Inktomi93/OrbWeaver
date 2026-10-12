// Which product modules the test tree reaches (docs/law/Spine-Testing.md §5). A test reaches a module when the
// test, or a test-tree helper it imports (a story, a harness, a fixture), names one of the module's value
// exports through an import, a re-export, a barrel chain or a dynamic import, or when the test declares the
// module in an `@subject` header. A module the same file mocks is faked, so a binding that resolves to it is not
// reach, whichever module the import names. A test kind reaches only the source extensions it holds. A call of an
// imported export is recorded for the names a caller asks about. Reach stops at the first product module: a
// composition root that wires a verb reaches the root.
import type { ExportDeclaration, ImportDeclaration, Node as MorphNode, Symbol as MorphSymbol, SourceFile, TypeChecker } from "ts-morph";
import { Node, SyntaxKind, VariableDeclarationKind } from "ts-morph";
import type { TestFamily, TestKindDefinition } from "../../floor/testing/test-kinds.ts";
import { classifyTestFilename } from "../../floor/testing/test-kinds.ts";
import {
  destructuredNames,
  importedValueNames,
  isTypeDeclaration,
  moduleClosure,
  namespaceMembers,
  specifierPath,
  subjectHeader,
} from "./test-reach-syntax.ts";

const TEST_ROOT = "tests/";
/** `vi` members that replace a module's exports for the file that calls them. */
const VI_MOCK_MEMBERS: ReadonlySet<string> = new Set(["mock", "doMock"]);
const SPECIFIER_SUFFIXES: readonly string[] = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

/** One `@subject` declaration, kept whether or not its path names a real module so a stale header can red. */
export interface DeclaredSubject {
  readonly test: string;
  readonly subject: string;
  readonly family: TestFamily;
}

export interface TestReach {
  /** Product module path to the families of the tests that reach it. */
  readonly reachedBy: ReadonlyMap<string, ReadonlySet<TestFamily>>;
  /** Product module path, then an exported name a test calls, to the families of the tests that call it. Only names asked about. */
  readonly calledBy: ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<TestFamily>>>;
  readonly declared: readonly DeclaredSubject[];
  /** Registered test files walked, and distinct (test-side file, product module) references resolved. */
  readonly tests: number;
  readonly references: number;
}

interface WalkInput {
  readonly files: readonly SourceFile[];
  readonly relativePath: (sourceFile: SourceFile) => string;
  readonly checker: TypeChecker;
  /** The modules whose reach is being asked about; every other resolved declaration is ignored. */
  readonly isSubject: (path: string) => boolean;
  /** Module path to the declared export names whose calls are recorded in `TestReach.calledBy`. */
  readonly calls?: ReadonlyMap<string, ReadonlySet<string>>;
}

/** What one test-side file references: the subject modules it reaches and the asked-about names it calls. */
interface FileReach {
  readonly modules: ReadonlySet<string>;
  readonly called: ReadonlyMap<string, ReadonlySet<string>>;
}

/** One file's walk. `mocked` holds the modules the file replaces; every resolved declaration is checked against it. */
interface Scan {
  readonly file: SourceFile;
  readonly mocked: ReadonlySet<SourceFile>;
  readonly modules: Set<string>;
  readonly called: Map<string, Set<string>>;
}

const NO_REACH: FileReach = { modules: new Set(), called: new Map() };

class Walker {
  private readonly pathByAbsolute: ReadonlyMap<string, string>;
  private readonly fileByPath: ReadonlyMap<string, SourceFile>;
  private readonly referenceCache = new Map<string, FileReach>();
  private readonly helperCache = new Map<string, readonly string[]>();
  private readonly input: WalkInput;
  private readonly askedNames: ReadonlySet<string>;

  constructor(input: WalkInput) {
    this.input = input;
    this.askedNames = new Set([...(input.calls?.values() ?? [])].flatMap((names) => [...names]));
    this.pathByAbsolute = new Map(input.files.map((file) => [file.getFilePath(), input.relativePath(file)]));
    this.fileByPath = new Map(input.files.map((file) => [input.relativePath(file), file]));
  }

  pathOf(sourceFile: SourceFile | undefined): string | undefined {
    return sourceFile === undefined ? undefined : this.pathByAbsolute.get(sourceFile.getFilePath());
  }

  file(path: string): SourceFile | undefined {
    return this.fileByPath.get(path);
  }

  /** Test-tree files one import or re-export away. A product module ends the walk. */
  helpersOf(path: string): readonly string[] {
    const cached = this.helperCache.get(path);
    if (cached !== undefined) {
      return cached;
    }
    const file = this.fileByPath.get(path);
    const declarations: readonly (ImportDeclaration | ExportDeclaration)[] =
      file === undefined ? [] : [...file.getImportDeclarations(), ...file.getExportDeclarations()];
    const helpers = declarations.flatMap((declaration) => {
      if (declaration.isTypeOnly()) {
        return [];
      }
      const target = this.pathOf(declaration.getModuleSpecifierSourceFile());
      return target?.startsWith(TEST_ROOT) === true ? [target] : [];
    });
    this.helperCache.set(path, helpers);
    return helpers;
  }

  /** The subject modules one test-side file references by value, and the asked-about names it calls. */
  referencesOf(path: string): FileReach {
    const cached = this.referenceCache.get(path);
    if (cached !== undefined) {
      return cached;
    }
    const file = this.fileByPath.get(path);
    const reach = file === undefined ? NO_REACH : this.scan(file);
    this.referenceCache.set(path, reach);
    return reach;
  }

  private scan(file: SourceFile): FileReach {
    const scan: Scan = { file, mocked: this.mockedModules(file), modules: new Set(), called: new Map() };
    this.collectImports(scan);
    this.collectReExports(scan);
    this.collectDynamicImports(scan);
    this.collectCalls(scan);
    return { modules: scan.modules, called: scan.called };
  }

  /** A declaration in a module the file mocks is a fake wherever the import that reached it points. */
  private isFaked(declaration: MorphNode, scan: Scan): boolean {
    return isTypeDeclaration(declaration) || scan.mocked.has(declaration.getSourceFile());
  }

  private addDeclarations(declarations: readonly MorphNode[], scan: Scan): void {
    for (const declaration of declarations) {
      if (this.isFaked(declaration, scan)) {
        continue;
      }
      const path = this.pathOf(declaration.getSourceFile());
      if (path !== undefined && this.input.isSubject(path)) {
        scan.modules.add(path);
      }
    }
  }

  private resolved(symbol: MorphSymbol | undefined): MorphSymbol | undefined {
    return symbol?.isAlias() === true ? this.input.checker.getAliasedSymbol(symbol) : symbol;
  }

  private addSymbol(symbol: MorphSymbol | undefined, scan: Scan): void {
    this.addDeclarations(this.resolved(symbol)?.getDeclarations() ?? [], scan);
  }

  private addExportsNamed(module: SourceFile, names: readonly string[], scan: Scan): void {
    const exported = module.getExportedDeclarations();
    for (const name of names) {
      this.addDeclarations(exported.get(name) ?? [], scan);
    }
  }

  private addModule(module: SourceFile | undefined, scan: Scan): void {
    const path = this.pathOf(module);
    if (path !== undefined && this.input.isSubject(path)) {
      scan.modules.add(path);
    }
  }

  /** The modules this file replaces with `vi.mock`/`vi.doMock`; what it imports from them is a fake. */
  private mockedModules(file: SourceFile): ReadonlySet<SourceFile> {
    const mocked = new Set<SourceFile>();
    for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const callee = call.getExpression();
      const [argument] = call.getArguments();
      if (argument === undefined || !Node.isPropertyAccessExpression(callee)) {
        continue;
      }
      if (callee.getExpression().getText() !== "vi" || !VI_MOCK_MEMBERS.has(callee.getName())) {
        continue;
      }
      const specifier = this.constantSpecifier(argument);
      const module = specifier === undefined ? undefined : this.moduleOfLiteral(file, specifier, undefined);
      if (module !== undefined) {
        mocked.add(module);
      }
    }
    return mocked;
  }

  /** The module specifier a `vi.mock` argument spells: a string literal, or a `const` (possibly imported) bound to one. */
  private constantSpecifier(node: MorphNode): string | undefined {
    if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
      return node.getLiteralText();
    }
    if (Node.isAsExpression(node) || Node.isSatisfiesExpression(node) || Node.isParenthesizedExpression(node)) {
      return this.constantSpecifier(node.getExpression());
    }
    if (!Node.isIdentifier(node)) {
      return;
    }
    const declaration = this.resolved(node.getSymbol())?.getValueDeclaration();
    if (
      declaration === undefined ||
      !Node.isVariableDeclaration(declaration) ||
      declaration.getVariableStatement()?.getDeclarationKind() !== VariableDeclarationKind.Const
    ) {
      return;
    }
    const initializer = declaration.getInitializer();
    return initializer === undefined ? undefined : this.constantSpecifier(initializer);
  }

  private collectImports(scan: Scan): void {
    for (const declaration of scan.file.getImportDeclarations()) {
      const module = declaration.getModuleSpecifierSourceFile();
      if (!(declaration.isTypeOnly() || (module !== undefined && scan.mocked.has(module)))) {
        this.collectImport(scan, declaration, module);
      }
    }
  }

  private collectImport(scan: Scan, declaration: ImportDeclaration, module: SourceFile | undefined): void {
    const defaultImport = declaration.getDefaultImport();
    if (defaultImport !== undefined) {
      this.addSymbol(defaultImport.getSymbol(), scan);
    }
    for (const specifier of declaration.getNamedImports()) {
      if (!specifier.isTypeOnly()) {
        this.addSymbol((specifier.getAliasNode() ?? specifier.getNameNode()).getSymbol(), scan);
      }
    }
    const namespace = declaration.getNamespaceImport();
    if (namespace !== undefined && module !== undefined) {
      this.addExportsNamed(module, namespaceMembers(scan.file, namespace.getText()), scan);
    }
  }

  private collectReExports(scan: Scan): void {
    for (const declaration of scan.file.getExportDeclarations()) {
      const module = declaration.getModuleSpecifierSourceFile();
      if (module === undefined || declaration.isTypeOnly()) {
        continue;
      }
      const named = declaration.getNamedExports();
      if (named.length === 0) {
        this.addExportsNamed(module, [...module.getExportedDeclarations().keys()], scan);
        continue;
      }
      this.addExportsNamed(
        module,
        named.filter((specifier) => !specifier.isTypeOnly()).map((specifier) => specifier.getNameNode().getText()),
        scan,
      );
    }
  }

  /** `import("x")`: the specifier is the edge, so the module itself counts. A destructured dynamic import also
   *  resolves its names, which carries reach through a barrel. */
  private collectDynamicImports(scan: Scan): void {
    for (const call of scan.file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const [argument] = call.getArguments();
      if (argument === undefined || !Node.isStringLiteral(argument) || call.getExpression().getKind() !== SyntaxKind.ImportKeyword) {
        continue;
      }
      const module = this.moduleOfLiteral(scan.file, argument.getLiteralText(), argument);
      if (module === undefined || scan.mocked.has(module)) {
        continue;
      }
      this.addModule(module, scan);
      this.addExportsNamed(module, destructuredNames(call), scan);
    }
  }

  /** A call whose callee is an imported binding, or a member of an imported namespace, resolves to the export it
   *  names. Only a callee an import binds is resolved, which keeps the checker off every other call. */
  private collectCalls(scan: Scan): void {
    if (this.input.calls === undefined || this.input.calls.size === 0) {
      return;
    }
    const values = importedValueNames(scan.file);
    for (const call of scan.file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const callee = call.getExpression();
      if (Node.isIdentifier(callee) && values.has(callee.getText())) {
        this.addCalled(callee, scan, false);
      } else if (Node.isPropertyAccessExpression(callee) && this.askedNames.has(callee.getName())) {
        this.addCalled(callee.getNameNode(), scan, true);
      }
    }
  }

  /** A member call (`ns.f()`, `(await import("x")).f()`) resolves through the receiver's type, so the receiver can be
   *  any value of a module's type. The resolved declaration must be a top-level export of its module, which keeps a
   *  same-named method of an exported object or interface from counting. */
  private addCalled(callee: MorphNode, scan: Scan, member: boolean): void {
    const target = this.resolved(callee.getSymbol());
    const name = target?.getName();
    for (const declaration of target?.getDeclarations() ?? []) {
      const path = this.isFaked(declaration, scan) ? undefined : this.pathOf(declaration.getSourceFile());
      if (path === undefined || name === undefined || this.input.calls?.get(path)?.has(name) !== true) {
        continue;
      }
      if (
        !member ||
        declaration
          .getSourceFile()
          .getExportedDeclarations()
          .get(name)
          ?.some((exported) => exported === declaration) === true
      ) {
        scan.called.set(path, (scan.called.get(path) ?? new Set<string>()).add(name));
      }
    }
  }

  private moduleOfLiteral(file: SourceFile, specifier: string, literal: MorphNode | undefined): SourceFile | undefined {
    const symbol = literal === undefined ? undefined : this.input.checker.getSymbolAtLocation(literal);
    const declared = symbol?.getDeclarations().find((declaration) => Node.isSourceFile(declaration));
    if (declared !== undefined && Node.isSourceFile(declared)) {
      return declared;
    }
    const imported = file.getImportDeclarations().find((declaration) => declaration.getModuleSpecifierValue() === specifier);
    if (imported !== undefined) {
      return imported.getModuleSpecifierSourceFile();
    }
    const base = specifierPath(this.input.relativePath(file), specifier);
    return base === undefined ? undefined : SPECIFIER_SUFFIXES.map((suffix) => this.fileByPath.get(`${base}${suffix}`)).find((hit) => hit !== undefined);
  }
}

/** Walk every registered test file under `tests/` and record which subject modules it reaches, and with which family. */
export function testReach(input: WalkInput): TestReach {
  const walker = new Walker(input);
  const reachedBy = new Map<string, Set<TestFamily>>();
  const calledBy = new Map<string, Map<string, Set<TestFamily>>>();
  const declared: DeclaredSubject[] = [];
  let tests = 0;
  let references = 0;
  const counted = new Set<string>();
  for (const sourceFile of input.files) {
    const path = input.relativePath(sourceFile);
    const classification = path.startsWith(TEST_ROOT) ? classifyTestFilename(sourceFile.getBaseName()) : undefined;
    if (classification === undefined) {
      continue;
    }
    tests += 1;
    const { definition } = classification;
    for (const subject of subjectHeader(sourceFile)) {
      declared.push({ test: path, subject, family: definition.family });
    }
    for (const sidePath of moduleClosure([path], (next) => walker.helpersOf(next))) {
      const reach = walker.referencesOf(sidePath);
      if (!counted.has(sidePath)) {
        counted.add(sidePath);
        references += reach.modules.size;
      }
      record(reachedBy, calledBy, reach, definition);
    }
  }
  return { reachedBy, calledBy, declared, tests, references };
}

/** A test kind holds the source extensions its definition lists; a module of another extension is not reached by it. */
function holdsSource(definition: TestKindDefinition, module: string): boolean {
  return definition.sourceExtensions.some((extension) => module.endsWith(extension));
}

function record(
  reachedBy: Map<string, Set<TestFamily>>,
  calledBy: Map<string, Map<string, Set<TestFamily>>>,
  reach: FileReach,
  definition: TestKindDefinition,
): void {
  const { family } = definition;
  for (const module of reach.modules) {
    if (holdsSource(definition, module)) {
      reachedBy.set(module, (reachedBy.get(module) ?? new Set<TestFamily>()).add(family));
    }
  }
  for (const [module, names] of reach.called) {
    if (!holdsSource(definition, module)) {
      continue;
    }
    const byName = calledBy.get(module) ?? new Map<string, Set<TestFamily>>();
    calledBy.set(module, byName);
    for (const name of names) {
      byName.set(name, (byName.get(name) ?? new Set<TestFamily>()).add(family));
    }
  }
}
