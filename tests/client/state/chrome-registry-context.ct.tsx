// chrome-registry-context CT — `useChromeRegistry` reads the registry delivered by its provider (the
// runtime context app-shell's topbar trail consumes instead of a #features import). Mounts the probe and
// asserts the hook resolves the real door-assembled widget set (CtDataProviders' CtFakeSectionRegistry
// stack nests the real chrome registry, mirroring main.tsx).

import { expect, test } from "@playwright/experimental-ct-react";
import { ChromeRegistryProbe } from "./_ct-stories";

test("useChromeRegistry resolves the real registered topbar.trail widgets inside the provider", async ({
  mount,
}) => {
  const probe = await mount(<ChromeRegistryProbe />);
  const out = probe.locator("output");
  await expect(out).toContainText("ids=notifications-bell,fullscreen-toggle,context-toggle");
});
