// The primitive arms that finish the feature className drain. Each arm is read as a computed value against a probe
// painted from the same token, so a token retune never breaks the test and a dead arm always does.

import { computedStyle } from "@orb/testkit/browser/spec";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { ButtonFinishStory, CardFinishStory, LayoutFinishStory, PartsFinishStory, TextFinishStory } from "./_classname-drain-finish-stories.tsx";

const STORIES = "tests/ui/primitives/_classname-drain-finish-stories";

function kase(root: Locator, name: string): Locator {
  return root.locator(`[data-case="${name}"]`);
}

function probe(root: Locator, name: string, property: string): Promise<string> {
  return computedStyle(root.locator(`[data-probe="${name}"]`), property);
}

async function park(root: Locator): Promise<void> {
  await kase(root, "away").hover();
}

test("the new Text tones ink from their tokens, and italic, selectAll and pulse take their properties", async ({ mount }) => {
  const root = await mount<typeof TextFinishStory>(`${STORIES}/TextFinishStory`, {});
  for (const tone of ["foreground", "prose", "onPrimary"] as const) {
    expect(await computedStyle(kase(root, tone), "color"), tone).toBe(await probe(root, tone, "color"));
  }
  expect(await computedStyle(kase(root, "italic"), "font-style")).toBe("italic");
  expect(await computedStyle(kase(root, "selectAll"), "user-select")).toBe("all");
  expect(await computedStyle(kase(root, "pulse"), "animation-name")).not.toBe("none");
  expect(await computedStyle(root.getByRole("img", { name: "pulsing icon", exact: true }), "animation-name")).not.toBe("none");
});

test("lead is the body step at semibold, and datum is the sans gloss step with tabular figures in the foreground ink", async ({ mount }) => {
  const root = await mount<typeof TextFinishStory>(`${STORIES}/TextFinishStory`, {});
  for (const property of ["font-size", "font-weight", "font-family"]) {
    expect(await computedStyle(kase(root, "lead"), property), property).toBe(await probe(root, "lead", property));
  }
  for (const property of ["font-size", "font-family", "color"]) {
    expect(await computedStyle(kase(root, "datum"), property), property).toBe(await probe(root, "datum", property));
  }
  expect(await computedStyle(kase(root, "datum"), "font-variant-numeric")).toBe("tabular-nums");
});

test("a hovered group lifts a cued line to the foreground and nudges its arrow; a row hover makes a marker yield", async ({ mount }) => {
  const root = await mount<typeof TextFinishStory>(`${STORIES}/TextFinishStory`, {});
  await park(root);
  expect(await computedStyle(kase(root, "lift"), "color")).toBe(await probe(root, "muted", "color"));
  expect(await computedStyle(kase(root, "nudge"), "translate")).toBe("none");
  const yielding = root.locator('[data-case="yield-group"] svg');
  expect(await computedStyle(yielding, "visibility")).toBe("visible");
  await kase(root, "cue-group").hover();
  await expect.poll(() => computedStyle(kase(root, "lift"), "color")).toBe(await probe(root, "foreground", "color"));
  await expect.poll(() => computedStyle(kase(root, "nudge"), "translate")).not.toBe("none");
  await kase(root, "yield-group").hover();
  expect(await computedStyle(yielding, "visibility")).toBe("hidden");
});

test("a chevron turns while its group's panel is open", async ({ mount }) => {
  const root = await mount<typeof TextFinishStory>(`${STORIES}/TextFinishStory`, {});
  expect(await computedStyle(root.getByRole("img", { name: "open chevron", exact: true }), "rotate")).toBe("180deg");
});

test("solid fills with the primary and carries no CTA ring, and bare draws nothing at rest", async ({ mount }) => {
  const root = await mount<typeof ButtonFinishStory>(`${STORIES}/ButtonFinishStory`, {});
  await park(root);
  const solid = root.getByRole("button", { name: "solid", exact: true });
  expect(await computedStyle(solid, "background-color")).toBe(await probe(root, "primary", "background-color"));
  await expect(solid).not.toHaveAttribute("data-cta");
  const bare = root.getByRole("button", { name: "bare", exact: true });
  expect(await computedStyle(bare, "background-color")).toBe(await probe(root, "transparent", "background-color"));
  await bare.hover();
  await expect.poll(() => computedStyle(bare, "opacity")).toBe("0.8");
  await expect.poll(() => computedStyle(bare, "background-color")).toBe(await probe(root, "transparent", "background-color"));
});

