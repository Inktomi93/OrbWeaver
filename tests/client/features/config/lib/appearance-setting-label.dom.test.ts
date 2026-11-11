// Every Appearance setting a SillyTavern theme leftover can point at has a leaf in the production config-section registry, so the
// Looks note can name it by the label the person finds in Settings. A key without a leaf would throw while the note renders.
import { THEME_LEFTOVER_APPEARANCE_SETTINGS } from "@orb/contracts/portability";
import { createAuthedComposition, createClientRuntime } from "@orb/testkit/browser";
import { expect, test } from "@orb/testkit/node";
import { appearanceSettingLabel } from "#client/features/config/lib/appearance-setting-label.ts";

const { configSections } = createAuthedComposition(createClientRuntime("http://localhost"));

test("every Appearance setting a theme leftover can name has a registered label", () => {
  const labels = THEME_LEFTOVER_APPEARANCE_SETTINGS.map((key) => appearanceSettingLabel(configSections, key));

  expect(labels.filter((label) => label.trim().length === 0)).toEqual([]);
  expect(labels).toHaveLength(THEME_LEFTOVER_APPEARANCE_SETTINGS.length);
});
