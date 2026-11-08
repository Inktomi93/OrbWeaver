// Combobox turns typed text into chips: Enter and comma commit, a pasted list splits, duplicates and the cap are refused,
// and each chip keeps one inset from the field edge on both axes at every control step.
import { hitExtent, touchFloorPx } from "@orb/testkit/browser/spec";
import type { ControlSize } from "@orb/ui/lib";
import { CONTROL_SIZES } from "@orb/ui/lib";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { ChipInsetStory, ChipRemoveTargetsStory, FreeTextChipsStory, RerenderingParentStory } from "./combobox-chips-stories.tsx";

const STORIES = "tests/ui/primitives/combobox/combobox-chips-stories";

const input = (page: Page): Locator => page.locator('[data-slot="combobox-input"]');
const chips = (page: Page): Locator => page.locator('[data-slot="combobox-chip"]');
const committed = (page: Page): Locator => page.getByRole("status", { name: "Committed chips" });

test("Enter commits typed text, a pasted list splits on commas, and duplicates are dropped", async ({ mount, page }) => {
  await mount<typeof FreeTextChipsStory>(`${STORIES}/FreeTextChipsStory`, {});
  await input(page).fill("red, green ,red,  ");
  await input(page).press("Enter");
  await expect(committed(page)).toHaveText("red|green");
  await expect(chips(page)).toHaveCount(2);
  await expect(input(page)).toHaveValue("");

  await input(page).fill("red");
  await input(page).press("Enter");
  await expect(committed(page)).toHaveText("red|green");
  await expect(page.getByRole("status", { name: "Change count" })).toHaveText("1");
});

test("typing a comma commits the text before it", async ({ mount, page }) => {
  await mount<typeof FreeTextChipsStory>(`${STORIES}/FreeTextChipsStory`, {});
  await input(page).pressSequentially("amber,");
  await expect(committed(page)).toHaveText("amber");
  await expect(input(page)).toHaveValue("");
});

test("the cap refuses further chips but a chip can still be removed to make room", async ({ mount, page }) => {
  await mount<typeof FreeTextChipsStory>(`${STORIES}/FreeTextChipsStory`, { maxItems: 2 });
  await input(page).fill("a,b,c");
  await input(page).press("Enter");
  await expect(committed(page)).toHaveText("a|b");

  await input(page).fill("d");
  await input(page).press("Enter");
  await expect(committed(page)).toHaveText("a|b");

  await chips(page).first().locator('[data-slot="combobox-chip-remove"]').click();
  await expect(committed(page)).toHaveText("b");
  await input(page).fill("d");
  await input(page).press("Enter");
  await expect(committed(page)).toHaveText("b|d");
});

test("a parent that re-renders with fresh arrays keeps its chips and keeps accepting entries", async ({ mount, page }) => {
  await mount<typeof RerenderingParentStory>(`${STORIES}/RerenderingParentStory`);
  await expect(chips(page)).toHaveCount(1);
  await page.getByRole("button", { name: "Rerender parent" }).click();
  await page.getByRole("button", { name: "Rerender parent" }).click();
  await expect(page.getByRole("status", { name: "Parent renders" })).toHaveText("2");
  await expect(chips(page)).toHaveCount(1);
  await expect(committed(page)).toHaveText("ember");
  await input(page).fill("cinder");
  await input(page).press("Enter");
  await expect(committed(page)).toHaveText("ember|cinder");
  await expect(chips(page)).toHaveCount(2);
});

// The token each step's field height resolves to (D336: `chip` keeps the touch target).
const STEP_TOKEN = {
  chip: "size.touch-target",
  sm: "size.control-sm",
  md: "size.control-md",
  lg: "size.control-lg",
} as const satisfies Record<ControlSize, keyof typeof TOKENS>;

interface ChipInset {
  readonly block: number;
  readonly inline: number;
  readonly field: number;
  readonly token: number;
}

/** The first chip's gap to the field's inner edge on each axis, the field's height and the step token's length. */
function chipInset(row: Locator, cssVar: string): Promise<ChipInset> {
  return row.evaluate((element, variable) => {
    const group = element.querySelector('[data-slot="combobox-input-group"]');
    const chip = element.querySelector('[data-slot="combobox-chip"]');
    if (group === null || chip === null) {
      throw new Error("the field or its chip did not render");
    }
    const box = group.getBoundingClientRect();
    const style = getComputedStyle(group);
    const inner = chip.getBoundingClientRect();
    const probe = document.createElement("div");
    probe.style.blockSize = `var(${variable})`;
    element.append(probe);
    const token = probe.getBoundingClientRect().height;
    probe.remove();
    return {
      block: inner.top - box.top - Number.parseFloat(style.borderTopWidth),
      inline: inner.left - box.left - Number.parseFloat(style.borderLeftWidth),
      field: box.height,
      token,
    };
  }, cssVar);
}

for (const coarse of [false, true]) {
  test.describe(coarse ? "coarse pointer" : "fine pointer", () => {
    test.use({ hasTouch: coarse, isMobile: coarse });

    test("a chip sits as far from the field's top edge as from its start edge, and the field stays one step high", async ({ mount }) => {
      const component = await mount<typeof ChipInsetStory>(`${STORIES}/ChipInsetStory`, {});
      for (const step of CONTROL_SIZES) {
        const { block, inline, field, token } = await chipInset(component.locator(`[data-step="${step}"]`), TOKENS[STEP_TOKEN[step]].cssVar);
        expect.soft(Math.abs(block - inline), `${step}: block inset ${block}, inline inset ${inline}`).toBeLessThanOrEqual(1);
        expect.soft(field, `${step}: the field with chips`).toBe(token);
      }
    });

    test("each chip's remove target reaches the touch floor without covering the next chip, the line below or the draft input", async ({ mount, page }) => {
      await mount<typeof ChipRemoveTargetsStory>(`${STORIES}/ChipRemoveTargetsStory`);
      const floor = await touchFloorPx(page);
      const removes = page.locator('[data-slot="combobox-chip-remove"]');
      await expect(removes).toHaveCount(6);
      for (const remove of await removes.all()) {
        expect(await hitExtent(remove, "x")).toBeGreaterThanOrEqual(floor);
        expect(await hitExtent(remove, "y")).toBeGreaterThanOrEqual(floor);
      }
      // A tap one pixel inside another chip, or inside the draft input, must land on that control: the control's own edge is where a
      // neighbour's hit area would take it.
      const stolen = await page.evaluate(() => {
        const owners = '[data-slot="combobox-chip"], [data-slot="combobox-input"]';
        return [...document.querySelectorAll(owners)].flatMap((box) => {
          const rect = box.getBoundingClientRect();
          const taps = [
            [rect.left + 1, rect.top + rect.height / 2],
            [rect.right - 1, rect.top + rect.height / 2],
            [rect.left + rect.width / 2, rect.top + 1],
            [rect.left + rect.width / 2, rect.bottom - 1],
          ] as const;
          return taps.flatMap(([x, y]) => {
            const hit = document.elementFromPoint(x, y);
            return hit?.closest(owners) === box
              ? []
              : [`${box.textContent || "input"} at ${String(Math.round(x))},${String(Math.round(y))}: ${hit?.getAttribute("data-slot")}`];
          });
        });
      });
      expect(stolen).toEqual([]);
    });
  });
}
