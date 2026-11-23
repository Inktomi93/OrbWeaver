// The construction writes of a world's files, for the optional inventory the brand-flow scan reads: every name that
// stores into its member, resolved through the key resolver (`tooling/src/unwired/key-resolver.ts`) in a few batched
// checker passes, and the typed hand-offs that carry a write on, a spread into a typed literal and a Drizzle store
// included.
import type { CallExpression, JsxAttributes, Node, ObjectLiteralExpression } from "@typescript/native/ast";
import {
  isCallExpression,
  isJsxAttributes,
  isJsxSpreadAttribute,
  isObjectLiteralExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isSpreadAssignment,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Checker, Symbol as NativeSymbol, Type } from "@typescript/native/sync";
import { all, SymbolFlags } from "@typescript/native/sync";
import type { StoreWrite } from "./boundaries.ts";
import { copiedReads, storeWritesAt, tableDefinition } from "./boundaries.ts";
import type { Site } from "./classify.ts";
import { siteKey } from "./classify.ts";
import { occurrenceRoles } from "./graph/roles.ts";
import type { Flow } from "./handoffs.ts";
import { handoffFlows } from "./handoffs.ts";
import type { KeyResolution } from "./key-resolver.ts";
import { resolveKeys } from "./key-resolver.ts";
import type { NativeWorld, PropertyName } from "./native.ts";
import { constituents, declarationKeys, hasFlag, isPropertyName, propertiesNamed } from "./native.ts";

/** Declaration key to the sites that resolve to it. */
type ReferenceIndex = ReadonlyMap<string, readonly Site[]>;

/** A site and the declarations it writes. */
interface Credit {
  readonly site: Site;
  readonly keys: readonly string[];
}

function credit(index: Map<string, Site[]>, keys: readonly string[], site: Site): void {
  for (const key of keys) {
    const sites = index.get(key);
    if (sites === undefined) {
      index.set(key, [site]);
    } else {
      sites.push(site);
    }
  }
}

function walk(world: NativeWorld, home: ReadonlySet<string>, visit: (node: Node) => void): void {
  const step = (node: Node): void => {
    visit(node);
    node.forEachChild(step);
  };
  for (const file of world.files.filter((source) => home.has(world.siteOf(source).file))) {
    file.forEachChild(step);
  }
}

// A spread value and the object literal or JSX attributes it lands in.
interface Spread {
  readonly value: Node;
  readonly into: ObjectLiteralExpression | JsxAttributes;
}

function spreadAt(node: Node): Spread | null {
  const into = node.parent;
  if (isSpreadAssignment(node) && isObjectLiteralExpression(into)) {
    return { value: node.expression, into };
  }
  return isJsxSpreadAttribute(node) && isJsxAttributes(into) ? { value: node.expression, into } : null;
}

// What a spread hands on, as types: the value, and the type of the literal it lands in.
interface SpreadShape {
  readonly value: Type;
  readonly target: Type | undefined;
}

function* shapeOf(checker: Checker, { value, into }: Spread): APIRequestGenerator<SpreadShape> {
  return {
    value: yield* checker.getNonNullableType.gen(yield* checker.getTypeAtLocation.gen(value)),
    target: yield* checker.getContextualType.gen(into),
  };
}

const shapeKey = ({ value, target }: SpreadShape): string => `${value.id}|${target?.id ?? ""}`;

const keysOf = (symbols: readonly (NativeSymbol | undefined)[]): readonly string[] =>
  symbols.flatMap((symbol) => (symbol === undefined ? [] : declarationKeys(symbol)));

// A spread value's members flow into the same-named members of the typed literal it lands in. A target member a library
// declares takes nothing of ours, and a key a mapped or template-literal type builds has no declaration to flow from.
function* spreadFlows(world: NativeWorld, { value, target }: SpreadShape): APIRequestGenerator<readonly Flow[]> {
  if (target === undefined) {
    return [];
  }
  const { checker } = world;
  const properties = (yield* all(...(yield* constituents(value)).map((type) => checker.getPropertiesOfType.gen(type)))).flat();
  const named = yield* all(...properties.map((property) => propertiesNamed(checker, target, property.name)));
  return properties.flatMap((property, at) => {
    const into = (named[at] ?? []).filter((member) => member !== undefined);
    const library = into.some((member) => member.declarations.every((handle) => world.fileOf(handle) === null));
    return library || property.declarations.length === 0 || into.length === 0 ? [] : [{ source: declarationKeys(property), sink: keysOf(into) }];
  });
}

