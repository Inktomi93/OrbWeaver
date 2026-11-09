// Literal hits of a name across the tracked tree: one `git grep` for many names, each hit classified by where it sits.
// TS and JS files are classified by the parser; other files by type. A literal search sees reads the compiler cannot:
// a JSON scenario, a template, a plugin bundle, a script.
import { existsSync } from "node:fs";
import { extname, join } from "node:path";
import ts from "typescript";
import { execGit, runGit } from "../floor/git/git.ts";
import type { Sources } from "./classify.ts";
import type { Verdict } from "./field-sort.ts";

const DEAD: Verdict = "dead";
const ASK: Verdict = "ask";

// A short name's word match spans the whole tree.
const GREP_BUFFER = 268_435_456;
const HIT_LINE = /^([^:]+):(\d+):(.*)$/u;

/** One line `git grep -n` printed. */
export interface GrepLine {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

/** `git grep -n` over `paths` at `rev`, or over the working tree's tracked files when `rev` is null. Exit 1 is no match,
 *  an answer; any other failure throws with its arguments and the child's error. */
export function gitGrep(root: string, rev: string | null, args: readonly string[], paths: readonly string[] = []): readonly GrepLine[] {
  const result = runGit(root, ["grep", "-n", ...args, ...(rev === null ? [] : [rev]), "--", ...paths], { maxBuffer: GREP_BUFFER });
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`git grep ${args.join(" ")} failed (${result.errorCode ?? `exit ${String(result.status)}`}): ${result.stderr.trim()}`);
  }
  const prefix = rev === null ? 0 : rev.length + 1;
  return result.stdout
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => {
      const [, file = "", number = "0", text = ""] = HIT_LINE.exec(line.slice(prefix)) ?? [];
      return { file, line: Number(number), text };
    });
}

const HIT_KINDS = ["code", "string", "comment", "tsdoc", "type", "json-key", "json-value", "doc", "other"] as const;
/** Where a hit sits. `code`: an identifier, a property read or write, a destructure. `type`: a type-only position, an
 *  interface or type member included. `json-key`/`json-value`: a JSON or YAML key or value. `doc`: Markdown or plain text.
 *  `other`: a file of another type, such as a script or a stylesheet. */
type HitKind = (typeof HIT_KINDS)[number];

/** One hit: `path:line`, its kind, and whether a test file holds it. */
interface LiteralHit {
  readonly at: string;
  readonly kind: HitKind;
  readonly test: boolean;
  /** The parsed file's offset of the hit, `file:offset`, or null in a file the parser does not read. */
  readonly offset: string | null;
  /** A code hit that writes a key: an object literal key or shorthand, a JSX attribute, an assignment's target member. */
  readonly write: boolean;
}

const PARSED = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
const JSON_FILES = new Set([".json", ".jsonc", ".json5"]);
const YAML_FILES = new Set([".yaml", ".yml"]);
const DOC_FILES = new Set([".md", ".mdx", ".txt", ".rst"]);
const TEST_FILE = /^tests\/|\/__tests__\/|\.(?:test|spec)(?:-d)?\.[cm]?[jt]sx?$/u;
const STRING_KINDS: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.RegularExpressionLiteral,
  ts.SyntaxKind.JsxText,
]);

const escaped = (name: string): string => name.replaceAll(/\$/gu, String.raw`\$`);
const wordsOf = (names: readonly string[]): RegExp => new RegExp(String.raw`(?<![\w$])(?:${names.map(escaped).join("|")})(?![\w$])`, "gu");

const isTypePosition = (node: ts.Node): boolean =>
  ts.findAncestor(node, (up) => ts.isTypeNode(up) || ts.isInterfaceDeclaration(up) || ts.isTypeAliasDeclaration(up) || ts.isHeritageClause(up)) !== undefined;

