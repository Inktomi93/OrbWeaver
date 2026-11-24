// The one way a symbol becomes declarations, and the walks that find a home for a member the checker built without one.
// Every site of the reference graph that turns a checker answer into "what does this name mean" goes through here, so an
// alias chain, a renamed re-export, a merged declaration or an instantiated symbol is followed to its end in one place.
//
// - A declaration is keyed by its file, span and kind (`DeclKey`): the public node type carries no index, so a handle is
//   resolved to its node and keyed the same way a walked declaration is.
// - Symbol ids are near 2^48, so an alias walk keys its visited set by the exact id per position, never by arithmetic.
// - A mapped member's declaration is the `[K in …]` node that minted it, never the member's home, so the origin walk
//   passes over it; a branch whose member a library declares ends there, and the other branches walk on. A name whose
//   other branches run out of types after one stopped at a library is the library's.
// - A read the type walk loses is answered from what the receiver's declaration spells: its annotation (through
//   `typeof X` to X's own), what its initializer spells (an `as`, an awaited call's return), a call's argument for a
//   type parameter the return keys by, the holder's type argument for a generic container's parameter, the member a
//   destructured name stands for, and a spread source's member. `T["k"]` keys land on T's member k, `z.infer<typeof S>`
//   keys on the tuple `S = z.enum(T)` is built from. A member only a library declares is the library's.
// - A `typeof X` key is X's own literal; an interface's key set is its heritage clause's; a generic holder spelled as a
//   union with null binds through its reference arm; a member none of ours declares has the value its holder's
//   spelling gives it (`names.held` over `Readonly<Record<…, Names>>` keys by Names).
// - A Drizzle row member is placed on its column through the table the checker ties its row type to (../drizzle-rows.ts).
import type {
  CallExpression,
  ExpressionWithTypeArguments,
  IndexedAccessTypeNode,
  LiteralTypeNode,
  MappedTypeNode,
  MemberName,
  Node,
  ObjectLiteralExpression,
  TypeNode,
  TypeReferenceNode,
} from "@typescript/native/ast";
import {
  isArrowFunction,
  isAsExpression,
  isAwaitExpression,
  isBindingElement,
  isCallExpression,
  isComputedPropertyName,
  isExpressionWithTypeArguments,
  isFunctionDeclaration,
  isFunctionExpression,
  isFunctionTypeNode,
  isIdentifier,
  isIndexedAccessTypeNode,
  isInterfaceDeclaration,
  isIntersectionTypeNode,
  isLiteralTypeNode,
  isMappedTypeNode,
  isMethodDeclaration,
  isMethodSignatureDeclaration,
  isNonNullExpression,
  isNoSubstitutionTemplateLiteral,
  isNumericLiteral,
  isObjectLiteralExpression,
  isParameterDeclaration,
  isParenthesizedExpression,
  isParenthesizedTypeNode,
  isPrivateIdentifier,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isPropertyDeclaration,
  isPropertySignatureDeclaration,
  isQualifiedName,
  isSatisfiesExpression,
  isShorthandPropertyAssignment,
  isSourceFile,
  isSpreadAssignment,
  isStringLiteral,
  isTypeAliasDeclaration,
  isTypeLiteralNode,
  isTypeOperatorNode,
  isTypeQueryNode,
  isTypeReferenceNode,
  isUnionTypeNode,
  isVariableDeclaration,
  SyntaxKind,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Symbol as NativeSymbol, NodeHandle, Type } from "@typescript/native/sync";
import { all, ObjectFlags, SymbolFlags } from "@typescript/native/sync";
import type { RowTable } from "../drizzle-rows.ts";
import { rowTables, rowTablesOf } from "../drizzle-rows.ts";
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
  /** At a library end: the library's own declarations of the name, where each branch stopped. */
  readonly stops: readonly NodeHandle[];
}

/** A walk that found no home and met no library declaration. */
export const EXHAUSTED: OriginWalk = { decls: [], depth: -1, end: "exhausted", stops: [] };

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
  readonly type: Node;
  readonly key: boolean;
}

const NOTHING: Spelled = { queried: [], tuples: [] };

// What a value is spelled with: the type syntax to read, and the key sets a call's arguments answered directly.
interface ValueSpelling {
  readonly roots: readonly SpellingRoot[];
  readonly tuples: readonly SpelledTuple[];
}

const NO_VALUE_SPELLING: ValueSpelling = { roots: [], tuples: [] };

// Lib type names whose arguments are key sets, by the argument that is: `Record<K, V>`, `Pick<T, K>`, `Omit<T, K>`,
// `Exclude<K, X>`, `Extract<K, X>`; and the ones that pass a key set through whole. By name, as
// tooling/src/unwired/graph/union-slots.ts reads them, since lib declares each once.
const RECORD = "Record";
const KEY_ARGUMENT: ReadonlyMap<string, number> = new Map([
  [RECORD, 0],
  ["Pick", 1],
  ["Omit", 1],
  ["Exclude", 0],
  ["Extract", 0],
]);
// `Promise` and `Awaited` too: an awaited value's keys are its promise's argument's.
const KEY_TRANSPARENT: ReadonlySet<string> = new Set(["Readonly", "Partial", "Required", "NonNullable", "Promise", "Awaited"]);
// zod's inferred types, whose keys are the queried schema's: `z.infer<typeof S>` over `S = z.enum(T)` is T's. Taught by hand.
const ZOD_INFERS: ReadonlySet<string> = new Set(["infer", "output", "input"]);
/** The package whose declarations make a call a validator and a `satisfies` reference a schema twin. */
export const ZOD_PACKAGE = "zod";

