// `pnpm unwired removed-keys` as a query over the graph session: a deletion branch's removed contract keys that a sender
// outside the server still writes. `z.object` strips an unknown key silently and an `as const` writer passes the compiler,
// so the check reads every sender the key resolver places on the session's one merged program.
//
// - A sender is a write the resolver (../key-resolver.ts) places on the shape the key was removed from, or a key of a loose
//   object (`Record<string, unknown>`) that flows into one of our tRPC procedures or our own HTTP routes. A key on another
//   declared member is someone else's field; a key the resolver cannot place is listed, never failed on.
// - The senders are the receivers in {@link RECEIVER_PATHS}, where a stripped key fails silently: the client, the plugins
//   and the e2e suites alike. It is no product population, so the product and credit split of D357 has nothing to judge.
// - The removed keys come from the merge base's and head's blobs, each parsed on its own by the native parser. The merged
//   program loads the working tree, so `head` must be the checked-out commit, the tracked files clean, and no untracked
//   file among those the program loads. An untracked file no world includes (a tool's cache directory) changes no verdict.
// - A declaration moved whole out of its contract file to a same-named one elsewhere keeps the keys it still declares.
// - A computed key (`[VLLM_PROVIDER_ID]: …`) counts as the string its constant holds, when the file or a file it imports
//   relatively declares that constant; a key spelled by any other expression is not counted.
// - A branch that removes no key builds no session.

import { posix } from "node:path";
import type {
  CallExpression,
  Expression,
  Identifier,
  ImportDeclaration,
  InterfaceDeclaration,
  NewExpression,
  Node,
  PropertyAccessExpression,
  PropertyAssignment,
  PropertySignatureDeclaration,
  ShorthandPropertyAssignment,
  SourceFile,
  TypeAliasDeclaration,
  VariableDeclaration,
} from "@typescript/native/ast";
import {
  isArrayLiteralExpression,
  isAsExpression,
  isCallExpression,
  isComputedPropertyName,
  isConditionalExpression,
  isElementAccessExpression,
  isIdentifier,
  isImportDeclaration,
  isInterfaceDeclaration,
  isNamedImports,
  isNewExpression,
  isNonNullExpression,
  isNoSubstitutionTemplateLiteral,
  isObjectLiteralExpression,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isPropertySignatureDeclaration,
  isSatisfiesExpression,
  isShorthandPropertyAssignment,
  isSourceFile,
  isSpreadAssignment,
  isStringLiteral,
  isTypeAliasDeclaration,
  isVariableDeclaration,
} from "@typescript/native/ast";
import type { APIRequestGenerator, NodeHandle, Type } from "@typescript/native/sync";
import { all } from "@typescript/native/sync";
import { catBlobs, execGit } from "../../floor/git/git.ts";
import { editorLineOf } from "../../floor/typescript/editor-lines.ts";
import type { KeyResolution } from "../key-resolver.ts";
import { resolveKeys } from "../key-resolver.ts";
import { gitGrep } from "../literal-hits.ts";
import type { PropertyName } from "../native.ts";
import { callsPlatform, constituents, declarationKeys, isPropertyName, NativeWorld } from "../native.ts";
import type { Library, LibraryNames } from "./library-names.ts";
import { libraryNames, MUTATE_CALLS, MUTATION_OPTIONS, QUERY_CORE, REACT_QUERY, TRPC_CLIENT, TRPC_QUERY, TRPC_SENDS } from "./library-names.ts";
import { callerPath, patternText, platformCall } from "./urls.ts";

/** Where a removed key is declared: the contracts and the server's transport. */
const CONTRACT_PATHS = ["packages/contracts/src", "packages/server/src/transport"] as const;

const RECEIVERS = ["client", "plugins", "e2e"] as const;
/** The senders a stripped key fails silently in. */
type Receiver = (typeof RECEIVERS)[number];

const RECEIVER_PATHS: Readonly<Record<Receiver, readonly string[]>> = {
  client: ["packages/client"],
  plugins: ["packages/showcase-plugins", "packages/plugin-sdk", "packages/plugin-toolchain"],
  e2e: ["tests/e2e"],
};

const COMMENT_LINE = /^\s*(?:\/\/|\/?\*)/u;
const PARSED = /\.[cm]?tsx?$/u;
// Every contract file of a wide deletion fits one batch read.
const BLOB_BUFFER = 268_435_456;

