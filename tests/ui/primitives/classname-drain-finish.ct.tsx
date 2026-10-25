// The primitive arms that finish the feature className drain. Each arm is read as a computed value against a probe
// painted from the same token, so a token retune never breaks the test and a dead arm always does.
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { ButtonFinishStory, CardFinishStory, LayoutFinishStory, PartsFinishStory, TextFinishStory } from "./_classname-drain-finish-stories.tsx";

const STORIES = "tests/ui/primitives/_classname-drain-finish-stories";

function style(locator: Locator, property: string): Promise<string> {
  return locator.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
}

function kase(root: Locator, name: string): Locator {
  return root.locator(`[data-case="${name}"]`);
}

function probe(root: Locator, name: string, property: string): Promise<string> {
  return style(root.locator(`[data-probe="${name}"]`), property);
}

async function park(root: Locator): Promise<void> {
  await kase(root, "away").hover();
}

test("the new Text tones ink from their tokens, and italic, selectAll and pulse take their properties", async ({ mount }) => {
  const root = await mount<typeof TextFinishStory>(`${STORIES}/TextFinishStory`, {});
  for (const tone of ["foreground", "prose", "onPrimary"] as const) {
    expect(await style(kase(root, tone), "color"), tone).toBe(await probe(root, tone, "color"));
  }
  expect(await style(kase(root, "italic"), "font-style")).toBe("italic");
  expect(await style(kase(root, "selectAll"), "user-select")).toBe("all");
  expect(await style(kase(root, "pulse"), "animation-name")).not.toBe("none");
  expect(await style(root.getByRole("img", { name: "pulsing icon", exact: true }), "animation-name")).not.toBe("none");
});

test("lead is the body step at semibold, and datum is the sans gloss step with tabular figures in the foreground ink", async ({ mount }) => {
  const root = await mount<typeof TextFinishStory>(`${STORIES}/TextFinishStory`, {});
  for (const property of ["font-size", "font-weight", "font-family"]) {
    expect(await style(kase(root, "lead"), property), property).toBe(await probe(root, "lead", property));
  }
  for (const property of ["font-size", "font-family", "color"]) {
    expect(await style(kase(root, "datum"), property), property).toBe(await probe(root, "datum", property));
  }
  expect(await style(kase(root, "datum"), "font-variant-numeric")).toBe("tabular-nums");
});

test("a hovered group lifts a cued line to the foreground and nudges its arrow; a row hover makes a marker yield", async ({ mount }) => {
  const root = await mount<typeof TextFinishStory>(`${STORIES}/TextFinishStory`, {});
  await park(root);
  expect(await style(kase(root, "lift"), "color")).toBe(await probe(root, "muted", "color"));
  expect(await style(kase(root, "nudge"), "translate")).toBe("none");
  const yielding = root.locator('[data-case="yield-group"] svg');
  expect(await style(yielding, "visibility")).toBe("visible");
  await kase(root, "cue-group").hover();
  await expect.poll(() => style(kase(root, "lift"), "color")).toBe(await probe(root, "foreground", "color"));
  await expect.poll(() => style(kase(root, "nudge"), "translate")).not.toBe("none");
  await kase(root, "yield-group").hover();
  expect(await style(yielding, "visibility")).toBe("hidden");
});

test("a chevron turns while its group's panel is open", async ({ mount }) => {
  const root = await mount<typeof TextFinishStory>(`${STORIES}/TextFinishStory`, {});
  expect(await style(root.getByRole("img", { name: "open chevron", exact: true }), "rotate")).toBe("180deg");
});

