// The member findings judged the way the fields scan judges its rows. A member the deliberate list names reports apart
// with its reason, a row an open board item owns reports apart with that item, and a judged entry whose row is gone or
// whose item is closed is stale. A schema key that only validates outside input reports apart and is never judged. Each
// other row carries its proposed sort (field-sort.ts), every place its value is sent, and the literal search of a row
// the sort calls dead (literal-hits.ts). A row's key is the fields scan's `file:Home.member`, so one judged list serves both.
//
// - A row's own sites are its declaration's name and every production site the build recorded for it (state.ts
//   roleSites), keyed by literal-hits.ts ownSiteKey as the search keys a hit there: those hits are no new evidence.
// - A row is searched by the word it is read by (literal-hits.ts searchedWord), never its label: a computed member by
//   its key's value, a quoted one by its text. A private member is never searched, since no string reaches it.
// - A member the plugin SDK publishes is received by guests, never judged (analyse.ts lists it apart).
// - A member the product sends to a provider request and never reads is received by the provider where a law, ADR or
//   README line names it (field-sort.ts providerCite); with no such line it stays a judged row.
// - A tRPC mutation's one-member output is the procedure's whole answer: its unread member is acknowledged, never judged.
import type { JsxAttribute, Node, PropertyAssignment, PropertyDeclaration, SourceFile } from "@typescript/native/ast";
import {
  getTokenAtPosition,
  isArrayLiteralExpression,
  isAsExpression,
  isCallExpression,
  isIdentifier,
  isJsxAttribute,
  isNoSubstitutionTemplateLiteral,
  isNumericLiteral,
  isObjectLiteralExpression,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isPropertyDeclaration,
  isSatisfiesExpression,
  isSourceFile,
  isStringLiteral,
  isTemplateExpression,
  SyntaxKind,
  skipTrivia,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Symbol as NativeSymbol } from "@typescript/native/sync";
import type { SendDestination } from "../boundaries.ts";
import type { DeliberateEntry } from "../deliberate.ts";
import { sortDeliberate } from "../deliberate.ts";
import type { FieldPromise, PromiseField, SortEvidence, Verdict } from "../field-sort.ts";
import { FieldSort, homeAliases, promiseFacts } from "../field-sort.ts";
import type { JudgedEntry, JudgedSplit } from "../judged.ts";
import { sortJudged } from "../judged.ts";
import type { LiteralEvidence, LiteralStage } from "../literal-hits.ts";
import { literalStage, ownSiteKey, searchedWord } from "../literal-hits.ts";
import type { NativeWorld } from "../native.ts";
import { isProduction } from "../worlds.ts";
import type { Analysis, Finding, MemberBucket } from "./analyse.ts";
import { isMember, MEMBER_BUCKETS, memberHome } from "./analyse.ts";
import type { Graph } from "./build.ts";
import type { DeclKey } from "./resolve.ts";
import { declKeyParts, Resolver } from "./resolve.ts";
import type { Role } from "./roles.ts";
import { READS } from "./roles.ts";
import type { DeclInfo } from "./sites.ts";
import { isDeclKey } from "./sites.ts";
import type { GraphFacts, RoleSite } from "./state.ts";
import { productReader } from "./state.ts";
import { declaredNameOf } from "./verify.ts";
import { siteLine } from "./why.ts";

/** The lists a member row is judged by. */
export interface MemberRulings {
  readonly deliberate: readonly DeliberateEntry[];
  readonly judged: readonly JudgedEntry[];
}

/** No ruling: every member row reports as unwired. */
export const NO_RULINGS: MemberRulings = { deliberate: [], judged: [] };

const MEMBER_ORIGINS = ["type", "schema"] as const;
/** `type`: a member of an interface, an object type or a class. `schema`: a key of a zod object schema with no type twin. */
type MemberOrigin = (typeof MEMBER_ORIGINS)[number];

