// The reference graph of the merged program: every name resolved to its declarations, every edge typed run, type or doc,
// and every member's roles, from one walk of each judged file and the checker passes after it.
//
// - The program is the merged in-memory program over every typecheck world (worlds.ts mergedConfigText); no tsconfig file
//   holds it. The judged population is knip's: a workspace's `project` files, a derived root, or a root-level file.
// - Our own ambient declarations are walked like code, so each global they declare is a node its uses reach; the
//   published plugin SDK's declarations are its own surface and are read as a door (plugin-surface.ts) instead.
// - A role comes from what an occurrence's syntax does (roles.ts referenceRoles); roles.ts states the escape and bump
//   rulings, and analyse.ts the test-read ruling.
import { existsSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import type { Node } from "@typescript/native/ast";
import {
  isAwaitExpression,
  isCallExpression,
  isExportDeclaration,
  isIdentifier,
  isObjectBindingPattern,
  isPropertyAccessExpression,
  isQualifiedName,
  isVariableDeclaration,
  SyntaxKind,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Checker, JSDocTagInfo, Symbol as NativeSymbol, NodeHandle, Type } from "@typescript/native/sync";
import { SignatureKind } from "@typescript/native/sync";
import { NativeWorld } from "../native.ts";
import type { SdkSurface } from "../plugin-surface.ts";
import { PUBLISHED_SDK, sdkSurface } from "../plugin-surface.ts";
import { Flows } from "./flows.ts";
import { Keys } from "./keys.ts";
import { keySources, lostSlot, NO_KEY, packagesOf } from "./lost.ts";
import type { DeclKey } from "./resolve.ts";
import { answer } from "./resolve.ts";
import { sameNode } from "./roles.ts";
import type { RootKind, Roots } from "./roots.ts";
import type { ClassFacts, FileSites, GraphKey, ModuleKey, NameSite, PatternRoute, WalkSink } from "./sites.ts";
import { collectSites, moduleKey } from "./sites.ts";
import { fileSlotWrites } from "./slots.ts";
import { fileSpellings } from "./spellings.ts";
import type { BuildSession, GraphFacts, LostCause } from "./state.ts";
import { GraphState } from "./state.ts";
import type { VariantAxis } from "./variants.ts";
import { Variants } from "./variants.ts";
import type { WhyEntry } from "./why.ts";

const CODE_FILE = /\.(?:m|c)?[jt]sx?$/u;
// The hooks that hand back a `[value, setter]` tuple, confirmed against React's own declarations.
const STATE_HOOKS: ReadonlySet<string> = new Set(["useState", "useReducer", "useOptimistic", "useActionState"]);
const REACT_TYPES = "@types/react";
const TYPE_DECLARATIONS: ReadonlySet<SyntaxKind> = new Set([SyntaxKind.InterfaceDeclaration, SyntaxKind.TypeAliasDeclaration]);

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
  readonly kept: readonly KeptExport[];
  readonly sdk: SdkSurface;
  readonly urlSpawns: readonly UrlSpawn[];
  readonly files: readonly string[];
}

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
  const graph = new Builder(state).build();
  return { graph, why: state.why?.entries(state.decls) ?? [] };
}

// The walk reports its progress every this many files.
const PROGRESS_EVERY = 1000;

class Builder {
  readonly #state: GraphState;
  readonly #variants: Variants;
  readonly #flows: Flows;
  readonly #keys: Keys;
  readonly #classes = new Map<DeclKey, ClassFacts>();
  readonly #pendingSlots: PendingClass[] = [];
  readonly #pendingValues: PendingClass[] = [];
  readonly #urlSpawns: UrlSpawn[] = [];

  constructor(state: GraphState) {
    this.#state = state;
    this.#variants = new Variants(state.session);
    this.#flows = new Flows(this.#state);
    this.#keys = new Keys(this.#state);
  }

  build(): Graph {
    const state = this.#state;
    const { roots, world } = state;
    const { files: only } = state.session.options;
    const files = world.files
      .map((source) => world.fileOfSource(source))
      .filter((file) => (roots.inProject(file) || roots.modules.has(file) || dirname(file) === ".") && (only === null || file.startsWith(only)));
    const { profile } = state.session;
    const walk = (): void => this.#walk(files);
    const settle = (): readonly VariantAxis[] => {
      this.#settleClasses();
      this.#keys.finish(this.#flows);
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
      urlModule: (from, specifier): string | null => {
        const target = normalize(join(dirname(from), specifier));
        return CODE_FILE.test(target) && existsSync(join(state.root, target)) ? target : null;
      },
    };
  }

