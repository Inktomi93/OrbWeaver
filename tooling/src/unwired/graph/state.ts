// The reference graph under construction and the checker helpers every pass shares: one program, one resolver, one
// set of caches. A pass reads sites a file's walk collected and writes edges and roles here.
//
// A role is kept by world: what product code does to a member decides the product buckets; what tests, tooling and
// scripts do only annotates them, so a field only a test reads is still unread by the product.
// - Owner ruling: snap (tooling/src/snap/) drives the product as its user does, so its read of a member is a product
//   read, as a dev-bridge read is (analyse.ts); its other roles, and every other tool's, only annotate.
import type { Expression } from "@typescript/native/ast";
import { SyntaxKind } from "@typescript/native/ast";
import type { APIRequestGenerator, Symbol as NativeSymbol, Type } from "@typescript/native/sync";
import { TypeFlags } from "@typescript/native/sync";
import type { NativeWorld } from "../native.ts";
import { hasFlag } from "../native.ts";
import type { Destination } from "../open-sends.ts";
import { isProduction } from "../worlds.ts";
import type { GraphOptions } from "./options.ts";
import type { GraphProfile } from "./profile.ts";
import type { DeclKey, OriginWalk } from "./resolve.ts";
import { answer, constituentsOf, declKeyParts, EXHAUSTED, Resolver } from "./resolve.ts";
import type { Role, RoleSet } from "./roles.ts";
import { NO_ROLES, READS, withRoles } from "./roles.ts";
import type { Roots } from "./roots.ts";
import type { DeclInfo, GraphKey, LocalBinding } from "./sites.ts";
import { MEMBER_KINDS } from "./sites.ts";
import { siteLine, WhyTracker } from "./why.ts";

/** What the code does to one member: the product's roles, every other world's, and the product's first write. */
export interface MemberRoles {
  product: RoleSet;
  other: RoleSet;
  write: string | null;
}

const LITERAL_KEY_KINDS: ReadonlySet<SyntaxKind> = new Set([SyntaxKind.PropertyAssignment, SyntaxKind.ShorthandPropertyAssignment]);

/** A send no destination was found for, or one made at no position. */
export const UNCLASSIFIED: Destination = { destination: "unclassified", receiver: null };

/** One role a declaration was given and the site that gave it; an escape site names where the value went. */
export type RoleSite =
  | { readonly role: Exclude<Role, "escape">; readonly file: string; readonly at: number }
  | ({ readonly role: "escape"; readonly file: string; readonly at: number } & Destination);

/** Where snap lives: it drives the product as its user does, so its reads and its requests are the product's. */
export const SNAP_SOURCE = "tooling/src/snap/";
const TEST_SOURCE = "tests/";

/** Whether a read at a repository-relative file counts as the product's: the product's own, or snap's. */
export const productReader = (file: string): boolean => isProduction(file) || file.startsWith(SNAP_SOURCE);

/** Whether a repository-relative file is one of the tree's tests or their testkit. */
export const testSource = (file: string): boolean => file.startsWith(TEST_SOURCE);

/** Directed edges between graph nodes. */
export type Edges = Map<GraphKey, Set<GraphKey>>;
/** Edges as the analysis reads them. */
export type ReadonlyEdges = ReadonlyMap<GraphKey, ReadonlySet<GraphKey>>;

/** An axis's home: an `as const` tuple or a literal-union alias, by its sorted members. */
export interface UnionHome {
  readonly members: readonly string[];
  readonly where: string;
}

/** A string-literal union of more members than a two-state alias, written inline in a product type position. */
export interface InlineUnion {
  readonly members: readonly string[];
  readonly file: string;
  readonly line: number;
  /** The nearest named declaration around it. */
  readonly context: string;
}

/** The registry sites the graph reads: a function a rule exempts, or a ruled joint-batch op. */
export const REGISTRY_KINDS = ["site", "op"] as const;
export type RegistryKind = (typeof REGISTRY_KINDS)[number];