test("tone inks ghost, outline and secondary; underline, reserveEdge and confirming take their properties", async ({ mount }) => {
  const root = await mount<typeof ButtonFinishStory>(`${STORIES}/ButtonFinishStory`, {});
  await park(root);
  const button = (name: string): Locator => root.getByRole("button", { name, exact: true });
  expect(await computedStyle(button("ghost foreground"), "color")).toBe(await probe(root, "foreground", "color"));
  expect(await computedStyle(button("outline muted"), "color")).toBe(await probe(root, "muted", "color"));

  expect(await computedStyle(button("show all"), "text-decoration-style")).toBe("dotted");
  expect(await computedStyle(button("show all"), "text-decoration-line")).toBe("underline");
  expect(await computedStyle(button("reserved"), "border-block-start-width")).toBe("1px");
  expect(await computedStyle(button("reserved"), "border-block-start-color")).toBe(await probe(root, "transparent", "color"));
  expect(await computedStyle(button("confirming"), "box-shadow")).toContain(await probe(root, "accent", "color"));
});

test("quietDisabled keeps a disabled control at full strength, where a plain disabled control dims", async ({ mount }) => {
  const root = await mount<typeof ButtonFinishStory>(`${STORIES}/ButtonFinishStory`, {});
  expect(await computedStyle(root.getByRole("button", { name: "quiet disabled", exact: true }), "opacity")).toBe("1");
  expect(await computedStyle(root.getByRole("button", { name: "dim disabled", exact: true }), "opacity")).toBe("0.5");
});

test("the sidebar focus ring offsets into the sidebar fill, and the rail marks only the selected row", async ({ mount, page }) => {
  const root = await mount<typeof ButtonFinishStory>(`${STORIES}/ButtonFinishStory`, {});
  const rail = root.getByRole("button", { name: "on the rail", exact: true });
  await rail.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect.poll(() => computedStyle(rail, "box-shadow")).toContain(await probe(root, "sidebar", "color"));
  const selected = root.getByRole("button", { name: "selected row", exact: true });
  const resting = root.getByRole("button", { name: "resting row", exact: true });
  expect(await computedStyle(selected, "border-inline-start-width")).toBe("2px");
  expect(await computedStyle(selected, "border-inline-start-color")).toBe(await probe(root, "primary", "color"));
  expect(await computedStyle(resting, "border-inline-start-width")).toBe("2px");
  expect(await computedStyle(resting, "border-inline-start-color")).toBe(await probe(root, "transparent", "color"));
});

test("the bubble shape keeps its radius and inset in and out of a tier", async ({ mount }) => {
  const root = await mount<typeof CardFinishStory>(`${STORIES}/CardFinishStory`, {});
  const radius = "border-start-start-radius";
  for (const name of ["bubble", "tier-bubble"]) {
    expect(await computedStyle(kase(root, name), radius), name).toBe(await probe(root, "radius-card", radius));
    expect(await computedStyle(kase(root, name), "padding-inline-start"), name).toBe(await probe(root, "bubble", "padding-inline-start"));
    expect(await computedStyle(kase(root, name), "border-block-start-width"), name).toBe("0px");
  }
  expect(await computedStyle(kase(root, "bubble"), "background-color")).toBe(await probe(root, "bubble", "background-color"));
});

test("rail, focusable and ownSlot take their properties", async ({ mount }) => {
  const root = await mount<typeof CardFinishStory>(`${STORIES}/CardFinishStory`, {});
  await park(root);
  expect(await computedStyle(kase(root, "rail"), "border-inline-start-width")).toBe("2px");
  expect(await computedStyle(kase(root, "rail"), "border-inline-start-color")).toBe(await probe(root, "primary", "border-block-start-color"));
  await expect(kase(root, "own-slot")).toHaveAttribute("data-slot", "named-hook");
  const focusable = kase(root, "focusable");
  await focusable.focus();
  await expect.poll(() => computedStyle(focusable, "outline-style")).toBe("none");
});

test("an interactive card takes the glow elevation, and a static card takes none", async ({ mount }) => {
  const root = await mount<typeof CardFinishStory>(`${STORIES}/CardFinishStory`, {});
  expect(await computedStyle(kase(root, "glow-follow"), "box-shadow")).not.toBe("none");
  expect(await computedStyle(kase(root, "glow-none"), "box-shadow")).toBe("none");
});

