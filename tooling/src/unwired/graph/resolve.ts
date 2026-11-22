// The one way a symbol becomes declarations, and the walks that find a home for a member the checker built without one.
// Every site of the reference graph that turns a checker answer into "what does this name mean" goes through here, so an
// alias chain, a renamed re-export, a merged declaration or an instantiated symbol is followed to its end in one place.
//
// - A declaration is keyed by its file, span and kind (`DeclKey`): the public node type carries no index, so a handle is
//   resolved to its node and keyed the same way a walked declaration is.
// - Symbol ids are near 2^48, so an alias walk keys its visited set by the exact id per position, never by arithmetic.
// - A mapped member's declaration is the `[K in …]` node that minted it, never the member's home, so the origin walk
//   passes over it; a branch whose member a library declares ends there, and the other branches walk on.
// - A Drizzle row member is placed on its column by the row's whole column-name set (./../drizzle-rows.ts).
import type { MappedTypeNode, Node, TypeNode, TypeReferenceNode } from "@typescript/native/ast";
import {
  isArrowFunction,
  isAsExpression,
  isBindingElement,
  isCallExpression,
  isFunctionDeclaration,
  isFunctionExpression,
  isIdentifier,
  isIndexedAccessTypeNode,
  isIntersectionTypeNode,
  isLiteralTypeNode,
  isMappedTypeNode,
  isMethodDeclaration,
  isMethodSignatureDeclaration,
  isNonNullExpression,
  isParameterDeclaration,
  isParenthesizedExpression,
  isParenthesizedTypeNode,
  isPropertyAccessExpression,
  isPropertyDeclaration,
  isPropertySignatureDeclaration,
  isQualifiedName,
  isSatisfiesExpression,
  isStringLiteral,
  isTypeAliasDeclaration,
  isTypeOperatorNode,
  isTypeQueryNode,
  isTypeReferenceNode,
  isUnionTypeNode,
  isVariableDeclaration,
  SyntaxKind,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Symbol as NativeSymbol, NodeHandle, Type } from "@typescript/native/sync";
import { all, ObjectFlags, SymbolFlags } from "@typescript/native/sync";
import { rowColumnsBySignature, signatureOf } from "../drizzle-rows.ts";
import type { NativeWorld } from "../native.ts";
import { hasFlag } from "../native.ts";

/** A declaration in the tree: its repository-relative file, its span and its syntax kind. */
export type DeclKey = `${string}#${number}-${number}.${number}`;

// A key's kind segment was written from a node's kind, so it always names one.
const isSyntaxKind = (value: number): value is SyntaxKind => value in SyntaxKind;

/** The file, span and kind a declaration key names. */
export function declKeyParts(key: DeclKey): { readonly file: string; readonly pos: number; readonly end: number; readonly kind: SyntaxKind } {
  const hash = key.lastIndexOf("#");
  const dash = key.indexOf("-", hash);
  const dot = key.indexOf(".", dash);
  const kind = Number(key.slice(dot + 1));
  return {
    file: key.slice(0, hash),
    pos: Number(key.slice(hash + 1, dash)),
    end: Number(key.slice(dash + 1, dot)),
    kind: isSyntaxKind(kind) ? kind : SyntaxKind.Unknown,
  };
}

/** A walk's answer: the declarations it found, the level that found them, and how it ended. */
export interface OriginWalk {
  readonly decls: readonly DeclKey[];
  readonly depth: number;
  /** At a kept home, at a library's own declaration (the read is the library's), or out of types. */
  readonly end: "home" | "library" | "exhausted";
}

const EXHAUSTED: OriginWalk = { decls: [], depth: -1, end: "exhausted" };

// What an alias declared in the tree spells as keys: a key set is a type, so the checker hands a walk the literals
// `keyof typeof X` or `(typeof T)[number]` evaluate to and never says which value spelled them; the alias's own syntax
// still does. `queried` are the types a `typeof X` or `keyof X` names (their properties are the keys' homes); each tuple
// is a `(typeof T)[number]` with the literals it yields and T's declarations, the home of every one of those keys.
interface Spelled {
  readonly queried: readonly Type[];
  readonly tuples: readonly SpelledTuple[];
}

interface SpelledTuple {
  readonly keys: ReadonlySet<string>;
  readonly homes: readonly DeclKey[];
}

// A type node a declaration spells its value with, read in a key position.
interface SpellingRoot {
  readonly owner: DeclKey;
  readonly node: TypeNode;
}

// One piece of type syntax to read for keys, the declaration it belongs to, and whether it sits in a key position.
interface SpellingItem {
  readonly owner: DeclKey;
  readonly type: TypeNode;
  readonly key: boolean;
}

const NOTHING: Spelled = { queried: [], tuples: [] };