// The tRPC client's and its TanStack options proxy's verbs that take a procedure's input, as the tRPC packages declare
// them; `mutationOptions()` takes none, and the input reaches the procedure through the TanStack mutation's `mutate`.
// The tRPC client's proxy and its TanStack options proxy declare the sending verbs; TanStack Query declares the hook's
// mutate.
const TRPC_PROXIES: readonly Library[] = [TRPC_CLIENT, TRPC_QUERY];
const QUERY_HOOKS: readonly Library[] = [QUERY_CORE, REACT_QUERY];
// The platform's serializer, whose string carries every key of its value.
const JSON_INTERFACE = "JSON";
const STRINGIFY = "stringify";
/** The reason a receiver file the merged program does not load is listed unresolved with. */
export const OUTSIDE_PROGRAM = "outside the merged program";
/** The reason a string with the key's text that sits in no key slot (a plain value) is listed unresolved with. */
export const NO_KEY_POSITION = "no key position";
/** The reason an open slot whose value reaches none of our procedures or routes is listed unresolved with: an outside
 *  API's body, or a value never sent. */
export const NO_DESTINATION = "open slot reaching none of our procedures or routes";

/** One site in a receiver: the receiver, `file:line` and the line's text. */
interface Hit {
  readonly receiver: Receiver;
  readonly at: string;
  readonly text: string;
}

/** One key the branch removes, the shapes it was removed from, and what the resolver made of every site naming it. */
interface RemovedKey {
  readonly key: string;
  /** The declarations that dropped it, `file:Home`. */
  readonly homes: readonly string[];
  /** Writes the resolver places on a shape that dropped the key. */
  readonly senders: readonly Hit[];
  /** Keys of a loose object that flows into one of our procedures or routes, with that destination. */
  readonly loose: readonly (Hit & { readonly destination: string })[];
  /** Sites the resolver could not place, or an open slot bound outside the repo, with the reason. */
  readonly unresolved: readonly (Hit & { readonly reason: string })[];
  /** Sites the resolver places on another declared member: a same-named field of another shape. */
  readonly other: number;
}

/** What the check found between `base` and `head`. */
export interface RemovedKeysReport {
  readonly base: string;
  readonly head: string;
  /** Files searched in each receiver at `head`. */
  readonly scanned: Readonly<Record<Receiver, number>>;
  readonly removed: readonly RemovedKey[];
  /** True when a removed key has a sender or a loose sender. */
  readonly failed: boolean;
  readonly limits: readonly string[];
}

/** The repository and the revisions to compare: `head` against its merge base with `base`. */
export interface RemovedKeysOptions {
  readonly root: string;
  readonly base: string;
  readonly head: string;
}

/** What the check cannot see, printed with every run. */
const REMOVED_KEY_LIMITS: readonly string[] = [
  "A key is removed only from a declaration under packages/contracts/src or packages/server/src/transport: an interface or type member, a schema or literal key, a shorthand. A key a branch drops elsewhere is not checked.",
  "A receiver file the merged program does not load (a JSON fixture, a script outside every world) is searched as text, and each line that names a removed key is listed unresolved; it never passes silently.",
  "A key site the key resolver cannot place is listed unresolved with its reason and never fails the branch.",
  "An open object's key fails the branch only where the value reaches one of our tRPC procedures or a platform request whose URL folds to a path on our own origin; a body sent elsewhere, or a URL whose start does not fold, is listed unresolved.",
];

// The declaration a key sits in, by its name: an interface, a type alias or a schema's variable.
function homeOf(node: Node): string | null {
  for (let at = node.parent; !isSourceFile(at); at = at.parent) {
    if ((isInterfaceDeclaration(at) || isTypeAliasDeclaration(at) || isVariableDeclaration(at)) && isIdentifier(at.name)) {
      return at.name.text;
    }
  }
  return null;
}

/** How many times a file declares each key, by home name then key. */
type KeyCounts = ReadonlyMap<string, ReadonlyMap<string, number>>;

/** One file's parse before its computed keys are spelled: the plain keys counted by home, each computed key's home and
 *  the identifier that names it, the file's string constants, and each relatively imported name with the files it may
 *  come from. */
interface FileKeys {
  readonly counts: Map<string, Map<string, number>>;
  readonly computed: { readonly home: string; readonly name: string }[];
  readonly constants: Map<string, string>;
  readonly imports: Map<string, { readonly from: readonly string[]; readonly name: string }>;
}

const addKey = (into: Map<string, Map<string, number>>, home: string, key: string): void => {
  const keys = into.get(home) ?? new Map<string, number>();
  keys.set(key, (keys.get(key) ?? 0) + 1);
  into.set(home, keys);
};

// The string a constant's initializer spells, through `as const` and parentheses.
function stringOf(value: Node | undefined): string | null {
  let at = value;
  while (at !== undefined && (isAsExpression(at) || isSatisfiesExpression(at) || isParenthesizedExpression(at))) {
    at = at.expression;
  }
  return at !== undefined && (isStringLiteral(at) || isNoSubstitutionTemplateLiteral(at)) ? at.text : null;
}

