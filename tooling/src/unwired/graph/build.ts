// The reference graph of the merged program: every name resolved to its declarations, every edge typed run, type or doc,
// and every member's roles, from one walk of each judged file and the checker passes after it.
//
// - The program is the merged in-memory program over every typecheck world (worlds.ts mergedConfigText); no tsconfig file
//   holds it. A world the merge cannot hold (worlds.ts WORLDS_APART) is walked after it as its own program into the same
//   facts, over only the files the merged program does not hold. The judged population is knip's: a workspace's `project` files, a derived root, or a root-level file.
// - Our own ambient declarations are walked like code, so each global they declare is a node its uses reach; the
//   published plugin SDK's declarations are its own surface and are read as a door (plugin-surface.ts) instead.
// - A role comes from what an occurrence's syntax does (roles.ts referenceRoles); roles.ts states the escape and bump
//   rulings, and analyse.ts the test-read ruling.
import { existsSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import process from "node:process";
import type { CallExpression, InterfaceDeclaration, Node } from "@typescript/native/ast";
import {
  isAwaitExpression,
  isCallExpression,
  isConstructSignatureDeclaration,
  isExportDeclaration,
  isIdentifier,
  isInterfaceDeclaration,
  isNonNullExpression,
  isObjectBindingPattern,
  isObjectLiteralExpression,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isPropertySignatureDeclaration,
  isQualifiedName,
  isShorthandPropertyAssignment,
  isSpreadAssignment,
  isSpreadElement,
  isTypeReferenceNode,
  isVariableDeclaration,
  SyntaxKind,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Checker, JSDocTagInfo, Symbol as NativeSymbol, Type } from "@typescript/native/sync";
import { SignatureKind, SymbolFlags, TypeFlags } from "@typescript/native/sync";
import type { StoreWrite } from "../boundaries.ts";
import { copiedReads } from "../boundaries.ts";
import { parsedColumns, schemaParses } from "../handoffs.ts";
import type { PropertyName } from "../native.ts";
import { hasFlag, isPropertyName, NativeWorld } from "../native.ts";
import type { SdkSurface } from "../plugin-surface.ts";
import { PUBLISHED_SDK, sdkSurface } from "../plugin-surface.ts";
import { programsApart } from "../worlds.ts";
import { Constraints } from "./constraints.ts";
import { declaredNameOf } from "./declared.ts";
import { Flows, insideGlobalScope } from "./flows.ts";
import { Keys } from "./keys.ts";
import { keySources, libraryKeySet, lostSlot, NO_KEY, packagesOf } from "./lost.ts";
import { MemberLinks } from "./member-links.ts";
import { MessageDoors } from "./message-doors.ts";
import type { DeclKey } from "./resolve.ts";
import { addAll, allOf, answer, constituentsOf, declKeyParts, keyText, ZOD_PACKAGE } from "./resolve.ts";
import { READS, sameNode } from "./roles.ts";
import type { RootKind, Roots } from "./roots.ts";
import { RouteParams } from "./routes.ts";
import type { ValueSelector } from "./selectors.ts";
import { valueSelectors } from "./selectors.ts";
import type { ClassFacts, FileSites, GraphKey, ModuleKey, NameSite, PatternRoute, WalkSink } from "./sites.ts";
import { collectSites, GLOBAL_OBJECTS, moduleKey } from "./sites.ts";
import { fileSlotWrites } from "./slots.ts";
import { fileSpellings } from "./spellings.ts";
import type { BuildSession, ComputedLoad, GraphFacts, LostCause, LostSlot } from "./state.ts";
import { GraphState, isPrimitive } from "./state.ts";
import type { VariantAxis } from "./variants.ts";
import { Variants } from "./variants.ts";
import type { WhyEntry } from "./why.ts";

const ZOD_TYPE = "ZodType";
// The member a zod schema's type carries its parsed value's type in.
const ZOD_OUTPUT = "_output";
// A recursive generic can instantiate a fresh type at every level, which a seen-set of type ids never stops.
const OUTPUT_DEPTH = 16;
const ANY_RECEIVER: LostSlot = "any-receiver";
// The receiver a read off `any` names: the type has no alias, symbol or declaring file.
const ANY_TYPE = "any";

const CODE_FILE = /\.(?:m|c)?[jt]sx?$/u;
// The hooks that hand back a `[value, setter]` tuple, confirmed against React's own declarations.
const STATE_HOOKS: ReadonlySet<string> = new Set(["useState", "useReducer", "useOptimistic", "useActionState"]);
const REACT_TYPES = "@types/react";
const TYPE_DECLARATIONS: ReadonlySet<SyntaxKind> = new Set([SyntaxKind.InterfaceDeclaration, SyntaxKind.TypeAliasDeclaration]);
const GLOBAL_OBJECT_NAMES: ReadonlySet<string> = new Set(GLOBAL_OBJECTS);

// The name read off a global object: `__orb` in `window.__orb`.
const globalObjectMember = (node: Node): boolean => {
  const { parent } = node;
  return (
    isPropertyAccessExpression(parent) && sameNode(parent.name, node) && isIdentifier(parent.expression) && GLOBAL_OBJECT_NAMES.has(parent.expression.text)
  );
};

// Whether a property read's receiver chain passes through one of the door names at `doors`: calls, `!` and parentheses
// on the way are part of the chain.
function throughDoor(node: Node, doors: ReadonlySet<number>): boolean {
  const { parent } = node;
  if (!(isPropertyAccessExpression(parent) && sameNode(parent.name, node))) {
    return false;
  }
  let receiver: Node = parent.expression;
  for (;;) {
    if (isCallExpression(receiver) || isNonNullExpression(receiver) || isParenthesizedExpression(receiver)) {
      receiver = receiver.expression;
    } else if (isPropertyAccessExpression(receiver)) {
      if (doors.has(receiver.name.pos)) {
        return true;
      }
      receiver = receiver.expression;
    } else {
      return false;
    }
  }
}

// A declaration a published or trusted file exports, kept by that file's ruling.
interface KeptExport {
  readonly decl: DeclKey;
  readonly kind: RootKind;
  readonly why: string;
}

// A module a `new URL("./x", import.meta.url)` names: it runs as its own entry.
interface UrlSpawn {
  readonly module: ModuleKey;
  readonly from: string;
}

/** A built graph: the state, the settled variant tables and the facts liveness needs beyond edges. */
export interface Graph {
  readonly facts: GraphFacts;
  readonly variants: readonly VariantAxis[];
  /** Every exact data-* value selector the sheets and the product strings spell, which a variant value's row names. */
  readonly variantSelectors: readonly ValueSelector[];
  readonly kept: readonly KeptExport[];
  readonly sdk: SdkSurface;
  readonly urlSpawns: readonly UrlSpawn[];
  readonly files: readonly string[];
}

// What one program's build yields; the tree's sheets are read once, beside the programs.
type WorldGraph = Omit<Graph, "variantSelectors">;

// The type a destructuring pattern's keys read: its source's, the element type for a for-of target, then down each step
// (a tuple's element by its index, else the list's element type).
function* patternSourceType(checker: Checker, route: PatternRoute): APIRequestGenerator<Type | undefined> {
  const source = yield* checker.getTypeAtLocation.gen(route.source);
  let type: Type | undefined = route.iterated ? yield* source.getNumberIndexType.gen() : source;
  for (const step of route.steps) {
    if (type === undefined) {
      return undefined;
    }
    const named: Type | undefined = yield* checker.getTypeOfPropertyOfType.gen(type, String(step));
    type = named ?? (typeof step === "number" ? yield* type.getNumberIndexType.gen() : undefined);
  }
  return type;
}

// Which of our declaration files the graph walks: all but the published SDK's (the world keeps no library's).
const walkedDeclaration = (file: string): boolean => !file.startsWith(PUBLISHED_SDK);

/** The merged program the graph reads. */
export const openGraphWorld = (root: string, timing = false): NativeWorld => NativeWorld.openMerged(root, walkedDeclaration, timing);

// The declaration kind a key names.
const kindOf = (key: GraphKey): SyntaxKind | null => (key.startsWith("M:") ? null : Number(key.slice(key.lastIndexOf(".") + 1)));

const isModuleDecl = (key: DeclKey): boolean => kindOf(key) === SyntaxKind.SourceFile;
const isClassKey = (key: DeclKey): boolean => kindOf(key) === SyntaxKind.ClassDeclaration;

/** A class instance or value waiting for every class to be read: the slot it went into and what it resolved to. */
interface PendingClass {
  readonly slot: Type | undefined;
  readonly decls: readonly DeclKey[];
}

/** A build's graph and the roles its `--why` targets were given on the way. */
export interface BuiltGraph {
  readonly graph: Graph;
  readonly why: readonly WhyEntry[];
}

/** Build the graph of every judged file in the world under the session's options, logging how far the walk has come. */
export function buildGraph(root: string, world: NativeWorld, roots: Roots, session: BuildSession): BuiltGraph {
  const state = new GraphState(root, world, roots, session);
  const merged = new Builder(state).build(judgedFiles(state));
  const apart = (): readonly WorldGraph[] => programsApart(root).map((config) => buildApart(state, config, new Set(merged.files)));
  const parts = session.profile === null ? apart() : session.profile.time("apart", apart);
  state.enter(world);
  const all = [merged, ...parts];
  const graph: Graph = {
    ...merged,
    variantSelectors: valueSelectors(root, world),
    variants: all.flatMap(({ variants }) => variants),
    kept: all.flatMap(({ kept }) => kept),
    urlSpawns: all.flatMap(({ urlSpawns }) => urlSpawns),
    files: all.flatMap(({ files }) => files),
  };
  return { graph, why: state.why?.entries(state.decls) ?? [] };
}

// The files a program holds that the build judges: knip's population, a module root or a root-level file.
function judgedFiles(state: GraphState): readonly string[] {
  const { roots, world } = state;
  const { files: only } = state.session.options;
  return world.files
    .map((source) => world.fileOfSource(source))
    .filter((file) => (roots.inProject(file) || roots.modules.has(file) || dirname(file) === ".") && (only === null || file.startsWith(only)));
}

// A world the merge cannot hold (worlds.ts WORLDS_APART), walked as its own program into the same facts: only the files
// the merged program does not hold, so a file both hold is walked once, in the merged program.
function buildApart(state: GraphState, config: string, merged: ReadonlySet<string>): WorldGraph {
  using world = NativeWorld.open(state.root, config);
  state.enter(world);
  const graph = new Builder(state).build(judgedFiles(state).filter((file) => !merged.has(file)));
  state.peak(`apart program rss MB ${config}`, Math.round(process.memoryUsage().rss / MB));
  return graph;
}

const MB = 1e6;

// The walk reports its progress every this many files.
const PROGRESS_EVERY = 1000;

// The interfaces in a declaration file, namespaces included, with a construct signature that returns the named class.
function constructingInterfaces(file: Node, className: string): readonly InterfaceDeclaration[] {
  const found: InterfaceDeclaration[] = [];
  const visit = (node: Node): void => {
    if (isInterfaceDeclaration(node)) {
      const builds = node.members.some(
        (member) =>
          isConstructSignatureDeclaration(member) &&
          member.type !== undefined &&
          isTypeReferenceNode(member.type) &&
          isIdentifier(member.type.typeName) &&
          member.type.typeName.text === className,
      );
      if (builds) {
        found.push(node);
      }
      return;
    }
    node.forEachChild(visit);
  };
  visit(file);
  return found;
}

// The package whose builder methods a store must resolve to before the build reads it as a Drizzle write.
const DRIZZLE_PACKAGE = "drizzle-orm";

// A computed load's site and the argument it loads, as the source spells it.
function computedLoad(call: CallExpression, file: string): ComputedLoad {
  const source = call.getSourceFile();
  const [argument = call] = call.arguments;
  const line = source.getLineAndCharacterOfPosition(call.getStart(source)).line + 1;
  return { file, line, argument: source.text.slice(argument.getStart(source), argument.end) };
}

class Builder {
  readonly #state: GraphState;
  readonly #variants: Variants;
  readonly #flows: Flows;
  readonly #keys: Keys;
  readonly #classes = new Map<DeclKey, ClassFacts>();
  readonly #doors: MessageDoors;
  readonly #routes: RouteParams;
  readonly #constraints: Constraints;
  readonly #links: MemberLinks;
  readonly #staticSideCache = new Map<number, readonly Type[]>();
  // The current file's binding readers, filled by its name and shorthand passes.
  #fileReaders: { readonly readers: Map<DeclKey, Set<GraphKey>>; readonly written: Set<DeclKey> } = { readers: new Map(), written: new Set() };
  readonly #pendingSlots: PendingClass[] = [];
  readonly #pendingValues: PendingClass[] = [];
  readonly #urlSpawns: UrlSpawn[] = [];
  // Each schema-side declaration with the checked types' members it pairs with, settled once every file is walked.
  readonly #twinPartners = new Map<DeclKey, Set<DeclKey>>();

  constructor(state: GraphState) {
    this.#state = state;
    this.#variants = new Variants(state.session);
    this.#flows = new Flows(this.#state);
    this.#doors = new MessageDoors(this.#state);
    this.#routes = new RouteParams(this.#state);
    this.#constraints = new Constraints(this.#state);
    this.#keys = new Keys(this.#state);
    this.#links = new MemberLinks(this.#state, this.#flows);
  }

  build(files: readonly string[]): WorldGraph {
    const state = this.#state;
    const { profile } = state.session;
    const walk = (): void => this.#walk(files);
    const settle = (): readonly VariantAxis[] => {
      this.#doors.settle(this.#flows);
      state.unpairedReceivers.push(...this.#doors.unpaired);
      this.#settleClasses();
      this.#keys.finish(this.#flows);
      this.#settleTwins();
      this.#links.settle();
      this.#flows.settle();
      return this.#variants.finish();
    };
    if (profile === null) {
      walk();
    } else {
      profile.time("walk", walk);
    }
    const variants = profile === null ? settle() : profile.time("fixpoint", settle);
    return { facts: state, variants, kept: this.#kept(files), sdk: sdkSurface(state.root), urlSpawns: this.#urlSpawns, files };
  }

  #walk(files: readonly string[]): void {
    const state = this.#state;
    const { world, session } = state;
    const sink = this.#sink();
    for (const [at, file] of files.entries()) {
      const began = performance.now();
      const source = world.source(file);
      if (source !== undefined) {
        this.#file(collectSites(source, file, state.product(file), sink));
      }
      world.releaseAnswers();
      session.profile?.file(file, performance.now() - began);
      if ((at + 1) % PROGRESS_EVERY === 0) {
        session.log(`walked ${String(at + 1)}/${String(files.length)} files`);
      }
    }
  }

  #sink(): WalkSink {
    const state = this.#state;
    return {
      keyOf: (node): DeclKey => state.resolver.keyOf(node),
      declare: (key, info): void => {
        state.decls.set(key, info);
      },
      edge: (map, from, to): void => state.edge(map, from, to),
      role: (key, role, file, at): void => state.role(key, role, file, at),
      pin: (key): void => {
        state.pins.push(key);
      },
      unseenCall: (key): void => {
        state.unseenCalls.add(key);
      },
      urlModule: (from, specifier): string | null => {
        const target = normalize(join(dirname(from), specifier));
        return CODE_FILE.test(target) && existsSync(join(state.root, target)) ? target : null;
      },
    };
  }

  #file(sites: FileSites): void {
    const state = this.#state;
    this.#names(sites);
    this.#stores(sites);
    fileSlotWrites(state, this.#variants, sites);
    this.#flows.file(sites, this.#doors.held(sites.file));
    this.#variants.readTables(state, sites.tvCalls, sites.file);
    this.#keys.file(sites, this.#flows);
    this.#zodTwins(sites);
    this.#overrides(sites);
    this.#links.file(sites.file);
    this.#parses(sites);
    this.#parameterHomes(sites);
    this.#hookTuples(sites);
    this.#docs(sites);
    this.#shorthands(sites);
    this.#bindings(sites);
    this.#patterns(sites);
    this.#specifiers(sites);
    this.#classFacts(sites);
    this.#literals(sites);
    this.#tags(sites);
    fileSpellings(state, sites);
    state.cssNames.push(...sites.cssNames);
    // a module a require function loads by a literal path runs as an import's does
    for (const { target, from } of sites.requiredModules) {
      state.edge("run", from, moduleKey(target));
    }
    state.computedLoads.push(...sites.computedLoads.map((call) => computedLoad(call, sites.file)));
    // a module loaded by path (a Worker, a child process) runs as its own entry, kept alive by what spawns it
    for (const { target, from } of sites.urlModules) {
      state.edge("run", from, moduleKey(target));
      this.#urlSpawns.push({ module: moduleKey(target), from: sites.file });
    }
  }

  // A Drizzle write, once its builder methods resolve to Drizzle's, writes and fills its table's columns (sites.ts holds
  // the ruling). Each key a stored literal sets writes its column at the key, and flows the reads it copies into that
  // column. A whole or spread value writes the columns of its required members at the builder method, and flows each
  // member into the same-named column, so a column read back reads the member and an optional member is written where
  // the value that sets it is built.
  #stores(sites: FileSites): void {
    if (sites.stores.length === 0) {
      return;
    }
    const state = this.#state;
    const { checker } = state.world;
    const symbols = state.world.symbolsAt(sites.stores.flatMap(({ at, opener }) => [at, opener]));
    const drizzle = state.world.fromPackage(
      symbols.map((symbol) => symbol?.declarations ?? []),
      DRIZZLE_PACKAGE,
    );
    const stores = sites.stores.filter((_, x) => drizzle[2 * x] === true && drizzle[2 * x + 1] === true);
    const tables = state.world.typesAt(stores.map(({ table }) => table));
    const { keys, wholes } = storedParts(stores);
    const keyColumns = state.declarations(state.batch(keys.map(({ at, name }) => columnOf(checker, tables[at], name.text))));
    const copies = keys.flatMap(({ reads }, y) => reads.map((read) => ({ y, read })));
    const sources = state.declarations(state.world.symbolsAt(copies.map(({ read }) => read)));
    const values = state.world.typesAt(wholes.map(({ value }) => value));
    const found = state.batch(wholes.map(({ at }, y) => storedMembers(state, tables[at], values[y])));
    const members = wholes.flatMap(({ method }, y) => (found[y] ?? []).map((pair) => ({ ...pair, method })));
    const memberKeys = state.declarations(members.map(({ member }) => member));
    const memberColumns = state.declarations(members.map(({ column }) => column));
    for (const [y, { name }] of keys.entries()) {
      state.roleAll(keyColumns[y] ?? [], "write", sites.file, name.pos);
    }
    for (const [y, { member, method }] of members.entries()) {
      if (!hasFlag(member.flags, SymbolFlags.Optional)) {
        state.roleAll(memberColumns[y] ?? [], "write", sites.file, method.pos);
      }
    }
    const pairs = [
      ...copies.map(({ y }, x) => ({ columns: keyColumns[y] ?? [], sources: sources[x] ?? [] })),
      ...members.map((_, y) => ({ columns: memberColumns[y] ?? [], sources: memberKeys[y] ?? [] })),
    ];
    for (const pair of pairs) {
      for (const column of pair.columns) {
        for (const source of pair.sources) {
          state.columnFlow(column, source);
        }
      }
    }
    state.count("drizzle stores", stores.length);
  }

  // Each name resolves to its declarations: an edge from the declaration it sits in, and the roles its syntax gives.
  #names(sites: FileSites): void {
    const state = this.#state;
    const symbols = state.world.symbolsAt(sites.names.map(({ node }) => node));
    const resolved = state.declarations(symbols);
    for (const [at, site] of sites.names.entries()) {
      this.#use(site, resolved[at] ?? [], sites.file);
    }
    this.#doorReads(sites, symbols, resolved);
    this.#bindingReads(sites, resolved);
    this.#doors.file(sites, symbols, resolved);
    this.#routes.file(sites.routeCalls, sites.file);
    this.#constraints.file(sites, sites.file);
    this.#flows.link(this.#constraints.inferredPairs(sites.inferredCalls), sites.file);
    this.#bareReads(sites, symbols, resolved);
    this.#anyReceiverReads(sites, symbols);
    // a namespace binding used whole (`typeof schema`, `f(schema)`) uses every export; `ns.member` resolves alone
    this.#wholeModule(
      sites.names.flatMap((site, at) => {
        const symbol = symbols[at];
        return symbol !== undefined && !namesAMember(site.node) && (resolved[at] ?? []).some(isModuleDecl)
          ? [{ symbol, from: site.from, type: site.inType }]
          : [];
      }),
    );
    const classValues = sites.names.flatMap(({ node, handed }, at) =>
      handed && isIdentifier(node) && (resolved[at] ?? []).some(isClassKey) ? [{ node, decls: (resolved[at] ?? []).filter(isClassKey) }] : [],
    );
    const slots = state.slotTypes(state.batch(classValues.map(({ node }) => state.world.checker.getContextualType.gen(node))));
    this.#pendingValues.push(...classValues.map(({ decls }, at) => ({ slot: slots[at], decls })));
  }

  // Who reads each of the file's bindings: a name that is not the binding's own and does more than write, in a type
  // position too. A use of an import resolves past it to what it imports, so a name spelled as one of the file's
  // imports, or a shorthand that is, asks the checker again for the symbol before its alias is followed.
  #bindingReads(sites: FileSites, resolved: readonly DeclKey[][]): void {
    const state = this.#state;
    const { checker } = state.world;
    const imported = new Set(sites.bindings.flatMap(({ kind, name }) => (kind === "import" ? [name] : [])));
    const asked = sites.names.flatMap((site, at) => (!site.declares && imported.has(nameText(site.node)) ? [{ site, at }] : []));
    const shorthands = sites.shorthands.filter(({ node }) => imported.has(nameText(node.name)));
    // a doc comment's link reads an import binding it names, as tsc counts it
    const docs = sites.docNames.filter(({ node }) => imported.has(nameText(node)));
    const aliasKeys = state.batch(
      [
        ...asked.map(({ site }) => checker.getSymbolAtLocation.gen(site.node)),
        ...shorthands.map(({ node }) => checker.getShorthandAssignmentValueSymbol.gen(node)),
        ...docs.map(({ node }) => checker.getSymbolAtLocation.gen(node)),
      ].map(function* (ask): APIRequestGenerator<readonly DeclKey[]> {
        const symbol = yield* ask;
        if (symbol === undefined || !hasFlag(symbol.flags, SymbolFlags.Alias)) {
          return [];
        }
        return (yield* allOf(symbol.declarations.map((handle) => state.resolver.handleKey(handle)))).flatMap((key) => (key === null ? [] : [key]));
      }),
    );
    const aliasOf = new Map(asked.map(({ at }, y) => [at, aliasKeys[y] ?? []]));
    const { readers, written } = nameReaders(sites.names, (at) => [...(resolved[at] ?? []), ...(aliasOf.get(at) ?? [])]);
    for (const [y, { from }] of [...shorthands, ...docs].entries()) {
      for (const key of aliasKeys[asked.length + y] ?? []) {
        addAll(readers, key, [from]);
      }
    }
    this.#fileReaders = { readers, written };
  }

  // Each binding the file declares, with its readers: a shorthand `{ x }` reads x too, and an export specifier the name.
  #bindings(sites: FileSites): void {
    const { readers, written } = this.#fileReaders;
    for (const binding of sites.bindings) {
      const exported = binding.kind !== "parameter" && sites.exportedLocals.has(binding.name);
      this.#state.bindings.push({
        ...binding,
        file: sites.file,
        readers: exported ? [moduleKey(sites.file)] : [...(readers.get(binding.key) ?? [])],
        written: written.has(binding.key),
      });
    }
  }

  // A read whose receiver chain passes through a global our own `declare global` declares, read off a global object
  // (`window.__orb.x`), reaches its member through the dev-bridge door. A read of the same member off an imported value
  // is no door read.
  #doorReads(sites: FileSites, symbols: readonly (NativeSymbol | undefined)[], resolved: readonly DeclKey[][]): void {
    const state = this.#state;
    const asks = sites.names.flatMap(({ node }, at) =>
      globalObjectMember(node) ? (symbols[at]?.declarations ?? []).filter((handle) => state.resolver.ours(handle)).map((handle) => ({ node, handle })) : [],
    );
    const declared = state.batch(asks.map(({ handle }) => handle.resolve.gen()));
    const doors = new Set(asks.flatMap(({ node }, y) => (insideGlobalScope(declared[y]) ? [node.pos] : [])));
    if (doors.size === 0) {
      return;
    }
    for (const [at, site] of sites.names.entries()) {
      if (site.roles.some((role) => READS.has(role)) && throughDoor(site.node, doors)) {
        state.doorRead(resolved[at] ?? [], sites.file);
      }
    }
  }

  #use(site: NameSite, decls: readonly DeclKey[], file: string): void {
    for (const decl of decls) {
      this.#state.edge(site.inType ? "typ" : "run", site.from, decl);
      for (const role of site.roles) {
        this.#state.role(decl, role, file, site.node.pos);
      }
    }
  }

  // A property read the checker answers with a declaration-less member: its receiver's type is walked back to the
  // origin; a read the type walk loses is asked of the receiver's declaration syntax; what has no home by design is
  // counted apart, and what is left is a lost read.
  #bareReads(sites: FileSites, symbols: readonly (NativeSymbol | undefined)[], resolved: readonly DeclKey[][]): void {
    const state = this.#state;
    const bare = sites.names.flatMap((site, at) => {
      const { parent } = site.node;
      const symbol = symbols[at];
      return symbol !== undefined && (resolved[at]?.length ?? 0) === 0 && isPropertyAccessExpression(parent) && sameNode(parent.name, site.node)
        ? [{ site, receiver: parent.expression, symbol }]
        : [];
    });
    const asks = state.world.typedAt(bare, ({ receiver }) => receiver).map(({ item, type }) => ({ ...item, type, name: nameText(item.site.node) }));
    const walks = state.origins(asks);
    const lost = asks.flatMap((entry, at) => ((walks[at]?.decls.length ?? 0) > 0 ? [] : [{ ...entry, at }]));
    for (const [at, entry] of bare.entries()) {
      this.#use(entry.site, walks[at]?.decls ?? [], sites.file);
    }
    const annotated = state.batch(lost.map(({ receiver, name }) => state.resolver.annotationOrigin(receiver, name)));
    const still = lost.filter(({ site, at }, y) => {
      const decls = annotated[y]?.decls ?? [];
      this.#use(site, decls, sites.file);
      if (decls.length > 0) {
        state.count("origin recovered through a receiver's declaration");
      }
      return decls.length === 0 && walks[at]?.end !== "library" && annotated[y]?.end !== "library";
    });
    const landed = lost.flatMap(({ site, at }, y) => {
      const walk = (annotated[y]?.decls.length ?? 0) === 0 ? [walks[at], annotated[y]].find((candidate) => candidate?.end === "library") : undefined;
      return walk === undefined ? [] : [{ site, stops: walk.stops }];
    });
    const stoppedAt = state.batch(landed.map(({ stops }) => packagesOf(state.world, stops)));
    this.#libraryLandings(
      sites,
      landed.map(({ site }, y) => ({ site, packages: stoppedAt[y] ?? [] })),
    );
    const keyed = state.batch(still.map(({ symbol, type }) => libraryKeySet(state.world, symbol, type)));
    this.#libraryLandings(
      sites,
      still.flatMap(({ site }, y) => ((keyed[y]?.length ?? 0) > 0 ? [{ site, packages: keyed[y] ?? [] }] : [])),
    );
    const unkeyed = still.filter((_, y) => (keyed[y]?.length ?? 0) === 0);
    const reasons = state.batch(unkeyed.map(({ type, name, symbol }) => state.resolver.unbackedReason(type, name, symbol)));
    const unplaced = unkeyed.filter((_, y) => reasons[y] === null || reasons[y] === undefined);
    for (const reason of reasons) {
      if (reason !== null) {
        state.count(`no home by design: ${reason}`);
      }
    }
    this.#lostReads(sites, unplaced);
  }

  // Each lost read with its key's source, one key-source walk per receiver type carrying every name lost on it, and the
  // slot it lands in.
  #lostReads(
    sites: FileSites,
    unplaced: readonly { readonly site: NameSite; readonly symbol: NativeSymbol; readonly type: Type; readonly name: string }[],
  ): void {
    const state = this.#state;
    const byType = [...Map.groupBy(unplaced, ({ type }) => type.id).values()].flatMap((reads) =>
      reads[0] === undefined ? [] : [{ type: reads[0].type, reads }],
    );
    const found = state.batch(byType.map(({ type, reads }) => keySources(state, type, [...new Set(reads.map(({ name }) => name))])));
    const keys = new Map(byType.flatMap(({ reads }, at) => reads.map(({ site, name }) => [site, found[at]?.get(name) ?? NO_KEY] as const)));
    const slotted = state.batch(
      unplaced.map(function* (read): APIRequestGenerator<{
        readonly read: (typeof unplaced)[number];
        readonly slot: Pick<LostCause, "slot" | "detail" | "receiver">;
      }> {
        return { read, slot: yield* lostSlot(state.world, read.symbol, read.type) };
      }),
    );
    for (const {
      read: { site, name },
      slot,
    } of slotted) {
      const read = `${sites.file}:${String(site.node.pos)} .${name}`;
      state.lostReads.push(read);
      state.lostCauses.push({ read, where: `${sites.file}:${String(sites.lineOf(site.node))}`, ...(keys.get(site) ?? NO_KEY), ...slot });
    }
  }

  // A property read off a receiver typed `any` names no member, so no step places it: it is a lost read whose key is its
  // name alone, and a member of that name anywhere could be what it reads. A write through `any` is not listed.
  #anyReceiverReads(sites: FileSites, symbols: readonly (NativeSymbol | undefined)[]): void {
    const state = this.#state;
    const reads = sites.names.flatMap((site, at) => {
      const { parent } = site.node;
      return symbols[at] === undefined &&
        !site.inType &&
        site.roles.some((role) => READS.has(role)) &&
        isPropertyAccessExpression(parent) &&
        sameNode(parent.name, site.node)
        ? [{ site, receiver: parent.expression }]
        : [];
    });
    for (const { item, type } of state.world.typedAt(reads, ({ receiver }) => receiver)) {
      if (hasFlag(type.flags, TypeFlags.Any)) {
        const read = `${sites.file}:${String(item.site.node.pos)} .${nameText(item.site.node)}`;
        state.lostReads.push(read);
        state.lostCauses.push({
          read,
          where: `${sites.file}:${String(sites.lineOf(item.site.node))}`,
          ...NO_KEY,
          slot: ANY_RECEIVER,
          detail: null,
          receiver: ANY_TYPE,
        });
      }
    }
  }

  // The bare reads a library's own declaration answered, by the packages their walks stopped at.
  #libraryLandings(sites: FileSites, landed: readonly { readonly site: NameSite; readonly packages: readonly string[] }[]): void {
    for (const { site, packages } of landed) {
      this.#state.libraryLandings.push({ where: `${sites.file}:${String(sites.lineOf(site.node))}`, member: nameText(site.node), packages });
    }
  }

  // A module used whole: every value export it has is used. A type export is only ever named on its own
  // (`schema.Row`), so it stays judged by its own uses.
  #wholeModule(uses: readonly { readonly symbol: NativeSymbol; readonly from: GraphKey; readonly type: boolean }[]): void {
    const state = this.#state;
    const exports = state.batch(uses.map(({ symbol }) => state.world.checker.getExportsOfModule.gen(symbol)));
    const flat = uses.flatMap((use, x) => (exports[x] ?? []).map((symbol) => ({ symbol, use })));
    const decls = state.declarations(flat.map(({ symbol }) => symbol));
    for (const [y, { use }] of flat.entries()) {
      for (const decl of (decls[y] ?? []).filter((key) => !TYPE_DECLARATIONS.has(kindOf(key) ?? SyntaxKind.Unknown))) {
        state.edge(use.type ? "typ" : "run", use.from, decl);
      }
    }
    state.count("whole-module uses", uses.length);
  }

  // `z.strictObject({ … }) satisfies z.ZodType<T>`: the schema's keys are T's members, one member each. The twin holds
  // where the reference means zod's own ZodType, imports and renames followed; a local type of that name twins nothing.
  // A schema checked so (by `satisfies`, an annotated binding or a declared return) holds its output to T at every
  // depth: each member its output declares pairs with the same-named member of T at the same path, so a member a
  // transform's annotation spells is T's member, and the check breaks when either is deleted (`#settleTwins`).
  #zodTwins(sites: FileSites): void {
    const state = this.#state;
    if (state.session.options.ablate.has("zod-twins") || sites.zodChecks.length === 0) {
      return;
    }
    const twins = this.#zodTypes(sites.zodTwins);
    const shapes = state.world.typedAt(twins, ({ shape }) => shape);
    const asks = shapes.flatMap(({ item: { keys }, type }) => keys.map((key) => ({ type, name: key.name, decl: key.decl })));
    const members = state.slotMembers(asks);
    for (const [y, ask] of asks.entries()) {
      for (const member of members[y] ?? []) {
        this.#pair(ask.decl, member);
      }
    }
    const checks = this.#zodTypes(sites.zodChecks);
    const declared = state.world.typesAt(checks.map(({ shape }) => shape));
    const schemas = state.world.typesAt(checks.map(({ schema }) => schema));
    const pairs = state.batch(
      checks.map((_, at) => {
        const [schema, type] = [schemas[at], declared[at]];
        return schema === undefined || type === undefined ? answer([]) : this.#outputPairs(schema, type);
      }),
    );
    const flat = pairs.flat();
    const outputs = state.declarations(flat.map(([output]) => output));
    const targets = state.declarations(flat.map(([, target]) => target));
    // A declaration the walk pairs with itself sits where the declared type is the schema's own output (`z.infer` of
    // it): nothing there is checked, and the union cross product would pair one option's key with a sibling's.
    const own = new Set(outputs.flatMap((output, y) => output.filter((decl) => targets[y]?.includes(decl) === true)));
    for (const [y, output] of outputs.entries()) {
      for (const from of output.filter((decl) => state.decls.has(decl) && !own.has(decl))) {
        for (const to of (targets[y] ?? []).filter((decl) => decl !== from && state.decls.has(decl))) {
          this.#pair(from, to);
        }
      }
    }
  }

  // The sites whose checked reference means zod's own ZodType, imports and renames followed.
  #zodTypes<T extends { readonly type: Node }>(sites: readonly T[]): readonly T[] {
    const state = this.#state;
    const { world } = state;
    const named = world.symbolsAt(sites.map(({ type }) => type));
    const meant = state.batch(
      named.map((symbol) => (symbol !== undefined && hasFlag(symbol.flags, SymbolFlags.Alias) ? world.checker.getAliasedSymbol.gen(symbol) : answer(symbol))),
    );
    const zod = world.fromPackage(
      meant.map((symbol) => (symbol?.name === ZOD_TYPE ? symbol.declarations : [])),
      ZOD_PACKAGE,
    );
    return sites.filter((_, at) => zod[at] === true);
  }

  #pair(schema: DeclKey, member: DeclKey): void {
    const partners = this.#twinPartners.get(schema) ?? new Set<DeclKey>();
    partners.add(member);
    this.#twinPartners.set(schema, partners);
  }

  // A schema declaration with one partner is that member: a twin, carrying reads both ways. One a check holds to several
  // members (a sub-schema reused under two keys, a union output's key under each arm of T) only passes its own reads to
  // each, as a `satisfies` check does: a twin there would carry one member's read through it to another, and a delete of
  // that other member still compiles.
  #settleTwins(): void {
    const state = this.#state;
    for (const [schema, partners] of this.#twinPartners) {
      for (const member of partners) {
        if (partners.size === 1) {
          state.twins.push([schema, member]);
        } else {
          state.checks.push([schema, member]);
        }
      }
    }
    this.#twinPartners.clear();
  }

  // A checked schema's output members beside the declared type's same-named members, at every depth: through null and
  // undefined, a list's elements and each union arm of the declared type.
  *#outputPairs(schema: Type, declared: Type): APIRequestGenerator<readonly (readonly [NativeSymbol, NativeSymbol])[]> {
    const state = this.#state;
    const { checker } = state.world;
    const output = yield* checker.getPropertyOfType.gen(schema, ZOD_OUTPUT);
    if (output === undefined) {
      return [];
    }
    const out: (readonly [NativeSymbol, NativeSymbol])[] = [];
    const seen = new Set<string>();
    const walk = function* (value: Type, target: Type, depth: number): APIRequestGenerator<void> {
      const [from, to] = [yield* checker.getNonNullableType.gen(value), yield* checker.getNonNullableType.gen(target)];
      const pair = `${String(from.id)}>${String(to.id)}`;
      if (depth > OUTPUT_DEPTH || seen.has(pair) || isPrimitive(to)) {
        return;
      }
      seen.add(pair);
      if ((yield* checker.isArrayLikeType.gen(from)) && (yield* checker.isArrayLikeType.gen(to))) {
        const [fromElement, toElement] = [yield* from.getNumberIndexType.gen(), yield* to.getNumberIndexType.gen()];
        if (fromElement !== undefined && toElement !== undefined) {
          yield* walk(fromElement, toElement, depth + 1);
        }
        return;
      }
      for (const member of yield* state.membersOf(to)) {
        for (const filled of yield* state.propsOnSlot(from, member.name)) {
          out.push([filled, member]);
          yield* walk(yield* checker.getTypeOfSymbol.gen(filled), yield* checker.getTypeOfSymbol.gen(member), depth + 1);
        }
      }
    };
    yield* walk(yield* checker.getTypeOfSymbol.gen(output), declared, 0);
    return out;
  }

  // `interface Leaf extends Base { readonly title: string }`: a member that redeclares a member of an extended type
  // holds the same field, so the analysis carries a read of either to the other (analyse.ts roleLinks).
  #overrides(sites: FileSites): void {
    const state = this.#state;
    const asks = sites.extendingInterfaces.flatMap((node) => {
      const own = node.members.flatMap((member) => {
        const name = isPropertySignatureDeclaration(member) ? keyText(member.name) : undefined;
        return name === undefined ? [] : [{ name, key: state.resolver.keyOf(member) }];
      });
      return (node.heritageClauses ?? []).flatMap((clause) => clause.types.flatMap((base) => own.map((member) => ({ ...member, base }))));
    });
    const bases = state.world.typesAt(asks.map(({ base }) => base));
    const props = state.batch(
      asks.map(({ name }, at) => {
        const type = bases[at];
        return type === undefined ? answer<NativeSymbol | undefined>(undefined) : state.world.checker.getPropertyOfType.gen(type, name);
      }),
    );
    const decls = state.declarations(props);
    for (const [at, { key }] of asks.entries()) {
      for (const base of (decls[at] ?? []).filter((decl) => decl !== key && state.decls.has(decl))) {
        state.overrides.push([key, base]);
      }
    }
  }

  // A zod parse of a Drizzle row copies out the columns its output names, so it reads them at the parse method.
  #parses(sites: FileSites): void {
    const state = this.#state;
    const parses = schemaParses(state.world, sites.parses);
    const columns = state.batch(parses.map((call) => parsedColumns(state.world, call)));
    for (const [y, call] of parses.entries()) {
      state.roleAll(state.declarations(columns[y] ?? []).flat(), "read", sites.file, call.expression.end);
    }
  }

  // The types a production parameter is annotated with: a caller may leave their optional members unset.
  #parameterHomes(sites: FileSites): void {
    const state = this.#state;
    for (const keys of state.declarations(state.world.symbolsAt(sites.parameterTypes))) {
      for (const key of keys) {
        state.parameterHomes.add(key);
      }
    }
  }

  // `const [value, setValue] = useState(…)`: the tuple a React state hook hands back.
  #hookTuples(sites: FileSites): void {
    const state = this.#state;
    const callees = state.world.symbolsAt(
      sites.hookTuples.map(({ call }) => (isPropertyAccessExpression(call.expression) ? call.expression.name : call.expression)),
    );
    const reacts = state.world.fromPackage(
      callees.map((callee) => callee?.declarations ?? []),
      REACT_TYPES,
    );
    for (const [x, { elements }] of sites.hookTuples.entries()) {
      const callee = callees[x];
      if (callee === undefined || !STATE_HOOKS.has(callee.name) || reacts[x] !== true) {
        continue;
      }
      const [value, setter] = elements;
      for (const [part, element] of [
        ["value", value],
        ["setter", setter],
      ] as const) {
        if (element !== undefined && element.kind === SyntaxKind.BindingElement) {
          state.stateParts.push({ decl: state.resolver.keyOf(element), part, file: sites.file, line: sites.lineOf(element) });
        }
      }
    }
  }

  // A doc reference is an edge of its own, never liveness; a name that resolves to nothing is a dangling link.
  #docs(sites: FileSites): void {
    const state = this.#state;
    const symbols = state.world.symbolsAt(sites.docNames.map(({ node }) => node));
    const decls = state.declarations(symbols);
    for (const [at, { node, from }] of sites.docNames.entries()) {
      for (const decl of decls[at] ?? []) {
        state.edge("doc", from, decl);
        addAll(this.#fileReaders.readers, decl, [from]);
      }
      if (symbols[at] === undefined) {
        state.danglingDocs.push({ file: sites.file, line: sites.lineOf(node), text: nameText(node) });
      }
    }
  }

  // `{ x }` reads the binding x, not only the property x; `{ schema }` hands a namespace binding on whole.
  #shorthands(sites: FileSites): void {
    const state = this.#state;
    const values = state.world.shorthandValues(sites.shorthands.map(({ node }) => node));
    const decls = state.declarations(values);
    for (const [at, { node, from }] of sites.shorthands.entries()) {
      for (const decl of decls[at] ?? []) {
        state.edge("run", from, decl);
        state.role(decl, "read", sites.file, node.pos);
        addAll(this.#fileReaders.readers, decl, [from]);
      }
    }
    this.#wholeModule(
      sites.shorthands.flatMap(({ from }, at) => {
        const symbol = values[at];
        return symbol !== undefined && (decls[at] ?? []).some(isModuleDecl) ? [{ symbol, from, type: false }] : [];
      }),
    );
  }

  // Destructuring reads each named property of the source's type.
  #patterns(sites: FileSites): void {
    const state = this.#state;
    const types = state.batch(sites.patterns.map((site) => patternSourceType(state.world.checker, site)));
    const asks = sites.patterns.flatMap((site, x) => {
      const type = types[x];
      return type === undefined ? [] : site.names.map((name) => ({ site, type, name }));
    });
    const hits = state.batch(asks.map(({ type, name }) => state.propsOnSlot(type, name)));
    const decls = hits.map((symbols) => state.declarations(symbols).flat());
    const bare = asks.filter((_, y) => (hits[y]?.length ?? 0) > 0 && (decls[y]?.length ?? 0) === 0);
    const walks = state.origins(bare);
    const read = (site: { readonly pattern: Node; readonly from: GraphKey }, keys: readonly DeclKey[]): void => {
      for (const decl of keys) {
        state.edge("run", site.from, decl);
        state.role(decl, "read", sites.file, site.pattern.pos);
      }
    };
    for (const [y, { site }] of asks.entries()) {
      read(site, decls[y] ?? []);
    }
    for (const [y, { site }] of bare.entries()) {
      read(site, walks[y]?.decls ?? []);
    }
  }

  // An import runs its module; a re-export forwards names and runs nothing for the importer. An `import()` whose
  // result is not destructured may pick any export (by a string, a spread, a namespace walk).
  #specifiers(sites: FileSites): void {
    const state = this.#state;
    const { world } = state;
    const symbols = world.symbolsAt(sites.specifiers.map(({ node }) => node));
    const whole: { readonly symbol: NativeSymbol; readonly from: GraphKey }[] = [];
    for (const [at, { node, from, inType }] of sites.specifiers.entries()) {
      const symbol = symbols[at];
      for (const handle of symbol?.declarations ?? []) {
        const file = world.fileOf(handle);
        if (file !== null && !inType && !isExportDeclaration(node.parent)) {
          state.edge("run", from, moduleKey(file));
        }
      }
      if (symbol !== undefined && isCallExpression(node.parent) && !destructured(node.parent)) {
        whole.push({ symbol, from });
      }
    }
    const exports = state.batch(whole.map(({ symbol }) => world.checker.getExportsOfModule.gen(symbol)));
    const flat = whole.flatMap(({ from }, x) => (exports[x] ?? []).map((symbol) => ({ symbol, from })));
    const decls = state.declarations(flat.map(({ symbol }) => symbol));
    for (const [y, { from }] of flat.entries()) {
      for (const decl of decls[y] ?? []) {
        state.edge("run", from, decl);
      }
    }
  }

  // A class member that fills a heritage member is called through it: the type side of a heritage clause is the base's
  // instance type, its value side the base constructor holding the statics. An instance created into a typed slot is
  // used through that slot's type once every class is read.
  #classFacts(sites: FileSites): void {
    const state = this.#state;
    for (const facts of sites.classes) {
      this.#classes.set(facts.key, facts);
      if (facts.heritage.length > 0) {
        this.#dispatch(state.world.typesAt(facts.heritage), facts, "instance");
        const bases = state.world.typesAt(facts.bases.map(({ expression }) => expression));
        this.#dispatch(bases, facts, "static");
        this.#dispatch(state.batch(bases.map((base) => this.#staticSides(base))).flat(), facts, "static");
      }
    }
    const slots = state.contextualTypes(sites.newExpressions);
    const targets = state.declarations(state.world.symbolsAt(sites.newExpressions.map(({ expression }) => expression)));
    for (const [at, slot] of slots.entries()) {
      if (slot !== undefined) {
        this.#pendingSlots.push({ slot, decls: targets[at] ?? [] });
      }
    }
  }

  // The library interfaces that type a library class's static side: each one in the class's own declaration file with a
  // construct signature that builds the class (@types/react's `ComponentClass` builds `Component`, and its
  // `StaticLifecycle` members are the statics React calls). Our own base declares its statics itself.
  *#staticSides(base: Type): APIRequestGenerator<readonly Type[]> {
    const state = this.#state;
    const { checker } = state.world;
    const symbol = yield* base.getSymbol.gen();
    const handle = symbol?.declarations.find((at) => !state.resolver.ours(at));
    if (symbol === undefined || handle === undefined) {
      return [];
    }
    const known = this.#staticSideCache.get(symbol.id);
    if (known !== undefined) {
      return known;
    }
    const declaration = yield* handle.resolve.gen();
    const builders = declaration === undefined ? [] : constructingInterfaces(declaration.getSourceFile(), symbol.name);
    const types: Type[] = [];
    for (const builder of builders) {
      types.push(yield* checker.getTypeAtLocation.gen(builder.name));
    }
    this.#staticSideCache.set(symbol.id, types);
    return types;
  }

  // A class member that fills a member of these types is used through it, and supplies that member as a literal's key
  // does; one whose filled member is the platform's (declared outside the tree), or a generic slot inferred from the class
  // itself, is called by code we do not see.
  #dispatch(types: readonly (Type | undefined)[], facts: ClassFacts, side: "instance" | "static"): void {
    const state = this.#state;
    const members = [...(side === "instance" ? facts.members : facts.statics)];
    const asks = types.flatMap((type) => (type === undefined ? [] : members.map(([name, key]) => ({ type, name, key }))));
    const props = state.batch(asks.map(({ type, name }) => state.world.checker.getPropertyOfType.gen(type, name)));
    const decls = state.declarations(props);
    for (const [y, { key }] of asks.entries()) {
      const others = (decls[y] ?? []).filter((decl) => decl !== key);
      const ours = others.filter((decl) => state.decls.has(decl));
      for (const other of ours) {
        state.edge("run", other, key);
        state.role(other, "write", declKeyParts(key).file, declaredNameOf(state.world, key)?.pos ?? declKeyParts(key).pos);
        state.count("dispatch edges");
      }
      if (ours.length < others.length || (others.length === 0 && props[y] !== undefined)) {
        state.edge("run", facts.key, key);
        state.unseenCalls.add(key);
        state.count("platform-called members");
      }
    }
  }

  // Object literal methods: filled for a contextual type's member, or the platform's to call, or reached by their name;
  // a library member's declaration is no node the walk reaches, so the literal's container carries the edge.
  // A member its slot does not name (an excess property, a slot the checker cannot read) lives with its container.
  #literals(sites: FileSites): void {
    const state = this.#state;
    const literals = sites.literals.filter(({ members }) => members.size > 0);
    const slots = state.contextualTypes(literals.map(({ node }) => node));
    const asks = literals.flatMap((literal, x) => [...literal.members].map(([name, key]) => ({ literal, slot: slots[x], name, key })));
    const props = state.batch(asks.map(({ slot, name }) => (slot === undefined ? answer(undefined) : state.world.checker.getPropertyOfType.gen(slot, name))));
    const decls = state.declarations(props);
    for (const [y, { literal, key }] of asks.entries()) {
      const filled = (decls[y] ?? []).filter((decl) => decl !== key);
      const ours = filled.filter((decl) => state.decls.has(decl));
      for (const other of ours) {
        state.edge("run", other, key);
      }
      if (ours.length === 0) {
        state.edge("run", literal.container, key);
      }
      // a member that fills a library's declared member (Node's `WritableOptions.write`) is the library's to call
      if (ours.length < filled.length) {
        state.unseenCalls.add(key);
        state.count("platform-called members");
      }
    }
  }

  // JSDoc tags as the checker reads them: a knip keep tag is a ruling.
  #tags(sites: FileSites): void {
    const state = this.#state;
    const { checker } = state.world;
    // getSymbolOfNode, not getSymbolOfDeclaration: a declaration that binds a pattern (`const { a } = …`) has no symbol,
    // and getSymbolOfDeclaration hands back null there although its type says it never does
    const symbols = state.batch(sites.tagged.map((node) => checker.getSymbolOfNode.gen(node)));
    const tags = state.batch(symbols.map((symbol) => (symbol === undefined ? answer<readonly JSDocTagInfo[]>([]) : checker.getJsDocTagsOfSymbol.gen(symbol))));
    for (const [at, node] of sites.tagged.entries()) {
      const info = state.decls.get(state.resolver.keyOf(node));
      if (info !== undefined) {
        info.docTags = (tags[at] ?? []).map(({ name }) => name);
      }
    }
  }

  // A class handed on as a value: through a typed slot its statics fill the slot and its instances fill what the slot
  // constructs; with no type to fill, or a slot that does not say what it constructs, anything may call its members.
  #settleClasses(): void {
    const state = this.#state;
    const { checker } = state.world;
    for (const { slot, decls } of this.#pendingSlots) {
      for (const facts of decls.flatMap((decl) => this.#classes.get(decl) ?? [])) {
        this.#dispatch([slot], facts, "instance");
      }
    }
    const typed = this.#pendingValues.filter(({ slot }) => slot !== undefined);
    const constructs = state.batch(typed.map(({ slot }) => (slot === undefined ? answer([]) : checker.getSignaturesOfType.gen(slot, SignatureKind.Construct))));
    const instances = state.batch(
      constructs.map(([signature]) => (signature === undefined ? answer(undefined) : checker.getReturnTypeOfSignature.gen(signature))),
    );
    const routed = new Set<PendingClass>();
    for (const [at, pending] of typed.entries()) {
      for (const facts of pending.decls.flatMap((decl) => this.#classes.get(decl) ?? [])) {
        this.#dispatch([pending.slot], facts, "static");
        if (instances[at] !== undefined) {
          this.#dispatch([instances[at]], facts, "instance");
          routed.add(pending);
        }
      }
    }
    for (const pending of this.#pendingValues.filter((entry) => !routed.has(entry))) {
      for (const facts of pending.decls.flatMap((decl) => this.#classes.get(decl) ?? [])) {
        for (const member of [...facts.members.values(), ...facts.statics.values()]) {
          state.edge("run", facts.key, member);
        }
        state.count("class values escaped");
      }
    }
  }

  // Files whose every export is kept, resolved through their export aliases to the declarations they publish.
  #kept(files: readonly string[]): readonly KeptExport[] {
    const state = this.#state;
    const { checker } = state.world;
    const judged = new Set(files);
    const keptFiles = [...state.roots.exportsKept].filter(([file]) => judged.has(file));
    const modules = state.batch(keptFiles.map(([file]) => checker.getSymbolOfSourceFile.gen(join(state.root, file))));
    const exports = state.batch(modules.map((symbol) => (symbol === undefined ? answer([]) : checker.getExportsOfModule.gen(symbol))));
    return keptFiles.flatMap(([, reason], at) =>
      state
        .declarations(exports[at] ?? [])
        .flat()
        .map((decl) => ({ decl, kind: reason.kind, why: reason.why })),
    );
  }
}

