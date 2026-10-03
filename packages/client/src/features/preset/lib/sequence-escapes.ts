// The chip lists' typed form of a sequence: `\n` and `\t` stand for a newline and a tab and `\\` for a
// backslash, so a stop sequence or DRY breaker that is whitespace can be typed and read back.

const DECODED: Readonly<Record<string, string>> = { n: "\n", t: "\t", "\\": "\\" };
const ENCODED: Readonly<Record<string, string>> = { "\n": "\\n", "\t": "\\t", "\\": "\\\\" };

export function decodeSequence(typed: string): string {
  return typed.replaceAll(/\\([nt\\])/gu, (pair: string, letter: string) => DECODED[letter] ?? pair);
}

export function encodeSequence(sequence: string): string {
  return sequence.replaceAll(/[\n\t\\]/gu, (character: string) => ENCODED[character] ?? character);
}
