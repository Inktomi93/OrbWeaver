// chrome-registry-provider CT — the provider delivers its `value` to every descendant consumer and
// renders its children. Mounts the probe (a consumer nested under the provider) and asserts the child
// rendered AND received the full registry, proving the value reached the consumer tree.

import { expect, test } from "@playwright/experimental-ct-react";
import { ChromeRegistryProbe } from "./_ct-stories.tsx";

test("ChromeRegistryProvider renders children and delivers the registry to a nested consumer", async ({ mount }) => {
  const probe = await mount(<ChromeRegistryProbe />);
  const out = probe.locator("output");
  await expect(out).toBeVisible();
  // All three registered widgets reached the consumer — the provider delivered the full registry.
  await Promise.all(["notifications-bell", "fullscreen-toggle", "context-toggle"].map((id) => expect(out).toContainText(id)));
});
