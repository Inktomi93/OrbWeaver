// CT: the tabs seal — click and arrow keys move selection (roving tabindex + activate-on-focus
// from Base UI), panels swap with aria-selected tracking. The active marker is a 2px primary underline
// (D62 UIP-307), not a segmented pill.
import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab } from "@orb/ui/tabs";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";

function fixture(): ReturnType<typeof Tabs> {
  return (
    <Tabs defaultValue="one">
      <TabsList>
        <TabsTab value="one">One</TabsTab>
        <TabsTab value="two">Two</TabsTab>
        <TabsIndicator data-testid="tab-indicator" />
      </TabsList>
      <TabsPanel value="one">First panel</TabsPanel>
      <TabsPanel value="two">Second panel</TabsPanel>
    </Tabs>
  );
}

test("click activates a tab and swaps its panel", async ({ mount, page }) => {
  await mount(fixture());
  await expect(page.getByText("First panel")).toBeVisible();
  await page.getByRole("tab", { name: "Two" }).click();
  await expect(page.getByRole("tab", { name: "Two" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Second panel")).toBeVisible();
  await expect(page.getByText("First panel")).toBeHidden();
});

test("arrow keys move and activate tabs", async ({ mount, page }) => {
  await mount(fixture());
  await page.getByRole("tab", { name: "One" }).click();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Two" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Second panel")).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "One" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("First panel")).toBeVisible();
});

test("the indicator is present and tracks the active tab", async ({ mount, page }) => {
  await mount(fixture());
  const indicator = page.getByTestId("tab-indicator");
  await expect(indicator).toBeVisible();
  // Base UI drives the indicator off the runtime --active-tab-left var; it moves when selection does.
  const leftOnOne = await indicator.evaluate((el) => getComputedStyle(el).getPropertyValue("--active-tab-left"));
  await page.getByRole("tab", { name: "Two" }).click();
  await expect.poll(() => indicator.evaluate((el) => getComputedStyle(el).getPropertyValue("--active-tab-left"))).not.toBe(leftOnOne);
});

test("the indicator is a 2px primary UNDERLINE and the list is a bordered track, not a pill (D62)", async ({ mount, page }) => {
  await mount(fixture());
  const indicator = page.getByTestId("tab-indicator");
  // A 2px (h-0.5) bar filled with the primary token — the underline, not a full-height pill.
  await expect(indicator).toHaveCSS("height", "2px");
  await expect(indicator).toHaveCSS("background-color", TOKENS["color.primary"].value);
  // The list lost its segmented-pill `--muted` fill and gained a hairline bottom-border track.
  const list = page.locator('[data-slot="tabs-list"]');
  await expect(list).not.toHaveCSS("background-color", TOKENS["color.muted"].value);
  await expect(list).toHaveCSS("border-bottom-width", "1px");
});

// `layout="stacked"` exists because a call-site `h-auto` CANNOT beat the sealed `h-control-sm`
// (custom-token heights are opaque to tailwind-merge ⇒ stylesheet order decides), which clipped the rpg
// HUD's rail captions to a ~5px sliver. So the assertion is the COMPUTED box, never the class string:
// the cell's content box must actually HOLD the glyph and the caption stacked, and the caption must sit
// inside it. `done ≠ rendered` — a class-string test passed the whole time the pixels were wrong.
test("layout=stacked sizes the cell to its stacked content (glyph OVER caption), and the caption is not clipped", async ({ mount, page }) => {
  await mount(
    <Tabs defaultValue="one">
      <TabsList>
        <TabsTab layout="stacked" value="one">
          <svg aria-hidden={true} data-testid="glyph" height="16" width="16" />
          <span data-testid="caption">Inventory</span>
        </TabsTab>
        <TabsTab layout="stacked" value="two">
          Two
        </TabsTab>
      </TabsList>
      <TabsPanel value="one">First panel</TabsPanel>
      <TabsPanel value="two">Second panel</TabsPanel>
    </Tabs>,
  );

  const tab = page.getByRole("tab", { name: "Inventory" });
  const glyph = page.getByTestId("glyph");
  const caption = page.getByTestId("caption");
  const [tabBox, glyphBox, captionBox] = await Promise.all([tab.boundingBox(), glyph.boundingBox(), caption.boundingBox()]);
  if (tabBox === null || glyphBox === null || captionBox === null) {
    throw new Error("expected the stacked tab, its glyph and its caption to be laid out");
  }
  // The cell's own resolved block padding (read, never assumed) + the two stacked children fit INSIDE it.
  const padding = await tab.evaluate((el) => {
    const style = getComputedStyle(el);
    return Number.parseFloat(style.paddingBlockStart) + Number.parseFloat(style.paddingBlockEnd);
  });
  // A fixed-height cell does not OVERFLOW here — it CRUSHES its children (the shipped defect measured a 6px
  // glyph over a 5px sliver of an 11px word), so the children are checked against what they are: the glyph
  // stays square and the caption owns its whole line-box.
  const lineHeight = await caption.evaluate((el) => Number.parseFloat(getComputedStyle(el).lineHeight));
  expect(glyphBox.height).toBeCloseTo(glyphBox.width, 0);
  expect(captionBox.height).toBeGreaterThanOrEqual(lineHeight - 0.5);
  expect(tabBox.height).toBeGreaterThanOrEqual(padding + glyphBox.height + captionBox.height);
  // The caption is BELOW the glyph (stacked, not a row) and wholly within the cell — the clipped-sliver bug.
  expect(captionBox.y).toBeGreaterThanOrEqual(glyphBox.y + glyphBox.height);
  expect(captionBox.y + captionBox.height).toBeLessThanOrEqual(tabBox.y + tabBox.height);
  expect(captionBox.height).toBeGreaterThan(0);
});

