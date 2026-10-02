import type { VisualArchetype } from "@orb/contracts/discovery";
import type { EmbedGenerationId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { corpusGroupingProvenance } from "../../../../support/node/corpus-source.ts";
import { FamilyMapFixture } from "./corpus-family-map.fixtures.tsx";

const MEMBERS = ["Birdie Mae Holloway", "Calamity of the Northern Frontier", "Hana of the Distant Mountain"];
const LABEL = "Unanalysed portraits";
const FAMILIES = MEMBERS.map((name) => ({
  ...corpusGroupingProvenance(LABEL),
  generationId: castId<EmbedGenerationId>("a".repeat(64)),
  label: LABEL,
  genre: null,
  tone: null,
  artStyle: null,
  palette: null,
  mood: null,
  size: 3,
  model: "ct-portraits",
  members: [
    { characterId: mintTypeId(ID_PREFIX.character), name, avatarHash: null },
    { characterId: mintTypeId(ID_PREFIX.character), name: "Elara", avatarHash: null },
    { characterId: mintTypeId(ID_PREFIX.character), name: "Bram", avatarHash: null },
  ],
})) satisfies VisualArchetype[];

for (const width of [300, 600, 960]) {
  test(`family name containment @${width}: full identity, bounded paint and reveal`, async ({ mount, page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const component = await mount(<FamilyMapFixture families={FAMILIES} width={width} />);
    const grid = component.getByRole("list", { name: "Visual families" });
    await expect(grid.getByRole("listitem")).toHaveCount(FAMILIES.length);
    await testInfo.attach("family-map", { body: await component.screenshot(), contentType: "image/png" });
    for (const member of MEMBERS) {
      const name = `${LABEL} · ${member}`;
      const button = grid.getByRole("button", { name, exact: true });
      await expect(button).toBeVisible();
      await expect
        .poll(async () => {
          const geometry = await button.evaluate((element) => {
            const plate = element.closest('[role="listitem"]');
            if (plate === null) {
              throw new Error("Family has no plate");
            }
            const box = element.getBoundingClientRect();
            const parent = plate.getBoundingClientRect();
            const text = element.querySelector("span");
            return {
              left: box.left - parent.left,
              right: parent.right - box.right,
              paintRight: (() => {
                const range = document.createRange();
                range.selectNodeContents(element);
                const right = range.getBoundingClientRect().right;
                return (
                  (text !== null && getComputedStyle(text).overflow === "hidden" ? Math.min(right, text.getBoundingClientRect().right) : right) - parent.right
                );
              })(),
            };
          });
          return { left: geometry.left >= 0, right: geometry.right >= 0, paint: geometry.paintRight <= 0 };
        })
        .toEqual({ left: true, right: true, paint: true });
      await button.focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      await expect(button).toBeFocused();
      const popup = page.locator('[data-slot="tooltip-popup"][data-open]');
      await expect(popup).toHaveText(name);
      await expect(popup).toBeVisible();
      await button.press("Enter");
      await expect(component.getByRole("status", { name: "Selected family" })).toHaveText(name);
    }
    await expect(grid.getByText(/3 members · .* · Elara \+1 more/u)).toHaveCount(FAMILIES.length);
  });
}
