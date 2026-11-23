// The member findings judged the way the fields scan judges its rows. A member the deliberate list names reports apart
// with its reason, a row an open board item owns reports apart with that item, and a judged entry whose row is gone or
// whose item is closed is stale. A schema key that only validates outside input reports apart and is never judged. Each
// other row carries its proposed sort (field-sort.ts), every place its value is sent, and the literal search of a row
// the sort calls dead (literal-hits.ts). A row's key is the fields scan's `file:Home.member`, so one judged list serves both.
//
// - A row's own sites are its declaration's name and every production site the build recorded for it (state.ts
//   roleSites), as the word offsets the literal search reports: those hits are no new evidence.
import type { JsxAttribute, Node, PropertyAssignment, PropertyDeclaration, SourceFile } from "@typescript/native/ast";
import {
  getTokenAtPosition,
  isArrayLiteralExpression,
  isAsExpression,
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
import { literalStage } from "../literal-hits.ts";
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
const QUOTES: ReadonlySet<string> = new Set(['"', "'", "`"]);

const isMember = (info: DeclInfo): boolean => MEMBER_KINDS.has(info.kind) || info.schemaKey;

// A row before its literal search, with what the search needs.
type Sorted = Omit<MemberRow, "literal"> & { readonly known: readonly string[]; readonly neverWritten: boolean };

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

  // A role site's `at` is its node's start with trivia; the search reports the word, inside a key's quotes.
  offset(file: string, at: number): string {
    const text = this.#source(file)?.text ?? "";
    const start = skipTrivia(text, at);
    return `${file}:${String(QUOTES.has(text.charAt(start)) ? start + 1 : start)}`;
  }

  // The word offset of a declaration's own name: its first whole-word spelling inside the declaration's span.
  declared(key: DeclKey, name: string): string {
    const { file, pos, end } = declKeyParts(key);
    const text = this.#source(file)?.text ?? "";
    const word = new RegExp(`(?<![\\w$])${name.replaceAll("$", "\\$")}(?![\\w$])`, "u");
    const found = word.exec(text.slice(pos, end));
    return `${file}:${String(found === null ? pos : pos + found.index)}`;
  }

  located(file: string, at: number): string {
    const source = this.#source(file);
    return source === undefined || at === 0 ? file : `${file}:${String(source.getLineAndCharacterOfPosition(at).line + 1)}`;
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
  for (const [slot, values] of facts.flows) {
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

// Every member the graph declares, as the promise test and the sibling test read it.
function declaredMembers(facts: GraphFacts): readonly (PromiseField & { readonly decl: DeclKey })[] {
  return [...facts.decls].flatMap(([decl, info]) => {
    if (!isMember(info)) {
      return [];
    }
    const home = memberHome(facts.decls, info.holder);
    return [{ decl, key: `${info.file}:${home}.${info.name}`, file: info.file, line: info.line, home, member: info.name, keys: [decl] }];
  });
}

interface Found {
  readonly decl: DeclKey;
  readonly info: DeclInfo;
  readonly row: Pick<MemberRow, "key" | "bucket" | "file" | "home" | "member" | "note">;
}

// The member findings with their declarations; analyse.ts files each under its own declaration's key.
function foundRows(facts: GraphFacts, analysis: Analysis): readonly Found[] {
  return MEMBER_BUCKETS.flatMap((bucket) =>
    analysis[bucket].map(({ key, label, note }): Found => {
      const info = key !== null && isDeclKey(key) ? facts.decls.get(key) : undefined;
      if (info === undefined || key === null || !isDeclKey(key)) {
        throw new Error(`member finding ${label} names no declaration`);
      }
      const home = memberHome(facts.decls, info.holder);
      return { decl: key, info, row: { key: `${info.file}:${home}.${info.name}`, bucket, file: info.file, home, member: info.name, note } };
    }),
  );
}

/** Judge the member buckets of `analysis`: split them by `rulings` (reading which items are open from `root`'s
 *  docs/work), sort each row, name where it is sent, and search every dead row's name over the tree. */
export function judgeMembers(
  { root, graph, analysis, world }: { readonly root: string; readonly graph: Graph; readonly analysis: Analysis; readonly world: NativeWorld },
  rulings: MemberRulings,
): JudgedMembers {
  const { facts } = graph;
  const sources = new Sources(world);
  const found = foundRows(facts, analysis);
  const reported = new Set(found.map(({ row }) => row.key));
  const members = declaredMembers(facts);
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
  const knownOf = (decl: DeclKey, info: DeclInfo): readonly string[] => [
    sources.declared(decl, info.name),
    ...ownSites(decl).map(({ file, at }) => sources.offset(file, at)),
  ];
  const sorted = found.map(({ decl, info, row }): Sorted => {
    const sites = ownSites(decl);
    const sent = sites.flatMap((site) => sendLine(site, sources));
    const handAuthored = sites.some(({ role, file, at }) => role === "write" && sources.handWritten(file, at));
    const promise = promised.get(row.key) ?? { onlyHome: false, siblings: [], setting: null, namedSetting: null };
    const { verdict, evidence } = sorter.sort({ ...row, ...promise, handAuthored, siblingsUsed: wiredHomes.has(`${row.file}:${row.home}`), sent });
    return { ...row, sent, verdict, evidence, known: knownOf(decl, info), neverWritten: row.bucket === READ_ONLY };
  });
  const control = members.filter(({ file, key }) => isProduction(file) && !reported.has(key)).sort((a, b) => a.key.localeCompare(b.key))[0];
  const controlInfo = control === undefined ? undefined : facts.decls.get(control.decl);
  const staged =
    control === undefined || controlInfo === undefined
      ? { rows: sorted.map((row) => ({ ...row, literal: null })), stage: null }
      : literalStage(root, world, sorted, { key: control.key, member: control.member, known: [sources.declared(control.decl, controlInfo.name)] });
  const rows = staged.rows.map(({ known: _known, neverWritten: _neverWritten, ...row }): MemberRow => row);
  const { unwired, deliberate } = sortDeliberate(rows, rulings.deliberate);
  const split = sortJudged(
    unwired.filter(({ bucket }) => bucket !== VALIDATED),
    { root, judged: rulings.judged },
  );
  return { ...split, deliberate, validated: unwired.filter(({ bucket }) => bucket === VALIDATED), literalStage: staged.stage };
}
