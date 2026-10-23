// @orb/contracts/preset/portability — the preset import result exposed by transport.
// Export bytes and import execution remain domain-internal; this extends the canonical delivery outcome.
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import { portableImportOutcomeSchema } from "#portability";

/** ok:false + error for a malformed upload; created:false when the file content-matched an owned preset
 *  and that row was reused. `name` is the name the preset landed under; `renamedFrom` is the file's own
 *  name when a different same-named preset forced a collision suffix. */
const [imported, refused] = portableImportOutcomeSchema.options;
export const presetImportOutcomeSchema = z.discriminatedUnion("ok", [
  imported.omit({ notes: true }).extend({
    presetId: typeIdSchema(ID_PREFIX.preset).exactOptional(),
    name: z.string().exactOptional(),
    renamedFrom: z.string().nullable().exactOptional(),
  }),
  refused.omit({ notes: true }).extend({ presetId: z.never().exactOptional(), name: z.never().exactOptional(), renamedFrom: z.never().exactOptional() }),
]);
export type PresetImportOutcome = z.output<typeof presetImportOutcomeSchema>;
