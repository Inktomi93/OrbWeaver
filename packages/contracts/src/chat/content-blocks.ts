// @orb/contracts/chat/content-blocks — the D294, UI-Theming-and-Content §12.4 message-content RENDER model: a message body is a typed
// SEQUENCE of content blocks (markdown / gated media / trust-tiered html-card), NOT one HTML string. This is
// how a stored message is DISPLAYED — distinct from the provider-send model (`ChatContentPart`, D45 — what the
// model receives), which shares one stored asset but is a different contract in the opposite direction. Also
// the `contentSpansToBlocks` projection off the kit content-span grammar (D51), which DEGRADES, never throws.

import type { ContentSpan } from "@orb/kit/content";
import { contentSpanRaw, tokenizeContent } from "@orb/kit/content";
import type { AssetId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import { ASSET_LIST_LIMIT_MAX } from "../assets/index.ts";
import { CONTENT_CLASS_POLICY } from "./content-classes.ts";

// ── Message content blocks (D294, UI-Theming-and-Content §12.4) ────────────────────────────────────────────────────────────
// A message body is a typed SEQUENCE of content blocks, NOT one HTML string (ST's fatal simplification).
// This is the RENDER model — how a stored message is *displayed*. It is distinct from the provider-send
// model (`ChatHistoryMessage.content` → content-parts, D45 — what the model receives as input); the two
// share one stored asset but are different contracts in opposite directions. Chat assembles these.

const messageMediaKindSchema = z.enum(["image", "audio", "video"]);

// Tier-A = inert sanitized allowlist in the main DOM; Tier-B = sandboxed-iframe card (the card-trust tier split).
const cardTrustSchema = z.enum(["tierA", "tierB"]);
export type CardTrust = z.infer<typeof cardTrustSchema>;

// D51 preserves the markdown target until media policy resolves it.
const authoredMarkdownText = z.string();

/** Where a media block's bytes come from: an owned asset (per-user CAS, D21) or an external URL (gated by
 *  `forbidExternalMedia` at render, D294, UI-Theming-and-Content §12.3 — never auto-loaded for untrusted content). */
const messageMediaSrcSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("asset"), assetId: typeIdSchema(ID_PREFIX.asset) }),
  z.strictObject({ kind: z.literal("external"), url: authoredMarkdownText }),
]);

/** The typed message-content block union. `html-card` carries its own trust tier; `media` covers image +
 *  native audio/video; `markdown` is the default text path. (D294, UI-Theming-and-Content §12.4 — born-compliant before Phase 5.) */
export const messageContentBlockSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("markdown"), md: authoredMarkdownText }),
  z.strictObject({
    kind: z.literal("media"),
    media: messageMediaKindSchema,
    src: messageMediaSrcSchema,
    alt: z.string(),
    dims: z.strictObject({ w: z.number(), h: z.number() }).optional(),
  }),
  z.strictObject({
    kind: z.literal("html-card"),
    html: z.string(),
    css: z.string().optional(),
    trust: cardTrustSchema,
    /** The `:::card title="…"` label — the expand-affordance/lightbox label. Absent on
     *  a title-less card and on the pre-grammar born-compliant arm (additive, version-tolerant). */
    title: z.string().optional(),
    /** How the card was recognized (§4.8 provenance): `fence` = an explicit `:::card`; `lenient` = the
     *  naked-HTML / html-tagged-code-fence implicit arm. Surfaced by the reveal/debug + view-raw chrome;
     *  absent on the pre-grammar born-compliant arm (additive, version-tolerant). */
    origin: z.enum(["fence", "lenient"]).optional(),
  }),
  /** The CYOA choice set — the model's `:::choices` fence projected for the reading
   *  surface. The block ships rendered as an ordinary list; a later client arm upgrades it to
   *  clickable send-affordances without touching this contract. */
  z.strictObject({
    kind: z.literal("choices"),
    options: z.array(z.string()),
  }),
]);
export type MessageContentBlock = z.infer<typeof messageContentBlockSchema>;

/** The per-send bounds on structured content. `blocks` is the attachment list cap, so a send's pictures share one limit. */
export const SEND_BLOCK_LIMITS = { blocks: ASSET_LIST_LIMIT_MAX, mdChars: 100_000, altChars: 1024 } as const;

const SEND_BLOCK_SEPARATOR = "\n\n";

// An alt is a literal label: `]` ends the image grammar's alt, `<` opens a tag the scanner reads first, a newline
// reaches the line-anchored directive grammar, and `{{` would resolve in a later render of the stored body.
const SEND_BLOCK_ALT_RE = /^[^\]<\r\n]*$/;
const MACRO_OPEN = "{{";

// One private-use code point per picture: no word, digit or whitespace class matches it, and macros ignore it.
const SEND_PICTURE_PLACEHOLDER_BASE = 0xe0_00;
const placeholderFor = (index: number): string => String.fromCodePoint(SEND_PICTURE_PLACEHOLDER_BASE + index);
const SEND_PICTURE_PLACEHOLDERS = `[${placeholderFor(0)}-${placeholderFor(SEND_BLOCK_LIMITS.blocks - 1)}]`;
const SEND_PICTURE_PLACEHOLDER_RE = new RegExp(SEND_PICTURE_PLACEHOLDERS, "u");

