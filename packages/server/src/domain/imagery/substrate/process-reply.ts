// domain/imagery/substrate/process-reply — the pure normalizer that turns an LLM's free-form reply into a
// clean comma-delimited keyword prompt (doc 02 §7). Deterministic, zero-I/O; each numbered step is a golden
// row. Case is PRESERVED (proper nouns like "Victorian" carry signal). The CALLER decides whether an empty
// result is an error (PromptExtractionFailedError, doc 02 §1/§2).

/** The generic length cap — cut at the last full comma-term before it, never mid-word (marinara caps
 *  1400/2200 per kind; one generic cap here, rpg keeps its own). */
const MAX_PROMPT_CHARS = 2000;

/** Wrapping quote pairs stripped when they enclose the WHOLE string (straight + curly). */
const WRAP_QUOTES: readonly (readonly [string, string])[] = [
  ['"', '"'],
  ["'", "'"],
  ["“", "”"],
];

export function processReply(raw: string): string {
  // 1. Trim; strip ONE pair of wrapping quotes if the whole string is wrapped.
  let s = raw.trim();
  for (const [open, close] of WRAP_QUOTES) {
    if (s.length >= open.length + close.length && s.startsWith(open) && s.endsWith(close)) {
      s = s.slice(open.length, s.length - close.length).trim();
      break;
    }
  }
  // 2. Newline runs → ", " (the LLM listed on lines → a comma list).
  s = s.replace(/[\r\n]+/g, ", ");
  // 3. NFD-normalize, then strip combining marks (é → e — hosted models tokenize ASCII keywords reliably).
  s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  // 4. Whitelist-filter to a-z A-Z 0-9 space , . ' - (SD attention syntax (){}[]|:: is dropped — no hosted
  //    meaning, D39; it would leak literal parens into DALL-E/Gemini prompts).
  s = s.replace(/[^a-zA-Z0-9 ,.'-]+/g, "");
  // 5. Collapse whitespace runs, then collapse each comma run (+ its surrounding spaces) to a single ", ";
  //    trim leading/trailing commas/spaces. Idempotent on a clean "a, b" list.
  s = s
    .replace(/\s+/g, " ")
    .replace(/\s*,[\s,]*/g, ", ")
    .replace(/^[\s,]+|[\s,]+$/g, "");
  // 6. Length-cap; cut at the last full comma-separated term before the cap (never mid-word).
  if (s.length > MAX_PROMPT_CHARS) {
    const cut = s.slice(0, MAX_PROMPT_CHARS);
    const lastComma = cut.lastIndexOf(",");
    s = (lastComma > 0 ? cut.slice(0, lastComma) : cut).replace(/[\s,]+$/g, "");
  }
  // 7. Return — the caller decides if empty is an error.
  return s;
}
