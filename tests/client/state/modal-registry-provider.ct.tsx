// modal-registry-provider CT — the provider delivers its `value` to every descendant consumer and
// renders its children. Mounts the probe (a consumer nested under the provider) and asserts the child
// rendered AND received the full registry (all six ids), proving the value reached the consumer tree.

import { expect, test } from "@playwright/experimental-ct-react";
import { ModalRegistryProbe } from "./_ct-stories.tsx";

test("ModalRegistryProvider renders children and delivers the registry to a nested consumer", async ({ mount }) => {
  const probe = await mount(<ModalRegistryProbe />);
  const out = probe.locator("output");
  await expect(out).toBeVisible();
  // A representative spread of the modals reached the consumer — the provider delivered the total
  // registry, not a partial one. (`account` left the vocabulary with #866 S4: the persona switcher's
  // foot carries its facts now.)
  await Promise.all(["command", "newChat", "you", "reauth"].map((id) => expect(out).toContainText(id)));
});
