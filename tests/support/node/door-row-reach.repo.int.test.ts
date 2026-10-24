// No testkit door export reaches a drizzle row read, except the one accepted route named below, so a seed cannot hand a
// verb suite a row. Dependency-cruiser cannot judge this: it sees modules, and every door already reaches the rows tier
// through `fixtures.ts` → `corpus.ts`, so a planted re-export adds no new module edge. The walk follows values instead.
// Measured 17.2 s for the file at load average 10; the planted program reuses the first build's parsed source files.
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import ts from "typescript";
import { beforeAll } from "vitest";
import { expect, test } from "./fixtures.ts";

const REPO = join(import.meta.dirname, "../../..");
const SUPPORT = join(REPO, "tests/support/");
const ROWS_DOOR = "./node/rows";
const COMPOSED = join(SUPPORT, "node/composed.ts");
const READ_METHODS = new Set(["select", "selectDistinct", "$count", "with", "all", "get", "values"]);
// `run` returns a libsql ResultSet whose rows a SELECT fills; schema pushes and write faults run DDL and DML instead.
const RUN_METHOD = new Set(["run"]);
const READING_SQL = /^\s*(select|with)\b/iu;
const READ_MEMBERS = new Set(["query", "$with"]);
const DRIZZLE_OWNERS = new Set(["BaseSQLiteDatabase", "LibSQLDatabase", "SQLiteTransaction", "LibSQLTransaction"]);
// The capsule is the corpus publisher: it refuses a copied private database holding unfinished work before boot and
// then publishes the fixture, which is a snapshot of rows (eslint.config.ts names corpus.ts for the same reasons).
const ACCEPTED = [{ door: "./node/composed", exported: "createCorpusCapsule" }] as const;

// Each shape a door could hand out a row-reading seed by, each its own export on one planted composed door.
const SEED_IMPORT = 'import { seedCorpusLibraries } from "./corpus-seed.ts";';
const NAMESPACE_IMPORT = 'import * as corpusSeeds from "./corpus-seed.ts";';
const PLANTED_SHAPES = [
  { shape: "a named re-export", exported: "seedCorpusLibraries", source: 'export { seedCorpusLibraries } from "./corpus-seed.ts";' },
  { shape: "an object shorthand", exported: "corpusKit", source: `${SEED_IMPORT}\nexport const corpusKit = { seedCorpusLibraries };` },
  { shape: "a returned shorthand", exported: "corpusKitOf", source: `${SEED_IMPORT}\nexport function corpusKitOf() {\n  return { seedCorpusLibraries };\n}` },
  { shape: "an explicit property", exported: "corpusKeyed", source: `${SEED_IMPORT}\nexport const corpusKeyed = { seed: seedCorpusLibraries };` },
  {
    shape: "an uncalled dynamic-import member",
    exported: "lazySeed",
    source: 'export const lazySeed = async () => (await import("./corpus-seed.ts")).seedCorpusLibraries;',
  },
  { shape: "a returned dynamic import", exported: "lazyModule", source: 'export const lazyModule = () => import("./corpus-seed.ts");' },
  { shape: "a re-exported namespace", exported: "corpusSeeds", source: `${NAMESPACE_IMPORT}\nexport { corpusSeeds };` },
  {
    shape: "a namespace member",
    exported: "corpusMember",
    source: `${NAMESPACE_IMPORT}\nexport const corpusMember = { seed: corpusSeeds.seedCorpusLibraries };`,
  },
  {
    shape: "a raw run",
    exported: "rawRun",
    source:
      'import { sql } from "drizzle-orm";\nimport type { ServerTestHarness as RunRoot } from "./server.ts";\n' +
      "export async function rawRun(root: RunRoot) {\n  return await root.db.run(sql`select 1`);\n}",
  },
] as const;

interface DoorReader {
  readonly door: string;
  readonly exported: string;
  /** The function whose body holds the first drizzle read the export reaches. */
  readonly readIn: string;
  readonly chain: readonly string[];
}

