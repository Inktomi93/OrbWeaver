// What a Custom connection's two body fields accept from a paste: strict JSON, YAML (block or flow, unquoted keys,
// single quotes, trailing commas) and key=value lines, read once into the JSON the request carries. The body stays
// opaque: keys and values pass through as written, and nothing here reads one to change what the app does.

/** A parse of pasted text: the value it reads as, or why it reads as nothing. */
// @orb-waive no-inline-types(PastedParse): the reader's own result, read only beside it in this feature's lib.
export type PastedParse<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

const FORMATS_HINT = "Paste one JSON object, YAML (key: value, nested by indenting) or key=value lines.";
const COLON_SPACE_REASON = "Put a space after each colon, as in top_k: 40.";
const ASSIGNMENT_LINE = /^\s*([A-Za-z_][\w.-]*)\s*=(.*)$/;
const KEY_LINE = /^\s*[A-Za-z_][\w.-]*\s*(:(\s|$)|=)/;
const COMMENT_LINE = /^\s*#/;
const LINE_BREAK = /\r?\n/;

function contentLines(text: string): readonly string[] {
  return text.split(LINE_BREAK).filter((line) => line.trim() !== "" && !COMMENT_LINE.test(line));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Does this text state fields (an object, `key: value` or `key=value`) rather than one plain value? */
export function looksLikeFields(text: string): boolean {
  const first = contentLines(text)[0] ?? "";
  return text.trim().startsWith("{") || KEY_LINE.test(first);
}

/** Is a field VALUE meant as structured data: a JSON-style object or array, or an indented block? A single line
 *  of plain text is a string, however it reads. */
export function looksStructured(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return true;
  }
  const lines = contentLines(trimmed);
  return lines.length > 1 && (KEY_LINE.test(lines[0] ?? "") || (lines[0] ?? "").trimStart().startsWith("- "));
}

// Not strict JSON is an answer, not a failure: the text goes on to the lenient reader.
function tryJson(text: string): PastedParse<unknown> {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, reason: FORMATS_HINT };
  }
}

// `{top_k:40}` reads in YAML as the key `top_k:40` with no value: name the fix rather than save that key.
function hasGluedColonKey(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasGluedColonKey);
  }
  if (!isPlainObject(value)) {
    return false;
  }
  return Object.entries(value).some(([key, child]) => (key.includes(":") && child === null) || hasGluedColonKey(child));
}

async function readYaml(text: string): Promise<PastedParse<unknown>> {
  // Loaded on first use, so the parser rides with the editor and never with the app's first load.
  const { parse } = await import("yaml");
  try {
    const value = parse(text) as unknown;
    return hasGluedColonKey(value) ? { ok: false, reason: COLON_SPACE_REASON } : { ok: true, value };
  } catch (err) {
    const first = (err instanceof Error ? err.message : String(err)).split(LINE_BREAK)[0] ?? "";
    return { ok: false, reason: `That didn't read as fields (${first}). ${FORMATS_HINT}` };
  }
}

// A value on a key=value line: JSON where it parses, a YAML flow value (`{a: 1}`, `[x, y]`) where that does, else
// the text itself.
async function readAssignedValue(raw: string): Promise<unknown> {
  const text = raw.trim();
  if (text === "") {
    return "";
  }
  const json = tryJson(text);
  if (json.ok) {
    return json.value;
  }
  const yaml = await readYaml(text);
  return yaml.ok ? yaml.value : text;
}

async function readAssignments(lines: readonly string[]): Promise<Record<string, unknown>> {
  const entries: [string, unknown][] = [];
  for (const line of lines) {
    const [, key = "", value = ""] = ASSIGNMENT_LINE.exec(line) ?? [];
    entries.push([key, await readAssignedValue(value)]);
  }
  return Object.fromEntries(entries);
}

/** Pasted text as the object of fields it states, in any of the accepted formats. */
export async function parsePastedObject(raw: string): Promise<PastedParse<Record<string, unknown>>> {
  const text = raw.trim();
  const lines = contentLines(text);
  if (lines.length > 0 && lines.every((line) => ASSIGNMENT_LINE.test(line))) {
    return { ok: true, value: await readAssignments(lines) };
  }
  const json = tryJson(text);
  const read = json.ok ? json : await readYaml(text);
  if (!read.ok) {
    return read;
  }
  return isPlainObject(read.value) ? { ok: true, value: read.value } : { ok: false, reason: `That is a single value, not fields. ${FORMATS_HINT}` };
}

/** A structured field value (see {@link looksStructured}) as the object or array it states. */
export async function parsePastedStructure(raw: string): Promise<PastedParse<unknown>> {
  const text = raw.trim();
  const json = tryJson(text);
  const read = json.ok ? json : await readYaml(text);
  if (!read.ok) {
    return read;
  }
  return typeof read.value === "object" && read.value !== null
    ? read
    : { ok: false, reason: "That didn't read as an object or a list. Write it as JSON, or as YAML nested by indenting." };
}

/** A value as the text its field shows: a string as typed, unless it would read back as something else (`"40"`),
 *  and anything else as indented JSON, which is exactly what the request carries. */
export function fieldText(value: unknown): string {
  if (typeof value === "string" && !tryJson(value).ok) {
    return value;
  }
  return JSON.stringify(value, null, 2);
}
