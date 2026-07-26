// @orb/contracts/chat/content-blocks — the D44 §12.4 message-content RENDER model: a message body is a typed
// SEQUENCE of content blocks (markdown / gated media / trust-tiered html-card), NOT one HTML string. This is
// how a stored message is DISPLAYED — distinct from the provider-send model (`ChatContentPart`, D45 — what the
// model receives), which shares one stored asset but is a different contract in the opposite direction. Also
// the `contentSpansToBlocks` projection off the kit content-span grammar (D51), which DEGRADES, never throws.

import type { ContentSpan } from "@orb/kit/content";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

// ── Message content blocks (D44 §12.4) ────────────────────────────────────────────────────────────
// A message body is a typed SEQUENCE of content blocks, NOT one HTML string (ST's fatal simplification).
// This is the RENDER model — how a stored message is *displayed*. It is distinct from the provider-send
// model (`ChatHistoryMessage.content` → content-parts, D45 — what the model receives as input); the two
// share one stored asset but are different contracts in opposite directions. Chat assembles these (P5).

export const messageMediaKindSchema = z.enum(["image", "audio", "video"]);
export type MessageMediaKind = z.infer<typeof messageMediaKindSchema>;

/** Tier-A = inert sanitized allowlist in the main DOM; Tier-B = sandboxed-iframe card (client.md §12.2). */
export const cardTrustSchema = z.enum(["tierA", "tierB"]);
export type CardTrust = z.infer<typeof cardTrustSchema>;

/** Where a media block's bytes come from: an owned asset (per-user CAS, D21) or an external URL (gated by
 *  `forbidExternalMedia` at render, D44 §12.3 — never auto-loaded for untrusted content). */
export const messageMediaSrcSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("asset"), assetId: typeIdSchema(ID_PREFIX.asset) }),
  z.object({ kind: z.literal("external"), url: z.string() }),
]);
export type MessageMediaSrc = z.infer<typeof messageMediaSrcSchema>;

/** The typed message-content block union. `html-card` carries its own trust tier; `media` covers image +
 *  native audio/video; `markdown` is the default text path. (D44 §12.4 — born-compliant before Phase 5.) */
export const messageContentBlockSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("markdown"), md: z.string() }),
  z.object({
    kind: z.literal("media"),
    media: messageMediaKindSchema,
    src: messageMediaSrcSchema,
    alt: z.string(),
    dims: z.object({ w: z.number(), h: z.number() }).optional(),
  }),
  z.object({
    kind: z.literal("html-card"),
    html: z.string(),
    css: z.string().optional(),
    trust: cardTrustSchema,
  }),
]);
export type MessageContentBlock = z.infer<typeof messageContentBlockSchema>;

/**
 * Project kit content spans (`@orb/kit/content` `tokenizeContent` — the ONE ref grammar, D51) into
 * the D44 render blocks: consecutive text spans join into one `markdown` block; image spans become
 * `media` blocks (`external` refs are rendered through the gated `MessageMedia`, never a raw
 * `<img>` — D44 §12.3). The `html-card` extraction grammar is NOT parsed here — it lands with the
 * chat-content wiring that defines how a card is embedded in a stored body (the union member is
 * born-compliant; this projection covers the markdown + media classes the D51 grammar defines).
 *
 * STORED-CONTENT PROJECTIONS DEGRADE, NEVER THROW (ratified doctrine). The input spans come from a
 * persisted, arbitrary model/user-authored body (any member can type — and any model can emit —
 * `![alt](asset:<not-a-typeid>)`; the send path neither does nor should reject body prose). The kit
 * tokenizer cannot carry the TypeID brand (the cake), so the `asset` arm re-validates the brand at
 * this seam — but a `.parse` throw here fires INSIDE React render with no per-row boundary, so one
 * malformed persisted ref would crash the whole app on every open of that chat, forever (an
 * unrecoverable state authored from stored data). A ref that fails the brand therefore DEGRADES to the
 * raw image markdown as a text block (the author's bytes are preserved; the gated media path is
 * reserved for well-branded refs) — matching the server twin `toContentParts`, which drops a bad/gone
 * ref rather than throwing. This projection NEVER throws on persisted content.
 */
export function contentSpansToBlocks(spans: readonly ContentSpan[]): MessageContentBlock[] {
  const blocks: MessageContentBlock[] = [];
  let pendingText = "";
  const flushText = (): void => {
    if (pendingText.length > 0) {
      blocks.push({ kind: "markdown", md: pendingText });
      pendingText = "";
    }
  };
  for (const span of spans) {
    if (span.kind === "text") {
      pendingText += span.text;
      continue;
    }
    flushText();
    if (span.ref.kind === "external") {
      blocks.push({
        kind: "media",
        media: "image", // the D51 grammar embeds images; native a/v arrives via html-card/native paths
        src: { kind: "external", url: span.ref.url },
        alt: span.alt,
      });
      continue;
    }
    const branded = typeIdSchema(ID_PREFIX.asset).safeParse(span.ref.assetId);
    if (branded.success) {
      blocks.push({
        kind: "media",
        media: "image",
        src: { kind: "asset", assetId: branded.data },
        alt: span.alt,
      });
      continue;
    }
    // Degrade a malformed persisted asset ref to its literal markdown (never throw — see header).
    blocks.push({ kind: "markdown", md: `![${span.alt}](asset:${span.ref.assetId})` });
  }
  flushText();
  return blocks;
}
