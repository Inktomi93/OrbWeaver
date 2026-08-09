// @orb/contracts/chat/card-frame — the wire for the TRUST-GATED CARD-FRAME DOORWAY (D44 §12.2's sandbox,
// delivered as a real response instead of a `srcdoc` blob). A `srcdoc` frame INHERITS the app document's
// CSP, so a per-character trust grant can never widen `img-src` there; a document served from a URL carries
// its OWN policy. This contract is the two-step that gets card bytes to such a URL:
//
//   1. POST /api/card-frame  — the viewer's own session MINTS a frame from card bytes it is already
//      rendering. The request names `chatId` + `characterId` as a POLICY SELECTOR, never as a policy:
//      the server reads that character's SERVER-RESOLVED `renderPolicy` off the membership-gated roster
//      and decides the frame's CSP itself. A non-member, an unknown character, or a missing selector all
//      resolve to the safe floor (no `data:`, no external media) — fail closed.
//   2. GET  /api/card-frame/:id — serves the minted document. Handles are per-USER: another principal's id
//      is indistinguishable from a nonexistent one (both 404 — the `/api/blob` no-existence-leak precedent).
//
// The bytes in the mint are the SAME bytes the viewer's own browser is already about to render, so the mint
// is not a new content-injection surface; what it is NOT allowed to do is assert its own trust tier.

import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

/** The route prefix — the mint POSTs here, the frame document is `${CARD_FRAME_ROUTE}/<id>`. */
export const CARD_FRAME_ROUTE = "/api/card-frame";

/** Build the frame URL for a minted handle. One home so the client never re-spells the path. */
export function cardFrameUrl(id: string): string {
  return `${CARD_FRAME_ROUTE}/${id}`;
}

// Bounds. A card is model-authored self-contained markup; these are generous for that and bound the
// per-process retention (MAX_ENTRIES × these) rather than trusting a body-limit alone.
const MAX_HTML_CHARS = 64_000;
const MAX_CSS_CHARS = 16_000;
const MAX_THEME_TOKENS = 24;
const MAX_TOKEN_NAME_CHARS = 64;
const MAX_TOKEN_VALUE_CHARS = 64;
const MAX_FONT_FAMILY_CHARS = 120;

/** The mint request. `strictObject` — an unknown key is a REJECT, not a silent strip: this body decides
 *  which policy a security boundary is built with, so a typo'd selector must fail loudly rather than
 *  quietly resolving to the floor and leaving a card mysteriously image-less. */
export const cardFrameMintRequestSchema = z.strictObject({
  /** The chat whose membership scopes the roster read. The server 404s the mint when the caller is not a
   *  participant — the selector cannot reach a room the viewer cannot read. */
  chatId: typeIdSchema(ID_PREFIX.chat),
  /** WHICH participant's render policy applies. `null` ⇒ the safe floor (a user-authored or system card). */
  characterId: typeIdSchema(ID_PREFIX.character).nullable(),
  /** The card's stored source, verbatim — handed to a sandboxed realm, never sanitized into any DOM. */
  html: z.string().max(MAX_HTML_CHARS),
  /** The card's own CSS, if the block carried one. */
  css: z.string().max(MAX_CSS_CHARS).optional(),
  /** Concrete theme-resolved `--*` colors for the base body rule (the frame cannot resolve our cascade).
   *  Re-clamped server-side by `clampCardFrameThemeTokens` — these caps only bound the PARSE. */
  themeTokens: z
    .record(z.string().max(MAX_TOKEN_NAME_CHARS), z.string().max(MAX_TOKEN_VALUE_CHARS))
    .refine((r) => Object.keys(r).length <= MAX_THEME_TOKENS)
    .optional(),
  /** The resolved UI font-family list. Re-validated server-side against the font-list grammar. */
  fontFamily: z.string().max(MAX_FONT_FAMILY_CHARS).optional(),
});
/** @public type twin of `cardFrameMintRequestSchema`. */
export type CardFrameMintRequest = z.infer<typeof cardFrameMintRequestSchema>;

/** The mint response — the frame URL plus the handle's lifetime, so a long-lived tab can re-mint before a
 *  remount finds an expired handle rather than discovering it as a blank frame. */
export const cardFrameMintResponseSchema = z.strictObject({
  url: z.string(),
  expiresInMs: z.number().int().positive(),
  /** What the server ACTUALLY granted, echoed so the client can render an honest "images blocked" affordance
   *  instead of inferring one from the trust tier it asked with. Never an input. */
  granted: z.strictObject({ externalMedia: z.boolean(), inlineData: z.boolean() }),
});
/** @public type twin of `cardFrameMintResponseSchema`. */
export type CardFrameMintResponse = z.infer<typeof cardFrameMintResponseSchema>;
