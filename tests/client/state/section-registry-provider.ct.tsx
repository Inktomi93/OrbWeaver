// section-registry-provider CT — the provider delivers its `value` to every descendant consumer and
// renders its children. Mounts the probe (a consumer nested under the provider) and asserts the child
// rendered AND received the full registry (every id), proving the value reached the consumer tree.

import { expect, test } from "@playwright/experimental-ct-react";
import { SectionRegistryProbe } from "./_ct-stories";

test("SectionRegistryProvider renders children and delivers the registry to a nested consumer", async ({ mount }) => {
  const probe = await mount(<SectionRegistryProbe />);
  const out = probe.locator("output");
  await expect(out).toBeVisible();
  // Every section reached the consumer — the provider delivered the total registry, not a partial one.
  await Promise.all(["chats", "characters", "corpus", "config", "databank", "presets", "refinery", "analytics"].map((id) => expect(out).toContainText(id)));
});