// Lib type names whose arguments are key sets, by the argument that is: `Record<K, V>`, `Pick<T, K>`, `Omit<T, K>`,
// `Exclude<K, X>`, `Extract<K, X>`; and the ones that pass a key set through whole. By name, as
// tooling/src/unwired/union-origins.ts reads them, since lib declares each once.
const KEY_ARGUMENT: ReadonlyMap<string, number> = new Map([
  ["Record", 0],
  ["Pick", 1],
  ["Omit", 1],
  ["Exclude", 0],
  ["Extract", 0],
]);
const KEY_TRANSPARENT: ReadonlySet<string> = new Set(["Readonly", "Partial", "Required", "NonNullable"]);

// zod's enum door: `schema.enum.k` on `schema = z.enum(T)` reads T's member. Taught by hand.
const ZOD_ENUM_DOORS: ReadonlySet<string> = new Set(["enum", "Enum"]);
const ZOD_ENUM = "enum";

// `all` takes its requests as arguments; a walk over many names and types can ask more than a call's argument limit.
const CHUNK = 8192;

function* allOf<T>(gens: readonly APIRequestGenerator<T>[]): APIRequestGenerator<T[]> {
  const out: T[] = [];
  for (let at = 0; at < gens.length; at += CHUNK) {
    out.push(...(yield* all(...gens.slice(at, at + CHUNK))));
  }
  return out;
}

const NO_REQUESTS: readonly never[] = [];

/** A request generator that asks nothing and returns `value`, for a slot of a batch that needs no answer. */
export function* answer<T>(value: T): APIRequestGenerator<T> {
  yield* NO_REQUESTS;
  return value;
}

/** A type node with its parentheses removed. */
export const unparenType = (node: TypeNode): TypeNode => {
  let at = node;
  while (isParenthesizedTypeNode(at)) {
    at = at.type;
  }
  return at;
};

// The `typeof T` an index chain such as `(typeof T)[number]["key"]` is rooted at.
function chainRoot(node: TypeNode): Node | undefined {
  let at = node;
  while (isIndexedAccessTypeNode(at)) {
    at = unparenType(at.objectType);
  }
  return isTypeQueryNode(at) ? at : undefined;
}

/** An expression with its parentheses and non-null assertions removed. */
export const unwrapExpression = (node: Node | undefined): Node | undefined => {
  let at = node;
  while (at !== undefined && (isParenthesizedExpression(at) || isNonNullExpression(at))) {
    at = at.expression;
  }
  return at;
};

// The value an assertion wraps: `z.enum(T) satisfies …`.
const unassert = (node: Node | undefined): Node | undefined => {
  let at = unwrapExpression(node);
  while (at !== undefined && (isSatisfiesExpression(at) || isAsExpression(at))) {
    at = unwrapExpression(at.expression);
  }
  return at;
};

// A declaration's own type annotation: a variable's, a member's, a parameter's, an alias's, a function's return.
function annotationOf(node: Node): TypeNode | undefined {
  if (
    isTypeAliasDeclaration(node) ||
    isVariableDeclaration(node) ||
    isPropertyDeclaration(node) ||
    isPropertySignatureDeclaration(node) ||
    isParameterDeclaration(node) ||
    isFunctionDeclaration(node) ||
    isMethodDeclaration(node) ||
    isMethodSignatureDeclaration(node) ||
    isArrowFunction(node) ||
    isFunctionExpression(node)
  ) {
    return node.type;
  }
  return undefined;
}

// A declaration's initializer: a variable's, a class field's, a parameter's or a binding's default.
function initializerOf(node: Node): Node | undefined {
  return isVariableDeclaration(node) || isPropertyDeclaration(node) || isParameterDeclaration(node) || isBindingElement(node) ? node.initializer : undefined;
}

// Each name still walking, with the ids of the types on the current level it rides.
type LiveNames = ReadonlyMap<string, ReadonlySet<number>>;

interface LevelHomes {
  readonly carries: Set<string>[];
  readonly found: Map<string, Set<DeclKey>>;
  readonly ended: Map<string, Set<number>>;
  spelled: readonly Spelled[];
}

function addAll<T>(into: Map<string, Set<T>>, name: string, values: Iterable<T>): void {
  const set = into.get(name) ?? new Set<T>();
  for (const value of values) {
    set.add(value);
  }
  into.set(name, set);
}