// zod's enum door: `schema.enum.k` on `schema = z.enum(T)` reads T's member. Taught by hand.
const ZOD_ENUM_DOORS: ReadonlySet<string> = new Set(["enum", "Enum"]);
const ZOD_ENUM = "enum";

// `all` takes its requests as arguments; a walk over many names and types can ask more than a call's argument limit.
const CHUNK = 8192;

/** Every request generator's answer, in order, chunked under the batch's argument limit. */
export function* allOf<T>(gens: readonly APIRequestGenerator<T>[]): APIRequestGenerator<T[]> {
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
    isFunctionExpression(node) ||
    isFunctionTypeNode(node)
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
  /** The library declarations that ended a name's branches on this level. */
  readonly stops: Map<string, Set<NodeHandle>>;
  spelled: readonly Spelled[];
}

/** Add each value to the set a map keeps under `key`. */
export function addAll<K, T>(into: Map<K, Set<T>>, key: K, values: Iterable<T>): void {
  const set = into.get(key) ?? new Set<T>();
  for (const value of values) {
    set.add(value);
  }
  into.set(key, set);
}

// What one walk has settled so far, and the library declarations each name's branches stopped at.
interface WalkSoFar {
  readonly out: Map<string, OriginWalk>;
  readonly stopped: ReadonlyMap<string, ReadonlySet<NodeHandle>>;
}

// Settle each live name the level answered, and keep the rest walking. A type that names the property with a real
// declaration is that branch's origin; one outside the tree (a library's own member, such as a query builder's `where`)
// ends the branch, and the other branches walk on.
// A name with no branch left: the library's when a branch stopped at one, on this level or an earlier one (another name
// riding the same walk can keep it going after this name's branches ran out), else exhausted.
function spentWalk(depth: number, stoppedHere: boolean, stops: ReadonlySet<NodeHandle> | undefined): OriginWalk {
  const library = stoppedHere || (stops?.size ?? 0) > 0;
  return { decls: [], depth, end: library ? "library" : "exhausted", stops: library ? [...(stops ?? [])] : [] };
}