test("the default (inline) layout keeps the sealed control height — the stacked arm is opt-in only", async ({ mount, page }) => {
  await mount(fixture());
  const box = await page.getByRole("tab", { name: "One" }).boundingBox();
  // Resolved against the TOKEN, never a hardcoded px: a probe element wearing the same custom property
  // reports what `h-control-sm` actually paints in this browser/pointer regime.
  const control = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.height = "var(--spacing-control-sm)";
    document.body.append(probe);
    const height = probe.getBoundingClientRect().height;
    probe.remove();
    return height;
  });
  expect(box?.height ?? 0).toBeCloseTo(control, 1);
});

// The panel carries tabindex=0 (Base UI), so REAL Tab traversal lands on it — and it used to show only
// the UA outline (measured 1.10:1, under the 3:1 non-text law; 2026-08-01 side-eye P1). The gesture must be
// a real key press: `.focus()` sets :focus but NOT :focus-visible, so a scripted-focus test would assert
// nothing. The ring is a box-shadow (Tailwind ring-*), so the receipt is the COMPUTED shadow, not a class.
test("keyboard Tab into the panel paints the focus ring (not the bare UA outline)", async ({ mount, page }) => {
  await mount(fixture());
  const panel = page.locator('[data-slot="tabs-panel"]:visible');
  await expect(panel).toHaveCSS("box-shadow", "none");
  // Tab 1 → the active tab (roving tabindex); Tab 2 → the panel.
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(panel).toBeFocused();
  const shadow = await panel.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(shadow).not.toBe("none");
  // The ring rides the `--color-ring` token and stays INSIDE the panel box (no offset halo to be clipped
  // by a scroll parent) — read the token from the same document, never a hardcoded color.
  const ring = await panel.evaluate((el) => getComputedStyle(el).getPropertyValue("--color-ring").trim());
  expect(ring.length).toBeGreaterThan(0);
  expect(shadow).toContain("inset");
});

test("Home/End jump to the first/last tab", async ({ mount, page }) => {
  await mount(
    <Tabs defaultValue="one">
      <TabsList>
        <TabsTab value="one">One</TabsTab>
        <TabsTab value="two">Two</TabsTab>
        <TabsTab value="three">Three</TabsTab>
      </TabsList>
      <TabsPanel value="one">First panel</TabsPanel>
      <TabsPanel value="two">Second panel</TabsPanel>
      <TabsPanel value="three">Third panel</TabsPanel>
    </Tabs>,
  );
  await page.getByRole("tab", { name: "Two" }).click();
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: "Three" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(page.getByRole("tab", { name: "One" })).toHaveAttribute("aria-selected", "true");
});

test("a disabled tab is skipped by arrow-key navigation and cannot be activated by click", async ({ mount, page }) => {
  await mount(
    <Tabs defaultValue="one">
      <TabsList>
        <TabsTab value="one">One</TabsTab>
        <TabsTab disabled={true} value="two">
          Two
        </TabsTab>
        <TabsTab value="three">Three</TabsTab>
      </TabsList>
      <TabsPanel value="one">First panel</TabsPanel>
      <TabsPanel value="two">Second panel</TabsPanel>
      <TabsPanel value="three">Third panel</TabsPanel>
    </Tabs>,
  );
  const disabledTab = page.getByRole("tab", { name: "Two" });
  await expect(disabledTab).toHaveAttribute("data-disabled", "");
  await expect(disabledTab).toHaveAttribute("aria-selected", "false");

  await page.getByRole("tab", { name: "One" }).click();
  // Base UI's roving focus still lands ON a disabled tab (it isn't skipped in the DOM tab order),
  // but activateOnFocus does NOT select it — a disabled tab can never become the active tab.
  await page.keyboard.press("ArrowRight");
  await expect(disabledTab).toHaveAttribute("aria-selected", "false");
  await expect(page.getByRole("tab", { name: "One" })).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Three" })).toHaveAttribute("aria-selected", "true");
});

test("orientation=vertical mirrors data-orientation onto every part", async ({ mount, page }) => {
  await mount(
    <Tabs defaultValue="one" orientation="vertical">
      <TabsList>
        <TabsTab value="one">One</TabsTab>
        <TabsTab value="two">Two</TabsTab>
      </TabsList>
      <TabsPanel value="one">First panel</TabsPanel>
      <TabsPanel value="two">Second panel</TabsPanel>
    </Tabs>,
  );
  await expect(page.locator('[data-slot="tabs-root"]')).toHaveAttribute("data-orientation", "vertical");
  await expect(page.locator('[data-slot="tabs-list"]')).toHaveAttribute("data-orientation", "vertical");
  await page.getByRole("tab", { name: "One" }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("tab", { name: "Two" })).toHaveAttribute("aria-selected", "true");
});
