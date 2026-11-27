// The reference census: every site the compiler's find-references gives a product member, set beside the role the
// graph recorded for that member there, and counted by the site's syntax context. A context with sites and no role is
// a shape the graph does not read yet.
//
// - The compiler's references are the only source of a site and the graph's role sites the only comparison. The census
//   decides nothing about what a site does: roles.ts occurrenceRoles is asked only which sites it rules do nothing, and
//   what a gap site would do.
// - A site counts toward a member only in a find-references group whose symbol declares that member. A base type's
//   member and a union's sibling arm answer in groups of their own, and each is a row of its own when the product
//   declares it.
// - A read a Drizzle store copies into a column has no role of its own by ruling (sites.ts handedToColumn): the column's
//   read-back reads the member, so the census counts it as carried by the column, never as a gap.
// - A signature is node kinds and child slots alone, so trivia never reaches it. Parentheses drop out, and a run of
//   `as`, `satisfies` and `!` around one value is one step naming the kinds it holds.
// - The tree publishes no table of a node's child slots, so the slot a child sits in is found by reading the node
//   class's accessors. A child no accessor returns is counted as an unknown slot, never dropped.
import type { CallExpression, Node, NonNullExpression, TypeReferenceNode } from "@typescript/native/ast";
import { formatSyntaxKind, isSourceFile, isStatement, SyntaxKind } from "@typescript/native/ast";
import type { ReferencedSymbolEntry } from "@typescript/native/sync";
import { editorLineOf } from "../../floor/typescript/editor-lines.ts";
import { tableCalls } from "../drizzle-rows.ts";
import type { NativeWorld } from "../native.ts";
import { isProduction } from "../worlds.ts";
import type { Analysis, Bucket } from "./analyse.ts";
import { isMember, memberHome } from "./analyse.ts";
import type { Graph } from "./build.ts";
import { declaredNameOf, nodeAt } from "./declared.ts";
import { libraryNames } from "./library-names.ts";
import type { GraphLog } from "./options.ts";
import type { DeclKey } from "./resolve.ts";
import { answer, declKeyParts, Resolver } from "./resolve.ts";
import type { Role } from "./roles.ts";
import { occurrenceRoles, READS, sameNode } from "./roles.ts";
import type { DeclInfo, GraphKey } from "./sites.ts";
import { handedToColumn } from "./sites.ts";
import type { RoleSite } from "./state.ts";
import { productReader, UNCLASSIFIED } from "./state.ts";
import { evenSample } from "./verify.ts";

/**
 * Where a reference site stands against the graph, first match wins: the graph gave the member a role at the site; the
 * graph's only role there is a send with no destination; the graph never walked the site's file; the graph gave the
 * member a role at the start of a node that encloses the site (a destructuring pattern, an indexed access type); roles.ts
 * rules the site does nothing; the graph gave the member a role elsewhere in the site's statement at a node no
 * reference names; a Drizzle store copies the read into a column, where the ruling reads it only if the
 * product reads the column back; or the compiler has a reference and the graph has nothing.
 */
export const SITE_CLASSES = ["placed", "unclassified", "unwalked", "enclosing", "elsewhere", "declares", "column", "gap"] as const;
export type SiteClass = (typeof SITE_CLASSES)[number];

// The buckets that say nothing in the product reads a declaration: a read the graph missed there is a false finding.
const UNREAD_BUCKETS = ["dead", "member-untouched", "member-write-only", "member-sent-only"] as const satisfies readonly Bucket[];

// The leading steps of a signature that name a shape: the reference and three ancestors hold what decides a role, and
// the steps past them only say how deep the expression sits.
const SHAPE_STEPS = 4;
// A signature stops at its statement; one nested deeper than this ends with the mark below.
const MAX_STEPS = 24;
const CUT = "…";
const STEP_JOIN = " < ";
const UNKNOWN_SLOT = "?";
const SHOWN_SAMPLES = 3;
const SHOWN_VARIANTS = 3;
/** How many gap shapes a census prints as its short list. */
export const TOP_SHAPES = 20;
// Members asked in one batch: each batch's answers are released before the next, so the census holds one batch's nodes.
const CHUNK = 1024;