function settleNames(live: LiveNames, homes: LevelHomes, depth: number, walk: WalkSoFar): LiveNames {
  const { out, stopped } = walk;
  const next = new Map<string, ReadonlySet<number>>();
  for (const [name, on] of live) {
    const found = homes.found.get(name);
    if (found !== undefined && found.size > 0) {
      out.set(name, { decls: [...found], depth, end: "home", stops: [] });
      continue;
    }
    const stop = homes.ended.get(name);
    const kept = [...on].filter((id) => stop?.has(id) !== true);
    if (kept.length === 0) {
      out.set(name, spentWalk(depth, (stop?.size ?? 0) > 0, stopped.get(name)));
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

// The type names a type node spells in a key position.
function keyRefNames(node: TypeNode): ReadonlySet<string> {
  const sink: SpellingSink = { owner: null, inline: new Map(), queries: [], tuples: [], refs: [], evaluated: [] };
  spellKeys(node, true, sink);
  return new Set(sink.refs.flatMap((ref) => (isIdentifier(ref) ? [ref.text] : [])));
}

// The positions of a function's parameters whose annotation spells, in a key position, a type parameter of the
// function that its return spells keys with.
function boundParameters(fn: Node, returned: ReadonlySet<string>): readonly number[] {
  const own = new Set(typeParametersOf(fn).filter((name) => returned.has(name)));
  const parameters = isFunctionDeclaration(fn) || isArrowFunction(fn) || isFunctionExpression(fn) || isMethodDeclaration(fn) ? fn.parameters : [];
  return parameters.flatMap((parameter, at) => {
    const refs = parameter.type === undefined ? new Set<string>() : keyRefNames(parameter.type);
    return [...own].some((name) => refs.has(name)) ? [at] : [];
  });
}

function typeParametersOf(node: Node): readonly string[] {
  const list =
    isFunctionDeclaration(node) ||
    isArrowFunction(node) ||
    isFunctionExpression(node) ||
    isMethodDeclaration(node) ||
    isInterfaceDeclaration(node) ||
    isTypeAliasDeclaration(node)
      ? node.typeParameters
      : undefined;
  return (list ?? []).map((parameter) => parameter.name.text);
}

// The type parameters of the interface, or the type alias's type literal, a member is declared in.
function containerTypeParameters(member: Node): readonly string[] {
  // a module symbol's declaration is its source file, which has no parent
  if (isSourceFile(member)) {
    return [];
  }
  const { parent } = member;
  if (isInterfaceDeclaration(parent)) {
    return typeParametersOf(parent);
  }
  // a type alias's literal can sit inside an intersection or a union (`type T<K> = { … } & ( … )`)
  let at: Node = parent;
  while (isTypeLiteralNode(at) || isIntersectionTypeNode(at) || isUnionTypeNode(at) || isParenthesizedTypeNode(at)) {
    at = at.parent;
  }
  return isTypeAliasDeclaration(at) ? typeParametersOf(at) : [];
}

/** A literal key's text: an identifier, a string or numeric literal, or a computed key holding a string. */
export function keyText(name: Node | undefined): string | undefined {
  if (name === undefined) {
    return undefined;
  }
  if (isIdentifier(name) || isPrivateIdentifier(name) || isStringLiteral(name) || isNumericLiteral(name) || isNoSubstitutionTemplateLiteral(name)) {
    return name.text;
  }
  if (name.kind === SyntaxKind.TrueKeyword) {
    return "true";
  }
  return isComputedPropertyName(name) && (isStringLiteral(name.expression) || isNoSubstitutionTemplateLiteral(name.expression))
    ? name.expression.text
    : undefined;
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
  // Read before any walk, so the origin walk's generators read a settled table; NativeWorld.batch refuses a batch run
  // from inside a generator.
  readonly #rows: ReadonlyMap<RowTable, ReadonlyMap<string, readonly DeclKey[]>>;
  // False under `--ablate=spelling`: no alias's syntax is read for the keys it spells.
  readonly #spelling: boolean;

  constructor(world: NativeWorld, { spelling }: { readonly spelling: boolean } = { spelling: true }) {
    this.#world = world;
    this.#spelling = spelling;
    this.#rows = this.#rowTables();
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

  /** The column declarations by name of each Drizzle table the checker ties `type` to as its row; none for any other
   *  type. */
  *rowHomesOf(type: Type): APIRequestGenerator<readonly ReadonlyMap<string, readonly DeclKey[]>[]> {
    if (this.#rows.size === 0) {
      return [];
    }
    const tables = yield* rowTablesOf(this.#world, type);
    return tables.flatMap((table) => {
      const homes = this.#rows.get(table);
      return homes === undefined ? [] : [homes];
    });
  }

  #rowTables(): ReadonlyMap<RowTable, ReadonlyMap<string, readonly DeclKey[]>> {
    const tables = rowTables(this.#world);
    this.handleKeys(tables.flatMap(({ columns }) => [...columns.values()].flat().flatMap((symbol) => symbol.declarations)));
    return new Map(
      tables.map((table) => [
        table,
        new Map(
          [...table.columns].map(([name, symbols]) => [name, symbols.flatMap((symbol) => symbol.declarations.flatMap((handle) => this.#cachedKey(handle)))]),
        ),
      ]),
    );
  }

  /**
   * The types a type was built from, asked only where its kind has that relation: an alias's arguments, a reference's
   * target and arguments, a union or intersection's members, a mapped type's template and key constraint, an indexed
   * access's object, a conditional's branches, a `keyof T`'s T, a class or interface's bases, and its apparent type. `args` asks only the
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
    if (type.isIndexType()) {
      out.push(yield* type.getTarget.gen());
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
    if (!this.#spelling) {
      return NOTHING;
    }
    const { checker } = this.#world;
    const inline = new Map<string, Set<DeclKey>>();
    const queries: Node[] = [];
    const tuples: TypeNode[] = [];
    const evaluated: TypeNode[] = [];
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
        spellKeys(item.type, item.key, { owner: item.owner, inline, queries, tuples, refs, evaluated });
      }
      todo = refs.length > 0 ? yield* this.#aliasDeclarations(refs) : [];
    }
    const queried = queries.length > 0 ? yield* checker.getTypeAtLocation.gen(queries) : [];
    const found = [
      ...(yield* this.#tupleKeys(tuples)),
      ...(yield* this.#evaluatedKeys(evaluated)),
      ...[...inline].map(([key, owners]) => ({ keys: new Set([key]), homes: [...owners] })),
    ];
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
      if (declaration !== undefined && isInterfaceDeclaration(declaration)) {
        items.push(...(declaration.heritageClauses ?? []).flatMap((clause) => clause.types.map((type) => ({ owner, type, key: true }))));
        continue;
      }
      const annotation = declaration === undefined ? undefined : annotationOf(declaration);
      if (annotation !== undefined) {
        items.push({ owner, type: annotation, key: true });
      }
    }
    return items;
  }

  // The type alias and interface declarations of ours that the references name, imports followed.
  *#aliasDeclarations(refs: readonly Node[]): APIRequestGenerator<readonly NodeHandle[]> {
    const { checker } = this.#world;
    const symbols = yield* checker.getSymbolAtLocation.gen(refs);
    const targets = yield* allOf(
      symbols.map((symbol) => (symbol !== undefined && hasFlag(symbol.flags, SymbolFlags.Alias) ? checker.getAliasedSymbol.gen(symbol) : answer(symbol))),
    );
    return targets.flatMap((symbol) =>
      (symbol?.declarations ?? []).filter(
        (handle) => (handle.kind === SyntaxKind.TypeAliasDeclaration || handle.kind === SyntaxKind.InterfaceDeclaration) && this.ours(handle),
      ),
    );
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

  // Each key set a key-position node evaluates to, with the declarations that spell it: a member's for `T["k"]`, and for
  // `z.infer<typeof S>` the tuple `S = z.enum(T)` is built from.
  *#evaluatedKeys(nodes: readonly TypeNode[]): APIRequestGenerator<readonly SpelledTuple[]> {
    if (nodes.length === 0) {
      return [];
    }
    const types = yield* this.#world.checker.getTypeAtLocation.gen(nodes);
    const found: SpelledTuple[] = [];
    for (const [at, node] of nodes.entries()) {
      const type = types[at];
      const keys = type === undefined ? [] : ((yield* literalStrings(type)) ?? []);
      const homes = keys.length === 0 ? [] : yield* this.#evaluatedHomes(node);
      if (homes.length > 0) {
        found.push({ keys: new Set(keys), homes });
      }
    }
    return found;
  }

  *#evaluatedHomes(node: TypeNode): APIRequestGenerator<readonly DeclKey[]> {
    return isIndexedAccessTypeNode(node) ? yield* this.#memberHomes(node) : yield* this.#zodHomes(node);
  }

  // `T["k"]`: the declarations of T's member k.
  *#memberHomes(node: IndexedAccessTypeNode): APIRequestGenerator<readonly DeclKey[]> {
    const { checker } = this.#world;
    const index = unparenType(node.indexType);
    if (!(isLiteralTypeNode(index) && isStringLiteral(index.literal))) {
      return [];
    }
    const holder = yield* checker.getTypeAtLocation.gen(node.objectType);
    const member = yield* checker.getPropertyOfType.gen(holder, index.literal.text);
    return yield* this.#keysOf(member?.declarations ?? []);
  }

  // `z.infer<typeof S>` over `S = z.enum(T)`: T's declarations, or S's own for an inline array.
  *#zodHomes(node: TypeNode): APIRequestGenerator<readonly DeclKey[]> {
    const { checker } = this.#world;
    const [query] = isTypeReferenceNode(node) ? (node.typeArguments ?? []) : [];
    const schema = query !== undefined && isTypeQueryNode(query) ? yield* checker.getSymbolAtLocation.gen(query.exprName) : undefined;
    const homes: DeclKey[] = [];
    for (const { owner, declaration } of yield* this.#ownDeclarations(schema)) {
      for (const tuple of enumArgumentOf(declaration)) {
        const named = isIdentifier(tuple) ? yield* checker.getSymbolAtLocation.gen(tuple) : undefined;
        homes.push(...(named === undefined ? [owner] : yield* this.#keysOf(named.declarations)));
      }
    }
    return homes;
  }

  *#keysOf(handles: readonly NodeHandle[]): APIRequestGenerator<readonly DeclKey[]> {
    return (yield* allOf(handles.map((handle) => this.handleKey(handle)))).flatMap((key) => (key === null ? [] : [key]));
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
    // a branch can stop at a library on any level, so a name's stops gather over the whole walk
    const stopped = new Map<string, Set<NodeHandle>>();
    const seen = new Set<number>([start.id]);
    let level: readonly Type[] = [start];
    let live: LiveNames = new Map(names.map((name) => [name, new Set<number>([start.id])]));
    for (let depth = 0; level.length > 0 && live.size > 0; depth++) {
      const homes = yield* this.#levelHomes(level, live, depth > 0 || startCounts);
      for (const [name, handles] of homes.stops) {
        addAll(stopped, name, handles);
      }
      live = settleNames(live, homes, depth, { out, stopped });
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
    // a name whose other branches ran out of types after one stopped at a library's declaration is the library's
    return names.map((name) => {
      const stops = stopped.get(name);
      return out.get(name) ?? (stops === undefined || stops.size === 0 ? EXHAUSTED : { decls: [], depth: -1, end: "library", stops: [...stops] });
    });
  }

  // What one level of the walk answers for each live name: the declarations a type on the level names it with, the
  // table a row on the level is, and the tuple an alias on the level spells it in; and where each name's branch ended.
  *#levelHomes(level: readonly Type[], live: LiveNames, ownCount: boolean): APIRequestGenerator<LevelHomes> {
    const { checker } = this.#world;
    const asks = level.flatMap((type, at) => [...live].flatMap(([name, on]) => (on.has(type.id) ? [{ type, at, name }] : [])));
    const props = yield* allOf(asks.map((ask) => checker.getPropertyOfType.gen(ask.type, ask.name)));
    const homes: LevelHomes = { carries: level.map(() => new Set<string>()), found: new Map(), ended: new Map(), stops: new Map(), spelled: [] };
    for (const [x, ask] of asks.entries()) {
      const declared = (props[x]?.declarations ?? []).filter((declaration) => declaration.kind !== SyntaxKind.MappedType);
      if (props[x] !== undefined) {
        homes.carries[ask.at]?.add(ask.name);
      }
      if (declared.length > 0) {
        addAll(homes.ended, ask.name, [ask.type.id]);
        addAll(
          homes.stops,
          ask.name,
          declared.filter((handle) => !this.ours(handle)),
        );
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

  // A type carrying a name that the checker ties to a table as its row: the name is that table's column.
  *#rowHomes(level: readonly Type[], homes: LevelHomes): APIRequestGenerator<void> {
    const carriers = level.flatMap((type, at) => ((homes.carries[at]?.size ?? 0) > 0 ? [{ type, at }] : []));
    const tables = yield* allOf(carriers.map(({ type }) => this.rowHomesOf(type)));
    for (const [x, { at }] of carriers.entries()) {
      for (const table of tables[x] ?? []) {
        for (const name of homes.carries[at] ?? []) {
          addAll(homes.found, name, table.get(name) ?? []);
        }
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
      // a receiver that is itself a value expression (`(await rows()).k`) is answered by what it spells
      const owner = unwrapped === undefined ? null : this.keyOf(unwrapped);
      const spelled = owner === null ? NO_VALUE_SPELLING : yield* this.#valueSpelling(owner, unwrapped, new Set());
      return yield* this.#spelledHome(spelled.roots, name, spelled.tuples);
    }
    const symbol = yield* this.#unaliased(yield* checker.getSymbolAtLocation.gen(nameNode));
    const declarations = yield* this.#bindingSources(yield* this.#ownDeclarations(symbol));
    if (door !== undefined) {
      return yield* this.#enumHomes(
        declarations.flatMap(({ declaration }) => enumArgumentOf(declaration)),
        symbol,
        name,
      );
    }
    if (declarations.length === 0) {
      const undeclared = yield* this.#undeclaredHome(unwrapped, name, symbol?.declarations ?? []);
      if (undeclared.end !== "exhausted") {
        return undeclared;
      }
    }
    const spelled: ValueSpelling[] = [];
    for (const { owner, declaration } of declarations) {
      spelled.push(yield* this.#spellingRoot(owner, declaration, new Set()), yield* this.#holderBinding(declaration, unwrapped));
    }
    const home = yield* this.#spelledHome(
      spelled.flatMap(({ roots }) => roots),
      name,
      spelled.flatMap(({ tuples }) => tuples),
    );
    return home.end === "exhausted" ? yield* this.#spreadHome(declarations, name) : home;
  }

  // A receiver member no declaration of ours spells (`names.held` over a mapped holder) has the value its holder
  // spells; failing that, a member only a library declares spells its keys there, and the read is the library's.
  *#undeclaredHome(receiver: Node | undefined, name: string, declared: readonly NodeHandle[]): APIRequestGenerator<OriginWalk> {
    const held = receiver !== undefined && isPropertyAccessExpression(receiver) ? yield* this.#expressionSpelling(receiver, new Set()) : NO_VALUE_SPELLING;
    const home = held.roots.length === 0 ? EXHAUSTED : yield* this.#spelledHome(held.roots, name, held.tuples);
    if (home.end !== "exhausted" || declared.length === 0) {
      return home;
    }
    return { decls: [], depth: 0, end: "library", stops: declared };
  }

  // What an expression's value is spelled with: its declarations' spelling, or for a member none of ours declares the
  // value its holder's spelling gives that member.
  *#expressionSpelling(expression: Node | undefined, seen: Set<Node>): APIRequestGenerator<ValueSpelling> {
    const value = unwrapExpression(expression);
    if (value === undefined || seen.has(value)) {
      return NO_VALUE_SPELLING;
    }
    seen.add(value);
    const nameNode = receiverName(value);
    if (nameNode === undefined) {
      return yield* this.#valueSpelling(this.keyOf(value), value, new Set());
    }
    const symbol = yield* this.#unaliased(yield* this.#world.checker.getSymbolAtLocation.gen(nameNode));
    const declarations = yield* this.#bindingSources(yield* this.#ownDeclarations(symbol));
    if (declarations.length > 0) {
      const roots: SpellingRoot[] = [];
      const tuples: SpelledTuple[] = [];
      for (const { owner, declaration } of declarations) {
        for (const spelled of [yield* this.#spellingRoot(owner, declaration, new Set()), yield* this.#holderBinding(declaration, value)]) {
          roots.push(...spelled.roots);
          tuples.push(...spelled.tuples);
        }
      }
      return { roots, tuples };
    }
    if (!isPropertyAccessExpression(value)) {
      return NO_VALUE_SPELLING;
    }
    const holder = yield* this.#expressionSpelling(value.expression, seen);
    const member = value.name.text;
    return { roots: holder.roots.flatMap(({ owner, node }) => memberValues(node, member).map((type) => ({ owner, node: type }))), tuples: [] };
  }

  *#unaliased(symbol: NativeSymbol | undefined): APIRequestGenerator<NativeSymbol | undefined> {
    return symbol !== undefined && hasFlag(symbol.flags, SymbolFlags.Alias) ? yield* this.#world.checker.getAliasedSymbol.gen(symbol) : symbol;
  }

  // A symbol's declarations in the tree's own sources, each resolved with its key.
  *#ownDeclarations(symbol: NativeSymbol | undefined): APIRequestGenerator<readonly { readonly owner: DeclKey; readonly declaration: Node }[]> {
    const out: { readonly owner: DeclKey; readonly declaration: Node }[] = [];
    for (const handle of (symbol?.declarations ?? []).filter((declaration) => this.ours(declaration))) {
      const [declaration, owner] = yield* all(handle.resolve.gen(), this.handleKey(handle));
      if (declaration !== undefined && owner !== null) {
        out.push({ owner, declaration });
      }
    }
    return out;
  }

  // The type syntax a declaration spells its value with: its annotation, or what its initializer spells.
  *#spellingRoot(owner: DeclKey, declaration: Node, seen: Set<Node>): APIRequestGenerator<ValueSpelling> {
    const annotation = annotationOf(declaration);
    if (annotation === undefined) {
      return yield* this.#valueSpelling(owner, initializerOf(declaration), seen);
    }
    // `typeof X` spells what X's own declaration spells
    const queried = isTypeQueryNode(annotation) && !seen.has(annotation) ? yield* this.#world.checker.getSymbolAtLocation.gen(annotation.exprName) : undefined;
    seen.add(annotation);
    const roots: SpellingRoot[] = [{ owner, node: annotation }];
    const tuples: SpelledTuple[] = [];
    for (const target of yield* this.#ownDeclarations(queried)) {
      const spelled = yield* this.#spellingRoot(target.owner, target.declaration, seen);
      roots.push(...spelled.roots);
      tuples.push(...spelled.tuples);
    }
    return { roots, tuples };
  }

  // What an expression's value is spelled with: the `as` or `satisfies` it ends in, what an awaited value spells, or the
  // return annotation of our function it calls, with each key set that return takes from a type parameter answered by
  // the call's argument for it.
  *#valueSpelling(owner: DeclKey, expression: Node | undefined, seen: Set<Node>): APIRequestGenerator<ValueSpelling> {
    const value = unwrapExpression(expression);
    if (value === undefined || seen.has(value)) {
      return NO_VALUE_SPELLING;
    }
    seen.add(value);
    if (isAsExpression(value) || isSatisfiesExpression(value)) {
      return { roots: [{ owner, node: value.type }], tuples: [] };
    }
    if (isAwaitExpression(value)) {
      return yield* this.#valueSpelling(owner, value.expression, seen);
    }
    if (!isCallExpression(value)) {
      return NO_VALUE_SPELLING;
    }
    const target = (yield* this.#world.checker.getResolvedSignature.gen(value)).declaration;
    const fn = target !== undefined && this.ours(target) ? yield* target.resolve.gen() : undefined;
    const returned = fn === undefined ? undefined : annotationOf(fn);
    const fnOwner = target === undefined ? null : yield* this.handleKey(target);
    if (fn === undefined || returned === undefined || fnOwner === null) {
      return NO_VALUE_SPELLING;
    }
    const bound = yield* this.#argumentKeys(fn, returned, value, seen);
    return { roots: [{ owner: fnOwner, node: returned }, ...bound.roots], tuples: bound.tuples };
  }

  // A call's arguments for the type parameters its function's return spells keys with: an object literal argument's
  // properties are the homes of their keys; another argument spells what its own value spells.
  *#argumentKeys(fn: Node, returned: TypeNode, call: CallExpression, seen: Set<Node>): APIRequestGenerator<ValueSpelling> {
    const bound = boundParameters(fn, keyRefNames(returned));
    const roots: SpellingRoot[] = [];
    const tuples: SpelledTuple[] = [];
    for (const at of bound) {
      const spelled = yield* this.#argumentSpelling(unwrapExpression(call.arguments[at]), seen);
      roots.push(...spelled.roots);
      tuples.push(...spelled.tuples);
    }
    return { roots, tuples };
  }

  // One bound argument: an object literal's properties, or what a named value's declarations spell.
  *#argumentSpelling(argument: Node | undefined, seen: Set<Node>): APIRequestGenerator<ValueSpelling> {
    if (argument === undefined) {
      return NO_VALUE_SPELLING;
    }
    if (isObjectLiteralExpression(argument)) {
      return { roots: [], tuples: this.#literalKeys(argument) };
    }
    const symbol = isIdentifier(argument) ? yield* this.#world.checker.getSymbolAtLocation.gen(argument) : undefined;
    const roots: SpellingRoot[] = [];
    const tuples: SpelledTuple[] = [];
    for (const { owner, declaration } of yield* this.#ownDeclarations(symbol)) {
      const own = annotationOf(declaration);
      const initial = unassert(initializerOf(declaration));
      const spelled = own === undefined ? yield* this.#valueSpelling(owner, initial, seen) : { roots: [{ owner, node: own }], tuples: [] };
      roots.push(...spelled.roots);
      tuples.push(...spelled.tuples, ...(initial !== undefined && isObjectLiteralExpression(initial) ? this.#literalKeys(initial) : []));
    }
    return { roots, tuples };
  }

  // Each named property of an object literal as the home of its own key.
  #literalKeys(literal: ObjectLiteralExpression): readonly SpelledTuple[] {
    return literal.properties.flatMap((property) => {
      const name = isPropertyAssignment(property) || isShorthandPropertyAssignment(property) ? keyText(property.name) : undefined;
      const home = name === undefined ? null : this.keyOf(property);
      return name === undefined || home === null ? [] : [{ keys: new Set([name]), homes: [home] }];
    });
  }

  // A member of a generic interface or type alias that spells keys with the container's type parameter: the holder it
  // is read from names that parameter's argument where it spells its own type, and the argument spells the keys.
  *#holderBinding(declaration: Node, receiver: Node | undefined): APIRequestGenerator<ValueSpelling> {
    const annotation = annotationOf(declaration);
    const parameters = containerTypeParameters(declaration);
    if (annotation === undefined || parameters.length === 0 || receiver === undefined || !isPropertyAccessExpression(receiver)) {
      return NO_VALUE_SPELLING;
    }
    const refs = keyRefNames(annotation);
    const bound = parameters.flatMap((parameter, at) => (refs.has(parameter) ? [at] : []));
    if (bound.length === 0) {
      return NO_VALUE_SPELLING;
    }
    // the holder's own spelling names the arguments: its annotation, or the return its initializer's call spells
    const holderName = receiverName(unwrapExpression(receiver.expression));
    const holder = holderName === undefined ? undefined : yield* this.#world.checker.getSymbolAtLocation.gen(holderName);
    const roots: SpellingRoot[] = [];
    for (const { owner, declaration: held } of yield* this.#ownDeclarations(holder)) {
      for (const root of (yield* this.#spellingRoot(owner, held, new Set())).roots) {
        for (const reference of referenceArms(root.node)) {
          const args = reference.typeArguments ?? [];
          roots.push(...bound.flatMap((at) => (args[at] === undefined ? [] : [{ owner: root.owner, node: args[at] }])));
        }
      }
    }
    return { roots, tuples: [] };
  }

  // The declarations a destructured name stands for: the member of the value it is destructured from.
  *#bindingSources(
    declarations: readonly { readonly owner: DeclKey; readonly declaration: Node }[],
  ): APIRequestGenerator<readonly { readonly owner: DeclKey; readonly declaration: Node }[]> {
    const out: { readonly owner: DeclKey; readonly declaration: Node }[] = [];
    for (const entry of declarations) {
      const { declaration } = entry;
      const member = isBindingElement(declaration) ? keyText(declaration.propertyName ?? declaration.name) : undefined;
      if (member === undefined || !isBindingElement(declaration)) {
        out.push(entry);
        continue;
      }
      const { checker } = this.#world;
      const source = yield* checker.getTypeAtLocation.gen(declaration.parent);
      out.push(...(yield* this.#ownDeclarations(yield* checker.getPropertyOfType.gen(source, member))));
    }
    return out;
  }

  // A name a declaration's object literal takes from a spread: the spread value's member is its home, or a library's.
  *#spreadHome(declarations: readonly { readonly declaration: Node }[], name: string): APIRequestGenerator<OriginWalk> {
    const { checker } = this.#world;
    for (const { declaration } of declarations) {
      const literal = unassert(initializerOf(declaration));
      const spreads = literal !== undefined && isObjectLiteralExpression(literal) ? literal.properties.filter((property) => isSpreadAssignment(property)) : [];
      for (const spread of spreads) {
        const member = yield* checker.getPropertyOfType.gen(yield* checker.getTypeAtLocation.gen(spread.expression), name);
        const declared = yield* this.#declaredWalk(member?.declarations ?? []);
        // a spread value whose own member has no declaration is answered the way a read of it would be
        const walk = declared.end === "exhausted" ? yield* this.annotationOrigin(spread.expression, name) : declared;
        if (walk.end !== "exhausted") {
          return walk;
        }
      }
    }
    return EXHAUSTED;
  }

  // A member's own declarations as a walk's end: a home where the tree declares it, a library's stop where only a
  // library does.
  *#declaredWalk(handles: readonly NodeHandle[]): APIRequestGenerator<OriginWalk> {
    const homes = yield* this.#keysOf(handles);
    if (homes.length > 0) {
      return { decls: [...new Set(homes)], depth: 0, end: "home", stops: [] };
    }
    return handles.length > 0 ? { decls: [], depth: 0, end: "library", stops: handles } : EXHAUSTED;
  }

  // The home a name has in what the roots spell: a tuple that yields it, else the origin of a type they query.
  *#spelledHome(roots: readonly SpellingRoot[], name: string, bound: readonly SpelledTuple[] = []): APIRequestGenerator<OriginWalk> {
    if (roots.length === 0 && bound.length === 0) {
      return EXHAUSTED;
    }
    const spelled = yield* this.readSpelling([], roots);
    const homes = [...spelled.tuples, ...bound].filter((tuple) => tuple.keys.has(name)).flatMap((tuple) => tuple.homes);
    if (homes.length > 0) {
      return { decls: [...new Set(homes)], depth: 0, end: "home", stops: [] };
    }
    for (const queried of spelled.queried) {
      const [walk] = yield* this.originsOf(queried, [name], true);
      if (walk !== undefined && walk.decls.length > 0) {
        return { decls: walk.decls, depth: walk.depth + 1, end: "home", stops: [] };
      }
    }
    return EXHAUSTED;
  }

  // The homes of `z.enum(T)`'s keys: a named tuple's declarations, or the schema's own for an inline array literal. Only
  // a tuple that holds the name read answers: `schema.enum.x` for an x the tuple lacks is no key of it.
  *#enumHomes(tuples: readonly Node[], schema: NativeSymbol | undefined, name: string): APIRequestGenerator<OriginWalk> {
    const { checker } = this.#world;
    const homes: DeclKey[] = [];
    const [symbols, types] = yield* all(checker.getSymbolAtLocation.gen(tuples), checker.getTypeAtLocation.gen(tuples));
    for (const [at, tuple] of tuples.entries()) {
      const type = types[at];
      const members = type?.isTypeReference() === true ? yield* checker.getTypeArguments.gen(type) : [];
      if (!members.some((member) => member.isStringLiteralType() && member.value === name)) {
        continue;
      }
      const declarations = isIdentifier(tuple) ? (symbols[at]?.declarations ?? []) : (schema?.declarations ?? []);
      for (const handle of declarations) {
        const home = yield* this.handleKey(handle);
        if (home !== null) {
          homes.push(home);
        }
      }
    }
    return homes.length > 0 ? { decls: [...new Set(homes)], depth: 0, end: "home", stops: [] } : EXHAUSTED;
  }

  /**
   * Why a read has no home by design, or null when it is a real loss: `narrowed` is the `Record<"k", unknown>` a
   * `"k" in x` check intersects in (the key was never declared anywhere), `synthetic` a member the checker makes for a
   * tuple (`length`) or a class (`prototype`).
   */
  *unbackedReason(type: Type, name: string, symbol: NativeSymbol): APIRequestGenerator<"narrowed" | "synthetic" | null> {
    // a class's `prototype` is a member the checker makes for every class
    if (hasFlag(symbol.flags, SymbolFlags.Prototype)) {
      return "synthetic";
    }
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

const TUPLE_LENGTH = "length";

// A type's string-literal members, or null when it holds none.
function* literalStrings(type: Type): APIRequestGenerator<readonly string[] | null> {
  const members = (yield* constituentsOf(type)).flatMap((member) => (member.isStringLiteralType() ? [member.value] : []));
  return members.length > 0 ? members : null;
}

/** A union's member types, or the type itself. */
export function* constituentsOf(type: Type): APIRequestGenerator<readonly Type[]> {
  return type.isUnionType() ? yield* type.getTypes.gen() : [type];
}

// A type that composes other types: its members are its parts', so a walk always expands it.
const composes = (type: Type): boolean =>
  type.isUnionType() || type.isIntersectionType() || type.isIndexType() || type.isIndexedAccessType() || type.isConditionalType() || type.isMappedType();

interface SpellingSink {
  /** The declaration an inline literal key lands on; null where only the key positions' type names are wanted. */
  readonly owner: DeclKey | null;
  readonly inline: Map<string, Set<DeclKey>>;
  readonly queries: Node[];
  readonly tuples: TypeNode[];
  readonly refs: Node[];
  /** Key-position nodes the checker evaluates to a literal set: `T["k"]`, `z.infer<typeof S>`. */
  readonly evaluated: TypeNode[];
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
  if (key && isIndexedAccessTypeNode(node)) {
    spellIndexed(node, sink);
    return;
  }
  if (isTypeQueryNode(node)) {
    if (key) {
      // `typeof X` keys by X's value: a literal const is the home of its key, any other value is queried
      sink.queries.push(node);
      sink.tuples.push(node);
    }
    return;
  }
  if (isLiteralTypeNode(node)) {
    spellLiteral(node, key, sink);
    return;
  }
  if (isTypeReferenceNode(node)) {
    spellReference(node, key, sink);
    return;
  }
  if (isExpressionWithTypeArguments(node)) {
    spellHeritage(node, sink);
    return;
  }
  node.forEachChild((child) => spellKeys(child, false, sink));
}

// An index chain rooted at a value query (`(typeof T)[number]`) yields T's literals.
function spellIndexed(node: IndexedAccessTypeNode, sink: SpellingSink): void {
  if (chainRoot(node) !== undefined) {
    sink.tuples.push(node);
    return;
  }
  // `T["k"]` is evaluated for k's member; its parts still spell what they spell (`{ [K in Keys]: … }[Keys]`)
  sink.evaluated.push(node);
  node.forEachChild((child) => spellKeys(child, false, sink));
}

function spellLiteral(node: LiteralTypeNode, key: boolean, sink: SpellingSink): void {
  if (key && isStringLiteral(node.literal) && sink.owner !== null) {
    addAll(sink.inline, node.literal.text, [sink.owner]);
  }
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

// The type syntax a spelled type gives one member's value: a type literal's property, a record's value argument, through
// unions, intersections and the key-transparent wrappers. A named alias is not followed here: its own spelling is read
// where it is a root.
function memberValues(node: TypeNode, member: string): readonly TypeNode[] {
  if (isUnionTypeNode(node) || isIntersectionTypeNode(node)) {
    return node.types.flatMap((arm) => memberValues(arm, member));
  }
  if (isParenthesizedTypeNode(node)) {
    return memberValues(node.type, member);
  }
  if (isTypeLiteralNode(node)) {
    return node.members.flatMap((signature) => (isPropertySignatureDeclaration(signature) && keyText(signature.name) === member ? [signature.type] : []));
  }
  if (!isTypeReferenceNode(node)) {
    return [];
  }
  const name = isQualifiedName(node.typeName) ? node.typeName.right.text : node.typeName.text;
  const [first, second] = node.typeArguments ?? [];
  if (KEY_TRANSPARENT.has(name) && first !== undefined) {
    return memberValues(first, member);
  }
  return name === RECORD && second !== undefined ? [second] : [];
}

// The references a type names through its union arms: `Tones<H> | null` names `Tones<H>`.
function referenceArms(node: Node): readonly TypeReferenceNode[] {
  if (isUnionTypeNode(node) || isParenthesizedTypeNode(node)) {
    const arms: TypeReferenceNode[] = [];
    node.forEachChild((child) => {
      arms.push(...referenceArms(child));
    });
    return arms;
  }
  return isTypeReferenceNode(node) ? [node] : [];
}

function spellReference(node: TypeReferenceNode, key: boolean, sink: SpellingSink): void {
  const id = isQualifiedName(node.typeName) ? node.typeName.right : node.typeName;
  const args = node.typeArguments ?? [];
  const [first] = args;
  if (key && ZOD_INFERS.has(id.text) && first !== undefined && isTypeQueryNode(first)) {
    sink.evaluated.push(node);
    return;
  }
  spellNamed(id, args, key, sink);
}

// An interface's heritage clause spells its keys the way a reference does: `extends Readonly<Record<K, V>>` keys by K.
function spellHeritage(node: ExpressionWithTypeArguments, sink: SpellingSink): void {
  const { expression } = node;
  const id = isPropertyAccessExpression(expression) ? expression.name : expression;
  if (isIdentifier(id)) {
    spellNamed(id, node.typeArguments ?? [], true, sink);
  }
}

function spellNamed(id: MemberName, args: readonly TypeNode[], key: boolean, sink: SpellingSink): void {
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