// Each binding a name site resolves to, as read by the site's declaration, or written when the site only writes.
function nameReaders(
  names: readonly NameSite[],
  declsAt: (at: number) => readonly DeclKey[],
): { readonly readers: Map<DeclKey, Set<GraphKey>>; readonly written: Set<DeclKey> } {
  const readers = new Map<DeclKey, Set<GraphKey>>();
  const written = new Set<DeclKey>();
  for (const [at, site] of names.entries()) {
    if (site.declares) {
      continue;
    }
    const reads = site.inType || site.roles.some((role) => role !== "write");
    for (const decl of declsAt(at)) {
      if (reads) {
        addAll(readers, decl, [site.from]);
      } else {
        written.add(decl);
      }
    }
  }
  return { readers, written };
}

const nameText = (node: Node): string => ("text" in node && typeof node.text === "string" ? node.text : "");

// `ns.member` and `ns.Type` resolve alone; only a bare use hands the namespace on.
function namesAMember(node: Node): boolean {
  const { parent } = node;
  return (isPropertyAccessExpression(parent) && sameNode(parent.expression, node)) || (isQualifiedName(parent) && sameNode(parent.left, node));
}

// `const { a } = await import("./x")` picks names; any other use of the module object may pick any export.
function destructured(call: Node): boolean {
  const up = isAwaitExpression(call.parent) ? call.parent.parent : call.parent;
  return isVariableDeclaration(up) && isObjectBindingPattern(up.name);
}

