// Where an Appearance setting is in Settings, read off the config-section registry the settings panes render from, so a sentence that
// points a person at a setting says the word they will find there and the place it is in: the section, and whether that section sits
// behind the pane's "Customize this look" disclosure, which keeps it off the page until it is opened.

import type { ThemeLeftoverAppearanceSetting } from "@orb/contracts/portability";
import type { ContributorRegistry } from "#lib";
import type { ConfigSectionContribution } from "#state";
import type { AppearanceSettingPlace } from "./theme-import-copy.ts";

/** The place of the Appearance setting stored under `key`. A key is one control in the registry, and every key a theme import can
 *  name has a leaf (`tests/client/features/config/lib/appearance-setting-place.dom.test.ts` walks them). */
export function appearanceSettingPlace(registry: ContributorRegistry<ConfigSectionContribution>, key: ThemeLeftoverAppearanceSetting): AppearanceSettingPlace {
  for (const { nav, advanced } of registry.list()) {
    const leaf = nav.settings?.find((setting) => setting.key === key);
    if (leaf !== undefined) {
      return { label: leaf.label, section: nav.label, folded: advanced === true };
    }
  }
  throw new Error(`No Appearance setting is registered under "${key}"`);
}