// The files a relative specifier may name: the spelled file, or the module and index files a bare one resolves to.
function specifierFiles(file: string, specifier: string): readonly string[] {
  const target = posix.join(posix.dirname(file), specifier);
  return PARSED.test(target) ? [target] : [`${target}.ts`, `${target}.tsx`, `${target}/index.ts`];
}

// How many times a file declares each key in each home: an interface or type member, a schema or literal key, a
// shorthand. The parser sees a key wherever it sits, a one-line `z.object({ a: … })` included. Every home the file
// declares has an entry, one with no key included, so a home that left the file is told from one that lost its keys.
// A computed key named by an identifier is held until the constant it names is read.
function fileKeys(root: string, source: SourceFile): FileKeys {
  const found: FileKeys = { counts: new Map(), computed: [], constants: new Map(), imports: new Map() };
  const visit = (node: Node): void => {
    if (isInterfaceDeclaration(node) || isTypeAliasDeclaration(node) || isVariableDeclaration(node)) {
      readDeclaration(node, found);
    } else if (isImportDeclaration(node)) {
      readImport(posix.relative(root, source.fileName), node, found.imports);
    } else if (isPropertySignatureDeclaration(node) || isPropertyAssignment(node) || isShorthandPropertyAssignment(node)) {
      readKey(node, found);
    }
    node.forEachChild(visit);
  };
  source.forEachChild(visit);
  return found;
}

// A home's entry, and a string constant's text.
function readDeclaration(node: InterfaceDeclaration | TypeAliasDeclaration | VariableDeclaration, into: FileKeys): void {
  if (!isIdentifier(node.name)) {
    return;
  }
  if (!into.counts.has(node.name.text)) {
    into.counts.set(node.name.text, new Map());
  }
  const text = isVariableDeclaration(node) ? stringOf(node.initializer) : null;
  if (text !== null) {
    into.constants.set(node.name.text, text);
  }
}

// Each name a relative import binds, with the files it may come from.
function readImport(file: string, node: ImportDeclaration, into: FileKeys["imports"]): void {
  const bindings = node.importClause?.namedBindings;
  if (!(isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text.startsWith(".") && bindings !== undefined && isNamedImports(bindings))) {
    return;
  }
  const from = specifierFiles(file, node.moduleSpecifier.text);
  for (const element of bindings.elements) {
    into.set(element.name.text, { from, name: (element.propertyName ?? element.name).text });
  }
}

// A key counted in its home, or a computed key held under the identifier that names it.
function readKey(node: PropertySignatureDeclaration | PropertyAssignment | ShorthandPropertyAssignment, into: FileKeys): void {
  const home = homeOf(node);
  const { name } = node;
  if (home === null) {
    return;
  }
  if (isIdentifier(name) || isStringLiteral(name)) {
    addKey(into.counts, home, name.text);
  } else if (isComputedPropertyName(name) && isIdentifier(name.expression)) {
    into.computed.push({ home, name: name.expression.text });
  }
}

// Each file's key counts at `rev`, a computed key spelled by the constant it names in its own file or in a file it
// imports relatively. A key named by any other expression is not counted.
function countsOf(root: string, rev: string, texts: ReadonlyMap<string, string>): ReadonlyMap<string, KeyCounts> {
  const parsed = NativeWorld.readTexts(root, texts, (source) => fileKeys(root, source));
  const wanted = [...parsed.values()].flatMap(({ computed, constants, imports }) =>
    computed.flatMap(({ name }) => (constants.has(name) ? [] : (imports.get(name)?.from ?? []).filter((file) => !parsed.has(file)))),
  );
  const imported =
    wanted.length === 0
      ? new Map<string, FileKeys>()
      : NativeWorld.readTexts(root, blobsAt(root, rev, [...new Set(wanted)]), (source) => fileKeys(root, source));
  const constantIn = (file: string, name: string): string | undefined => (parsed.get(file) ?? imported.get(file))?.constants.get(name);
  return new Map(
    [...parsed].map(([file, { counts, computed, constants, imports }]) => {
      for (const { home, name } of computed) {
        const via = imports.get(name);
        const key = constants.get(name) ?? via?.from.map((from) => constantIn(from, via.name)).find((found) => found !== undefined);
        if (key !== undefined) {
          addKey(counts, home, key);
        }
      }
      return [file, counts] as const;
    }),
  );
}