const EXPRESSION = "expression" satisfies keyof NonNullExpression;
// The list slots whose position changes what a child means: an argument, and a type argument such as a key list.
const INDEXED_SLOTS: ReadonlySet<string> = new Set(["arguments" satisfies keyof CallExpression, "typeArguments" satisfies keyof TypeReferenceNode]);
const PARENTHESES: ReadonlySet<SyntaxKind> = new Set([SyntaxKind.ParenthesizedExpression, SyntaxKind.ParenthesizedType]);
const ASSERTIONS: ReadonlyMap<SyntaxKind, string> = new Map([
  [SyntaxKind.AsExpression, "as"],
  [SyntaxKind.SatisfiesExpression, "satisfies"],
  [SyntaxKind.NonNullExpression, "!"],
]);

const isNode = (value: unknown): value is Node =>
  typeof value === "object" &&
  value !== null &&
  "kind" in value &&
  typeof value.kind === "number" &&
  "pos" in value &&
  typeof value.pos === "number" &&
  "end" in value &&
  typeof value.end === "number";

const isList = (value: unknown): value is Iterable<unknown> => typeof value === "object" && value !== null && Symbol.iterator in value;

// The slot a child sits in: the parent's accessor that returns it, with its position when the accessor is a list.
interface Slot {
  readonly name: string;
  readonly index: number | null;
}

const NO_SLOT: Slot = { name: UNKNOWN_SLOT, index: null };

/** The slots of each node kind, found on first ask by reading every accessor the node class has and kept by kind. */
class Slots {
  #accessors: readonly string[] | null = null;
  readonly #known = new Map<SyntaxKind, string[]>();
  #unknown = 0;

  /** How many children no accessor of their parent returned. */
  get unknown(): number {
    return this.#unknown;
  }

  of(parent: Node, child: Node): Slot {
    const known = this.#known.get(parent.kind) ?? [];
    const found = slotAmong(parent, child, known) ?? slotAmong(parent, child, this.#accessorsOf(parent));
    if (found === undefined) {
      this.#unknown += 1;
      return NO_SLOT;
    }
    if (!known.includes(found.name)) {
      this.#known.set(parent.kind, [...known, found.name]);
    }
    return found;
  }

  // Every node is one class, so its accessors are read once.
  #accessorsOf(node: Node): readonly string[] {
    this.#accessors ??= Object.entries(Object.getOwnPropertyDescriptors(Reflect.getPrototypeOf(node) ?? {})).flatMap(([name, { get }]) =>
      get === undefined ? [] : [name],
    );
    return this.#accessors;
  }
}

function slotAmong(parent: Node, child: Node, names: readonly string[]): Slot | undefined {
  for (const name of names) {
    const held: unknown = Reflect.get(parent, name);
    if (isNode(held)) {
      if (sameNode(held, child)) {
        return { name, index: null };
      }
    } else if (isList(held)) {
      const index = [...held].findIndex((entry) => isNode(entry) && sameNode(entry, child));
      if (index !== -1) {
        return { name, index };
      }
    }
  }
  return undefined;
}

const slotText = ({ name, index }: Slot): string => (index !== null && INDEXED_SLOTS.has(name) ? `${name}[${String(index)}]` : name);

/** A reference's context: its signature's steps, and the statement the signature stops at. */
interface Context {
  readonly steps: readonly string[];
  readonly statement: Node;
}

// The outermost node of a run of parentheses and assertions around `value`, with the assertion kinds the run holds; an
// assertion's type is no part of the run, so a climb out of `x as T`'s type stops at the assertion.
function assertionRun(value: Node, slots: Slots): { readonly top: Node; readonly held: readonly string[] } {
  const held = new Set<string>();
  let top = value;
  for (;;) {
    const { parent } = top;
    const label = ASSERTIONS.get(parent.kind);
    if (label !== undefined && slots.of(parent, top).name === EXPRESSION) {
      held.add(label);
    } else if (!PARENTHESES.has(parent.kind)) {
      return { top, held: [...held].sort() };
    }
    top = parent;
  }
}

/** The context of a reference: its own kind, then each ancestor's kind and the slot the climb came up through, to the
 *  statement that holds it. */
