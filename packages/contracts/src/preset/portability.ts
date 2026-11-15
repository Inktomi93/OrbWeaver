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
/** The names of the sections a SillyTavern preset gained for orb's own slots (memory, databank and the rest). */
const addedSectionsSchema = z.array(z.string()).readonly();
export const presetImportOutcomeSchema = z.discriminatedUnion("ok", [
  imported.omit({ notes: true }).extend({
    presetId: typeIdSchema(ID_PREFIX.preset).exactOptional(),
    name: z.string().exactOptional(),
    renamedFrom: z.string().nullable().exactOptional(),
    /** The scripts the preset file carried (a SillyTavern preset's, or an orbweaver preset file's own list), attached
     *  to the preset: new library rows, equal ones reused, and each one the write door refused. */
    regexScripts: z
      .strictObject({ created: z.int().nonnegative(), reused: z.int().nonnegative(), refused: z.array(refusedScriptSchema).readonly() })
      .exactOptional(),
    addedSections: addedSectionsSchema.exactOptional(),
  }),
  refused.omit({ notes: true }).extend({
    presetId: z.never().exactOptional(),
    name: z.never().exactOptional(),
    renamedFrom: z.never().exactOptional(),
    regexScripts: z.never().exactOptional(),
    addedSections: z.never().exactOptional(),
  }),
]);
export type PresetImportOutcome = z.output<typeof presetImportOutcomeSchema>;

/** The two formats the Presets page's import reads, told apart by the file's envelope. */
const PRESET_FILE_FORMATS = ["orbweaver", "sillyTavern"] as const;

/** What importing one preset file does, from the run's own parse and a dry run of its write. `name` is the name the
 *  file asks for, clipped; `inLibrary` says the run reuses an equal preset the owner holds. `sectionCount` counts
 *  the prompts the preset lands with and `enabledCount` those switched on; `samplerCount` and `limitCount` count the
 *  sampler values and the context and output limits the preset lands with. `leftOut` names each field with no
 *  seat and says why in plain words, a malformed regex script by its position, `clamped` names each value the
 *  import brought into range, with what the file sent and what the preset landed with (those are imported, so never
 *  in `leftOut`), `regexScripts` counts the scripts
 *  the run attaches to the preset, `refusedScripts` names each one the write door refuses, and `addedSections` names
 *  the sections the run adds for orb's own slots. */
export const presetFilePreviewSchema = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    format: z.enum(PRESET_FILE_FORMATS),
    name: importTextSchema,
    inLibrary: z.boolean(),
    sectionCount: z.int().nonnegative(),
    enabledCount: z.int().nonnegative(),
    samplerCount: z.int().nonnegative(),
    limitCount: z.int().nonnegative(),
    leftOut: z.array(z.strictObject({ field: importTextSchema, reason: z.string() })).readonly(),
    clamped: z.array(z.strictObject({ field: importTextSchema, sent: z.number(), landedAs: z.number() })).readonly(),
    regexScripts: z.int().nonnegative(),
    refusedScripts: z.array(refusedScriptSchema).readonly(),
    addedSections: addedSectionsSchema,
  }),
  z.strictObject({ ok: z.literal(false), error: z.string() }),
]);
export type PresetFilePreview = z.output<typeof presetFilePreviewSchema>;