// Each file's text at `rev`, one batch read. A file the rev lacks (added or deleted on the branch) declares nothing, and
// is left out of the request because `cat-file` answers it with an unmarked `missing` line.
function blobsAt(root: string, rev: string, files: readonly string[]): ReadonlyMap<string, string> {
  if (files.length === 0) {
    return new Map();
  }
  const present = execGit(root, ["ls-tree", "-r", "--name-only", rev, "--", ...files])
    .split("\n")
    .filter(Boolean);
  const blobs = catBlobs(
    root,
    present.map((file) => `${rev}:${file}`),
    { chunk: present.length, maxBuffer: BLOB_BUFFER },
  );
  return new Map([...blobs].map(([at, text]) => [present[at] ?? "", text]));
}

function keyCounts(root: string, rev: string, files: readonly string[]): ReadonlyMap<string, KeyCounts> {
  return countsOf(root, rev, blobsAt(root, rev, files));
}

/** A removed key's home at `head`: the file and the declaration name that dropped it. */
interface Home {
  readonly file: string;
  readonly name: string;
}

const changedFiles = (root: string, base: string, head: string, paths: readonly string[]): readonly string[] =>
  execGit(root, ["diff", "--name-only", "--no-renames", `${base}...${head}`, "--", ...paths])
    .split("\n")
    .filter((file) => PARSED.test(file));

// The declarations the branch moved whole: a home that left its contract file and that another changed file declares
// at `head` under the same name, by name to that file's key counts. A key the moved home still declares is no removal,
// since a sender typed against it now imports the new home.
function movedHomes(root: string, head: string, gone: ReadonlySet<string>, others: readonly string[]): ReadonlyMap<string, readonly KeyCounts[]> {
  const blobs = [...blobsAt(root, head, others)].filter(([, text]) => [...gone].some((name) => text.includes(name)));
  const moved = new Map<string, KeyCounts[]>();
  for (const counts of countsOf(root, head, new Map(blobs)).values()) {
    for (const name of gone) {
      if (counts.has(name)) {
        moved.set(name, [...(moved.get(name) ?? []), counts]);
      }
    }
  }
  return moved;
}

// The keys some changed contract declaration names fewer times at `head` than at the merge base, by declaration: a key
// reformatted or moved inside one declaration is still there, and a key moved to another declaration is removed from
// its old home, since a sender of the old home's procedure now sends a stripped key. A home moved whole to another
// file keeps the keys it still declares there.
function removedKeys(root: string, base: string, head: string): ReadonlyMap<string, readonly Home[]> {
  const files = changedFiles(root, base, head, CONTRACT_PATHS);
  const fork = execGit(root, ["merge-base", base, head]).trim();
  const before = keyCounts(root, fork, files);
  const after = keyCounts(root, head, files);
  const gone = new Set([...before].flatMap(([file, homes]) => [...homes.keys()].filter((name) => !(after.get(file)?.has(name) ?? false))));
  const contracts = new Set(files);
  const moved =
    gone.size === 0
      ? new Map<string, readonly KeyCounts[]>()
      : movedHomes(
          root,
          head,
          gone,
          changedFiles(root, base, head, []).filter((file) => !contracts.has(file)),
        );
  const movedKeeps = (name: string, key: string, count: number): boolean =>
    (moved.get(name) ?? []).some((counts) => (counts.get(name)?.get(key) ?? 0) >= count);
  const removed = new Map<string, Home[]>();
  for (const [file, homes] of before) {
    for (const [name, keys] of homes) {
      for (const [key, count] of keys) {
        if ((after.get(file)?.get(name)?.get(key) ?? 0) < count && !movedKeeps(name, key, count)) {
          removed.set(key, [...(removed.get(key) ?? []), { file, name }]);
        }
      }
    }
  }
  return new Map([...removed].sort(([a], [b]) => a.localeCompare(b)));
}

const receiverOf = (file: string): Receiver | null =>
  RECEIVERS.find((receiver) => RECEIVER_PATHS[receiver].some((path) => file === path || file.startsWith(`${path}/`))) ?? null;

// The span of each removed home's declaration at `head` in a world's parse.
function homeSpans(world: NativeWorld, homes: readonly Home[]): readonly { readonly file: string; readonly pos: number; readonly end: number }[] {
  return homes.flatMap(({ file, name }) => {
    const source = world.source(file);
    const spans: { readonly file: string; readonly pos: number; readonly end: number }[] = [];
    const visit = (node: Node): void => {
      const named =
        (isInterfaceDeclaration(node) || isTypeAliasDeclaration(node) || isVariableDeclaration(node)) && isIdentifier(node.name) && node.name.text === name;
      if (named) {
        spans.push({ file, pos: node.pos, end: node.end });
      }
      node.forEachChild(visit);
    };
    source?.forEachChild(visit);
    return spans;
  });
}

