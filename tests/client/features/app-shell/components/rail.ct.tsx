// Rail CT — the persistent nav column in isolation: every section + footer action renders as a real
// <button> with an accessible name (a11y baseline, §4a), the active section carries aria-current, and
// the buttons are keyboard-focusable in order.

import { expect, test } from "@playwright/experimental-ct-react";
import { RailBrandActiveStory, RailBrandNavStory, RailOverflowSectionStory, RailSheetBadgeStory, RailStory } from "../_ct-stories.tsx";

test("renders every section + footer action as a named button; active = aria-current", async ({ mount }) => {
  const rail = await mount(<RailStory />);

  await Promise.all(["Chats", "Characters", "Corpus", "Refinery", "Analytics"].map((name) => expect(rail.getByRole("button", { name })).toBeVisible()));
  await expect(rail.getByRole("button", { name: "Switch theme" })).toBeVisible();
  await expect(rail.getByRole("button", { name: "Settings" })).toBeVisible();
  await expect(rail.getByRole("button", { name: "Account" })).toBeVisible();

  // Active section (chats) is marked current; a sibling is not.
  await expect(rail.getByRole("button", { name: "Chats" })).toHaveAttribute("aria-current", "page");
  await expect(rail.getByRole("button", { name: "Corpus" })).not.toHaveAttribute("aria-current");
});

// ── The BRAND cell as home's affordance (home-section-spec §4.1) ───────────────────────────────────
// The glyph used to be a decorative `aria-hidden` div. It is now a REAL named button, derived from the
// `rail.brand` chrome entry the HOME section declares — app-shell still never spells a section id.

test("the brand glyph is a real named affordance, not a decorative aria-hidden div", async ({ mount }) => {
  const rail = await mount(<RailStory />);

  const brand = rail.getByRole("button", { name: "Home" });
  await expect(brand).toBeVisible();
  await expect(rail.locator(".shell-rail-brand[aria-hidden]")).toHaveCount(0);
  // Home's affordance is the BRAND cell, so it gets NO second nav button (one affordance per section).
  await expect(rail.locator(".shell-rail-sections").getByRole("button", { name: "Home" })).toHaveCount(0);
});

test("the brand carries aria-current when home is the active section", async ({ mount }) => {
  const rail = await mount(<RailBrandActiveStory />);

  await expect(rail.getByRole("button", { name: "Home" })).toHaveAttribute("aria-current", "page");
  await expect(rail.getByRole("button", { name: "Chats" })).not.toHaveAttribute("aria-current");
});

test("the ACTIVE brand paints — the ember tint and accent bar resolve, not just the data attr", async ({ mount }) => {
  const rail = await mount(<RailBrandActiveStory />);

  const brand = rail.getByRole("button", { name: "Home" });
  const [background, accentWidth, glyphBox] = await brand.evaluate((el) => [
    globalThis.getComputedStyle(el).backgroundColor,
    globalThis.getComputedStyle(el, "::before").width,
    el.querySelector("svg")?.getBoundingClientRect().width ?? 0,
  ]);
  // A transparent background would mean the active skin never landed (the tint is a color-mix over primary).
  expect(background).not.toBe("rgba(0, 0, 0, 0)");
  expect(Number.parseFloat(accentWidth)).toBeGreaterThan(0);
  // The glyph must not collapse inside the button's flex box.
  expect(glyphBox).toBeGreaterThan(0);
});

test("the brand's icon COLOUR carries the state, like every nav sibling — no always-ember glyph", async ({ mount }) => {
  // side-eye F5: the glyph painted `--color-primary` unconditionally, so it advertised "you are home"
  // from every other section and the active state had no delta at all. It now takes the nav zone's
  // grammar: muted at rest, ember when active.
  const readGlyphColor = (el: SVGElement | HTMLElement): string => globalThis.getComputedStyle(el).color;

  // RailStory's active section is chats: the brand rests, a nav sibling is active.
  const resting = await mount(<RailStory />);
  const restColor = await resting.getByRole("button", { name: "Home" }).evaluate(readGlyphColor);
  const navActiveColor = await resting.getByRole("button", { name: "Chats" }).evaluate(readGlyphColor);
  await resting.unmount();

  const active = await mount(<RailBrandActiveStory />);
  const activeColor = await active.getByRole("button", { name: "Home" }).evaluate(readGlyphColor);

  expect(restColor).not.toBe(activeColor);
  // PARITY: the active brand resolves to the same ember the active nav buttons use — one state grammar.
  expect(activeColor).toBe(navActiveColor);
});

test("clicking the glyph fires setActiveSection('home') — assert the STORE, not a rendered echo", async ({ mount }) => {
  const rail = await mount(<RailBrandNavStory />);
  const probe = rail.locator("output");
  await expect(probe).not.toHaveText("section=home");

  await rail.getByRole("button", { name: "Home" }).click();
  await expect(probe).toHaveText("section=home");
});

test("rail buttons are keyboard-focusable", async ({ mount }) => {
  const rail = await mount(<RailStory />);
  const chats = rail.getByRole("button", { name: "Chats" });
  await chats.focus();
  await expect(chats).toBeFocused();
});

