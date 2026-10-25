// Spec-faithful stand-ins for builtins the browser floor lacks (installed by platform-polyfills.ts).

const SYNTAX_CHARACTERS = "^$\\.*+?()[]{}|/";
const OTHER_PUNCTUATORS = ",-=<>#&!%:;@~'`\"";
const CONTROL_ESCAPES: Readonly<Record<string, string>> = { "\t": "\\t", "\n": "\\n", "\v": "\\v", "\f": "\\f", "\r": "\\r" };
// `\s` is the spec's WhiteSpace plus LineTerminator, U+FEFF included.
const WHITESPACE = /^\s$/u;
const LEADING_ALNUM = /^[0-9A-Za-z]/u;
const MAX_LATIN1 = 0xff;
const SURROGATE_START = 0xd8_00;
const SURROGATE_END = 0xdf_ff;
const HEX_RADIX = 16;
const BYTE_DIGITS = 2;
const UNIT_DIGITS = 4;
const hex = (value: number, width: number): string => value.toString(HEX_RADIX).padStart(width, "0");

// ECMA-262 EncodeForRegExpEscape, for one code point other than a leading letter or digit.
function encodeForRegExpEscape(character: string): string {
  if (SYNTAX_CHARACTERS.includes(character)) {
    return `\\${character}`;
  }
  const control = CONTROL_ESCAPES[character];
  if (control !== undefined) {
    return control;
  }
  const codePoint = character.codePointAt(0) ?? 0;
  const loneSurrogate = codePoint >= SURROGATE_START && codePoint <= SURROGATE_END;
  if (!(OTHER_PUNCTUATORS.includes(character) || WHITESPACE.test(character) || loneSurrogate)) {
    return character;
  }
  if (codePoint <= MAX_LATIN1) {
    return `\\x${hex(codePoint, BYTE_DIGITS)}`;
  }
  return Array.from({ length: character.length }, (_, index) => `\\u${hex(character.charCodeAt(index), UNIT_DIGITS)}`).join("");
}

/** ECMA-262 `RegExp.escape` (ES2025): escapes `value` so a RegExp built from it matches the text literally. */
export function regExpEscape(value: string): string {
  if (typeof value !== "string") {
    throw new TypeError("RegExp.escape requires a string");
  }
  return Array.from(value, (character, index) =>
    index === 0 && LEADING_ALNUM.test(character) ? `\\x${hex(character.codePointAt(0) ?? 0, BYTE_DIGITS)}` : encodeForRegExpEscape(character),
  ).join("");
}

/** ECMA-262 `Error.isError` (ES2026): true for an object with an [[ErrorData]] slot, in any realm. A spoofed `@@toStringTag` is not one. */
export function isError(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  // `instanceof Error` would admit `Object.create(Error.prototype)`, which has no slot; the builtin tag is the realm-proof probe.
  return value instanceof DOMException || (Object.prototype.toString.call(value) === "[object Error]" && !(Symbol.toStringTag in value));
}