test("divider between ends the list clean, and the rule weight, tone and dashed style reach the edge", async ({ mount }) => {
  const root = await mount<typeof LayoutFinishStory>(`${STORIES}/LayoutFinishStory`, {});
  expect(await computedStyle(kase(root, "between-first"), "border-block-end-width")).toBe("1px");
  expect(await computedStyle(kase(root, "between-last"), "border-block-end-width")).toBe("0px");
  expect(await computedStyle(kase(root, "rule"), "border-inline-start-width")).toBe("2px");
  expect(await computedStyle(kase(root, "rule"), "border-inline-start-color")).toBe(await probe(root, "primary", "border-block-start-color"));
  expect(await computedStyle(kase(root, "dashed"), "border-inline-start-style")).toBe("dashed");
  expect(await computedStyle(kase(root, "dashed"), "border-inline-start-width")).toBe("1px");
});

test("each ground fills from its token, and the art-aware ground steps aside over a wallpaper", async ({ mount }) => {
  const root = await mount<typeof LayoutFinishStory>(`${STORIES}/LayoutFinishStory`, {});
  for (const ground of ["background", "card", "popover", "raised", "sidebar", "faint"]) {
    expect(await computedStyle(kase(root, `ground-${ground}`), "background-color"), ground).toBe(await probe(root, `ground-${ground}`, "background-color"));
  }
  expect(await computedStyle(kase(root, "container-card"), "background-color")).toBe(await probe(root, "ground-card", "background-color"));
  expect(await computedStyle(kase(root, "unless-plain"), "background-color")).toBe(await probe(root, "ground-background", "background-color"));
  expect(await computedStyle(kase(root, "unless-art"), "background-color")).toBe(await probe(root, "transparent", "background-color"));
});

test("the wallpaper plates paint only over art", async ({ mount }) => {
  const root = await mount<typeof LayoutFinishStory>(`${STORIES}/LayoutFinishStory`, {});
  expect(await computedStyle(kase(root, "plate-band"), "background-color")).toBe(await probe(root, "reading-plate", "background-color"));
  expect(await computedStyle(kase(root, "plate-error"), "background-color")).toBe(await probe(root, "card", "background-color"));
  expect(await computedStyle(kase(root, "plate-plain"), "background-color")).toBe(await probe(root, "transparent", "background-color"));
});

test("fade, ink, receded motion, focusTarget and scrollFade take their properties", async ({ mount }) => {
  const root = await mount<typeof LayoutFinishStory>(`${STORIES}/LayoutFinishStory`, {});
  expect(await computedStyle(kase(root, "fade"), "background-image")).toContain("linear-gradient");
  expect(await computedStyle(kase(root, "ink"), "color")).toBe(await probe(root, "foreground", "color"));
  expect(await computedStyle(kase(root, "receded-motion"), "transition-property")).toBe("opacity");
  expect(await computedStyle(kase(root, "receded-motion"), "opacity")).not.toBe("1");
  const target = kase(root, "focus-target");
  await target.focus();
  await expect.poll(() => computedStyle(target, "outline-style")).toBe("none");
  // The edge-fade recipe keys on its selector contract, which the hook drives; the prop is what puts it on the box.
  await expect(kase(root, "scroll-x")).toHaveClass(/(^|\s)scroll-fade-x(\s|$)/u);
});

test("an inert-until-hover row is inert at rest and live on its group's hover", async ({ mount }) => {
  const root = await mount<typeof LayoutFinishStory>(`${STORIES}/LayoutFinishStory`, {});
  await park(root);
  expect(await computedStyle(kase(root, "inert"), "pointer-events")).toBe("none");
  await kase(root, "reveal-group").hover();
  expect(await computedStyle(kase(root, "inert"), "pointer-events")).toBe("auto");
});

test.describe("at a coarse pointer", () => {
  test.use({ hasTouch: true });

  test("an inert-until-hover row is live", async ({ mount }) => {
    const root = await mount<typeof LayoutFinishStory>(`${STORIES}/LayoutFinishStory`, {});
    expect(await computedStyle(kase(root, "inert"), "pointer-events")).toBe("auto");
  });

  test("a fine-only menu item shows at a coarse pointer", async ({ mount, page }) => {
    await mount<typeof PartsFinishStory>(`${STORIES}/PartsFinishStory`, {});
    await expect(menuItem(page, "coarse only")).toBeVisible();
  });
});

