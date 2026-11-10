// The read-only cost preview returned before an owner changes an embedding target.
import { z } from "zod";
import { embedTargetRefusalSchema } from "./connection.ts";

const storedCount = z.int().nonnegative();
export const embedSpaceChangePreviewSchema = z.strictObject({
  refusal: embedTargetRefusalSchema.nullable(),
  reindex: z.boolean(),
  stored: z.strictObject({ cards: storedCount, memory: storedCount, documents: storedCount, images: storedCount }),
  embedCalls: storedCount,
  utilityModelSet: z.boolean(),
});
export type EmbedSpaceChangePreview = z.output<typeof embedSpaceChangePreviewSchema>;
