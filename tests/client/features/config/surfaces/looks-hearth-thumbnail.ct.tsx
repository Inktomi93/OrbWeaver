// Hearth is the base palette and owns no [data-theme] block, so its Looks thumbnail names the base palette block itself:
// under a Light ambient page it still paints Hearth's own surface, never the page's.
import { routeTrpc } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusReadResponder } from "@orb/testkit/iso";
import { TOKENS } from "@orb/ui/tokens";
import type { LooksUnderLightStory } from "./_looks-under-light-stories.tsx";

test("the Hearth thumbnail paints the base surface on a Light page", async ({ corpus, mount, page }) => {
  await routeTrpc(page, {
    "sessions.me": createCorpusReadResponder("sessions.me", corpus.reads["sessions.me"]),
    "settings.getUserSettings": createCorpusReadResponder("settings.getUserSettings", corpus.reads["settings.getUserSettings"]),
    "settings.listThemes": createCorpusReadResponder("settings.listThemes", corpus.reads["settings.listThemes"]),
  });
  await mount<typeof LooksUnderLightStory>("tests/client/features/config/surfaces/_looks-under-light-stories/LooksUnderLightStory", {});
  const hearthRoom = page.getByRole("radio", { name: /Hearth/u }).locator('[data-slot="theme-mini-room"]');
  await expect(hearthRoom).toBeVisible();
  const painted = await hearthRoom.evaluate((element, base) => {
    const probe = document.createElement("div");
    probe.style.backgroundColor = base;
    document.body.append(probe);
    const expected = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return { expected, actual: getComputedStyle(element).backgroundColor };
  }, TOKENS["color.background"].value);
  expect(painted.actual).toBe(painted.expected);
});