function contextOf(reference: Node, slots: Slots): Context {
  const steps = [formatSyntaxKind(reference.kind)];
  let child = reference;
  for (;;) {
    const run = assertionRun(child, slots);
    if (run.held.length > 0) {
      steps.push(`wrap(${run.held.join(",")})`);
    }
    child = run.top;
    const { parent } = child;
    steps.push(`${formatSyntaxKind(parent.kind)}.${slotText(slots.of(parent, child))}`);
    if (isStatement(parent) || isSourceFile(parent)) {
      return { steps, statement: parent };
    }
    if (steps.length >= MAX_STEPS) {
      return { steps: [...steps, CUT], statement: statementOf(parent) };
    }
    child = parent;
  }
}

function statementOf(node: Node): Node {
  let at = node;
  while (!(isStatement(at) || isSourceFile(at))) {
    at = at.parent;
  }
  return at;
}

/** One context shape and what the graph did with the reference sites that have it. */
export interface CensusShape {
  /** The reference's kind and its nearest ancestors, each with the slot the reference sits under. */
  readonly shape: string;
  readonly sites: number;
  readonly classes: Readonly<Record<SiteClass, number>>;
  /** The sites the compiler references and the graph gave no role, or only a send with no destination. */
  readonly gaps: number;
  /** The gap sites a product reader holds: only these can change a product bucket. */
  readonly productGaps: number;
  /** The roles the graph recorded at this shape's placed sites. */
  readonly roles: readonly Role[];
  /** What roles.ts occurrenceRoles says each gap site does, by role. */
  readonly expected: Readonly<Partial<Record<Role, number>>>;
  /** The gap sites whose member an unread bucket holds, the product reads among them, and every member with such a
   *  read as `bucket member at file:line`, the line being its first one found. */
  readonly unread: { readonly sites: number; readonly productReads: number; readonly members: readonly string[] };
  /** Every gap site, `file:line member`, the product ones first. */
  readonly places: readonly string[];
  /** The whole signatures with the most gap sites, each to its statement. */
  readonly variants: readonly { readonly signature: string; readonly gaps: number }[];
}

/** A census of the references to every product member. */
export interface CensusReport {
  /** The product members asked, those among them an unread bucket holds, and those whose declaration name the merged
   *  program does not hold. */
  readonly members: { readonly asked: number; readonly of: number; readonly unread: number; readonly unresolved: number };
  /** Every unresolved member, `member at file:line (key): why`, the why naming what the merged program lacks. */
  readonly unresolved: readonly string[];
  /** Every elsewhere site, `file:line member`. */
  readonly elsewhere: readonly string[];
  /** The references find-references answered: in a group of the asked member's own symbol, and in a relative's group. */
  readonly references: { readonly own: number; readonly relative: number };
  readonly sites: Readonly<Record<SiteClass, number>>;
  /** The children whose slot no accessor of their parent returned. */
  readonly unknownSlots: number;
  /** Every shape with a gap site, most gaps first. */
  readonly gaps: readonly CensusShape[];
  /** The gap shapes with a product read of a member an unread bucket holds, most such reads first. */
  readonly falseFindings: readonly CensusShape[];
  /** Every shape with no gap site, most sites first. */
  readonly handled: readonly Pick<CensusShape, "shape" | "sites" | "classes" | "roles">[];
  readonly limits: readonly string[];
}

const CENSUS_LIMITS: readonly string[] = [
  "A site is a reference only where find-references links it to the member: a string key under a keyof constraint (Pick, Omit), a computed key and a name read from data are no reference, so no shape of theirs is listed. The literal stage and the delete trial see those.",
  "The census asks the merged program. A member only a program apart declares is unresolved, and a reference only such a program holds is not asked.",
  "An elsewhere site has a role for its member in the same statement at a node no reference names (a destructuring pattern, a call that stores a whole value): the role is not proven to be this reference's.",
  "A late-bound member is answered by the checker's per-file references, which leave out a use through the constant that keys it: the graph places a computed key's read, write and destructuring from the key's type, but no census row checks those sites.",
];

// Why the merged program holds no name for a member: no source file of that path, no node of the key's kind at its
// span, or a node there that declares no name.
const UNRESOLVED_WHY = ["no-source", "no-node", "no-name"] as const;
type UnresolvedWhy = (typeof UNRESOLVED_WHY)[number];

