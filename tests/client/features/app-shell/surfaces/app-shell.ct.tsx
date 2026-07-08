// AppShell CT — the composed four-region frame end-to-end: the default chats CONTENT renders, a rail
// click switches the section (store → CONTENT/LIST slots), the topbar panel toggle collapses a panel
// via the §11.1 clamp-overlay (data-panel-mode + zero rendered width, not just a class string), the
// focus toggle drives immersive ⇄ command-center, and a footer modal trigger opens the paired
// MODAL_SLOTS dialog. The MOBILE block (L6/J12 · D62 P3) covers the bottom-tab-bar reflow at a mobile
// viewport: the curated four tabs, land-on-CONTENT, and the "You" bottom sheet + its overflow/handoff.
// Each test gets a fresh page (isolated localStorage) so the store starts default.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { MESSAGE_ROLES } from "@orb/kit/message-role";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { ShellCascadeFixture } from "../_cascade-fixtures";
import { AppShellStory, AppShellWidthProbeStory } from "../_ct-stories";

// Below the shell's `@media (max-width: 48rem)` breakpoint (768px) — the bottom-bar layout (L6/J12).
const MOBILE = { width: 390, height: 844 };

test("default renders the chats content pane inside the frame", async ({ mount }) => {
  const shell = await mount(<AppShellStory />);
  await expect(shell.getByText("chats content pane")).toBeVisible();
  // The rail nav is present (exact — "Chats" is a substring of the panel's "Collapse Chats panel").
  await expect(shell.getByRole("button", { name: "Chats", exact: true })).toBeVisible();
});

test("a rail click switches the section's CONTENT + LIST slots", async ({ mount, page }) => {
  const shell = await mount(<AppShellStory />);
  await shell.getByRole("button", { name: "Corpus" }).click();
  await expect(page.getByText("corpus content pane")).toBeVisible();
  await expect(page.getByText("corpus list pane")).toBeVisible();
  await expect(page.getByText("chats content pane")).toHaveCount(0);
});

test("the topbar toggle collapses the list panel to zero rendered width (clamp-overlay)", async ({
  mount,
  page,
}) => {
  const shell = await mount(<AppShellStory />);
  const listPanel = page.locator('.shell-panel[data-panel-side="list"]');
  await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");
  const dockedWidth = (await listPanel.boundingBox())?.width ?? 0;
  expect(dockedWidth).toBeGreaterThan(0);

  await shell.getByRole("button", { name: "Hide list panel" }).click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "collapsed");
  // Collapsed = translated fully off its left edge (behind the ~56px rail): its RIGHT edge settles at
  // ≤ the rail width, so it overlaps zero of CONTENT (the §11.1 clamp-overlay "no reflow" property —
  // the panel keeps its clamp width, it is just translated out of view). Poll past the slide-out
  // transition. Plus removed from AT via inert/aria-hidden.
  await expect
    .poll(async () => {
      const b = await listPanel.boundingBox();
      return (b?.x ?? -9999) + (b?.width ?? 0);
    })
    .toBeLessThanOrEqual(57);
  await expect(listPanel).toHaveAttribute("aria-hidden", "true");
});

test("the focus toggle collapses both panels (immersive) then restores (command-center)", async ({
  mount,
  page,
}) => {
  const shell = await mount(<AppShellStory />);
  const listPanel = page.locator('.shell-panel[data-panel-side="list"]');
  const contextPanel = page.locator('.shell-panel[data-panel-side="context"]');

  // Default: list docked, context collapsed → NOT immersive → the button offers "Enter focus mode".
  await shell.getByRole("button", { name: "Enter focus mode" }).click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "collapsed");
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "collapsed");

  // Now immersive → the button offers "Exit focus mode" → both dock (command-center).
  await shell.getByRole("button", { name: "Exit focus mode" }).click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "docked");
});