// Settle each live name the level answered, and keep the rest walking. A type that names the property with a real
// declaration is that branch's origin; one outside the tree (a library's own member, such as a query builder's `where`)
// ends the branch, and the other branches walk on.
function settleNames(live: LiveNames, homes: LevelHomes, depth: number, out: Map<string, OriginWalk>): LiveNames {
  const next = new Map<string, ReadonlySet<number>>();
  for (const [name, on] of live) {
    const found = homes.found.get(name);
    if (found !== undefined && found.size > 0) {
      out.set(name, { decls: [...found], depth, end: "home" });
      continue;
    }
    const stop = homes.ended.get(name);
    const kept = [...on].filter((id) => stop?.has(id) !== true);
    if (kept.length === 0) {
      out.set(name, { decls: [], depth, end: stop !== undefined && stop.size > 0 ? "library" : "exhausted" });
    } else {
      next.set(name, new Set(kept));
    }
  }
  return next;
}

// The tuple a `z.enum(T)` initializer hands zod: `schema = z.enum(T)`, through any assertion.
function enumArgumentOf(declaration: Node): readonly Node[] {
  const call = unassert(unwrapExpression(initializerOf(declaration)));
  if (call === undefined || !isCallExpression(call)) {
    return [];
  }
  const callee = unwrapExpression(call.expression);
  const [tuple] = call.arguments;
  return callee !== undefined && isPropertyAccessExpression(callee) && callee.name.text === ZOD_ENUM && tuple !== undefined ? [tuple] : [];
}

// The name a receiver is read through: `a.b`'s `b`, or a bare identifier.
function receiverName(at: Node | undefined): Node | undefined {
  if (at !== undefined && isPropertyAccessExpression(at)) {
    return at.name;
  }
  return at !== undefined && isIdentifier(at) ? at : undefined;
}

/** The declarations, origin walks and key spellings of one program. Answers depend only on the snapshot, so every
 *  cache lives for the build. */
export class Resolver {
  readonly #world: NativeWorld;
  readonly #handleKeys = new WeakMap<NodeHandle, DeclKey | null>();
  readonly #related = new Map<string, readonly Type[]>();
  readonly #spelledByAlias = new Map<string, Spelled>();
  readonly #spelledByType = new Map<number, Spelled>();
  #rows: ReadonlyMap<string, ReadonlyMap<string, readonly DeclKey[]>> | undefined;

  constructor(world: NativeWorld) {
    this.#world = world;
  }

  /** A walked declaration's key. */
  keyOf(node: Node): DeclKey {
    return `${this.#world.fileOfSource(node.getSourceFile())}#${node.pos}-${node.end}.${node.kind}`;
  }

  /** Whether a declaration sits in the tree's own sources. */
  ours(handle: NodeHandle): boolean {
    return this.#world.fileOf(handle) !== null;
  }