test("solid fills with the primary and carries no CTA ring, and bare draws nothing at rest", async ({ mount }) => {
  const root = await mount<typeof ButtonFinishStory>(`${STORIES}/ButtonFinishStory`, {});
  await park(root);
  const solid = root.getByRole("button", { name: "solid", exact: true });
  expect(await style(solid, "background-color")).toBe(await probe(root, "primary", "background-color"));
  await expect(solid).not.toHaveAttribute("data-cta");
  const bare = root.getByRole("button", { name: "bare", exact: true });
  expect(await style(bare, "background-color")).toBe(await probe(root, "transparent", "background-color"));
  await bare.hover();
  await expect.poll(() => style(bare, "opacity")).toBe("0.8");
  await expect.poll(() => style(bare, "background-color")).toBe(await probe(root, "transparent", "background-color"));
});

test("tone inks ghost, outline and secondary; underline, reserveEdge and confirming take their properties", async ({ mount }) => {
  const root = await mount<typeof ButtonFinishStory>(`${STORIES}/ButtonFinishStory`, {});
  await park(root);
  const button = (name: string): Locator => root.getByRole("button", { name, exact: true });
  expect(await style(button("ghost foreground"), "color")).toBe(await probe(root, "foreground", "color"));
  expect(await style(button("outline muted"), "color")).toBe(await probe(root, "muted", "color"));
  expect(await style(button("secondary muted"), "color")).toBe(await probe(root, "muted", "color"));
  expect(await style(button("show all"), "text-decoration-style")).toBe("dotted");
  expect(await style(button("show all"), "text-decoration-line")).toBe("underline");
  expect(await style(button("reserved"), "border-block-start-width")).toBe("1px");
  expect(await style(button("reserved"), "border-block-start-color")).toBe(await probe(root, "transparent", "color"));
  expect(await style(button("confirming"), "box-shadow")).toContain(await probe(root, "accent", "color"));
});

test("quietDisabled keeps a disabled control at full strength, where a plain disabled control dims", async ({ mount }) => {
  const root = await mount<typeof ButtonFinishStory>(`${STORIES}/ButtonFinishStory`, {});
  expect(await style(root.getByRole("button", { name: "quiet disabled", exact: true }), "opacity")).toBe("1");
  expect(await style(root.getByRole("button", { name: "dim disabled", exact: true }), "opacity")).toBe("0.5");
});

test("the sidebar focus ring offsets into the sidebar fill, and the rail marks only the selected row", async ({ mount, page }) => {
  const root = await mount<typeof ButtonFinishStory>(`${STORIES}/ButtonFinishStory`, {});
  const rail = root.getByRole("button", { name: "on the rail", exact: true });
  await rail.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect.poll(() => style(rail, "box-shadow")).toContain(await probe(root, "sidebar", "color"));
  const selected = root.getByRole("button", { name: "selected row", exact: true });
  const resting = root.getByRole("button", { name: "resting row", exact: true });
  expect(await style(selected, "border-inline-start-width")).toBe("2px");
  expect(await style(selected, "border-inline-start-color")).toBe(await probe(root, "primary", "color"));
  expect(await style(resting, "border-inline-start-width")).toBe("2px");
  expect(await style(resting, "border-inline-start-color")).toBe(await probe(root, "transparent", "color"));
});

test("the float, inset, plate, pill and bubble shapes keep their radius and inset in and out of a tier", async ({ mount }) => {
  const root = await mount<typeof CardFinishStory>(`${STORIES}/CardFinishStory`, {});
  const radius = "border-start-start-radius";
  for (const name of ["float", "tier-float"]) {
    expect(await style(kase(root, name), radius), name).toBe(await probe(root, "radius-card", radius));
    expect(await style(kase(root, name), "padding-block-start"), name).toBe(await probe(root, "radius-card", "padding-block-start"));
  }
  expect(await style(kase(root, "inset"), radius)).toBe(await probe(root, "radius-inset", radius));
  expect(await style(kase(root, "plate"), "border-block-start-width")).toBe("0px");
  expect(await style(kase(root, "pill"), radius)).toBe(await probe(root, "radius-full", radius));
  for (const name of ["bubble", "tier-bubble"]) {
    expect(await style(kase(root, name), radius), name).toBe(await probe(root, "radius-card", radius));
    expect(await style(kase(root, name), "padding-inline-start"), name).toBe(await probe(root, "bubble", "padding-inline-start"));
    expect(await style(kase(root, name), "border-block-start-width"), name).toBe("0px");
  }
  expect(await style(kase(root, "bubble"), "background-color")).toBe(await probe(root, "bubble", "background-color"));
});

