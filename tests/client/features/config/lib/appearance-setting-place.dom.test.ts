// Every Appearance setting a SillyTavern theme leftover can point at is named by the label the Appearance section itself renders for
// that control and placed in the section that holds it, read off the production config-section registry. A key without a leaf would
// throw while the Looks note renders, and a lookup that names a setting by another leaf's label or section would send the person to a
// setting that is not there.
import { THEME_LEFTOVER_APPEARANCE_SETTINGS } from "@orb/contracts/portability";
import { createAuthedComposition, createClientRuntime } from "@orb/testkit/browser";
import { expect, test } from "@orb/testkit/node";
import { appearanceSettingPlace } from "#client/features/config/lib/appearance-setting-place.ts";

const { configSections } = createAuthedComposition(createClientRuntime("http://localhost"));

/** The registry's own rows that carry `key` as a setting leaf, with the section each sits in. */
function leafRows(key: string): readonly { readonly owns: unknown; readonly label: string; readonly section: string; readonly advanced: boolean }[] {
  return configSections
    .list()
    .flatMap(({ nav, owns, advanced }) =>
      (nav.settings ?? []).filter((leaf) => leaf.key === key).map(({ label }) => ({ owns, label, section: nav.label, advanced: advanced === true })),
    );
}

test("each Appearance setting a theme leftover can name is labelled and placed by its own registry row", () => {
  for (const key of THEME_LEFTOVER_APPEARANCE_SETTINGS) {
    const rows = leafRows(key);
    // The key is one control in the Appearance tier, so the row the label comes from is unambiguous.
    expect(rows).toHaveLength(1);
    expect(rows[0]?.owns).toMatchObject({ tier: "user", section: "appearance" });
    expect(appearanceSettingPlace(configSections, key)).toEqual({ label: rows[0]?.label, section: rows[0]?.section, folded: rows[0]?.advanced });
  }
});

test("the labels of the Appearance settings a theme leftover can name are all different", () => {
  const labels = THEME_LEFTOVER_APPEARANCE_SETTINGS.map((key) => appearanceSettingPlace(configSections, key).label);

  expect(new Set(labels).size).toBe(THEME_LEFTOVER_APPEARANCE_SETTINGS.length);
});
