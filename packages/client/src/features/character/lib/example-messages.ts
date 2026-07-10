// lib/example-messages — the §6.3 exampleMessages DISPLAY parser. ST card example dialogues are ONE stored
// string delimited by `<START>` markers (each block is a self-contained sample exchange). The editor shows
// them as a formatted mini-transcript: this splits the raw string into its blocks for the read-only preview
// ONLY — it is never used on the write path (the stored string round-trips byte-identical through the raw
// MacroTextarea). Pure, DOM-free logic (browser-free unit test, Spine-Testing.md §7).

// Case-insensitive `<START>` delimiter (ST cards vary the casing). No `u` flag — the pattern is ASCII-only
// (biome `useUnicodeRegex` is deliberately off; adding `u` here would be a footgun, per the doctrine).
const START_DELIMITER = /<start>/i;

/** Split raw exampleMessages into its `<START>`-delimited blocks (trimmed, empties dropped) — DISPLAY only.
 *  An input with no marker is a single block; an empty/whitespace input yields `[]`. */
export function parseExampleBlocks(exampleMessages: string): readonly string[] {
  return exampleMessages
    .split(START_DELIMITER)
    .map((block) => block.trim())
    .filter((block) => block !== "");
}
