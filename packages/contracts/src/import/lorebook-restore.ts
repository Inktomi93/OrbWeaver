import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

export const cardLorebookRestoreResultSchema = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    characterId: typeIdSchema(ID_PREFIX.character),
    worldBookId: typeIdSchema(ID_PREFIX.worldBook),
    entryCount: z.int().nonnegative(),
    replaced: z.boolean(),
  }),
  z.strictObject({ ok: z.literal(false), error: z.string() }),
]);

export type CardLorebookRestoreResult = z.infer<typeof cardLorebookRestoreResultSchema>;