test("a footer modal trigger opens the paired MODAL_SLOTS dialog", async ({ mount, page }) => {
  const shell = await mount(<AppShellStory />);
  await shell.getByRole("button", { name: "Settings" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // The paired MODAL_SLOTS.settings body — title + its unique placeholder description.
  await expect(dialog).toContainText("Settings");
  await expect(dialog).toContainText("App + user settings");
  // Close returns to no dialog.
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

// ── MOBILE (L6/J12 · D62 P3) — the bottom-tab-bar reflow ─────────────────────────────────────────

test("landmark uniqueness: exactly ONE main, distinct complementary labels, one nav", async ({
  mount,
  page,
}) => {
  await mount(<AppShellStory />);

  // Exactly ONE main landmark (CONTENT)
  await expect(page.getByRole("main")).toHaveCount(1);

  // The nav landmark (the rail) has aria-label="Primary"
  await expect(page.getByRole("navigation", { name: "Primary", exact: true })).toBeVisible();

  // The complementary landmarks (asides) must have distinct accessible names
  // In default chats layout, it's "Chats list" and "Chats details"
  await expect(page.getByRole("complementary", { name: "Chats list", exact: true })).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Chats details", exact: true, includeHidden: true }),
  ).toBeAttached();

  // No unnamed complementary landmarks, and all labels are distinct
  const allComplementary = page.getByRole("complementary", { includeHidden: true });
  const count = await allComplementary.count();
  const namePromises: Promise<string | null>[] = [];
  for (let i = 0; i < count; i++) {
    namePromises.push(allComplementary.nth(i).getAttribute("aria-label"));
  }
  const names = await Promise.all(namePromises);
  for (const name of names) {
    expect(name).toBeTruthy();
  }
  // Uniqueness: no two asides share the same accessible name
  expect(new Set(names).size).toBe(names.length);
});

// ── MOBILE (L6/J12 · D62 P3) — the bottom-tab-bar reflow ─────────────────────────────────────────

test("mobile: the bottom bar is the curated four; overflow + footer affordances are off the bar", async ({
  mount,
  page,
}) => {
  await page.setViewportSize(MOBILE);
  const shell = await mount(<AppShellStory />);

  // The four thumb-reach tabs render as named buttons.
  await Promise.all(
    ["Chats", "Characters", "Corpus", "You"].map((name) =>
      expect(shell.getByRole("button", { name, exact: true })).toBeVisible(),
    ),
  );
  // The overflow sections + the desktop footer triggers are NOT on the bar (they live in the You sheet).
  // display:none on the desktop block removes them from the a11y tree entirely.
  await expect(page.getByRole("button", { name: "Refinery" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Analytics" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Switch theme" })).toHaveCount(0);
});

test("mobile: you land on CONTENT — the list panel is collapsed, not an open sheet", async ({
  mount,
  page,
}) => {
  await page.setViewportSize(MOBILE);
  await mount(<AppShellStory />);
  // Mobile resolves the list to a closed sheet (collapsed), never the persisted desktop dock — the
  // correct landing is CONTENT (chats pane visible), not a menu.
  const listPanel = page.locator('.shell-panel[data-panel-side="list"]');
  await expect(listPanel).toHaveAttribute("data-panel-mode", "collapsed");
  await expect(page.getByText("chats content pane")).toBeVisible();
});

test("mobile: a tab click switches the section", async ({ mount, page }) => {
  await page.setViewportSize(MOBILE);
  const shell = await mount(<AppShellStory />);
  await shell.getByRole("button", { name: "Corpus", exact: true }).click();
  await expect(page.getByText("corpus content pane")).toBeVisible();
  await expect(page.getByText("chats content pane")).toHaveCount(0);
});

test("mobile: the You tab opens the sheet; an overflow section routes and closes it", async ({
  mount,
  page,
}) => {
  await page.setViewportSize(MOBILE);
  const shell = await mount(<AppShellStory />);
  await shell.getByRole("button", { name: "You", exact: true }).click();

  // The sheet holds account/settings/theme + the overflow sections (Refinery/Analytics reachable HERE).
  await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Theme" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Account" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Refinery" })).toBeVisible();

  // Tapping an overflow section switches the active section AND closes the sheet (setActiveSection +
  // closeModal), landing on that section's distinct placeholder copy.
  await page.getByRole("button", { name: "Analytics" }).click();
  await expect(page.getByRole("button", { name: "Settings" })).toHaveCount(0);
  await expect(page.getByText("Charts over your corpus land here", { exact: false })).toBeVisible();
});

test("mobile: the You sheet hands off to Settings in the shared modal slot (single-slot layered)", async ({
  mount,
  page,
}) => {
  await page.setViewportSize(MOBILE);
  const shell = await mount(<AppShellStory />);
  await shell.getByRole("button", { name: "You", exact: true }).click();
  // Opening Settings REPLACES the You sheet in the shared openModal slot (not a nested modal): the You
  // rows disappear, the Settings modal body appears.
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByText("App + user settings")).toBeVisible();
  // The You-sheet overflow row is gone (the slot now holds Settings, not You).
  await expect(page.getByRole("button", { name: "Refinery" })).toHaveCount(0);
});

// ── Cascade-contract: glass/background beats elevation (the rendered cascade, not source text) ──
// shell.css's `data-elevation="ramp"` fills are unlayered plain CSS living alongside globals.css's
// `data-blur-*` glass rules and `data-has-bg-image` transparency rules — all three are specificity-
// ranked, not `@layer`-ranked, so a regression here is a silent specificity flip, not a syntax error.
// `ShellCascadeFixture` stamps the SAME classes/attrs/slots production stamps (data-blur-* via the
// real `useAppearanceRootEffects` hook on `document.documentElement`, data-elevation/data-has-bg-image
// on `.shell-grid`) and these assert the real computed cascade in a browser.

/** `getComputedStyle().backgroundColor` for a `color-mix(in oklab, …)` result serializes as the
 *  modern space-separated function with a trailing `/ <alpha>)` (e.g. `"oklab(0.13 0 0 / 0.7)"`); a
 *  literal `transparent`/legacy `rgba()` keeps the comma form (`"rgba(0, 0, 0, 0)"`); a fully opaque
 *  color (the elevation/baseline fills) carries no alpha component at all. Checked live (both forms
 *  observed in this codebase's actual computed output) rather than assumed from the CSSOM spec text. */
function bgAlpha(locator: Locator): Promise<number> {
  return locator.evaluate((el) => {
    const bg = getComputedStyle(el).backgroundColor;
    // This arrow body is serialized into a page.evaluate() browser closure — it can't reference a
    // module-level const (evaluate ships only the function's own source, no outer-scope capture).
    // biome-ignore lint/performance/useTopLevelRegex: literals must live right here, see above.
    const slashMatch = bg.match(/\/\s*([\d.]+)\s*\)$/u);
    if (slashMatch !== null) {
      return Number(slashMatch[1]);
    }
    if (bg.startsWith("rgba(") || bg.startsWith("hsla(")) {
      // biome-ignore lint/performance/useTopLevelRegex: same closure constraint as above.
      const commaMatch = bg.match(/,\s*([\d.]+)\s*\)$/u);
      return commaMatch !== null ? Number(commaMatch[1]) : 1;
    }
    return 1;
  });
}