// Every door the testkit package exports, except the rows door the readers live behind.
function doorFiles(): ReadonlyMap<string, string> {
  const manifest: unknown = JSON.parse(readFileSync(join(SUPPORT, "package.json"), "utf8"));
  if (manifest === null || typeof manifest !== "object" || !("exports" in manifest) || manifest.exports === null || typeof manifest.exports !== "object") {
    throw new Error("tests/support/package.json has no exports map");
  }
  const doors = new Map<string, string>();
  for (const [door, file] of Object.entries(manifest.exports)) {
    if (door !== ROWS_DOOR && typeof file === "string") {
      doors.set(door, join(SUPPORT, file));
    }
  }
  return doors;
}

// One parse per file across every build: a planted program swaps only the composed door's source.
function createProgramFactory(): (roots: readonly string[], composedSource?: string) => ts.Program {
  const configPath = join(REPO, "tsconfig.json");
  const parsed = ts.parseJsonConfigFileContent(ts.readConfigFile(configPath, ts.sys.readFile).config, ts.sys, dirname(configPath));
  const options = { ...parsed.options, noEmit: true };
  const host = ts.createCompilerHost(options, true);
  const read = host.getSourceFile.bind(host);
  const parsedFiles = new Map<string, ts.SourceFile | undefined>();
  let previous: ts.Program | undefined;
  return (roots, composedSource) => {
    host.getSourceFile = (name, version, onError, create): ts.SourceFile | undefined => {
      if (name === COMPOSED && composedSource !== undefined) {
        return ts.createSourceFile(name, composedSource, version, true);
      }
      if (!parsedFiles.has(name)) {
        parsedFiles.set(name, read(name, version, onError, create));
      }
      return parsedFiles.get(name);
    };
    previous = ts.createProgram({ rootNames: roots, options, host, ...(previous === undefined ? {} : { oldProgram: previous }) });
    return previous;
  };
}

function isDrizzleMember(declaration: ts.Declaration | undefined, names: ReadonlySet<string>): boolean {
  if (
    declaration === undefined ||
    !(ts.isMethodDeclaration(declaration) || ts.isMethodSignature(declaration) || ts.isPropertyDeclaration(declaration)) ||
    !ts.isIdentifier(declaration.name)
  ) {
    return false;
  }
  const owner = declaration.parent;
  return (
    names.has(declaration.name.text) &&
    (ts.isClassDeclaration(owner) || ts.isInterfaceDeclaration(owner)) &&
    owner.name !== undefined &&
    DRIZZLE_OWNERS.has(owner.name.text) &&
    owner.getSourceFile().fileName.replaceAll("\\", "/").includes("/node_modules/drizzle-orm/")
  );
}

function bodyOf(declaration: ts.Node): ts.Node | undefined {
  if (
    ts.isFunctionDeclaration(declaration) ||
    ts.isMethodDeclaration(declaration) ||
    ts.isFunctionExpression(declaration) ||
    ts.isArrowFunction(declaration) ||
    ts.isGetAccessorDeclaration(declaration)
  ) {
    return declaration.body;
  }
  if (ts.isVariableDeclaration(declaration) || ts.isPropertyAssignment(declaration)) {
    return declaration.initializer;
  }
  return ts.isClassDeclaration(declaration) ? declaration : undefined;
}

function site(node: ts.Node): string {
  const file = node.getSourceFile();
  return `${relative(REPO, file.fileName)}:${String(file.getLineAndCharacterOfPosition(node.getStart()).line + 1)}`;
}

// The named function whose body holds a node; an anonymous arrow takes the name of the binding that holds it.
function enclosingName(node: ts.Node): string {
  for (let current: ts.Node = node; !ts.isSourceFile(current); current = current.parent) {
    if ((ts.isFunctionDeclaration(current) || ts.isMethodDeclaration(current)) && current.name !== undefined) {
      return current.name.getText();
    }
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name) && current.initializer !== undefined && isFunctionValue(current.initializer)) {
      return current.name.text;
    }
  }
  return "<module>";
}