// ── A TAB THAT IS NOT THE PAGE DOES NOT SAY IT IS (side-eye leg-4 P2) ────────────────────────────────
// Standing in a `mobile:"sheet"` section, the You tab used to carry `aria-current="page"` — so a reader
// heard "You, current page" while looking at the Corpus roster (five sections: corpus · presets ·
// analytics · refinery · databank). The sighted HINT survives; the claim does not. Where-am-I for those
// sections is answered by the topbar, which names the section and reads before this nav on a phone.
// The You tab is `mobileOnly` — `display:none` on the desktop icon column — so this reads it where it
// exists: the bottom bar. (Mobile geometry needs the coarse pointer; the tab's own reflow rules are keyed
// off the shell's one viewport @media, and `hasTouch` is what makes Chromium report `pointer: coarse`.)
test.describe("the mobile bottom bar", () => {
  test.use({ viewport: { width: 320, height: 800 }, hasTouch: true });

  // ── THE PHONE'S ONLY UNREAD SIGNAL (#214 residue, side-eye home re-score 2026-08-18) ─────────────
  // A `topbar.trail` widget curated `mobile:"sheet"` leaves the phone's chrome for the You sheet. That is
  // right for the row's budget and it cost the inbox its TELL: the desktop bell badges the unread count,
  // and the phone showed nothing anywhere — the feature was reachable, but a user was never told there
  // was anything in it. The tab that hosts the sheet badges the sheet's own signal, derived through the
  // same projection (never a hardcoded feature read — app-shell cannot import one).
  test("the You tab badges a sheet-hosted widget's waiting count, and skips a gated one", async ({ mount }) => {
    const rail = await mount(<RailSheetBadgeStory />);
    const you = rail.getByRole("button", { name: "You", exact: true });

    await expect(you).toBeVisible();
    await expect(you.locator('[data-slot="badge"]')).toHaveText("3");
    // The count is announced when it lands — the tab's own NAME cannot carry it (a name is a string the
    // parent holds, and these counts arrive through a per-entry hook), so the signal is a live region.
    await expect(you.getByRole("status")).toHaveText("3 unread");
    // A `useVisible: false` entry contributes NOTHING: one badge on the tab, not two, and never the
    // hidden entry's 9.
    await expect(you.locator('[data-slot="badge"]')).toHaveCount(1);
  });

  test("the You tab HINTS at an overflow section without claiming to be the current page", async ({ mount }) => {
    const rail = await mount(<RailOverflowSectionStory />);
    const you = rail.getByRole("button", { name: "You", exact: true });

    await expect(you).toBeVisible();
    await expect(you).not.toHaveAttribute("aria-current", "page");
    // …and the visual hint is still there, so the bar does not read as five unlit tabs in a fifth place.
    await expect(you).toHaveAttribute("data-contains-current", "");
  });

  // #86 lead 3. The bar's labels are the PRIMARY names of primary-nav controls, and they rode `micro`
  // (10.5px) — the ramp's kicker/gloss step, and under the design-audit interactive-text floor
  // (`undersized-ui-text` ×4 on the home route at coarse pointer). The ramp has no step between `micro` and
  // `label`; D5 refused minting an 11px one, so `label` is the assignment. Asserted against the token
  // RESOLVED IN THIS DOCUMENT, never a px literal: a ramp retune must not red this, and a regression to
  // `micro` must.
  test("a tab label rides the LABEL step of the ramp, not the micro one", async ({ mount }) => {
    const rail = await mount(<RailStory />);
    const label = rail.locator(".shell-rail-button-label").first();
    await expect(label).toBeVisible();

    await expect
      .poll(() =>
        label.evaluate((el) => {
          const probe = el.ownerDocument.createElement("div");
          el.ownerDocument.body.append(probe);
          const stepPx = (token: string): number => {
            probe.style.fontSize = `var(${token})`;
            return Number.parseFloat(globalThis.getComputedStyle(probe).fontSize);
          };
          const resolved = Number.parseFloat(globalThis.getComputedStyle(el).fontSize);
          const verdict = { onLabelStep: resolved === stepPx("--text-label"), aboveMicroStep: resolved > stepPx("--text-micro") };
          probe.remove();
          return verdict;
        }),
      )
      .toEqual({ onLabelStep: true, aboveMicroStep: true });
  });

  // The step-up costs width, and 320px is the narrowest real phone: a label that outgrows its tab either
  // wraps the 56px bar or spills into its neighbour. Measured, not assumed.
  test("no tab label outgrows its tab at the narrowest phone", async ({ mount }) => {
    const rail = await mount(<RailStory />);
    const labels = rail.locator(".shell-rail-button-label");
    await expect(labels.first()).toBeVisible();
    // The pin is the OFFENDER LIST, polled to empty: naming the labels that break makes the failure
    // message the diagnosis, and an empty list cannot pass by the locator resolving to nothing (the
    // visibility barrier above already proved the bar rendered).
    await expect
      .poll(() =>
        labels.evaluateAll((elements) =>
          elements
            .filter((el) => {
              const buttonRect = el.closest(".shell-rail-button")?.getBoundingClientRect();
              const labelRect = el.getBoundingClientRect();
              // Wider than its tab, or taller than one line — the two ways a bar label breaks.
              const spills = buttonRect === undefined || labelRect.width > buttonRect.width + 0.5;
              const wraps = labelRect.height > Number.parseFloat(globalThis.getComputedStyle(el).fontSize) * 1.6;
              return spills || wraps;
            })
            .map((el) => el.textContent ?? ""),
        ),
      )
      .toEqual([]);
  });
});

test("a section's OWN tab still claims the page when it is the one you are standing in", async ({ mount }) => {
  const rail = await mount(<RailStory />);
  await expect(rail.getByRole("button", { name: "Chats", exact: true })).toHaveAttribute("aria-current", "page");
});