function menuItem(page: Page, name: string): Locator {
  return page.getByRole("menuitem", { name, exact: true });
}

test("the other primitives' arms take their properties", async ({ mount, page }) => {
  const root = await mount<typeof PartsFinishStory>(`${STORIES}/PartsFinishStory`, {});
  expect(await computedStyle(kase(root, "holds-controls"), "color")).toBe(await probe(root, "foreground", "color"));
  expect(await computedStyle(kase(root, "separator"), "background-color")).toBe(await probe(root, "separator", "background-color"));
  expect(await computedStyle(kase(root, "skeleton"), "border-start-start-radius")).toBe(await probe(root, "radius-base", "border-start-start-radius"));
  const field = root.getByRole("textbox", { name: "bare field", exact: true });
  expect(await computedStyle(field, "border-block-start-width")).toBe("0px");
  expect(await computedStyle(field, "font-family")).toBe(await probe(root, "mono", "font-family"));
  expect(await computedStyle(kase(root, "badge-code"), "font-family")).toBe(await probe(root, "mono", "font-family"));
  expect(await computedStyle(kase(root, "badge-sentence"), "text-transform")).toBe("none");
  expect(await computedStyle(kase(root, "badge-sentence"), "letter-spacing")).toBe("normal");
  expect(await computedStyle(root.getByRole("combobox", { name: "Subject", exact: true }), "font-weight")).toBe("600");
  const title = root.getByRole("textbox", { name: "title step", exact: true });
  expect(await computedStyle(title, "font-size")).toBe(await probe(root, "title", "font-size"));
  expect(await computedStyle(title, "font-style")).toBe("italic");
  expect(await computedStyle(root.getByRole("textbox", { name: "title step in a tier", exact: true }), "font-size")).toBe(
    await probe(root, "title", "font-size"),
  );
  expect(await computedStyle(root.locator('[data-slot="web-spinner"]'), "color")).toBe(await probe(root, "primary", "color"));
  expect(await computedStyle(root.locator('[data-case="weave"] svg'), "color")).toBe(await probe(root, "primary", "color"));
  expect(await computedStyle(kase(root, "tabs"), "border-block-start-width")).toBe("2px");
  expect(await computedStyle(kase(root, "tabs"), "border-block-start-color")).toBe(await probe(root, "primary", "border-block-start-color"));
  expect(await computedStyle(kase(root, "tabs-list"), "border-block-end-width")).toBe("0px");
  expect(await computedStyle(kase(root, "tab-cell"), "border-block-end-color")).toBe(await probe(root, "primary-solid", "color"));
  expect(await computedStyle(kase(root, "tab-quiet"), "opacity")).toBe(await probe(root, "quiet", "opacity"));
  expect(await computedStyle(kase(root, "tab-cell"), "opacity")).toBe("1");
  expect(await computedStyle(kase(root, "tabs-panel"), "background-color")).toBe(await probe(root, "sidebar", "background-color"));
  expect(await computedStyle(kase(root, "dialog-header"), "position")).toBe("sticky");
  expect(await computedStyle(kase(root, "command"), "box-shadow")).not.toBe("none");
  expect(await computedStyle(kase(root, "swatch-online"), "background-color")).toBe(await probe(root, "success", "background-color"));
  expect(await computedStyle(kase(root, "swatch-online"), "border-start-start-radius")).not.toBe("0px");
  expect(await computedStyle(kase(root, "swatch-offline"), "border-block-start-width")).toBe("1px");
  expect(await computedStyle(kase(root, "swatch-offline"), "border-block-start-color")).toBe(await probe(root, "muted-ink", "border-block-start-color"));
  expect(await computedStyle(kase(root, "swatch-outline"), "box-shadow")).not.toBe("none");
  expect(await computedStyle(kase(root, "swatch-step2"), "background-color")).toBe(await probe(root, "ladder-2", "background-color"));
  expect(await computedStyle(kase(root, "swatch-step2"), "opacity")).toBe("1");
  await expect(menuItem(page, "always")).toBeVisible();
  await expect(menuItem(page, "coarse only")).toBeHidden();
});
