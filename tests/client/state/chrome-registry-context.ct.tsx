// chrome-registry-context CT — `useChromeRegistry` reads the registry delivered by its provider (the
// runtime context app-shell's topbar trail consumes instead of a #features import). Mounts the probe and
// asserts the delivered `topbar.trail` entries equal the production assembly over the door's widget list
// (`compose/contributors.ts`), in registry order. The expectation is computed in the story from that list,
// so a widget added to or removed from the door needs no edit here.
//
// A REGISTRATION CENSUS, NOT A VISIBILITY ONE — `list()` returns what the door registered; an entry's
// `useVisible` is never called by this probe.

import { expect, test } from "@playwright/experimental-ct-react";
import { ChromeRegistryProbe } from "./_ct-stories.tsx";

test("useChromeRegistry resolves the door's topbar.trail entries, in the door's order, inside the provider", async ({ mount }) => {
  const probe = await mount(<ChromeRegistryProbe />);
  // `match` is the story's own comparison of the delivered entries with the door's; the ids must not be empty.
  await expect(probe.locator("output")).toHaveText(/^match=true\|ids=.+$/u);
});