  #file(sites: FileSites): void {
    const state = this.#state;
    this.#names(sites);
    fileSlotWrites(state, this.#variants, sites);
    this.#flows.file(sites);
    this.#variants.readTables(state, sites.tvCalls, sites.file);
    this.#keys.file(sites);
    this.#zodTwins(sites);
    this.#hookTuples(sites);
    this.#docs(sites);
    this.#shorthands(sites);
    this.#patterns(sites);
    this.#specifiers(sites);
    this.#classFacts(sites);
    this.#literals(sites);
    this.#tags(sites);
    fileSpellings(state, sites);
    state.cssNames.push(...sites.cssNames);
    // a module loaded by path (a Worker, a child process) runs as its own entry, kept alive by what spawns it
    for (const { target, from } of sites.urlModules) {
      state.edge("run", from, moduleKey(target));
      this.#urlSpawns.push({ module: moduleKey(target), from: sites.file });
    }
  }

  // Each name resolves to its declarations: an edge from the declaration it sits in, and the roles its syntax gives.
  #names(sites: FileSites): void {
    const state = this.#state;
    const symbols = state.world.symbolsAt(sites.names.map(({ node }) => node));
    const resolved = state.declarations(symbols);
    for (const [at, site] of sites.names.entries()) {
      this.#use(site, resolved[at] ?? [], sites.file);
    }
    this.#bareReads(sites, symbols, resolved);
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
      return decls.length === 0 && walks[at]?.end !== "library";
    });
    this.#libraryLandings(
      sites,
      lost.flatMap(({ site, at }, y) => ((annotated[y]?.decls.length ?? 0) === 0 && walks[at]?.end === "library" ? [{ site, stops: walks[at].stops }] : [])),
    );
    const reasons = state.batch(still.map(({ type, name }) => state.resolver.unbackedReason(type, name)));
    const unplaced = still.filter((_, y) => reasons[y] === null || reasons[y] === undefined);
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

  // The bare reads a library's own declaration answered, by the packages their walks stopped at.
  #libraryLandings(sites: FileSites, landed: readonly { readonly site: NameSite; readonly stops: readonly NodeHandle[] }[]): void {
    const state = this.#state;
    const packages = state.batch(landed.map(({ stops }) => packagesOf(state.world, stops)));
    for (const [at, { site }] of landed.entries()) {
      state.libraryLandings.push({ where: `${sites.file}:${String(sites.lineOf(site.node))}`, member: nameText(site.node), packages: packages[at] ?? [] });
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

  // `z.strictObject({ … }) satisfies z.ZodType<T>`: the schema's keys are T's members, one member each.
  #zodTwins(sites: FileSites): void {
    const state = this.#state;
    if (state.session.options.ablate.has("zod-twins")) {
      return;
    }
    const shapes = state.world.typedAt(sites.zodTwins, ({ shape }) => shape);
    const asks = shapes.flatMap(({ item: { keys }, type }) => keys.map((key) => ({ type, name: key.name, decl: key.decl })));
    const members = state.slotMembers(asks);
    for (const [y, ask] of asks.entries()) {
      for (const member of members[y] ?? []) {
        state.twins.push([ask.decl, member]);
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
        this.#dispatch(state.world.typesAt(facts.heritage.map(({ expression }) => expression)), facts, "static");
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

  // A class member that fills a member of these types is used through it; one whose filled member is the platform's
  // (declared outside the tree), or a generic slot inferred from the class itself, is called by code we do not see.
  #dispatch(types: readonly (Type | undefined)[], facts: ClassFacts, side: "instance" | "static"): void {
    const state = this.#state;
    const members = [...(side === "instance" ? facts.members : facts.statics)];
    const asks = types.flatMap((type) => (type === undefined ? [] : members.map(([name, key]) => ({ type, name, key }))));
    const props = state.batch(asks.map(({ type, name }) => state.world.checker.getPropertyOfType.gen(type, name)));
    const decls = state.declarations(props);
    for (const [y, { key }] of asks.entries()) {
      const others = (decls[y] ?? []).filter((decl) => decl !== key);
      for (const other of others) {
        state.edge("run", other, key);
        state.count("dispatch edges");
      }
      if (others.length === 0 && props[y] !== undefined) {
        state.edge("run", facts.key, key);
        state.count("platform-called members");
      }
    }
  }

  // Object literal methods: filled for a contextual type's member, or the platform's to call, or reached by their name.
  // A member its slot does not name (an excess property, a slot the checker cannot read) lives with its container.
  #literals(sites: FileSites): void {
    const state = this.#state;
    const literals = sites.literals.filter(({ members }) => members.size > 0);
    const slots = state.contextualTypes(literals.map(({ node }) => node));
    const asks = literals.flatMap((literal, x) => [...literal.members].map(([name, key]) => ({ literal, slot: slots[x], name, key })));
    const props = state.batch(asks.map(({ slot, name }) => (slot === undefined ? answer(undefined) : state.world.checker.getPropertyOfType.gen(slot, name))));
    const decls = state.declarations(props);
    for (const [y, { literal, key }] of asks.entries()) {
      const ours = (decls[y] ?? []).filter((decl) => decl !== key);
      for (const other of ours) {
        state.edge("run", other, key);
      }
      if (ours.length === 0) {
        state.edge("run", literal.container, key);
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
