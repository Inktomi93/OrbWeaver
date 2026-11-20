// A screen reader announces the viewer by what it shows, and by its own name when the picture has no alt text.
import { expect, test } from "@playwright/test";
import type { LightboxMedia } from "../../../../packages/ui/src/content/lightbox/control-labels.ts";
import { LIGHTBOX_LABELS } from "../../../../packages/ui/src/content/lightbox/control-labels.ts";
import type { LightboxNameStory } from "./_lightbox-stories.tsx";

const STORY = "tests/ui/content/lightbox/_lightbox-stories/LightboxNameStory";

interface NameCase {
  readonly title: string;
  readonly media: LightboxMedia;
  readonly alt: string;
  readonly name: string;
}

const CASES: readonly NameCase[] = [
  { title: "an image viewer is named by its alt text", media: "image", alt: "A harbour at dusk", name: "A harbour at dusk" },
  { title: "a video viewer is named by its alt text", media: "video", alt: "A kettle coming to the boil", name: "A kettle coming to the boil" },
  { title: "an image viewer with blank alt text is named by the viewer", media: "image", alt: "  ", name: LIGHTBOX_LABELS.viewer.image },
  { title: "a video viewer with no alt text is named by the viewer", media: "video", alt: "", name: LIGHTBOX_LABELS.viewer.video },
];

for (const { title, media, alt, name } of CASES) {
  test(title, async ({ mount, page }) => {
    await mount<typeof LightboxNameStory>(STORY, { media, alt });
    await expect(page.getByRole("dialog", { name, exact: true })).toBeVisible();
  });
}