/** A site an ESLint rule names: a function by its file and name, or a ruled op by its owning domain and name. */
export interface RegistrySite {
  readonly kind: RegistryKind;
  readonly file: string;
  readonly line: number;
  /** The file a function site names, or the domain that owns an op. */
  readonly target: string;
  readonly name: string;
}

const LOST_SOURCES = ["named-union", "inline-union", "no-literal-key"] as const;

/**
 * Where a lost read lands, read off the read's own symbol and its receiver's type, first match wins: a receiver typed
 * any or unknown, a receiver that is a type parameter, a member bound late from a computed key, an index signature's
 * member, a member a call inferred through a mapped type (reverse-mapped), a mapped type's member, a member only a
 * library declares, a union's or intersection's merged member, an instantiated member with no declaration, and the rest.
 */
const LOST_SLOTS = [
  "any-receiver",
  "type-parameter",
  "late-bound",
  "index-signature",
  "reverse-mapped",
  "mapped-member",
  "library-member",
  "synthetic",
  "instantiated",
  "no-declaration",
] as const;
export type LostSlot = (typeof LOST_SLOTS)[number];

/** What a lost read's key source walk found: a named literal union (an axis with a home), an inline literal set, or nothing. */
export interface LostKey {
  readonly source: (typeof LOST_SOURCES)[number];
  readonly alias: string | null;
  readonly members: readonly string[];
}

/** Why a read was lost: its key's source, the slot it lands in, and the receiver it was read from. */
export interface LostCause extends LostKey {
  readonly read: string;
  /** `file:line`, for a sample a reader can open. */
  readonly where: string;
  readonly slot: LostSlot;
  /** The packages that declare the read's member, joined; null when the tree or nothing declares it. */
  readonly detail: string | null;
  /** The receiver's type by its alias or symbol name, then the package or file that declares it. */
  readonly receiver: string;
}

/** A read whose walk ended at a library's own declaration: the library owns the member, so the read is not lost. */
export interface LibraryLanding {
  readonly where: string;
  readonly member: string;
  /** The packages whose declarations ended the walk. */
  readonly packages: readonly string[];
}

/** One half of a React state tuple, at the site that holds it. */
export interface StatePart {
  readonly decl: DeclKey;
  readonly part: "value" | "setter";
  readonly file: string;
  readonly line: number;
}

/** A custom-property name a script holds, with the member that holds it and the entry it was read from. */
export interface CssName {
  readonly holder: DeclKey;
  readonly entry: DeclKey | null;
  readonly name: string;
}

