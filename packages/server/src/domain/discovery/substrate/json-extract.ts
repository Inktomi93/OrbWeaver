// domain/discovery/substrate/json-extract — a tolerant "slice the FIRST balanced JSON object out of an LLM
// reply" helper. The distill pass drives a guided-decode `summarize` (jsonSchema-constrained → clean JSON on
// the vLLM path), but a hosted model that ignores the schema, or a Thinking checkpoint that wraps the object
// in prose/markdown, can still return `…text {"genre":…} …` — so the parse must find the object, not assume
// the whole reply IS the object. Balanced-brace scan (quote/escape aware) from the first `{`; returns the
// parsed value or `null` (a null result = the pass counts the character as `failed`, never throws).
// Substrate-local per the discovery gap doc ("promote to @orb/kit/json only if a consumer outside discovery
// appears") — no consumer outside discovery today.

/** Parse the first balanced `{…}` object in `raw`, or `null` if none parses. Quote- and escape-aware so a
 *  `}` inside a string literal never closes the scan early. */
export function sliceJsonObject(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf("{");
  if (start === -1) {
    return null;
  }
  let depth = 0;
  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === '"') {
      i = skipStringLiteral(raw, i);
    } else if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return tryParse(raw.slice(start, i + 1));
      }
    }
  }
  return null;
}

/** Given `open` = the index of an opening `"`, return the index of the closing `"` (escape-aware), or the
 *  last index if the string is unterminated (the scan then falls through to the no-parse return). */
function skipStringLiteral(raw: string, open: number): number {
  for (let i = open + 1; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === "\\") {
      i += 1; // skip the escaped char
    } else if (ch === '"') {
      return i;
    }
  }
  return raw.length - 1;
}

function tryParse(slice: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(slice);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
