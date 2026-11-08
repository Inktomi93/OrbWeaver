// A proposed sort of each reported field into dead, forgotten or ask, from four pieces of evidence. The judgment items
// decide; the sort says which rows need a person first. History and promises are matched to the field's home, not its bare name.

import { existsSync, globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { execGit } from "../floor/git/git.ts";
import type { SendDestination } from "./boundaries.ts";
import type { Site, Sources } from "./classify.ts";
import { nameAt } from "./classify.ts";
import { typeNameOf } from "./plugin-surface.ts";

const VERDICTS = ["dead", "forgotten", "ask"] as const;
/** `dead`: no promise and no outside receiver. `forgotten`: a promise and a hand-written value or used siblings, and no
 *  reader ever: an unfinished feature. `ask`: a removed reader, an outside receiver, or a settings key of the same name
 *  no flow connects, which a person must judge. */
export type Verdict = (typeof VERDICTS)[number];

/** The four tests behind a verdict. */
export interface SortEvidence {
  /** `commit file`: the newest removed read of the member in a file that named its home then, or null. */
  readonly readerHistory: string | null;
  /** Some write gives the field a literal value rather than copying another value. */
  readonly handAuthored: boolean;
  /** Another field of the same home is wired. */
  readonly siblingsUsed: boolean;
  /** Where a doc or README names `Home.member`, the member alone when one home declares it, or a setting feeds it, `file:line`. */
  readonly promise: string | null;
  /** A settings key of the same name that no flow carries into this field, `file:line`: a mirror the scan cannot see. */
  readonly unseenMirror: string | null;
}

// History of the package sources only: a reader is production code, and docs name members without reading them.
const HISTORY_ARGS = ["log", "-p", "-U0", "--no-merges", "--no-renames", "--format=@@C%h", "--", "packages"] as const;
const HISTORY_BUFFER = 1_073_741_824;
const COMMIT_MARK = "@@C";
const OLD_FILE = "--- a/";
const READ_NAME = /[.?]\.?([A-Za-z_$][\w$]*)\b(?!\s*=[^=>])/gu;
const COMMENT_LINE = /^\s*(?:\/\/|\/?\*)/u;
// `git cat-file --batch` prints each blob after this mark and the request's index, so the split needs no byte counts.
const BLOB_MARK = /^@@B (\d+)$/mu;
const BLOB_FORMAT = "--batch=@@B %(rest)";
// One batch holds a bounded slice of the parents' blobs (about 18 MB of the 200 MB the history reaches).
const BLOB_CHUNK = 1000;
// `type X = z.infer<typeof H>`, `type X = H;` and `H as X`: the names a home also goes by.
const ALIAS_GREP = String.raw`(type \w+ = (z\.(infer|input|output)<typeof )?\w+[>;])|(\w+ as \w+)`;
const TYPE_ALIAS = /type (\w+) = (?:z\.(?:infer|input|output)<typeof )?(\w+)[>;]/gu;
const RENAMED = /\b(\w+) as (\w+)\b/gu;
// A type or schema name; `x as const` and `y as string` name no home.
const HOME_NAME = /^(?:[A-Z]\w{2,}|\w+Schema)$/u;
const SCHEMA = "Schema";
const PROMISE_DOCS = ["docs/law/**/*.md", "docs/adr/**/*.md", "packages/**/README.md", "README.md"] as const;
const BACKTICKED = /`([^`\s]+)`/gu;

/** One reported field as the sort's history and promise tests read it. */
interface Owned {
  readonly key: string;
  readonly home: string;
  readonly member: string;
  /** No other scanned home declares a member of this name, so a bare mention or read can only mean this field. */
  readonly onlyHome: boolean;
}

interface Removal {
  readonly commit: string;
  readonly file: string;
}

const blobId = ({ commit, file }: Removal): string => `${commit}^:${file}`;

// Every name the tree gives another name: each alias recorded under both of its names.
function homeAliases(root: string): ReadonlyMap<string, ReadonlySet<string>> {
  const aliases = new Map<string, Set<string>>();
  const pair = (a: string, b: string): void => {
    if (HOME_NAME.test(a) && HOME_NAME.test(b)) {
      aliases.set(a, (aliases.get(a) ?? new Set()).add(b));
      aliases.set(b, (aliases.get(b) ?? new Set()).add(a));
    }
  };
  // A tree outside git has no index to grep.
  if (!existsSync(join(root, ".git"))) {
    return aliases;
  }
  const text = execGit(root, ["grep", "-h", "-E", ALIAS_GREP, "--", "packages"], { maxBuffer: HISTORY_BUFFER });
  for (const pattern of [TYPE_ALIAS, RENAMED]) {
    for (const [, from = "", to = ""] of text.matchAll(pattern)) {
      pair(from, to);
    }
  }
  return aliases;
}

/** The names a home is spelled by in source: its own, its schema or type twin, and the aliases the tree gives either. */
function homeNames(home: string, aliases: ReadonlyMap<string, ReadonlySet<string>>): readonly string[] {
  const [head = ""] = home.split(".");
  const twin = head.endsWith(SCHEMA) ? typeNameOf(head) : `${head.charAt(0).toLowerCase()}${head.slice(1)}${SCHEMA}`;
  return [...new Set([head, twin, ...(aliases.get(head) ?? []), ...(aliases.get(twin) ?? [])])];
}

// The member names a diff line reads, when it is a removed line of code. A comment that names `x.member` reads nothing.
const removedNames = (line: string): readonly string[] =>
  line.startsWith("-") && !line.startsWith("---") && !COMMENT_LINE.test(line.slice(1)) ? [...line.matchAll(READ_NAME)].map(([, name = ""]) => name) : [];

// Each member's removed reads, newest first, one per commit and file.
function removedReads(root: string, members: ReadonlySet<string>): ReadonlyMap<string, readonly Removal[]> {
  const text = execGit(root, HISTORY_ARGS, { maxBuffer: HISTORY_BUFFER });
  const found = new Map<string, Removal[]>();
  const seen = new Set<string>();
  let commit = "";
  let file = "";
  for (const line of text.split("\n")) {
    if (line.startsWith(COMMIT_MARK)) {
      commit = line.slice(COMMIT_MARK.length);
    } else if (line.startsWith(OLD_FILE)) {
      file = line.slice(OLD_FILE.length);
    }
    const removal: Removal = { commit, file };
    for (const name of removedNames(line).filter((candidate) => members.has(candidate) && !seen.has(`${candidate} ${blobId(removal)}`))) {
      seen.add(`${name} ${blobId(removal)}`);
      const list = found.get(name) ?? [];
      list.push(removal);
      found.set(name, list);
    }
  }
  return found;
}

// The parent-commit text of each removal's file, by its index in `removals`, one bounded batch at a time.
function* parentBlobs(root: string, removals: readonly Removal[]): Generator<readonly [number, string]> {
  for (let start = 0; start < removals.length; start += BLOB_CHUNK) {
    const input = removals
      .slice(start, start + BLOB_CHUNK)
      .map(({ commit, file }, at) => `${commit}^:${file} ${String(start + at)}\n`)
      .join("");
    const parts = execGit(root, ["cat-file", BLOB_FORMAT], { input, maxBuffer: HISTORY_BUFFER }).split(BLOB_MARK);
    for (let at = 1; at < parts.length; at += 2) {
      yield [Number(parts[at]), parts[at + 1] ?? ""];
    }
  }
}

const wordOf = (names: readonly string[]): RegExp => new RegExp(String.raw`\b(?:${names.map((name) => name.replaceAll("$", "\\$")).join("|")})\b`, "u");

interface BlobRequests {
  readonly removals: readonly Removal[];
  readonly indexOf: ReadonlyMap<string, number>;
  readonly asking: ReadonlyMap<number, readonly { readonly key: string; readonly home: RegExp }[]>;
}

// Each distinct parent blob once, and per blob the fields whose member a removal there read, with their home's names.
function blobRequests(
  fields: readonly Owned[],
  reads: ReadonlyMap<string, readonly Removal[]>,
  aliases: ReadonlyMap<string, ReadonlySet<string>>,
): BlobRequests {
  const removals: Removal[] = [];
  const indexOf = new Map<string, number>();
  const asking = new Map<number, { readonly key: string; readonly home: RegExp }[]>();
  for (const field of fields.filter(({ onlyHome }) => !onlyHome)) {
    const home = wordOf(homeNames(field.home, aliases));
    for (const removal of reads.get(field.member) ?? []) {
      const at = indexOf.get(blobId(removal)) ?? removals.push(removal) - 1;
      indexOf.set(blobId(removal), at);
      const list = asking.get(at) ?? [];
      list.push({ key: field.key, home });
      asking.set(at, list);
    }
  }
  return { removals, indexOf, asking };
}

/** For each field, the newest removed read of its member: any, when one home alone declares the name, or else one in a
 *  file whose parent version named the field's home. */
function readerHistory(root: string, fields: readonly Owned[], aliases: ReadonlyMap<string, ReadonlySet<string>>): ReadonlyMap<string, string> {
  // A tree outside git, such as a planted one, has no history to read.
  if (!existsSync(join(root, ".git"))) {
    return new Map();
  }
  const reads = removedReads(root, new Set(fields.map(({ member }) => member)));
  const { removals, indexOf, asking } = blobRequests(fields, reads, aliases);
  const named = new Set<string>();
  for (const [at, text] of parentBlobs(root, removals)) {
    for (const { key } of (asking.get(at) ?? []).filter(({ home }) => home.test(text))) {
      named.add(`${key} ${String(at)}`);
    }
  }
  const found = new Map<string, string>();
  for (const field of fields) {
    const removal = (reads.get(field.member) ?? []).find((candidate) => field.onlyHome || named.has(`${field.key} ${String(indexOf.get(blobId(candidate)))}`));
    if (removal !== undefined) {
      found.set(field.key, `${removal.commit} ${removal.file}`);
    }
  }
  return found;
}

// A one-word lowercase name (`host`, `at`) names many things in prose, so only `Home.member` promises it.
const isDistinctive = (member: string): boolean => /[A-Z_]/u.test(member);

/** Where each backticked token in a doc or README is first written: whole, as its last two parts, and its last part. */
function docPromises(root: string): ReadonlyMap<string, string> {
  const found = new Map<string, string>();
  const note = (name: string, at: string): void => {
    if (!found.has(name)) {
      found.set(name, at);
    }
  };
  for (const file of globSync([...PROMISE_DOCS], { cwd: root, exclude: (path) => path.includes("node_modules") }).sort()) {
    for (const [at, line] of readFileSync(join(root, file), "utf8").split("\n").entries()) {
      for (const [, token = ""] of line.matchAll(BACKTICKED)) {
        const parts = token.split(".");
        note(token, `${file}:${String(at + 1)}`);
        note(parts.slice(-2).join("."), `${file}:${String(at + 1)}`);
        note(parts.at(-1) ?? "", `${file}:${String(at + 1)}`);
      }
    }
  }
  return found;
}

const isLiteralValue = (node: ts.Node): boolean =>
  ts.isStringLiteralLike(node) ||
  ts.isNumericLiteral(node) ||
  ts.isObjectLiteralExpression(node) ||
  ts.isArrayLiteralExpression(node) ||
  ts.isTemplateExpression(node) ||
  node.kind === ts.SyntaxKind.TrueKeyword ||
  node.kind === ts.SyntaxKind.FalseKeyword;

// A write site's value: a key's initializer through `as` and `satisfies`, or a JSX attribute's string.
function isHandWritten(sources: Sources, site: Site): boolean {
  const parent = nameAt(sources.get(site.file), site.position)?.parent;
  let value: ts.Node | undefined;
  if (parent !== undefined && ts.isPropertyAssignment(parent)) {
    value = parent.initializer;
  } else if (parent !== undefined && ts.isJsxAttribute(parent)) {
    value = parent.initializer;
  }
  while (value !== undefined && (ts.isAsExpression(value) || ts.isSatisfiesExpression(value) || ts.isParenthesizedExpression(value))) {
    value = value.expression;
  }
  return value !== undefined && isLiteralValue(value);
}

/** One reported field as the sort reads it. */
export interface SortedField extends Owned {
  readonly writes: readonly Site[];
  readonly siblingsUsed: boolean;
  /** Where the value leaves the process with no receiver found, if anywhere. */
  readonly sent: readonly string[];
  /** The settings field this one is, or that a flow carries into it, `file:line`. */
  readonly setting: string | null;
  /** A settings field of the same name that no flow carries into this one, `file:line`. */
  readonly namedSetting: string | null;
}

/** The sort's evidence lookups for one run, built once over the reported fields. */
export class FieldSort {
  readonly #aliases: ReadonlyMap<string, ReadonlySet<string>>;
  readonly #history: ReadonlyMap<string, string>;
  readonly #promises: ReadonlyMap<string, string>;
  readonly #sources: Sources;

  constructor(root: string, sources: Sources, fields: readonly Owned[]) {
    this.#aliases = homeAliases(root);
    this.#history = readerHistory(root, fields, this.#aliases);
    this.#promises = docPromises(root);
    this.#sources = sources;
  }

  // A backticked `Home.member` under any name of the home, or the bare member when it is distinctive and one home declares it.
  #docPromise(field: SortedField): string | null {
    const last = field.home.split(".").at(-1) ?? "";
    const qualified = [field.home, last, ...homeNames(field.home, this.#aliases)].map((name) => `${name}.${field.member}`);
    const named = qualified.map((token) => this.#promises.get(token)).find((at) => at !== undefined);
    return named ?? (field.onlyHome && isDistinctive(field.member) ? (this.#promises.get(field.member) ?? null) : null);
  }

  sort(field: SortedField): { readonly verdict: Verdict; readonly evidence: SortEvidence } {
    const promise = field.setting ?? this.#docPromise(field);
    const evidence: SortEvidence = {
      readerHistory: this.#history.get(field.key) ?? null,
      handAuthored: field.writes.some((site) => isHandWritten(this.#sources, site)),
      siblingsUsed: field.siblingsUsed,
      promise,
      unseenMirror: promise === null && isDistinctive(field.member) ? field.namedSetting : null,
    };
    // A column write is no outside receiver: a column no query reads back is dead like any unread field.
    const sentOut = field.sent.some((sent) => !sent.startsWith(`${COLUMN} `));
    return { verdict: verdictOf(evidence, sentOut), evidence };
  }
}

const COLUMN: SendDestination = "column";

function verdictOf(evidence: SortEvidence, sentOut: boolean): Verdict {
  if (sentOut || evidence.unseenMirror !== null) {
    return "ask";
  }
  if (evidence.promise === null) {
    return "dead";
  }
  return evidence.readerHistory === null && (evidence.handAuthored || evidence.siblingsUsed) ? "forgotten" : "ask";
}
