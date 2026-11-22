// The reference graph under construction and the checker helpers every pass shares: one program, one resolver, one
// set of caches. A pass reads sites a file's walk collected and writes edges and roles here.
//
// A role is kept by world: what product code does to a member decides the product buckets; what tests, tooling and
// scripts do only annotates them, so a field only a test reads is still unread by the product.
import type { Expression } from "@typescript/native/ast";
import type { APIRequestGenerator, Symbol as NativeSymbol, Type } from "@typescript/native/sync";
import { TypeFlags } from "@typescript/native/sync";
import type { NativeWorld } from "../native.ts";
import { hasFlag } from "../native.ts";
import { isProduction } from "../worlds.ts";
import type { DeclKey, OriginWalk } from "./resolve.ts";
import { answer, constituentsOf, Resolver } from "./resolve.ts";
import type { Role, RoleSet } from "./roles.ts";
import { NO_ROLES, withRoles } from "./roles.ts";
import type { Roots } from "./roots.ts";
import type { DeclInfo, GraphKey } from "./sites.ts";

/** What the code does to one member: the product's roles, every other world's, and the product's first write. */
export interface MemberRoles {
  product: RoleSet;
  other: RoleSet;
  write: string | null;
}

/** Directed edges between graph nodes. */
export type Edges = Map<GraphKey, Set<GraphKey>>;

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
export class GraphState {
  readonly root: string;
  readonly world: NativeWorld;
  readonly resolver: Resolver;
  readonly roots: Roots;
  readonly decls = new Map<DeclKey, DeclInfo>();
  readonly run: Edges = new Map();
  readonly typ: Edges = new Map();
  readonly doc: Edges = new Map();
  readonly roles = new Map<DeclKey, MemberRoles>();
  /** Member flows, slot member to the value member that fills it. */
  readonly flows = new Map<DeclKey, Set<DeclKey>>();
  /** The members a value published to a global our own `declare global` declares holds: the dev bridge's surface. */
  readonly door = new Set<DeclKey>();
  /** A zod schema key and the member of the type it `satisfies z.ZodType<T>`: one member, roles merged both ways. */
  readonly twins: (readonly [DeclKey, DeclKey])[] = [];
  readonly stateParts: { readonly decl: DeclKey; readonly part: "value" | "setter"; readonly file: string; readonly line: number }[] = [];
  readonly cssNames: { readonly holder: DeclKey; readonly entry: DeclKey | null; readonly name: string }[] = [];
  readonly pins: DeclKey[] = [];
  readonly danglingDocs: { readonly file: string; readonly line: number; readonly text: string }[] = [];
  readonly lostReads: string[] = [];
  readonly counts = new Map<string, number>();
  readonly #product = new Map<string, boolean>();
  readonly #origins = new Map<string, OriginWalk>();
  readonly #members = new Map<number, readonly DeclKey[]>();

  constructor(root: string, world: NativeWorld, roots: Roots) {
    this.root = root;
    this.world = world;
    this.resolver = new Resolver(world);
    this.roots = roots;
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

  role(key: DeclKey, role: Role, file: string, at: number): void {
    const roles = this.roles.get(key) ?? { product: NO_ROLES, other: NO_ROLES, write: null };
    if (this.product(file)) {
      roles.product = withRoles(roles.product, [role]);
      if (role === "write" && roles.write === null) {
        roles.write = `${file}:${String(at)}`;
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

  count(name: string, by = 1): void {
    this.counts.set(name, (this.counts.get(name) ?? 0) + by);
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
    const walks = this.batch(pending.map(({ type, names }) => this.resolver.originsOf(type, names)));
    for (const [at, { type, names }] of pending.entries()) {
      for (const [index, name] of names.entries()) {
        this.#origins.set(originKey(type, name), walks[at]?.[index] ?? { decls: [], depth: -1, end: "exhausted" });
      }
    }
    return asks.map(({ type, name }) => {
      const walk = this.#origins.get(originKey(type, name)) ?? { decls: [], depth: -1, end: "exhausted" };
      this.count(walk.decls.length > 0 ? "origin recovered" : `origin ${walk.end}`);
      return walk;
    });
  }

  /** The literal values a type can hold (a string, number or boolean literal union), or null for a wide type. */
  *literalValues(type: Type | undefined): APIRequestGenerator<readonly string[] | null> {
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
}

const originKey = (type: Type, name: string): string => `${String(type.id)}:${name}`;
