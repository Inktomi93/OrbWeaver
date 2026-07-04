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

import type { MessageContentBlock } from "@orb/contracts/chat";
import { contentSpansToBlocks } from "@orb/contracts/chat";
import { tokenizeContent } from "@orb/kit/content";

/** Project a stored/authored message body into the typed render-block sequence (§12.4). Pure. */
export function toContentBlocks(content: string): readonly MessageContentBlock[] {
  return contentSpansToBlocks(tokenizeContent(content));
}