// Each distinct shape once, so a library props type spread at many sites lists its properties a single time.
function spreadFlowsOnce(world: NativeWorld, spreads: readonly Spread[]): readonly Flow[] {
  const shapes = world.batch(spreads.map((spread) => shapeOf(world.checker, spread)));
  const distinct = new Map(shapes.map((shape) => [shapeKey(shape), shape]));
  return world.batch([...distinct.values()].map((shape) => spreadFlows(world, shape))).flat();
}

// What a Drizzle write stores: a column key credited with each literal key that writes it, the flows from the stored
// value's members into the columns, the copied reads that hand a value to a column, and the columns the library fills
// from a whole value at the builder method's name.
interface Stored {
  readonly credits: readonly Credit[];
  readonly flows: readonly Flow[];
  readonly copied: readonly { readonly site: Site; readonly column: readonly string[] }[];
  readonly fills: readonly Credit[];
}

interface Carried {
  readonly flows: readonly Flow[];
  /** The columns of the value's required members: whatever builds the value must set them, so the store writes them. */
  readonly required: readonly string[];
}

function* columnKeys(checker: Checker, table: Type, name: string): APIRequestGenerator<readonly string[]> {
  const column = yield* checker.getPropertyOfType.gen(table, name);
  return column === undefined ? [] : declarationKeys(column);
}

// A stored value's members flow into the same-named columns, an array's through its element type. An optional member
// the value's type only allows is no write here: its write is the construction that sets it, which the flow carries.
function* memberFlows(checker: Checker, table: Type, value: Node): APIRequestGenerator<Carried> {
  const type = yield* checker.getNonNullableType.gen(yield* checker.getTypeAtLocation.gen(value));
  const element = (yield* checker.isArrayType.gen(type)) && type.isTypeReference() ? (yield* checker.getTypeArguments.gen(type))[0] : undefined;
  const members = yield* constituents(element ?? type);
  const properties = (yield* all(...members.map((member) => checker.getPropertiesOfType.gen(member)))).flat();
  const sinks = yield* all(...properties.map((property) => columnKeys(checker, table, property.name)));
  return {
    flows: properties.flatMap((property, at) => {
      const sink = sinks[at] ?? [];
      return sink.length === 0 ? [] : [{ source: declarationKeys(property), sink }];
    }),
    required: properties.flatMap((property, at) => (hasFlag(property.flags, SymbolFlags.Optional) ? [] : (sinks[at] ?? []))),
  };
}

function* storedBy(world: NativeWorld, { table, value, at }: StoreWrite): APIRequestGenerator<Stored> {
  const { checker } = world;
  const tableType = yield* checker.getTypeAtLocation.gen(table);
  const filledAt = (keys: readonly string[]): Stored["fills"] => (keys.length === 0 ? [] : [{ site: world.siteOf(at), keys }]);
  if (!isObjectLiteralExpression(value)) {
    const whole = yield* memberFlows(checker, tableType, value);
    return { credits: [], flows: whole.flows, copied: [], fills: filledAt(whole.required) };
  }
  const credits: Credit[] = [];
  const flows: Flow[] = [];
  const copied: Stored["copied"][number][] = [];
  const required: string[] = [];
  for (const property of value.properties) {
    if (isSpreadAssignment(property)) {
      const spread = yield* memberFlows(checker, tableType, property.expression);
      flows.push(...spread.flows);
      required.push(...spread.required);
      continue;
    }
    const { name } = property as { readonly name?: Node };
    if (name === undefined || !isPropertyName(name)) {
      continue;
    }
    const column = yield* columnKeys(checker, tableType, name.text);
    credits.push({ site: world.siteOf(name), keys: column });
    const reads = isPropertyAssignment(property) ? copiedReads(property.initializer) : [];
    copied.push(...reads.map((read) => ({ site: world.siteOf(read), column })));
  }
  return { credits, flows, copied, fills: filledAt(required) };
}

// A literal handed to a Drizzle write: its spreads flow into columns rather than being read by the library.
function storedLiterals(stores: readonly StoreWrite[]): ReadonlySet<Node> {
  return new Set(stores.flatMap(({ value }) => (isObjectLiteralExpression(value) ? [value] : [])));
}