// Whether any of the handles is declared inside one of the spans.
function* declaredIn(world: NativeWorld, handles: readonly NodeHandle[], spans: ReturnType<typeof homeSpans>): APIRequestGenerator<boolean> {
  const inTree = handles.flatMap((handle) => {
    const file = world.fileOf(handle);
    return file === null ? [] : [{ handle, file }];
  });
  const nodes = yield* all(
    ...inTree.map(function* ({ handle, file }): APIRequestGenerator<{ readonly file: string; readonly node: Node | undefined }> {
      return { file, node: yield* handle.resolve.gen() };
    }),
  );
  return nodes.some(({ file, node }) => node !== undefined && spans.some((span) => span.file === file && node.pos >= span.pos && node.end <= span.end));
}

// Whether a holder type is the shape the key was removed from: the type itself, or any of its members, is declared in
// the home. A zod schema's inferred type has no declaration of its own; its members are the schema's keys.
function* holdsHome(world: NativeWorld, holder: Type, spans: ReturnType<typeof homeSpans>): APIRequestGenerator<boolean> {
  const handles: NodeHandle[] = [];
  for (const member of yield* constituents(holder)) {
    const [symbol, alias, properties] = yield* all(member.getSymbol.gen(), member.getAliasSymbol.gen(), world.checker.getPropertiesOfType.gen(member));
    handles.push(...(symbol?.declarations ?? []), ...(alias?.declarations ?? []), ...properties.flatMap((property) => property.declarations));
  }
  return yield* declaredIn(world, handles, spans);
}

/** What one site comes to. */
type Verdict =
  | { readonly kind: "sender" }
  | { readonly kind: "other" }
  | { readonly kind: "loose"; readonly destination: string }
  | { readonly kind: "unresolved"; readonly reason: string };

// --- Loose objects ------------------------------------------------------------------------------------------------

// Through parentheses and assertions to the expression a value is.
function outerOf(node: Node): Node {
  let at = node;
  while (isParenthesizedExpression(at.parent) || isAsExpression(at.parent) || isSatisfiesExpression(at.parent) || isNonNullExpression(at.parent)) {
    at = at.parent;
  }
  return at;
}

/** Where a loose value's climb ends: the call or construction it is an argument of, and that argument. */
interface CallEnd {
  readonly call: CallExpression | NewExpression;
  readonly argument: Node;
}

// The call a value is handed to, climbing through literals that carry it: a property value, a shorthand, a spread, an
// array element, a conditional branch and the platform's JSON serialization. Null for any other end.
function* callEndOf(world: NativeWorld, value: Node): APIRequestGenerator<CallEnd | null> {
  let at = outerOf(value);
  for (;;) {
    const { parent } = at;
    if (isPropertyAssignment(parent) || isShorthandPropertyAssignment(parent) || isSpreadAssignment(parent)) {
      at = outerOf(parent.parent);
    } else if (isObjectLiteralExpression(parent) || isArrayLiteralExpression(parent) || isConditionalExpression(parent)) {
      at = outerOf(parent);
    } else if (isCallExpression(parent) && (yield* callsPlatform(world, parent.expression, JSON_INTERFACE, STRINGIFY))) {
      at = outerOf(parent);
    } else {
      return isCallExpression(parent) || isNewExpression(parent) ? { call: parent, argument: at } : null;
    }
  }
}

// The property names from a tRPC proxy's root to the procedure: `trpc.chat.send.mutate` names `chat.send`.
function procedureOf(callee: PropertyAccessExpression): string | null {
  const chain: string[] = [];
  let at: Expression = callee.expression;
  while (isPropertyAccessExpression(at)) {
    chain.unshift(at.name.text);
    at = at.expression;
  }
  return chain.length === 0 ? null : `trpc ${chain.join(".")}`;
}

// The `mutationOptions()` call a TanStack mutation was built from: `useMutation(options).mutate`, or a variable that
// holds that `useMutation` result.
function* mutationSource(world: NativeWorld, receiver: Expression): APIRequestGenerator<CallExpression | null> {
  let built: Node | undefined = receiver;
  if (isIdentifier(receiver)) {
    const symbol = yield* world.checker.getSymbolAtLocation.gen(receiver);
    const [declaration] = symbol?.declarations ?? [];
    const node = declaration === undefined || world.fileOf(declaration) === null ? undefined : yield* declaration.resolve.gen();
    built = node !== undefined && isVariableDeclaration(node) ? node.initializer : undefined;
  }
  const options = built !== undefined && isCallExpression(built) ? built.arguments[0] : undefined;
  return options !== undefined && isCallExpression(options) ? options : null;
}