  /** The key of each handle in the tree's own sources, in order; a library's handle has none. */
  handleKeys(handles: readonly NodeHandle[]): DeclKey[] {
    const missing = [...new Set(handles.filter((handle) => this.ours(handle) && !this.#handleKeys.has(handle)))];
    const nodes = this.#world.batch(missing.map((handle) => handle.resolve.gen()));
    for (const [at, handle] of missing.entries()) {
      const node = nodes[at];
      this.#handleKeys.set(handle, node === undefined ? null : this.keyOf(node));
    }
    return handles.flatMap((handle) => {
      const key = this.#handleKeys.get(handle);
      return key === undefined || key === null ? [] : [key];
    });
  }

  /** A handle's key inside a request generator. */
  *handleKey(handle: NodeHandle): APIRequestGenerator<DeclKey | null> {
    if (!this.ours(handle)) {
      return null;
    }
    const known = this.#handleKeys.get(handle);
    if (known !== undefined) {
      return known;
    }
    const node = yield* handle.resolve.gen();
    const key = node === undefined ? null : this.keyOf(node);
    this.#handleKeys.set(handle, key);
    return key;
  }

  /**
   * Every declaration each symbol means: its own, its alias targets (getAliasedSymbol follows the whole chain, so a
   * barrel of renames lands on the original), and, for a symbol the checker built without declarations (an
   * instantiated member), the target it was instantiated from.
   */
  declarations(symbols: readonly (NativeSymbol | undefined)[]): DeclKey[][] {
    const handles = symbols.map((): NodeHandle[] => []);
    let pending = symbols.flatMap((symbol, at) => (symbol === undefined ? [] : [{ at, symbol, seen: new Set<number>() }]));
    const { checker } = this.#world;
    while (pending.length > 0) {
      pending = pending.filter(({ symbol, seen }) => {
        if (seen.has(symbol.id)) {
          return false;
        }
        seen.add(symbol.id);
        return true;
      });
      for (const { at, symbol } of pending) {
        handles[at]?.push(...symbol.declarations.filter((handle) => this.ours(handle)));
      }
      const steps = this.#world.batch(
        pending.map(({ symbol }) => {
          if (hasFlag(symbol.flags, SymbolFlags.Alias)) {
            return checker.getAliasedSymbol.gen(symbol);
          }
          return symbol.declarations.length === 0 ? checker.getTargetSymbol.gen(symbol) : answer<NativeSymbol | undefined>(undefined);
        }),
      );
      pending = pending.flatMap(({ at, symbol, seen }, step) => {
        const next = steps[step];
        return next === undefined || next.id === symbol.id ? [] : [{ at, symbol: next, seen }];
      });
    }
    this.handleKeys(handles.flat());
    return handles.map((list) => [...new Set(list.flatMap((handle) => this.#cachedKey(handle)))]);
  }

  #cachedKey(handle: NodeHandle): readonly DeclKey[] {
    const key = this.#handleKeys.get(handle);
    return key === undefined || key === null ? [] : [key];
  }

  /** The Drizzle row tables: each table's column declarations by name, keyed by the table's sorted column names. */
  rows(): ReadonlyMap<string, ReadonlyMap<string, readonly DeclKey[]>> {
    if (this.#rows === undefined) {
      const bySignature = rowColumnsBySignature(this.#world);
      const columns = [...bySignature.values()].flatMap((table) => [...table.values()].flat());
      this.handleKeys(columns.flatMap((symbol) => symbol.declarations));
      this.#rows = new Map(
        [...bySignature].map(([signature, table]) => [
          signature,
          new Map([...table].map(([name, symbols]) => [name, symbols.flatMap((symbol) => symbol.declarations.flatMap((handle) => this.#cachedKey(handle)))])),
        ]),
      );
    }
    return this.#rows;
  }

  /**
   * The types a type was built from, asked only where its kind has that relation: an alias's arguments, a reference's
   * target and arguments, a union or intersection's members, a mapped type's template and key constraint, an indexed
   * access's object, a conditional's branches, a class or interface's bases, and its apparent type. `args` asks only the
   * type arguments, for an object type that does not carry the name: it is not the origin, but what it was
   * instantiated with may be (a variants literal inside a tv() return type).
   */
  *relatedTypes(type: Type, mode: "full" | "args"): APIRequestGenerator<readonly Type[]> {
    const key = `${String(type.id)}${mode}`;
    const known = this.#related.get(key);
    if (known !== undefined) {
      return known;
    }
    const { checker } = this.#world;
    const out: Type[] = [...(yield* type.getAliasTypeArguments.gen())];
    if (type.isTypeReference()) {
      out.push(...(yield* checker.getTypeArguments.gen(type)));
    }
    if (mode === "full") {
      out.push(...(yield* this.#builtFrom(type)));
    }
    this.#related.set(key, out);
    return out;
  }

  // The relations of a type's own kind, each asked only where the kind has it.
  *#builtFrom(type: Type): APIRequestGenerator<readonly Type[]> {
    const out: Type[] = [];
    if (type.isUnionType() || type.isIntersectionType()) {
      out.push(...(yield* type.getTypes.gen()));
    }
    if (type.isMappedType()) {
      out.push(yield* type.getTemplateType.gen(), yield* type.getConstraintType.gen());
    }
    if (type.isIndexedAccessType()) {
      out.push(yield* type.getObjectType.gen());
    }
    if (type.isConditionalType()) {
      out.push(yield* type.getTrueType.gen(), yield* type.getFalseType.gen());
    }
    if (type.isTypeReference()) {
      out.push(yield* type.getTarget.gen());
    }
    if (type.isClassOrInterface()) {
      out.push(...((yield* type.getBaseTypes.gen()) ?? []));
    }
    out.push(yield* this.#world.checker.getApparentType.gen(type));
    return out;
  }

  /**
   * What the given declarations' type syntax spells as keys, read through every alias a key position names (imports
   * followed). Only a key position counts (a record's or a selection's key argument, a mapped type's constraint, a
   * `keyof`, and the root itself), so a literal that types a value (`kind: "a"`) never answers a read of `.a`.
   */
  *readSpelling(starts: readonly NodeHandle[], roots: readonly SpellingRoot[] = []): APIRequestGenerator<Spelled> {
    const { checker } = this.#world;
    const inline = new Map<string, Set<DeclKey>>();
    const queries: Node[] = [];
    const tuples: TypeNode[] = [];
    const seen = new Set<DeclKey>();
    let todo = starts;
    let pendingRoots = roots;
    while (todo.length > 0 || pendingRoots.length > 0) {
      const refs: Node[] = [];
      const items: SpellingItem[] = [
        ...pendingRoots.map((root) => ({ owner: root.owner, type: root.node, key: true })),
        ...(yield* this.#spellingItems(todo, seen)),
      ];
      pendingRoots = [];
      for (const item of items) {
        spellKeys(item.type, item.key, { owner: item.owner, inline, queries, tuples, refs });
      }
      todo = refs.length > 0 ? yield* this.#aliasDeclarations(refs) : [];
    }
    const queried = queries.length > 0 ? yield* checker.getTypeAtLocation.gen(queries) : [];
    const found = [...(yield* this.#tupleKeys(tuples)), ...[...inline].map(([key, owners]) => ({ keys: new Set([key]), homes: [...owners] }))];
    return queried.length > 0 || found.length > 0 ? { queried, tuples: found } : NOTHING;
  }

  // Each declaration not yet read, as the type syntax it spells: a mapped type node is its own spelling; an alias or an
  // annotated declaration spells its type, the key set itself.
  *#spellingItems(todo: readonly NodeHandle[], seen: Set<DeclKey>): APIRequestGenerator<readonly SpellingItem[]> {
    const items: SpellingItem[] = [];
    for (const handle of todo) {
      const owner = yield* this.handleKey(handle);
      if (owner === null || seen.has(owner)) {
        continue;
      }
      seen.add(owner);
      const declaration = yield* handle.resolve.gen();
      if (declaration !== undefined && isMappedTypeNode(declaration)) {
        items.push({ owner, type: declaration, key: false });
        continue;
      }
      const annotation = declaration === undefined ? undefined : annotationOf(declaration);
      if (annotation !== undefined) {
        items.push({ owner, type: annotation, key: true });
      }
    }
    return items;
  }

  // The type alias declarations of ours that the references name, imports followed.
  *#aliasDeclarations(refs: readonly Node[]): APIRequestGenerator<readonly NodeHandle[]> {
    const { checker } = this.#world;
    const symbols = yield* checker.getSymbolAtLocation.gen(refs);
    const targets = yield* allOf(
      symbols.map((symbol) => (symbol !== undefined && hasFlag(symbol.flags, SymbolFlags.Alias) ? checker.getAliasedSymbol.gen(symbol) : answer(symbol))),
    );
    return targets.flatMap((symbol) => (symbol?.declarations ?? []).filter((handle) => handle.kind === SyntaxKind.TypeAliasDeclaration && this.ours(handle)));
  }

  // Each tuple a key position yields from: its string keys and the declarations of the value it is read from.
  *#tupleKeys(tuples: readonly TypeNode[]): APIRequestGenerator<readonly SpelledTuple[]> {
    if (tuples.length === 0) {
      return [];
    }
    const { checker } = this.#world;
    const yields = yield* checker.getTypeAtLocation.gen(tuples);
    const names = tuples.map((tuple) => {
      const root = chainRoot(tuple);
      return root !== undefined && isTypeQueryNode(root) ? root.exprName : root;
    });
    const symbols = yield* checker.getSymbolAtLocation.gen(names.flatMap((name) => (name === undefined ? [] : [name])));
    const found: SpelledTuple[] = [];
    for (const [at, yielded] of yields.entries()) {
      const members = yield* constituentsOf(yielded);
      const keys = new Set(members.flatMap((member) => (member.isStringLiteralType() ? [member.value] : [])));
      const homes = (yield* allOf((symbols[at]?.declarations ?? []).map((handle) => this.handleKey(handle)))).flatMap((home) => (home === null ? [] : [home]));
      if (keys.size > 0 && homes.length > 0) {
        found.push({ keys, homes });
      }
    }
    return found;
  }

  // What one type spells, through its alias's declaration or an inline mapped type's own node.
  *#spelledOf(type: Type): APIRequestGenerator<Spelled> {
    const known = this.#spelledByType.get(type.id);
    if (known !== undefined) {
      return known;
    }
    const owners: NativeSymbol[] = [];
    const alias = yield* type.getAliasSymbol.gen();
    if (alias !== undefined) {
      owners.push(alias);
    }
    if (type.isMappedType()) {
      const own = yield* type.getSymbol.gen();
      if (own !== undefined) {
        owners.push(own);
      }
    }
    const starts = owners.flatMap((owner) => owner.declarations).filter((handle) => this.ours(handle));
    let found = NOTHING;
    if (starts.length > 0) {
      const key = starts
        .map((handle) => `${handle.path}#${String(handle.index)}`)
        .sort()
        .join(",");
      found = this.#spelledByAlias.get(key) ?? (yield* this.readSpelling(starts));
      this.#spelledByAlias.set(key, found);
    }
    this.#spelledByType.set(type.id, found);
    return found;
  }

  /**
   * The declarations property names have on the types `start` was built from, every name in one walk: a mapped type
   * (`Pick`, `Partial`, `Record<keyof T, V>`, a row inferred from a table) gives its members no declarations, so the
   * walk follows the relations back level by level until a level names the property with a kept declaration. A type's
   * relations do not depend on the name, so the names share each level's expansion; each name keeps its own end. Type
   * ids already seen stop cycles, so the depth is the data's. `startCounts` lets the start's own declarations answer.
   */
  *originsOf(start: Type, names: readonly string[], startCounts = false): APIRequestGenerator<OriginWalk[]> {
    const out = new Map<string, OriginWalk>();
    const seen = new Set<number>([start.id]);
    let level: readonly Type[] = [start];
    let live: LiveNames = new Map(names.map((name) => [name, new Set<number>([start.id])]));
    for (let depth = 0; level.length > 0 && live.size > 0; depth++) {
      const homes = yield* this.#levelHomes(level, live, depth > 0 || startCounts);
      live = settleNames(live, homes, depth, out);
      if (live.size === 0) {
        break;
      }
      const grown = yield* this.#grow(level, live, homes.carries, depth);
      const children = new Map<number, number[]>();
      const nextLevel: Type[] = [];
      for (const [at, type] of level.entries()) {
        const kids = [...(grown[at] ?? []), ...(homes.spelled[at]?.queried ?? [])];
        for (const child of kids.filter((kid) => !seen.has(kid.id))) {
          seen.add(child.id);
          nextLevel.push(child);
        }
        children.set(
          type.id,
          kids.map((child) => child.id),
        );
      }
      // a name follows only the branches it is still live on
      live = new Map([...live].map(([name, on]) => [name, new Set([...on].flatMap((id) => children.get(id) ?? []))]));
      level = nextLevel;
    }
    return names.map((name) => out.get(name) ?? EXHAUSTED);
  }

  // What one level of the walk answers for each live name: the declarations a type on the level names it with, the
  // table a row on the level is, and the tuple an alias on the level spells it in; and where each name's branch ended.
  *#levelHomes(level: readonly Type[], live: LiveNames, ownCount: boolean): APIRequestGenerator<LevelHomes> {
    const { checker } = this.#world;
    const asks = level.flatMap((type, at) => [...live].flatMap(([name, on]) => (on.has(type.id) ? [{ type, at, name }] : [])));
    const props = yield* allOf(asks.map((ask) => checker.getPropertyOfType.gen(ask.type, ask.name)));
    const homes: LevelHomes = { carries: level.map(() => new Set<string>()), found: new Map(), ended: new Map(), spelled: [] };
    for (const [x, ask] of asks.entries()) {
      const declared = (props[x]?.declarations ?? []).filter((declaration) => declaration.kind !== SyntaxKind.MappedType);
      if (props[x] !== undefined) {
        homes.carries[ask.at]?.add(ask.name);
      }
      if (declared.length > 0) {
        addAll(homes.ended, ask.name, [ask.type.id]);
      }
      const keys = ownCount ? yield* allOf(declared.map((handle) => this.handleKey(handle))) : [];
      addAll(
        homes.found,
        ask.name,
        keys.flatMap((key) => (key === null ? [] : [key])),
      );
    }
    yield* this.#rowHomes(level, homes);
    homes.spelled = yield* allOf(level.map((type) => this.#spelledOf(type)));
    // a key that a tuple an alias on this level spells yields lands on the tuple: no declaration names one key alone
    for (const [name, on] of live) {
      for (const [at, type] of level.entries()) {
        const tuples = on.has(type.id) ? (homes.spelled[at]?.tuples ?? []) : [];
        addAll(
          homes.found,
          name,
          tuples.flatMap((tuple) => (tuple.keys.has(name) ? tuple.homes : [])),
        );
      }
    }
    return homes;
  }

  // A type carrying a name whose whole member set is a table's columns is that table's row.
  *#rowHomes(level: readonly Type[], homes: LevelHomes): APIRequestGenerator<void> {
    const rows = this.rows();
    if (rows.size === 0) {
      return;
    }
    const carriers = level.flatMap((type, at) => ((homes.carries[at]?.size ?? 0) > 0 ? [{ type, at }] : []));
    const members = yield* allOf(carriers.map(({ type }) => this.#world.checker.getPropertiesOfType.gen(type)));
    for (const [x, { at }] of carriers.entries()) {
      const table = rows.get(signatureOf((members[x] ?? []).map((member) => member.name)));
      if (table === undefined) {
        continue;
      }
      for (const name of homes.carries[at] ?? []) {
        addAll(homes.found, name, table.get(name) ?? []);
      }
    }
  }

  // Expand each live type once: in full where a live name still rides it or it composes types, else its arguments.
  *#grow(level: readonly Type[], live: LiveNames, carries: readonly ReadonlySet<string>[], depth: number): APIRequestGenerator<readonly (readonly Type[])[]> {
    return yield* allOf(
      level.map((type, at) => {
        const riding = [...live].filter(([, on]) => on.has(type.id));
        if (riding.length === 0) {
          return answer<readonly Type[]>([]);
        }
        const full = depth === 0 || riding.some(([name]) => carries[at]?.has(name) === true) || composes(type);
        return this.relatedTypes(type, full ? "full" : "args");
      }),
    );
  }

  /**
   * A read whose receiver's type has lost the key's home (a lib `Record` over a collapsed key union) is answered from
   * the receiver's own declaration, by what its syntax spells: its annotation; an `as` or `satisfies` its initializer
   * ends in; the return annotation of the function its initializer calls; or, taught by hand, zod's enum door, where
   * `schema.enum.k` on `schema = z.enum(T)` reads T's member. Each spelled home is the answer and each queried type is
   * walked as a start.
   */
  *annotationOrigin(receiver: Node, name: string): APIRequestGenerator<OriginWalk> {
    const { checker } = this.#world;
    const unwrapped = unwrapExpression(receiver);
    const door =
      unwrapped !== undefined && isPropertyAccessExpression(unwrapped) && ZOD_ENUM_DOORS.has(unwrapped.name.text)
        ? unwrapExpression(unwrapped.expression)
        : undefined;
    const nameNode = receiverName(door ?? unwrapped);
    if (nameNode === undefined) {
      return EXHAUSTED;
    }
    let symbol = yield* checker.getSymbolAtLocation.gen(nameNode);
    if (symbol !== undefined && hasFlag(symbol.flags, SymbolFlags.Alias)) {
      symbol = yield* checker.getAliasedSymbol.gen(symbol);
    }
    const declarations: { readonly owner: DeclKey; readonly declaration: Node }[] = [];
    for (const handle of (symbol?.declarations ?? []).filter((declaration) => this.ours(declaration))) {
      const declaration = yield* handle.resolve.gen();
      const owner = yield* this.handleKey(handle);
      if (declaration !== undefined && owner !== null) {
        declarations.push({ owner, declaration });
      }
    }
    if (door !== undefined) {
      return yield* this.#enumHomes(
        declarations.flatMap(({ declaration }) => enumArgumentOf(declaration)),
        symbol,
      );
    }
    const roots: SpellingRoot[] = [];
    for (const { owner, declaration } of declarations) {
      roots.push(...(yield* this.#spellingRoot(owner, declaration)));
    }
    return roots.length === 0 ? EXHAUSTED : yield* this.#spelledHome(roots, name);
  }

  // The type syntax a declaration spells its value with: its annotation, the `as` or `satisfies` its initializer ends
  // in, or the return annotation of our function its initializer calls.
  *#spellingRoot(owner: DeclKey, declaration: Node): APIRequestGenerator<readonly SpellingRoot[]> {
    const annotation = annotationOf(declaration);
    if (annotation !== undefined) {
      return [{ owner, node: annotation }];
    }
    const initializer = unwrapExpression(initializerOf(declaration));
    if (initializer !== undefined && (isAsExpression(initializer) || isSatisfiesExpression(initializer))) {
      return [{ owner, node: initializer.type }];
    }
    if (initializer === undefined || !isCallExpression(initializer)) {
      return [];
    }
    const target = (yield* this.#world.checker.getResolvedSignature.gen(initializer)).declaration;
    const fn = target !== undefined && this.ours(target) ? yield* target.resolve.gen() : undefined;
    const returned = fn === undefined ? undefined : annotationOf(fn);
    const fnOwner = target === undefined ? null : yield* this.handleKey(target);
    return returned !== undefined && fnOwner !== null ? [{ owner: fnOwner, node: returned }] : [];
  }

  // The home a name has in what the roots spell: a tuple that yields it, else the origin of a type they query.
  *#spelledHome(roots: readonly SpellingRoot[], name: string): APIRequestGenerator<OriginWalk> {
    const spelled = yield* this.readSpelling([], roots);
    const homes = spelled.tuples.filter((tuple) => tuple.keys.has(name)).flatMap((tuple) => tuple.homes);
    if (homes.length > 0) {
      return { decls: [...new Set(homes)], depth: 0, end: "home" };
    }
    for (const queried of spelled.queried) {
      const [walk] = yield* this.originsOf(queried, [name], true);
      if (walk !== undefined && walk.decls.length > 0) {
        return { decls: walk.decls, depth: walk.depth + 1, end: "home" };
      }
    }
    return EXHAUSTED;
  }

  // The homes of `z.enum(T)`'s keys: a named tuple's declarations, or the schema's own for an inline array literal.
  *#enumHomes(tuples: readonly Node[], schema: NativeSymbol | undefined): APIRequestGenerator<OriginWalk> {
    const { checker } = this.#world;
    const homes: DeclKey[] = [];
    const symbols = yield* checker.getSymbolAtLocation.gen(tuples);
    for (const [at, tuple] of tuples.entries()) {
      const declarations = isIdentifier(tuple) ? (symbols[at]?.declarations ?? []) : (schema?.declarations ?? []);
      for (const handle of declarations) {
        const home = yield* this.handleKey(handle);
        if (home !== null) {
          homes.push(home);
        }
      }
    }
    return homes.length > 0 ? { decls: [...new Set(homes)], depth: 0, end: "home" } : EXHAUSTED;
  }

  /**
   * Why a read has no home by design, or null when it is a real loss: `narrowed` is the `Record<"k", unknown>` a
   * `"k" in x` check intersects in (the key was never declared anywhere), `synthetic` a member the checker makes for a
   * tuple (`length`).
   */
  *unbackedReason(type: Type, name: string): APIRequestGenerator<"narrowed" | "synthetic" | null> {
    const parts = type.isIntersectionType() ? yield* type.getTypes.gen() : [type];
    for (const part of parts) {
      const alias = yield* part.getAliasSymbol.gen();
      if (alias?.name !== RECORD) {
        continue;
      }
      const [key] = yield* part.getAliasTypeArguments.gen();
      if (key?.isStringLiteralType() === true && key.value === name) {
        return "narrowed";
      }
    }
    if (name === TUPLE_LENGTH) {
      const members = yield* constituentsOf(type);
      const targets = yield* allOf(members.map((member) => (member.isTypeReference() ? member.getTarget.gen() : answer<Type | undefined>(undefined))));
      if (targets.length > 0 && targets.every((target) => target?.isObjectType() === true && hasFlag(target.objectFlags, ObjectFlags.Tuple))) {
        return "synthetic";
      }
    }
    return null;
  }
}

const RECORD = "Record";
const TUPLE_LENGTH = "length";

/** A union's member types, or the type itself. */
export function* constituentsOf(type: Type): APIRequestGenerator<readonly Type[]> {
  return type.isUnionType() ? yield* type.getTypes.gen() : [type];
}

// A type that composes other types: its members are its parts', so a walk always expands it.
const composes = (type: Type): boolean =>
  type.isUnionType() || type.isIntersectionType() || type.isIndexType() || type.isIndexedAccessType() || type.isConditionalType() || type.isMappedType();

interface SpellingSink {
  readonly owner: DeclKey;
  readonly inline: Map<string, Set<DeclKey>>;
  readonly queries: Node[];
  readonly tuples: TypeNode[];
  readonly refs: Node[];
}

// One type node's key spelling. `key` says whether the node sits in a key position.
function spellKeys(node: Node, key: boolean, sink: SpellingSink): void {
  if (isUnionTypeNode(node) || isIntersectionTypeNode(node) || isParenthesizedTypeNode(node)) {
    node.forEachChild((child) => spellKeys(child, key, sink));
    return;
  }
  if (isTypeOperatorNode(node) && node.operator === SyntaxKind.KeyOfKeyword) {
    sink.queries.push(node.type);
    return;
  }
  if (isMappedTypeNode(node)) {
    spellMapped(node, sink);
    return;
  }
  // an index chain rooted at a value query (`(typeof T)[number]`, `(typeof DEFS)[number]["key"]`) yields T's literals
  if (key && isIndexedAccessTypeNode(node) && chainRoot(node) !== undefined) {
    sink.tuples.push(node);
    return;
  }
  if (isTypeQueryNode(node)) {
    if (key) {
      sink.queries.push(node);
    }
    return;
  }
  if (isLiteralTypeNode(node)) {
    if (key && isStringLiteral(node.literal)) {
      addAll(sink.inline, node.literal.text, [sink.owner]);
    }
    return;
  }
  if (isTypeReferenceNode(node)) {
    spellReference(node, key, sink);
    return;
  }
  node.forEachChild((child) => spellKeys(child, false, sink));
}

// A mapped type's constraint is a key position; its template types values.
function spellMapped(node: MappedTypeNode, sink: SpellingSink): void {
  if (node.typeParameter.constraint !== undefined) {
    spellKeys(node.typeParameter.constraint, true, sink);
  }
  if (node.type !== undefined) {
    spellKeys(node.type, false, sink);
  }
}

function spellReference(node: TypeReferenceNode, key: boolean, sink: SpellingSink): void {
  const id = isQualifiedName(node.typeName) ? node.typeName.right : node.typeName;
  const args = node.typeArguments ?? [];
  const keyAt = KEY_ARGUMENT.get(id.text);
  if (keyAt !== undefined) {
    for (const [at, argument] of args.entries()) {
      spellKeys(argument, at === keyAt, sink);
    }
    return;
  }
  if (KEY_TRANSPARENT.has(id.text)) {
    for (const [at, argument] of args.entries()) {
      spellKeys(argument, at === 0 && key, sink);
    }
    return;
  }
  if (key) {
    sink.refs.push(id);
  }
  for (const argument of args) {
    spellKeys(argument, false, sink);
  }
}