// The innermost node or token whose full span holds `position`; a position before its start sits in its leading trivia.
// Tokens count: a comment before a closing brace or inside a JSX `{/* … */}` is the trivia of that token, not of a node.
function leafAt(source: ts.SourceFile, position: number): ts.Node {
  let found: ts.Node = source;
  for (let children = source.getChildren(source); ; ) {
    const holder = children.find((child) => position >= child.getFullStart() && position < child.getEnd());
    if (holder === undefined) {
      break;
    }
    found = holder;
    children = holder.getChildren(source);
  }
  return found === source ? source.endOfFileToken : found;
}

function commentKind(source: ts.SourceFile, position: number, leaf: ts.Node): HitKind {
  const text = source.getFullText();
  const ranges = [...(ts.getLeadingCommentRanges(text, leaf.getFullStart()) ?? []), ...(ts.getTrailingCommentRanges(text, leaf.getEnd()) ?? [])];
  const range = ranges.find((candidate) => position >= candidate.pos && position < candidate.end);
  if (range === undefined) {
    // Text the parser holds in no token, such as JSX whitespace or a shebang, reads as code to stay on the saving side.
    return "code";
  }
  return text.startsWith("/**", range.pos) ? "tsdoc" : "comment";
}

// A name that gives a key its value: an object literal key or shorthand, a JSX attribute, or `x.name = …`.
function writesKey(leaf: ts.Node): boolean {
  const { parent } = leaf;
  if ((ts.isPropertyAssignment(parent) || ts.isShorthandPropertyAssignment(parent) || ts.isJsxAttribute(parent)) && parent.name === leaf) {
    return true;
  }
  const assigned = parent.parent;
  return (
    ts.isPropertyAccessExpression(parent) &&
    parent.name === leaf &&
    ts.isBinaryExpression(assigned) &&
    assigned.left === parent &&
    assigned.operatorToken.kind === ts.SyntaxKind.EqualsToken
  );
}

function parsedKind(source: ts.SourceFile, position: number): { readonly kind: HitKind; readonly write: boolean } {
  const leaf = leafAt(source, position);
  if (position < leaf.getStart(source)) {
    return { kind: commentKind(source, position, leaf), write: false };
  }
  if (STRING_KINDS.has(leaf.kind)) {
    return { kind: "string", write: writesKey(leaf) };
  }
  return isTypePosition(leaf) ? { kind: "type", write: false } : { kind: "code", write: writesKey(leaf) };
}

