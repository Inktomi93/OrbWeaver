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

const failedCardSchema = z.strictObject({
  filename: z.string().nullable(),
  error: z.string(),
});
export type FailedCard = z.infer<typeof failedCardSchema>;

/** The successful batch response, including isolated failures and byte-identical reimports. */
export const cardImportResultSchema = z.strictObject({
  imported: z.array(importedCardSchema).readonly(),
  failed: z.array(failedCardSchema).readonly(),
});
export type CardImportResult = z.infer<typeof cardImportResultSchema>;
