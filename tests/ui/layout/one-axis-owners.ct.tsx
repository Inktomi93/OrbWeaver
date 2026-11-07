import { resolvedLength } from "@orb/testkit/browser/spec";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { OneAxisOwnersStory } from "./_one-axis-owners-stories.tsx";

const STORY = "tests/ui/layout/_one-axis-owners-stories/OneAxisOwnersStory";
const BOX_PX = 120;

interface Padding {
  readonly inline: readonly [string, string];
  readonly block: readonly [string, string];
}

function paddingOf(locator: Locator): Promise<Padding> {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return { inline: [style.paddingLeft, style.paddingRight] as const, block: [style.paddingTop, style.paddingBottom] as const };
  });
}

test.describe("paddingInline and paddingBlock", () => {
  test("paddingInline pads only the inline axis, at the ramp step", async ({ mount }) => {
    const component = await mount<typeof OneAxisOwnersStory>(STORY);
    const reference = await paddingOf(component.locator('[data-probe="ref-block"]'));
    const stack = await paddingOf(component.locator('[data-probe="stack-inline"]'));
    expect(stack.inline).toEqual(reference.inline);
    expect(stack.block).toEqual(["0px", "0px"]);
    const row = await paddingOf(component.locator('[data-probe="row-inline"]'));
    expect(row.inline).toEqual((await paddingOf(component.locator('[data-probe="ref-field"]'))).inline);
    expect(row.block).toEqual(["0px", "0px"]);
  });

  test("paddingBlock pads only the block axis, at the ramp step", async ({ mount }) => {
    const component = await mount<typeof OneAxisOwnersStory>(STORY);
    const stack = await paddingOf(component.locator('[data-probe="stack-block"]'));
    expect(stack.block).toEqual((await paddingOf(component.locator('[data-probe="ref-section"]'))).block);
    expect(stack.inline).toEqual(["0px", "0px"]);
    const row = await paddingOf(component.locator('[data-probe="row-block"]'));
    expect(row.block).toEqual((await paddingOf(component.locator('[data-probe="ref-row"]'))).block);
    expect(row.inline).toEqual(["0px", "0px"]);
  });

  test("an axis prop overrides the all-sides step on its own axis only", async ({ mount }) => {
    const component = await mount<typeof OneAxisOwnersStory>(STORY);
    const padding = await paddingOf(component.locator('[data-probe="stack-override"]'));
    const field = await paddingOf(component.locator('[data-probe="ref-field"]'));
    expect(padding.inline).toEqual(field.inline);
    expect(padding.block).not.toEqual(padding.inline);
  });
});

test.describe("cap", () => {
  test("a named cap resolves to its token, and fit to the parent's own width", async ({ mount }) => {
    const component = await mount<typeof OneAxisOwnersStory>(STORY);
    const reference = await component.locator('[data-probe="ref-column"]').evaluate((element) => getComputedStyle(element).maxWidth);
    await expect(component.locator('[data-probe="stack-cap-column"]')).toHaveCSS("max-width", reference);
    await expect(component.locator('[data-probe="row-cap-fit"]')).toHaveCSS("max-width", "100%");
  });
});

test.describe("recipe axes the client used to hand-write", () => {
  test("a card that delegates its inset holds none inside a surface tier, which outranks a padding utility", async ({ mount }) => {
    const component = await mount<typeof OneAxisOwnersStory>(STORY);
    const card = await paddingOf(component.locator('[data-probe="card-padding-none"]'));
    expect(card).toEqual({ inline: ["0px", "0px"], block: ["0px", "0px"] });
  });

  test("a swatch size is its token", async ({ mount }) => {
    const component = await mount<typeof OneAxisOwnersStory>(STORY);
    const swatch = component.locator('[data-probe="swatch-dot"]');
    const reference = await component.locator('[data-probe="ref-dot"]').boundingBox();
    const box = await swatch.boundingBox();
    expect(box?.width).toBe(reference?.width);
    expect(box?.height).toBe(reference?.height);
  });

  test("a grown row takes the room its sibling leaves", async ({ mount }) => {
    const component = await mount<typeof OneAxisOwnersStory>(STORY);
    const row = await component.locator('[data-probe="row-grow"]').boundingBox();
    expect(row?.width).toBeCloseTo(BOX_PX, 0);
  });

  test("wrap anywhere keeps an unbroken run inside its box, and preWrap sets the white-space mode", async ({ mount }) => {
    const component = await mount<typeof OneAxisOwnersStory>(STORY);
    const run = component.locator('[data-probe="text-anywhere"]');
    await expect(run).toHaveCSS("overflow-wrap", "anywhere");
    await expect(run).toHaveCSS("white-space", "normal");
    const wraps = await run.evaluate((element) => element.getBoundingClientRect().height > 2 * Number.parseFloat(getComputedStyle(element).lineHeight));
    expect(wraps).toBe(true);
    await expect(component.locator('[data-probe="text-prewrap"]')).toHaveCSS("white-space", "pre-wrap");
  });
});

test.describe("corner", () => {
  test("every mark sits one field step in from its host's block-start, inline-end corner, and a tight one a tight step in", async ({ mount, page }) => {
    const component = await mount<typeof OneAxisOwnersStory>(STORY);
    const host = await component.locator('[data-probe="corner-host"]').boundingBox();
    const field = await resolvedLength(page, `var(${TOKENS["spacing.field"].cssVar})`, component);
    const tight = await resolvedLength(page, `var(${TOKENS["spacing.tight"].cssVar})`, component);
    const insets = { "corner-badge": field, "corner-text": field, "corner-dot": field, "corner-button": field, "corner-icon": field, "corner-tight": tight };
    expect(host).not.toBeNull();
    for (const [probe, inset] of Object.entries(insets)) {
      // The mark inside the wrapper, so a mark that drifts inside its Corner is seen.
      const box = await component.locator(`[data-probe="${probe}"] > *`).boundingBox();
      expect(box, probe).not.toBeNull();
      expect((box?.y ?? Number.NaN) - (host?.y ?? 0), probe).toBeCloseTo(inset, 1);
      expect((host?.x ?? 0) + (host?.width ?? 0) - (box?.x ?? Number.NaN) - (box?.width ?? 0), probe).toBeCloseTo(inset, 1);
    }
  });
});

test.describe("truncate", () => {
  for (const probe of ["text-truncate", "heading-truncate"]) {
    test(`${probe} clips one line with an ellipsis`, async ({ mount }) => {
      const component = await mount<typeof OneAxisOwnersStory>(STORY);
      const line = component.locator(`[data-probe="${probe}"]`);
      await expect(line).toHaveCSS("overflow", "hidden");
      await expect(line).toHaveCSS("text-overflow", "ellipsis");
      await expect(line).toHaveCSS("white-space", "nowrap");
      expect(await line.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    });
  }

  test("text without it wraps", async ({ mount }) => {
    const component = await mount<typeof OneAxisOwnersStory>(STORY);
    await expect(component.locator('[data-probe="text-wrap"]')).toHaveCSS("white-space", "normal");
  });
});
