// Platform checks on the production shell, run on Chromium and on the opt-in `webkit-iphone` project
// (playwright-ct.config.ts). Playwright's WebKit on Linux is not Safari and reports 0 for every safe-area inset,
// so the paid-inset arm is proved on Chromium with an inset override and WebKit records what it reports.
import { expect, test } from "../node/ct-corpus.ts";
import { createShellAmbientReads } from "../node/ct-shell-reads.ts";
import { routeTrpc } from "../node/route-trpc.ts";
import type { ShellAmbientStory } from "./ct-shell-reads-stories.tsx";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const PHONE_PORTRAIT = { width: 390, height: 844 } as const;
const PHONE_LANDSCAPE = { width: 844, height: 390 } as const;
const DESKTOP = { width: 1440, height: 900 } as const;
// The MDN text-scale note asks a page to survive 200% to 300%; 200% is the floor claim here.
const TEXT_SCALE_200 = "2";
const NOTCH_INSET = 47;
const HOME_INDICATOR_INSET = 34;

test.beforeEach(async ({ corpus, page }) => {
  await routeTrpc(page, createShellAmbientReads(corpus));
});

for (const viewport of [PHONE_PORTRAIT, PHONE_LANDSCAPE]) {
  const label = `${String(viewport.width)}x${String(viewport.height)}`;

  test(`env(safe-area-inset-*) parses to lengths at ${label}`, async ({ mount, page }, testInfo) => {
    await page.setViewportSize(viewport);
    await mount<typeof ShellAmbientStory>(STORY, {});
    const reported = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.cssText = "position:fixed;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
      document.body.append(probe);
      const probed = getComputedStyle(probe);
      const insets = { top: probed.paddingTop, right: probed.paddingRight, bottom: probed.paddingBottom, left: probed.paddingLeft };
      probe.remove();
      return insets;
    });
    testInfo.annotations.push({ type: "safe-area", description: JSON.stringify(reported) });
    expect(Object.values(reported).every((side) => /^\d+(\.\d+)?px$/u.test(side))).toBe(true);
  });

  test(`the grid pays the top and side insets at ${label}`, async ({ browserName, mount, page }) => {
    test.skip(browserName !== "chromium", "only Chromium can be given safe-area insets");
    await page.setViewportSize(viewport);
    const sideInset = viewport.width > viewport.height ? NOTCH_INSET : 0;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", {
      insets: { top: NOTCH_INSET, bottom: HOME_INDICATOR_INSET, left: sideInset, right: sideInset },
    });
    await mount<typeof ShellAmbientStory>(STORY, {});
    await expect(page.getByRole("navigation", { name: "Primary", exact: true })).toBeVisible();
    const paid = await page.evaluate(() => {
      const grid = getComputedStyle(document.querySelector(".shell-grid") as Element);
      return { top: grid.paddingTop, right: grid.paddingRight, left: grid.paddingLeft, overflowX: document.documentElement.scrollWidth - innerWidth };
    });
    // The bottom edge is not asserted: the grid reads the static `safe-area-max-inset-bottom`, which the Chromium
    // override leaves at 0. A device reports it; only the dynamic insets can be given here.
    expect(paid).toEqual({ top: `${String(NOTCH_INSET)}px`, right: `${String(sideInset)}px`, left: `${String(sideInset)}px`, overflowX: 0 });
  });
}

for (const viewport of [PHONE_PORTRAIT, DESKTOP]) {
  test(`the shell holds at 200% text scale at ${String(viewport.width)}px wide`, async ({ mount, page }) => {
    await page.setViewportSize(viewport);
    await mount<typeof ShellAmbientStory>(STORY, {});
    // !important: the appearance writer owns the inline value and rewrites it after boot.
    await page.addStyleTag({ content: `:root { --font-scale: ${TEXT_SCALE_200} !important; }` });
    await expect(page.getByRole("navigation", { name: "Primary", exact: true })).toBeVisible();
    const fit = await page.evaluate(() => {
      const rail = document.querySelector("nav[aria-label=Primary]") as HTMLElement;
      const railBox = rail.getBoundingClientRect();
      return {
        rootPx: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
        overflowX: document.documentElement.scrollWidth - innerWidth,
        railInside: railBox.right <= innerWidth && railBox.bottom <= innerHeight,
        railClips: rail.scrollWidth - rail.clientWidth,
        mainInline: (document.querySelector(".shell-main") as HTMLElement).getBoundingClientRect().width,
      };
    });
    expect(fit.rootPx).toBeGreaterThanOrEqual(32);
    expect(fit.overflowX).toBeLessThanOrEqual(0);
    expect(fit.railInside).toBe(true);
    // scrollWidth rounds a fractional width up, so WebKit reads one pixel over a rail that fits.
    expect(fit.railClips).toBeLessThanOrEqual(1);
    expect(fit.mainInline).toBeGreaterThan(0);
  });
}
