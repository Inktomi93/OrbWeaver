// The spellings the graph checks beside its edges: each axis's homes and its inline re-spellings, the sites an ESLint
// rule exempts by name, and the key a lost read's receiver was keyed by.
//
// - An axis's home is an `as const` string tuple or a string-literal union alias. An inline union of more members than
//   a one-off two-state alias is an axis (Spine-TypeScript-and-Patterns §7.5): it re-spells a home with its member
//   set, is a slice of one when a strict subset, or is repeated with no home when spelled at several sites.
// - A union handed beside a type argument that has every member as a property is a key list (`Pick<T, "a" | "b">`),
//   not an axis.
// - An ESLint registry site is an object literal in tooling/src/eslint/ with `path` and `name` (a function a rule
//   exempts) or `owner` and `op` (a ruled joint-batch op), each read as the checker types it, so a path held in a
//   constant resolves.
import type { Node, UnionTypeNode } from "@typescript/native/ast";
import { isExpressionWithTypeArguments, isTypeAliasDeclaration, isTypeReferenceNode } from "@typescript/native/ast";
import type { APIRequestGenerator, Type } from "@typescript/native/sync";
import { all } from "@typescript/native/sync";
import { constituentsOf } from "./resolve.ts";
import type { FileSites } from "./sites.ts";
import { isDeclKey, keyText } from "./sites.ts";
import type { GraphFacts, GraphState, LostCause, RegistryKind } from "./state.ts";
import { REGISTRY_KINDS } from "./state.ts";

/** A lost read whose key no literal union spells. */
export const NO_KEY: Omit<LostCause, "read"> = { source: "no-literal-key", alias: null, members: [] };

// The keys each registry kind is spelled with, target then name.
const REGISTRY_KEYS: Readonly<Record<RegistryKind, readonly [string, string]>> = { site: ["path", "name"], op: ["owner", "op"] };

const ESLINT_SOURCE = "tooling/src/eslint/";
/** The server's source, whose names a ruled op may be spelled with. */
export const SERVER_SOURCE = "packages/server/src/";

/** The members of a one-off two-state alias, which Spine-TypeScript-and-Patterns §7.5 exempts from the tuple rule. */
const TWO_STATE = 2;

const UNNAMED_CONTEXT = "(unnamed)";

/** Read one file's axis spellings and registry sites into the graph. */
export function fileSpellings(state: GraphState, sites: FileSites): void {
  for (const { node, members } of sites.constTuples) {
    state.unionHomes.push({ members, where: `${sites.file}:${String(sites.lineOf(node))} ${keyText(node.name) ?? UNNAMED_CONTEXT}` });
  }
  for (const { node, members } of sites.stringUnions) {
    const { parent } = node;
    if (isTypeAliasDeclaration(parent)) {
      state.unionHomes.push({ members, where: `${sites.file}:${String(sites.lineOf(node))} ${parent.name.text}` });
    }
  }
  inlineUnions(
    state,
    sites,
    sites.stringUnions.filter(({ node, members }) => !isTypeAliasDeclaration(node.parent) && members.length > TWO_STATE),
  );
  if (sites.file.startsWith(ESLINT_SOURCE)) {
    registrySites(state, sites);
  }
  // a ruled op is keyed by a member, a type or a parameter that names it, so every name the server spells counts
  if (sites.file.startsWith(SERVER_SOURCE)) {
    for (const { node } of sites.names) {
      const name = keyText(node);
      if (name !== undefined) {
        state.serverNames.add(name);
      }
    }
  }
}

// The type arguments a union is handed beside, when it is one.
function siblingArguments(node: UnionTypeNode): readonly Node[] {
  const { parent } = node;
  const args = isTypeReferenceNode(parent) || isExpressionWithTypeArguments(parent) ? (parent.typeArguments ?? []) : [];
  return args.filter((argument) => argument !== node);
}