/** One member finding as a row the lists can name, with its sort, its sends and its literal search. */
export interface MemberRow {
  readonly key: string;
  readonly bucket: MemberBucket;
  readonly file: string;
  readonly line: number;
  readonly home: string;
  readonly member: string;
  readonly origin: MemberOrigin;
  readonly note: string | null;
  /** Sites outside the product that read or write it: tests, tooling and scripts. */
  readonly tests: number;
  /** The first production sites that write it, then read it, `file:line`. */
  readonly sample: readonly string[];
  /** Each place the member's value leaves the process, `destination file:line`, then the receiver when one is named. */
  readonly sent: readonly string[];
  readonly verdict: Verdict;
  readonly evidence: SortEvidence;
  /** The literal search of a row the sort called dead; null for a row it sorted otherwise. */
  readonly literal: LiteralEvidence | null;
}

const RECEIVERS = ["plugin-sdk", "provider"] as const;
/** `plugin-sdk`: the published SDK declares it for guests. `provider`: it rides a provider request and a doc names it. */
type Receiver = (typeof RECEIVERS)[number];

/** A member no production code reads that a receiver outside the tree reads. */
interface ReceivedRow {
  readonly key: string;
  readonly file: string;
  readonly line: number;
  readonly home: string;
  readonly member: string;
  readonly receiver: Receiver;
  /** The SDK declaration that publishes it, or the doc line that names the provider field, `file:line`. */
  readonly cite: string;
}

/** The member rows split by the deliberate and judged lists, the validate-only schema keys, the acknowledgements and the
 *  received members apart. */
export type JudgedMembers = JudgedSplit<MemberRow> & {
  readonly deliberate: readonly (MemberRow & { readonly reason: string })[];
  readonly validated: readonly MemberRow[];
  readonly acknowledged: readonly MemberRow[];
  readonly received: readonly ReceivedRow[];
  /** The literal search over every dead row, or null for a root with no git index or no wired member to control it. */
  readonly literalStage: LiteralStage | null;
};

const VALIDATED: MemberBucket = "member-validated";
const READ_ONLY: MemberBucket = "member-read-only";
// The buckets of a member the product writes or sends and never reads: an acknowledgement is one of these.
const NEVER_READ: ReadonlySet<MemberBucket> = new Set<MemberBucket>(["member-write-only", "member-sent-only"]);
// The roles a site outside the product gives that the row's `tests` count: a use of the data, never a key or a send.
const USES: ReadonlySet<Role> = new Set<Role>([...READS, "write"]);
const SAMPLE = 3;
const PROVIDER: SendDestination = "provider";

// A row before its literal search, with what the search needs: the word it is searched by, null for a private name.
type Sorted = Omit<MemberRow, "literal"> & { readonly known: readonly string[]; readonly neverWritten: boolean; readonly word: string | null };

// The program's text at each site the judge reads: word offsets, lines and the value a write gives.
class Sources {
  readonly #world: NativeWorld;
  readonly #files = new Map<string, SourceFile | undefined>();

  constructor(world: NativeWorld) {
    this.#world = world;
  }

  #source(file: string): SourceFile | undefined {
    if (!this.#files.has(file)) {
      this.#files.set(file, this.#world.source(file));
    }
    return this.#files.get(file);
  }

  // A site the build recorded in a file the program holds, keyed as the search keys a hit on the name starting there.
  offset(file: string, at: number): string {
    const source = this.#source(file);
    if (source === undefined) {
      throw new Error(`member judge: a role site sits in ${file}, which the program does not hold`);
    }
    return ownSiteKey(source, file, at);
  }

  // A declaration's own name node; every member finding is a named declaration.
  name(key: DeclKey): Node {
    const name = declaredNameOf(this.#world, key);
    if (name === undefined) {
      throw new Error(`member judge: the declaration ${key} has no name`);
    }
    return name;
  }

  located(file: string, at: number): string {
    return `${file}:${String(siteLine(this.#world, file, at))}`;
  }

  // Whether a write site gives the member a literal: a key's or a field's initializer, or a JSX attribute's, through
  // `as`, `satisfies` and parentheses.
  handWritten(file: string, at: number): boolean {
    const source = this.#source(file);
    if (source === undefined) {
      return false;
    }
    let holder: Node = getTokenAtPosition(source, skipTrivia(source.text, at));
    while (!(isSourceFile(holder) || isValueHolder(holder))) {
      holder = holder.parent;
    }
    let value = isValueHolder(holder) ? holder.initializer : undefined;
    while (value !== undefined && (isAsExpression(value) || isSatisfiesExpression(value) || isParenthesizedExpression(value))) {
      value = value.expression;
    }
    return value !== undefined && isLiteral(value);
  }
}

