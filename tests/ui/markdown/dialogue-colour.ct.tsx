// A dialogue line coloured the way SillyTavern presets ask the model to write it, a `<font color>` or a span whose style
// is one colour, keeps that colour on a span under both trust policies. Any other declaration, and a colour value
// outside the one grammar the sanitizer admits, leaves the line in its paragraph's ink with no style at all.
// @subject packages/ui/src/markdown/policy.ts
// @subject packages/ui/src/markdown/colour-font-component.tsx

import { expect, test } from "@orb/testkit/ct-corpus";
import type { DialogueColourStory } from "./_dialogue-colour-stories.tsx";
import { ACCEPTED_COLOUR_LINES, REFUSED_COLOUR_LINES } from "./dialogue-colour.cases.ts";

const STORY = "tests/ui/markdown/_dialogue-colour-stories/DialogueColourStory";
const TRUSTS = ["trusted", "untrusted"] as const;
const SOURCE = [...ACCEPTED_COLOUR_LINES, ...REFUSED_COLOUR_LINES].map((line) => `She said ${line.markup(line.words)} and waited.`).join("\n\n");

for (const trust of TRUSTS) {
  test(`a dialogue colour renders on a span under the ${trust} policy, and every other style is dropped`, async ({ mount, page }) => {
    const component = await mount<typeof DialogueColourStory>(STORY, { trust, mode: "static", children: SOURCE });
    const ink = await component
      .locator("p")
      .first()
      .evaluate((element) => getComputedStyle(element).color);

    for (const line of ACCEPTED_COLOUR_LINES) {
      // The colour the browser computes for the authored value on its own, so the line is held to what its author wrote.
      const authored = await page.evaluate((colour) => {
        const probe = document.createElement("span");
        probe.style.color = colour;
        document.body.append(probe);
        const computed = getComputedStyle(probe).color;
        probe.remove();
        return computed;
      }, line.colour);
      expect(authored).not.toBe(ink);
      const run = component.getByText(line.words, { exact: true });
      await expect(run).toHaveJSProperty("tagName", "SPAN");
      await expect(run).toHaveCSS("color", authored);
    }
    // The colour carriers never reach the document as a `font` tag.
    await expect(component.locator("font")).toHaveCount(0);
    for (const line of REFUSED_COLOUR_LINES) {
      const run = component.getByText(line.words, { exact: true });
      await expect(run).toBeVisible();
      await expect(run).not.toHaveAttribute("style");
      await expect(run).toHaveCSS("color", ink);
    }
  });
}
