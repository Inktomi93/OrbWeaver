// Which product modules the test tree reaches (docs/law/Spine-Testing.md §5). A test reaches a module when the
// test, or a test-tree helper it imports (a story, a harness, a fixture), names one of the module's value
// exports through an import, a re-export, a barrel chain or a dynamic import, or when the test declares the
// module in an `@subject` header. A module the same file mocks is faked, so a binding imported from it is not
// reach. Reach stops at the first product module: a composition root that wires a verb reaches the root.
import { posix } from "node:path";
import type { ExportDeclaration, ImportDeclaration, Node as MorphNode, Symbol as MorphSymbol, SourceFile, TypeChecker } from "ts-morph";
import { Node, SyntaxKind, ts } from "ts-morph";
import type { TestFamily } from "../../floor/testing/test-kinds.ts";
import { classifyTestFilename } from "../../floor/testing/test-kinds.ts";

const TEST_ROOT = "tests/";
const SUBJECT_RE = /@subject[\t ]+(\S+)/gu;
/** `vi` members that replace a module's exports for the file that calls them. */
const VI_MOCK_MEMBERS: ReadonlySet<string> = new Set(["mock", "doMock"]);
/** The root `package.json` imports map: `#<package>/<path>` is `packages/<package>/src/<path>`. */
const SUBPATH_IMPORT_RE = /^#([a-z][a-z-]*)\/(.+)$/u;
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
}

// Every path reachable from `starts` through `targetsOf`.
function moduleClosure(starts: readonly string[], targetsOf: (path: string) => readonly string[]): ReadonlySet<string> {
  const reached = new Set<string>();
  const pending = [...starts];
  while (pending.length > 0) {
    const path = pending.pop();
    if (path === undefined || reached.has(path)) {
      continue;
    }
    reached.add(path);
    pending.push(...targetsOf(path));
  }
  return reached;
}

// The `@subject` paths in a file's leading comment block.
function subjectHeader(sourceFile: SourceFile): readonly string[] {
  const text = sourceFile.getFullText();
  const out: string[] = [];
  for (const range of ts.getLeadingCommentRanges(text, 0) ?? []) {
    for (const match of text.slice(range.pos, range.end).matchAll(SUBJECT_RE)) {
      const path = match[1];
      if (path !== undefined) {
        out.push(path);
      }
    }
  }
  return out;
}

function isTypeDeclaration(declaration: MorphNode): boolean {
  return Node.isInterfaceDeclaration(declaration) || Node.isTypeAliasDeclaration(declaration) || Node.isTypeParameterDeclaration(declaration);
}

class Walker {
  private readonly pathByAbsolute: ReadonlyMap<string, string>;
  private readonly fileByPath: ReadonlyMap<string, SourceFile>;
  private readonly referenceCache = new Map<string, ReadonlySet<string>>();
  private readonly helperCache = new Map<string, readonly string[]>();
  private readonly input: WalkInput;

  constructor(input: WalkInput) {
    this.input = input;
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

  /** The subject modules one test-side file references by value. */
  referencesOf(path: string): ReadonlySet<string> {
    const cached = this.referenceCache.get(path);
    if (cached !== undefined) {
      return cached;
    }
    const out = new Set<string>();
    const file = this.fileByPath.get(path);
    if (file !== undefined) {
      const mocked = this.mockedModules(file);
      this.collectImports(file, mocked, out);
      this.collectReExports(file, out);
      this.collectDynamicImports(file, mocked, out);
    }
    this.referenceCache.set(path, out);
    return out;
  }

  private addDeclarations(declarations: readonly MorphNode[], out: Set<string>): void {
    for (const declaration of declarations) {
      if (isTypeDeclaration(declaration)) {
        continue;
      }
      const path = this.pathOf(declaration.getSourceFile());
      if (path !== undefined && this.input.isSubject(path)) {
        out.add(path);
      }
    }
  }

  private addSymbol(symbol: MorphSymbol | undefined, out: Set<string>): void {
    if (symbol === undefined) {
      return;
    }
    const target = symbol.isAlias() ? this.input.checker.getAliasedSymbol(symbol) : symbol;
    this.addDeclarations(target?.getDeclarations() ?? [], out);
  }

  private addExportsNamed(module: SourceFile, names: readonly string[], out: Set<string>): void {
    const exported = module.getExportedDeclarations();
    for (const name of names) {
      this.addDeclarations(exported.get(name) ?? [], out);
    }
  }

  private addModule(module: SourceFile | undefined, out: Set<string>): void {
    const path = this.pathOf(module);
    if (path !== undefined && this.input.isSubject(path)) {
      out.add(path);
    }
  }

  /** The modules this file replaces with `vi.mock`/`vi.doMock`; what it imports from them is a fake. */
  private mockedModules(file: SourceFile): ReadonlySet<SourceFile> {
    const mocked = new Set<SourceFile>();
    for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const callee = call.getExpression();
      const [argument] = call.getArguments();
      if (argument === undefined || !Node.isStringLiteral(argument) || !Node.isPropertyAccessExpression(callee)) {
        continue;
      }
      if (callee.getExpression().getText() !== "vi" || !VI_MOCK_MEMBERS.has(callee.getName())) {
        continue;
      }
      const module = this.moduleOfLiteral(file, argument.getLiteralText(), undefined);
      if (module !== undefined) {
        mocked.add(module);
      }
    }
    return mocked;
  }