// Asked only of a key declaredNameOf found no name for, so a node at the span is one that names nothing.
function unresolvedWhy(world: NativeWorld, key: DeclKey): UnresolvedWhy {
  const { file, pos, end, kind } = declKeyParts(key);
  const source = world.source(file);
  if (source === undefined) {
    return "no-source";
  }
  return nodeAt(source, { pos, end, kind }) === undefined ? "no-node" : "no-name";
}

// One shape's running counts.
interface Tally {
  sites: number;
  readonly classes: Record<SiteClass, number>;
  productGaps: number;
  readonly roles: Set<Role>;
  readonly expected: Map<Role, number>;
  unreadSites: number;
  unreadProductReads: number;
  readonly unreadMembers: Map<string, string>;
  readonly productPlaces: string[];
  readonly otherPlaces: string[];
  readonly variants: Map<string, number>;
}

const noCounts = (): Record<SiteClass, number> => ({ placed: 0, unclassified: 0, unwalked: 0, enclosing: 0, elsewhere: 0, declares: 0, column: 0, gap: 0 });

const newTally = (): Tally => ({
  sites: 0,
  classes: noCounts(),
  productGaps: 0,
  roles: new Set(),
  expected: new Map(),
  unreadSites: 0,
  unreadProductReads: 0,
  unreadMembers: new Map(),
  productPlaces: [],
  otherPlaces: [],
  variants: new Map(),
});

const GAP_CLASSES: ReadonlySet<SiteClass> = new Set<SiteClass>(["gap", "unclassified"]);

const placeOf = (file: string, at: number): string => `${file}:${String(at)}`;

// A site as a reader finds it: its file and the editor line it starts on.
function lineOf(file: string, node: Node): string {
  const source = node.getSourceFile();
  return `${file}:${String(editorLineOf(source, node.getStart(source)))}`;
}

const isUnclassified = (site: RoleSite): boolean => site.role === "escape" && site.destination === UNCLASSIFIED.destination;

// One reference site with the class the graph's role sites give it, and the roles recorded there.
interface CountedSite {
  readonly key: DeclKey;
  readonly label: string;
  readonly node: Node;
  readonly file: string;
  readonly context: Context;
  readonly found: SiteClass;
  readonly roles: readonly Role[];
}

// One member asked: its key, its facts and its declaration's name in the merged program.
interface Asked {
  readonly key: DeclKey;
  readonly info: DeclInfo;
  readonly name: Node | undefined;
}

class Census {
  readonly #graph: Graph;
  readonly #world: NativeWorld;
  readonly #resolver: Resolver;
  readonly #walked: ReadonlySet<string>;
  readonly #unread: ReadonlyMap<GraphKey, Bucket>;
  readonly #isTable: (node: Node) => boolean;
  readonly #slots = new Slots();
  readonly #shapes = new Map<string, Tally>();
  readonly #sites = noCounts();
  #own = 0;
  #relative = 0;
  readonly #unresolved: string[] = [];
  readonly #elsewhere: string[] = [];

  constructor(graph: Graph, world: NativeWorld, analysis: Analysis) {
    this.#graph = graph;
    this.#world = world;
    this.#resolver = new Resolver(world);
    this.#walked = new Set(graph.files);
    this.#unread = unreadOf(analysis);
    this.#isTable = tableCalls(world);
  }

  /** Ask find-references for one batch of members and count every site it answers. */
  batch(members: readonly (readonly [DeclKey, DeclInfo])[]): void {
    const world = this.#world;
    const asked: readonly Asked[] = members.map(([key, info]) => ({ key, info, name: declaredNameOf(world, key) }));
    for (const { key, info } of asked.filter(({ name }) => name === undefined)) {
      this.#unresolved.push(`${this.#label(info)} at ${info.file}:${String(info.line)} (${key}): ${unresolvedWhy(world, key)}`);
    }
    const groups = world.batch(asked.map(({ name }) => (name === undefined ? answer<ReferencedSymbolEntry[]>([]) : world.referencedSymbolsOf(name))));
    const flat = groups.flatMap((entries, x) => entries.map((entry) => ({ x, entry })));
    const declared = this.#resolver.declarations(flat.map(({ entry }) => entry.symbol));
    const handles = flat.flatMap(({ x, entry }, y) => {
      const mine = entry.symbol === undefined || (declared[y] ?? []).includes(asked[x]?.key ?? NO_KEY);
      const held = entry.references.filter((handle) => world.fileOf(handle) !== null);
      if (!mine) {
        this.#relative += held.length;
        return [];
      }
      return held.map((handle) => ({ x, handle }));
    });
    const nodes = world.batch(handles.map(({ handle }) => handle.resolve.gen()));
    const references = asked.map((): Node[] => []);
    for (const [at, { x }] of handles.entries()) {
      const node = nodes[at];
      if (node !== undefined) {
        references[x]?.push(node);
      }
    }
    for (const [x, member] of asked.entries()) {
      this.#member(member, references[x] ?? []);
    }
  }

