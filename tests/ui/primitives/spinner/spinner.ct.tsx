// <WebSpinner> CT — the ONE loader system's contract (docs/design/login-loading-screen.md §9.10):
//   • a role=status live region carrying the accessible label (same seal as the legacy Spinner);
//   • the sm/md/lg px table MATCHES the legacy Spinner's ICON table (16/20/24) — the parity that
//     makes the follow-up Loader2 swap call-shape identical;
//   • it ANIMATES by default (the slow orb spin on the svg + the silk pulse on the spiral, with the
//     dash pattern present only while animating);
//   • reduced motion renders the STATIC glyph — computed `animation-name: none` AND a solid spiral
//     (no dash), the JS REMOVE arm (guide §3.9), not the 0.01ms CSS floor.

import { WebSpinner } from "@orb/ui/spinner";
import { expect, test } from "@playwright/experimental-ct-react";

// The legacy-parity size table (ICON_SM/MD/LG — §9.10).
const SM_PX = 16;
const MD_PX = 20;
const LG_PX = 24;
const HERO_PX = 48;

test("is a role=status live region carrying the accessible label", async ({ mount, page }) => {
  await mount(<WebSpinner label="Saving changes" />);
  const status = page.getByRole("status");
  await expect(status).toHaveText("Saving changes");
});

test("sm/md/lg render the legacy Spinner's 16/20/24 px (the drop-in swap contract) and hero scales up", async ({ mount, page }) => {
  const component = await mount(<WebSpinner label="Loading" size="sm" />);
  await expect(page.locator("svg")).toHaveCSS("width", `${SM_PX}px`);
  await component.update(<WebSpinner label="Loading" size="md" />);
  await expect(page.locator("svg")).toHaveCSS("width", `${MD_PX}px`);
  await component.update(<WebSpinner label="Loading" size="lg" />);
  await expect(page.locator("svg")).toHaveCSS("width", `${LG_PX}px`);
  await component.update(<WebSpinner label="Loading" size="hero" />);
  await expect(page.locator("svg")).toHaveCSS("width", `${HERO_PX}px`);
});

test("animates by default: the orb spin on the svg, the WEAVE loop (with its dash) on the spiral", async ({ mount, page }) => {
  await mount(<WebSpinner label="Loading" size="lg" />);
  const root = page.locator('[data-slot="web-spinner"]');
  await expect(root).toHaveAttribute("data-animate", "");
  const svgAnimation = await page.locator("svg").evaluate((el) => getComputedStyle(el).animationName);
  // ONESHOT-OK: animationName is a static style-rule resolution, not settling async state.
  expect(svgAnimation).toBe("orb-web-spin");
  const spiral = page.locator("svg .orb-web-pulse");
  const spiralStyle = await spiral.evaluate((el) => {
    const s = getComputedStyle(el);
    return { animation: s.animationName, dash: s.strokeDasharray, offset: s.strokeDashoffset };
  });
  // ONESHOT-OK: same — declared-rule reads, no transition in flight.
  expect(spiralStyle.animation).toBe("orb-web-weave");
  // ONE dash as long as the whole spiral — that is what makes the loop DRAW THE SILK OUT rather than
  // running a lit segment along it (the shipped pulse was `12px <gap>`, two values).
  expect(spiralStyle.dash).not.toBe("none");
  expect(spiralStyle.dash.split(",")).toHaveLength(1);
  const spiralLength = Number.parseFloat(spiralStyle.dash);
  // The offset is mid-flight (the loop is running), so assert what a running weave looks like: it is
  // somewhere inside [0, length] now, and it has MOVED a few frames later.
  const offsetNow = Number.parseFloat(spiralStyle.offset);
  expect(offsetNow).toBeGreaterThanOrEqual(0);
  expect(offsetNow).toBeLessThanOrEqual(spiralLength);
  await expect.poll(async () => spiral.evaluate((el) => getComputedStyle(el).strokeDashoffset)).not.toBe(spiralStyle.offset);
  // The spokes breathe under it instead of sitting at a fixed dim.
  const spokes = await page.locator("svg .orb-web-spokes").evaluate((el) => getComputedStyle(el).animationName);
  expect(spokes).toBe("orb-web-breathe");
});

test("reduced motion renders the STATIC glyph — no animation, and the spiral is SOLID (no dash)", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mount(<WebSpinner label="Loading" size="lg" />);
  const root = page.locator('[data-slot="web-spinner"]');
  await expect(root).not.toHaveAttribute("data-animate", "");
  const svgAnimation = await page.locator("svg").evaluate((el) => getComputedStyle(el).animationName);
  // ONESHOT-OK: static style-rule resolution.
  expect(svgAnimation).toBe("none");
  const spiralStyle = await page.locator("svg .orb-web-pulse").evaluate((el) => {
    const s = getComputedStyle(el);
    return { animation: s.animationName, dash: s.strokeDasharray, offset: s.strokeDashoffset };
  });
  // ONESHOT-OK: static style-rule resolution — the REMOVE arm leaves no dash and no animation, so the
  // resting glyph is the FULLY WOVEN web (not a half-drawn spiral frozen mid-loop).
  expect(spiralStyle.animation).toBe("none");
  expect(spiralStyle.dash).toBe("none");
  expect(Number.parseFloat(spiralStyle.offset)).toBe(0);
  const spokes = await page.locator("svg .orb-web-spokes").evaluate((el) => getComputedStyle(el).animationName);
  expect(spokes).toBe("none");
});
