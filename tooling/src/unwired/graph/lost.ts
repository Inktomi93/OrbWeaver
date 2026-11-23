// Why a bare read was lost: the literal union its key was spelled in, the slot it lands in, and the receiver it was
// read from; and, for a read whose walk ended at a library's own declaration, which library owns the member.
//
// - A key source walks the receiver's type through the relations a key can come from, on a seen-set: no depth cap.
// - The slot is read off the checker's own flags on the read's symbol and its receiver, never off printed type text.
import type { APIRequestGenerator, Symbol as NativeSymbol, NodeHandle, Type } from "@typescript/native/sync";
import { all, CheckFlags, TypeFlags } from "@typescript/native/sync";
import type { NativeWorld } from "../native.ts";
import { DEFAULT_LIBRARY, hasFlag } from "../native.ts";
import { constituentsOf } from "./resolve.ts";
import type { GraphFacts, GraphState, LibraryLanding, LostCause, LostKey, LostSlot } from "./state.ts";

/** A lost read whose key no literal union spells. */
export const NO_KEY: LostKey = { source: "no-literal-key", alias: null, members: [] };

/** The literal union each name is one of, walking the receiver's type once for every name asked of it, through the
 *  relations a key can come from; a name ends where a level holds it, the walk when no new type is left. */
export function* keySources(state: GraphState, start: Type, names: readonly string[]): APIRequestGenerator<ReadonlyMap<string, LostKey>> {
  const found = new Map<string, LostKey>();
  const seen = new Set<number>([start.id]);
  let level: readonly Type[] = [start];
  while (level.length > 0 && found.size < names.length) {
    yield* keysOnLevel(level, names, found);
    const next = yield* all(...level.map((type) => keyRelations(state, type)));
    level = next.flat().filter((type) => {
      const fresh = !seen.has(type.id);
      seen.add(type.id);
      return fresh;
    });
  }
  return found;
}

// Each name a literal union on this level holds, not yet found on a nearer level.
function* keysOnLevel(level: readonly Type[], names: readonly string[], found: Map<string, LostKey>): APIRequestGenerator<void> {
  for (const type of level.filter((candidate) => candidate.isUnionType() || candidate.isStringLiteralType())) {
    const members = yield* literalMembers(type);
    const holds = members === null ? [] : names.filter((name) => !found.has(name) && members.includes(name));
    const alias = holds.length > 0 ? yield* type.getAliasSymbol.gen() : undefined;
    for (const name of holds) {
      found.set(name, { source: alias === undefined ? "inline-union" : "named-union", alias: alias?.name ?? null, members: members ?? [] });
    }
  }
}

// The types a key can come from: an alias's and a reference's type arguments, a union's or intersection's parts, a
// mapped type's constraint and template, a `keyof`'s target, and an interface's bases. A type's apparent type is no
// key source: it would walk every lib wrapper for each read.
function* keyRelations(state: GraphState, type: Type): APIRequestGenerator<readonly Type[]> {
  const out: Type[] = [...(yield* state.resolver.relatedTypes(type, "args"))];
  if (type.isUnionType() || type.isIntersectionType()) {
    out.push(...(yield* type.getTypes.gen()));
  }
  if (type.isMappedType()) {
    out.push(yield* type.getConstraintType.gen(), yield* type.getTemplateType.gen());
  }
  if (type.isIndexType()) {
    out.push(yield* type.getTarget.gen());
  }
  if (type.isClassOrInterface()) {
    out.push(...((yield* type.getBaseTypes.gen()) ?? []));
  }
  return out;
}

// A union's string-literal members when every member that is not undefined is one; null otherwise.
function* literalMembers(type: Type): APIRequestGenerator<readonly string[] | null> {
  const out: string[] = [];
  for (const member of yield* constituentsOf(type)) {
    if (member.isStringLiteralType()) {
      out.push(member.value);
    }
  }
  return out.length > 0 ? out.toSorted() : null;
}

// The symbol flags that name a slot, in the order they are asked after the receiver's own.
const SLOT_FLAGS: readonly (readonly [LostSlot, CheckFlags])[] = [
  ["late-bound", CheckFlags.Late],
  ["index-signature", CheckFlags.IndexSymbol],
  ["reverse-mapped", CheckFlags.ReverseMapped],
  ["mapped-member", CheckFlags.Mapped],
];