const within = (site: Site, spans: readonly { readonly file: string; readonly start: number; readonly end: number }[]): boolean =>
  spans.some((span) => span.file === site.file && site.position >= span.start && site.position < span.end);

// `trpc.x.list.infiniteQueryOptions(input, { getNextPageParam })`: TanStack Query fills the procedure input's cursor from
// `getNextPageParam` on every page it fetches, so the call writes that member though no caller names it.
const PAGED_QUERY = "infiniteQueryOptions";
const PAGE_CURSOR = "cursor";

// The callee name of a paged-query call, the site its cursor write is credited at.
function pagedInputs(node: Node): readonly Node[] {
  return isCallExpression(node) && isPropertyAccessExpression(node.expression) && node.expression.name.text === PAGED_QUERY && node.arguments.length > 0
    ? [node.expression.name]
    : [];
}

function pagedCursors(world: NativeWorld, callees: readonly Node[]): readonly Credit[] {
  const asked = callees.flatMap((callee) => {
    const [input] = (callee.parent.parent as CallExpression).arguments;
    return input === undefined ? [] : [{ key: PAGE_CURSOR, holder: input, at: callee }];
  });
  return resolveKeys(world, asked).flatMap((resolution, at) => {
    const keys = keysOfResolution(resolution);
    const callee = asked[at]?.at;
    return keys.length === 0 || callee === undefined ? [] : [{ site: world.siteOf(callee), keys }];
  });
}

const keysOfResolution = (resolution: KeyResolution | null): readonly string[] =>
  resolution?.outcome === "members" ? resolution.members.flatMap(declarationKeys) : [];

interface StoreFacts {
  readonly credits: readonly Credit[];
  readonly flows: readonly Flow[];
  /** The column each copied read hands its value to, by {@link siteKey}. */
  readonly copied: ReadonlyMap<string, readonly string[]>;
  /** Whether a site is a column named inside a table definition: an index or a foreign key, no stored value. */
  readonly defines: (site: Site, keys: readonly string[]) => boolean;
  /** The columns a whole stored value fills, at the builder method's name: a write though the syntax reads. */
  readonly fills: readonly Credit[];
}

function storeFacts(
  world: NativeWorld,
  stores: readonly StoreWrite[],
  definitions: readonly { readonly file: string; readonly start: number; readonly end: number }[],
  columnNames: readonly Node[],
): StoreFacts {
  const stored = world.batch(stores.map((store) => storedBy(world, store)));
  const columns = new Set(world.symbolsAt(columnNames).flatMap((symbol) => (symbol === undefined ? [] : declarationKeys(symbol))));
  return {
    credits: stored.flatMap((store) => store.credits),
    flows: stored.flatMap((store) => store.flows),
    copied: new Map(stored.flatMap((store) => store.copied.map(({ site, column }) => [siteKey(site), column] as const))),
    defines: (site, keys) => keys.length > 0 && keys.every((key) => columns.has(key)) && within(site, definitions),
    fills: stored.flatMap((store) => store.fills),
  };
}

// The sites of the resolved names that store into their member, by the one site-role reader (graph/roles.ts).
const storingSites = (resolutions: readonly { readonly resolution: KeyResolution; readonly node: PropertyName }[]): ReadonlySet<string> =>
  new Set(
    resolutions.flatMap(({ resolution, node }) =>
      occurrenceRoles(node).includes("write") || resolution.slotRole === "write" ? [siteKey(resolution.site)] : [],
    ),
  );

/** A world's `home` files' construction writes: each written site with the declarations it writes, and the typed
 *  hand-offs that carry a write on, all a construction inventory needs after the world closes. */
