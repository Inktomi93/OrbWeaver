// primitives/st-filename — SillyTavern's own filename rule (`sanitize-filename` with an empty replacement), which
// SillyTavern applies to every name it writes to disk. The import reads gallery folders through it, and the export
// writes every path segment it builds from a stored name through it, so a name can never leave its directory.

// sanitize-filename's rules, in its order. Its trailing dot and space strip is a loop, not a regex, to stay linear.
const ILLEGAL = /[/?<>\\:*|"]/gu;
// The C0 and C1 control code ranges sanitize-filename strips.
const C0_END = 0x1f;
const C1_START = 0x80;
const C1_END = 0x9f;
const RESERVED = /^\.+$/u;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9\xb9\xb2\xb3]|lpt[0-9\xb9\xb2\xb3])(\..*)?$/iu;
const MAX_NAME_BYTES = 255;
const ENCODER = new TextEncoder();

function stripControls(text: string): string {
  let out = "";
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code > C0_END && (code < C1_START || code > C1_END)) {
      out += char;
    }
  }
  return out;
}

function stripTrailingDotsAndSpaces(text: string): string {
  let end = text.length;
  while (end > 0 && (text[end - 1] === "." || text[end - 1] === " ")) {
    end -= 1;
  }
  return text.slice(0, end);
}

// truncate-utf8-bytes: the longest prefix of whole code points that fits the byte budget.
function truncateUtf8(text: string, maxBytes: number): string {
  let bytes = 0;
  let out = "";
  for (const char of text) {
    bytes += ENCODER.encode(char).length;
    if (bytes > maxBytes) {
      break;
    }
    out += char;
  }
  return out;
}

/** `name` as SillyTavern writes it to disk. The result holds no separator, no control character and no
 *  dot-only or Windows-reserved name; it is empty when nothing of `name` survives. */
export function stSanitizeFilename(name: string): string {
  const stripped = stripTrailingDotsAndSpaces(stripControls(name.replace(ILLEGAL, "")).replace(RESERVED, "").replace(WINDOWS_RESERVED, ""));
  return stripTrailingDotsAndSpaces(truncateUtf8(stripped, MAX_NAME_BYTES)).replace(WINDOWS_RESERVED, "");
}
