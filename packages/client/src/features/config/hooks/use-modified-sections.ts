// The `@modified` derivation (config-revamp-design.md §3.3, owner fork F-7: modified = DIFFERS FROM
// DEFAULT): a user-tier section's `owns` claim already names its keys, so the cached `UserSettings` vs
// `DEFAULT_USER_SETTINGS` at those keys says whether any differs; an app-tier claim resolves against
// `getAppSettingsWithOverrides.overrides` — an override PRESENT at a claimed path is modified (the D120 S4
// "floor is unknowable once overridden" rule). So `@modified` costs a contribution NOTHING and can never
// lie about a key it does not own.
//
// NON-SUSPENSE on purpose (the `useSettingsViewerView` posture): the search must never block the LIST from
// painting — an unresolved read simply reports nothing modified yet. The app-tier read only runs for an
// admin viewer (the procedure is admin-gated; asking as a plain user would 403 into noise).

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { useQuery } from "@tanstack/react-query";
import { useSettingsViewerView, useTRPC } from "#data";
// The ONE "modified" derivation, shared with the per-leaf row chrome (`use-config-leaf.ts`) — hoisted to
// `#lib` by the §3.4 row-chrome leg so a row's stripe and its section's `@modified` badge cannot disagree.
import { settingsValueAtPath, settingsValueDiffers } from "#lib";
import type { ConfigGroupId, ModifiedSubIds, SettingsKeyClaim } from "#state";
import { useConfigSectionRegistry } from "#state";

function claimModified(claim: SettingsKeyClaim, userConfig: unknown, appOverrides: unknown): boolean {
  if (claim.tier === "user") {
    return claim.keys.some((key) =>
      settingsValueDiffers(settingsValueAtPath(userConfig, `${claim.section}.${key}`), settingsValueAtPath(DEFAULT_USER_SETTINGS, `${claim.section}.${key}`)),
    );
  }
  return claim.keys.some((key) => settingsValueAtPath(appOverrides, key) !== undefined);
}

/** Per group, the sub ids whose owned keys differ from default — the `@modified` filter's whole input. */
export function useModifiedSubIds(): ModifiedSubIds {
  const trpc = useTRPC();
  const registry = useConfigSectionRegistry();
  const viewer = useSettingsViewerView();
  const { data: user } = useQuery(trpc.settings.getUserSettings.queryOptions());
  const { data: app } = useQuery({ ...trpc.settings.getAppSettingsWithOverrides.queryOptions(), enabled: viewer.isAdmin });

  const out = new Map<ConfigGroupId, Set<string>>();
  for (const contribution of registry.list()) {
    const claim = contribution.owns;
    if (claim === undefined) {
      continue;
    }
    if (claim.tier === "app" && !viewer.isAdmin) {
      continue;
    }
    if (claimModified(claim, user?.config, app?.overrides)) {
      const subs = out.get(contribution.anchor) ?? new Set<string>();
      subs.add(contribution.nav.id);
      out.set(contribution.anchor, subs);
    }
  }
  return out;
}
