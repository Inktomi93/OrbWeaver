// Restore historical rows only. There is no canonical chat/connection restore map in the bundle core,
// so their source ids remain explicit historical attribution instead of becoming live foreign pointers.

import { IMAGERY_SCHEMA_KIND, parseImageryCall } from "#kit/serde/imagery";
import { portableParseError } from "#kit/serde/lib";
import type { ImageryPortabilityContext, ImageryPortabilityService } from "../contract/portability.ts";
import { writeImportedImageryCall } from "../persistence/portability-write.ts";

export function createImportProvenance(ctx: ImageryPortabilityContext): ImageryPortabilityService["importFile"] {
  return async (ownerId, file) => {
    const parsed = parseImageryCall(file.bytes);
    if (!parsed.ok) {
      return { ok: false, error: `${portableParseError(IMAGERY_SCHEMA_KIND, parsed.reason)} (${file.filename})` };
    }
    const result = await writeImportedImageryCall(ctx, ownerId, parsed.value);
    if (!result.admitted) {
      return { ok: false, error: "Imagery history requires every output asset to be restored and owned." };
    }
    const notes: string[] = [];
    const execution = parsed.value.execution;
    if (execution.connectionId !== null) {
      notes.push("The historical connection was not relinked; provider, model and cost attribution were retained without credentials.");
    }
    if (execution.chatId !== null) {
      notes.push("The historical chat was not relinked because no canonical chat restore mapping is available.");
    }
    if (execution.subjectCharacterHandle !== null && !result.subjectLinked) {
      notes.push("The historical subject could not be relinked to an owned character handle.");
    }
    return { ok: true, created: result.created, notes };
  };
}