/** The slot a lost read lands in, from its symbol and its receiver's type (the order is {@link LOST_SLOTS}'s). */
export function* lostSlot(world: NativeWorld, symbol: NativeSymbol, receiver: Type): APIRequestGenerator<Pick<LostCause, "slot" | "detail" | "receiver">> {
  const [detail, named] = yield* all(packagesOf(world, symbol.declarations), receiverName(world, receiver));
  const parts = yield* constituentsOf(receiver);
  const flagged = SLOT_FLAGS.find(([, flag]) => hasFlag(symbol.checkFlags, flag))?.[0];
  const indexed = flagged === undefined && symbol.declarations.length === 0 ? (yield* receiver.getIndexInfos.gen()).length > 0 : false;
  const slot =
    receiverSlot(receiver, parts) ??
    flagged ??
    (indexed ? "index-signature" : null) ??
    (symbol.declarations.length > 0 ? "library-member" : null) ??
    memberSlot(symbol);
  return { slot, detail: detail.length > 0 ? detail.join(", ") : null, receiver: named };
}

function receiverSlot(receiver: Type, parts: readonly Type[]): LostSlot | null {
  if (hasFlag(receiver.flags, TypeFlags.AnyOrUnknown)) {
    return "any-receiver";
  }
  return parts.some((part) => part.isTypeParameter()) ? "type-parameter" : null;
}

function memberSlot(symbol: NativeSymbol): LostSlot {
  if (hasFlag(symbol.checkFlags, CheckFlags.Synthetic)) {
    return "synthetic";
  }
  return hasFlag(symbol.checkFlags, CheckFlags.Instantiated) ? "instantiated" : "no-declaration";
}

/** The packages that declare the type a mapped member is read from, when a package's type mapped its keys: the key set
 *  is the library's, so the read is too. The default library's `Record` and `Readonly` only carry keys the tree spells. */
export function* libraryKeySet(world: NativeWorld, symbol: NativeSymbol, receiver: Type): APIRequestGenerator<readonly string[]> {
  if (!hasFlag(symbol.checkFlags, CheckFlags.Mapped)) {
    return [];
  }
  const [alias, own] = yield* all(receiver.getAliasSymbol.gen(), receiver.getSymbol.gen());
  const packages = yield* packagesOf(world, (alias ?? own)?.declarations ?? []);
  return packages.filter((name) => name !== DEFAULT_LIBRARY);
}

/** The libraries a set of declarations was loaded from, sorted: a package by its name, the default library as
 *  {@link DEFAULT_LIBRARY}; the tree's own declarations name none. */
export function* packagesOf(world: NativeWorld, handles: readonly NodeHandle[]): APIRequestGenerator<readonly string[]> {
  const packages = yield* all(...handles.map((handle) => world.packageOf(handle)));
  const named = packages.flatMap((name, at) => {
    const handle = handles[at];
    if (name !== null) {
      return [name];
    }
    return handle === undefined || world.fileOf(handle) !== null ? [] : [DEFAULT_LIBRARY];
  });
  return [...new Set(named)].toSorted();
}

const ANONYMOUS = "(anonymous)";

// A receiver by the name its alias or symbol carries, then where that is declared: a package, a tree file, or the
// default library.
function* receiverName(world: NativeWorld, receiver: Type): APIRequestGenerator<string> {
  const [alias, symbol] = yield* all(receiver.getAliasSymbol.gen(), receiver.getSymbol.gen());
  const named = alias ?? symbol;
  const [handle] = named?.declarations ?? [];
  if (handle === undefined) {
    return named?.name ?? ANONYMOUS;
  }
  const home = (yield* world.packageOf(handle)) ?? world.fileOf(handle) ?? DEFAULT_LIBRARY;
  return `${named?.name ?? ANONYMOUS} ${home}`;
}

/** One slot and the packages that declare its members, with every read it holds counted by receiver. */
interface LostSlotGroup {
  readonly slot: LostSlot;
  readonly detail: string | null;
  readonly reads: number;
  readonly sample: string;
  readonly receivers: readonly { readonly receiver: string; readonly reads: number; readonly sample: string }[];
}