/** A doc link whose target is declared nowhere. */
export interface DanglingDoc {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

/** The data a built graph hands its analysis: no world and no method, so a dump (./dump.ts) carries it whole. */
/** The doors a message can cross (message-doors.ts): the names {@link MessageReceiver.door} reports. */
const MESSAGE_DOORS = ["worker", "ipc", "broadcast", "emitter", "diagnostics", "window"] as const;
export type MessageDoor = (typeof MESSAGE_DOORS)[number];

/** A receiver no send reaches through its door. */
/** A module load no edge follows: `import(x)` or a createRequire function called with a computed path. */
export interface ComputedLoad {
  readonly file: string;
  readonly line: number;
  readonly argument: string;
}

/** A route path's `:name` segment no handler of the route reads. */
export interface RouteParam {
  readonly file: string;
  readonly line: number;
  readonly path: string;
  readonly param: string;
}

export interface MessageReceiver {
  readonly file: string;
  readonly line: number;
  readonly door: MessageDoor;
}

/** A binding as binding-unread and binding-read-only-by-dead judge it: where it sits, what holds it, which
 *  declarations' code reads it, and whether anything writes it. */
export interface BindingFact extends LocalBinding {
  readonly file: string;
  readonly holder: GraphKey;
  readonly readers: readonly GraphKey[];
  readonly written: boolean;
}

export interface GraphFacts {
  readonly decls: ReadonlyMap<DeclKey, DeclInfo>;
  readonly run: ReadonlyEdges;
  readonly typ: ReadonlyEdges;
  readonly doc: ReadonlyEdges;
  readonly roles: ReadonlyMap<DeclKey, MemberRoles>;
  /** Every role site of a declaration whose file starts with one of the build's {@link BuildSession.siteFiles}, for a verb that counts and inspects sites. */
  readonly roleSites: ReadonlyMap<DeclKey, readonly RoleSite[]>;
  /** The types a production parameter is annotated with: a caller may leave their optional members unset. */
  readonly parameterHomes: ReadonlySet<DeclKey>;
  readonly flows: ReadonlyMap<DeclKey, ReadonlySet<DeclKey>>;
  /** Drizzle column hand-offs, column to the stored member: a read of the column reads the member, and a send of the
   *  column, which hands the library its definition, sends no stored value. */
  readonly columnFlows: ReadonlyMap<DeclKey, ReadonlySet<DeclKey>>;
  readonly door: ReadonlySet<DeclKey>;
  /** Members code we do not see calls: a platform-dispatched override, a runtime protocol member. */
  readonly unseenCalls: ReadonlySet<DeclKey>;
  /** Each local binding, parameter and import binding with the declarations whose code reads it. */
  readonly bindings: readonly BindingFact[];
  /** Message receivers no send reaches through their door (message-doors.ts). */
  readonly unpairedReceivers: readonly MessageReceiver[];
  readonly computedLoads: readonly ComputedLoad[];
  readonly unreadRouteParams: readonly RouteParam[];
  readonly twins: readonly (readonly [DeclKey, DeclKey])[];
  readonly stateParts: readonly StatePart[];
  readonly cssNames: readonly CssName[];
  readonly pins: readonly DeclKey[];
  readonly danglingDocs: readonly DanglingDoc[];
  readonly lostReads: readonly string[];
  readonly counts: ReadonlyMap<string, number>;
  /** The largest value each measure reached, such as the deepest level an origin walk found its home on. */
  readonly peaks: ReadonlyMap<string, number>;
  readonly roots: Pick<Roots, "modules" | "keepTags">;
  readonly unionHomes: readonly UnionHome[];
  readonly inlineUnions: readonly InlineUnion[];
  readonly registrySites: readonly RegistrySite[];
  /** Every name the server's source spells, declared or used: what a ruled op can be keyed by. */
  readonly serverNames: ReadonlySet<string>;
  /** Each lost read's key source, in {@link GraphFacts.lostReads} order. */
  readonly lostCauses: readonly LostCause[];
  /** The bare reads whose walk ended at a library's own declaration. */
  readonly libraryLandings: readonly LibraryLanding[];
}

/** What one build runs under: the session's options, its log, and its profile when one is asked for. */
export interface BuildSession {
  readonly options: GraphOptions;
  readonly log: (line: string) => void;
  readonly profile: GraphProfile | null;
  /** The file prefixes whose declarations keep every role site. */
  readonly siteFiles: readonly string[];
  /** Keep every role site of each production member too: the sites a member row's sort and literal search read. */
  readonly memberSites: boolean;
}

/** The value types whose apparent type is a lib wrapper interface: they carry no member of ours. */
const PRIMITIVE_FLAGS = [
  TypeFlags.StringLike,
  TypeFlags.NumberLike,
  TypeFlags.BigIntLike,
  TypeFlags.BooleanLike,
  TypeFlags.ESSymbolLike,
  TypeFlags.Void,
  TypeFlags.Undefined,
  TypeFlags.Null,
  TypeFlags.Never,
] as const;

export const isPrimitive = (type: Type): boolean => PRIMITIVE_FLAGS.some((flag) => hasFlag(type.flags, flag));

const addEdge = <K extends GraphKey>(edges: Map<K, Set<K>>, from: K, to: K): void => {
  if (from === to) {
    return;
  }
  const out = edges.get(from) ?? new Set<K>();
  out.add(to);
  edges.set(from, out);
};

/** The graph a build writes and its analysis reads. */
export class GraphState implements GraphFacts {
  readonly root: string;
  #world: NativeWorld;
  #resolver: Resolver;
  readonly roots: Roots;
  readonly session: BuildSession;
  readonly why: WhyTracker | null;
  readonly decls = new Map<DeclKey, DeclInfo>();
  readonly run: Edges = new Map();
  readonly typ: Edges = new Map();
  readonly doc: Edges = new Map();
  readonly roles = new Map<DeclKey, MemberRoles>();
  readonly roleSites = new Map<DeclKey, RoleSite[]>();
  readonly parameterHomes = new Set<DeclKey>();
  /** Member flows, slot member to the value member that fills it. */
  readonly flows = new Map<DeclKey, Set<DeclKey>>();
  readonly columnFlows = new Map<DeclKey, Set<DeclKey>>();
  /** The members a value published to a global our own `declare global` declares holds: the dev bridge's surface. */
  readonly door = new Set<DeclKey>();
  readonly unseenCalls = new Set<DeclKey>();
  readonly bindings: BindingFact[] = [];
  readonly unpairedReceivers: MessageReceiver[] = [];
  readonly computedLoads: ComputedLoad[] = [];
  readonly unreadRouteParams: RouteParam[] = [];
  /** A zod schema key and the member of the type it `satisfies z.ZodType<T>`: one member, roles merged both ways. */
  readonly twins: (readonly [DeclKey, DeclKey])[] = [];
  readonly stateParts: StatePart[] = [];
  readonly cssNames: CssName[] = [];
  readonly pins: DeclKey[] = [];
  readonly danglingDocs: DanglingDoc[] = [];
  readonly lostReads: string[] = [];
  readonly counts = new Map<string, number>();
  readonly peaks = new Map<string, number>();
  readonly unionHomes: UnionHome[] = [];
  readonly inlineUnions: InlineUnion[] = [];
  readonly registrySites: RegistrySite[] = [];
  readonly serverNames = new Set<string>();
  readonly lostCauses: LostCause[] = [];
  readonly libraryLandings: LibraryLanding[] = [];
  readonly #product = new Map<string, boolean>();
  readonly #origins = new Map<string, OriginWalk>();
  readonly #members = new Map<number, readonly DeclKey[]>();