// A JSON or YAML key is the word followed by its colon, quoted or not.
function dataKind(text: string, index: number, name: string): HitKind {
  const after = text.slice(index + name.length);
  return /^["']?\s*:/u.test(after) ? "json-key" : "json-value";
}

function fileKind(file: string): "parsed" | "json" | "doc" | "other" {
  const extension = extname(file);
  if (PARSED.has(extension)) {
    return "parsed";
  }
  if (JSON_FILES.has(extension) || YAML_FILES.has(extension)) {
    return "json";
  }
  return DOC_FILES.has(extension) || file.startsWith("docs/") ? "doc" : "other";
}

/** What one search over the tracked tree found. */
interface LiteralSearch {
  /** Tracked files the search covered. */
  readonly files: number;
  /** Ignored paths `git ls-files` leaves out, directories counted once: node_modules, build output, reports. */
  readonly ignored: number;
  /** Each name's hits, every occurrence on a line classified on its own. */
  readonly hits: ReadonlyMap<string, readonly LiteralHit[]>;
}

/** Search the working tree's tracked files for each name as a whole word, or null for a root with no git index. */
function literalHits(root: string, sources: Sources, names: readonly string[]): LiteralSearch | null {
  if (!existsSync(join(root, ".git"))) {
    return null;
  }
  const wanted = [...new Set(names)].filter((name) => name !== "");
  const files = execGit(root, ["ls-files", "-z"]).split("\0").filter(Boolean).length;
  const ignored = execGit(root, ["ls-files", "-z", "--others", "--ignored", "--exclude-standard", "--directory"]).split("\0").filter(Boolean).length;
  const hits = new Map<string, LiteralHit[]>(wanted.map((name) => [name, []]));
  if (wanted.length === 0) {
    return { files, ignored, hits };
  }
  const words = wordsOf(wanted);
  const seen = new Set<string>();
  for (const grepped of gitGrep(root, null, ["-I", "-w", "-F", ...wanted.flatMap((name) => ["-e", name])])) {
    for (const [name, hit] of lineHits(sources, grepped, words)) {
      const key = `${name} ${hit.offset ?? hit.at} ${hit.kind}`;
      if (!seen.has(key)) {
        seen.add(key);
        hits.get(name)?.push(hit);
      }
    }
  }
  return { files, ignored, hits };
}

// Every occurrence of a wanted name on one grepped line, classified where it sits.
function lineHits(sources: Sources, { file, line, text }: GrepLine, words: RegExp): readonly (readonly [string, LiteralHit])[] {
  const type = fileKind(file);
  const source = type === "parsed" ? sources.get(file) : null;
  const lineStart = source === null ? 0 : source.getPositionOfLineAndCharacter(line - 1, 0);
  const at = `${file}:${String(line)}`;
  const test = TEST_FILE.test(file);
  const hitAt = (index: number, name: string): LiteralHit => {
    if (source !== null) {
      return { at, test, offset: `${file}:${String(lineStart + index)}`, ...parsedKind(source, lineStart + index) };
    }
    if (type === "json") {
      return { at, test, offset: null, kind: dataKind(text, index, name), write: false };
    }
    return { at, test, offset: null, kind: type === "doc" ? "doc" : "other", write: false };
  };
  return [...text.matchAll(words)].map((match) => [match[0], hitAt(match.index, match[0])] as const);
}

const SAVING: ReadonlySet<HitKind> = new Set<HitKind>(["code", "string", "json-key", "other"]);

// Whether a hit can be a real read: live code, a string, a data key, a file of another type, or a type read in a test.
// A comment, TSDoc, a doc or a data value only mentions the name.
const savesRow = (hit: LiteralHit): boolean => SAVING.has(hit.kind) || (hit.kind === "type" && hit.test);

// A common name hits thousands of lines; the row keeps every count and this many hits, the saving ones first.
const KEPT_HITS = 25;

/** One row's literal evidence. A dead row's hits that save nothing are stale mentions its deletion removes or repoints. */
export interface LiteralEvidence {
  /** `0 literal hits over N files` for a row with none; a never-written row with no saving hit adds `no writer`. */
  readonly note: string | null;
  /** Some hit can be a real read, so the row moved from dead to ask. */
  readonly saved: boolean;
  readonly counts: Readonly<Partial<Record<HitKind, number>>>;
  readonly hits: readonly { readonly at: string; readonly kind: HitKind; readonly scope: "test" | "product" }[];
  /** For a never-written row, up to {@link KEPT_HITS} hits that write a key of its name: the writers a person checks. */
  readonly writers: readonly string[];
  /** Hits at the row's own known sites, left out: its declarations and the sites the scan already recorded. */
  readonly own: number;
}

/** What the stage did over one run. */
export interface LiteralStage {
  readonly files: number;
  readonly ignored: number;
  /** A wired field's name through the same search: zero hits fails the run, since the search would be broken. */
  readonly control: { readonly key: string; readonly hits: number };
  readonly deadBefore: number;
  readonly deadAfter: number;
  /** Rows moved to ask, counted under each saving kind they hit. */
  readonly movedBy: Readonly<Partial<Record<HitKind, number>>>;
  /** Rows that stay dead with stale mentions to clean up. */
  readonly staleOnly: number;
  /** Hits left out across every searched row because they sit at the row's own known sites. */
  readonly ownHits: number;
  /** Never-written rows the stage searched, by where they ended. */
  readonly neverWritten: { readonly ask: number; readonly dead: number };
}

interface StageRow {
  readonly member: string;
  readonly verdict: Verdict;
  /** `file:offset` of the row's declarations and of every site the scan recorded for it, which are no new evidence. */
  readonly known: readonly string[];
  /** The question is a writer rather than a reader. */
  readonly neverWritten: boolean;
}

// One row's hits outside its known sites, and how many sat at them.
function searched(search: LiteralSearch, member: string, known: ReadonlySet<string>): { readonly hits: readonly LiteralHit[]; readonly own: number } {
  const all = search.hits.get(member) ?? [];
  const hits = all.filter((hit) => hit.offset === null || !known.has(hit.offset));
  return { hits, own: all.length - hits.length };
}

function evidenceOf(row: StageRow, hits: readonly LiteralHit[], own: number, files: number): LiteralEvidence {
  const saving = hits.filter(savesRow);
  const empty = hits.length === 0 ? `0 literal hits over ${String(files)} files` : null;
  const unwritten = row.neverWritten && saving.length === 0 ? `no writer and 0 saving literal hits over ${String(files)} files` : null;
  return {
    note: unwritten ?? empty,
    saved: saving.length > 0,
    counts: countKinds(hits),
    hits: [...saving, ...hits.filter((hit) => !savesRow(hit))]
      .slice(0, KEPT_HITS)
      .map(({ at, kind, test }) => ({ at, kind, scope: test ? "test" : "product" })),
    writers: row.neverWritten
      ? hits
          .filter((hit) => hit.write)
          .slice(0, KEPT_HITS)
          .map((hit) => hit.at)
      : [],
    own,
  };
}

function countKinds(hits: readonly LiteralHit[]): Partial<Record<HitKind, number>> {
  const counts: Partial<Record<HitKind, number>> = {};
  for (const { kind } of hits) {
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return counts;
}

/** Search every dead row's member name over the tracked tree and move a row with a hit that can be a read to ask. A
 *  row's own known sites are no hit: the stage looks for what the scan missed. Null stage for a root with no git index,
 *  which leaves every row as it was. */
export function literalStage<Row extends StageRow>(
  root: string,
  sources: Sources,
  rows: readonly Row[],
  control: { readonly key: string; readonly member: string; readonly known: readonly string[] },
): { readonly rows: readonly (Row & { readonly literal: LiteralEvidence | null })[]; readonly stage: LiteralStage | null } {
  const dead = rows.filter((row) => row.verdict === DEAD);
  const search = literalHits(root, sources, [control.member, ...dead.map((row) => row.member)]);
  if (search === null) {
    return { rows: rows.map((row) => ({ ...row, literal: null })), stage: null };
  }
  const controlHits = searched(search, control.member, new Set(control.known)).hits.filter(savesRow).length;
  if (controlHits === 0) {
    throw new Error(`literal stage: the wired control ${control.key} has no hit outside its declaration, so the search is broken`);
  }
  const movedBy: Partial<Record<HitKind, number>> = {};
  let staleOnly = 0;
  let ownHits = 0;
  const staged = rows.map((row) => {
    if (row.verdict !== DEAD) {
      return { ...row, literal: null };
    }
    const { hits, own } = searched(search, row.member, new Set(row.known));
    ownHits += own;
    const literal = evidenceOf(row, hits, own, search.files);
    for (const kind of new Set(hits.filter(savesRow).map((hit) => hit.kind))) {
      movedBy[kind] = (movedBy[kind] ?? 0) + 1;
    }
    if (!literal.saved && hits.length > 0) {
      staleOnly++;
    }
    return { ...row, verdict: literal.saved ? ASK : row.verdict, literal };
  });
  const unwritten = staged.filter((row) => row.neverWritten && row.literal !== null);
  return {
    rows: staged,
    stage: {
      files: search.files,
      ignored: search.ignored,
      control: { key: control.key, hits: controlHits },
      deadBefore: dead.length,
      deadAfter: staged.filter((row) => row.verdict === DEAD).length,
      movedBy,
      staleOnly,
      ownHits,
      neverWritten: { ask: unwritten.filter((row) => row.verdict === ASK).length, dead: unwritten.filter((row) => row.verdict === DEAD).length },
    },
  };
}
