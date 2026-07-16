// @orb/kit/content — the message-content tokenizer: splits a stored message body (text + embedded markdown
// image refs) into ordered spans. ONE parser, two projections (D45-amend): the chat domain's SEND path
// projects spans → provider content-parts (the `{text}|{image,url}` wire shape, gated by
// `ModelCapability.input.vision`); the Phase-6 client RENDER path projects the SAME spans →
// `MessageContentBlock[]` (D44). Pure + deterministic — no markdown dep, no I/O.
//
// THE ENCODING (D45-amend): a message body is `string` (D26 one content home); an image is an embedded
// markdown image `![alt](target)` where `target` is `asset:<assetId>` for an owned-CAS asset or an
// `http(s)://…` external URL (gated by `forbidExternalMedia` at resolve time, D44 §12.3). Everything else —
// including a malformed `![`, or a markdown title form `![a](u "t")` this strict matcher doesn't recognize —
// is literal text. The image refs survive the assemble/SHAPE text transforms (macros are `{{…}}`; squash
// joins with `\n\n`; name-stamp prefixes the line), so tokenizing AFTER those transforms is lossless.

/** A parsed image target: an owned-CAS asset (by id) or an external URL. The chat domain resolves this to a
 *  model-fetchable URL via the injected `resolveImageUrl` op (asset→CAS URL/data-URI; external→gated). */
export type ContentImageRef = { readonly kind: "asset"; readonly assetId: string } | { readonly kind: "external"; readonly url: string };

/** One ordered span of a tokenized message body. */
export type ContentSpan = { readonly kind: "text"; readonly text: string } | { readonly kind: "image"; readonly ref: ContentImageRef; readonly alt: string };

// `![alt](target)` — `alt` excludes `]`, `target` excludes whitespace + `)` (both linear, no backtracking →
// ReDoS-safe). The title form `![a](u "t")` intentionally fails to match (the space) and falls through to text.
const IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
const ASSET_SCHEME = "asset:";

function parseTarget(target: string): ContentImageRef {
  if (target.startsWith(ASSET_SCHEME)) {
    return { kind: "asset", assetId: target.slice(ASSET_SCHEME.length) };
  }
  return { kind: "external", url: target };
}

/**
 * Split a message body into ordered text/image spans. A body with no image refs → a single text span (the
 * whole string, incl. `""` for an empty body — the byte-identical text path). Adjacent images yield adjacent
 * image spans with no empty text span between them.
 */
export function tokenizeContent(content: string): ContentSpan[] {
  const spans: ContentSpan[] = [];
  let last = 0;
  for (const m of content.matchAll(IMAGE_RE)) {
    const idx = m.index;
    const full = m[0];
    const alt = m[1] ?? "";
    const target = m[2] ?? "";
    if (idx > last) {
      spans.push({ kind: "text", text: content.slice(last, idx) });
    }
    spans.push({ kind: "image", ref: parseTarget(target), alt });
    last = idx + full.length;
  }
  if (last < content.length) {
    spans.push({ kind: "text", text: content.slice(last) });
  }
  if (spans.length === 0) {
    spans.push({ kind: "text", text: "" });
  }
  return spans;
}
