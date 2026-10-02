// @orb/contracts/preset/portability — the preset import result exposed by transport.
// Export bytes and import execution remain domain-internal; this extends the canonical delivery outcome.
import type { PresetId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import type { PortableImportOutcome } from "#portability";
import { portableImportOutcomeSchema } from "#portability";

/** ok:false + error for a malformed upload; created:false when the file content-matched an owned preset
 *  and that row was reused. `name` is the name the preset landed under; `renamedFrom` is the file's own
 *  name when a different same-named preset forced a collision suffix. */
export interface PresetImportOutcome extends Pick<PortableImportOutcome, "ok" | "created" | "error"> {
  /** The written row. Present on successful imports, optional for delivery-core compatibility. */
  readonly presetId?: PresetId;
  readonly name?: string;
  readonly renamedFrom?: string | null;
}
export const presetImportOutcomeSchema = portableImportOutcomeSchema.omit({ notes: true }).extend({
  presetId: typeIdSchema(ID_PREFIX.preset).exactOptional(),
  name: z.string().exactOptional(),
  renamedFrom: z.string().nullable().exactOptional(),
}) satisfies z.ZodType<PresetImportOutcome>;
