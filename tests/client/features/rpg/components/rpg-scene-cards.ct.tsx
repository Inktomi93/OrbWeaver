// CT: the archived-card LIGHTBOX (`RpgCardLightbox`) — the card-viewer the Scene "Cards" archive and the
// Journal chronicle both open. The archive is a SECOND LENS on transcript content, so the sandbox it renders
// must carry the ORIGIN ROW's render policy: a card whose author is not media-trusted paints no external
// image here either. Asserted on the rendered srcdoc CSP (the sandbox IS the boundary — sandbox-frame.ct.tsx
// pins the directive grammar; this pins that the archive threads the verdict at all, rather than defaulting).

import { expect, test } from "@playwright/experimental-ct-react";
import { RpgCardLightboxStory } from "../_ct-stories";

const FRAME = '[data-slot="sandbox-frame"]';

test("a blocked-media row's archived card renders with external media blocked in the lightbox", async ({ mount, page }) => {
  await mount(<RpgCardLightboxStory allowExternalMedia={false} />);

  await expect(page.getByRole("heading", { name: "A sealed letter" })).toBeVisible();
  const srcdoc = (await page.locator(FRAME).first().getAttribute("srcdoc")) ?? "";
  expect(srcdoc).toContain("img-src 'self'; media-src 'self';");
  expect(srcdoc).not.toContain("'self' https:");
  // The card body still reaches the sandbox verbatim — the CSP blocks the fetch, nothing is stripped.
  expect(srcdoc).toContain("https://evil.test/tracker.png");
});

test("a media-trusted row's archived card keeps its external media in the lightbox", async ({ mount, page }) => {
  await mount(<RpgCardLightboxStory allowExternalMedia={true} />);

  const srcdoc = (await page.locator(FRAME).first().getAttribute("srcdoc")) ?? "";
  expect(srcdoc).toContain("img-src 'self' https:");
  expect(srcdoc).toContain("media-src 'self' https:");
});