function backdropFilterOf(locator: Locator): Promise<string> {
  return locator.evaluate((el) => getComputedStyle(el).backdropFilter);
}

test("baseline (flat, no glass, no bg-image): surfaces are opaque, no backdrop-filter", async ({
  mount,
}) => {
  const shell = await mount(<ShellCascadeFixture />);
  await expect.poll(() => bgAlpha(shell.getByTestId("panel-probe"))).toBe(1);
  await expect.poll(() => bgAlpha(shell.getByTestId("main-probe"))).toBe(1);
  await expect.poll(() => bgAlpha(shell.getByTestId("topbar-probe"))).toBe(1);
  await expect.poll(() => backdropFilterOf(shell.getByTestId("panel-probe"))).toBe("none");
});

test("glass beats elevation: ramp + blur-panels still leaves .shell-panel translucent", async ({
  mount,
}) => {
  const shell = await mount(<ShellCascadeFixture elevation="ramp" blurSurfaces={["panels"]} />);
  const panel = shell.getByTestId("panel-probe");
  // THE BUG: shell.css's un-:where()'d elevation rule used to out-specificity globals.css's glass
  // rule, so the panel painted the OPAQUE --color-surface-raised elevation fill instead of the
  // translucent glass mix even with blur-panels on. This is the exact assertion that regression flips.
  await expect.poll(() => bgAlpha(panel)).toBeLessThan(1);
  await expect.poll(() => backdropFilterOf(panel)).toContain("blur(");
  await expect.poll(() => backdropFilterOf(panel)).toContain("saturate(");
});

test("glass beats elevation on composer and both dialog popup slots", async ({ mount }) => {
  const shell = await mount(
    <ShellCascadeFixture elevation="ramp" blurSurfaces={["composer", "modals"]} />,
  );
  const composer = shell.getByTestId("composer-probe");
  await expect.poll(() => bgAlpha(composer)).toBeLessThan(1);
  await expect.poll(() => backdropFilterOf(composer)).toContain("blur(");

  const dialog = shell.getByTestId("dialog-probe");
  const alertDialog = shell.getByTestId("alert-dialog-probe");
  await expect.poll(() => bgAlpha(dialog)).toBeLessThan(1);
  await expect.poll(() => bgAlpha(alertDialog)).toBeLessThan(1);
});

for (const role of MESSAGE_ROLES) {
  test(`glass beats elevation on a "${role}" message bubble (denser reading-surface fill)`, async ({
    mount,
  }) => {
    const shell = await mount(
      <ShellCascadeFixture elevation="ramp" blurSurfaces={["messages"]} messageRole={role} />,
    );
    // The bubble fill is the DENSER --blur-fill-dense mix (a reading surface, per globals.css) — still
    // strictly translucent, never opaque, for every role's own base tone.
    await expect.poll(() => bgAlpha(shell.getByTestId("bubble-probe"))).toBeLessThan(1);
    await expect.poll(() => backdropFilterOf(shell.getByTestId("bubble-probe"))).toContain("blur(");
  });
}

