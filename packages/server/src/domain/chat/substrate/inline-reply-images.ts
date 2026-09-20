// domain/chat/substrate/inline-reply-images — §6.7's CANON PROJECTION for a picture the model emitted inside
// its own prose: mint the alt, splice the `![alt](asset:<id>)` span where the picture arrived, and hand back
// the body the variant stores. PURE (string in, string out): the bytes→CAS half is the engine's, because only
// it knows the room host and holds the injected store op.
//
// WHY A SPAN AND NOT A BLOCK: canon is ONE text column (`message_variants.content`, D51) and render blocks are
// DERIVED from the content-span grammar, so the only way a picture becomes part of a message is as markdown
// the tokenizer already understands — the same encoding `verbs/generate-image.ts` and
// `verbs/post-narrator-message.ts` write. That is also what makes the picture SURVIVE an edit, a fork, an
// export and a re-import: it is in the prose, not in a sidecar.
//
// THE ALT IS UNFIXABLE LATER (F22, side-eye 8 P1-9). It is baked into canon at generation time and there is no
// render-time correction, so a counter ("image 1") would be a filename read aloud forever. The policy is: the
// model's caption if it emitted one, else the PRECEDING PROSE SENTENCE, else `""` — and `""` is the CORRECT
// HTML answer for a genuinely undescribed picture (a screen reader skips it), which the grammar already admits
// (`contracts/chat/content-blocks.ts` `alt` is a bare `z.string()`). Note on the first arm: no chat wire we
// speak carries a per-image caption FIELD (the V4 file part is mediaType + data — `backends/v4/stream.ts`
// `generatedImageOf`), so the caption the `replyMedia` contract asks the model for arrives AS the prose in
// front of the picture. The two arms are therefore the same extraction, and preferring the caption is
// satisfied by construction rather than by a branch that could never be taken.

import { tokenizeContent } from "@orb/kit/content";
import type { AssetId } from "@orb/kit/ids";
import type { PlacedInlineImage } from "../contract/results.ts";

/** The alt ceiling — a model that captions a picture with three paragraphs is not writing alt text, and the
 *  string is permanent. Matches imagery's own `ALT_MAX_CHARS` so the two picture writers read alike. */
const ALT_MAX_CHARS = 300;

/** Sentence terminators the alt mint splits the preceding prose on. Deliberately not a locale-aware
 *  segmenter: the fallback is `""`, so a miss costs an empty alt, never a wrong one. */
const SENTENCE_END = /[.!?…]+["'”’)\]]*\s+/gu;

/** The PROSE in front of an offset, with every non-text span removed. Tokenizing rather than slicing is the
 *  whole point and it is a VISIBILITY rule, not tidiness: a `<lie …>` hidden span is host-only bytes, and an
 *  alt minted off a raw slice would copy the deception's text into a member-visible attribute on a picture
 *  the member CAN see — laundering it past the hidden-span scrub, which only ever removes the span itself.
 *  Card bodies and choices blocks drop for the same reason they never read aloud well. */
function precedingProse(content: string, upTo: number): string {
  return tokenizeContent(content.slice(0, upTo), { committed: true })
    .flatMap((span) => (span.kind === "text" ? [span.text] : []))
    .join("");
}

/** F22's mint: the last complete sentence of the prose in front of the picture, trimmed and capped; `""`
 *  when there is no prose (the picture opened the turn) or nothing survives the strip. NEVER a counter.
 *  @public Test-anchored module surface; focused tests pin this production-local behavior. */
export function mintInlineImageAlt(content: string, atChars: number): string {
  const prose = precedingProse(content, atChars).trimEnd();
  if (prose.length === 0) {
    return "";
  }
  // The LAST sentence, not the whole paragraph: the sentence immediately before the picture is the caption
  // the `replyMedia` contract asked for; everything earlier is the scene, which is not what this picture is.
  const sentences = prose.split(SENTENCE_END);
  const last = (sentences.at(-1) ?? "").trim();
  const chosen = last.length > 0 ? last : prose.trim();
  return chosen.slice(0, ALT_MAX_CHARS).trim();
}

/** The markdown a stored picture becomes in canon. One home — the two other picture writers spell their own
 *  because their alt is a CONSTANT; this one's is minted per picture. */
function imageSpan(alt: string, assetId: AssetId): string {
  return `![${alt}](asset:${assetId})`;
}

/** Join a ref onto the body so it starts its own block: markdown needs a blank line, and a ref glued to the
 *  end of a sentence would render inside that paragraph. Nothing is added at the very start of a body. */
function openBlock(before: string): string {
  if (before.length === 0 || before.endsWith("\n\n")) {
    return "";
  }
  return before.endsWith("\n") ? "\n" : "\n\n";
}

/** Splice every picture's span into the body at the offset it arrived at (§6.7), left to right.
 *
 *  THE OFFSET IS A HINT AND IS CLAMPED, deliberately. It was measured on the provider's raw reply, and the
 *  domain's RECEIVE tier runs between that measurement and this splice — AI_OUTPUT regex scripts, the
 *  `<think>` demux, the per-speaker self-label strip — any of which may shorten or rewrite the prose. So an
 *  offset past the end lands at the end, and offsets that cross after clamping keep ARRIVAL ORDER rather
 *  than re-sorting into a position the model never chose. What this protects is the only property that
 *  matters: every picture the model made appears exactly once, in the order it made them. */
export function spliceInlineReplyImages(content: string, images: readonly PlacedInlineImage[]): string {
  if (images.length === 0) {
    return content;
  }
  let out = "";
  let cursor = 0;
  for (const image of images) {
    const at = Math.min(Math.max(image.atChars, cursor), content.length);
    out += content.slice(cursor, at);
    // Minted against the ORIGINAL body up to this point, never the spliced `out`: a previous picture's span
    // is markdown, not prose, and letting it become the next picture's caption is how alts start echoing
    // each other.
    out += openBlock(out) + imageSpan(mintInlineImageAlt(content, at), image.assetId);
    cursor = at;
  }
  const tail = content.slice(cursor);
  return tail.length === 0 ? out : out + (tail.startsWith("\n") ? "" : "\n\n") + tail;
}