  // One member's references against its role sites. A role site at a reference, or at the member's own name, is that
  // node's; only a role site no reference names can be a role placed elsewhere in a statement.
  #member({ key, info, name }: Asked, references: readonly Node[]): void {
    const world = this.#world;
    const roleSites = this.#graph.facts.roleSites.get(key) ?? [];
    const byPlace = Map.groupBy(roleSites, ({ file, at }) => placeOf(file, at));
    const sites = new Map(
      references.flatMap((node) => {
        const file = world.fileOfSource(node.getSourceFile());
        return file === info.file && sameNode(node, name) ? [] : [[placeOf(file, node.pos), { node, file }] as const];
      }),
    );
    const named = new Set([...sites.keys(), ...(name === undefined ? [] : [placeOf(info.file, name.pos)])]);
    const loose = roleSites.filter(({ file, at }) => !named.has(placeOf(file, at)));
    const label = this.#label(info);
    this.#own += sites.size;
    for (const [place, { node, file }] of sites) {
      const context = contextOf(node, this.#slots);
      const exact = byPlace.get(place);
      const found = exact === undefined ? this.#unplaced({ node, file, statement: context.statement }, loose) : exactClass(exact);
      this.#count({ key, label, node, file, context, found, roles: exact?.map(({ role }) => role) ?? [] });
    }
  }

  #label(info: DeclInfo): string {
    return [memberHome(this.#graph.facts.decls, info), info.name].filter((part) => part !== "").join(".");
  }

  // A site with no role of its own: the member's roles no reference names decide whether the graph read it from a
  // node around it.
  #unplaced({ node, file, statement }: { readonly node: Node; readonly file: string; readonly statement: Node }, loose: readonly RoleSite[]): SiteClass {
    if (!this.#walked.has(file)) {
      return "unwalked";
    }
    const near = loose.filter((site) => site.file === file && site.at >= statement.pos && site.at < statement.end);
    if (near.length > 0) {
      const edges = enclosingEdges(node, statement);
      if (near.some(({ at }) => edges.has(at))) {
        return "enclosing";
      }
    }
    // A site that does nothing needs no role, so a role beside it in the statement is no question of whose it is.
    if (occurrenceRoles(node).length === 0) {
      return "declares";
    }
    if (near.length > 0) {
      return "elsewhere";
    }
    return handedToColumn(node, this.#isTable, libraryNames(this.#world)) ? "column" : "gap";
  }

  #count(site: CountedSite): void {
    const { context, found } = site;
    const shape = context.steps.slice(0, SHAPE_STEPS).join(STEP_JOIN);
    const tally = this.#shapes.get(shape) ?? newTally();
    this.#shapes.set(shape, tally);
    tally.sites += 1;
    tally.classes[found] += 1;
    this.#sites[found] += 1;
    if (found === "placed") {
      for (const role of site.roles) {
        tally.roles.add(role);
      }
    }
    if (GAP_CLASSES.has(found)) {
      this.#gap(tally, site);
    } else if (found === "elsewhere") {
      this.#elsewhere.push(`${lineOf(site.file, site.node)} ${site.label}`);
    }
  }