function inlineUnions(state: GraphState, sites: FileSites, unions: FileSites["stringUnions"]): void {
  const { checker } = state.world;
  const siblings = unions.map(({ node }) => siblingArguments(node));
  const types = state.world.typesAt(siblings.flat());
  const starts = siblings.map((_, x) => siblings.slice(0, x).reduce((total, list) => total + list.length, 0));
  // A sibling that has every member as a property makes the union its key list.
  function* keysOf(own: readonly (Type | undefined)[], members: readonly string[]): APIRequestGenerator<boolean> {
    for (const type of own.filter((candidate) => candidate !== undefined)) {
      const found = yield* all(...members.map((member) => checker.getPropertyOfType.gen(type, member)));
      if (found.every((property) => property !== undefined)) {
        return true;
      }
    }
    return false;
  }
  const keyLists = state.batch(unions.map(({ members }, x) => keysOf(types.slice(starts[x], (starts[x] ?? 0) + (siblings[x]?.length ?? 0)), members)));
  for (const [x, { node, members, from }] of unions.entries()) {
    if (keyLists[x] === true) {
      state.count("inline unions that are key lists");
    } else {
      const context = isDeclKey(from) ? (state.decls.get(from)?.name ?? UNNAMED_CONTEXT) : UNNAMED_CONTEXT;
      state.inlineUnions.push({ members, file: sites.file, line: sites.lineOf(node), context });
    }
  }
}

function registrySites(state: GraphState, sites: FileSites): void {
  const byLiteral = Map.groupBy(sites.literalProperties, ({ literal }) => literal);
  const asks = [...byLiteral].flatMap(([literal, properties]) =>
    REGISTRY_KINDS.flatMap((kind) => {
      const [target, name] = REGISTRY_KEYS[kind].map((key) => properties.find((property) => property.name === key)?.value);
      return target === undefined || name === undefined ? [] : [{ kind, literal, target, name }];
    }),
  );
  const types = state.world.typesAt(asks.flatMap(({ target, name }) => [target, name]));
  for (const [x, { kind, literal }] of asks.entries()) {
    const [target, name] = [types[2 * x], types[2 * x + 1]].map((type) => (type?.isStringLiteralType() === true ? type.value : null));
    if (target === null || target === undefined || name === null || name === undefined) {
      state.count("registry sites the checker could not read");
      continue;
    }
    state.registrySites.push({ kind, file: sites.file, line: sites.lineOf(literal), target, name });
  }
}

/** The lost reads by where their key came from. An inline set another declaration spells as a home is a re-spelled
 *  axis; a read that ended at a library's own declaration is counted apart, never lost. */
export interface LostBreakdown {
  readonly total: number;
  readonly bySource: Readonly<Record<LostCause["source"], number>>;
  readonly unions: readonly { readonly alias: string | null; readonly members: readonly string[]; readonly reads: number; readonly homes: readonly string[] }[];
  readonly libraryLanded: number;
}

const LIBRARY_END = "origin library";

/** The lost reads of a graph by their key's source, each key set with its reads and the homes that spell it. */
export function explainLost(facts: GraphFacts): LostBreakdown {
  const homes = Map.groupBy(facts.unionHomes, ({ members }) => members.join("|"));
  const sets = Map.groupBy(
    facts.lostCauses.filter(({ source }) => source !== "no-literal-key"),
    ({ alias, members }) => `${alias ?? ""}#${members.join("|")}`,
  );
  const count = (source: LostCause["source"]): number => facts.lostCauses.filter((cause) => cause.source === source).length;
  return {
    total: facts.lostCauses.length,
    bySource: { "named-union": count("named-union"), "inline-union": count("inline-union"), "no-literal-key": count("no-literal-key") },
    unions: [...sets.values()]
      .flatMap((reads) => {
        const [first] = reads;
        return first === undefined
          ? []
          : [{ alias: first.alias, members: first.members, reads: reads.length, homes: (homes.get(first.members.join("|")) ?? []).map(({ where }) => where) }];
      })
      .sort((a, b) => b.reads - a.reads || a.members.join().localeCompare(b.members.join())),
    libraryLanded: facts.counts.get(LIBRARY_END) ?? 0,
  };
}

/** The literal union each name is one of, walking the receiver's type once for every name asked of it, through the
 *  relations a key can come from; a name ends where a level holds it, the walk when no new type is left. */
export function* keySources(state: GraphState, start: Type, names: readonly string[]): APIRequestGenerator<ReadonlyMap<string, Omit<LostCause, "read">>> {
  const found = new Map<string, Omit<LostCause, "read">>();
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
function* keysOnLevel(level: readonly Type[], names: readonly string[], found: Map<string, Omit<LostCause, "read">>): APIRequestGenerator<void> {
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