const isValueHolder = (node: Node): node is PropertyAssignment | PropertyDeclaration | JsxAttribute =>
  isPropertyAssignment(node) || isPropertyDeclaration(node) || isJsxAttribute(node);

const isLiteral = (node: Node): boolean =>
  isStringLiteral(node) ||
  isNoSubstitutionTemplateLiteral(node) ||
  isNumericLiteral(node) ||
  isObjectLiteralExpression(node) ||
  isArrayLiteralExpression(node) ||
  isTemplateExpression(node) ||
  node.kind === SyntaxKind.TrueKeyword ||
  node.kind === SyntaxKind.FalseKeyword;

const sendLine = (site: RoleSite, sources: Sources): readonly string[] =>
  site.role === "escape" ? [[site.destination, sources.located(site.file, site.at), ...(site.receiver === null ? [] : [site.receiver])].join(" ")] : [];

// What a value of one member reaches through flows and twins: the members it fills, for the settings promise.
function carriesInto(facts: GraphFacts): ReadonlyMap<string, ReadonlySet<string>> {
  const into = new Map<string, Set<string>>();
  const add = (from: string, to: string): void => {
    into.set(from, (into.get(from) ?? new Set()).add(to));
  };
  for (const [slot, values] of [...facts.flows, ...facts.columnFlows]) {
    for (const value of values) {
      add(value, slot);
    }
  }
  for (const [a, b] of facts.twins) {
    add(a, b);
    add(b, a);
  }
  return into;
}

// Every member the graph declares, as the promise test and the sibling test read it. Union options name one member
// under one home, each its own row: they are numbered in source order, the first keeping the bare key.
function declaredMembers(facts: GraphFacts): readonly (PromiseField & { readonly decl: DeclKey })[] {
  const members = [...facts.decls]
    .flatMap(([decl, info]) => (isMember(info) ? [{ decl, info, pos: declKeyParts(decl).pos }] : []))
    .sort((a, b) => a.info.file.localeCompare(b.info.file) || a.pos - b.pos);
  const seen = new Map<string, number>();
  return members.map(({ decl, info }) => {
    const home = memberHome(facts.decls, info);
    const bare = `${info.file}:${home}.${info.name}`;
    const nth = (seen.get(bare) ?? 0) + 1;
    seen.set(bare, nth);
    return { decl, key: nth === 1 ? bare : `${bare}#${String(nth)}`, file: info.file, line: info.line, home, member: info.name, keys: [decl] };
  });
}

interface Found {
  readonly decl: DeclKey;
  readonly info: DeclInfo;
  readonly row: Pick<MemberRow, "key" | "file" | "line" | "home" | "member" | "origin" | "note">;
}

// A member finding with its declaration; analyse.ts files each under its own declaration's key.
function foundRow(facts: GraphFacts, keyOf: ReadonlyMap<DeclKey, string>, { key, label, note }: Finding): Found {
  const info = key !== null && isDeclKey(key) ? facts.decls.get(key) : undefined;
  const rowKey = key !== null && isDeclKey(key) ? keyOf.get(key) : undefined;
  if (info === undefined || rowKey === undefined || key === null || !isDeclKey(key)) {
    throw new Error(`member finding ${label} names no declared member`);
  }
  const origin: MemberOrigin = info.schemaKey ? "schema" : "type";
  return { decl: key, info, row: { key: rowKey, file: info.file, line: info.line, home: memberHome(facts.decls, info), member: info.name, origin, note } };
}

// The positive control of the literal search: the first wired member, in key order, named by an identifier, whose text is
// the word it is searched by. A computed or quoted name could spell no word and fail the control for that reason alone.
function wiredControl(
  wired: readonly (PromiseField & { readonly decl: DeclKey })[],
  sources: Sources,
): { readonly key: string; readonly member: string; readonly known: readonly string[] } | undefined {
  for (const { decl, key, file, member } of wired) {
    const name = sources.name(decl);
    if (isIdentifier(name)) {
      return { key, member, known: [sources.offset(file, name.pos)] };
    }
  }
  return undefined;
}