  constructor(root: string, world: NativeWorld, roots: Roots, session: BuildSession) {
    this.root = root;
    this.#world = world;
    this.#resolver = new Resolver(world, { spelling: !session.options.ablate.has("spelling") });
    this.roots = roots;
    this.session = session;
    this.why = session.options.why.length > 0 ? new WhyTracker(world, session.options.why) : null;
  }

  /** The program the build walks now. */
  get world(): NativeWorld {
    return this.#world;
  }

  get resolver(): Resolver {
    return this.#resolver;
  }

  /** Walk another program into the same facts: a declaration keeps its key across programs, as a key is its file and
   *  position, while every cache keyed by a type or symbol id belongs to the program that answered it. */
  enter(world: NativeWorld): void {
    this.#world = world;
    this.#resolver = new Resolver(world, { spelling: !this.session.options.ablate.has("spelling") });
    this.#origins.clear();
    this.#members.clear();
  }

  /** Whether a repository-relative file ships in the product. */
  product(file: string): boolean {
    let known = this.#product.get(file);
    if (known === undefined) {
      known = isProduction(file);
      this.#product.set(file, known);
    }
    return known;
  }

  edge(map: "run" | "typ" | "doc", from: GraphKey, to: GraphKey): void {
    addEdge(this[map], from, to);
  }

  flow(slot: DeclKey, value: DeclKey): void {
    addEdge(this.flows, slot, value);
  }

  columnFlow(column: DeclKey, member: DeclKey): void {
    addEdge(this.columnFlows, column, member);
  }

  role(key: DeclKey, role: Role, file: string, at: number): void {
    this.#record(key, role === "escape" ? { role, file, at, ...UNCLASSIFIED } : { role, file, at });
  }

  /** Every key escapes at one site, sent where `send` names. */
  escapeAll(keys: Iterable<DeclKey>, site: { readonly file: string; readonly at: number }, send: Destination): void {
    for (const key of keys) {
      this.#record(key, { role: "escape", ...site, ...send });
    }
  }

