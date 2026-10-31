// D336 step 3: every control at one step of the scale is one height, the step's token, at both pointer classes.
import type { ControlSize } from "@orb/ui/lib";
import { CONTROL_SIZES } from "@orb/ui/lib";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { ControlScaleStory, PlantedStepStory } from "./_control-scale-stories.tsx";

const STORY = "tests/ui/primitives/_control-scale-stories/ControlScaleStory";
const PLANTED = "tests/ui/primitives/_control-scale-stories/PlantedStepStory";

// The token each step's height resolves to (D336: `chip` keeps the touch target, never a control step).
const STEP_TOKEN = {
  chip: "size.touch-target",
  sm: "size.control-sm",
  md: "size.control-md",
  lg: "size.control-lg",
} as const satisfies Record<ControlSize, keyof typeof TOKENS>;

// The visible box of each control: the root of a pressable, the bordered box of a field.
const CONTROL_BOXES = [
  '[data-slot="button"]',
  '[data-slot="toggle"]',
  '[data-slot="input-root"]',
  '[data-slot="select-trigger"]',
  '[data-slot="number-field-group"]',
  '[data-slot="combobox-input-group"]',
  '[data-slot="autocomplete-input-group"]',
  '[data-slot="color-field-trigger"]',
].join(", ");

interface RowReading {
  /** Each control's rendered height, labelled by its slot. */
  readonly heights: readonly string[];
  /** The distinct heights in the row. */
  readonly distinct: readonly number[];
  /** The step token's own resolved length, read from a probe in the same document. */
  readonly token: number;
}

/** One row's control heights and its token, in one browser round trip. */
function readRow(row: Locator, cssVar: string): Promise<RowReading> {
  return row.evaluate(
    (element, { selector, variable }) => {
      const boxes = [...element.querySelectorAll(selector)].map((node) => ({
        slot: node.getAttribute("data-slot") ?? "?",
        height: Math.round(node.getBoundingClientRect().height * 100) / 100,
      }));
      const probe = document.createElement("div");
      probe.style.blockSize = `var(${variable})`;
      element.append(probe);
      const token = probe.getBoundingClientRect().height;
      probe.remove();
      return {
        heights: boxes.map(({ slot, height }) => `${slot} ${String(height)}`),
        distinct: [...new Set(boxes.map(({ height }) => height))],
        token,
      };
    },
    { selector: CONTROL_BOXES, variable: cssVar },
  );
}

for (const coarse of [false, true]) {
  test.describe(coarse ? "coarse pointer" : "fine pointer", () => {
    test.use({ hasTouch: coarse, isMobile: coarse, viewport: { width: 1600, height: 1000 } });

    test("each step's row of mixed controls is one height, the step's token", async ({ mount, page }) => {
      const component = await mount<typeof ControlScaleStory>(STORY, {});
      expect(await page.evaluate((query) => matchMedia(query).matches, coarse ? "(pointer: coarse)" : "(pointer: fine)")).toBe(true);
      for (const step of CONTROL_SIZES) {
        const row = component.locator(`[data-step="${step}"]`);
        await expect(row).toBeVisible();
        const { heights, distinct, token } = await readRow(row, TOKENS[STEP_TOKEN[step]].cssVar);
        expect(heights.length, `${step}: every control rendered`).toBe(10);
        expect.soft(distinct, `${step}: ${heights.join(", ")}`).toEqual([token]);
      }
    });
  });
}

test("a square Button stamps its box beside its step, apart from a text Button of that step", async ({ mount }) => {
  const component = await mount<typeof ControlScaleStory>(STORY, {});
  for (const step of CONTROL_SIZES) {
    const row = component.locator(`[data-step="${step}"]`);
    const square = row.getByRole("button", { name: `Add ${step}`, exact: true });
    const text = row.getByRole("button", { name: "Save", exact: true });
    await expect(square).toHaveAttribute("data-size", step);
    await expect(text).toHaveAttribute("data-size", step);
    await expect(square).toHaveAttribute("data-square", "true");
    await expect(text).toHaveAttribute("data-square", "false");
  }
});

test("a control planted at a foreign step reads as a second height", async ({ mount }) => {
  const component = await mount<typeof PlantedStepStory>(PLANTED, { odd: "md" });
  const { distinct, token } = await readRow(component.locator('[data-step="sm"]'), TOKENS[STEP_TOKEN.sm].cssVar);
  expect(distinct).toHaveLength(2);
  expect(distinct).toContain(token);
});
