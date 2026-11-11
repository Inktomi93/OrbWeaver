// The label an Appearance setting wears in Settings, read off the config-section registry the settings panes render from, so a
// sentence that points a person at a setting says the word they will find there.

import type { ThemeLeftoverAppearanceSetting } from "@orb/contracts/portability";
import type { ContributorRegistry } from "#lib";
import type { ConfigSectionContribution } from "#state";

/** The label of the Appearance setting stored under `key`. A key is one control in the registry, and every key a theme import can
 *  name has a leaf (`tests/client/features/config/lib/appearance-setting-label.dom.test.ts` walks them). */
export function appearanceSettingLabel(registry: ContributorRegistry<ConfigSectionContribution>, key: ThemeLeftoverAppearanceSetting): string {
  for (const { nav } of registry.list()) {
    const leaf = nav.settings?.find((setting) => setting.key === key);
    if (leaf !== undefined) {
      return leaf.label;
    }
  }
  throw new Error(`No Appearance setting is registered under "${key}"`);
}