// The procedure a tRPC call sends to: an input-taking verb the tRPC proxy declares, or a TanStack `mutate` on a
// mutation built from a procedure's `mutationOptions()`. A same-named method on any other receiver sends nowhere.
function* procedureCall(world: NativeWorld, callee: PropertyAccessExpression, names: LibraryNames): APIRequestGenerator<string | null> {
  if (TRPC_SENDS.has(callee.name.text) && names.declaredBy(callee.name, TRPC_PROXIES)) {
    return procedureOf(callee);
  }
  if (!(MUTATE_CALLS.has(callee.name.text) && names.declaredBy(callee.name, QUERY_HOOKS))) {
    return null;
  }
  const options = yield* mutationSource(world, callee.expression);
  if (options === null || !isPropertyAccessExpression(options.expression) || options.expression.name.text !== MUTATION_OPTIONS) {
    return null;
  }
  return names.declaredBy(options.expression.name, TRPC_QUERY) ? procedureOf(options.expression) : null;
}

// A body a platform request sends to a path on our own origin, which our routes receive; a URL of any other origin, or
// one whose start the fold cannot read, leaves the repo. The URL folds through ./urls.ts.
function* routeCall(world: NativeWorld, { call, argument }: CallEnd): APIRequestGenerator<string | null> {
  const request = yield* platformCall(world, call);
  if (request === null || request.body === null || call.arguments?.[request.body] !== argument) {
    return null;
  }
  const own = request.patterns.length > 0 && request.patterns.every((pattern) => callerPath(pattern) !== null);
  return own ? `http ${request.patterns.map(patternText).join(" | ")}` : null;
}

// The procedure or own route a value is handed to, with the callee resolved.
function* destinationOf(world: NativeWorld, value: Node, names: LibraryNames): APIRequestGenerator<string | null> {
  const end = yield* callEndOf(world, value);
  if (end === null) {
    return null;
  }
  const callee = end.call.expression;
  // A property callee is a procedure verb, or a platform request reached through its owner, as `window.fetch` is.
  const procedure = isPropertyAccessExpression(callee) && isCallExpression(end.call) ? yield* procedureCall(world, callee, names) : null;
  return procedure ?? (yield* routeCall(world, end));
}

// The value a loose key is a key of: its object literal, or the receiver of an element or property write.
function looseValue(node: Node): Node | null {
  const { parent } = node;
  if ((isPropertyAssignment(parent) || isShorthandPropertyAssignment(parent)) && isObjectLiteralExpression(parent.parent)) {
    return parent.parent;
  }
  return isElementAccessExpression(parent) || isPropertyAccessExpression(parent) ? parent.expression : null;
}

// The identifier a value is bound to, when the value is a variable's initializer or names one.
function boundName(value: Node): Identifier | null {
  if (isIdentifier(value)) {
    return value;
  }
  const outer = outerOf(value);
  return isVariableDeclaration(outer.parent) && outer.parent.initializer === outer && isIdentifier(outer.parent.name) ? outer.parent.name : null;
}

// Where each loose value goes: straight from the literal, or from any use of the variable it is bound to in its file.
function looseDestinations(world: NativeWorld, values: readonly Node[]): readonly (string | null)[] {
  const bound = values.map(boundName);
  const symbols = world.symbolsAt(bound.flatMap((name) => (name === null ? [] : [name])));
  let next = 0;
  const keys = bound.map((name) => (name === null ? [] : (symbols[next++]?.declarations ?? []).flatMap((handle) => `${handle.path}#${handle.index}`)));
  const uses = bound.map((name) => (name === null ? [] : identifiersNamed(name.getSourceFile(), name.text).filter((use) => use !== name)));
  const plain = uses.flat().filter((use) => !isShorthandPropertyAssignment(use.parent));
  const shorthand = uses.flat().filter((use) => isShorthandPropertyAssignment(use.parent));
  const plainKeys = new Map(world.symbolsAt(plain).map((symbol, at) => [plain[at], symbol === undefined ? [] : declarationKeys(symbol)] as const));
  const shorthandKeys = new Map(
    world
      .shorthandValues(shorthand.map((use) => use.parent))
      .map((symbol, at) => [shorthand[at], symbol === undefined ? [] : declarationKeys(symbol)] as const),
  );
  const ends = values.map((value, at) => {
    const own = keys[at] ?? [];
    const reaching = (uses[at] ?? []).filter((use) => (plainKeys.get(use) ?? shorthandKeys.get(use) ?? []).some((key) => own.includes(key)));
    return [value, ...reaching];
  });
  const names = libraryNames(world);
  const reached = world.batch(ends.flat().map((start) => destinationOf(world, start, names)));
  let cursor = 0;
  return ends.map((each) => {
    const found = each.map(() => reached[cursor++] ?? null).find((destination) => destination !== null);
    return found ?? null;
  });
}

function identifiersNamed(source: SourceFile, text: string): readonly Node[] {
  const found: Node[] = [];
  const visit = (node: Node): void => {
    if (isIdentifier(node) && node.text === text) {
      found.push(node);
    }
    node.forEachChild(visit);
  };
  source.forEachChild(visit);
  return found;
}

