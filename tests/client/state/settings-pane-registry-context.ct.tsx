// settings-pane-registry-context CT — `useSettingsPaneRegistry` reads the registry delivered by its
// provider (the runtime context the settings host consumes instead of a per-pane #features import).
// Mounts the probe and asserts the hook resolves the total, ordered vocabulary + `get(id)` returns a
// member's label.

import { expect, test } from "@playwright/experimental-ct-react";
import { SettingsPaneRegistryProbe } from "./_ct-stories";

test("useSettingsPaneRegistry resolves the ordered pane list + get(id) inside the provider", async ({ mount }) => {
  const probe = await mount(<SettingsPaneRegistryProbe />);
  const out = probe.locator("output");
  // list() preserves SETTINGS_CATEGORY_IDS order; get("appearance") resolves the member's label.
  await expect(out).toContainText("ids=personas,appearance,workloads,backup,chat-behavior,connections,automation,admin");
  await expect(out).toContainText("appearance=Appearance");
});
