// CT: the archived-card LIGHTBOX (`RpgCardLightbox`) — the card-viewer the Scene "Cards" archive and the
// Journal chronicle both open. The archive is a SECOND LENS on transcript content, so the sandbox it renders
// must carry the ORIGIN ROW's render policy: a card whose author is not media-trusted paints no external
// image here either. Asserted on the rendered srcdoc CSP (the sandbox IS the boundary — sandbox-frame.ct.tsx
// pins the directive grammar; this pins that the archive threads the verdict at all, rather than defaulting).

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError } from "../../../../support/node/route-trpc.ts";
import { RpgCardLightboxStory, RpgSceneCardsStory } from "../_ct-stories.tsx";

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

// THE ARCHIVE IS A PROJECTION OVER TWO READS, SO EITHER FAILING MAKES IT UNKNOWN — NOT EMPTY (#1500).
// `messagesQuery.data?.messages ?? []` fed `collectArchivedCards` an empty transcript for BOTH an unresolved
// read and a failed one, so the section stated that this game has crafted no cards before it had read a
// single message, and went on stating it after the read failed with no way back.
test("a FAILED transcript read never says 'No cards yet', and its Retry re-reads (#1500)", async ({ mount, page }) => {
  let attempts = 0;
  const trpc = await routeTrpc(page, {
    "chat.listMessages": () => (attempts++ === 0 ? trpcError({ message: "transcript read failed" }) : { messages: [] }),
    "chat.getChat": () => ({ id: "chat_ct_rpg000000000000001" }),
  });
  const section = await mount(<RpgSceneCardsStory />);

  await expect(section.getByText("Couldn't load the card archive.")).toBeVisible();
  await expect(section.getByText("No cards yet", { exact: false })).toHaveCount(0);

  await section.getByRole("button", { name: "Retry" }).click();
  await expect.poll(() => trpc.count("chat.listMessages"), { intervals: [20, 50, 100] }).toBe(2);
  // A transcript that really has no cards is a DIFFERENT answer, and the section is entitled to state it.
  await expect(section.getByText("No cards yet", { exact: false })).toBeVisible();
});
