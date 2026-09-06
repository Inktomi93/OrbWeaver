// chrome-registry-context CT — `useChromeRegistry` reads the registry delivered by its provider (the
// runtime context app-shell's topbar trail consumes instead of a #features import). Mounts the probe and
// asserts the hook resolves the real door-assembled widget set (CtDataProviders' CtFakeSectionRegistry
// stack nests the real chrome registry, mirroring main.tsx).
//
// THE EXPECTATION IS A CENSUS OF THE DOOR, so every chrome entry added to `topbar.trail` lands here too:
// `character-create` (`features/character/lib/character-create-chrome.tsx`) joined the zone at b64f6bdc0
// (#1669 — the phone's chrome paying for itself) and this probe was not swept with it, so the file sat red
// on main until #1741's lane ran it. The order asserted is the registry's own `(order, id)`: the
// section-primary at `order: 10` precedes the shell's focus/detail toggles by that entry's own ruling.
//
// A REGISTRATION CENSUS, NOT A VISIBILITY ONE — `list()` returns what the door registered, and
// `character-create` declares `useVisible` (mobile + the characters section + a docked list). This probe
// never calls it; the entry is here because it is REGISTERED, on every viewport.

import { expect, test } from "@playwright/experimental-ct-react";
import { ChromeRegistryProbe } from "./_ct-stories.tsx";

test("useChromeRegistry resolves the real registered topbar.trail widgets inside the provider", async ({ mount }) => {
  const probe = await mount(<ChromeRegistryProbe />);
  const out = probe.locator("output");
  await expect(out).toContainText("ids=notifications-bell,character-create,fullscreen-toggle,context-toggle");
});
