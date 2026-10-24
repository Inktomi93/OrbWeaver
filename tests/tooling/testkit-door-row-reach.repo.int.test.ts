// No testkit door export reaches a drizzle row read, except the one accepted route named below, so a seed cannot hand a
// verb suite a row. Dependency-cruiser cannot judge this: it sees modules, and every door already reaches the rows tier
// through `fixtures.ts` → `corpus.ts`, so a planted re-export adds no new module edge. The walk follows exports instead.
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import ts from "typescript";
import { beforeAll } from "vitest";

const REPO = join(import.meta.dirname, "../..");
const SUPPORT = join(REPO, "tests/support/");
const ROWS_DOOR = "./node/rows";
const COMPOSED = join(SUPPORT, "node/composed.ts");
const READ_METHODS = new Set(["select", "selectDistinct", "$count", "with", "all", "get", "values"]);
const READ_MEMBERS = new Set(["query", "$with"]);
const DRIZZLE_OWNERS = new Set(["BaseSQLiteDatabase", "LibSQLDatabase", "SQLiteTransaction", "LibSQLTransaction"]);
// The capsule refuses a copied private database holding unfinished work before the server that would resume it boots;
// no verb exists before boot, so this read is the one accepted route (eslint.config.ts names corpus.ts for the same reason).
const ACCEPTED = [{ door: "./node/composed", exported: "createCorpusCapsule", readIn: "assertPrivateCorpusIdle" }] as const;
const PLANTED_REEXPORT = 'export { seedCorpusLibraries } from "./corpus-seed.ts";';

interface DoorReader {
  readonly door: string;
  readonly exported: string;
  /** The function whose body holds the drizzle read the export reaches. */
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

function createDoorProgram(roots: readonly string[], composedSource?: string, oldProgram?: ts.Program): ts.Program {
  const configPath = join(REPO, "tsconfig.json");
  const parsed = ts.parseJsonConfigFileContent(ts.readConfigFile(configPath, ts.sys.readFile).config, ts.sys, dirname(configPath));
  const options = { ...parsed.options, noEmit: true };
  const host = ts.createCompilerHost(options, true);
  if (composedSource !== undefined) {
    const read = host.getSourceFile.bind(host);
    host.getSourceFile = (name, version, onError, create): ts.SourceFile | undefined =>
      name === COMPOSED ? ts.createSourceFile(name, composedSource, version, true) : read(name, version, onError, create);
  }
  return ts.createProgram({ rootNames: roots, options, host, ...(oldProgram === undefined ? {} : { oldProgram }) });
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
    ts.isGetAccessorDeclaration(declaration)
  ) {
    return declaration.body;
  }
  if (ts.isArrowFunction(declaration)) {
    return declaration.body;
  }
  if (ts.isVariableDeclaration(declaration)) {
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

// A call either is a drizzle read, or resolves to a testkit function whose body the walk enters.
function callReach(walk: Walk, node: ts.CallExpression, from: ts.Node): Reach | null {
  const target = walk.checker.getResolvedSignature(node)?.declaration;
  if (target === undefined || ts.isJSDocSignature(target)) {
    return null;
  }
  if (isDrizzleMember(target, READ_METHODS)) {
    return directRead(node);
  }
  let owner: ts.Node | undefined = inSupport(target) ? target : undefined;
  while (owner !== undefined && bodyOf(owner) === undefined) {
    owner = owner.parent;
  }
  return owner === undefined || owner === from ? null : step(node, reachFrom(walk, owner));
}

// A testkit helper passed as a value (a callback) can still run its read.
function referenceReach(walk: Walk, node: ts.Identifier, from: ts.Node): Reach | null {
  const symbol = walk.checker.getSymbolAtLocation(node);
  for (const referenced of symbol === undefined ? [] : (resolveAlias(walk.checker, symbol).declarations ?? [])) {
    const isFunction =
      ts.isFunctionDeclaration(referenced) ||
      (ts.isVariableDeclaration(referenced) && referenced.initializer !== undefined && isFunctionValue(referenced.initializer));
    const sub = isFunction && referenced !== from && inSupport(referenced) ? step(node, reachFrom(walk, referenced)) : null;
    if (sub !== null) {
      return sub;
    }
  }
  return null;
}

function step(node: ts.Node, sub: Reach | null): Reach | null {
  return sub === null ? null : { chain: [site(node), ...sub.chain], readIn: sub.readIn };
}

function nodeReach(walk: Walk, node: ts.Node, from: ts.Node): Reach | null {
  if (ts.isCallExpression(node)) {
    const reach = callReach(walk, node, from);
    if (reach !== null) {
      return reach;
    }
  }
  if (
    ts.isPropertyAccessExpression(node) &&
    READ_MEMBERS.has(node.name.text) &&
    (walk.checker.getSymbolAtLocation(node.name)?.declarations ?? []).some((member) => isDrizzleMember(member, READ_MEMBERS))
  ) {
    return directRead(node);
  }
  if (ts.isIdentifier(node) && !ts.isPropertyAccessExpression(node.parent)) {
    return referenceReach(walk, node, from);
  }
  return null;
}

// The first drizzle read reachable from a declaration, by calls and by helpers passed as values, inside tests/support.
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
  const body = bodyOf(declaration);
  if (body !== undefined) {
    visit(body);
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
    if (module === undefined) {
      throw new Error(`door ${door} did not load from ${file}`);
    }
    for (const exported of checker.getExportsOfModule(module)) {
      exports += 1;
      const reach = (resolveAlias(checker, exported).declarations ?? [])
        .filter(inSupport)
        .reduce<Reach | null>((first, declaration) => first ?? reachFrom(walk, declaration), null);
      if (reach !== null) {
        readers.push({ door, exported: exported.name, readIn: reach.readIn, chain: reach.chain });
      }
    }
  }
  return { readers, exports };
}

const doors = doorFiles();
let tree: ts.Program;

beforeAll(() => {
  tree = createDoorProgram([...doors.values()]);
}, 600_000);

test("every testkit door export reaches a row read only through the accepted route", () => {
  const { readers, exports } = doorReaders(tree, doors);
  expect(exports).toBeGreaterThan(doors.size);
  expect(
    readers.map(({ door, exported, readIn }) => ({ door, exported, readIn })),
    JSON.stringify(readers, null, 2),
  ).toEqual(ACCEPTED);
});

test("a planted re-export of a row-returning corpus seed on the composed door is refused", () => {
  const source = readFileSync(COMPOSED, "utf8");
  expect(source).not.toContain(PLANTED_REEXPORT);
  const planted = createDoorProgram([...doors.values()], `${source}\n${PLANTED_REEXPORT}\n`, tree);
  const { readers } = doorReaders(planted, doors);
  expect(readers.filter(({ exported }) => exported === "seedCorpusLibraries")).toEqual([
    expect.objectContaining({ door: "./node/composed", exported: "seedCorpusLibraries" }),
  ]);
}, 600_000);
