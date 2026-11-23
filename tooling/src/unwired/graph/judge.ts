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
import type { JsxAttribute, Node, PropertyAssignment, PropertyDeclaration, SourceFile } from "@typescript/native/ast";
import {
  getTokenAtPosition,
  isArrayLiteralExpression,
  isAsExpression,
  isIdentifier,
  isJsxAttribute,
  isNoSubstitutionTemplateLiteral,
  isNumericLiteral,
  isObjectLiteralExpression,
  isParenthesizedExpression,
  isPropertyAssignment,
  isPropertyDeclaration,
  isSatisfiesExpression,
  isSourceFile,
  isStringLiteral,
  isTemplateExpression,
  SyntaxKind,
  skipTrivia,
} from "@typescript/native/ast";
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
import type { Analysis, MemberBucket } from "./analyse.ts";
import { MEMBER_BUCKETS, memberHome } from "./analyse.ts";
import type { Graph } from "./build.ts";
import type { DeclKey } from "./resolve.ts";
import { declKeyParts } from "./resolve.ts";
import type { DeclInfo } from "./sites.ts";
import { isDeclKey, MEMBER_KINDS } from "./sites.ts";
import type { GraphFacts, RoleSite } from "./state.ts";
import { declaredNameOf } from "./verify.ts";
import { siteLine } from "./why.ts";

/** The lists a member row is judged by. */
export interface MemberRulings {
  readonly deliberate: readonly DeliberateEntry[];
  readonly judged: readonly JudgedEntry[];
}

/** No ruling: every member row reports as unwired. */
export const NO_RULINGS: MemberRulings = { deliberate: [], judged: [] };

/** One member finding as a row the lists can name, with its sort, its sends and its literal search. */
interface MemberRow {
  readonly key: string;
  readonly bucket: MemberBucket;
  readonly file: string;
  readonly home: string;
  readonly member: string;
  readonly note: string | null;
  /** Each place the member's value leaves the process, `destination file:line`, then the receiver when one is named. */
  readonly sent: readonly string[];
  readonly verdict: Verdict;
  readonly evidence: SortEvidence;
  /** The literal search of a row the sort called dead; null for a row it sorted otherwise. */
  readonly literal: LiteralEvidence | null;
}

/** The member rows split by the deliberate and judged lists, the validate-only schema keys apart. */
export type JudgedMembers = JudgedSplit<MemberRow> & {
  readonly deliberate: readonly (MemberRow & { readonly reason: string })[];
  readonly validated: readonly MemberRow[];
  /** The literal search over every dead row, or null for a root with no git index or no wired member to control it. */
  readonly literalStage: LiteralStage | null;
};

const VALIDATED: MemberBucket = "member-validated";
const READ_ONLY: MemberBucket = "member-read-only";

const isMember = (info: DeclInfo): boolean => MEMBER_KINDS.has(info.kind) || info.schemaKey;

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
// under one home, each its own row: they are numbered in source order as the fields scan numbers them
// (fields.ts uniquelyKeyed), the first keeping the bare key.
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
  readonly row: Pick<MemberRow, "key" | "bucket" | "file" | "home" | "member" | "note">;
}

// The member findings with their declarations; analyse.ts files each under its own declaration's key.
function foundRows(facts: GraphFacts, analysis: Analysis, keyOf: ReadonlyMap<DeclKey, string>): readonly Found[] {
  return MEMBER_BUCKETS.flatMap((bucket) =>
    analysis[bucket].map(({ key, label, note }): Found => {
      const info = key !== null && isDeclKey(key) ? facts.decls.get(key) : undefined;
      const rowKey = key !== null && isDeclKey(key) ? keyOf.get(key) : undefined;
      if (info === undefined || rowKey === undefined || key === null || !isDeclKey(key)) {
        throw new Error(`member finding ${label} names no declared member`);
      }
      return { decl: key, info, row: { key: rowKey, bucket, file: info.file, home: memberHome(facts.decls, info), member: info.name, note } };
    }),
  );
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

/** Judge the member buckets of `analysis`: split them by `rulings` (reading which items are open from `root`'s
 *  docs/work), sort each row, name where it is sent, and search every dead row's name over the tree. */
export function judgeMembers(
  { root, graph, analysis, world }: { readonly root: string; readonly graph: Graph; readonly analysis: Analysis; readonly world: NativeWorld },
  rulings: MemberRulings,
): JudgedMembers {
  const { facts } = graph;
  const sources = new Sources(world);
  const members = declaredMembers(facts);
  const found = foundRows(facts, analysis, new Map(members.map(({ decl, key }) => [decl, key])));
  const reported = new Set(found.map(({ row }) => row.key));
  const wiredHomes = new Set(members.filter(({ file, key }) => isProduction(file) && !reported.has(key)).map(({ file, home }) => `${file}:${home}`));
  const aliases = homeAliases(root);
  const promises = promiseFacts(members, carriesInto(facts), aliases);
  const promised = new Map(found.map(({ row }): [string, FieldPromise] => [row.key, promises({ ...row, line: 0, keys: [] })]));
  const sorter = new FieldSort(
    root,
    found.map(({ row }) => ({ key: row.key, home: row.home, member: row.member, onlyHome: promised.get(row.key)?.onlyHome ?? false })),
    aliases,
  );
  const ownSites = (decl: DeclKey): readonly RoleSite[] => (facts.roleSites.get(decl) ?? []).filter(({ file }) => isProduction(file));
  const named = found.map((entry) => ({ ...entry, name: sources.name(entry.decl) }));
  const words = world.batch(named.map(({ name }) => searchedWord(world, name)));
  const sorted = named.map(({ decl, info, row, name }, at): Sorted => {
    const sites = ownSites(decl);
    const sent = sites.flatMap((site) => sendLine(site, sources));
    const handAuthored = sites.some(({ role, file, at: site }) => role === "write" && sources.handWritten(file, site));
    const promise = promised.get(row.key) ?? { onlyHome: false, siblings: [], setting: null, namedSetting: null };
    const { verdict, evidence } = sorter.sort({ ...row, ...promise, handAuthored, siblingsUsed: wiredHomes.has(`${row.file}:${row.home}`), sent });
    const known = [sources.offset(info.file, name.pos), ...sites.map((site) => sources.offset(site.file, site.at))];
    return { ...row, sent, verdict, evidence, known, neverWritten: row.bucket === READ_ONLY, word: words[at] ?? null };
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
  const { unwired, deliberate } = sortDeliberate(rows, rulings.deliberate);
  const split = sortJudged(
    unwired.filter(({ bucket }) => bucket !== VALIDATED),
    { root, judged: rulings.judged },
  );
  return { ...split, deliberate, validated: unwired.filter(({ bucket }) => bucket === VALIDATED), literalStage: staged.stage };
}
