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
// THE ALT IS UNFIXABLE LATER (F22). It is baked into canon at generation time and there is no
// render-time correction, so a counter ("image 1") would be a filename read aloud forever. The policy is: the
// model's caption if it emitted one, else the PRECEDING PROSE SENTENCE, else `""` — and `""` is the CORRECT
// HTML answer for a genuinely undescribed picture (a screen reader skips it), which the grammar already admits
// (`contracts/chat/content-blocks.ts` `alt` is a bare `z.string()`). Note on the first arm: no chat wire we
// speak carries a per-image caption FIELD (the V4 file part is mediaType + data — `backends/v4/stream.ts`
// `generatedImageOf`), so the caption the `replyMedia` contract asks the model for arrives AS the prose in
// front of the picture. The two arms are therefore the same extraction, and preferring the caption is
// satisfied by construction rather than by a branch that could never be taken.

import type { HiddenRun } from "@orb/kit/content";
import { hiddenSpanRanges, stripHiddenSpans, tokenizeContent } from "@orb/kit/content";
import type { AssetId } from "@orb/kit/ids";
import { isSpaceChar } from "@orb/kit/strings";
import type { InlineReplyImageProjection, PlacedInlineImage } from "../contract/results.ts";

/** The alt ceiling — a model that captions a picture with three paragraphs is not writing alt text, and the
 *  string is permanent. Matches imagery's own `ALT_MAX_CHARS` so the two picture writers read alike. */
const ALT_MAX_CHARS = 300;

/** Sentence terminators the alt mint splits the preceding prose on. Deliberately not a locale-aware
 *  segmenter: the fallback is `""`, so a miss costs an empty alt, never a wrong one. */
const TERMINATORS = ".!?…";
const CLOSERS = "\"'”’)]";

/** The text after the last `[.!?…]+["'”’)\]]*\s+` match, or all of `text` without one: the final piece of a split on
 *  that pattern, scanned once. A terminator run either reaches closers and a space together, or no start inside it
 *  can, so a run that fails is skipped whole (the pattern retries every start in a long `.....` run). */
function afterLastSentenceEnd(text: string): string {
  let tail = 0;
  let at = 0;
  while (at < text.length) {
    if (!TERMINATORS.includes(text.charAt(at))) {
      at += 1;
      continue;
    }
    at = skipWhile(text, at, (char) => TERMINATORS.includes(char));
    const afterClosers = skipWhile(text, at, (char) => CLOSERS.includes(char));
    const end = skipWhile(text, afterClosers, isSpaceChar);
    if (end > afterClosers) {
      tail = end;
      at = end;
    }
  }
  return text.slice(tail);
}

function skipWhile(text: string, from: number, keep: (char: string) => boolean): number {
  let at = from;
  while (at < text.length && keep(text.charAt(at))) {
    at += 1;
  }
  return at;
}

/** The PROSE in front of an offset, with every non-text span removed. Tokenizing rather than slicing is the
 *  whole point and it is a VISIBILITY rule, not tidiness: a `<lie …>` hidden span is host-only bytes, and an
 *  alt minted off a raw slice would copy the deception's text into a member-visible attribute on a picture
 *  the member CAN see — laundering it past the hidden-span scrub, which only ever removes the span itself.
 *  Card bodies and choices blocks drop for the same reason they never read aloud well.
 *
 *  SECURITY: the strip runs first, on the hidden scan. The render grammar alone keeps a tag as literal text inside a code
 *  block, when a fence line in its quoted value splits it, or when it never closes, and the alt is not a hidden span, so no
 *  later strip would remove those bytes (D285). */
function precedingProse(content: string, upTo: number): string {
  return tokenizeContent(stripHiddenSpans(content.slice(0, upTo)).content, { committed: true })
    .flatMap((span) => (span.kind === "text" ? [span.text] : []))
    .join("");
}

/** `at`, moved past the hidden run it falls inside. SECURITY: a splice inside a tag's name or first attr name leaves bytes
 *  the walker reads as prose, so the whole tag, `truth` included, reaches a member (D285). */
function pastHiddenRun(runs: readonly HiddenRun[], at: number): number {
  return runs.find((run) => at > run.start && at < run.end)?.end ?? at;
}

// F22's mint: the last complete sentence of the prose in front of the picture, trimmed and capped; `""`
//  when there is no prose (the picture opened the turn) or nothing survives the strip. NEVER a counter.
function mintInlineImageAlt(content: string, atChars: number): string {
  const prose = precedingProse(content, atChars).trimEnd();
  if (prose.length === 0) {
    return "";
  }
  // The LAST sentence, not the whole paragraph: the sentence immediately before the picture is the caption
  // the `replyMedia` contract asked for; everything earlier is the scene, which is not what this picture is.
  const last = afterLastSentenceEnd(prose).trim();
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
 *  matters: every picture the model made appears exactly once, in the order it made them. Tool/prose
 *  boundaries are rebased in that same splice so they still name the stored canonical body. */
export function projectInlineReplyImages(
  content: string,
  images: readonly PlacedInlineImage[],
  offsets: readonly number[],
  offsetEvents: readonly (number | undefined)[] = [],
): InlineReplyImageProjection {
  if (images.length === 0) {
    return { content, offsets };
  }
  const projected = offsets.map((): number | undefined => undefined);
  const hiddenRuns = hiddenSpanRanges(content);
  let out = "";
  let cursor = 0;
  for (const image of images) {
    const at = pastHiddenRun(hiddenRuns, Math.min(Math.max(image.atChars, cursor), content.length));
    for (const [index, offset] of offsets.entries()) {
      const event = offsetEvents[index];
      const beforeImage = offset < at || (offset === at && event !== undefined && image.eventOrdinal !== undefined && event < image.eventOrdinal);
      if (projected[index] === undefined && beforeImage) {
        projected[index] = out.length + offset - cursor;
      }
    }
    out += content.slice(cursor, at);
    // Minted against the ORIGINAL body up to this point, never the spliced `out`: a previous picture's span
    // is markdown, not prose, and letting it become the next picture's caption is how alts start echoing
    // each other.
    out += openBlock(out) + imageSpan(mintInlineImageAlt(content, at), image.assetId);
    cursor = at;
  }
  const tail = content.slice(cursor);
  const separator = tail.length === 0 || tail.startsWith("\n") ? "" : "\n\n";
  return { content: out + separator + tail, offsets: offsets.map((offset, index) => projected[index] ?? out.length + separator.length + offset - cursor) };
}
