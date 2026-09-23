// The `@modified` derivation (owner fork F-7: modified = DIFFERS FROM
// DEFAULT): a user-tier section's `owns` claim already names its keys, so the cached `UserSettings` vs
// `DEFAULT_USER_SETTINGS` at those keys says whether any differs; an app-tier claim resolves against
// `getAppSettingsWithOverrides.overrides` — an override PRESENT at a claimed path is modified (the D120 S4
// "floor is unknowable once overridden" rule). So `@modified` costs a contribution NOTHING and can never
// lie about a key it does not own.
//
// TWO GRAINS, ONE PASS (#1099 F16). The section grain alone made `@modified` answer for every LEAF of a
// modified section: one changed setting returned five rows, three of them unmodified. So the same walk also
// resolves each declared leaf's OWN `key` through the same claim — the identical compare `use-config-leaf.ts`
// runs for a row's stripe — and reports it as the leaf's search-entry id (`group::sub::setting`). A leaf that
// declares no `key` is absent from the leaf set by construction: it has no value of its own to differ.
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
import type { ConfigGroupId, ConfigModifiedMap, ConfigSectionContribution, SettingsKeyClaim } from "#state";
import { useConfigSectionRegistry } from "#state";

/** The two cached reads one verdict is computed against — passed as one bag so every helper reads the same
 *  pair (a helper that took only the user half would silently answer `false` for every app-tier claim). */
interface SettingsReads {
  readonly userConfig: unknown;
  readonly appOverrides: unknown;
}

/** One modified section: its address plus the search-entry ids of the leaves that are themselves modified. */
interface ModifiedContribution {
  readonly anchor: ConfigGroupId;
  readonly subId: string;
  readonly leafIds: readonly string[];
}

/** One claimed key's verdict — the whole compare, at either tier, in one place. */
function keyModified(claim: SettingsKeyClaim, key: string, reads: SettingsReads): boolean {
  if (claim.tier === "user") {
    const path = `${claim.section}.${key}`;
    return settingsValueDiffers(settingsValueAtPath(reads.userConfig, path), settingsValueAtPath(DEFAULT_USER_SETTINGS, path));
  }
  return settingsValueAtPath(reads.appOverrides, key) !== undefined;
}

/** One contribution's verdict, or `null` when it claims nothing, is out of the viewer's tier, or is at rest. */
function verdictFor(contribution: ConfigSectionContribution, isAdmin: boolean, reads: SettingsReads): ModifiedContribution | null {
  const claim = contribution.owns;
  if (claim === undefined || (claim.tier === "app" && !isAdmin)) {
    return null;
  }
  if (!claim.keys.some((key) => keyModified(claim, key, reads))) {
    return null;
  }
  const leafIds = (contribution.nav.settings ?? [])
    .filter((leaf) => leaf.key !== undefined && keyModified(claim, leaf.key, reads))
    .map((leaf) => `${contribution.anchor}::${contribution.nav.id}::${leaf.id}`);
  return { anchor: contribution.anchor, subId: contribution.nav.id, leafIds };
}

/** Both grains of the verdict: per group the modified sub ids, plus the modified LEAVES as their search-entry
 *  ids — the `@modified` filter's and the LIST marks' whole input. */
export function useConfigModified(): ConfigModifiedMap {
  const trpc = useTRPC();
  const registry = useConfigSectionRegistry();
  const viewer = useSettingsViewerView();
  const { data: user } = useQuery(trpc.settings.getUserSettings.queryOptions());
  const { data: app } = useQuery({ ...trpc.settings.getAppSettingsWithOverrides.queryOptions(), enabled: viewer.isAdmin });
  const reads: SettingsReads = { userConfig: user?.config, appOverrides: app?.overrides };

  const subs = new Map<ConfigGroupId, Set<string>>();
  const settings = new Set<string>();
  for (const contribution of registry.list()) {
    const verdict = verdictFor(contribution, viewer.isAdmin, reads);
    if (verdict === null) {
      continue;
    }
    const owned = subs.get(verdict.anchor) ?? new Set<string>();
    owned.add(verdict.subId);
    subs.set(verdict.anchor, owned);
    for (const leafId of verdict.leafIds) {
      settings.add(leafId);
    }
  }
  return { subs, settings };
}
