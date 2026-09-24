// @orb/kit/env-file — the one `.env` key writer: set, leave or delete named keys in `.env` text, in place. Every other
// byte of the file (comments, unknown keys, blank lines, line endings, a byte-order mark) survives. Pure: the caller
// reads and writes the file (`pnpm start`'s setup op, the server's restart verb), because packages never import tooling.

/** An edit that removes every assignment line of its key, line ending included. Distinct from `null`, which leaves
 *  the key's lines exactly as they are. */
export const DELETE_ENV_LINE: unique symbol = Symbol("DELETE_ENV_LINE");

/** One key's edit: the value text to write, `null` to leave the key as it is, or {@link DELETE_ENV_LINE}. */
export interface EnvEdit {
  readonly key: string;
  readonly value: string | null | typeof DELETE_ENV_LINE;
}

const LINE_ENDING_RE = /\r$/u;
const CRLF = "\r\n";
const LF = "\n";

/** `KEY=value` with an optional `export ` prefix, a quoted or bare value, and whatever follows it (an inline comment).
 *  The key is matched literally, so an env name never reads as a pattern. */
function assignmentPattern(key: string): RegExp {
  const literal = key.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`^(\\s*(?:export\\s+)?${literal}\\s*=\\s*)("[^"]*"|'[^']*'|\`[^\`]*\`|[^\\s#]*)(.*)$`, "u");
}

interface KeyPattern {
  readonly edit: EnvEdit;
  readonly pattern: RegExp;
}

/** One line after the edits: the first edited key it assigns decides it; a line that assigns none stays. */
function editLine(line: string, patterns: readonly KeyPattern[], seen: Set<string>): readonly string[] {
  const ending = LINE_ENDING_RE.test(line) ? "\r" : "";
  const body = ending === "" ? line : line.slice(0, -1);
  for (const { edit, pattern } of patterns) {
    const match = pattern.exec(body);
    if (match === null) {
      continue;
    }
    seen.add(edit.key);
    if (edit.value === DELETE_ENV_LINE) {
      return [];
    }
    return edit.value === null ? [line] : [`${match[1]}${edit.value}${match[3]}${ending}`];
  }
  return [line];
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
  const patterns = edits.map((edit) => ({ edit, pattern: assignmentPattern(edit.key) }));
  const seen = new Set<string>();
  let out = text
    .split(LF)
    .flatMap((line) => editLine(line, patterns, seen))
    .join(LF);
  for (const { key, value } of edits) {
    if (typeof value === "string" && !seen.has(key)) {
      out = `${out}${out === "" || out.endsWith(LF) ? "" : eol}${key}=${value}${eol}`;
    }
  }
  return out;
}
