// A proposed sort of each reported field into dead, forgotten or ask, from four pieces of evidence. The judgment items
// decide; the sort says which rows need a person first. Every test matches by name, so a common name over-matches.

import { existsSync, globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { execGit } from "../floor/git/git.ts";
import type { SendDestination } from "./boundaries.ts";
import type { Site, Sources } from "./classify.ts";
import { nameAt } from "./classify.ts";

const VERDICTS = ["dead", "forgotten", "ask"] as const;
/** `dead`: no promise and no outside receiver. `forgotten`: a promise and a hand-written value or used siblings, and no
 *  reader ever: an unfinished feature. `ask`: a removed reader or an outside receiver a person must judge. */
export type Verdict = (typeof VERDICTS)[number];

/** The four tests behind a verdict. */
export interface SortEvidence {
  /** A commit whose removed lines read the member by name, or null. */
  readonly readerHistory: string | null;
  /** Some write gives the field a literal value rather than copying another value. */
  readonly handAuthored: boolean;
  /** Another field of the same home is wired. */
  readonly siblingsUsed: boolean;
  /** Where a doc, README or setting names the member, `file:line`, or null. */
  readonly promise: string | null;
}

// History of the package sources only: a reader is production code, and docs name members without reading them.
const HISTORY_ARGS = ["log", "-p", "-U0", "--no-merges", "--no-renames", "--format=@@C%h", "--", "packages"] as const;
const HISTORY_BUFFER = 1_073_741_824;
const COMMIT_MARK = "@@C";
const READ_NAME = /[.?]\.?([A-Za-z_$][\w$]*)\b(?!\s*=[^=>])/gu;
const PROMISE_DOCS = ["docs/law/**/*.md", "docs/adr/**/*.md", "packages/**/README.md", "README.md"] as const;
const SETTINGS = "packages/contracts/src/settings/**/*.ts";
const BACKTICKED = /`([^`\s]+)`/gu;

/** The newest commit whose removed source lines read each of `members` by name. */
function readerHistory(root: string, members: ReadonlySet<string>): ReadonlyMap<string, string> {
  // A tree outside git, such as a planted one, has no history to read.
  if (!existsSync(join(root, ".git"))) {
    return new Map();
  }
  const text = execGit(root, HISTORY_ARGS, { maxBuffer: HISTORY_BUFFER });
  const found = new Map<string, string>();
  let commit = "";
  for (const line of text.split("\n")) {
    if (line.startsWith(COMMIT_MARK)) {
      commit = line.slice(COMMIT_MARK.length);
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      for (const [, name = ""] of line.matchAll(READ_NAME)) {
        if (members.has(name) && !found.has(name)) {
          found.set(name, commit);
        }
      }
    }
  }
  return found;
}

// A one-word lowercase name (`host`, `at`) names many things in prose, so only `Home.member` promises it.
const isDistinctive = (member: string): boolean => /[A-Z_]/u.test(member);

/** Where each name is first written: a backticked `member` or `Home.member` in a doc or README, or a settings key. */
function promises(root: string): ReadonlyMap<string, string> {
  const found = new Map<string, string>();
  const note = (name: string, file: string, line: number): void => {
    if (!found.has(name)) {
      found.set(name, `${file}:${line}`);
    }
  };
  for (const file of globSync([...PROMISE_DOCS], { cwd: root, exclude: (path) => path.includes("node_modules") }).sort()) {
    for (const [at, line] of readFileSync(join(root, file), "utf8").split("\n").entries()) {
      for (const [, token = ""] of line.matchAll(BACKTICKED)) {
        const parts = token.split(".");
        note(parts.at(-1) ?? "", file, at + 1);
        note(parts.slice(-2).join("."), file, at + 1);
      }
    }
  }
  for (const file of globSync(SETTINGS, { cwd: root }).sort()) {
    for (const [at, line] of readFileSync(join(root, file), "utf8").split("\n").entries()) {
      for (const [, key = ""] of line.matchAll(/\b([A-Za-z_$][\w$]*)\s*:/gu)) {
        note(key, file, at + 1);
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
export interface SortedField {
  readonly home: string;
  readonly member: string;
  readonly writes: readonly Site[];
  readonly siblingsUsed: boolean;
  /** Where the value leaves the process with no receiver found, if anywhere. */
  readonly sent: readonly string[];
}

/** The sort's evidence lookups for one run, built once over the reported members. */
export class FieldSort {
  readonly #history: ReadonlyMap<string, string>;
  readonly #promises: ReadonlyMap<string, string>;
  readonly #sources: Sources;

  constructor(root: string, sources: Sources, members: ReadonlySet<string>) {
    this.#history = readerHistory(root, members);
    this.#promises = promises(root);
    this.#sources = sources;
  }

  sort(field: SortedField): { readonly verdict: Verdict; readonly evidence: SortEvidence } {
    const qualified = `${field.home.split(".").at(-1) ?? ""}.${field.member}`;
    const evidence: SortEvidence = {
      readerHistory: this.#history.get(field.member) ?? null,
      handAuthored: field.writes.some((site) => isHandWritten(this.#sources, site)),
      siblingsUsed: field.siblingsUsed,
      promise: this.#promises.get(qualified) ?? (isDistinctive(field.member) ? (this.#promises.get(field.member) ?? null) : null),
    };
    // A column write is no outside receiver: a column no query reads back is dead like any unread field.
    const sentOut = field.sent.some((sent) => !sent.startsWith(`${COLUMN} `));
    return { verdict: verdictOf(evidence, sentOut), evidence };
  }
}

const COLUMN: SendDestination = "column";

function verdictOf(evidence: SortEvidence, sentOut: boolean): Verdict {
  if (sentOut) {
    return "ask";
  }
  if (evidence.promise === null) {
    return "dead";
  }
  return evidence.readerHistory === null && (evidence.handAuthored || evidence.siblingsUsed) ? "forgotten" : "ask";
}
