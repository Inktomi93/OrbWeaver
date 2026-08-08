// CT: the empty-state seal — renders the icon/title/description/action teaching stack from
// caller-owned copy (ui-package-design §6.1).

import { EmptyState } from "@orb/ui/empty-state";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";

test("renders title, description, and action from the caller", async ({ mount, page }) => {
  const component = await mount(
    <EmptyState action={<button type="button">New character</button>} description="Weave your first one to begin." title="No characters yet" />,
  );
  await expect(page.getByText("No characters yet")).toBeVisible();
  await expect(page.getByText("Weave your first one to begin.")).toBeVisible();
  await expect(page.getByRole("button", { name: "New character" })).toBeVisible();
  await expect(component.locator('[data-slot="empty-state-title"]')).toHaveCSS("color", TOKENS["color.foreground"].value);
  await expect(component.locator('[data-slot="empty-state-description"]')).toHaveCSS("color", TOKENS["color.muted-foreground"].value);
});

// side-eye P2f: the same empty state teaches at CONTENT scale on a wide surface and drops a type step in a
// narrow LIST pane — decided by a CONTAINER QUERY on its own root (§4b axis 1), never a caller-passed
// `compact` prop. Asserted on the COMPUTED font size against the resolved tokens: `done ≠ rendered`.
const TITLE = '[data-slot="empty-state-title"]';
const REM = 16;

test("the voice scales to the SURFACE: content-tier title when wide", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const component = await mount(<EmptyState description="Weave your first one." title="No characters yet" />);
  const expected = `${Number.parseFloat(TOKENS["text.title"].value) * REM}px`;
  await expect(component.locator(TITLE)).toHaveCSS("font-size", expected);
});

test("the voice scales to the SURFACE: one step down inside a LIST-pane-width container", async ({ mount, page }) => {
  // ~307px is the shell LIST pane; the root IS the container, so it answers for itself with no prop.
  await page.setViewportSize({ width: 307, height: 720 });
  const component = await mount(<EmptyState description="Weave your first one." title="No characters yet" />);
  const expected = `${Number.parseFloat(TOKENS["text.body"].value) * REM}px`;
  await expect(component.locator(TITLE)).toHaveCSS("font-size", expected);
});

// GAP-2 FENCE (2026-08-08 follow-up gap-audit): the whole CLASS of "a re-parent silently narrows a
// component whose rendered width nothing asserts." EmptyState's root is a `@container` (contain:
// inline-size), so a flex parent with `align-items: center` gives the box `align-self: center` and its
// inline size collapses toward 0 — the description falls to one word per line (the automation-settings
// 63px ribbon: `settings-pane-placeholder` wrapped it in `<Stack align="center">`). A `w-full` floor on
// the primitive root (variants.ts) defeats the collapse in every consumer at once; this MEASURES the slot
// width so the class can't silently recur (`done ≠ rendered` — no role/text assertion sees a 0-width box).
test("does NOT collapse under a centering flex parent — the @container keeps its full slot width", async ({ mount }) => {
  const component = await mount(
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 400 }}>
      <EmptyState description="Weave your first one to begin so the room has a voice, not a ribbon." title="No characters yet" />
    </div>,
  );
  // 400px slot, centering parent. Pre-fix the @container root shrinks to ~min-content (one word wide);
  // the `w-full` floor makes it fill the slot. A floor of 300 is well clear of both readings.
  const box = await component.locator('[data-slot="empty-state-root"]').boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(300);
});

test("omits the description and action slots when not provided", async ({ mount, page }) => {
  await mount(<EmptyState title="Nothing here" />);
  await expect(page.getByText("Nothing here")).toBeVisible();
  await expect(page.getByRole("button")).toHaveCount(0);
});

test("renders the icon slot when provided", async ({ mount, page }) => {
  await mount(<EmptyState icon={<span data-testid="glyph">*</span>} title="Empty" />);
  await expect(page.getByTestId("glyph")).toBeVisible();
});

test("renders the decoration slot (unstyled — no muted color forced on the brand glyph)", async ({ mount, page }) => {
  const component = await mount(<EmptyState decoration={<span data-testid="weave">◈</span>} title="Weave your first thread" />);
  await expect(page.getByTestId("weave")).toBeVisible();
  const decoration = component.locator('[data-slot="empty-state-decoration"]');
  await expect(decoration).toBeVisible();
  // Unstyled: the decoration wrapper does NOT force the muted chrome color the icon slot applies —
  // so a WeaveGlyph tinted via currentColor keeps its own Ember, not muted grey.
  await expect(decoration).not.toHaveCSS("color", TOKENS["color.muted-foreground"].value);
});

test("decoration WINS over icon when both are passed (head slot is the brand glyph)", async ({ mount, page }) => {
  await mount(<EmptyState decoration={<span data-testid="weave">◈</span>} icon={<span data-testid="icon">*</span>} title="Both" />);
  await expect(page.getByTestId("weave")).toBeVisible();
  await expect(page.getByTestId("icon")).toHaveCount(0);
  await expect(page.locator('[data-slot="empty-state-icon"]')).toHaveCount(0);
});
