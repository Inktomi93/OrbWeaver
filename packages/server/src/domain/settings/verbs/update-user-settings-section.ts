// verb: updateUserSettingsSection — deep-merge ONE namespace + re-validate the whole blob (the write path
// every settings surface should use). Scoped to `params.principal.userId`. Read-merge-write under the
// per-user serializer so a concurrent patch of a SIBLING section can't clobber this one (atomic w.r.t.
// other same-user writes). Re-validation runs through the lenient `parseUserSettings` (inside
// readUserSettings/writeUserConfig) — a malformed patch self-heals through the parser instead of nuking.
// The `routing` section additionally passes `coherentRoutingPatch` first: the parser validates each leaf
// in isolation and cannot see that `(source, model)` is one selection (substrate/routing-coherence.ts).

import type { UserSettings } from "@orb/contracts/settings";
import { isPlainObject } from "@orb/kit/guards";
import type { SettingsContext, SettingsService } from "../contract/service.ts";
import { readUserSettings, writeUserConfig } from "../persistence/queries.ts";
import { deepMergePlain } from "../substrate/merge.ts";
import { coherentRoutingPatch } from "../substrate/routing-coherence.ts";

/** The two embed-space model ids a write can change — the tuple the PD-139a reindex trigger keys on. A
 *  routing patch that leaves BOTH untouched (or a patch to any other section) must not enqueue a reindex. */
function embedModelIds(config: UserSettings): readonly [embed: string | undefined, imageEmbed: string | undefined] {
  const rd = config.routing.roleDefaults;
  // `model` is now nullable (the client's explicit clear). Fold `null` → `undefined` so a no-op clear on
  // an already-unset field compares equal (no spurious reindex); a real string→cleared change still fires.
  return [rd.embed?.model ?? undefined, rd.imageEmbed?.model ?? undefined];
}

export function createUpdateUserSettingsSection(ctx: SettingsContext): SettingsService["updateUserSettingsSection"] {
  return (params) => {
    const ownerId = params.principal.userId;
    const { section, patch } = params.input;
    return ctx.serializeUserWrite(ownerId, async () => {
      const current = (await readUserSettings(ctx.db, ownerId)).config;
      const existing = current[section];
      // `(source, model)` is ONE selection and the merge is per-KEY, so a routing patch is made coherent
      // BEFORE it merges: naming a role's source without its model clears the stale model, and a model
      // pinned on a server-configured source is refused (substrate/routing-coherence.ts). Every other
      // section merges its patch verbatim.
      const coherent = section === "routing" ? coherentRoutingPatch(current.routing, patch) : patch;
      const mergedSection = deepMergePlain(isPlainObject(existing) ? existing : {}, coherent) as UserSettings[typeof section];
      const at = ctx.now();
      const nextConfig = { ...current, [section]: mergedSection };
      await writeUserConfig(ctx.db, ownerId, nextConfig, at);
      // #2352: derive verb identity from the section discriminant so N callers sharing one wire procedure
      // never form N identical audit lines — the section IS the verb identity.
      await ctx.audit(
        {
          actorUserId: ownerId,
          action: `settings.update.${section}`,
          entityType: "settings",
          entityId: ownerId,
          // The changed section + the patch's top-level keys only — never the whole config blob.
          metadata: { section, keys: Object.keys(patch) },
        },
        at,
      );
      ctx.emitUserEvent(ownerId, { type: "settingsChanged" });
      // PD-139a: an embed/imageEmbed model change strands the old `(model)` vector space, so it must drive a
      // bulk purge+reindex. Compare the two ids pre/post-merge and fire the injected op ONLY on an actual
      // change (a routing patch that doesn't touch them, or any other section, does not enqueue).
      // Fire-and-forget, exactly like the emit above — a failed enqueue never fails this write.
      const [beforeEmbed, beforeImageEmbed] = embedModelIds(current);
      const [afterEmbed, afterImageEmbed] = embedModelIds(nextConfig);
      if (afterEmbed !== beforeEmbed || afterImageEmbed !== beforeImageEmbed) {
        ctx.onEmbedModelChanged();
      }
      return readUserSettings(ctx.db, ownerId);
    });
  };
}