/** One library and the members of its that ended a walk. */
interface LibraryGroup {
  readonly library: string;
  readonly reads: number;
  readonly members: readonly { readonly member: string; readonly reads: number; readonly sample: string }[];
}

/** The lost reads by where their key came from and the slot they land in; the library-landed reads by library. An
 *  inline set another declaration spells as a home is a re-spelled axis. */
export interface LostBreakdown {
  readonly total: number;
  readonly bySource: Readonly<Record<LostKey["source"], number>>;
  readonly unions: readonly { readonly alias: string | null; readonly members: readonly string[]; readonly reads: number; readonly homes: readonly string[] }[];
  readonly bySlot: readonly LostSlotGroup[];
  readonly library: { readonly total: number; readonly byLibrary: readonly LibraryGroup[] };
}

// Rows grouped by a key, each group counted and sampled by its first row, largest first.
function tally<T>(
  rows: readonly T[],
  key: (row: T) => string,
  where: (row: T) => string,
): readonly { readonly key: string; readonly rows: readonly T[]; readonly sample: string }[] {
  return [...Map.groupBy(rows, key)]
    .flatMap(([name, group]) => (group[0] === undefined ? [] : [{ key: name, rows: group, sample: where(group[0]) }]))
    .sort((a, b) => b.rows.length - a.rows.length || a.key.localeCompare(b.key));
}

/** The lost reads of a graph by their key's source and their slot, and the library-landed reads by library. */
export function explainLost(facts: GraphFacts): LostBreakdown {
  const homes = Map.groupBy(facts.unionHomes, ({ members }) => members.join("|"));
  const sets = tally(
    facts.lostCauses.filter(({ source }) => source !== "no-literal-key"),
    ({ alias, members }) => `${alias ?? ""}#${members.join("|")}`,
    ({ where }) => where,
  );
  const count = (source: LostKey["source"]): number => facts.lostCauses.filter((cause) => cause.source === source).length;
  return {
    total: facts.lostCauses.length,
    bySource: { "named-union": count("named-union"), "inline-union": count("inline-union"), "no-literal-key": count("no-literal-key") },
    unions: sets.flatMap(({ rows: [first], rows }) =>
      first === undefined
        ? []
        : [{ alias: first.alias, members: first.members, reads: rows.length, homes: (homes.get(first.members.join("|")) ?? []).map(({ where }) => where) }],
    ),
    bySlot: slotGroups(facts.lostCauses),
    library: { total: facts.libraryLandings.length, byLibrary: libraryGroups(facts.libraryLandings) },
  };
}

function slotGroups(causes: readonly LostCause[]): readonly LostSlotGroup[] {
  return tally(
    causes,
    ({ slot, detail }) => `${slot}#${detail ?? ""}`,
    ({ where }) => where,
  ).flatMap(({ rows, sample }) => {
    const [first] = rows;
    return first === undefined
      ? []
      : [
          {
            slot: first.slot,
            detail: first.detail,
            reads: rows.length,
            sample,
            receivers: tally(
              rows,
              ({ receiver }) => receiver,
              ({ where }) => where,
            ).map(({ key, rows: held, sample: at }) => ({ receiver: key, reads: held.length, sample: at })),
          },
        ];
  });
}

// A landing whose stops name no library: a declaration outside every package and every tree file.
const UNNAMED_LIBRARY = "(unnamed)";

function libraryGroups(landings: readonly LibraryLanding[]): readonly LibraryGroup[] {
  const each = landings.flatMap((landing) => (landing.packages.length > 0 ? landing.packages : [UNNAMED_LIBRARY]).map((library) => ({ ...landing, library })));
  return tally(
    each,
    ({ library }) => library,
    ({ where }) => where,
  ).map(({ key, rows }) => ({
    library: key,
    reads: rows.length,
    members: tally(
      rows,
      ({ member }) => member,
      ({ where }) => where,
    ).map(({ key: member, rows: held, sample }) => ({ member, reads: held.length, sample })),
  }));
}