/**
 * What a caller may author on `send`: the render blocks that compile into the one stored body (D51). Text and an
 * owned stored picture only. A card's trust tier is the server's verdict, `choices` is model output, an external
 * ref never rides, and the body cannot carry `dims`.
 */
const sendContentBlockSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("markdown"),
    md: z
      .string()
      .min(1)
      .max(SEND_BLOCK_LIMITS.mdChars)
      .refine((md) => !SEND_PICTURE_PLACEHOLDER_RE.test(md)),
  }),
  z.strictObject({
    kind: z.literal("media"),
    media: z.literal("image"),
    src: z.strictObject({ kind: z.literal("asset"), assetId: typeIdSchema(ID_PREFIX.asset) }),
    alt: z
      .string()
      .max(SEND_BLOCK_LIMITS.altChars)
      .regex(SEND_BLOCK_ALT_RE)
      .refine((alt) => !alt.includes(MACRO_OPEN)),
  }),
]);
export type SendContentBlock = z.infer<typeof sendContentBlockSchema>;

type SendPictureBlock = Extract<SendContentBlock, { kind: "media" }>;

const sendPictures = (blocks: readonly SendContentBlock[]): SendPictureBlock[] => blocks.filter((block) => block.kind === "media");

const pictureRef = (block: SendPictureBlock): string => contentSpanRaw({ kind: "image", alt: block.alt, ref: { kind: "asset", assetId: block.src.assetId } });

/**
 * The one message the author-side transforms read: block text in order, with one private-use character standing
 * for each picture (U+E000 for the first, then upward). A transform sees the whole message once and never an alt
 * or a ref. {@link placeSendPictures} restores the pictures as the last step.
 */
export function sendBlockDraft(blocks: readonly SendContentBlock[]): string {
  let picture = 0;
  return blocks.map((block) => (block.kind === "markdown" ? block.md : placeholderFor(picture++))).join(SEND_BLOCK_SEPARATOR);
}

/** A send's block text alone, as an attachment send's text reads: what every reader past the transforms gets. */
export function sendBlockText(blocks: readonly SendContentBlock[]): string {
  return blocks.flatMap((block) => (block.kind === "markdown" ? [block.md] : [])).join(SEND_BLOCK_SEPARATOR);
}

/** The transformed draft without its placeholders, or the paragraph a placeholder had alone: what the world-info
 *  scan and `{{input}}` read, shaped like the same text on an attachment send. */
export function stripSendPlaceholders(text: string): string {
  const placeholders = new RegExp(SEND_PICTURE_PLACEHOLDERS, "gu");
  return text
    .split(SEND_BLOCK_SEPARATOR)
    .flatMap((paragraph) => {
      const stripped = paragraph.replace(placeholders, "");
      return stripped.length === 0 && paragraph.length > 0 ? [] : [stripped];
    })
    .join(SEND_BLOCK_SEPARATOR);
}

/** `text` with each placeholder replaced by its picture ref. An unknown placeholder drops. */
export function fillSendPictures(blocks: readonly SendContentBlock[], text: string): string {
  const refs = sendPictures(blocks).map(pictureRef);
  return text.replace(
    new RegExp(SEND_PICTURE_PLACEHOLDERS, "gu"),
    (placeholder) => refs[(placeholder.codePointAt(0) ?? 0) - SEND_PICTURE_PLACEHOLDER_BASE] ?? "",
  );
}

/** The transformed draft with its pictures placed, or `null` when a transform removed, repeated or invented one. */
export function placeSendPictures(blocks: readonly SendContentBlock[], text: string): string | null {
  const count = sendPictures(blocks).length;
  const found = text.match(new RegExp(SEND_PICTURE_PLACEHOLDERS, "gu")) ?? [];
  const indexes = new Set(found.map((placeholder) => (placeholder.codePointAt(0) ?? 0) - SEND_PICTURE_PLACEHOLDER_BASE));
  if (found.length !== count || indexes.size !== count || [...indexes].some((index) => index >= count)) {
    return null;
  }
  return fillSendPictures(blocks, text);
}

/** The body as authored, before any transform: what `rawContent` keeps. */
export function composeSendBody(blocks: readonly SendContentBlock[]): string {
  return blocks.map((block) => (block.kind === "markdown" ? block.md : pictureRef(block))).join(SEND_BLOCK_SEPARATOR);
}

const pictureKey = (assetId: AssetId, alt: string): string => JSON.stringify([assetId, alt]);

/** Whether every authored picture is an image span in `body` exactly as many times as it was authored. Counts each
 *  occurrence, because one surviving copy of an asset must not hide a swallowed copy. */
