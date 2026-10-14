import { z } from "zod";
import { storedImportWindowSchema } from "../chat/backfill.ts";

export const chatImportResultSchema = z.strictObject({
  imported: z.array(z.strictObject({ filename: z.string(), created: z.boolean() })).readonly(),
  failed: z.array(z.strictObject({ filename: z.string(), error: z.string() })).readonly(),
  memoryScope: storedImportWindowSchema.nullable(),
});

export type ChatImportResult = z.infer<typeof chatImportResultSchema>;