// --- The check ----------------------------------------------------------------------------------------------------

// Each candidate's verdict: placed on the removed home, placed elsewhere, loose into our server, or unplaced.
function* placedOn(world: NativeWorld, resolution: KeyResolution | null, span: ReturnType<typeof homeSpans>): APIRequestGenerator<boolean> {
  if (resolution === null || resolution.outcome === "open") {
    return false;
  }
  if (resolution.outcome === "members") {
    return yield* declaredIn(
      world,
      resolution.members.flatMap((member) => member.declarations),
      span,
    );
  }
  return (yield* all(...resolution.holders.map((holder) => holdsHome(world, holder, span)))).some(Boolean);
}

function verdicts<Candidate extends Node>(
  world: NativeWorld,
  candidates: readonly Candidate[],
  homesOf: (node: Candidate) => readonly Home[],
): readonly Verdict[] {
  const resolutions = resolveKeys(
    world,
    candidates.map((node) => ({ node })),
  );
  const sites = candidates.map((node, at) => ({ node, span: homeSpans(world, homesOf(node)), resolution: resolutions[at] ?? null }));
  const placed = world.batch(
    sites.map(function* (site): APIRequestGenerator<{ readonly site: (typeof sites)[number]; readonly placed: boolean }> {
      return { site, placed: yield* placedOn(world, site.resolution, site.span) };
    }),
  );
  const open = sites.flatMap(({ node, resolution }) => (resolution?.outcome === "open" ? [{ node, value: looseValue(node) }] : []));
  const reached = looseDestinations(
    world,
    open.flatMap(({ value }) => (value === null ? [] : [value])),
  );
  const looseAt = new Map<Candidate, string | null>();
  let next = 0;
  for (const { node, value } of open) {
    looseAt.set(node, value === null ? null : (reached[next++] ?? null));
  }
  return placed.map(({ site, placed: onHome }) => verdictOf(site.resolution, onHome, looseAt.get(site.node) ?? null));
}

function verdictOf(resolution: KeyResolution | null, placed: boolean, loose: string | null): Verdict {
  if (placed) {
    return { kind: "sender" };
  }
  if (resolution === null) {
    return { kind: "unresolved", reason: NO_KEY_POSITION };
  }
  if (resolution.outcome === "members") {
    return { kind: "other" };
  }
  if (resolution.outcome === "open") {
    return loose === null ? { kind: "unresolved", reason: NO_DESTINATION } : { kind: "loose", destination: loose };
  }
  return { kind: "unresolved", reason: resolution.reason };
}

function hitOf(world: NativeWorld, node: Node, receiver: Receiver): Hit {
  const source = node.getSourceFile();
  const line = editorLineOf(source, node.getStart(source));
  const site = world.siteOf(node);
  return { receiver, at: `${site.file}:${String(line)}`, text: (source.text.split("\n")[line - 1] ?? "").trim() };
}

interface Tally {
  readonly homes: readonly Home[];
  readonly senders: Hit[];
  readonly loose: (Hit & { readonly destination: string })[];
  readonly unresolved: (Hit & { readonly reason: string })[];
  other: number;
}

// Every name or string key in the receiver files that spells a removed key, with its verdict.
function scanFiles(world: NativeWorld, files: readonly string[], removed: ReadonlyMap<string, readonly Home[]>, tallies: ReadonlyMap<string, Tally>): void {
  const candidates: PropertyName[] = [];
  for (const file of files) {
    const visit = (node: Node): void => {
      if (isPropertyName(node) && removed.has(node.text)) {
        candidates.push(node);
      }
      node.forEachChild(visit);
    };
    world.source(file)?.forEachChild(visit);
  }
  const found = verdicts(world, candidates, (node) => removed.get(node.text) ?? []);
  for (const [at, node] of candidates.entries()) {
    const tally = tallies.get(node.text);
    const receiver = receiverOf(world.siteOf(node).file);
    const verdict = found[at];
    if (tally === undefined || receiver === null || verdict === undefined) {
      continue;
    }
    // A property-position identifier that is no key (a local binding of the same name) answers null and is no site.
    if (!(verdict.kind === "unresolved" && verdict.reason === NO_KEY_POSITION && isIdentifier(node))) {
      record(tally, hitOf(world, node, receiver), verdict);
    }
  }
}

function record(tally: Tally, hit: Hit, verdict: Verdict): void {
  if (verdict.kind === "sender") {
    tally.senders.push(hit);
  } else if (verdict.kind === "loose") {
    tally.loose.push({ ...hit, destination: verdict.destination });
  } else if (verdict.kind === "unresolved") {
    tally.unresolved.push({ ...hit, reason: verdict.reason });
  } else {
    tally.other += 1;
  }
}