export function picturesPlaceExactlyOnce(blocks: readonly SendContentBlock[], body: string): boolean {
  const authored = new Map<string, number>();
  for (const { src, alt } of sendPictures(blocks)) {
    const key = pictureKey(src.assetId, alt);
    authored.set(key, (authored.get(key) ?? 0) + 1);
  }
  const placed = new Map<string, number>();
  for (const span of tokenizeContent(body, { committed: true })) {
    if (span.kind === "image" && span.ref.kind === "asset") {
      const key = pictureKey(span.ref.assetId, span.alt);
      placed.set(key, (placed.get(key) ?? 0) + 1);
    }
  }
  return [...authored].every(([key, count]) => placed.get(key) === count);
}

export const sendContentBlocksSchema = z
  .array(sendContentBlockSchema)
  .min(1)
  .max(SEND_BLOCK_LIMITS.blocks)
  .refine((blocks) => picturesPlaceExactlyOnce(blocks, composeSendBody(blocks)), { error: "a markdown block swallows a later picture" });

/**
 * Project kit content spans (`@orb/kit/content` `tokenizeContent` — the ONE ref grammar, D51) into
 * the D294 render blocks: consecutive text spans join into one `markdown` block; image spans become
 * `media` blocks (`external` refs are rendered through the gated `MessageMedia`, never a raw
 * `<img>` — D294, UI-Theming-and-Content §12.3). The `html-card` extraction grammar is NOT parsed here — it lands with the
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
export interface ContentSpansToBlocksOptions {
  /** The trust tier stamped on `card`-span blocks — resolved by the CALLER from the row's render policy
   *  (§4.3: model output → `tierB`; ONE trust authority, `render-trust`). Default `tierB` (the fail-closed
   *  sandbox arm — never default a card into the main DOM). */
  readonly cardTrust?: CardTrust | undefined;
}

/** The image-span projection (the original D51 arm — degrade-not-throw on a bad persisted brand). */
function imageSpanBlock(span: Extract<ContentSpan, { kind: "image" }>): MessageContentBlock {
  if (span.ref.kind === "external") {
    return {
      kind: "media",
      // The D51 grammar is mime-blind, so the PROJECTION says image; the client's ASSET arm re-picks the
      // element off the resolved asset mime (`video/*` → the native <video>, #317). External refs stay
      // image (the attachment machinery never mints them).
      media: "image",
      src: { kind: "external", url: span.ref.url },
      alt: span.alt,
    };
  }
  const branded = typeIdSchema(ID_PREFIX.asset).safeParse(span.ref.assetId);
  if (branded.success) {
    return { kind: "media", media: "image", src: { kind: "asset", assetId: branded.data }, alt: span.alt };
  }
  // Degrade a malformed persisted asset ref to its literal markdown (never throw — see header).
  return { kind: "markdown", md: `![${span.alt}](asset:${span.ref.assetId})` };
}

function nonTextBlock(span: Exclude<ContentSpan, { kind: "text" | "hidden" | "unknown-directive" | "dice" }>, trust: CardTrust): MessageContentBlock {
  switch (span.kind) {
    case "image":
      return imageSpanBlock(span);
    case "card":
      return { kind: "html-card", html: span.body, trust, origin: span.origin, ...(span.title === null ? {} : { title: span.title }) };
    case "choices":
      return { kind: "choices", options: [...span.options] };
    default:
      return assertNeverContentSpan(span);
  }
}

function assertNeverContentSpan(_span: never): never {
  throw new Error("Unrecognized content span");
}

export function contentSpansToBlocks(spans: readonly ContentSpan[], options?: ContentSpansToBlocksOptions): MessageContentBlock[] {
  const cardTrust: CardTrust = options?.cardTrust ?? "tierB";
  const blocks: MessageContentBlock[] = [];
  let pendingText = "";
  const flushText = (): void => {
    if (pendingText.length > 0) {
      blocks.push({ kind: "markdown", md: pendingText });
      pendingText = "";
    }
  };
  for (const span of spans) {
    // Reading policy is not authorization: the server strips hidden bodies from member payloads (D285).
    if (CONTENT_CLASS_POLICY[span.kind].reading === "hide") {
      continue;
    }
    if (span.kind === "text" || span.kind === "dice" || span.kind === "hidden" || span.kind === "unknown-directive") {
      pendingText += span.kind === "text" ? span.text : span.raw;
      continue;
    }
    flushText();
    blocks.push(nonTextBlock(span, cardTrust));
  }
  flushText();
  return blocks;
}

// Transport validates typed block envelopes after the stored-content projection has already degraded.
const [markdownBlock, mediaBlock, htmlBlock, choicesBlock] = messageContentBlockSchema.options;
export const messageContentBlockViewSchema = z.union([
  markdownBlock.strict(),
  mediaBlock.strict().extend({
    src: z.union(mediaBlock.shape.src.options.map((option) => option.strict())),
    dims: mediaBlock.shape.dims.unwrap().strict().optional(),
  }),
  htmlBlock.strict(),
  choicesBlock.strict(),
]) satisfies z.ZodType<MessageContentBlock>;