function isFunctionValue(node: ts.Node): boolean {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

function resolveAlias(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol {
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript SymbolFlags is a compiler-owned bitfield.
  return (symbol.flags & ts.SymbolFlags.Alias) === 0 ? symbol : checker.getAliasedSymbol(symbol);
}

const inSupport = (node: ts.Node): boolean => node.getSourceFile().fileName.startsWith(SUPPORT);

interface Reach {
  readonly chain: readonly string[];
  readonly readIn: string;
}

interface Walk {
  readonly checker: ts.TypeChecker;
  readonly memo: Map<ts.Node, Reach | null>;
  readonly active: Set<ts.Node>;
  // A null found under an in-progress ancestor is provisional, so only a cycle-free null is cached.
  cycles: number;
}

const directRead = (node: ts.Node): Reach => ({ chain: [site(node)], readIn: enclosingName(node) });

function step(node: ts.Node, sub: Reach | null): Reach | null {
  return sub === null ? null : { chain: [site(node), ...sub.chain], readIn: sub.readIn };
}

// A value a symbol names: a testkit function, binding or whole module (a namespace or a dynamic import).
function symbolReach(walk: Walk, node: ts.Node, symbol: ts.Symbol | undefined, from: ts.Node): Reach | null {
  for (const declaration of symbol === undefined ? [] : (resolveAlias(walk.checker, symbol).declarations ?? [])) {
    const sub = declaration !== from && inSupport(declaration) ? step(node, reachFrom(walk, declaration)) : null;
    if (sub !== null) {
      return sub;
    }
  }
  return null;
}

// `import(spec)` whose module itself escapes; a member read or destructure off it resolves through the export instead.
function dynamicImportReach(walk: Walk, node: ts.CallExpression, from: ts.Node): Reach | null {
  const [specifier] = node.arguments;
  if (specifier === undefined) {
    return null;
  }
  let consumer: ts.Node = node.parent;
  while (ts.isAwaitExpression(consumer) || ts.isParenthesizedExpression(consumer)) {
    consumer = consumer.parent;
  }
  if (ts.isPropertyAccessExpression(consumer)) {
    return null;
  }
  const module = walk.checker.getSymbolAtLocation(specifier);
  if (ts.isVariableDeclaration(consumer) && ts.isObjectBindingPattern(consumer.name) && module !== undefined) {
    const exports = walk.checker.getExportsOfModule(module);
    for (const element of consumer.name.elements) {
      const name = (element.propertyName ?? element.name).getText();
      const sub = symbolReach(
        walk,
        element,
        exports.find((exported) => exported.name === name),
        from,
      );
      if (sub !== null) {
        return sub;
      }
    }
    return null;
  }
  return symbolReach(walk, node, module, from);
}

function callReach(walk: Walk, node: ts.CallExpression, from: ts.Node): Reach | null {
  if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    return dynamicImportReach(walk, node, from);
  }
  const target = walk.checker.getResolvedSignature(node)?.declaration;
  if (target === undefined || ts.isJSDocSignature(target)) {
    return null;
  }
  return isDrizzleMember(target, READ_METHODS) || (isDrizzleMember(target, RUN_METHOD) && readsRows(node.arguments[0])) ? directRead(node) : null;
}

// The static text of a `sql\`…\`` template or a `sql.raw("…")` literal; a computed statement is not judged a read.
function readsRows(statement: ts.Expression | undefined): boolean {
  if (statement !== undefined && ts.isTaggedTemplateExpression(statement)) {
    const head = ts.isNoSubstitutionTemplateLiteral(statement.template) ? statement.template.text : statement.template.head.text;
    return READING_SQL.test(head);
  }
  const [raw] = statement !== undefined && ts.isCallExpression(statement) ? statement.arguments : [];
  return raw !== undefined && ts.isStringLiteralLike(raw) && READING_SQL.test(raw.text);
}

// Every way a value is named: a call, a member, a shorthand property, or a bare reference.
function nodeReach(walk: Walk, node: ts.Node, from: ts.Node): Reach | null {
  if (ts.isCallExpression(node)) {
    return callReach(walk, node, from);
  }
  if (ts.isPropertyAccessExpression(node)) {
    const member = walk.checker.getSymbolAtLocation(node.name);
    if (READ_MEMBERS.has(node.name.text) && (member?.declarations ?? []).some((declaration) => isDrizzleMember(declaration, READ_MEMBERS))) {
      return directRead(node);
    }
    return symbolReach(walk, node, member, from);
  }
  if (ts.isShorthandPropertyAssignment(node)) {
    return symbolReach(walk, node, walk.checker.getShorthandAssignmentValueSymbol(node), from);
  }
  const named = ts.isPropertyAccessExpression(node.parent) || ts.isShorthandPropertyAssignment(node.parent);
  return ts.isIdentifier(node) && !named ? symbolReach(walk, node, walk.checker.getSymbolAtLocation(node), from) : null;
}

// A whole module reaches what any of its exports reach.
function moduleReach(walk: Walk, file: ts.SourceFile): Reach | null {
  const module = walk.checker.getSymbolAtLocation(file);
  for (const exported of module === undefined ? [] : walk.checker.getExportsOfModule(module)) {
    const sub = symbolReach(walk, file, exported, file);
    if (sub !== null) {
      return sub;
    }
  }
  return null;
}

// The first drizzle read reachable from a declaration through any value it names, inside tests/support.
function reachFrom(walk: Walk, declaration: ts.Node): Reach | null {
  const known = walk.memo.get(declaration);
  if (known !== undefined) {
    return known;
  }
  if (walk.active.has(declaration)) {
    walk.cycles += 1;
    return null;
  }
  const before = walk.cycles;
  walk.active.add(declaration);
  // A holder, because the visitor closure assigns it and flow analysis cannot see that.
  const state: { found: Reach | null } = { found: null };
  const visit = (node: ts.Node): void => {
    state.found ??= nodeReach(walk, node, declaration);
    if (state.found === null) {
      ts.forEachChild(node, visit);
    }
  };
  if (ts.isSourceFile(declaration)) {
    state.found = moduleReach(walk, declaration);
  } else {
    const body = bodyOf(declaration);
    if (body !== undefined) {
      visit(body);
    }
  }
  walk.active.delete(declaration);
  if (state.found !== null || walk.cycles === before) {
    walk.memo.set(declaration, state.found);
  }
  return state.found;
}

function doorReaders(program: ts.Program, doorMap: ReadonlyMap<string, string>): { readonly readers: readonly DoorReader[]; readonly exports: number } {
  const checker = program.getTypeChecker();
  const walk: Walk = { checker, memo: new Map(), active: new Set(), cycles: 0 };
  const readers: DoorReader[] = [];
  let exports = 0;
  for (const [door, file] of doorMap) {
    const source = program.getSourceFile(file);
    const module = source === undefined ? undefined : checker.getSymbolAtLocation(source);
    if (source === undefined || module === undefined) {
      throw new Error(`door ${door} did not load from ${file}`);
    }
    for (const exported of checker.getExportsOfModule(module)) {
      exports += 1;
      const reach = symbolReach(walk, exported.declarations?.[0] ?? source, exported, source);
      if (reach !== null) {
        readers.push({ door, exported: exported.name, readIn: reach.readIn, chain: reach.chain });
      }
    }
  }
  return { readers, exports };
}

const doors = doorFiles();
const composed = new Map([["./node/composed", COMPOSED]]);
const buildProgram = createProgramFactory();
let tree: ts.Program;
let planted: ReturnType<typeof doorReaders>;

beforeAll(() => {
  tree = buildProgram([...doors.values()]);
  const original = readFileSync(COMPOSED, "utf8");
  const sources = [...new Set(PLANTED_SHAPES.flatMap(({ source }) => source.split("\n").filter((line) => line.startsWith("import "))))];
  const bodies = PLANTED_SHAPES.map(({ source }) =>
    source
      .split("\n")
      .filter((line) => !line.startsWith("import "))
      .join("\n"),
  );
  // One extra program: every shape is a separate export, so each assertion below still names one edge kind.
  planted = doorReaders(buildProgram([...doors.values()], [original, ...sources, ...bodies].join("\n")), composed);
}, 600_000);

test("every testkit door export reaches a row read only through the accepted route", () => {
  const { readers, exports } = doorReaders(tree, doors);
  expect(exports).toBeGreaterThan(doors.size);
  expect(
    readers.map(({ door, exported }) => ({ door, exported })),
    JSON.stringify(readers, null, 2),
  ).toEqual(ACCEPTED);
});

test.for(PLANTED_SHAPES)("$shape of a row-returning corpus seed on the composed door is refused", ({ exported }) => {
  expect(
    planted.readers.filter((reader) => reader.exported === exported),
    exported,
  ).toEqual([expect.objectContaining({ door: "./node/composed", exported })]);
});
