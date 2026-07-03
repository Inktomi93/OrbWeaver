import { DiffView } from "@orb/ui/diff";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";

const BEFORE_LINES = "alpha\nbeta\ngamma\n";
const AFTER_LINES = "alpha\ndelta\ngamma\n";

test("words mode renders added/removed segments with intent token colors", async ({ mount }) => {
  const component = await mount(
    <DiffView before="the quick red fox" after="the quick brown fox" mode="words" />,
  );
  const added = component.locator("[data-diff=added]");
  const removed = component.locator("[data-diff=removed]");
  await expect(added).toContainText("brown");
  await expect(removed).toContainText("red");
  await expect(added).toHaveCSS("background-color", TOKENS["color.success"].value);
  await expect(added).toHaveCSS("color", TOKENS["color.success-foreground"].value);
  await expect(removed).toHaveCSS("background-color", TOKENS["color.destructive"].value);
  await expect(removed).toHaveCSS("color", TOKENS["color.destructive-foreground"].value);
  await expect(removed).toHaveCSS("text-decoration-line", "line-through");
  await expect(component.locator("[data-diff=unchanged]").first()).toContainText("the quick");
});

test("chars mode (the default) diffs at character granularity", async ({ mount }) => {
  const component = await mount(<DiffView before="cat" after="cart" />);
  await expect(component.locator("[data-diff=added]")).toHaveText("r");
  await expect(component.locator("[data-diff=removed]")).toHaveCount(0);
});

test("lines mode diffs whole lines", async ({ mount }) => {
  const component = await mount(
    <DiffView before={BEFORE_LINES} after={AFTER_LINES} mode="lines" />,
  );
  await expect(component.locator("[data-diff=removed]")).toHaveText("beta\n");
  await expect(component.locator("[data-diff=added]")).toHaveText("delta\n");
});
