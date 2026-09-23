// ShellTopbar LIST-PANE CAPABILITY CT (owner decision) — the shell
// learned that a section can declare it HAS NO list pane. What this pins is the defect it exists to
// prevent: on such a section the topbar must render NO list toggle at all, so the app's front door can
// never open a panel reading "Home list — this surface isn't wired yet". Every other section is untouched.
//
// Driven through the REAL shell + the REAL section registry, so it is the shipped `panels.list` field
// being read, not a hand-fed prop.

import { expect, test } from "@playwright/experimental-ct-react";
import { AppShellOnSectionStory } from "../_ct-stories.tsx";

const LIST_TOGGLE_RE = /^(?:(?:Show|Hide) list panel|Show .+ (?:list|overview))$/u;

test("home declares no LIST pane, so the topbar renders NO list toggle", async ({ mount }) => {
  const shell = await mount(<AppShellOnSectionStory section="home" />);

  await expect(shell.getByRole("button", { name: LIST_TOGGLE_RE })).toHaveCount(0);
  // …and the pane track stays collapsed — no half-open panel behind a missing control.
  await expect(shell.locator(".shell-grid")).toHaveAttribute("data-list-mode", "collapsed");
});

test("chats still has its list toggle — the capability is per-section, not a global removal", async ({ mount }) => {
  const shell = await mount(<AppShellOnSectionStory section="chats" />);

  await expect(shell.getByRole("button", { name: LIST_TOGGLE_RE })).toHaveCount(1);
});

// ── THE PHONE ARM SPEAKS SCREENS, NOT PANELS (side-eye 2026-08-07 finding 4 · §14) ───────────────────
// "Hide list panel" names a REGION of a three-track desktop frame. A phone has no
// such region: `resolvePanelMode` pins the LIST `docked` with nothing selected, so the roster IS the
// screen and this control swaps which of the section's two screens is showing. The control is otherwise
// UNCHANGED — the same wiring and the same ruled reachability (it is the only phone door to a section's
// no-selection CONTENT, `state/panel-resolve.ts`'s owner-ruled mobile one-shell rule) — this pins the
// words only. Driven at BOTH phone widths under a real coarse pointer, because a fine-pointer viewport
// renders a layout no phone produces.
//
// THE CONTEXT TOGGLE NO LONGER FORKS (#875 F19, 2026-08-30): one control may not carry two accessible
// names, so it says "Show details"/"Hide details" at every width. This fork SURVIVES for the LIST toggle
// because its two names name two different DESTINATIONS on a phone, not two words for one region.

const PHONE_WIDTHS = [320, 375] as const;

// PANEL_WORD is the negative assertion: the desktop-frame noun must not appear in the phone lead control.
const PANEL_WORD = /panel/u;
const DESKTOP_LIST_TOGGLE = /list panel$/u;

test.describe("phone vocabulary", () => {
  test.use({ hasTouch: true });

  for (const width of PHONE_WIDTHS) {
    test(`@${width}: the lead control names the SCREEN it opens, never the panel it hides`, async ({ mount, page }) => {
      await page.setViewportSize({ width, height: 640 });
      const shell = await mount(<AppShellOnSectionStory section="chats" />);
      // The emulation is PROVEN before any vocabulary is trusted (the touch-target-floor precedent).
      await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);

      const toggle = shell.getByRole("button", { name: LIST_TOGGLE_RE });
      await expect(toggle).toHaveCount(1);
      // Nothing is selected in this story, so the roster is the screen and the tap lands on CONTENT.
      await expect(toggle).toHaveAccessibleName("Show Chats overview");
      await toggle.click();
      // …and back the other way, still naming a destination rather than a frame region.
      await expect(shell.getByRole("button", { name: LIST_TOGGLE_RE })).toHaveAccessibleName("Show Chats list");

      // The desktop spelling is GONE from this arm — it is what the finding was about.
      await expect(shell.getByRole("button", { name: PANEL_WORD })).toHaveCount(0);
    });
  }
});

// The other half of "applicability, not a mode": a fine pointer at a DESKTOP width keeps the frame
// vocabulary, which is correct there — the panel is a visible region and "hide it" is literally what happens.
test("a fine pointer keeps the desktop frame vocabulary", async ({ mount }) => {
  const shell = await mount(<AppShellOnSectionStory section="chats" />);

  await expect(shell.getByRole("button", { name: LIST_TOGGLE_RE })).toHaveAccessibleName(DESKTOP_LIST_TOGGLE);
});
