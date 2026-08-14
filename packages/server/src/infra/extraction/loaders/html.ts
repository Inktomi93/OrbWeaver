// infra/extraction/loaders/html.ts — the html loader (html-to-text). script/style/head are dropped by
// html-to-text's defaults; we additionally SKIP nav/footer chrome, render links → their text (drop hrefs), and
// turn wordwrap OFF so lines aren't hard-wrapped mid-sentence. Headings are NOT uppercased (html-to-text's
// default) — the pipeline does not case-fold; the text is canon. `title` comes from `<title>`.
// LEAN: if scraped-page nav/footer noise measurably pollutes retrieval, add a Readability isolation
// pass in FRONT of this same loader — deferred until a retrieval-quality complaint traces to it.

import { convert } from "html-to-text";
import type { RawExtraction } from "../loader.ts";

// html-to-text is byte-agnostic (it wants a string); decode LENIENTLY — real-world html has mixed/mislabeled
// bytes, and a stray byte should degrade to U+FFFD, not fail the whole document (unlike the strict text family).
const HTML_UTF8 = new TextDecoder("utf-8");

/** `<title>…</title>` capture (first match, case-insensitive, across newlines). */
const TITLE_TAG = /<title[^>]*>([\s\S]*?)<\/title>/i;
/** Any run of whitespace — collapsed to a single space when normalizing a captured title. */
const WHITESPACE_RUN = /\s+/g;

const HTML_OPTIONS = {
  wordwrap: false as const,
  selectors: [
    { selector: "a", options: { ignoreHref: true } },
    { selector: "nav", format: "skip" },
    { selector: "footer", format: "skip" },
    { selector: "h1", options: { uppercase: false } },
    { selector: "h2", options: { uppercase: false } },
    { selector: "h3", options: { uppercase: false } },
    { selector: "h4", options: { uppercase: false } },
    { selector: "h5", options: { uppercase: false } },
    { selector: "h6", options: { uppercase: false } },
  ],
};

function titleOf(html: string): string | undefined {
  const captured = TITLE_TAG.exec(html)?.[1];
  if (captured === undefined) {
    return;
  }
  const title = captured.replace(WHITESPACE_RUN, " ").trim();
  return title.length > 0 ? title : undefined;
}

export function loadHtml(bytes: Uint8Array): Promise<RawExtraction> {
  const html = HTML_UTF8.decode(bytes);
  const text = convert(html, HTML_OPTIONS);
  const title = titleOf(html);
  return Promise.resolve(title === undefined ? { text } : { text, title });
}
