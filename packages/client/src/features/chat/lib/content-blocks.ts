// The stored-body → render-block projection (UI-Theming §12.4). A message body is ONE string (D26/
// D51); the RENDER model is a typed `MessageContentBlock[]` PARSED from it at render (never stored) —
// consecutive text → one `markdown` block, image refs → `media` blocks. Both the kit ref-grammar
// tokenizer (`tokenizeContent`, @orb/kit/content) and the contracts projector (`contentSpansToBlocks`,
// @orb/contracts/chat) are BUILT + one-home; this is the thin feature seam that composes them so the
// row dispatcher (message-content.tsx) renders against a typed block union, not a raw string.
//
// SEAM (deferred, NOT this task): the display pipeline `renderMessageForDisplay` (#lib/message-render
// — macros/regex/fixMarkdown) runs UPSTREAM of this, once a MessageRenderContext (participants /
// persona / cast / env) is threaded to the row; and the `<speaker>`-span split (#21) consumes the
// same string before projection. Both leave this projection untouched (§12.4: spans survive it).

import type { ContentSpansToBlocksOptions, MessageContentBlock } from "@orb/contracts/chat";
import { contentSpansToBlocks } from "@orb/contracts/chat";
import { tokenizeContent } from "@orb/kit/content";

/** Project a stored/authored message body into the typed render-block sequence (§12.4). Pure. This is the
 *  READING-SURFACE plane of the parity-plus §3 visibility registry: hidden-class tags and unknown
 *  command-shaped directives project to NO block (the client defense-in-depth arm — the server member-strip
 *  is the trust boundary); `:::card`/`:::choices` fences project to their render blocks. `options.cardTrust`
 *  is the row's resolved render trust (§4.3 — the caller maps `render-trust`'s verdict; default tierB). */
export function toContentBlocks(content: string, options?: ContentSpansToBlocksOptions): readonly MessageContentBlock[] {
  return contentSpansToBlocks(tokenizeContent(content), options);
}
