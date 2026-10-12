// CT: the card-frame MINT MEMO (#1486). The unit file beside this one pins `mintCardFrame`'s degrade-to-
// `undefined` contract; what only a mount can reach is what the HOOK does with that `undefined` afterwards.
//
// The memo keys the mint PROMISE on the serialized body, module-wide, for the tab's life — so caching a
// failed mint answers one bad second forever: every later reader of those exact bytes gets the settled
// `undefined` back and renders the srcdoc floor, with no request and no way out but a reload. A 503 from an
// overloaded server, an offline blip, a rate-limited burst are all that same promise.
//
// The probe remounts a reader at the SAME body, which is what a collapse/expand, a scroll-back or a
// re-opened lightbox does in the app.

import { CARD_FRAME_ROUTE } from "@orb/contracts/chat";
import { expect, test } from "@playwright/experimental-ct-react";
import { CardFrameMemoStory } from "./_ct-stories.tsx";

const MINTED_URL = `${CARD_FRAME_ROUTE}/0123456789abcdef0123456789abcdef`;

/** The route's granted-mint body — `cardFrameMintResponseSchema`'s exact shape (a parse failure here would
 *  degrade to the floor too, which would make the test pass for the wrong reason). */
const GRANTED = JSON.stringify({ url: MINTED_URL, expiresInMs: 60_000, granted: { externalMedia: true, inlineData: true, interactive: false } });

test("a FAILED mint is not remembered as an answer — the next reader of the same card re-mints", async ({ mount, page }) => {
  let posts = 0;
  await page.route(`**${CARD_FRAME_ROUTE}`, async (route) => {
    posts += 1;
    if (posts === 1) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "overloaded" }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: GRANTED });
  });

  await mount(<CardFrameMemoStory />);
  // The floor, correctly — the mint was refused and a card is never blank because the door was shut.
  await expect(page.getByTestId("frame-src")).toHaveText("floor");

  await page.getByTestId("ct-remount-frame").click();
  await expect(page.getByTestId("frame-src")).toHaveText(MINTED_URL);
  expect(posts, "the second attempt must reach the wire — a cached failure would have answered it").toBe(2);
});

test("a GRANTED mint IS remembered — the memo still exists, and a re-read costs no request", async ({ mount, page }) => {
  let posts = 0;
  await page.route(`**${CARD_FRAME_ROUTE}`, async (route) => {
    posts += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: GRANTED });
  });

  await mount(<CardFrameMemoStory />);
  await expect(page.getByTestId("frame-src")).toHaveText(MINTED_URL);

  await page.getByTestId("ct-remount-frame").click();
  await expect(page.getByTestId("frame-src")).toHaveText(MINTED_URL);
  // The positive control for the test above: eviction is the FAILURE path only, never a memo that forgot
  // how to memoize (which would mint a fresh document per paint).
  expect(posts).toBe(1);
});