const TRPC_OUTPUT = "output";
const TRPC_MUTATION = "mutation";
const ZOD_SHAPE = "shape";

// The schema a `.output(schema)` names on a procedure chain that a later `.mutation(...)` ends: the mutation's answer.
function mutationOutputs(world: NativeWorld): readonly Node[] {
  const outputs: Node[] = [];
  for (const file of world.files.filter((source) => isProduction(world.fileOfSource(source)))) {
    const visit = (node: Node): void => {
      const [schema] = isCallExpression(node) && isPropertyAccessExpression(node.expression) && node.expression.name.text === TRPC_OUTPUT ? node.arguments : [];
      let at: Node = node;
      while (schema !== undefined && isPropertyAccessExpression(at.parent) && at.parent.expression === at && isCallExpression(at.parent.parent)) {
        if (at.parent.name.text === TRPC_MUTATION) {
          outputs.push(schema);
          break;
        }
        at = at.parent.parent;
      }
      node.forEachChild(visit);
    };
    file.forEachChild(visit);
  }
  return outputs;
}

// The declarations of the one key of each one-key mutation output schema, read off the schema's `shape`, with each
// key's `satisfies` twin: a twinned key is judged at its type's member.
function acknowledgements(world: NativeWorld, facts: GraphFacts): ReadonlySet<DeclKey> {
  const { checker } = world;
  const keys = world.batch(
    mutationOutputs(world).map(function* (schema): APIRequestGenerator<NativeSymbol | undefined> {
      const shape = yield* checker.getPropertyOfType.gen(yield* checker.getTypeAtLocation.gen(schema), ZOD_SHAPE);
      const members = shape === undefined ? [] : yield* checker.getPropertiesOfType.gen(yield* checker.getTypeOfSymbol.gen(shape));
      return members.length === 1 ? members[0] : undefined;
    }),
  );
  const own = new Set(new Resolver(world).declarations(keys).flat());
  for (const [a, b] of facts.twins) {
    if (own.has(a)) {
      own.add(b);
    } else if (own.has(b)) {
      own.add(a);
    }
  }
  return own;
}

// What a row's declaration's role sites give the report: the product's sites, and how many sites outside it use the data.
function siteFacts(facts: GraphFacts, decl: DeclKey): { readonly product: readonly RoleSite[]; readonly tests: number } {
  const sites = facts.roleSites.get(decl) ?? [];
  return {
    product: sites.filter(({ file }) => isProduction(file)),
    tests: sites.filter(({ file, role }) => !productReader(file) && USES.has(role)).length,
  };
}

const sampleOf = (sites: readonly RoleSite[], sources: Sources): readonly string[] =>
  [...sites.filter(({ role }) => role === "write"), ...sites.filter(({ role }) => READS.has(role))]
    .slice(0, SAMPLE)
    .map(({ file, at }) => sources.located(file, at));

/** Judge the member buckets of `analysis`: split them by `rulings` (reading which items are open from `root`'s
 *  docs/work), sort each row, name where it is sent, and search every dead row's name over the tree. */