// A key a stored literal sets, by its write's index, with the reads its value copies into the column the key names.
interface StoredKey {
  readonly at: number;
  readonly name: PropertyName;
  readonly reads: readonly Node[];
}

// A whole value a Drizzle write stores, by the write's index, with the builder method that stores it.
interface StoredWhole {
  readonly at: number;
  readonly value: Node;
  readonly method: Node;
}

// What each Drizzle write stores, by the write's index: the keys its literal sets, and the whole values it stores, a
// spread into the literal among them.
function storedParts(stores: readonly StoreWrite[]): { readonly keys: readonly StoredKey[]; readonly wholes: readonly StoredWhole[] } {
  const keys: StoredKey[] = [];
  const wholes: StoredWhole[] = [];
  for (const [at, { value, at: method }] of stores.entries()) {
    if (!isObjectLiteralExpression(value)) {
      wholes.push({ at, value: isSpreadElement(value) ? value.expression : value, method });
      continue;
    }
    wholes.push(...value.properties.flatMap((property) => (isSpreadAssignment(property) ? [{ at, value: property.expression, method }] : [])));
    keys.push(...value.properties.flatMap((property) => storedKey(at, property)));
  }
  return { keys, wholes };
}

// A stored literal's key and the reads it copies; a shorthand key copies a local binding, which is no member.
function storedKey(at: number, property: Node): readonly StoredKey[] {
  if (isShorthandPropertyAssignment(property) && isPropertyName(property.name)) {
    return [{ at, name: property.name, reads: [] }];
  }
  return isPropertyAssignment(property) && isPropertyName(property.name) ? [{ at, name: property.name, reads: copiedReads(property.initializer) }] : [];
}

// The column a stored key names on its table.
function* columnOf(checker: Checker, table: Type | undefined, name: string): APIRequestGenerator<NativeSymbol | undefined> {
  return table === undefined ? undefined : yield* checker.getPropertyOfType.gen(table, name);
}

// Each member of a stored value, a list's through its element type, beside the same-named column of the table.
function* storedMembers(
  state: GraphState,
  table: Type | undefined,
  value: Type | undefined,
): APIRequestGenerator<readonly { readonly member: NativeSymbol; readonly column: NativeSymbol }[]> {
  if (table === undefined || value === undefined) {
    return [];
  }
  const { checker } = state.world;
  const type = yield* checker.getNonNullableType.gen(value);
  const element = (yield* checker.isArrayType.gen(type)) && type.isTypeReference() ? (yield* checker.getTypeArguments.gen(type))[0] : undefined;
  const out: { readonly member: NativeSymbol; readonly column: NativeSymbol }[] = [];
  for (const arm of yield* constituentsOf(element ?? type)) {
    for (const member of yield* state.membersOf(arm)) {
      const column = yield* checker.getPropertyOfType.gen(table, member.name);
      if (column !== undefined) {
        out.push({ member, column });
      }
    }
  }
  return out;
}
