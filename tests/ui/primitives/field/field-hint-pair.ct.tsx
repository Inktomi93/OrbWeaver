// @subject packages/ui/src/primitives/field/field.tsx
// A hint costs a field no vertical space: side by side at a fine pointer, a hinted and a plain field set their labels on one
// baseline and their controls on one top.
import { LAYOUT_SUBPIXEL_PX as SUBPIXEL } from "@orb/testkit/browser/spec";
import { expect, test } from "@playwright/test";
import { hintTriggerName } from "#ui/primitives/hint-trigger/hint-trigger-names.ts";
import type { HintPairStory } from "./_hint-pair-stories.tsx";

const STORY = "tests/ui/primitives/field/_hint-pair-stories/HintPairStory";
const PROPS = { hinted: "Word bias", plain: "Seed" } as const;

test.use({ viewport: { width: 1280, height: 900 } });

test("a hinted and a plain field share a label baseline and a control top", async ({ mount }) => {
  const component = await mount<typeof HintPairStory>(STORY, PROPS);
  // Positive control: one of the pair carries the hint, so the row is a hinted/plain pair.
  await expect(component.getByRole("button", { name: hintTriggerName(PROPS.hinted), exact: true })).toBeVisible();
  const hintedLabel = await component.getByText(PROPS.hinted, { exact: true }).boundingBox();
  const plainLabel = await component.getByText(PROPS.plain, { exact: true }).boundingBox();
  const hintedControl = await component.getByRole("textbox", { name: PROPS.hinted, exact: true }).boundingBox();
  const plainControl = await component.getByRole("textbox", { name: PROPS.plain, exact: true }).boundingBox();
  if (hintedLabel === null || plainLabel === null || hintedControl === null || plainControl === null) {
    throw new Error("both fields render a label and a control");
  }
  // The pair sits on one row, or the comparison judges nothing.
  expect(Math.abs(hintedControl.x - plainControl.x)).toBeGreaterThan(hintedControl.width / 2);
  expect(Math.abs(hintedLabel.y + hintedLabel.height - (plainLabel.y + plainLabel.height))).toBeLessThanOrEqual(SUBPIXEL);
  expect(Math.abs(hintedControl.y - plainControl.y)).toBeLessThanOrEqual(SUBPIXEL);
});
