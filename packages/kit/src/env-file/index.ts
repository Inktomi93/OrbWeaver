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

/** One line after the edits: the edit whose key it assigns, in any letter case, decides it, and the line keeps its own
 *  spelling of the key, so an edit never adds a second spelling of one variable. A line that assigns none stays. */
function editLine(line: string, edits: ReadonlyMap<string, EnvEdit>, seen: Set<string>): readonly string[] {
  const ending = line.endsWith("\r") ? "\r" : "";
  const body = ending === "" ? line : line.slice(0, -1);
  const head = ASSIGNMENT_HEAD.exec(body);
  const edit = head === null ? undefined : edits.get(envNameKey(head[1] ?? ""));
  if (head === null || edit === undefined) {
    return [line];
  }
  seen.add(edit.key);
  if (edit.value === DELETE_ENV_LINE) {
    return [];
  }
  const tail = body.slice(head[0].length);
  const rest = tail.slice(ASSIGNMENT_VALUE.exec(tail)?.[0].length ?? 0);
  return edit.value === null ? [line] : [`${head[0]}${edit.value}${rest}${ending}`];
}

/** Apply `edits` to `.env` text. Every assignment of an edited key gets the new value in place (or is removed with its
 *  line ending), a set key the file lacks is appended in edit order in the file's own line ending, and nothing else
 *  changes. `null` text is a new file: `newFileHeader`, then one line per set key. The same edits applied twice give
 *  the same bytes. */
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
  let out = text
    .split(LF)
    .flatMap((line) => editLine(line, byName, seen))
    .join(LF);
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
