// The read-only cost preview returned before an owner changes an embedding target.
import { z } from "zod";

const storedCount = z.int().nonnegative();
export const embedSpaceChangePreviewSchema = z.strictObject({
  reindex: z.boolean(),
  stored: z.strictObject({ cards: storedCount, memory: storedCount, documents: storedCount, images: storedCount }),
  embedCalls: storedCount,
  utilityModelSet: z.boolean(),
});
export type EmbedSpaceChangePreview = z.output<typeof embedSpaceChangePreviewSchema>;
