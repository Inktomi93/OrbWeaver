// Rail CT — the persistent nav column in isolation: every section + footer action renders as a real
// <button> with an accessible name (a11y baseline, §4a), the active section carries aria-current, and
// the buttons are keyboard-focusable in order.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import {
  RailAnalyticsSectionStory,
  RailBrandActiveStory,
  RailBrandNavStory,
  RailOverflowSectionStory,
  RailSheetBadgeStory,
  RailStory,
} from "../_ct-stories.tsx";

test("renders every section + footer action as a named button; active = aria-current", async ({ mount }) => {
  const rail = await mount(<RailStory />);

  await Promise.all(["Chats", "Characters", "Corpus", "Refinery", "Analytics"].map((name) => expect(rail.getByRole("button", { name })).toBeVisible()));
  // The theme modal retired into Appearance (#866 S4) — the foot is Settings (a SECTION) + the widget.
  await expect(rail.getByRole("button", { name: "Switch theme" })).toHaveCount(0);
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
  await expect.poll(async () => active.getByRole("button", { name: "Home" }).evaluate(readGlyphColor)).not.toBe(restColor);
  // PARITY: the active brand resolves to the same ember the active nav buttons use — one state grammar.
  await expect.poll(async () => active.getByRole("button", { name: "Home" }).evaluate(readGlyphColor)).toBe(navActiveColor);
});

