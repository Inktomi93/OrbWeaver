// @orb/contracts/preset/portability — the preset import result exposed by transport.
// Export bytes and import execution remain domain-internal; this extends the canonical delivery outcome.
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import { portableImportOutcomeSchema } from "#portability";
import { importTextSchema } from "../import/preview.ts";

/** ok:false + error for a malformed upload; created:false when the file content-matched an owned preset
 *  and that row was reused. `name` is the name the preset landed under; `renamedFrom` is the file's own
 *  name when a different same-named preset forced a collision suffix. */
const [imported, refused] = portableImportOutcomeSchema.options;

/** A script the write door refused, by its clipped name and the door's reason. */
const refusedScriptSchema = z.strictObject({ name: importTextSchema, reason: importTextSchema });
export const presetImportOutcomeSchema = z.discriminatedUnion("ok", [
  imported.omit({ notes: true }).extend({
    presetId: typeIdSchema(ID_PREFIX.preset).exactOptional(),
    name: z.string().exactOptional(),
    renamedFrom: z.string().nullable().exactOptional(),
    /** The scripts a SillyTavern preset carried, attached to the preset: new library rows, equal ones reused, and
     *  each one the write door refused. */
    regexScripts: z
      .strictObject({ created: z.int().nonnegative(), reused: z.int().nonnegative(), refused: z.array(refusedScriptSchema).readonly() })
      .exactOptional(),
  }),
  refused.omit({ notes: true }).extend({
    presetId: z.never().exactOptional(),
    name: z.never().exactOptional(),
    renamedFrom: z.never().exactOptional(),
    regexScripts: z.never().exactOptional(),
  }),
]);
export type PresetImportOutcome = z.output<typeof presetImportOutcomeSchema>;

/** The two formats the Presets page's import reads, told apart by the file's envelope. */
const PRESET_FILE_FORMATS = ["orbweaver", "sillyTavern"] as const;

/** What importing one preset file does, from the run's own parse and a dry run of its write. `name` is the name the
 *  file asks for, clipped; `inLibrary` says the run reuses an equal preset the owner holds. `leftOut` names each
 *  field with no seat, a malformed regex script by its position, `regexScripts` counts the scripts the run
 *  attaches to the preset, and `refusedScripts` names each one the write door refuses. */
export const presetFilePreviewSchema = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    format: z.enum(PRESET_FILE_FORMATS),
    name: importTextSchema,
    inLibrary: z.boolean(),
    sectionCount: z.int().nonnegative(),
    leftOut: z.array(z.strictObject({ field: importTextSchema, reason: z.string() })).readonly(),
    regexScripts: z.int().nonnegative(),
    refusedScripts: z.array(refusedScriptSchema).readonly(),
  }),
  z.strictObject({ ok: z.literal(false), error: z.string() }),
]);
export type PresetFilePreview = z.output<typeof presetFilePreviewSchema>;
