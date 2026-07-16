// domain/chat/memory/build/substrate/parse — parse the summarizer output into the digest's persisted facets
// (topic anchor + keywords) and render the inverse (the facet text used by both consolidation input and the
// `{{memory}}` format step). PURE — no I/O, no state. Robust to a sloppy model: a missing keywords line → no
// keywords; a missing anchor → the first non-empty line (or "").

import type { ParsedDigest } from "../../types";

const KEYWORDS_LINE = /^\s*keywords\s*:/iu;

/** Parse a summarizer digest into `{topicAnchor, facts, keywords}`. The first non-empty line is the anchor;
 *  the `keywords:` line (anywhere) yields the comma-split keyword list (trimmed, de-duped, empties dropped);
 *  everything between is the facts body. */
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
  for (let i = anchorIdx + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (KEYWORDS_LINE.test(line)) {
      keywordsIdx = i;
      keywords = parseKeywordList(line.replace(KEYWORDS_LINE, ""));
      break;
    }
  }
  const facts = lines
    .slice(anchorIdx + 1, keywordsIdx)
    .join("\n")
    .trim();
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

/** Render a digest's persisted facets → the canonical text used as consolidation input AND the `{{memory}}`
 *  block (the inverse of {@link parseDigest} over what `chat_digests` actually stores — anchor + keywords; the
 *  facts body is not persisted, FLAG[no-digest-body]). A null anchor → just the keywords; no keywords → just
 *  the anchor. */
export function renderDigestFacets(d: { readonly topicAnchor: string | null; readonly keywords: readonly string[] }): string {
  const anchor = d.topicAnchor ?? "";
  if (d.keywords.length === 0) {
    return anchor;
  }
  const kw = `keywords: ${d.keywords.join(", ")}`;
  return anchor.length > 0 ? `${anchor}\n${kw}` : kw;
}
