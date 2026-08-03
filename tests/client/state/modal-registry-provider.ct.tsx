// modal-registry-provider CT — the provider delivers its `value` to every descendant consumer and
// renders its children. Mounts the probe (a consumer nested under the provider) and asserts the child
// rendered AND received the full registry (all six ids), proving the value reached the consumer tree.

import { expect, test } from "@playwright/experimental-ct-react";
import { ModalRegistryProbe } from "./_ct-stories.tsx";

test("ModalRegistryProvider renders children and delivers the registry to a nested consumer", async ({ mount }) => {
  const probe = await mount(<ModalRegistryProbe />);
  const out = probe.locator("output");
  await expect(out).toBeVisible();
  // All six modals reached the consumer — the provider delivered the total registry, not a partial one.
  await Promise.all(["theme", "settings", "account", "command", "newChat", "you"].map((id) => expect(out).toContainText(id)));
});
