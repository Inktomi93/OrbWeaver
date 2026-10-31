// An avatar over a room's art draws its ring at the hairline width: the class merger keeps the width token beside the
// edge colour, so the ring is not left at zero width. Outside art the avatar draws no border.
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { AvatarOverArtStory } from "./_avatar-over-art-stories.tsx";

const STORY = "tests/ui/primitives/avatar/_avatar-over-art-stories/AvatarOverArtStory";

// A bordered probe resolves the token the way the browser lays a border out, which snaps a fractional width to device pixels.
function borderWidth(locator: Locator): Promise<string> {
  return locator.evaluate((element) => getComputedStyle(element).getPropertyValue("border-top-width"));
}

test("an avatar inside a has-bg-image host draws its ring at the hairline width, and a plain-room avatar draws none", async ({ mount }) => {
  const component = await mount<typeof AvatarOverArtStory>(STORY, {});
  const hairline = await borderWidth(component.locator('[data-probe="hairline"]'));
  expect(hairline).not.toBe("0px");
  const roots = component.locator('[data-slot="avatar-root"]');
  expect(await borderWidth(roots.nth(0))).toBe(hairline);
  expect(await borderWidth(roots.nth(1))).toBe("0px");
});
