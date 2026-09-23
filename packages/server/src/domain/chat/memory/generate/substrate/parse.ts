// domain/chat/memory/generate/substrate/parse — parse the summarizer output into the digest's three parts
// (topic anchor · significance-filtered facts · keywords). PURE — no I/O, no state. Robust to a sloppy model:
// a missing keywords line → no keywords; a missing anchor → the first non-empty line (or "").

import type { ParsedDigest } from "../../types.ts";

/** The keywords MARKER — matched ANYWHERE on a line, not just at its start (#330 P5). A sloppy model often
 *  appends `Keywords: …` inline after the final fact sentence ("… behind the painting. Keywords: ledger, …")
 *  rather than on its own line; anchoring on `^\s*keywords:` silently dropped that block's keywords (1 in 26
 *  real digests measured). The prefix BEFORE the marker on that line stays part of the facts body. */
const KEYWORDS_MARKER = /keywords\s*:/iu;

/** Parse a summarizer digest into `{topicAnchor, facts, keywords}`. The first non-empty line is the anchor;
 *  the LAST line carrying a `keywords:` marker (at its start OR inline after a fact) yields the comma-split
 *  keyword list (trimmed, de-duped, empties dropped) and any prose BEFORE the marker on that line stays in the
 *  facts; everything between the anchor and that line is the facts body. Scanning from the END keeps a fact
 *  that merely MENTIONS "keywords:" mid-body from stealing the real trailing keyword list. */
export function parseDigest(raw: string): ParsedDigest {
  const lines = raw.split("\n");
  let topicAnchor = "";
  let anchorIdx = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = (lines[i] ?? "").trim();
    if (trimmed.length > 0) {
      topicAnchor = trimmed;
      anchorIdx = i;
      break;
    }
  }
  let keywords: string[] = [];
  let keywordsIdx = lines.length;
  let keywordsLinePrefix = "";
  for (let i = lines.length - 1; i > anchorIdx; i -= 1) {
    const line = lines[i] ?? "";
    const match = KEYWORDS_MARKER.exec(line);
    if (match !== null) {
      keywordsIdx = i;
      keywordsLinePrefix = line.slice(0, match.index).trim();
      keywords = parseKeywordList(line.slice(match.index + match[0].length));
      break;
    }
  }
  const factsLines = lines.slice(anchorIdx + 1, keywordsIdx);
  if (keywordsLinePrefix.length > 0) {
    factsLines.push(keywordsLinePrefix);
  }
  const facts = factsLines.join("\n").trim();
  return { topicAnchor, facts, keywords };
}

/** Split a comma-separated keyword string → trimmed, de-duped, non-empty keywords (insertion order). */
function parseKeywordList(s: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of s.split(",")) {
    const kw = part.trim();
    if (kw.length > 0 && !seen.has(kw)) {
      seen.add(kw);
      out.push(kw);
    }
  }
  return out;
}