  #record(key: DeclKey, site: RoleSite): void {
    const { role, file, at } = site;
    this.why?.note(key, role, file, at);
    if (this.keepsSites(key)) {
      const sites = this.roleSites.get(key) ?? [];
      sites.push(site);
      this.roleSites.set(key, sites);
    }
    const roles = this.roles.get(key) ?? { product: NO_ROLES, other: NO_ROLES, write: null };
    if (this.product(file) || (READS.has(role) && productReader(file))) {
      roles.product = withRoles(roles.product, [role]);
      if (role === "write" && roles.write === null) {
        roles.write = `${file}:${String(siteLine(this.world, file, at))}`;
      }
    } else {
      roles.other = withRoles(roles.other, [role]);
    }
    this.roles.set(key, roles);
  }

  roleAll(keys: Iterable<DeclKey>, role: Role, file: string, at: number): void {
    for (const key of keys) {
      this.role(key, role, file, at);
    }
  }

  /** Each ask's slot members take `role` at the ask's own site. */
  roleNamed(asks: readonly { readonly type: Type; readonly name: string; readonly at: number }[], role: Role, file: string): void {
    const members = this.slotMembers(asks);
    for (const [y, { at }] of asks.entries()) {
      this.roleAll(members[y] ?? [], role, file, at);
    }
  }

  /** Every member of each type takes `role` at that type's own site. */
  roleWhole(wholes: readonly { readonly type: Type; readonly at: number }[], role: Role, file: string): void {
    const members = this.memberDeclarations(wholes.map(({ type }) => type));
    for (const [y, { at }] of wholes.entries()) {
      this.roleAll(members[y] ?? [], role, file, at);
    }
  }

  /** Whether the build keeps every role site of `key`: a declaration under a site prefix, or a production member when
   *  the session keeps member sites. */
  keepsSites(key: DeclKey): boolean {
    if (this.session.siteFiles.some((prefix) => key.startsWith(prefix))) {
      return true;
    }
    if (!this.session.memberSites) {
      return false;
    }
    const { file, kind } = declKeyParts(key);
    // a literal key is a member when it is a zod schema's, which only its declaration says; keep every one's sites
    return (MEMBER_KINDS.has(kind) || LITERAL_KEY_KINDS.has(kind)) && this.product(file);
  }

  count(name: string, by = 1): void {
    this.counts.set(name, (this.counts.get(name) ?? 0) + by);
  }

  peak(name: string, value: number): void {
    this.peaks.set(name, Math.max(this.peaks.get(name) ?? value, value));
  }

  batch<T>(requests: readonly APIRequestGenerator<T>[]): T[] {
    return this.world.batch(requests);
  }

  declarations(symbols: readonly (NativeSymbol | undefined)[]): DeclKey[][] {
    return this.resolver.declarations(symbols);
  }

  /** Each type with undefined and null removed: an optional slot types as `T | undefined`, and a property lookup on
   *  that union finds nothing. */
  slotTypes(types: readonly (Type | undefined)[]): (Type | undefined)[] {
    const { checker } = this.world;
    return this.batch(types.map((type) => (type === undefined ? answer<Type | undefined>(undefined) : checker.getNonNullableType.gen(type))));
  }

  contextualTypes(nodes: readonly Expression[]): (Type | undefined)[] {
    const { checker } = this.world;
    return this.slotTypes(this.batch(nodes.map((node) => checker.getContextualType.gen(node))));
  }

  /** The properties named `name` on a slot type: the whole type's, else each union arm's. */
  *propsOnSlot(type: Type, name: string): APIRequestGenerator<readonly NativeSymbol[]> {
    const { checker } = this.world;
    const whole = yield* checker.getPropertyOfType.gen(type, name);
    if (whole !== undefined || !type.isUnionType()) {
      return whole === undefined ? [] : [whole];
    }
    const found: NativeSymbol[] = [];
    for (const arm of yield* type.getTypes.gen()) {
      const property = yield* checker.getPropertyOfType.gen(arm, name);
      if (property !== undefined) {
        found.push(property);
      }
    }
    return found;
  }