// --- The run ------------------------------------------------------------------------------------------------------

/** A checked deletion branch: its revisions, the receiver files at `head`, and the keys it removes by home. */
export interface RemovedKeysPlan {
  readonly root: string;
  readonly base: string;
  readonly head: string;
  readonly scanned: Readonly<Record<Receiver, number>>;
  /** Untracked, unignored files: the merged program refuses the run only when it loads one of them. */
  readonly untracked: readonly string[];
  readonly removed: ReadonlyMap<string, readonly Home[]>;
}

const DIFFERS = "removed-keys resolves senders in the working tree, which differs from HEAD: commit or set aside the changes first";

/** Check that `head` is the clean checkout, then read the receiver files and the keys the branch removes.
 *  @throws When `head` is not the checked-out commit or the tracked files differ from it: the merged program loads the
 *  working tree. An untracked file is checked once the program is built, since only a file it loads changes a verdict. */
export function removedKeysPlan({ root, base, head }: RemovedKeysOptions): RemovedKeysPlan {
  if (execGit(root, ["rev-parse", head]).trim() !== execGit(root, ["rev-parse", "HEAD"]).trim()) {
    throw new Error(`removed-keys resolves senders in the checked-out tree: check out ${head} first`);
  }
  if (execGit(root, ["status", "--porcelain", "--untracked-files=no"]).trim() !== "") {
    throw new Error(DIFFERS);
  }
  const untracked = execGit(root, ["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean);
  const filesAt = (receiver: Receiver): number =>
    execGit(root, ["ls-tree", "-r", "--name-only", head, "--", ...RECEIVER_PATHS[receiver]])
      .split("\n")
      .filter(Boolean).length;
  const scanned: Record<Receiver, number> = { client: filesAt("client"), plugins: filesAt("plugins"), e2e: filesAt("e2e") };
  return { root, base, head, scanned, untracked, removed: removedKeys(root, base, head) };
}

const emptyTallies = (plan: RemovedKeysPlan): ReadonlyMap<string, Tally> =>
  new Map([...plan.removed].map(([key, homes]) => [key, { homes, senders: [], loose: [], unresolved: [], other: 0 }]));

// A receiver file the merged program does not load (a JSON fixture, a script outside every world) is searched as text
// and listed.
function outsideProgram(plan: RemovedKeysPlan, held: ReadonlySet<string>, tallies: ReadonlyMap<string, Tally>): void {
  for (const [key, tally] of tallies) {
    for (const receiver of RECEIVERS) {
      for (const { file, line, text } of gitGrep(plan.root, plan.head, ["-w", "-F", key], RECEIVER_PATHS[receiver])) {
        if (!(held.has(file) || COMMENT_LINE.test(text))) {
          tally.unresolved.push({ receiver, at: `${file}:${String(line)}`, text: text.trim(), reason: OUTSIDE_PROGRAM });
        }
      }
    }
  }
}

function reportOf(plan: RemovedKeysPlan, tallies: ReadonlyMap<string, Tally>): RemovedKeysReport {
  const entries = [...tallies].map(([key, { homes, ...found }]): RemovedKey => ({ key, homes: homes.map(({ file, name }) => `${file}:${name}`), ...found }));
  return {
    base: plan.base,
    head: plan.head,
    scanned: plan.scanned,
    removed: entries,
    failed: entries.some((entry) => entry.senders.length > 0 || entry.loose.length > 0),
    limits: REMOVED_KEY_LIMITS,
  };
}

/** The report of a branch that removes no key: no receiver site can name one, so no session is built. */
export const nothingRemoved = (plan: RemovedKeysPlan): RemovedKeysReport => reportOf(plan, emptyTallies(plan));

/** Resolve every receiver site the session's merged program holds that names a removed key, then search the receiver
 *  files it does not hold as text.
 *  @throws When the merged program loads an untracked file: a verdict on it would hold for no commit. */
export function removedKeysPass(world: NativeWorld, plan: RemovedKeysPlan): RemovedKeysReport {
  const loaded = world.files.map((source) => world.fileOfSource(source));
  const held = new Set(loaded);
  const stray = plan.untracked.filter((file) => held.has(file));
  if (stray.length > 0) {
    throw new Error(`${DIFFERS}; the merged program loads untracked ${stray.join(", ")}`);
  }
  const tallies = emptyTallies(plan);
  const files = loaded.filter((file) => receiverOf(file) !== null);
  scanFiles(world, files, plan.removed, tallies);
  outsideProgram(plan, new Set(files), tallies);
  return reportOf(plan, tallies);
}
