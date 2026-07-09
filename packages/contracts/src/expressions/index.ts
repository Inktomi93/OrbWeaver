// `@orb/contracts/expressions` — the wire home for character expression sprites (D49 #4;
// expressions-design/01 §2). Server (tRPC validation + domain re-parse) AND client (management UI +
// stage) both need these shapes, so they live in contracts (§7.4).
//
// SCOPE NOTE (E1 rider): this ships the label axis + the verb zod schemas + the `CharacterSpriteView`
// render shape. The domain leaf (verbs/persistence) + the injected classify ops land with E2/E3.

import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

/** MAX sprites per generated sheet — marinara MAX_INDIVIDUAL_SPRITE_EXPRESSIONS=8 (sprites.routes.ts). */
const SPRITE_SHEET_MAX_LABELS = 8;
/** Appended art-direction cap (prompt-budget discipline). */
const STYLE_PROMPT_MAX = 600;

/** The GoEmotions 28 — the SEED set (UI suggestions + sheet-generation defaults), NEVER a whitelist
 *  (ST parity: custom labels are first-class). */
export const EXPRESSION_LABELS = [
  "admiration",
  "amusement",
  "anger",
  "annoyance",
  "approval",
  "caring",
  "confusion",
  "curiosity",
  "desire",
  "disappointment",
  "disapproval",
  "disgust",
  "embarrassment",
  "excitement",
  "fear",
  "gratitude",
  "grief",
  "joy",
  "love",
  "nervousness",
  "optimism",
  "pride",
  "realization",
  "relief",
  "remorse",
  "sadness",
  "surprise",
  "neutral",
] as const;

/** A label is one of the seed set OR a validated custom string (§5) — the `string & {}` idiom keeps the
 *  literal union visible in editor hints while staying open to custom labels (ST parity). */
export type ExpressionLabel = (typeof EXPRESSION_LABELS)[number] | (string & {});

/** Custom labels: normalized then validated — trim → NFKC → lowercase, then `^[a-z0-9_-]{1,32}$`. NFKC
 *  kills width/compat spoofing; the charset ban on spaces keeps snap-to-label word matching unambiguous
 *  and the classify prompt's closed-list interpolation injection-safe (expressions-design/01 §5). */
export const expressionLabelSchema = z
  .string()
  .transform((s) => s.trim().normalize("NFKC").toLowerCase())
  .pipe(z.string().regex(/^[a-z0-9_-]{1,32}$/));

export const setSpriteSchema = z.object({
  characterId: typeIdSchema(ID_PREFIX.character),
  label: expressionLabelSchema,
  assetId: typeIdSchema(ID_PREFIX.asset),
});
export type SetSpriteInput = z.infer<typeof setSpriteSchema>;

export const listSpritesSchema = z.object({
  characterId: typeIdSchema(ID_PREFIX.character),
});
export type ListSpritesInput = z.infer<typeof listSpritesSchema>;

export const removeSpriteSchema = z.object({
  characterId: typeIdSchema(ID_PREFIX.character),
  label: expressionLabelSchema,
});
export type RemoveSpriteInput = z.infer<typeof removeSpriteSchema>;

export const generateSpriteSheetSchema = z.object({
  characterId: typeIdSchema(ID_PREFIX.character),
  labels: z.array(expressionLabelSchema).min(1).max(SPRITE_SHEET_MAX_LABELS),
  stylePrompt: z.string().max(STYLE_PROMPT_MAX).optional(),
  matte: z.enum(["flood", "none"]).default("flood"),
});
export type GenerateSpriteSheetInput = z.infer<typeof generateSpriteSheetSchema>;

/** The render payload for one sprite binding — the client builds a blobUrl from `asset` (assets.md). The
 *  asset ref is the `{ kind: "asset", id }` shape (expressions-design/01 §2). */
export const characterSpriteViewSchema = z.object({
  characterId: typeIdSchema(ID_PREFIX.character),
  label: z.string(),
  asset: z.object({ kind: z.literal("asset"), id: typeIdSchema(ID_PREFIX.asset) }),
});
export type CharacterSpriteView = z.infer<typeof characterSpriteViewSchema>;
