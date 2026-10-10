import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

/** Shared membership-library scope; a census never carries paging coordinates. */
export const chatCensusInputSchema = z.object({
  includeArchived: z.boolean().optional(),
  characterId: typeIdSchema(ID_PREFIX.character).optional(),
  search: z.string().optional(),
  /** Exclusive epoch-millisecond ceiling over displayed recency. */
  beforeRecencyAt: z.number().int().optional(),
});
export type ChatLibraryLens = z.infer<typeof chatCensusInputSchema>;
