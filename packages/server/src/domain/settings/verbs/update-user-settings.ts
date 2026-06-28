// verb: updateUserSettings — whole-blob replace of this user's UserSettings (per-user tier). Scoped to
// `params.principal.userId`. Serialized per user (esoteric #5): two concurrent same-user writes would each
// read the same base and last-write-wins would drop one. The post-write view is read INSIDE the serializer
// so a concurrent same-user writer can't make the returned view reflect a different write. First-touch
// seeds the row; `writeUserConfig` stamps the service-owned `schemaVersion`.

import type { SettingsContext, SettingsService } from "../contract/service";
import { readUserSettings, writeUserConfig } from "../persistence/queries";

export function createUpdateUserSettings(
  ctx: SettingsContext,
): SettingsService["updateUserSettings"] {
  return (params) => {
    const ownerId = params.principal.userId;
    return ctx.serializeUserWrite(ownerId, async () => {
      const at = ctx.now();
      await writeUserConfig(ctx.db, ownerId, params.input.config, at);
      await ctx.audit(
        {
          actorUserId: ownerId,
          action: "settings.updateUserSettings",
          entityType: "settings",
          entityId: ownerId,
          // Whole-blob replace: log the top-level section names that were set, not the entire config.
          metadata: { sections: Object.keys(params.input.config) },
        },
        at,
      );
      return readUserSettings(ctx.db, ownerId);
    });
  };
}
