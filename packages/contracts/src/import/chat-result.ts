import { z } from "zod";
import { storedImportWindowSchema } from "../chat/backfill.ts";
import { importTextSchema } from "./preview.ts";

export const chatImportResultSchema = z.strictObject({
  // `title` names the room: the held room's current title, else the written room's; null only when the room has none.
  imported: z.array(z.strictObject({ filename: z.string(), created: z.boolean(), title: importTextSchema.nullable() })).readonly(),
  failed: z.array(z.strictObject({ filename: z.string(), error: z.string() })).readonly(),
  memoryScope: storedImportWindowSchema.nullable(),
});

export type ChatImportResult = z.infer<typeof chatImportResultSchema>;