test("each new Card tone paints its fill or edge from its token", async ({ mount }) => {
  const root = await mount<typeof CardFinishStory>(`${STORIES}/CardFinishStory`, {});
  await park(root);
  for (const tint of ["successTint", "warningTint", "destructiveTint", "infoTint"]) {
    expect(await style(kase(root, tint), "background-color"), tint).toBe(await probe(root, tint, "background-color"));
    expect(await style(kase(root, tint), "border-block-start-color"), tint).toBe(await probe(root, tint, "border-block-start-color"));
  }
  expect(await style(kase(root, "primaryEdge"), "border-block-start-color")).toBe(await probe(root, "primaryEdge", "border-block-start-color"));
  expect(await style(kase(root, "primaryOutline"), "border-block-start-color")).toBe(await probe(root, "primary", "border-block-start-color"));
  expect(await style(kase(root, "primaryOutline"), "background-color")).toBe(await probe(root, "primary", "background-color"));
  expect(await style(kase(root, "sidebarEdge"), "border-block-start-color")).toBe(await probe(root, "sidebarEdge", "border-block-start-color"));
  for (const tone of ["raised", "popover", "mutedWash"]) {
    expect(await style(kase(root, tone), "background-color"), tone).toBe(await probe(root, tone, "background-color"));
  }
  expect(await style(kase(root, "popover"), "color")).toBe(await probe(root, "popover", "color"));
});

test("rail, spoiler, presence, the field and drop states, focusable and ownSlot take their properties", async ({ mount }) => {
  const root = await mount<typeof CardFinishStory>(`${STORIES}/CardFinishStory`, {});
  await park(root);
  expect(await style(kase(root, "rail"), "border-inline-start-width")).toBe("2px");
  expect(await style(kase(root, "rail"), "border-inline-start-color")).toBe(await probe(root, "primary", "border-block-start-color"));
  expect(await style(kase(root, "spoiler"), "filter")).toContain("blur");
  expect(await style(kase(root, "spoiler"), "user-select")).toBe("none");
  expect(await style(kase(root, "presence-hidden"), "opacity")).toBe("0");
  expect(await style(kase(root, "presence-hidden"), "pointer-events")).toBe("none");
  expect(await style(kase(root, "presence-shown"), "opacity")).toBe("1");
  expect(await style(kase(root, "drop-armed"), "border-block-start-color")).toBe(await probe(root, "primary", "border-block-start-color"));
  await kase(root, "holds-field").hover();
  await expect.poll(() => style(kase(root, "holds-field"), "background-color")).toBe(await probe(root, "muted", "background-color"));
  await expect(kase(root, "own-slot")).toHaveAttribute("data-slot", "named-hook");
  await expect(kase(root, "float")).toHaveAttribute("data-slot", "card-root");
  const focusable = kase(root, "focusable");
  await focusable.focus();
  await expect.poll(() => style(focusable, "outline-style")).toBe("none");
});

test("the shadow axis: overlay always lifts, follow takes the glow elevation, and none refuses it", async ({ mount }) => {
  const root = await mount<typeof CardFinishStory>(`${STORIES}/CardFinishStory`, {});
  expect(await style(kase(root, "overlay"), "box-shadow")).not.toBe("none");
  expect(await style(kase(root, "glow-follow"), "box-shadow")).not.toBe("none");
  expect(await style(kase(root, "glow-none"), "box-shadow")).toBe("none");
});

