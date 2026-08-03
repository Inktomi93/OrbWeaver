// CT: the #67 ASSET arm of `MessageMediaBlock`. A resolved `asset:<id>` (the row's `AttachmentUrlProvider`
// supplied a `blobUrl`) renders the real gated `<MessageMedia>` image at that url; an UNRESOLVED asset
// (provider-less mount / still loading — an empty context map) degrades to the `[image]` placeholder rather
// than a broken `<img>`. Proves the render arm the #67 seam swapped in (done ≠ rendered — the pixels, not
// just the source).

import { expect, test } from "@playwright/experimental-ct-react";
import { AttachmentMediaStory } from "../_ct-stories.tsx";

const MEDIA_IMG = '[data-slot="message-media"]';
const PNG_DATA_SRC = /^data:image\/png/u;

test("a resolved asset ref renders the real image at its blob url (no placeholder)", async ({ mount }) => {
  // The story provides its own resolved (data-URL) blob src for the asset via the context.
  const component = await mount(<AttachmentMediaStory />);
  const img = component.locator(MEDIA_IMG);
  await expect(img).toHaveCount(1);
  await expect(img).toHaveAttribute("src", PNG_DATA_SRC);
  await expect(img).toHaveAttribute("alt", "an attached image");
  await expect(component.getByText("[image]")).toHaveCount(0);
});

test("an unresolved asset ref degrades to the [image] placeholder, never a broken img", async ({ mount }) => {
  // Empty context map (the provider-less / still-loading state).
  const component = await mount(<AttachmentMediaStory empty={true} />);
  await expect(component.getByText("[image]")).toBeVisible();
  await expect(component.locator(MEDIA_IMG)).toHaveCount(0);
});