test("elevation alone (glass off) leaves .shell-panel opaque — glass is what flips it, not ramp", async ({
  mount,
}) => {
  const shell = await mount(<ShellCascadeFixture elevation="ramp" />);
  // Matrix cell: ramp × glass-off. Elevation-ramp's own fill (--color-surface-raised) is opaque —
  // confirms the translucency above comes from the glass rule winning, not from ramp itself.
  await expect.poll(() => bgAlpha(shell.getByTestId("panel-probe"))).toBe(1);
});

test("background-image beats elevation: .shell-main goes transparent, .shell-topbar stays opaque", async ({
  mount,
}) => {
  const shell = await mount(<ShellCascadeFixture elevation="ramp" hasBgImage={true} />);
  // THE BUG: shell.css's un-:where()'d elevation rule for .shell-main used to out-specificity the
  // has-bg-image transparent rule, burying the fixed <ThemeBackgroundLayer> under an opaque
  // --color-card fill even with an image set. This is the exact assertion that regression flips.
  await expect.poll(() => bgAlpha(shell.getByTestId("main-probe"))).toBe(0);
  // .shell-topbar was deliberately EXCLUDED from the transparent rule — chrome stays legible.
  await expect.poll(() => bgAlpha(shell.getByTestId("topbar-probe"))).toBe(1);
});

test("elevation alone (bg-image off) leaves .shell-main opaque — bg-image is what flips it, not ramp", async ({
  mount,
}) => {
  const shell = await mount(<ShellCascadeFixture elevation="ramp" />);
  // Matrix cell: ramp × bg-off. Elevation-ramp's own fill (--color-card) is opaque — confirms the
  // transparency above comes from has-bg-image winning, not from ramp itself.
  await expect.poll(() => bgAlpha(shell.getByTestId("main-probe"))).toBe(1);
});

test("useAppearanceRootEffects lands a representative axis on <html> as a real computed effect", async ({
  mount,
  page,
}) => {
  await mount(<ShellCascadeFixture fontScale={1.25} />);
  // globals.css's `:root { font-size: calc(100% * var(--font-scale)) }` floor reads this custom
  // property — proves the root-stamp hook actually reaches computed style, not just a JS assignment.
  const fontScale = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--font-scale").trim(),
  );
  expect(fontScale).toBe("1.25");
});

// ── chatWidthPct / fontScale root vars — through the REAL AppShell (§11.1), not the bare fixture ──
// `useAppearance()` reads the synced `getUserSettings` blob (routeTrpc-stubbed here) — this exercises
// the actual production stamping path (app-shell.tsx's `--width-shell-content` inline style +
// `useAppearanceRootEffects`'s `--font-scale`), not a re-implementation of the clamp/scale formulas.

// The one browser-default constant this file leans on (no token exists for it — same precedent as
// avatar.ct.tsx's ROOT_PX): the UA root font-size before any `:root { font-size }` override.
const UA_ROOT_PX = 16;

test("chatWidthPct stamps a real rendered max-width on a --width-shell-content consumer", async ({
  mount,
  page,
}) => {
  const chatWidthPct = 90; // clear of the clamp's 680px floor at any CT viewport ≥ 756px wide.
  await routeTrpc(page, {
    "settings.getUserSettings": () => ({
      userId: "user_ct_shell_width",
      schemaVersion: 1,
      config: {
        ...DEFAULT_USER_SETTINGS,
        appearance: { ...DEFAULT_USER_SETTINGS.appearance, chatWidthPct },
      },
      updatedAt: 0,
    }),
  });
  const shell = await mount(<AppShellWidthProbeStory />);
  const viewportWidth = page.viewportSize()?.width ?? 0;
  expect(viewportWidth).toBeGreaterThan(0);
  // The COMPUTED `max-width` (the browser's own dvw→px resolution of the clamp formula) — not the
  // rendered box width, which the CONTENT column's own (narrower, panel-shared) available space also
  // bounds. This isolates the one thing under test: the --width-shell-content var reaching the probe.
  const computedMaxWidthPx = await shell
    .getByTestId("width-probe")
    .evaluate((el) => Number.parseFloat(getComputedStyle(el).maxWidth));
  const expectedPx = (chatWidthPct / 100) * viewportWidth;
  expect(computedMaxWidthPx).toBeCloseTo(expectedPx, 0);
});

test("fontScale stamps a real rendered <html> font-size (UA root × fontScale)", async ({
  mount,
  page,
}) => {
  const fontScale = 1.25;
  await routeTrpc(page, {
    "settings.getUserSettings": () => ({
      userId: "user_ct_shell_fontscale",
      schemaVersion: 1,
      config: {
        ...DEFAULT_USER_SETTINGS,
        appearance: { ...DEFAULT_USER_SETTINGS.appearance, fontScale },
      },
      updatedAt: 0,
    }),
  });
  await mount(<AppShellStory />);
  await expect
    .poll(() =>
      page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize)),
    )
    .toBeCloseTo(UA_ROOT_PX * fontScale, 0);
});
