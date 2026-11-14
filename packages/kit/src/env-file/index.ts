// @orb/kit/env-file — the one `.env` key writer: set, leave or delete named keys in `.env` text, in place. Every other
// byte of the file (comments, unknown keys, blank lines, line endings, a byte-order mark) survives. Pure: the caller
// reads and writes the file (`pnpm start`'s setup op, the server's restart verb), because packages never import tooling.
// It also owns what makes two environment names one variable, so the writer, the server's parse, its scrub and the
// agent SDK child's baseline agree.

/**
 * The spelling two environment names share when they name one variable.
 * @remarks Windows reads a name in any letter case, so `database_url` and `DATABASE_URL` are one variable there. Every
 * comparison of env names that must hold on Windows compares this key; a case-sensitive platform keeps both names.
 */
export function envNameKey(name: string): string {
  return name.toUpperCase();
}

/** An edit that removes every assignment line of its key, line ending included. Distinct from `null`, which leaves
 *  the key's lines exactly as they are. */
export const DELETE_ENV_LINE: unique symbol = Symbol("DELETE_ENV_LINE");

/** One key's edit: the value text to write, `null` to leave the key as it is, or {@link DELETE_ENV_LINE}. */
export interface EnvEdit {
  readonly key: string;
  readonly value: string | null | typeof DELETE_ENV_LINE;
}

const CRLF = "\r\n";
const LF = "\n";

/** The head of `KEY=value`: an optional `export ` prefix, the key and the separator. */
const ASSIGNMENT_HEAD = /^\s*(?:export\s+)?([^\s=#]+)\s*=\s*/u;
/** The value after the head: quoted, or bare up to whitespace or an inline comment. The rest of the line follows it. */
const ASSIGNMENT_VALUE = /^(?:"[^"]*"|'[^']*'|`[^`]*`|[^\s#]*)/u;

/** The quote that opens a value which may run across lines. */
const OPEN_QUOTE = /^["'`]/u;

/** A line without its trailing carriage return, and that carriage return. */
function splitEnding(line: string): { readonly body: string; readonly ending: string } {
  return line.endsWith("\r") ? { body: line.slice(0, -1), ending: "\r" } : { body: line, ending: "" };
}

/** One assignment in the file: where it starts and ends, and the pieces an edit keeps around its value. */
interface Assignment {
  /** The key as the file spells it. */
  readonly name: string;
  /** Everything before the value: indent, `export `, the key and the separator. */
  readonly head: string;
  /** Index of the last line the value reaches. */
  readonly end: number;
  /** What follows the value on its last line, line ending excluded. */
  readonly rest: string;
  /** The last line's carriage return, or none. */
  readonly ending: string;
}

/**
 * The assignment that starts at `lines[index]`, or `null` when that line assigns nothing.
 * @remarks A quoted value that does not close on its first line runs to the next line holding its closing quote, so
 * the lines between belong to the value and never read as assignments. A quote that never closes ends at its own line,
 * as the server's parse reads it.
 */
function readAssignment(lines: readonly string[], index: number): Assignment | null {
  const { body, ending } = splitEnding(lines[index] ?? "");
  const head = ASSIGNMENT_HEAD.exec(body);
  if (head === null) {
    return null;
  }
  const name = head[1] ?? "";
  const tail = body.slice(head[0].length);
  const quote = OPEN_QUOTE.exec(tail)?.[0];
  if (quote !== undefined && !tail.includes(quote, 1)) {
    for (let end = index + 1; end < lines.length; end += 1) {
      const last = splitEnding(lines[end] ?? "");
      const closing = last.body.indexOf(quote);
      if (closing !== -1) {
        return { name, head: head[0], end, rest: last.body.slice(closing + quote.length), ending: last.ending };
      }
    }
  }
  return { name, head: head[0], end: index, rest: tail.slice(ASSIGNMENT_VALUE.exec(tail)?.[0].length ?? 0), ending };
}

/** The lines after the edits: the edit whose key an assignment names, in any letter case, decides it, and the assignment
 *  keeps its own spelling of the key, so an edit never adds a second spelling of one variable. Every other line stays. */
function editLines(lines: readonly string[], edits: ReadonlyMap<string, EnvEdit>, seen: Set<string>): string[] {
  const kept: string[] = [];
  for (let index = 0; index < lines.length; ) {
    const assignment = readAssignment(lines, index);
    const edit = assignment === null ? undefined : edits.get(envNameKey(assignment.name));
    const next = assignment === null ? index + 1 : assignment.end + 1;
    if (assignment === null || edit === undefined || edit.value === null) {
      kept.push(...lines.slice(index, next));
    } else if (edit.value !== DELETE_ENV_LINE) {
      kept.push(`${assignment.head}${edit.value}${assignment.rest}${assignment.ending}`);
    }
    if (edit !== undefined) {
      seen.add(edit.key);
    }
    index = next;
  }
  return kept;
}

/** Apply `edits` to `.env` text. Every assignment of an edited key gets the new value in place (or is removed with its
 *  line ending), a set key the file lacks is appended in edit order in the file's own line ending, and nothing else
 *  changes. A quoted value that runs across lines is one assignment: an edit replaces or removes all of it, and a line
 *  inside it is never read as an assignment of its own. `null` text is a new file: `newFileHeader`, then one line per
 *  set key. The same edits applied twice give the same bytes. */
export function applyEnvEdits(text: string | null, edits: readonly EnvEdit[], newFileHeader: string): string {
  if (text === null) {
    const assignments = edits.flatMap(({ key, value }) => (typeof value === "string" ? [`${key}=${value}`] : []));
    return `${[newFileHeader, ...assignments].join(LF)}${LF}`;
  }
  const eol = text.includes(CRLF) ? CRLF : LF;
  const byName = new Map<string, EnvEdit>();
  for (const edit of edits) {
    if (!byName.has(envNameKey(edit.key))) {
      byName.set(envNameKey(edit.key), edit);
    }
  }
  const seen = new Set<string>();
  let out = editLines(text.split(LF), byName, seen).join(LF);
  for (const { key, value } of edits) {
    if (typeof value === "string" && !seen.has(key)) {
      out = `${out}${out === "" || out.endsWith(LF) ? "" : eol}${key}=${value}${eol}`;
    }
  }
  return out;
}

/** The env key a launcher sets beside the `.env` values it restates on a child's environment: a comma list of those
 *  keys. The server counts a listed key as the file's, because it came from the file even though it arrives as
 *  process environment. */
export const ENV_FROM_FILE_KEY = "ORB_ENV_FROM_FILE";

/** The switch that skips the `.env` file entirely; a sidecar or a test run sets it so the operator's file cannot leak in. */
export const ENV_NO_FILE_KEY = "ORB_ENV_NO_FILE";

/** The switch that keeps the `.env` load but stops the file overriding the process env. */
export const ENV_NO_OVERRIDE_KEY = "ORB_ENV_NO_OVERRIDE";

/** The keys an {@link ENV_FROM_FILE_KEY} value lists; an absent or empty value lists none. */
export function envFromFileKeys(raw: string | undefined): ReadonlySet<string> {
  return new Set((raw ?? "").split(",").filter((key) => key.length > 0));
}