test("divider between ends the list clean, and the rule weight, tone and dashed style reach the edge", async ({ mount }) => {
  const root = await mount<typeof LayoutFinishStory>(`${STORIES}/LayoutFinishStory`, {});
  expect(await style(kase(root, "between-first"), "border-block-end-width")).toBe("1px");
  expect(await style(kase(root, "between-last"), "border-block-end-width")).toBe("0px");
  expect(await style(kase(root, "rule"), "border-inline-start-width")).toBe("2px");
  expect(await style(kase(root, "rule"), "border-inline-start-color")).toBe(await probe(root, "primary", "border-block-start-color"));
  expect(await style(kase(root, "dashed"), "border-inline-start-style")).toBe("dashed");
  expect(await style(kase(root, "dashed"), "border-inline-start-width")).toBe("1px");
});

test("each ground fills from its token, and the art-aware ground steps aside over a wallpaper", async ({ mount }) => {
  const root = await mount<typeof LayoutFinishStory>(`${STORIES}/LayoutFinishStory`, {});
  for (const ground of ["background", "card", "popover", "raised", "sidebar", "faint"]) {
    expect(await style(kase(root, `ground-${ground}`), "background-color"), ground).toBe(await probe(root, `ground-${ground}`, "background-color"));
  }
  expect(await style(kase(root, "container-card"), "background-color")).toBe(await probe(root, "ground-card", "background-color"));
  expect(await style(kase(root, "unless-plain"), "background-color")).toBe(await probe(root, "ground-background", "background-color"));
  expect(await style(kase(root, "unless-art"), "background-color")).toBe(await probe(root, "transparent", "background-color"));
});

test("the wallpaper plates paint only over art", async ({ mount }) => {
  const root = await mount<typeof LayoutFinishStory>(`${STORIES}/LayoutFinishStory`, {});
  expect(await style(kase(root, "plate-band"), "background-color")).toBe(await probe(root, "reading-plate", "background-color"));
  expect(await style(kase(root, "plate-error"), "background-color")).toBe(await probe(root, "card", "background-color"));
  expect(await style(kase(root, "plate-plain"), "background-color")).toBe(await probe(root, "transparent", "background-color"));
});

test("highlight, spoiler, slide, lifted, fade, ink, opacityMotion, focusTarget and scrollFade take their properties", async ({ mount }) => {
  const root = await mount<typeof LayoutFinishStory>(`${STORIES}/LayoutFinishStory`, {});
  expect(await style(kase(root, "highlight"), "background-color")).toBe(await probe(root, "muted", "background-color"));
  expect(await style(kase(root, "highlight"), "box-shadow")).not.toBe("none");
  expect(await style(kase(root, "spoiler"), "filter")).toContain("blur");
  expect(await style(kase(root, "slide-parked"), "visibility")).toBe("hidden");
  expect(await style(kase(root, "slide-parked"), "translate")).not.toBe("none");
  expect(await style(kase(root, "slide-shown"), "visibility")).toBe("visible");
  expect(await style(kase(root, "lifted"), "box-shadow")).not.toBe("none");
  expect(await style(kase(root, "fade"), "background-image")).toContain("linear-gradient");
  expect(await style(kase(root, "ink"), "color")).toBe(await probe(root, "foreground", "color"));
  expect(await style(kase(root, "opacity-motion"), "transition-property")).toBe("opacity");
  const target = kase(root, "focus-target");
  await target.focus();
  await expect.poll(() => style(target, "outline-style")).toBe("none");
  // The edge-fade recipe keys on its selector contract, which the hook drives; the prop is what puts it on the box.
  await expect(kase(root, "scroll-x")).toHaveClass(/(^|\s)scroll-fade-x(\s|$)/u);
});

test("an inert-until-hover row is inert at rest and live on its group's hover, and a state fill holds its state", async ({ mount }) => {
  const root = await mount<typeof LayoutFinishStory>(`${STORIES}/LayoutFinishStory`, {});
  await park(root);
  expect(await style(kase(root, "inert"), "pointer-events")).toBe("none");
  await kase(root, "reveal-group").hover();
  expect(await style(kase(root, "inert"), "pointer-events")).toBe("auto");
  for (const name of ["state-expanded", "state-selected"]) {
    expect(await style(kase(root, name), "background-color"), name).toBe(await probe(root, "accent", "background-color"));
  }
});

