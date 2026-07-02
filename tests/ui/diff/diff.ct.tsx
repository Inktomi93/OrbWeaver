import { DiffView } from "@orb/ui/diff";
import { expect, test } from "@playwright/experimental-ct-react";

// The resolved intent tokens (Hearth): added = success pair, removed = destructive pair.
const SUCCESS_BG_OKLCH = /oklch\(0\.72 0\.13 150\)/u;
const SUCCESS_FG_OKLCH = /oklch\(0\.14 0\.02 150\)/u;
const DESTRUCTIVE_BG_OKLCH = /oklch\(0\.62 0\.19 25\)/u;
const DESTRUCTIVE_FG_OKLCH = /oklch\(0\.97 0\.01 25\)/u;

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
  await expect(added).toHaveCSS("background-color", SUCCESS_BG_OKLCH);
  await expect(added).toHaveCSS("color", SUCCESS_FG_OKLCH);
  await expect(removed).toHaveCSS("background-color", DESTRUCTIVE_BG_OKLCH);
  await expect(removed).toHaveCSS("color", DESTRUCTIVE_FG_OKLCH);
  await expect(removed).toHaveCSS("text-decoration-line", "line-through");
  // Unchanged text renders plain.
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