export function constructionWrites(world: NativeWorld, home: ReadonlySet<string>): { readonly credits: readonly Credit[]; readonly flows: readonly Flow[] } {
  const names: PropertyName[] = [];
  const spreads: Spread[] = [];
  const pagedCalls: Node[] = [];
  const stores: StoreWrite[] = [];
  const definitions: { readonly file: string; readonly start: number; readonly end: number }[] = [];
  const columnNames: Node[] = [];
  walk(world, home, (node) => {
    if (isPropertyName(node)) {
      names.push(node);
    }
    stores.push(...storeWritesAt(node));
    const definition = tableDefinition(node);
    if (definition !== null) {
      const { file } = world.siteOf(definition.call);
      definitions.push({ file, start: definition.call.pos, end: definition.call.end });
      columnNames.push(...definition.columns.properties.flatMap((column) => (isPropertyAssignment(column) ? [column.name] : [])));
    }
    const spread = spreadAt(node);
    if (spread !== null) {
      spreads.push(spread);
    }
    pagedCalls.push(...pagedInputs(node));
  });
  const resolutions = resolveKeys(
    world,
    names.map((node) => ({ node })),
  ).flatMap((resolution, at) => (resolution === null ? [] : [{ resolution, node: names[at] as PropertyName }]));
  const written = storingSites(resolutions);
  const literals = storedLiterals(stores);
  const stored = storeFacts(world, stores, definitions, columnNames);
  const credits: Credit[] = [...stored.credits];
  const flows: Flow[] = [
    ...handoffFlows(world, home).flows,
    ...stored.flows,
    ...spreadFlowsOnce(
      world,
      spreads.filter(({ into }) => !literals.has(into)),
    ),
  ];
  for (const { resolution } of resolutions) {
    const { site, own } = resolution;
    const keys = keysOfResolution(resolution);
    const column = stored.copied.get(siteKey(site));
    if (column !== undefined) {
      flows.push({ source: keys, sink: column });
    } else if (!stored.defines(site, keys)) {
      credits.push({ site, keys });
    }
    if (own !== undefined) {
      // An uncontextual literal's key is its own declaration, and the write a later hand-off carries on.
      credits.push({ site, keys: declarationKeys(own) });
    }
  }
  const filled = [...pagedCursors(world, pagedCalls), ...stored.fills];
  const writes = new Set([...written, ...filled.map(({ site }) => siteKey(site))]);
  return { credits: [...credits, ...filled].filter(({ site, keys }) => keys.length > 0 && writes.has(siteKey(site))), flows };
}

/** Carry each construction's writes to the shape an assignment, return or call delivers it into. */
export function joinConstructionWrites(parts: readonly ReturnType<typeof constructionWrites>[]): ReferenceIndex {
  const index = new Map<string, Site[]>();
  for (const part of parts) {
    for (const { site, keys } of part.credits) {
      credit(index, keys, site);
    }
  }
  return withCarried(index, carriedAlong(index, flowEdges(parts.flatMap((part) => part.flows))));
}

function addEdge(edges: Map<string, Set<string>>, from: string, to: string): void {
  edges.set(from, (edges.get(from) ?? new Set()).add(to));
}

// Each key's sites spread along `edges` until nothing grows, so a chain of hand-offs and a cycle both settle.
function carriedAlong(index: ReferenceIndex, edges: ReadonlyMap<string, ReadonlySet<string>>): ReadonlyMap<string, Set<Site>> {
  const held = new Map<string, Set<Site>>();
  const holding = (key: string): Set<Site> => {
    const sites = held.get(key) ?? new Set(index.get(key) ?? []);
    held.set(key, sites);
    return sites;
  };
  const queue = [...edges.keys()];
  for (let key = queue.pop(); key !== undefined; key = queue.pop()) {
    const sites = holding(key);
    for (const next of edges.get(key) ?? []) {
      const into = holding(next);
      const before = into.size;
      for (const site of sites) {
        into.add(site);
      }
      if (into.size > before) {
        queue.push(next);
      }
    }
  }
  return held;
}

// The flows down from each value member to the members it is carried into; a flow that only reads carries no write.
function flowEdges(flows: readonly Flow[]): ReadonlyMap<string, ReadonlySet<string>> {
  const down = new Map<string, Set<string>>();
  for (const { source, sink, readsOnly } of flows) {
    for (const from of source) {
      for (const to of readsOnly === true ? [] : sink.filter((key) => !source.includes(key))) {
        addEdge(down, from, to);
      }
    }
  }
  return down;
}

function withCarried(index: ReferenceIndex, carried: ReadonlyMap<string, ReadonlySet<Site>>): ReferenceIndex {
  const joined = new Map(index);
  for (const [key, sites] of carried) {
    joined.set(key, [...new Set([...(joined.get(key) ?? []), ...sites])]);
  }
  return joined;
}