  private collectImports(file: SourceFile, mocked: ReadonlySet<SourceFile>, out: Set<string>): void {
    for (const declaration of file.getImportDeclarations()) {
      const module = declaration.getModuleSpecifierSourceFile();
      if (!(declaration.isTypeOnly() || (module !== undefined && mocked.has(module)))) {
        this.collectImport(file, declaration, module, out);
      }
    }
  }

  private collectImport(file: SourceFile, declaration: ImportDeclaration, module: SourceFile | undefined, out: Set<string>): void {
    const defaultImport = declaration.getDefaultImport();
    if (defaultImport !== undefined) {
      this.addSymbol(defaultImport.getSymbol(), out);
    }
    for (const specifier of declaration.getNamedImports()) {
      if (!specifier.isTypeOnly()) {
        this.addSymbol((specifier.getAliasNode() ?? specifier.getNameNode()).getSymbol(), out);
      }
    }
    const namespace = declaration.getNamespaceImport();
    if (namespace !== undefined && module !== undefined) {
      this.addExportsNamed(module, namespaceMembers(file, namespace.getText()), out);
    }
  }

  private collectReExports(file: SourceFile, out: Set<string>): void {
    for (const declaration of file.getExportDeclarations()) {
      const module = declaration.getModuleSpecifierSourceFile();
      if (module === undefined || declaration.isTypeOnly()) {
        continue;
      }
      const named = declaration.getNamedExports();
      if (named.length === 0) {
        this.addExportsNamed(module, [...module.getExportedDeclarations().keys()], out);
        continue;
      }
      this.addExportsNamed(
        module,
        named.filter((specifier) => !specifier.isTypeOnly()).map((specifier) => specifier.getNameNode().getText()),
        out,
      );
    }
  }

  /** `import("x")`: the specifier is the edge, so the module itself counts. A destructured dynamic import also
   *  resolves its names, which carries reach through a barrel. */
  private collectDynamicImports(file: SourceFile, mocked: ReadonlySet<SourceFile>, out: Set<string>): void {
    for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const [argument] = call.getArguments();
      if (argument === undefined || !Node.isStringLiteral(argument) || call.getExpression().getKind() !== SyntaxKind.ImportKeyword) {
        continue;
      }
      const module = this.moduleOfLiteral(file, argument.getLiteralText(), argument);
      if (module === undefined || mocked.has(module)) {
        continue;
      }
      this.addModule(module, out);
      this.addExportsNamed(module, destructuredNames(call), out);
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

function namespaceMembers(file: SourceFile, local: string): readonly string[] {
  return file
    .getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)
    .filter((access) => access.getExpression().getText() === local)
    .map((access) => access.getName());
}

/** `const { a, b: c } = await import("x")` names `a` and `b`. */
function destructuredNames(call: MorphNode): readonly string[] {
  const holder = call.getParentWhile((parent) => Node.isAwaitExpression(parent) || Node.isParenthesizedExpression(parent)) ?? call;
  const declaration = holder.getParent();
  if (declaration === undefined || !Node.isVariableDeclaration(declaration)) {
    return [];
  }
  const binding = declaration.getNameNode();
  if (!Node.isObjectBindingPattern(binding)) {
    return [];
  }
  return binding.getElements().map((element) => (element.getPropertyNameNode() ?? element.getNameNode()).getText());
}

/** A repo-relative path for a relative or `#<package>/` specifier; `undefined` for a bare package name. */
function specifierPath(from: string, specifier: string): string | undefined {
  if (specifier.startsWith(".")) {
    return posix.normalize(posix.join(posix.dirname(from), specifier));
  }
  const subpath = SUBPATH_IMPORT_RE.exec(specifier);
  return subpath === null ? undefined : `packages/${subpath[1] ?? ""}/src/${subpath[2] ?? ""}`;
}

/** Walk every registered test file under `tests/` and record which subject modules it reaches, and with which family. */
export function testReach(input: WalkInput): TestReach {
  const walker = new Walker(input);
  const reachedBy = new Map<string, Set<TestFamily>>();
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
    const family = classification.definition.family;
    for (const subject of subjectHeader(sourceFile)) {
      declared.push({ test: path, subject, family });
    }
    for (const sidePath of moduleClosure([path], (next) => walker.helpersOf(next))) {
      const modules = walker.referencesOf(sidePath);
      if (!counted.has(sidePath)) {
        counted.add(sidePath);
        references += modules.size;
      }
      record(reachedBy, modules, family);
    }
  }
  return { reachedBy, declared, tests, references };
}

function record(reachedBy: Map<string, Set<TestFamily>>, modules: ReadonlySet<string>, family: TestFamily): void {
  for (const module of modules) {
    reachedBy.set(module, (reachedBy.get(module) ?? new Set<TestFamily>()).add(family));
  }
}