export function judgeMembers(
  { root, graph, analysis, world }: { readonly root: string; readonly graph: Graph; readonly analysis: Analysis; readonly world: NativeWorld },
  rulings: MemberRulings,
): JudgedMembers {
  const { facts } = graph;
  const sources = new Sources(world);
  const members = declaredMembers(facts);
  const keyOf = new Map(members.map(({ decl, key }) => [decl, key]));
  const found = MEMBER_BUCKETS.flatMap((bucket) =>
    analysis[bucket].map((finding) => {
      const { row, ...rest } = foundRow(facts, keyOf, finding);
      return { ...rest, row: { ...row, bucket } };
    }),
  );
  const published = analysis.published.map((finding) => ({ ...foundRow(facts, keyOf, finding), cite: finding.note }));
  const reported = new Set([...found, ...published].map(({ row }) => row.key));
  const wiredHomes = new Set(members.filter(({ file, key }) => isProduction(file) && !reported.has(key)).map(({ file, home }) => `${file}:${home}`));
  const aliases = homeAliases(root);
  const promises = promiseFacts(members, carriesInto(facts), aliases);
  const promised = new Map(found.map(({ row }): [string, FieldPromise] => [row.key, promises({ ...row, line: 0, keys: [] })]));
  const sorter = new FieldSort(
    root,
    found.map(({ row }) => ({ key: row.key, home: row.home, member: row.member, onlyHome: promised.get(row.key)?.onlyHome ?? false })),
    aliases,
  );
  const sdkReceived: readonly ReceivedRow[] = published.flatMap(({ row, cite }) =>
    cite === null ? [] : [{ key: row.key, file: row.file, line: row.line, home: row.home, member: row.member, receiver: "plugin-sdk", cite }],
  );
  const facted = found.map((entry) => ({
    ...entry,
    promise: promised.get(entry.row.key) ?? { onlyHome: false, siblings: [], setting: null, namedSetting: null },
    ...siteFacts(facts, entry.decl),
    name: sources.name(entry.decl),
  }));
  // A read-only row's question is its writer, which no outside reader answers.
  const providerReceived = facted.flatMap(({ row, promise, product }): ReceivedRow[] => {
    const sentThere = row.bucket !== READ_ONLY && product.some((site) => site.role === "escape" && site.destination === PROVIDER);
    const cite = sentThere ? sorter.providerCite({ ...row, ...promise }) : null;
    return cite === null ? [] : [{ key: row.key, file: row.file, line: row.line, home: row.home, member: row.member, receiver: "provider", cite }];
  });
  const providerKeys = new Set(providerReceived.map(({ key }) => key));
  const received = [...sdkReceived, ...providerReceived];
  const judged = facted.filter(({ row }) => !providerKeys.has(row.key));
  const words = world.batch(judged.map(({ name }) => searchedWord(world, name)));
  const sorted = judged.map(({ info, row, name, promise, product, tests }, at): Sorted => {
    // two walks can send one value from one site to one destination
    const sent = [...new Set(product.flatMap((site) => sendLine(site, sources)))];
    const handAuthored = product.some(({ role, file, at: site }) => role === "write" && sources.handWritten(file, site));
    const { verdict, evidence } = sorter.sort({ ...row, ...promise, handAuthored, siblingsUsed: wiredHomes.has(`${row.file}:${row.home}`), sent });
    const known = [sources.offset(info.file, name.pos), ...product.map((site) => sources.offset(site.file, site.at))];
    const sample = sampleOf(product, sources);
    return { ...row, tests, sample, sent, verdict, evidence, known, neverWritten: row.bucket === READ_ONLY, word: words[at] ?? null };
  });
  const control = wiredControl(
    members.filter(({ file, key }) => isProduction(file) && !reported.has(key)).sort((a, b) => a.key.localeCompare(b.key)),
    sources,
  );
  const searched = sorted.flatMap((row) => (row.word === null ? [] : [{ ...row, member: row.word }]));
  const staged =
    control === undefined ? { rows: searched.map((row) => ({ ...row, literal: null })), stage: null } : literalStage(root, world, searched, control);
  const literals = new Map(searched.map((row, at) => [row.key, staged.rows[at]] as const));
  const rows = sorted.map(({ known: _known, neverWritten: _neverWritten, word: _word, ...row }): MemberRow => {
    const searchedRow = literals.get(row.key);
    return { ...row, verdict: searchedRow?.verdict ?? row.verdict, literal: searchedRow?.literal ?? null };
  });
  const acknowledging = acknowledgements(world, facts);
  const acknowledgedKeys = new Set(judged.filter(({ decl, row }) => NEVER_READ.has(row.bucket) && acknowledging.has(decl)).map(({ row }) => row.key));
  const { unwired, deliberate } = sortDeliberate(rows, rulings.deliberate);
  const split = sortJudged(
    unwired.filter(({ bucket, key }) => bucket !== VALIDATED && !acknowledgedKeys.has(key)),
    { root, judged: rulings.judged },
  );
  return {
    ...split,
    deliberate,
    validated: unwired.filter(({ bucket }) => bucket === VALIDATED),
    acknowledged: unwired.filter(({ key }) => acknowledgedKeys.has(key)),
    received,
    literalStage: staged.stage,
  };
}
