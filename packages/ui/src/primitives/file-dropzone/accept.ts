// The `accept` vocabulary, DECIDED rather than merely advertised. The native `accept` attribute filters the
// OS file DIALOG and nothing else: a drag-and-drop hands the page arbitrary bytes, and a picker whose dialog
// was switched to "All files" hands back whatever the user chose. So the dropzone has to test membership
// itself, per file, using the same token grammar the browser applies to the attribute — one vocabulary,
// two feeders, no drift.
//
// The grammar is HTML's (whatwg §file-upload-state): a comma-separated list of tokens, each either a
// case-insensitive filename SUFFIX (".png" — matched on the tail, so `chat.orb.json` matches `.json`), a
// MIME family wildcard ("image/*"), or an exact MIME ("application/pdf"). A bare `*` accepts everything.
// A file whose `type` is empty (the browser recognized no MIME — common for `.jsonl`, `.md`, and for a
// dropped DIRECTORY entry) can still match a suffix token; it can never match a MIME token, because there
// is no claim to compare.

const WILDCARD_TOKENS = new Set(["*", "*/*"]);
const SUFFIX_PREFIX = ".";
const FAMILY_SUFFIX = "/*";
const MIME_PARAMETER_SEPARATOR = ";";

/** The base MIME with any `; charset=…` parameter stripped, lowercased (browsers send `text/plain; charset=utf-8`). */
function baseType(type: string): string {
  return (type.split(MIME_PARAMETER_SEPARATOR)[0] ?? "").trim().toLowerCase();
}

/** One accept token tested against one file. */
function tokenMatches(token: string, name: string, type: string): boolean {
  if (WILDCARD_TOKENS.has(token)) {
    return true;
  }
  if (token.startsWith(SUFFIX_PREFIX)) {
    return token.length > SUFFIX_PREFIX.length && name.endsWith(token);
  }
  if (type.length === 0) {
    return false;
  }
  if (token.endsWith(FAMILY_SUFFIX)) {
    return type.startsWith(token.slice(0, token.length - FAMILY_SUFFIX.length + 1));
  }
  return type === token;
}

/**
 * True when `file` belongs to the `accept` vocabulary — and true unconditionally when `accept` is omitted or
 * carries no usable token, which is the "this zone takes anything" contract the attribute itself has.
 */
export function matchesAccept(file: File, accept: string | undefined): boolean {
  if (accept === undefined) {
    return true;
  }
  const tokens = accept
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return true;
  }
  const name = file.name.toLowerCase();
  const type = baseType(file.type);
  return tokens.some((token) => tokenMatches(token, name, type));
}
