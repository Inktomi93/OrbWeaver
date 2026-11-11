// The multipart character import response preserves per-card success and failure isolation.
import { z } from "zod";
import { characterIdSchema } from "#assets";

const importedCardSchema = z.strictObject({
  filename: z.string().nullable(),
  characterId: characterIdSchema,
  created: z.boolean(),
  importHash: z.string(),
  notes: z.array(z.string()).readonly().optional(),
});
export type ImportedCard = z.infer<typeof importedCardSchema>;

/** The two ways a card is refused for what it holds: the bytes are no card, or the card fails the canonical schema. */
export const CARD_REFUSAL_CODES = ["card_unreadable", "card_invalid"] as const;

/** Why a card failed. A refusal for what the card holds carries its code; any other fault in the import is `failed`. */
export const FAILED_CARD_REASONS = [...CARD_REFUSAL_CODES, "failed"] as const;
export type FailedCardReason = (typeof FAILED_CARD_REASONS)[number];

const failedCardSchema = z.strictObject({
  filename: z.string().nullable(),
  /** What a client keys its sentence on. */
  reason: z.enum(FAILED_CARD_REASONS),
  /** The server's own sentence, for the log; a client never shows it. */
  error: z.string(),
});
export type FailedCard = z.infer<typeof failedCardSchema>;

/** The successful batch response, including isolated failures and byte-identical reimports. */
export const cardImportResultSchema = z.strictObject({
  imported: z.array(importedCardSchema).readonly(),
  failed: z.array(failedCardSchema).readonly(),
});
export type CardImportResult = z.infer<typeof cardImportResultSchema>;
