// @subject packages/client/src/features/persona/components/persona-learn.tsx
import { expect, test } from "@orb/testkit/ct-corpus";
import type { PersonaMarksLearnStory } from "./_persona-learn-stories.tsx";

const STORY = "tests/client/features/persona/components/_persona-learn-stories/PersonaMarksLearnStory";
// The switcher's rows draw these four marks as icons: playing, pin, crown, connected.
const SWITCHER_MARKS = ["lucide-check", "lucide-pin", "lucide-crown", "lucide-link-2"] as const;
const EMOJI_MARKS = /[✓📌👑🔗]/u;

test("the Learn body teaches the four marks as the switcher's own icons, not emoji", async ({ mount, page }) => {
  await mount<typeof PersonaMarksLearnStory>(STORY, {});
  const body = page.getByText("The four marks", { exact: true }).locator("..");

  for (const mark of SWITCHER_MARKS) {
    await expect(body.locator(`svg.${mark}`).first()).toBeVisible();
  }
  expect(await body.textContent()).not.toMatch(EMOJI_MARKS);
});