test.describe("at a coarse pointer", () => {
  test.use({ hasTouch: true });

  test("an inert-until-hover row is live", async ({ mount }) => {
    const root = await mount<typeof LayoutFinishStory>(`${STORIES}/LayoutFinishStory`, {});
    expect(await style(kase(root, "inert"), "pointer-events")).toBe("auto");
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
  expect(await style(kase(root, "holds-controls"), "color")).toBe(await probe(root, "foreground", "color"));
  expect(await style(kase(root, "separator"), "background-color")).toBe(await probe(root, "separator", "background-color"));
  expect(await style(kase(root, "skeleton"), "border-start-start-radius")).toBe(await probe(root, "radius-base", "border-start-start-radius"));
  const field = root.getByRole("textbox", { name: "bare field", exact: true });
  expect(await style(field, "border-block-start-width")).toBe("0px");
  expect(await style(field, "font-family")).toBe(await probe(root, "mono", "font-family"));
  expect(await style(kase(root, "badge-accent"), "background-color")).toBe(await probe(root, "accent", "background-color"));
  expect(await style(kase(root, "badge-accent"), "font-family")).toBe(await probe(root, "mono", "font-family"));
  expect(await style(kase(root, "badge-sentence"), "text-transform")).toBe("none");
  expect(await style(kase(root, "badge-sentence"), "letter-spacing")).toBe("normal");
  expect(await style(root.getByRole("combobox", { name: "Subject", exact: true }), "font-weight")).toBe("600");
  const title = root.getByRole("textbox", { name: "title step", exact: true });
  expect(await style(title, "font-size")).toBe(await probe(root, "title", "font-size"));
  expect(await style(title, "font-style")).toBe("italic");
  expect(await style(root.getByRole("textbox", { name: "title step in a tier", exact: true }), "font-size")).toBe(await probe(root, "title", "font-size"));
  expect(await style(root.locator('[data-slot="web-spinner"]'), "color")).toBe(await probe(root, "primary", "color"));
  expect(await style(root.locator('[data-case="weave"] svg'), "color")).toBe(await probe(root, "primary", "color"));
  expect(await style(kase(root, "tabs"), "border-block-start-width")).toBe("2px");
  expect(await style(kase(root, "tabs"), "border-block-start-color")).toBe(await probe(root, "primary", "border-block-start-color"));
  expect(await style(kase(root, "tabs-list"), "border-block-end-width")).toBe("0px");
  expect(await style(kase(root, "tab-cell"), "border-block-end-color")).toBe(await probe(root, "primary", "color"));
  expect(await style(kase(root, "tab-quiet"), "color")).not.toBe(await style(kase(root, "tab-cell"), "color"));
  expect(await style(kase(root, "tabs-panel"), "background-color")).toBe(await probe(root, "sidebar", "background-color"));
  expect(await style(kase(root, "dialog-header"), "position")).toBe("sticky");
  expect(await style(kase(root, "command"), "box-shadow")).not.toBe("none");
  expect(await style(kase(root, "swatch-online"), "background-color")).toBe(await probe(root, "success", "background-color"));
  expect(await style(kase(root, "swatch-online"), "border-start-start-radius")).not.toBe("0px");
  expect(await style(kase(root, "swatch-offline"), "border-block-start-width")).toBe("1px");
  expect(await style(kase(root, "swatch-offline"), "border-block-start-color")).toBe(await probe(root, "muted-ink", "border-block-start-color"));
  expect(await style(kase(root, "swatch-outline"), "box-shadow")).not.toBe("none");
  expect(await style(kase(root, "swatch-step2"), "background-color")).toBe(await probe(root, "step2", "background-color"));
  await expect(menuItem(page, "always")).toBeVisible();
  await expect(menuItem(page, "coarse only")).toBeHidden();
});
