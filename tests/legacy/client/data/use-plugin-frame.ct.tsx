// CT: the plugin-frame HANDLE LIFECYCLE. The unit file beside this one pins the request shapes; what only a
// mount can reach is teardown of an already-minted handle and a later remount.
//
// Worse here than for a card, because a plugin frame has NO floor: `undefined` means the surface renders
// NOTHING (§4.9). So a memo that keeps a failed mint doesn't degrade a surface for one bad second — it
// deletes it from the page for the tab's whole life, for those exact bytes, with no request and no retry.
// The plugin memo was ALSO unbounded (a bare `Map.set`, no cap) where the card memo has always been LRU-
// capped; both halves land here.
//
// The probe remounts a reader at the SAME body, which is what a collapse/expand or a re-opened panel does.

import { PLUGIN_FRAME_ROUTE } from "@orb/contracts/plugin";
import { expect, test } from "@playwright/experimental-ct-react";
import { PluginFrameMemoStory } from "./_ct-stories.tsx";

const MINTED_URL = `${PLUGIN_FRAME_ROUTE}/0123456789abcdef0123456789abcdef`;
/** `pluginFrameMintResponseSchema`'s exact shape — a parse failure degrades to nothing too, which would
 *  make the assertion below pass for the wrong reason. */
const GRANTED = JSON.stringify({ url: MINTED_URL, expiresInMs: 60_000 });

test("a FAILED mint is not remembered as an answer — the surface can come back", async ({ mount, page }) => {
  let posts = 0;
  await page.route(`**${PLUGIN_FRAME_ROUTE}`, async (route) => {
    posts += 1;
    if (posts === 1) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "overloaded" }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: GRANTED });
  });

  await mount(<PluginFrameMemoStory />);
  // Nothing, correctly — a refused mint renders nothing rather than a script-dead box pretending to be one.
  await expect(page.getByTestId("frame-src")).toHaveText("nothing");

  await page.getByTestId("ct-remount-frame").click();
  await expect(page.getByTestId("frame-src")).toHaveText(MINTED_URL);
  expect(posts, "the second attempt must reach the wire — a cached failure would have answered it").toBe(2);
});

test("a GRANTED handle is revoked on teardown and a remount gets a fresh handle", async ({ mount, page }) => {
  let posts = 0;
  let deletes = 0;
  await page.route(`**${PLUGIN_FRAME_ROUTE}`, async (route) => {
    posts += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: GRANTED });
  });
  await page.route(`**${MINTED_URL}`, async (route) => {
    deletes += 1;
    await route.fulfill({ status: 204 });
  });

  await mount(<PluginFrameMemoStory />);
  await expect(page.getByTestId("frame-src")).toHaveText(MINTED_URL);

  await page.getByTestId("ct-remount-frame").click();
  await expect(page.getByTestId("frame-src")).toHaveText(MINTED_URL);
  expect(posts).toBe(2);
  expect(deletes).toBe(1);
});