  // A gap site's own facts: what roles.ts says it does, its whole signature, a sample, and whether its member sits in a
  // bucket that says the product never reads it.
  #gap(tally: Tally, { key, label, node, file, context }: CountedSite): void {
    const product = productReader(file);
    const expected = occurrenceRoles(node);
    for (const role of expected) {
      tally.expected.set(role, (tally.expected.get(role) ?? 0) + 1);
    }
    const signature = context.steps.join(STEP_JOIN);
    tally.variants.set(signature, (tally.variants.get(signature) ?? 0) + 1);
    const line = lineOf(file, node);
    if (product) {
      tally.productGaps += 1;
      tally.productPlaces.push(`${line} ${label}`);
    } else {
      tally.otherPlaces.push(`${line} ${label}`);
    }
    const bucket = this.#unread.get(key);
    if (bucket === undefined) {
      return;
    }
    tally.unreadSites += 1;
    if (product && expected.some((role) => READS.has(role))) {
      tally.unreadProductReads += 1;
      const member = `${bucket} ${label}`;
      if (!tally.unreadMembers.has(member)) {
        tally.unreadMembers.set(member, line);
      }
    }
  }

  report(members: { readonly asked: number; readonly of: number; readonly unread: number }): CensusReport {
    const shapes = [...this.#shapes].map(([shape, tally]) => shapeOf(shape, tally));
    const gaps = shapes.filter((shape) => shape.gaps > 0).sort((a, b) => b.gaps - a.gaps || a.shape.localeCompare(b.shape));
    return {
      members: { ...members, unresolved: this.#unresolved.length },
      unresolved: this.#unresolved,
      elsewhere: this.#elsewhere,
      references: { own: this.#own, relative: this.#relative },
      sites: this.#sites,
      unknownSlots: this.#slots.unknown,
      gaps,
      falseFindings: gaps
        .filter(({ unread }) => unread.productReads > 0)
        .sort((a, b) => b.unread.productReads - a.unread.productReads || a.shape.localeCompare(b.shape)),
      handled: shapes
        .filter((shape) => shape.gaps === 0)
        .sort((a, b) => b.sites - a.sites || a.shape.localeCompare(b.shape))
        .map(({ shape, sites, classes, roles }) => ({ shape, sites, classes, roles })),
      limits: CENSUS_LIMITS,
    };
  }
}

// The start of every node from a site's parent out to its statement: where a pass that reads a whole construct (a
// destructuring pattern, an indexed access type) records the role of a member the construct names.
function enclosingEdges(node: Node, statement: Node): ReadonlySet<number> {
  const edges = new Set<number>();
  for (let at = node.parent; ; at = at.parent) {
    edges.add(at.pos);
    if (sameNode(at, statement) || isSourceFile(at)) {
      return edges;
    }
  }
}

// The declarations an unread bucket holds, each with its bucket.
const unreadOf = (analysis: Analysis): ReadonlyMap<GraphKey, Bucket> =>
  new Map(UNREAD_BUCKETS.flatMap((bucket) => analysis[bucket].flatMap(({ key }) => (key === null ? [] : [[key, bucket] as const]))));

// A key no declaration has, so a member with no row matches no group.
const NO_KEY = "#0-0.0" satisfies DeclKey;

const exactClass = (sites: readonly RoleSite[]): SiteClass => (sites.every(isUnclassified) ? "unclassified" : "placed");

function shapeOf(shape: string, tally: Tally): CensusShape {
  return {
    shape,
    sites: tally.sites,
    classes: tally.classes,
    gaps: tally.classes.gap + tally.classes.unclassified,
    productGaps: tally.productGaps,
    roles: [...tally.roles].sort(),
    expected: Object.fromEntries(tally.expected),
    unread: {
      sites: tally.unreadSites,
      productReads: tally.unreadProductReads,
      members: [...tally.unreadMembers].map(([member, line]) => `${member} at ${line}`),
    },
    places: [...tally.productPlaces, ...tally.otherPlaces],
    variants: [...tally.variants]
      .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
      .slice(0, SHOWN_VARIANTS)
      .map(([signature, count]) => ({ signature, gaps: count })),
  };
}

/** Count the references to every product member the graph declares by the context each sits in and the role the graph
 *  gave it. The graph must hold every product member's role sites.
 *
 *  @remarks
 *  A `sample` asks every member an unread bucket holds and an even sample of that size of the rest. A read the graph
 *  missed is a false finding only on an unread member, so none of those is left to chance; the sample only estimates
 *  how often each shape occurs. Find-references searches the whole program for each member asked, so the members asked
 *  are the run's cost. */
export function censusPass(
  graph: Graph,
  world: NativeWorld,
  run: { readonly analysis: Analysis; readonly sample: number | null },
  log: GraphLog,
): CensusReport {
  const all = [...graph.facts.decls].filter(([, info]) => isMember(info) && isProduction(info.file));
  const unread = unreadOf(run.analysis);
  const held = all.filter(([key]) => unread.has(key));
  const rest = all.filter(([key]) => !unread.has(key));
  const members = run.sample === null ? all : [...held, ...evenSample(rest, run.sample)];
  const census = new Census(graph, world, run.analysis);
  for (let at = 0; at < members.length; at += CHUNK) {
    census.batch(members.slice(at, at + CHUNK));
    world.releaseAnswers();
    log(`census members ${String(Math.min(at + CHUNK, members.length))}/${String(members.length)}`);
  }
  return census.report({ asked: members.length, of: all.length, unread: held.length });
}

const classCounts = (classes: Readonly<Record<SiteClass, number>>): string => SITE_CLASSES.map((name) => `${name}=${String(classes[name])}`).join(" ");

const expectedText = (expected: CensusShape["expected"]): string =>
  Object.entries(expected)
    .map(([role, count]) => `${role}:${String(count)}`)
    .join(",");

/** One gap shape as a short line: its gap count, its product gaps, its sites and its shape. */
export const shapeLine = ({ gaps, productGaps, sites, shape }: CensusShape): string =>
  `${String(gaps)}\tproduct ${String(productGaps)}\tof ${String(sites)}\t${shape}`;

/** The census as a text report: its totals, the short list, the false findings, then every gap shape in full. */
export function censusText(report: CensusReport): string {
  const { members, references, sites } = report;
  const full = (shape: CensusShape): readonly string[] => [
    shapeLine(shape),
    `  sites ${classCounts(shape.classes)}`,
    `  graph roles at placed sites: ${shape.roles.join(",") || "none"}; a gap site would be: ${expectedText(shape.expected) || "nothing roles.ts names"}`,
    `  unread-bucket members: gap sites ${String(shape.unread.sites)}, product reads ${String(shape.unread.productReads)}`,
    ...shape.unread.members.map((member) => `    ${member}`),
    ...shape.places.slice(0, SHOWN_SAMPLES).map((place) => `  at ${place}`),
    ...shape.variants.map(({ signature, gaps }) => `  ${String(gaps)}\t${signature}`),
  ];
  return [
    `members asked ${String(members.asked)} of ${String(members.of)}, every one of the ${String(members.unread)} an unread bucket holds, unresolved ${String(members.unresolved)}`,
    `references own ${String(references.own)}, in a relative's group ${String(references.relative)}; unknown slots ${String(report.unknownSlots)}`,
    `sites ${classCounts(sites)}`,
    "",
    `top ${String(TOP_SHAPES)} gap shapes (gaps, product gaps, sites, shape):`,
    ...report.gaps.slice(0, TOP_SHAPES).map(shapeLine),
    "",
    `false findings: gap shapes with a product read of a member in ${UNREAD_BUCKETS.join(", ")} (${String(report.falseFindings.length)}):`,
    ...report.falseFindings.flatMap((shape) => [
      `${String(shape.unread.productReads)}\t${shape.shape}`,
      ...shape.unread.members.map((member) => `    ${member}`),
    ]),
    "",
    `every gap shape (${String(report.gaps.length)}):`,
    ...report.gaps.flatMap(full),
    "",
    `unresolved members (${String(report.unresolved.length)}):`,
    ...report.unresolved.map((row) => `  ${row}`),
    "",
    `elsewhere sites (${String(report.elsewhere.length)}):`,
    ...report.elsewhere.map((row) => `  ${row}`),
    "",
    `handled shapes (${String(report.handled.length)}): sites, shape`,
    ...report.handled.map(({ sites: count, shape }) => `${String(count)}\t${shape}`),
    "",
    "limits: what this census cannot see",
    ...report.limits.map((limit) => `- ${limit}`),
    "",
  ].join("\n");
}