  /** The declarations each `(type, name)` reaches as a slot member. */
  slotMembers(asks: readonly { readonly type: Type; readonly name: string }[]): DeclKey[][] {
    const hits = this.batch(asks.map(({ type, name }) => this.propsOnSlot(type, name)));
    const flat = this.declarations(hits.flat());
    let at = 0;
    return hits.map((symbols) => {
      const keys = flat.slice(at, at + symbols.length).flat();
      at += symbols.length;
      return keys;
    });
  }

  /** Every member a value's type has, through a union's arms. */
  *membersOf(type: Type): APIRequestGenerator<readonly NativeSymbol[]> {
    const { checker } = this.world;
    const out: NativeSymbol[] = [];
    for (const arm of yield* constituentsOf(type)) {
      if (!isPrimitive(arm)) {
        out.push(...(yield* checker.getPropertiesOfType.gen(arm)));
      }
    }
    return out;
  }

  /** The declarations of every member each type has, once per type for the build. */
  memberDeclarations(types: readonly Type[]): readonly (readonly DeclKey[])[] {
    const fresh = [...new Map(types.filter((type) => !this.#members.has(type.id)).map((type) => [type.id, type])).values()];
    const lists = this.batch(fresh.map((type) => this.membersOf(type)));
    const keys = this.declarations(lists.flat());
    let at = 0;
    for (const [index, type] of fresh.entries()) {
      const count = lists[index]?.length ?? 0;
      this.#members.set(type.id, [...new Set(keys.slice(at, at + count).flat())]);
      at += count;
    }
    return types.map((type) => this.#members.get(type.id) ?? []);
  }

  /** The origin of each property name on each type, once per `(type, name)`: one walk per start type carries every
   *  name asked of it, since the names share the type's expansion. */
  origins(asks: readonly { readonly type: Type; readonly name: string }[]): OriginWalk[] {
    const groups = new Map<number, { readonly type: Type; readonly names: Set<string> }>();
    for (const { type, name } of asks) {
      if (this.#origins.has(originKey(type, name))) {
        continue;
      }
      const group = groups.get(type.id) ?? { type, names: new Set<string>() };
      group.names.add(name);
      groups.set(type.id, group);
    }
    const pending = [...groups.values()].map(({ type, names }) => ({ type, names: [...names] }));
    const ask = (): OriginWalk[][] => this.batch(pending.map(({ type, names }) => this.resolver.originsOf(type, names)));
    const walks = this.session.profile === null ? ask() : this.session.profile.time("origin", ask);
    for (const [at, { type, names }] of pending.entries()) {
      for (const [index, name] of names.entries()) {
        this.#origins.set(originKey(type, name), walks[at]?.[index] ?? EXHAUSTED);
      }
    }
    return asks.map(({ type, name }) => {
      const walk = this.#origins.get(originKey(type, name)) ?? EXHAUSTED;
      this.count(walk.decls.length > 0 ? "origin recovered" : `origin ${walk.end}`);
      if (walk.decls.length > 0) {
        this.peak("origin depth", walk.depth);
      }
      return walk;
    });
  }
}

/** The literal values a type can hold (a string, number or boolean literal union), or null for a wide type. */
export function* literalValues(type: Type | undefined): APIRequestGenerator<readonly string[] | null> {
  if (type === undefined) {
    return null;
  }
  const out: string[] = [];
  for (const arm of yield* constituentsOf(type)) {
    if (hasFlag(arm.flags, TypeFlags.Undefined) || hasFlag(arm.flags, TypeFlags.Null)) {
      continue;
    }
    if (arm.isStringLiteralType() || arm.isNumberLiteralType() || arm.isBooleanLiteralType()) {
      out.push(String(arm.value));
    } else {
      return null;
    }
  }
  return out;
}

const originKey = (type: Type, name: string): string => `${String(type.id)}:${name}`;