// ── THE RECORDED EXCEPTION'S OWN PROOF (#1790) ──────────────────────────────────────────────────────
// The brand affordance is two DOM nodes (desktop `RailBrand`, mobile `RailButton`), CSS-toggled rather
// than reflowed as one node like every other rail entry (see rail.tsx's header + the block comment at
// its second render site). This is the pin that makes the exception safe: at NO width may both render.
test("the Home affordance is exactly one button at desktop width and at phone width (#1790)", async ({ mount, page }) => {
  const desktopRail = await mount(<RailStory />);
  await expect(desktopRail.getByRole("button", { name: "Home" })).toHaveCount(1);
  await desktopRail.unmount();

  await page.setViewportSize({ width: 375, height: 800 });
  const phoneRail = await mount(<RailStory />);
  await expect(phoneRail.getByRole("button", { name: "Home" })).toHaveCount(1);
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

// ── A TAB THAT IS NOT THE PAGE DOES NOT SAY IT IS (side-eye leg-4 P2, standing) ──────────────────────
// Standing in a `mobile:"sheet"` section, the You tab used to carry `aria-current="page"` — so a reader
// heard "You, current page" while looking at the Corpus roster. That ruling survives; its INPUT is gone
// (#484): the current section now holds a bar slot of its own, so the tab represents nobody and the sighted
// `data-contains-current` hint it wore was deleted with the state that produced it.
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
    // A DOT, NOT A NUMBER (#1815) — the same mark the desktop bell wears since #1798, so notifications have
    // ONE affordance in this app rather than a dot in the topbar and a figure on the tab. The count is not
    // lost: it is spoken, below.
    await expect(you.locator('[data-slot="badge"]')).toHaveText("");
    await expect(you.locator('[data-slot="badge"]')).toHaveAttribute("data-size", "dot");
    // THE LIVE-REGION RULING SURVIVES — ITS INPUT CHANGED (#1129).
    // OLD CONDITION: "the tab's own NAME cannot carry the count (a name is a STRING the parent holds, and
    // these counts arrive through a per-entry hook), so the signal is a live region." Both halves still
    // hold: the count is still announced the moment it lands, and it is still never lifted out of the hook
    // that owns it.
    // NEW CONDITION: the count does not have to be a STRING to be spoken. `aria-describedby` is an ID
    // REFERENCE, so the tab can say what the per-entry hook rendered without ever holding it. That matters
    // because a live region is EPHEMERAL: `aria-label="You"` overrides this button's whole subtree for name
    // computation, so once the announcement had been made the number was unrecoverable — a reader focusing
    // the door a second later, or arriving after the read settled, heard "You" and nothing else, and this is
    // the phone's ONLY rest-state signal for a sheet-hosted inbox (the bell is curated off the phone row,
    // notifications-chrome.tsx — that ruling is untouched and the door stays the You sheet).
    // The spoken text also SAYS WHAT IT COUNTS, from the entry's own registry label — app-shell may not
    // import a feature, so the attribution comes through the same projection as the badge itself.
    // …and the FIGURE SURVIVES WHERE IT IS LOAD-BEARING (#1815). The visible mark went to a dot; this
    // description did not, because for a screen-reader user it IS the rest-state signal and "3" is what
    // decides whether the sheet is worth opening. The word moved from "unread" to "waiting" with
    // `useBadge`'s own widening (`unread || actionable`) — a row that has been READ and still wants a
    // decision is in this count, so "unread" would be a false sentence spoken to the reader who cannot see
    // the rows. "waiting" is the registry contract's own word for this number.
    await expect(you.getByRole("status")).toHaveText("Fake trail widget: 3 waiting");
    await expect(you).toHaveAccessibleDescription("Fake trail widget: 3 waiting");
    // A `useVisible: false` entry contributes NOTHING: one badge on the tab, not two, and never the
    // hidden entry's 9.
    await expect(you.locator('[data-slot="badge"]')).toHaveCount(1);
  });

  test("the You tab claims nothing — it is a door, and the current section is not behind it any more", async ({ mount }) => {
    const rail = await mount(<RailOverflowSectionStory />);
    const you = rail.getByRole("button", { name: "You", exact: true });

    await expect(you).toBeVisible();
    await expect(you).not.toHaveAttribute("aria-current", "page");
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

// ── THE CURRENT SECTION HOLDS A BAR SLOT (#484, owner-ruled) ─────────────────────────────────────────
// The bar renders 4 of 9 sections. Standing in one of the other five, the current section's button was in
// the DOM at 0×0 carrying `aria-current="page"` — AT was told the current page is a control no finger can
// reach, and not one VISIBLE tab was marked. The ruled fix is a SWAP: the current section takes the last
// standing section slot for the duration, and the tab it displaces folds into the You sheet (proven in
// you-sheet.ct.tsx — nothing may become unreachable). 430px is the review's own width; `hasTouch` is what
// makes Chromium report `pointer: coarse`, and the bar's reflow rules are keyed off the shell's @media.
test.describe("the current section on the mobile bar", () => {
  test.use({ viewport: { width: 430, height: 900 }, hasTouch: true });

  /** The names of the tabs a THUMB can actually reach, in bar order — a `display:none` sibling measures 0×0.
   *  Polled by the callers: the claim is about painted geometry, and a name list makes a failure diagnose
   *  itself. */
  const visibleTabNames = (rail: Locator): Promise<string[]> =>
    rail
      .locator(".shell-rail-button, .shell-rail-brand-button")
      .evaluateAll((elements) => elements.filter((el) => el.getBoundingClientRect().width > 0).map((el) => el.getAttribute("aria-label") ?? ""));

  /** …and of those, the ones claiming to BE the page. Exactly one, always. */
  const visibleCurrentNames = (rail: Locator): Promise<string[]> =>
    rail
      .locator('[aria-current="page"]')
      .evaluateAll((elements) => elements.filter((el) => el.getBoundingClientRect().width > 0).map((el) => el.getAttribute("aria-label") ?? ""));

  test("an overflow section (corpus) takes a slot and is the ONE visible current tab", async ({ mount }) => {
    const rail = await mount(<RailOverflowSectionStory />);
    await expect(rail.getByRole("button", { name: "You", exact: true })).toBeVisible();

    const corpus = rail.getByRole("button", { name: "Corpus", exact: true });
    await expect(corpus).toBeVisible();
    await expect(corpus).toHaveAttribute("aria-current", "page");
    await expect.poll(() => visibleCurrentNames(rail)).toEqual(["Corpus"]);
    // The slot it took is the LAST standing one (characters), not the brand or the everyday chats tab.
    await expect.poll(() => visibleTabNames(rail)).toEqual(["Home", "Chats", "Corpus", "You"]);
  });

  test("…and from another group (analytics), by the same derivation", async ({ mount }) => {
    const rail = await mount(<RailAnalyticsSectionStory />);
    await expect(rail.getByRole("button", { name: "You", exact: true })).toBeVisible();

    await expect(rail.getByRole("button", { name: "Analytics", exact: true })).toHaveAttribute("aria-current", "page");
    await expect.poll(() => visibleCurrentNames(rail)).toEqual(["Analytics"]);
    await expect.poll(() => visibleTabNames(rail)).toEqual(["Home", "Chats", "Analytics", "You"]);
  });

  // A FENCE, not a defect proof (it passed before the swap existed): standing in a section that already
  // holds a tab must leave the bar exactly as it was — the swap is for the overflow case alone.
  test("the standing four are untouched when the current section already has a tab", async ({ mount }) => {
    const rail = await mount(<RailStory />);
    await expect(rail.getByRole("button", { name: "You", exact: true })).toBeVisible();

    await expect.poll(() => visibleTabNames(rail)).toEqual(["Home", "Chats", "Characters", "You"]);
    await expect.poll(() => visibleCurrentNames(rail)).toEqual(["Chats"]);
  });
});

test("a section's OWN tab still claims the page when it is the one you are standing in", async ({ mount }) => {
  const rail = await mount(<RailStory />);
  await expect(rail.getByRole("button", { name: "Chats", exact: true })).toHaveAttribute("aria-current", "page");
});
