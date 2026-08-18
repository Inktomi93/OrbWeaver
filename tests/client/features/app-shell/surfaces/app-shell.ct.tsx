// AppShell CT — the composed four-region frame end-to-end: the default chats CONTENT renders, a rail
// click switches the section (store → CONTENT/LIST slots), the topbar panel toggle collapses a panel
// via the §11.1 clamp-overlay (data-panel-mode + zero rendered width, not just a class string), the
// focus toggle drives immersive ⇄ command-center, and a footer modal trigger (derived from the modal
// registry) opens its real body. The MOBILE block (L6/J12 · D62 P3) covers the bottom-tab-bar reflow at a mobile
// viewport: the curated four tabs, land-on-CONTENT, and the "You" bottom sheet + its overflow/handoff.
// Each test gets a fresh page (isolated localStorage) so the store starts default.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { MESSAGE_ROLES } from "@orb/kit/message-role";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import type { SectionId } from "../../../../../packages/client/src/state/shell-store.ts";
import { MODAL_SLOT_IDS } from "../../../../../packages/client/src/state/shell-store.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { makeCharacterSummary } from "../../character/fixtures.ts";
import { chatListResponder, makeChatSummary } from "../../chat/fixtures.ts";
import { ShellCascadeFixture } from "../_cascade-fixtures.tsx";
import {
  AppShellDropGuardStory,
  AppShellMobileRuleStory,
  AppShellOnSectionStory,
  AppShellStory,
  AppShellWidthProbeStory,
  ModalScrollStory,
} from "../_ct-stories.tsx";

/** The thumb-reach budget (L6/J12): rendered mobile-bar buttons (`mobile: "tab"` sections + "You") must
 *  never exceed this — a def flipping to `mobile: "tab"` must not silently balloon the bar. */
const MAX_MOBILE_TAB_BUTTONS = 4;

/** The three PANEL affordances, by accessible name — present iff the active section HAS that panel. */
// The lead/trail toggles speak TWO vocabularies (side-eye 2026-08-07 finding 4, §14): the desktop names the
// frame REGION it hides, the phone names the SCREEN a tap lands on ("Show Chats list"/"Show Chats overview";
// "Show details"/"Hide details"). Same control, same wiring, same reachability — so these matchers, which
// exist to FIND the control regardless of its state, span both arms. A regex covering only the desktop
// spelling would make every mobile `toHaveCount(0)` below pass for the wrong reason.
const LIST_TOGGLE_RE = /^(?:(?:Show|Hide) list panel|Show .+ (?:list|overview))$/u;
const CONTEXT_TOGGLE_RE = /^(?:Show|Hide) (?:detail panel|details)$/u;
const FOCUS_TOGGLE_RE = /focus mode$/u;

// Below the shell's `@media (max-width: 48rem)` breakpoint (768px) — the bottom-bar layout (L6/J12).
const MOBILE = { width: 390, height: 844 };

/** The You sheet's row floor in px, DERIVED from the token a `ListRow` body rides (`min-h-control-md`,
 *  list-row/variants.ts) at its coarse value — never a hardcoded literal (§13.7 contract; the
 *  tests/ui/tokens/index.ct.tsx precedent). 3rem → 48px under `pointer: coarse`. */
const REM_PX = 16;
const SHEET_ROW_FLOOR_PX = Number.parseFloat(TOKENS["spacing.control-md"].value) * REM_PX;

/** The one persona the You-sheet lens projects — it must exist for the roster to have a CURRENT row, which
 *  is where "Playing as" lives (side-eye 2026-08-03 P2). Shaped as `persona.list` returns it. */
const SHEET_PERSONA = {
  id: "persona_ct_you",
  name: "Nova",
  title: null,
  description: "",
  starred: false,
  avatarAssetId: null,
  avatarHash: null,
  metadata: null,
  createdAt: 1,
  updatedAt: 1,
};

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
  // <Activity> pane-keeping (UI-Arch §4a / D62 §4.2 rule 2): the prior section's CONTENT stays MOUNTED so
  // its scroll/virtual/form state survives a rail round-trip — it is HIDDEN (display:none), not unmounted.
  // (Only CONTENT is Activity-kept; LIST/CONTEXT still swap per-section, covered by the §4.2-rule-1 test.)
  await expect(page.getByText("chats content pane")).toBeHidden();
});

test("<Activity> pane-keeping: switching away and back keeps the SAME CONTENT node (state survives)", async ({ mount, page }) => {
  const shell = await mount(<AppShellStory />);
  // Tag the live chats CONTENT node, switch away (it goes hidden, not unmounted), switch back — if the
  // pane had unmounted/remounted the tag would be gone; a surviving tag proves the subtree (and its
  // scroll/virtual/form state) was KEPT mounted across the round-trip (UI-Arch §4a / §4.2 rule 2).
  await page.getByText("chats content pane").evaluate((el) => {
    el.setAttribute("data-activity-probe", "kept");
  });
  await shell.getByRole("button", { name: "Corpus" }).click();
  await expect(page.getByText("corpus content pane")).toBeVisible();
  await expect(page.getByText("chats content pane")).toBeHidden();
  await shell.getByRole("button", { name: "Chats", exact: true }).click();
  await expect(page.getByText("chats content pane")).toBeVisible();
  await expect(page.locator('[data-activity-probe="kept"]')).toHaveText("chats content pane");
});

test("the topbar toggle collapses the list panel to zero rendered width (clamp-overlay)", async ({ mount, page }) => {
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
    .poll(
      async () => {
        const b = await listPanel.boundingBox();
        return (b?.x ?? -9999) + (b?.width ?? 0);
      },
      { intervals: [20, 50, 100] },
    )
    .toBeLessThanOrEqual(57);
  await expect(listPanel).toHaveAttribute("aria-hidden", "true");
});

test("CONTEXT follows the active section (§4.2 rule 1): a rail switch swaps the panel body, never leaking the previous section's detail", async ({
  mount,
  page,
}) => {
  await mount(<AppShellStory />);
  const contextPanel = page.locator('.shell-panel[data-panel-side="context"]');
  const panelText = (): Promise<string> => contextPanel.evaluate((el) => el.textContent ?? "");

  // chats (the default active section) supplies a context slot in the story.
  await expect.poll(panelText, { intervals: [20, 50, 100] }).toContain("chats context pane");

  // Switch to corpus (no context slot) — the chats panel must be GONE (not merely hidden: the shell
  // reads only sections[activeSection], so the stale body is unmounted) and the honest placeholder in.
  await page.getByRole("button", { name: "Corpus" }).click();
  // The generic un-swept fallback's copy (side-eye F-12): its title is no longer the word "Details" —
  // the CONTEXT band directly above it already says that, so the pane printed it twice over one
  // voiceless sentence. A section that states its own `context.empty` gets its own words instead.
  await expect.poll(panelText, { intervals: [20, 50, 100] }).toContain("Pick something on the left and its details appear here");
  expect(await panelText()).not.toContain("chats context pane");
});

test("a footer modal trigger (derived from the modal registry) opens its real body", async ({ mount, page }) => {
  const shell = await mount(<AppShellStory />);
  // The rail.end "Settings" button DERIVES from the modal registry (settingsModal.trigger).
  await shell.getByRole("button", { name: "Settings" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // The registry-owned settings modal renders the real SettingsShell (title from the definition).
  await expect(dialog).toContainText("Settings");
  // Close returns to no dialog.
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

// finalFocus (§13.8 R1 · side-eye P3): the store-driven modal mounts already-open (no DialogTrigger), so
// ModalHost captures the trigger at open and hands it to Base UI's `finalFocus` — on Escape-close, focus
// returns to the Settings control, not lost to <body>. A keyboard user's place is preserved.
test("closing a modal returns focus to the control that opened it (finalFocus)", async ({ mount, page }) => {
  const shell = await mount(<AppShellStory />);
  const trigger = shell.getByRole("button", { name: "Settings" });
  await trigger.focus();
  await trigger.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

// initialFocus (side-eye 2026-08-16 ARIA rider): Base UI's default initial focus is the popup's first
// TABBABLE descendant, and this header puts the dismiss button ahead of every one of them — so a shell modal
// could open with focus sitting on `Close`, where the very first Enter throws it away. `ModalHost` now names
// the BODY as `initialFocus` (a programmatic-only stop): Tab from there reaches the first real control,
// Escape still closes, and finalFocus (above) is unchanged.
//
// HONEST LABEL — this is a FENCE, not a defect proof, and the demotion is measured: it PASSES against the
// pre-fix source. The SETTINGS surface (the modal this story opens) already calls `useFocusOnMount` on its
// own root, so it was WINNING the race against Base UI's default here even before the fix. That race is
// precisely what the change removes — every modal whose body does NOT self-focus was relying on it. The pin
// this test does carry is the standing one: whatever else changes, a modal must not open on its dismiss
// control, and the first Enter must not close it.
test("a modal opens with focus in its BODY, not on Close — Enter must not immediately dismiss it", async ({ mount, page }) => {
  const shell = await mount(<AppShellStory />);
  await shell.getByRole("button", { name: "Settings" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  const close = page.getByRole("button", { name: "Close" });
  await expect(close).not.toBeFocused();
  // The focused node is inside the popup and is NOT a tab stop of its own (tabIndex -1) — the standard
  // "land the reading cursor at the content" target, not a control that swallows the first keypress.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const active = document.activeElement;
        const popup = document.querySelector('[data-slot="dialog-popup"]');
        if (!(active instanceof HTMLElement) || popup === null) {
          return "none";
        }
        return popup.contains(active) && active !== popup ? `inside:${active.tabIndex}` : "elsewhere";
      }),
    )
    .toBe("inside:-1");

  // The behavioural claim, not just the attribute one: the first Enter does NOT close the dialog.
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
});

// ── No-window-scroll invariant (task #14) — registry-driven over the modal registry ──────────────
// The shell is the window: html/body `overflow: clip` (client globals.css) means the DOCUMENT can never
// scroll — a modal taller than the viewport scrolls inside its OWN region, never the page. Looping
// MODAL_SLOT_IDS (not a hardcoded list) means a NEW modal id is covered for free.
// A short viewport + a 3000px injected body forces the overflow; if it leaked to the page, `documentElement`
// would become scrollable.

// Classify where the tall body's overflow is absorbed: is the first scrollable ancestor a DESCENDANT of
// the modal popup (correct), the popup itself, or something OUTSIDE it (the broken backdrop-owns-scroll)?
function scrollRegionContainment(page: Page): Promise<string> {
  return page.evaluate(() => {
    const popup = document.querySelector('[data-slot="dialog-popup"], [data-slot="drawer-popup"]');
    if (popup === null) {
      return "no-popup";
    }
    let el = document.querySelector('[data-testid="tall-modal-body"]')?.parentElement ?? null;
    while (el !== null) {
      const s = getComputedStyle(el);
      if ((s.overflowY === "auto" || s.overflowY === "scroll") && el.scrollHeight > el.clientHeight) {
        return popup.contains(el) && popup !== el ? "descendant" : "outside-popup";
      }
      el = el.parentElement;
    }
    return "no-scroll-region";
  });
}

// Scroll the first scrollable ancestor of the tall body to its bottom (to prove the header stays pinned).
function scrollInteriorToBottom(page: Page): Promise<void> {
  return page.evaluate(() => {
    let el = document.querySelector('[data-testid="tall-modal-body"]')?.parentElement ?? null;
    while (el !== null) {
      const s = getComputedStyle(el);
      if ((s.overflowY === "auto" || s.overflowY === "scroll") && el.scrollHeight > el.clientHeight) {
        el.scrollTop = el.scrollHeight;
        return;
      }
      el = el.parentElement;
    }
  });
}

for (const modalId of MODAL_SLOT_IDS) {
  test(`no-window-scroll: the "${modalId}" modal overflows its OWN region, never the document`, async ({ mount, page }) => {
    await page.setViewportSize({ width: 1024, height: 500 });
    await mount(<ModalScrollStory modalId={modalId} />);
    // The modal PORTALS to document.body — scope the wait to the page, not the mounted component root.
    await page.getByTestId("tall-modal-body").waitFor({ state: "attached" });

    // 1) The DOCUMENT cannot scroll — computed overflow is clip AND there is no scrollable overflow.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const de = document.documentElement;
            const overflowLocked = ["clip", "hidden"].includes(getComputedStyle(de).overflowY);
            const cannotScroll = de.scrollHeight <= de.clientHeight + 1;
            return overflowLocked && cannotScroll;
          }),
        { intervals: [20, 50, 100] },
      )
      .toBe(true);

    // 2) The absorbing scroll region is a DESCENDANT of the modal POPUP — never the backdrop/viewport.
    //    (The receipts showed the outer backdrop wrapper absorbing the overflow, which scrolled the title
    //    + nav + close out of view along with the content. "Some ancestor scrolls" is too weak — it PASSED
    //    with the broken backdrop-owns-scroll shape; the scroll must live INSIDE the popup.)
    await expect.poll(() => scrollRegionContainment(page), { intervals: [20, 50, 100] }).toBe("descendant");

    // 3) PINNED HEADER — scrolling the interior region to the bottom leaves the modal header's box put
    //    (the dialog header is a SIBLING of the scroll region; the drawer header pins via `sticky top-0`).
    //    This is the proof the title + close never scroll away with the content.
    const header = page.locator(".shell-modal-header");
    const beforeBox = await header.boundingBox();
    await scrollInteriorToBottom(page);
    const afterBox = await header.boundingBox();
    expect(beforeBox).not.toBeNull();
    expect(afterBox).not.toBeNull();
    expect(Math.abs((afterBox?.y ?? 0) - (beforeBox?.y ?? -999))).toBeLessThan(1.5);
  });
}

// ── Escape closes the top layer (§4.3 rule 6) — registry-driven over the modal registry ───────────
// Every modal (Dialog or the `you` Drawer) must dismiss on Escape — Base UI gives this for free, but a
// body that swallows the key (a cmdk/combobox search) or an onOpenChange wiring gap can silently break it
// (side-eye round-3 retrace). Looping the registry means a NEW modal id is covered for free.
for (const modalId of MODAL_SLOT_IDS) {
  test(`escape closes the "${modalId}" modal`, async ({ mount, page }) => {
    await mount(<ModalScrollStory modalId={modalId} />);
    await page.getByTestId("tall-modal-body").waitFor({ state: "attached" });
    // Focus starts inside the modal (Base UI initial focus); Escape must dismiss it to the store.
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("tall-modal-body")).toHaveCount(0);
  });
}

// ── Modals inherit the active theme (D44 §12.1) — registry-driven over the modal registry ─────────
// A Dialog/Drawer portals out of the DOM; without a THEMED portal root it escapes the app's <ThemeScope>
// and renders Hearth tokens under a custom theme (side-eye). The app root portals modals into a themed
// node, so the overlay must inherit the active override. `hooksConfig.theme` wraps the whole mount in a
// <ThemeScope> (beforeMount); the app-shell's own empty-override scope falls through to it, so a correctly
// portaled overlay inherits the sentinel. `--color-background` is set verbatim from the override (hue 300,
// distinct from every Hearth surface's hue 60) — the cleanest sentinel that a modal carries the theme.
for (const modalId of MODAL_SLOT_IDS) {
  test(`the "${modalId}" modal inherits the active theme override`, async ({ mount, page }) => {
    await mount(<ModalScrollStory modalId={modalId} />, {
      hooksConfig: { theme: { background: "oklch(0.3 0.14 300)" } },
    });
    await page.getByTestId("tall-modal-body").waitFor({ state: "attached" });
    const popup = page.locator('[data-slot="dialog-popup"], [data-slot="drawer-popup"]');
    const bg = await popup.evaluate((el) => getComputedStyle(el).getPropertyValue("--color-background").trim());
    expect(bg).toContain("300");
  });
}

// ── MOBILE (L6/J12 · D62 P3) — the bottom-tab-bar reflow ─────────────────────────────────────────

test("landmark uniqueness: exactly ONE main, distinct complementary labels, one nav", async ({ mount, page }) => {
  await mount(<AppShellStory />);

  // Exactly ONE main landmark (CONTENT)
  await expect(page.getByRole("main")).toHaveCount(1);

  // The nav landmark (the rail) has aria-label="Primary"
  await expect(page.getByRole("navigation", { name: "Primary", exact: true })).toBeVisible();

  // The complementary landmarks (asides) must have distinct accessible names
  // In default chats layout, it's "Chats list" and "Chats details"
  await expect(page.getByRole("complementary", { name: "Chats list", exact: true })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Chats details", exact: true, includeHidden: true })).toBeAttached();

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

// ── THE SKIP (side-eye 2026-08-16 F9) ────────────────────────────────────────────────────────────────
// The skip control's contract is entirely POSITIONAL — "first focusable inside the grid" — and a positional
// contract rots silently: nothing in the type system, the gates or any other CT notices when a control is
// added above it in JSX, and the failure mode (the skip becomes tab stop 2 of ~16, i.e. not a skip) is
// invisible to a pointer user and to every snapshot. So it is pinned through the KEYBOARD, at the seam a
// user meets it: it is the first tabbable inside the grid, it reveals itself when focused, and activating
// it lands focus on `<main>` so the next Tab is the section's own first affordance.
test("the skip link is the first tab stop and lands focus on the main scroll container", async ({ mount, page }) => {
  const shell = await mount(<AppShellStory />);
  const skip = shell.getByRole("button", { name: "Skip to content", exact: true });

  // THE POSITIONAL CONTRACT, read off the rendered DOM: the FIRST tabbable inside `.shell-grid` is the
  // skip. This is the assertion that rots the moment anything focusable is added above it in JSX, and it
  // is stated as DOM order rather than as "press Tab once" deliberately — the shell focuses its `<main>`
  // anchor on mount (`SectionContent focusAnchorRef` → `useFocusOnMount`), so sequential navigation in a
  // live shell RESUMES from a stop after the skip. Blurring does not reset that (the sequential focus
  // navigation starting point survives a blur), so a Tab-from-mount test would walk straight past the
  // control and pass for the wrong reason. Measured: it lands on the story's "content control".
  const firstTabbable = await page.locator(".shell-grid").evaluate((grid) => {
    const candidates = [...grid.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')];
    const first = candidates.find((el) => !el.hasAttribute("disabled") && el.tabIndex >= 0);
    return first?.textContent ?? "";
  });
  expect(firstTabbable).toBe("Skip to content");

  // AT REST it costs the pointer user nothing — asserted through the RESOLVED clip, not the class string
  // (which could survive a variant change that stopped clipping). Deliberately not a box assertion: the
  // button's own `size` arm pins a control height in a custom token, which is opaque to tailwind-merge and
  // survives `sr-only`'s 1px pair, so the rest box measures ~26px wide and is invisible anyway — the CLIP
  // is what hides it, and the clip is what this must read.
  const restClip = await skip.evaluate((el) => globalThis.getComputedStyle(el).clipPath);
  expect(restClip).toBe("inset(50%)");
  const restBox = await skip.boundingBox();

  // A real Tab first, so the page is in KEYBOARD modality — `:focus-visible` (which is what un-hides the
  // control) matches a programmatic focus only when the user's last interaction was a keypress, so a bare
  // `.focus()` on a fresh page would read as pointer focus and the reveal below would be a false red.
  await page.keyboard.press("Tab");
  await skip.focus();
  await expect(skip).toBeFocused();

  // …and taking focus REVEALS it (`focus-visible:not-sr-only`) — a skip link nobody can see while using it
  // is a keyboard trap wearing a fix. Unclipped AND wider than the clipped stub, both rendered.
  const focusedClip = await skip.evaluate((el) => globalThis.getComputedStyle(el).clipPath);
  expect(focusedClip).toBe("none");
  const focusedBox = await skip.boundingBox();
  expect(focusedBox?.width ?? 0).toBeGreaterThan(restBox?.width ?? 0);

  // It moves focus to the `<main>` scroll container itself (tabIndex=-1, named by the active section)
  // rather than to a control inside it, so the NEXT Tab lands on the section's first real affordance
  // whatever that section is — here, the story's "content control".
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(shell.getByRole("button", { name: "content control", exact: true })).toBeFocused();
});

// ── MOBILE (L6/J12 · D62 P3) — the bottom-tab-bar reflow ─────────────────────────────────────────

test("mobile: the bottom bar is the curated four; overflow + footer affordances are off the bar", async ({ mount, page }) => {
  await page.setViewportSize(MOBILE);
  const shell = await mount(<AppShellStory />);

  // The four thumb-reach tabs render as named buttons (owner decision H2: Home · Chats · Characters ·
  // You — home rides the bar as a `mobileOnly` tab because the desktop brand cell is display:none here).
  await Promise.all(["Home", "Chats", "Characters", "You"].map((name) => expect(shell.getByRole("button", { name, exact: true })).toBeVisible()));
  // The overflow sections + the desktop footer triggers are NOT on the bar (they live in the You sheet).
  // display:none on the desktop block removes them from the a11y tree entirely.
  await expect(page.getByRole("button", { name: "Corpus" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Refinery" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Analytics" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Switch theme" })).toHaveCount(0);
  // The ballooning guard: rendered mobile-bar buttons (`mobile: "tab"` sections + "You") must never
  // exceed the thumb-reach budget — a def flipping to `mobile: "tab"` must not silently balloon it. The
  // rail is now ONE DOM list (no `.shell-rail-mobile` twin); `getByRole` counts only the VISIBLE buttons,
  // so the `[data-mobile="sheet"]` entries (display:none on the bar) are correctly excluded.
  const tabCount = await page.locator(".shell-rail").getByRole("button").count();
  expect(tabCount).toBeLessThanOrEqual(MAX_MOBILE_TAB_BUTTONS);
});

// SUPERSEDED IN PART — read this with the ONE-SHELL block at the foot of this file. The original ruling
// here was "mobile lands on CONTENT, not a menu", and for a section with NO list pane (this story's `chats`
// slot injects content + context only) that still holds and is what this pins. The owner's 2026-08-03
// ruling REVERSED it for a section that DECLARES a list: there, the roster is the screen. Both statements
// live because they are about different sections, and the shell decides from the declaration alone.
test("mobile: a section with no LIST pane lands on CONTENT — the list track is collapsed, not an open sheet", async ({ mount, page }) => {
  await page.setViewportSize(MOBILE);
  await mount(<AppShellStory />);
  const listPanel = page.locator('.shell-panel[data-panel-side="list"]');
  await expect(listPanel).toHaveAttribute("data-panel-mode", "collapsed");
  await expect(page.getByText("chats content pane")).toBeVisible();
});

test("mobile: a tab click switches the section", async ({ mount, page }) => {
  await page.setViewportSize(MOBILE);
  const shell = await mount(<AppShellStory />);
  await shell.getByRole("button", { name: "Characters", exact: true }).click();
  await expect(page.getByText("characters content pane")).toBeVisible();
  // Same <Activity> pane-keeping as desktop: chats CONTENT stays mounted-but-hidden across the switch.
  await expect(page.getByText("chats content pane")).toBeHidden();
});

test("mobile: the You tab opens the sheet; an overflow section routes and closes it", async ({ mount, page }) => {
  await page.setViewportSize(MOBILE);
  // The sheet PROJECTS the persona identity widget's `body("sheet")` lens (§E-5) — stub its two reads so
  // the mobile persona switcher (Playing-as + Account strip) renders, closing the §B ruling-1 gap.
  // The list is NON-EMPTY on purpose: since the side-eye 2026-08-03 P2 ruling there is ONE home for the
  // playing-as identity and it is the CURRENT persona's ROW (persona-panel-row.tsx) — the band above the
  // roster no longer says it. An empty roster therefore renders the "No personas yet" empty state and the
  // words never appear, which is what an unswept `persona.list: []` stub was asserting against.
  await routeTrpc(page, {
    "persona.list": () => [SHEET_PERSONA],
    "settings.getUserSettings": () => ({
      userId: "user_ct_you",
      schemaVersion: 1,
      config: { ...DEFAULT_USER_SETTINGS, seeds: { ...DEFAULT_USER_SETTINGS.seeds, currentPersonaId: SHEET_PERSONA.id } },
      updatedAt: 0,
    }),
  });
  const shell = await mount(<AppShellStory />);
  await shell.getByRole("button", { name: "You", exact: true }).click();

  // The sheet is a BLIND PROJECTION over the resolved chrome list: the rail.end footer modals (theme/
  // settings, labelled by their trigger), the persona identity widget's sheet lens (Playing-as header +
  // Account strip — mobile persona switching lives HERE), and the `mobile:"sheet"` overflow sections.
  await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Switch theme" })).toBeVisible();
  await expect(page.getByText("Playing as")).toBeVisible();
  // …and it is the CURRENT persona's row that says it (the row is the identity's ONE home, P2). The row's
  // select target is STATE-AWARE (side-eye 2026-08-07 P3a): on the persona you are already playing as it is
  // named for the state, not for a switch that would be a no-op — "Switch to X, current true" was the defect.
  await expect(page.getByRole("button", { name: `${SHEET_PERSONA.name} — current persona` })).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("button", { name: "Account" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Refinery" })).toBeVisible();
  // The sheet's own container is RENDERED (the close assertion below is then about a real disappearance).
  await expect(page.getByRole("dialog")).toBeVisible();

  // Tapping an overflow section switches the active section AND closes the sheet (setActiveSection +
  // closeModal), landing on that section's distinct placeholder copy.
  await page.getByRole("button", { name: "Analytics" }).click();
  // GONE, not merely restyled: the sheet container leaves the tree and its rows go with it.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Settings" })).toHaveCount(0);
  await expect(page.getByText("Charts over your corpus land here", { exact: false })).toBeVisible();
});

test("mobile: the You sheet hands off to Settings in the shared modal slot (single-slot layered)", async ({ mount, page }) => {
  await page.setViewportSize(MOBILE);
  // Stub the persona identity widget's sheet-lens reads so the projected sheet renders cleanly (§E-5).
  await routeTrpc(page, {
    "persona.list": () => [],
    "settings.getUserSettings": () => ({ userId: "user_ct_you_handoff", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 }),
  });
  const shell = await mount(<AppShellStory />);
  await shell.getByRole("button", { name: "You", exact: true }).click();
  // Opening Settings REPLACES the You sheet in the shared openModal slot (not a nested modal): the You
  // rows disappear, the Settings modal body appears. The You row's label DERIVES from the modal registry
  // (settingsModal.title). Opening it lands the real registry-owned Settings body in the shared slot.
  await page.getByRole("button", { name: "Settings" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Settings");
  // The You-sheet overflow row is gone (the slot now holds Settings, not You).
  await expect(page.getByRole("button", { name: "Refinery" })).toHaveCount(0);
});

// ── THE REFINERY'S PHONE DOOR, AT A COARSE POINTER (owner ruling, board 2026-08-09) ────────────────
// Verbatim: "mobile refinery entry = UNDER 'YOU' (no bar redesign)". The R3 graduation side-eye filed
// "Refinery unreachable from the mobile bottom tab bar (crowning feature has no phone entry)" as an
// OWNER question; the answer was the You sheet, not a fifth tab. The mechanism was already in place —
// `refinerySection.rail.mobile = "sheet"` (refinery-section.tsx) makes `assembleChrome` project the
// section into the sheet's overflow list — so what was MISSING was the proof at the pointer the ruling
// is about. The tests above run at a mobile VIEWPORT with the CT's default FINE pointer, which renders
// a layout no phone produces: the row a thumb actually lands on is 48px only under `pointer: coarse`
// (min-h-control-md; the fine override narrows it), and a viewport-only CT is structurally blind to it.
// So this block emulates touch, PROBES that the emulation landed before trusting any geometry, and pins
// all three halves of the ruling: the row EXISTS, it meets the row floor, and it NAVIGATES.
test.describe("the Refinery's phone door (coarse pointer)", () => {
  // `hasTouch: true` is what flips `matchMedia("(pointer: coarse)")` in chromium — `page.emulateMedia`
  // exposes no `pointer` feature (tests/ui/tokens/index.ct.tsx + the touch-target-floor suite precedent).
  test.use({ hasTouch: true });

  test("the You sheet carries a Refinery row that meets the coarse row floor and navigates to the section", async ({ mount, page }) => {
    await page.setViewportSize(MOBILE);
    // PROBE FIRST: a fine-pointer context would render 34px rows and pass nothing meaningful.
    const coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
    expect(coarse, "hasTouch must flip the coarse-pointer branch — the row floor is a coarse-only guarantee").toBe(true);
    // The sheet projects the persona identity widget's `body("sheet")` lens; stub its two reads so the
    // sheet renders its real composition around the row under test.
    await routeTrpc(page, {
      "persona.list": () => [],
      "settings.getUserSettings": () => ({ userId: "user_ct_refinery_door", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 }),
    });
    const shell = await mount(<AppShellStory />);
    await shell.getByRole("button", { name: "You", exact: true }).click();

    const row = page.getByRole("button", { name: "Refinery", exact: true });
    await expect(row).toBeVisible();
    // The floor is DERIVED from the token the row rides (ListRow's default body is `min-h-control-md`),
    // never a hardcoded 48 — retuning the token retunes this assertion with it.
    await expect
      .poll(() => row.evaluate((el: Element) => el.getBoundingClientRect().height), { intervals: [20, 50, 100] })
      .toBeGreaterThanOrEqual(SHEET_ROW_FLOOR_PX);

    // …and it is a real destination: the sheet closes and the Refinery section becomes the screen.
    await row.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("Score → rewrite → analyze a character card without drifting from your original.")).toBeVisible();
  });
});

// ── M10: auto-overlay — resolvePanel's 3-regime derivation (§4.1) ────────────────────────────────
// Chats' real `panelDefaults.list` is "docked" (chats-section.tsx). Below the shell-narrow breakpoint
// (64rem/1024px) but above mobile (48rem/768px), a `docked` resolution auto-downgrades to a CLOSED
// slide-over (§4.1: overlay is zero-width closed by default, opening only on demand) — NOT open-on-load
// (the refuted first M10 pass). Above 64rem it stays docked; below 48rem it's the unchanged
// `openOverlayPanel` mobile-sheet regime. The persisted `panelOverrides` (localStorage `orb:shell`) must
// never be written by the auto-mechanism, nor by opening/closing the narrow auto-overlay slide-over.

const WIDE = { width: 1280, height: 900 }; // >64rem

// ── #170 fixtures: one room, one human seat, one chat-set background ─────────────────────────────────
/** The active room's id — MINTED, never a hand-written literal: the persisted active-chat store parses it
 *  through `typeIdSchema` on rehydrate and drops anything that fails. */
const ROOM_CHAT_ID = mintTypeId(ID_PREFIX.chat);
/** ONE human seat and no other — the BG-C gate (`isSingleHumanCast`): with a second human on the roster
 *  the carried source is inert for everyone and the test would pass against a broken shell. */
const ROOM_HUMAN_SEAT = {
  id: "participant_ct_bg",
  chatId: ROOM_CHAT_ID,
  kind: "human",
  userId: "user_ct_bg",
  characterId: null,
  role: "host",
  activePersonaId: null,
  talkativeness: 1,
  disabled: false,
  joinedAt: 0,
  joinSeq: 0,
  leftSeq: null,
  joinHistoryVisibility: "full",
  displayName: "Alex",
  handle: null,
  avatarAssetId: null,
  avatarHash: null,
};
/** The room's own chat-SET background (the cascade's first arm). `asset` + a stored hash is the only kind
 *  that resolves to a paintable URL without a seeded-id lookup; `image/*` keeps it off the video layer. */
const ROOM_BACKGROUND = {
  kind: "asset",
  seededId: "",
  externalUrl: "",
  provenanceUrl: "",
  assetId: "asset_ct_bg",
  assetHash: "hash_ct_bg",
  mime: "image/png",
};
const NARROW_DESKTOP = { width: 900, height: 900 }; // 48–64rem (900px ≈ 56.25rem)

function shellPersistedOverrides(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const raw = globalThis.localStorage.getItem("orb:shell");
    if (raw === null) {
      return null;
    }
    return (JSON.parse(raw) as { state?: { panelOverrides?: unknown } }).state?.panelOverrides;
  });
}

// ── Focus mode: ONE flag, coherent at every step of the MEASURED repro (crunch-list item 20) ────────
// Live receipt (owner, __orb.shell()): enter focus → exit (panels returned but the button still read
// "Exit focus mode") → click → panels COLLAPSED (exit *entered* the focus look) → click → nothing at all,
// terminal state = both panels collapsed + label "Exit focus mode". Three truths disagreed because the
// label was DERIVED from "both panels resolve collapsed" — the same reading the narrow auto-collapse
// produces with no user intent — while entering focus WROTE `collapsed` over the user's panel overrides
// and exiting docked BOTH panels back. Focus is one flag now; these two walk the exact click sequence.

test("the focus toggle round-trips coherently at every step of the measured repro (enter → exit → click → click)", async ({ mount, page }) => {
  await page.setViewportSize(WIDE);
  const shell = await mount(<AppShellStory />);
  const listPanel = page.locator('.shell-panel[data-panel-side="list"]');
  const contextPanel = page.locator('.shell-panel[data-panel-side="context"]');
  const shellGrid = page.locator(".shell-grid");
  const focusToggle = shell.getByRole("button", { name: FOCUS_TOGGLE_RE });

  // Chats' real defaults: LIST docked, CONTEXT collapsed — nobody has entered focus, so the button says so.
  await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "collapsed");
  await expect(focusToggle).toHaveAccessibleName("Enter focus mode");
  // data-focus-mode on .shell-grid is the __orb.shell().focus DOM source (agent-bridge.ts) — it must
  // track the store's focusMode flag at every step, not just the panel-derived label.
  await expect(shellGrid).toHaveAttribute("data-focus-mode", "false");

  // 1) ENTER — everything hides, the label flips, the button reads pressed.
  await focusToggle.click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "collapsed");
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "collapsed");
  await expect(focusToggle).toHaveAccessibleName("Exit focus mode");
  await expect(focusToggle).toHaveAttribute("aria-pressed", "true");
  await expect(shellGrid).toHaveAttribute("data-focus-mode", "true");

  // 2) EXIT — the section's OWN pre-focus layout returns: the LIST docks, and the CONTEXT pane the user
  // never had open stays collapsed. (The old implementation docked BOTH here — "restore" meant "dock
  // everything", so exiting focus opened a pane the user had closed.)
  await focusToggle.click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "collapsed");
  await expect(focusToggle).toHaveAccessibleName("Enter focus mode");
  await expect(focusToggle).toHaveAttribute("aria-pressed", "false");
  await expect(shellGrid).toHaveAttribute("data-focus-mode", "false");

  // 3) + 4) The next two clicks repeat the SAME two states — no drift, no dead click.
  await focusToggle.click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "collapsed");
  await expect(focusToggle).toHaveAccessibleName("Exit focus mode");
  await focusToggle.click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "collapsed");
  await expect(focusToggle).toHaveAccessibleName("Enter focus mode");
});

test("at 48-64rem the focus toggle is NOT pre-pressed by the auto-collapse, and its second click exits (the measured no-op)", async ({ mount, page }) => {
  await page.setViewportSize(NARROW_DESKTOP);
  const shell = await mount(<AppShellStory />);
  const listPanel = page.locator('.shell-panel[data-panel-side="list"]');
  const focusToggle = shell.getByRole("button", { name: FOCUS_TOGGLE_RE });
  const before = await shellPersistedOverrides(page);

  // Cold boot at this width: the auto-overlay derivation already resolves BOTH panels collapsed. That is
  // the shell being narrow — NOT the user in focus mode, which is exactly what the old derived label
  // claimed ("Exit focus mode" on a section nobody focused, with a first click that did nothing).
  await expect(listPanel).toHaveAttribute("data-panel-mode", "collapsed");
  await expect(focusToggle).toHaveAccessibleName("Enter focus mode");

  await focusToggle.click();
  await expect(focusToggle).toHaveAccessibleName("Exit focus mode");
  // The measured terminal state was this click doing nothing forever. It exits.
  await focusToggle.click();
  await expect(focusToggle).toHaveAccessibleName("Enter focus mode");

  // Still a pure presentation flag at this width — no persisted panel preference was written.
  expect(await shellPersistedOverrides(page)).toEqual(before);
});

// ── O-19: the Presets section opens with BOTH panes docked ───────────────────────────────
// Owner ruling: the library is how you pick what you are editing and the readout IS the product, so a
// Presets section that opens with neither pane looks unbuilt. Driven through a REAL rail click so the
// section's registry `panelDefaults` are what the shell actually resolves.

test("O-19: switching to Presets opens BOTH the list and the context pane docked", async ({ mount, page }) => {
  await page.setViewportSize(WIDE);
  const shell = await mount(<AppShellStory />);

  await shell.getByRole("button", { name: "Presets" }).click();
  await expect(page.locator('.shell-panel[data-panel-side="list"]')).toHaveAttribute("data-panel-mode", "docked");
  await expect(page.locator('.shell-panel[data-panel-side="context"]')).toHaveAttribute("data-panel-mode", "docked");
});

test("resolvePanel: a docked-default panel is docked >64rem, CLOSED (collapsed) by default in 48-64rem, and the unchanged openOverlayPanel regime <48rem", async ({
  mount,
  page,
}) => {
  await page.setViewportSize(WIDE);
  await mount(<AppShellStory />);
  const listPanel = page.locator('.shell-panel[data-panel-side="list"]');
  await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");

  // Narrow-desktop auto-overlay is CLOSED by default (the M10 correction) — content full-width, no scrim,
  // NOT open-on-load.
  await page.setViewportSize(NARROW_DESKTOP);
  await expect(listPanel).toHaveAttribute("data-panel-mode", "collapsed");
  await expect(page.locator(".shell-scrim")).toHaveAttribute("data-visible", "false");

  await page.setViewportSize(MOBILE);
  // Mobile regime takes precedence over narrow. For THIS story's chats slot — which declares no list —
  // the panel is a collapsed sheet by default, unaffected by the auto-overlay derivation. (A section that
  // DOES declare a list resolves `docked` here since the ONE-SHELL rule; that arm is pinned at the foot.)
  await expect(listPanel).toHaveAttribute("data-panel-mode", "collapsed");
});

test("resolvePanel: an explicit collapsed/overlay override passes through identically across all three regimes", async ({ mount, page }) => {
  await page.setViewportSize(WIDE);
  const shell = await mount(<AppShellStory />);
  const listPanel = page.locator('.shell-panel[data-panel-side="list"]');
  await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");

  // Explicit user override: collapse the list panel (writes panelOverrides.chats.list = "collapsed").
  await shell.getByRole("button", { name: "Hide list panel" }).click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "collapsed");

  // The override is NOT "docked", so the narrow auto-downgrade never fires — identical across regimes.
  await page.setViewportSize(NARROW_DESKTOP);
  await expect(listPanel).toHaveAttribute("data-panel-mode", "collapsed");

  await page.setViewportSize(WIDE);
  await expect(listPanel).toHaveAttribute("data-panel-mode", "collapsed");
});

test("resolvePanel: the auto-overlay derivation never mutates the persisted panelOverrides across a narrow-wide-narrow resize round-trip", async ({
  mount,
  page,
}) => {
  await page.setViewportSize(WIDE);
  await mount(<AppShellStory />);
  const listPanel = page.locator('.shell-panel[data-panel-side="list"]');
  await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");
  const before = await shellPersistedOverrides(page);

  await page.setViewportSize(NARROW_DESKTOP);
  await expect(listPanel).toHaveAttribute("data-panel-mode", "collapsed");
  const duringNarrow = await shellPersistedOverrides(page);

  await page.setViewportSize(WIDE);
  await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");
  const afterRewiden = await shellPersistedOverrides(page);

  // The auto-mechanism is a pure derivation — panelOverrides is byte-identical (undefined: chats has no
  // stored override in this fresh-page CT) across the whole resize round-trip.
  expect(duringNarrow).toEqual(before);
  expect(afterRewiden).toEqual(before);
});

test("at 900px (48-64rem) the recents FINDER is still reachable — it moved to home, which has no LIST at all", async ({ mount, page }) => {
  // SUPERSEDED FORM of the M10-correction CT. That test guarded the chat landing's `showRecents` flag: at
  // this width the LIST auto-overlays CLOSED, so the landing had to show its own recents finder. The
  // launcher has since MOVED to home (owner decision H1 = D-1) and `showRecents` is gone with it — but the
  // USER-FACING guarantee it protected is unchanged and still worth a wall: at the auto-overlay width you
  // can still find a recent chat without hunting for a hidden panel. Home is now that finder, and home
  // declares NO list pane, so there is nothing to auto-overlay away.
  await routeTrpc(page, {
    "chat.listChats": chatListResponder([makeChatSummary({ id: "chat_recent_900", title: "A grand adventure" })]),
    "character.list": { items: [makeCharacterSummary()], nextCursor: null },
  });
  await page.setViewportSize(NARROW_DESKTOP);
  const shell = await mount(<AppShellOnSectionStory section="home" />);

  // The single recent room lands as the focal HERO ("Pick up where you left off"), reachable directly —
  // NOT a "Recent chats" list row (the variant-C home rework, H1/D-1). The guarantee this CT protects is
  // unchanged: at the auto-overlay width the recent is findable on home with the list pane collapsed, so
  // there is no hidden panel to hunt.
  const resume = shell.getByRole("button", { name: "Resume A grand adventure" });
  await expect(resume).toBeVisible();
  await expect(page.locator('.shell-panel[data-panel-side="list"]')).toHaveAttribute("data-panel-mode", "collapsed");
});

test("the topbar toggle OPENS a narrow-auto-overlayed panel (slide-over + scrim) without occluding the toggle, and closes it again — never writing panelOverrides", async ({
  mount,
  page,
}) => {
  await page.setViewportSize(NARROW_DESKTOP);
  const shell = await mount(<AppShellStory />);
  const listPanel = page.locator('.shell-panel[data-panel-side="list"]');
  const scrim = page.locator(".shell-scrim");

  // Closed by default (the correction).
  await expect(listPanel).toHaveAttribute("data-panel-mode", "collapsed");
  await expect(scrim).toHaveAttribute("data-visible", "false");
  const before = await shellPersistedOverrides(page);

  // A REAL click on the topbar toggle opens the slide-over.
  const toggle = shell.getByRole("button", { name: "Show list panel" });
  await toggle.click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "overlay");
  await expect(scrim).toHaveAttribute("data-visible", "true");

  // The topbar toggle is still reachable/clickable — the P0 regression was the desktop overlay covering
  // the topbar row and timing out this exact click.
  const reopenedToggle = shell.getByRole("button", { name: "Hide list panel" });
  await expect(reopenedToggle).toBeVisible();
  await reopenedToggle.click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "collapsed");
  await expect(scrim).toHaveAttribute("data-visible", "false");

  // Opening/closing an auto-overlayed panel is ephemeral (`openOverlayPanel`) — never the persisted dock.
  const after = await shellPersistedOverrides(page);
  expect(after).toEqual(before);
});

// The DEAD CONTROL (2026-08-01 side-eye, HUD-1 P2-9): a pane whose section default is `collapsed` — chats'
// CONTEXT pane — took the WIDE persisted-dock arm at ≤64rem, wrote `docked`, and `resolvePanel` immediately
// re-collapsed it. The click produced no pixel, and only a SECOND click (now on a `docked` default) reached
// the overlay arm. A visible control that does nothing is house-law banned, so this pins the FIRST click.
test("the ≤64rem detail-panel toggle opens the pane on the FIRST click — a collapsed-DEFAULT pane is not a dead control", async ({ mount, page }) => {
  await page.setViewportSize(NARROW_DESKTOP);
  const shell = await mount(<AppShellStory />);
  const contextPanel = page.locator('.shell-panel[data-panel-side="context"]');
  const scrim = page.locator(".shell-scrim");
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "collapsed");
  const before = await shellPersistedOverrides(page);

  await shell.getByRole("button", { name: "Show detail panel" }).click();
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "overlay");
  await expect(scrim).toHaveAttribute("data-visible", "true");

  // …and it closes again on the next click, still ephemeral — a narrow-width toggle never rewrites the
  // user's WIDE dock preference.
  await shell.getByRole("button", { name: "Hide detail panel" }).click();
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "collapsed");
  expect(await shellPersistedOverrides(page)).toEqual(before);
});

test("the scrim dismiss closes a narrow-auto-overlayed panel the same way the topbar toggle does", async ({ mount, page }) => {
  await page.setViewportSize(NARROW_DESKTOP);
  const shell = await mount(<AppShellStory />);
  const listPanel = page.locator('.shell-panel[data-panel-side="list"]');

  await shell.getByRole("button", { name: "Show list panel" }).click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "overlay");

  await page.locator(".shell-scrim").click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "collapsed");
});

// ── toggleFocus regime-awareness (M10 completeness fold) — the same ephemeral-vs-persisted bug class
// togglePanel/collapsePanel were already corrected for. At narrow width, focus-toggle must not write the
// persisted panelOverrides (there's nothing "docked" to persist-collapse — it's already an on-demand
// overlay), it just closes whatever slide-over happens to be open.

test("toggleFocus at narrow width closes an open slide-over without writing panelOverrides", async ({ mount, page }) => {
  await page.setViewportSize(NARROW_DESKTOP);
  const shell = await mount(<AppShellStory />);
  const listPanel = page.locator('.shell-panel[data-panel-side="list"]');
  const before = await shellPersistedOverrides(page);

  // Open the narrow auto-overlay slide-over first.
  await shell.getByRole("button", { name: "Show list panel" }).click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "overlay");

  // toggleFocus (the topbar focus button) must close it — ephemeral, not a persisted docked/collapsed flip.
  await shell.getByRole("button", { name: "Enter focus mode" }).click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "collapsed");

  const after = await shellPersistedOverrides(page);
  expect(after).toEqual(before);
});

// ── Escape closes the open narrow/mobile auto-overlay panel (side-eye's top item) ────────────────
// The overlay is modal-adjacent (scrim + on-demand) — a keyboard user needs Escape, not just
// toggle/scrim-click, to dismiss it. Scoped to the overlay regime; Escape must yield to an open modal.

test("Escape closes an open narrow-overlay panel without writing panelOverrides", async ({ mount, page }) => {
  await page.setViewportSize(NARROW_DESKTOP);
  const shell = await mount(<AppShellStory />);
  const listPanel = page.locator('.shell-panel[data-panel-side="list"]');
  const before = await shellPersistedOverrides(page);

  await shell.getByRole("button", { name: "Show list panel" }).click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "overlay");

  await page.keyboard.press("Escape");
  await expect(listPanel).toHaveAttribute("data-panel-mode", "collapsed");

  const after = await shellPersistedOverrides(page);
  expect(after).toEqual(before);
});

// …and the CONTEXT side of the same guarantee (side-eye re-verify 2026-08-06). The list arm above was the
// one the original finding named, so only it was ever driven; the chat Details sheet is the pane a phone
// user actually meets, and "the Close button works but Escape does not" is a claim only this drive can
// settle. Same regime, same dismiss, opposite panel.
test("Escape closes an open CONTEXT overlay too — the same dismiss the band's Close fires", async ({ mount, page }) => {
  await page.setViewportSize(NARROW_DESKTOP);
  const shell = await mount(<AppShellStory />);
  const contextPanel = page.locator('.shell-panel[data-panel-side="context"]');

  await shell.getByRole("button", { name: CONTEXT_TOGGLE_RE }).click();
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "overlay");

  await page.keyboard.press("Escape");
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "collapsed");
});

// …and from INSIDE the sheet, which is where a keyboard user actually is after opening it: the shell's
// listener is on `document`, so a keydown raised on the panel's own content has to bubble all the way out.
test("Escape closes a CONTEXT overlay when focus is INSIDE the sheet, not on the toggle that opened it", async ({ mount, page }) => {
  await page.setViewportSize(NARROW_DESKTOP);
  const shell = await mount(<AppShellStory />);
  const contextPanel = page.locator('.shell-panel[data-panel-side="context"]');

  await shell.getByRole("button", { name: CONTEXT_TOGGLE_RE }).click();
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "overlay");

  // The band's own dismiss is the one control the sheet always has — focus it, then press Escape.
  await contextPanel.getByRole("button", { name: OVERLAY_CLOSE_RE }).focus();
  await page.keyboard.press("Escape");
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "collapsed");
});

// …and on a PHONE, where the sheet is the whole screen, the content column behind it is `inert`, and the
// scrim it "floats over" has no reachable pixel — the arm where Escape is the only keyboard exit there is.
test("MOBILE: Escape closes the full-screen CONTEXT sheet", async ({ mount, page }) => {
  await page.setViewportSize(MOBILE);
  const shell = await mount(<AppShellStory />);
  const contextPanel = page.locator('.shell-panel[data-panel-side="context"]');

  await shell.getByRole("button", { name: CONTEXT_TOGGLE_RE }).click();
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "overlay");

  await page.keyboard.press("Escape");
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "collapsed");
  await expect(page.locator(".shell-content")).not.toHaveAttribute("inert", "");
});

// The mobile "You" sheet is itself the modal registry's `you` slot (Drawer) AND its overflow rows open
// on top of a curated bottom-tab bar rather than the rail — a modal here doesn't visually cover its own
// trigger the way the desktop rail's Settings button sits behind the panel scrim, so this is the reachable
// way to get BOTH a panel overlay (via the sheet's own list toggle isn't applicable on mobile — instead we
// prove the guard the way the spec allows when a real simultaneous click-path is impractical: assert the
// handler's own modal-open condition never lets an open modal's Escape reach the panel-dismiss logic, by
// confirming Escape closes the modal while the modal is open and does NOT collapse a panel that has no
// scrim (mobile's collapsed default) — then confirming Escape DOES dismiss the scrim'd overlay once no
// modal is open (already covered above). Base UI's own modality (inert on background content while a
// Dialog/Drawer is open) makes a real "both are simultaneously interactive" click-path unreachable by a
// user in the first place — the yield guard's job is to never fire while a modal owns Escape, which the
// two tests above/below jointly prove: Escape closes the overlay when no modal is open, and Escape closes
// the modal (Base UI's handling) when one is open, with the shell's own listener a no-op in the latter case.
test("Escape closes an open modal without any panel-dismiss side effect (the yield guard, non-overlapping state)", async ({ mount, page }) => {
  await page.setViewportSize(NARROW_DESKTOP);
  const shell = await mount(<AppShellStory />);
  const listPanel = page.locator('.shell-panel[data-panel-side="list"]');

  // No panel overlay open; a modal IS open. scrimVisible is false here, so the shell's own listener is
  // not even attached (see the `!layout.scrimVisible` short-circuit) — Escape reaches Base UI untouched.
  await shell.getByRole("button", { name: "Settings" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  // The list panel was never in overlay mode to begin with, and stays that way — proves Escape here had
  // no effect on shell panel state at all (the modal owned it end to end).
  await expect(listPanel).not.toHaveAttribute("data-panel-mode", "overlay");
});

// ── Co-motion parity: the shell push + panel slide animate as ONE event (never-desync) ────────────
// BASEUI-MOTION-AUDIT.md §5 Layer 2 — the rendered-output guard the corpus desync needed. The track
// change and the collapsed panel (`transform`) are one visual event; they MUST carry the SAME duration +
// timing-function, and NEITHER may be `0s`/`none` (the `0s` arm is what catches ABSENCE — the actual
// corpus bug, where the track had NO motion while the panel slid). Layer 1's co-motion vars
// (`--shell-motion`/`--shell-ease` in shell.css) make divergence structurally impossible; this test
// proves it at the COMPUTED-STYLE level (a source lint can't see a missing rule).
//
// ── THE RULING MOVED AXES (task #32, 2026-08-09) — BOTH TEXTS, so the next reader sees why ────────
// This test used to read `transitionOf(grid, "grid-template-columns")` and assert it was not `0s`. Its
// header said, verbatim: "The grid track (`grid-template-columns`) and the collapsed panel (`transform`)
// are one visual event; they MUST carry the SAME transition duration + timing-function, and NEITHER may
// be `0s`/`none`". That INVARIANT is preserved below and still fully asserted. What changed is which
// property carries the track's half of the event, because the old carrier was the defect:
// `grid-template-columns` is a LAYOUT property, so transitioning it re-ran layout over the whole content
// subtree once per frame for 220ms. Measured on the live stack: docking the LIST panel scored 0.2774 of
// layout instability, collapsing it 0.2166, a nine-section rail sweep 0.3067 — F-14's "shell CLS ~0.26".
// The track now resizes in ONE frame and the motion is a compositor-only counter-`translate` FLIP on
// `.shell-main` (shell.css "THE PANEL PUSH IS A FLIP" + use-list-track-flip.ts): prototyped on the live
// shell at 0.2166 → 0.0205 (collapse), 0.2987 → 0.0205 (dock), rail nav 0.3067 → 0.0000.
// So the parity assertions below read `animation-*` on `.shell-main` where they used to read
// `transition-*` on `.shell-grid` — same two co-motion vars, same absence arm, same divergence arm — and
// a THIRD arm was added: the grid track must NOT be transitioned any more, which is the regression this
// lane actually fixed. The zero-shift test that follows is the user-visible half of the same proof.
//
// The panel is read in `collapsed` (an out-of-flow, transform-animated mode) — `docked` has no transform
// transition, so the test collapses it first.

/** The computed transition duration+easing of `prop` on the element behind `locator`. Reads the
 *  per-property longhands (a multi-property `transition` shorthand serializes duration/easing as a
 *  comma list aligned to `transition-property`); we index the arm whose property matches `prop`. */
function transitionOf(locator: Locator, prop: string): Promise<{ duration: string; ease: string }> {
  return locator.evaluate((el, wanted) => {
    const s = getComputedStyle(el);
    const props = s.transitionProperty.split(",").map((p) => p.trim());
    const durations = s.transitionDuration.split(",").map((d) => d.trim());
    const eases = s.transitionTimingFunction.split(",").map((e) => e.trim());
    // The property arm we care about (grid-template-columns / transform). `all` covers every property,
    // so a single-arm `all` transition matches too. Fall back to arm 0 if the list is single-valued.
    const i = props.findIndex((p) => p === wanted || p === "all");
    const at = i === -1 ? 0 : i;
    return {
      duration: durations[at] ?? durations[0] ?? "0s",
      ease: eases[at] ?? eases[0] ?? "linear",
    };
  }, prop);
}

/** The computed animation duration+easing+name of the element behind `locator` — the FLIP's half of the
 *  co-motion event, the twin of `transitionOf` above. */
function animationOf(locator: Locator): Promise<{ duration: string; ease: string; name: string }> {
  return locator.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      duration: s.animationDuration.split(",")[0]?.trim() ?? "0s",
      ease: s.animationTimingFunction.split(",")[0]?.trim() ?? "linear",
      name: s.animationName.split(",")[0]?.trim() ?? "none",
    };
  });
}

test("co-motion parity: the content FLIP and the collapsed panel share one non-zero duration + easing", async ({ mount, page }) => {
  const shell = await mount(<AppShellStory />);
  const grid = page.locator(".shell-grid");
  const listPanel = page.locator('.shell-panel[data-panel-side="list"]');
  const main = page.locator(".shell-main");

  // Collapse the list panel so it enters the transform-animated `collapsed` mode (docked has no slide).
  await shell.getByRole("button", { name: "Hide list panel" }).click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "collapsed");

  // The FLIP direction is stamped in the SAME commit as the track change, so the rule matches by now.
  await expect(grid).toHaveAttribute("data-list-flip", "out");
  const pushMotion = await animationOf(main);
  const panelMotion = await transitionOf(listPanel, "transform");

  // The absence arm (the corpus bug): neither side may be a no-motion. `220ms` = `--motion-base`.
  expect(pushMotion.duration).not.toBe("0s");
  expect(panelMotion.duration).not.toBe("0s");
  expect(pushMotion.ease).not.toBe("none");
  expect(panelMotion.ease).not.toBe("none");
  expect(pushMotion.name).not.toBe("none");

  // The divergence arm: they animate as ONE event — equal duration AND equal easing (the co-motion vars
  // guarantee this by construction; this asserts it landed in computed style, not just source).
  expect(pushMotion.duration).toBe(panelMotion.duration);
  expect(pushMotion.ease).toBe(panelMotion.ease);

  // The THIRD arm (task #32): the track itself must no longer be TRANSITIONED. A non-zero duration here
  // means the layout animation is back and the shell is thrashing again.
  const gridMotion = await transitionOf(grid, "grid-template-columns");
  expect(gridMotion.duration).toBe("0s");
});

// ── The user-visible half: toggling a docked panel must record NO meaningful layout shift ────────────
// The defect proof for F-14, asserted the way a browser SCORES it rather than by reading CSS. Pre-fix
// this measured ~0.2 per toggle on the live shell (`div.shell-main` moving 272px in 6-8 steps, one per
// frame); post-fix the counter-translate cancels the layout move inside the same frame, so the browser
// never records a start-position change at all. The remaining budget is the content gutter RE-CENTRING in
// a column whose width also changed — one frame, and no transform can cancel a width change — measured at
// ~0.02 on the live shell, well inside the 0.1 CWV ceiling.
test("toggling the docked LIST panel is compositor-only: no meaningful layout shift is recorded", async ({ mount, page }) => {
  const shell = await mount(<AppShellStory />);
  const listPanel = page.locator('.shell-panel[data-panel-side="list"]');
  await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");

  // Installed AFTER the mount settles, so boot/data-arrival shifts are never attributed to the toggle.
  await page.evaluate(() => {
    // FABRICATION-OK: a browser-context probe slot, written and read in this test alone.
    const bag = globalThis as unknown as { __shiftTotal: number };
    bag.__shiftTotal = 0;
    // `hadRecentInput` is deliberately NOT filtered: a click drives this toggle, so the CWV metric would
    // exclude every entry and this assertion would pass against a fully broken shell (see motion-stats.ts's
    // two-totals note — that exclusion is precisely what hid this defect).
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        bag.__shiftTotal += (entry as PerformanceEntry & { value: number }).value;
      }
    }).observe({ type: "layout-shift" });
  });

  await shell.getByRole("button", { name: "Hide list panel" }).click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "collapsed");
  await shell.getByRole("button", { name: "Show list panel" }).click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");

  const readTotal = (): Promise<number> =>
    // FABRICATION-OK: reads back the probe slot installed above.
    page.evaluate(() => (globalThis as unknown as { __shiftTotal: number }).__shiftTotal);
  // Polls PAST the 220ms motion so a late entry cannot land after the read.
  await expect.poll(readTotal, { intervals: [100, 200, 300, 400] }).toBeLessThan(0.1);
});

// ── #151: with motion OFF there is no counter-translate to hold the wrong corner ────────────────────
// The owner saw "a weird glitch where the home header is and where the chats header with the count
// appears" on a home→chats swap, WORSE with reduced motion on — and CLS read 0.0000, because a
// `translate` records no layout-shift at all. Measured per-animation-frame on the LIVE shell
// (2026-08-18, `reports/snaps/sp-151-*`): under `prefers-reduced-motion: reduce` the shell stamped
// `data-list-flip` and Chrome held the freshly-started animation PENDING at `currentTime 0` for two
// consecutive frames — the reduced-motion floor collapses `animation-duration` to 0.01ms, which does not
// make the animation instant, it makes it a one-to-two-frame HOLD of its `from` corner. `.shell-main`
// (topbar and header band included) painted at x=-290 docking and x=747 collapsing, a full `--panel-w`
// outside the corridor between its start and end columns, then snapped back.
//
// TWO ARMS, and the honest labels for each:
//  · the ATTRIBUTE arm is the DEFECT PROOF — it is red against the old hook, which stamped the flip
//    regardless of the motion preference. A FLIP is a motion mechanism; with motion off the track just
//    resizes.
//  · the CORRIDOR arm is a FENCE, not the defect proof: the live compositor hold does NOT reproduce at CT
//    page weight (the old hook passes it here), so it cannot be the receipt for the reported glitch —
//    the per-frame live measurement is. It earns its place anyway: it caught a WRONG first fix in this
//    lane (forcing a synchronous layout in the flip effect, which made the CT jolt to x=670 for two
//    frames), which is exactly the regression class a fence is for.
// The full-motion arm below is the third guard: the fix must not simply delete the FLIP.
test("#151 reduced motion: no LIST-track FLIP is stamped, and .shell-main never leaves the corridor between its old and new columns", async ({
  mount,
  page,
}) => {
  await page.setViewportSize(WIDE);
  // TOTAL media state, never a delta (see emulateMediaFeatures): reduced motion is the arm under test, and
  // the other two are named so a leak from an earlier test in this file cannot change what renders here.
  await emulateMediaFeatures(page, [
    ["prefers-reduced-motion", "reduce"],
    ["prefers-reduced-transparency", "no-preference"],
    ["prefers-contrast", "no-preference"],
  ]);
  const shell = await mount(<AppShellStory />);
  const listPanel = page.locator('.shell-panel[data-panel-side="list"]');
  const main = page.locator(".shell-main");
  await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");

  const startX = await main.evaluate((el) => Math.round(el.getBoundingClientRect().x));
  // A bounded per-frame sampler — rAF, not a screenshot loop: the jolt is two frames wide, so anything
  // slower than the frame clock samples past it. Bounded so it cannot outlive the test.
  await page.evaluate(() => {
    // FABRICATION-OK: a browser-context probe slot, written and read in this test alone.
    const bag = globalThis as unknown as { __mainX: number[] };
    bag.__mainX = [];
    const el = document.querySelector(".shell-main");
    const tick = (): void => {
      if (el === null || bag.__mainX.length > 60) {
        return;
      }
      bag.__mainX.push(Math.round(el.getBoundingClientRect().x));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  // The reported repro is the chats⇄HOME swap, and home is the one section that declares NO list pane at
  // all — so the track genuinely appears/disappears with the section, which is the move the FLIP exists
  // for. It is also where `setActiveSection`'s View Transition is SKIPPED under reduced motion, leaving
  // nothing to flush the new track before the counter-translate composites.
  await shell.getByRole("button", { name: "Home" }).click();
  await expect(listPanel).not.toHaveAttribute("data-panel-mode", "docked");
  // BARRIER ON THE SETTLED RENDER, not on the attribute: the mode attribute lands a frame or more before
  // the grid is re-laid out at the new track (that lag is the whole subject of this test), so reading the
  // end column off the attribute alone samples the OLD x and makes the corridor a point.
  const readX = (): Promise<number> => main.evaluate((el) => Math.round(el.getBoundingClientRect().x));
  await expect.poll(readX).not.toBe(startX);
  const endX = await readX();
  // THE DEFECT PROOF: the counter-translate is simply not armed for a user who asked for no motion, so
  // there is no `from` corner for the compositor to hold.
  expect(await page.locator(".shell-grid").getAttribute("data-list-flip"), "no flip may be armed with motion off").toBeNull();
  // Read ONCE (never poll a shared array — a poll drains the very samples it is judging).
  // FABRICATION-OK: reads back the probe slot installed above.
  const samples = await page.evaluate(() => (globalThis as unknown as { __mainX: number[] }).__mainX);

  expect(samples.length, "the rAF sampler must have run — an empty ring proves nothing").toBeGreaterThan(2);
  // The track really did change (a no-op swap would make the corridor a point and pass vacuously).
  expect(Math.abs(endX - startX), `the track must really change — start ${startX}, end ${endX}, samples ${samples.join(",")}`).toBeGreaterThan(100);
  const low = Math.min(startX, endX) - 1;
  const high = Math.max(startX, endX) + 1;
  const strays = samples.filter((x) => x < low || x > high);
  expect(strays, `.shell-main left the ${low}…${high} corridor: ${strays.join(", ")}`).toEqual([]);

  // Hand the page back in the file's baseline media state — the overrides outlive this test.
  await emulateMediaFeatures(page, [
    ["prefers-reduced-motion", "no-preference"],
    ["prefers-reduced-transparency", "no-preference"],
    ["prefers-contrast", "no-preference"],
  ]);
});

// The counter-arm of the test above: with motion ON the FLIP is still armed on the SAME swap. Without
// this, "never stamp the flip" would pass both tests and silently delete the compositor-only panel push
// (task #32) that the co-motion + zero-shift tests above exist to protect.
test("#151 the LIST-track FLIP IS still armed on the same swap when motion is allowed", async ({ mount, page }) => {
  await page.setViewportSize(WIDE);
  await emulateMediaFeatures(page, [
    ["prefers-reduced-motion", "no-preference"],
    ["prefers-reduced-transparency", "no-preference"],
    ["prefers-contrast", "no-preference"],
  ]);
  const shell = await mount(<AppShellStory />);
  const listPanel = page.locator('.shell-panel[data-panel-side="list"]');
  await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");

  await shell.getByRole("button", { name: "Home" }).click();
  await expect(listPanel).not.toHaveAttribute("data-panel-mode", "docked");
  await expect(page.locator(".shell-grid")).toHaveAttribute("data-list-flip", "out");
});

// ── RED-FIRST (#170): a per-chat background paints INSIDE its room and nowhere else ──────────────────
// Owner, live 2026-08-18: "the chat's background is sticky and following me" — with no global background
// set, the last-visited room's wallpaper dressed every other section, and survived a reload. The cause is
// a pointer, not a write: `useActiveChatId` is a PERSISTED handle (deliberately — returning to chats must
// land you back in the room you left), and the app-root background layer keyed on it ALONE. The pointer
// says which room is open; only the active SECTION says whether that room is on screen.
// Asserted through the rendered layer — the affordance the owner actually saw — so it compiles against
// the old hook and fails on it.
test("#170 a chat's carried background paints in the chats section and is GONE the moment another section is active", async ({ mount, page }) => {
  await page.setViewportSize(WIDE);
  await routeTrpc(page, {
    "chat.getChat": { participants: [ROOM_HUMAN_SEAT], background: ROOM_BACKGROUND },
  });
  // The room pointer as a real boot has it: in localStorage BEFORE any module runs, so the shell's first
  // render reads it (the store rehydrates synchronously — see the boot test below). An effect-seeded
  // pointer would be one commit late and could not pin first-paint behaviour.
  await page.addInitScript({
    content: `try { localStorage.setItem("orb:active-chat", ${JSON.stringify(
      JSON.stringify({ state: { handle: { kind: "committed", id: ROOM_CHAT_ID } }, version: 1 }),
    )}); } catch { /* storage disabled — the room pointer stays at landing and the arms below say so */ }`,
  });
  await page.reload();

  const shell = await mount(<AppShellStory />);
  const backgroundLayer = page.locator('[data-slot="theme-background-layer"]');
  // In the room: the carried source paints, and the shell goes transparent for it.
  await expect(backgroundLayer).toBeVisible();
  await expect(page.locator(".shell-grid")).toHaveAttribute("data-has-bg-image", "true");

  await shell.getByRole("button", { name: "Characters" }).click();
  await expect(page.getByText("characters content pane")).toBeVisible();

  // Out of the room, with no global background set, the app paints its OWN ground — the null-origin rule.
  await expect(backgroundLayer).toHaveCount(0);
  await expect(page.locator(".shell-grid")).not.toHaveAttribute("data-has-bg-image", "true");

  // …and coming back re-dresses the room, so nothing had to be CLEARED and the pointer still means what
  // it always meant.
  await shell.getByRole("button", { name: "Chats", exact: true }).click();
  await expect(backgroundLayer).toBeVisible();
});

// ── BOOT: the FIRST committed grid template already carries the resolved tracks (F14) ───────────────
// shell.css boots `--list-track`/`--context-track` at 0px and the docked rules override them off
// `data-list-mode`/`data-context-mode`. That LOOKS like a boot squeeze (content paints full-width, then
// gets squeezed when the panel modes land, with :21's transition animating it) and was pinned as the
// cause of the measured boot CLS — it is NOT, and this pins why: every input to the resolve is
// SYNCHRONOUS (the persisted shell store rehydrates from localStorage during module init; panelDefaults
// are static registry data; the viewport regime is a matchMedia `useSyncExternalStore` snapshot), so
// `.shell-grid` carries its mode attributes from its very first render and the docked track rules win in
// the SAME first style computation. Measured on the live stack: the grid's template at DOM insertion is
// already `56px 345.594px 606.406px 432px` (4x-CPU-throttled too), and no interpolated value is ever
// sampled. Anything that makes panel resolution async (an awaited storage, a mode read moved into an
// effect, a hydration gate) reintroduces a real 0px→docked squeeze — this fails on that.
test("boot: the grid's FIRST committed template already carries the resolved track widths (no 0px squeeze)", async ({ mount, page }) => {
  // Pin the viewport BEFORE the mount: the CT harness page loads at its own size and Playwright applies
  // the test viewport afterwards, so a mount at the default size renders once against the pre-resize
  // matchMedia (narrow ⇒ the auto-overlay downgrade) and re-resolves on the resize event. That is a real
  // viewport change, not an async resolve — resizing first is what makes this a boot measurement.
  await page.setViewportSize(WIDE);
  // BOOT STATE, the way a real boot has it: `orb:shell` already in localStorage BEFORE any module runs,
  // so the shell store's rehydrate (sync — localStorage) is what the first render reads. The story's own
  // `LandOn` lands the section in an EFFECT, i.e. one commit late; that is a story artifact, and pinning
  // against it would prove nothing about the boot. `addInitScript` + a reload is the only moment early
  // enough (the CT harness re-bootstraps on load, so `mount` still works after it).
  await page.addInitScript({
    content: `try { localStorage.setItem("orb:shell", ${JSON.stringify(
      JSON.stringify({ state: { activeSection: "chats", panelOverrides: { chats: { list: "docked" } } }, version: 2 }),
    )}); } catch { /* storage disabled — the story falls back to its own landing */ }`,
  });
  await page.reload();
  // Installed BEFORE the shell mounts: the moment `.shell-grid` lands in the DOM, read its computed
  // template. `getComputedStyle` forces the style pass, so this IS what the first commit carries.
  await page.evaluate(() => {
    // The PAGE's global object with a probe-only capture slot — no domain type to drift from.
    // FABRICATION-OK: a browser-context globals bag, declared and read in this test alone.
    const bag = globalThis as unknown as { __bootGrid: { cols: string; list: string | null } | null };
    bag.__bootGrid = null;
    const observer = new MutationObserver(() => {
      const grid = document.querySelector(".shell-grid");
      if (grid !== null && bag.__bootGrid === null) {
        bag.__bootGrid = { cols: getComputedStyle(grid).gridTemplateColumns, list: grid.getAttribute("data-list-mode") };
        observer.disconnect();
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  });

  await mount(<AppShellStory />);
  const listPanel = page.locator('.shell-panel[data-panel-side="list"]');
  await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");

  const readBoot = (): Promise<{ cols: string; list: string | null } | null> =>
    // FABRICATION-OK: reads back the same probe-only slot on the PAGE global (see the capture above).
    page.evaluate(() => (globalThis as unknown as { __bootGrid: { cols: string; list: string | null } | null }).__bootGrid);

  // The capture is written ONCE (the observer disconnects) — poll until it lands, then read it settled.
  // The mode attribute is on the element AT INSERTION, not stamped by a later effect.
  await expect.poll(async () => (await readBoot())?.list ?? null, { intervals: [20, 50, 100] }).toBe("docked");
  const boot = await readBoot();
  // rail | LIST | content | context — the LIST track is already the resolved panel width, never 0px.
  // ONESHOT-OK: `__bootGrid` is written once at `.shell-grid` insertion and never again (the observer
  // disconnects); the poll above already awaited it, so this read is provably settled.
  const bootTracks = (boot?.cols ?? "").split(" ").map((t) => Number.parseFloat(t));
  // ONESHOT-OK: derived from the settled one-shot capture above, not a live DOM read.
  expect(bootTracks).toHaveLength(4);
  // ONESHOT-OK: same settled capture.
  expect(bootTracks[1]).toBeGreaterThan(0);
  // …and it is the SAME width the docked panel settles at, so nothing is squeezed after first paint.
  await expect
    .poll(
      async () => {
        const settledWidth = (await listPanel.boundingBox())?.width ?? 0;
        return Math.abs((bootTracks[1] ?? 0) - settledWidth) < 1;
      },
      { intervals: [20, 50, 100] },
    )
    .toBe(true);
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

test("baseline (flat, no glass, no bg-image): surfaces are opaque, no backdrop-filter", async ({ mount }) => {
  const shell = await mount(<ShellCascadeFixture />);
  await expect.poll(() => bgAlpha(shell.getByTestId("panel-probe")), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => bgAlpha(shell.getByTestId("main-probe")), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => bgAlpha(shell.getByTestId("topbar-probe")), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => backdropFilterOf(shell.getByTestId("panel-probe")), { intervals: [20, 50, 100] }).toBe("none");
});

test("glass beats elevation: ramp + blur-panels still leaves .shell-panel translucent", async ({ mount }) => {
  const shell = await mount(<ShellCascadeFixture elevation="ramp" blurSurfaces={["panels"]} />);
  const panel = shell.getByTestId("panel-probe");
  // THE BUG: shell.css's un-:where()'d elevation rule used to out-specificity globals.css's glass
  // rule, so the panel painted the OPAQUE --color-surface-raised elevation fill instead of the
  // translucent glass mix even with blur-panels on. This is the exact assertion that regression flips.
  await expect.poll(() => bgAlpha(panel), { intervals: [20, 50, 100] }).toBeLessThan(1);
  await expect.poll(() => backdropFilterOf(panel), { intervals: [20, 50, 100] }).toContain("blur(");
  await expect.poll(() => backdropFilterOf(panel), { intervals: [20, 50, 100] }).toContain("saturate(");
});

test("glass beats elevation on composer and both dialog popup slots", async ({ mount }) => {
  const shell = await mount(<ShellCascadeFixture elevation="ramp" blurSurfaces={["composer", "modals"]} />);
  const composer = shell.getByTestId("composer-probe");
  await expect.poll(() => bgAlpha(composer), { intervals: [20, 50, 100] }).toBeLessThan(1);
  await expect.poll(() => backdropFilterOf(composer), { intervals: [20, 50, 100] }).toContain("blur(");

  const dialog = shell.getByTestId("dialog-probe");
  const alertDialog = shell.getByTestId("alert-dialog-probe");
  await expect.poll(() => bgAlpha(dialog), { intervals: [20, 50, 100] }).toBeLessThan(1);
  await expect.poll(() => bgAlpha(alertDialog), { intervals: [20, 50, 100] }).toBeLessThan(1);
});

for (const role of MESSAGE_ROLES) {
  test(`glass beats elevation on a "${role}" message bubble (denser reading-surface fill)`, async ({ mount }) => {
    const shell = await mount(<ShellCascadeFixture elevation="ramp" blurSurfaces={["messages"]} messageRole={role} />);
    // The bubble fill is the DENSER --blur-fill-dense mix (a reading surface, per globals.css) — still
    // strictly translucent, never opaque, for every role's own base tone.
    await expect.poll(() => bgAlpha(shell.getByTestId("bubble-probe")), { intervals: [20, 50, 100] }).toBeLessThan(1);
    await expect.poll(() => backdropFilterOf(shell.getByTestId("bubble-probe")), { intervals: [20, 50, 100] }).toContain("blur(");
  });
}

test("elevation alone (glass off) leaves .shell-panel opaque — glass is what flips it, not ramp", async ({ mount }) => {
  const shell = await mount(<ShellCascadeFixture elevation="ramp" />);
  // Matrix cell: ramp × glass-off. Elevation-ramp's own fill (--color-surface-raised) is opaque —
  // confirms the translucency above comes from the glass rule winning, not from ramp itself.
  await expect.poll(() => bgAlpha(shell.getByTestId("panel-probe")), { intervals: [20, 50, 100] }).toBe(1);
});

// ── #135: the mobile blur ruling is the GLASS's own applicability, and it is now rendered-true ──────
// backdrop-filter is too costly on small/low-power devices, so the glass block in the client styles tier
// is scoped to `@media (width > 48rem)` — the exact complement of shell.css's mobile arm. It used to be an
// OVERRIDE in shell.css instead, re-declaring the same selectors at the same specificity in the sheet the
// bundle emits FIRST; the glass won on source order and the ruling had never once taken effect. Only a CT
// can catch that class: both files parse, both selectors exist, and nothing but the rendered cascade knows
// which one won. (Pre-#114 this was unprovable here at all — the CT page did not load the client tier.)

test("at a mobile viewport the glass is not emitted: the panel keeps its own OPAQUE fill and no backdrop-filter", async ({ mount, page }) => {
  await page.setViewportSize(MOBILE);
  const shell = await mount(<ShellCascadeFixture blurSurfaces={["panels", "messages"]} />);
  const panel = shell.getByTestId("panel-probe");
  await expect.poll(() => backdropFilterOf(panel), { intervals: [20, 50, 100] }).toBe("none");
  await expect.poll(() => backdropFilterOf(shell.getByTestId("bubble-probe")), { intervals: [20, 50, 100] }).toBe("none");
  // FULLY opaque, which is the second half of the fix: the deleted shell.css override paired
  // `backdrop-filter: none` with `background-color: revert`, and `revert` in the author origin rolls back
  // to the UA default — transparent — not to `.shell-panel`'s own --color-sidebar. Withholding the glass
  // leaves that fill standing. alpha 1 here therefore fails on BOTH the old bug (glass painted: <1) and
  // the override the old code intended (revert: 0).
  await expect.poll(() => bgAlpha(panel), { intervals: [20, 50, 100] }).toBe(1);
});

test("above the shell breakpoint the same fixture DOES get glass — the exclusion is scoped, not a kill", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const shell = await mount(<ShellCascadeFixture blurSurfaces={["panels", "messages"]} />);
  const panel = shell.getByTestId("panel-probe");
  await expect.poll(() => backdropFilterOf(panel), { intervals: [20, 50, 100] }).toContain("blur(");
  await expect.poll(() => bgAlpha(panel), { intervals: [20, 50, 100] }).toBeLessThan(1);
  await expect.poll(() => backdropFilterOf(shell.getByTestId("bubble-probe")), { intervals: [20, 50, 100] }).toContain("blur(");
});

// ── #137: prefers-reduced-transparency must deliver SOLID, and it delivered TRANSPARENT ─────────────
// The reduce arm used to answer the glass with `background-color: revert`. `revert` rolls the property
// back past the ENTIRE author origin — including the surface's OWN fill, which is an author declaration
// too — so it resolves to the UA default: transparent. The audience that asked for less transparency got
// more of it, at every viewport (the arm is width-unscoped, so it wiped `.shell-panel`'s --color-sidebar
// on a phone as well, where no glass was ever emitted). It is the same `revert` mistake #135 removed from
// shell.css, still live in the block one screen below. The fix drives the glass's two FILL-percentage
// tokens to 100% instead of fighting the fills per-surface: one knob, every surface keeps its own tint,
// and nothing depends on source order. Only a rendered assertion sees any of this — both spellings parse.

/** prefers-reduced-transparency has no `emulateMedia` option in the installed playwright (1.61 —
 *  `contrast` is there, this feature is not), so the CT drives chromium's emulation endpoint directly.
 *
 *  DO NOT `detach()` the session afterwards: emulation overrides are owned by the CDP session and are
 *  REVERTED the moment it disconnects. Probed live — a detaching version of this helper left
 *  `matchMedia("(prefers-reduced-transparency: reduce)")` false and the glass painting, so the tests
 *  passed against the unfixed stylesheet. Playwright disposes the session with the page.
 *
 *  EVERY CALLER STATES THE TOTAL MEDIA STATE, NOT A DELTA (#138, measured on this file). The overrides
 *  outlive the test that set them — playwright reuses the page across the tests in a file, and
 *  `page.emulateMedia({ contrast })` does NOT clear a feature it doesn't model, so a leaked
 *  `prefers-reduced-transparency: reduce` from an earlier test kept the fill at 100% and reddened a 92%
 *  assertion (repro: run the #137 `reduce` test and the #138 light-theme test in that order; the latter
 *  passes alone and fails behind it). One `setEmulatedMedia` call REPLACES the whole feature list, which
 *  is exactly the reset — so name every preference the assertions depend on, every time. */
async function emulateMediaFeatures(page: Page, features: readonly (readonly [name: string, value: string])[]): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setEmulatedMedia", { features: features.map(([name, value]) => ({ name, value })) });
  // Belt: assert every preference actually took, so a future playwright/chromium change that renames or
  // drops a feature reds HERE instead of silently turning the assertions below into a no-preference run.
  const applied = await page.evaluate((fs: readonly (readonly [string, string])[]) => fs.map(([n, v]) => matchMedia(`(${n}: ${v})`).matches), features);
  for (const [index, [name, value]] of features.entries()) {
    expect(applied[index], `chromium must report ${name}: ${value}`).toBe(true);
  }
}

async function emulateReducedTransparency(page: Page, value: "reduce" | "no-preference"): Promise<void> {
  await emulateMediaFeatures(page, [
    ["prefers-reduced-transparency", value],
    // Named explicitly so a leaked `more` from a #138 test can never raise these fills: the two arms
    // both drive --blur-fill-*, so "the preference I did not set" is load-bearing here.
    ["prefers-contrast", "no-preference"],
  ]);
}

const ALL_BLUR_SURFACES = ["panels", "composer", "messages", "modals"] as const;
/** Every probe the glass block paints when all four surfaces are enabled above the shell breakpoint. */
const GLASS_PROBES = ["panel-probe", "composer-probe", "dialog-probe", "alert-dialog-probe", "bubble-probe"] as const;

test("reduced-transparency turns every glass surface SOLID (alpha 1) and drops backdrop-filter", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await emulateReducedTransparency(page, "reduce");
  const shell = await mount(<ShellCascadeFixture blurSurfaces={ALL_BLUR_SURFACES} />);
  await Promise.all(
    GLASS_PROBES.map(async (probe) => {
      // THE BUG: `revert` resolved each of these to rgba(0,0,0,0) — a stated preference for LESS
      // transparency produced surfaces with none of their own paint at all.
      await expect.poll(() => bgAlpha(shell.getByTestId(probe)), { intervals: [20, 50, 100] }).toBe(1);
      await expect.poll(() => backdropFilterOf(shell.getByTestId(probe)), { intervals: [20, 50, 100] }).toBe("none");
    }),
  );
});

test("the same fixture under no-preference still gets the glass — reduce is a preference, not a kill", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await emulateReducedTransparency(page, "no-preference");
  const shell = await mount(<ShellCascadeFixture blurSurfaces={ALL_BLUR_SURFACES} />);
  const panel = shell.getByTestId("panel-probe");
  await expect.poll(() => bgAlpha(panel), { intervals: [20, 50, 100] }).toBeLessThan(1);
  await expect.poll(() => backdropFilterOf(panel), { intervals: [20, 50, 100] }).toContain("blur(");
});

test("reduced-transparency leaves the phone's own fills standing (the reduce arm is width-unscoped)", async ({ mount, page }) => {
  await page.setViewportSize(MOBILE);
  await emulateReducedTransparency(page, "reduce");
  const shell = await mount(<ShellCascadeFixture blurSurfaces={ALL_BLUR_SURFACES} />);
  // Below the shell breakpoint no glass is emitted at all (#135), so there is nothing for this arm to
  // answer — and the old `revert` still fired, stripping `.shell-panel`'s --color-sidebar. A phone with
  // the preference set rendered a see-through side panel.
  await expect.poll(() => bgAlpha(shell.getByTestId("panel-probe")), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => bgAlpha(shell.getByTestId("main-probe")), { intervals: [20, 50, 100] }).toBe(1);
});

test("reduced-transparency reaches the reading-surface backing too (the arm used to miss .shell-main)", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await emulateReducedTransparency(page, "reduce");
  const shell = await mount(<ShellCascadeFixture blurSurfaces={["panels"]} hasBgImage={true} section="characters" />);
  // The glass block has SIX rules; the reduce arm hand-listed five and left `.shell-main`'s
  // reading-surface glass out, so a non-Chats section over a photo kept both its 70% fill and a live
  // backdrop-filter under the preference. Driving the fill token covers every rule by construction.
  await expect.poll(() => bgAlpha(shell.getByTestId("main-probe")), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => backdropFilterOf(shell.getByTestId("main-probe")), { intervals: [20, 50, 100] }).toBe("none");
});

// ── #138: the contrast block was spelled `high`, which matches NOTHING, so it had never rendered ────
// `prefers-contrast: high` is the WebKit-era value; MQ5 renamed it to `more`, and Chromium/Firefox only
// ever report `more`. The block therefore sat in the sheet, parsed and plausible, doing nothing for
// every high-contrast user. Respelling it is behaviour-ENABLING, so these pins are the receipt that what
// starts firing is what was intended: thicker borders, a HIGHER glass fill (92%, driven through the
// #137 fill knob so each surface keeps its own tint instead of the hand-written --color-sidebar mix that
// flattened both modal slots), the grain overlay dropped — and reduced-transparency still winning the
// alpha when a user has set both preferences.
//
// THE EDGE PINS BELOW ARE THE SECOND PASS, and they exist because the first cut shipped three rendered
// defects a green CT did not see (side-eye, reports/side-eye-138/):
//   · `border-width: 2px` is a FOUR-SIDED shorthand, and Tailwind v4's preflight sets `border: 0 solid`
//     on everything — border-STYLE is solid app-wide, only the width is 0. So the shorthand un-zeroed
//     three sides per surface and painted them `currentColor`: a 2px near-white stripe down the list
//     panel's left edge, measured 15.66:1 against its own fill. Hence the per-side widths AND the
//     zero-side assertions here — the sides a surface does not author must stay at 0px.
//   · the border it thickened was a 7%-alpha hairline: 1.16:1 at 2px, against a 3:1 non-text floor. The
//     colour is raised with the width now, and it is pinned by a FRAMEBUFFER read, because that is the
//     only instrument that sees a translucent border composited over a glass surface.
//   · every rule was gated on `html[data-blur-*]`, so a contrast user who turned the glass off got
//     nothing. The edge half is un-gated now (and width-scoped instead), which the no-blur and
//     sub-breakpoint arms below pin from both directions.

/** The contrast arm with reduced-transparency pinned OFF. Playwright models `contrast` natively
 *  (`page.emulateMedia({ contrast })`) and that spelling is fine in isolation — but it leaves an
 *  earlier test's `prefers-reduced-transparency` override standing, and that preference outranks this
 *  one on the very tokens these tests assert. So both go through the one CDP call. */
async function emulateContrast(page: Page, contrast: "more" | "no-preference"): Promise<void> {
  await emulateMediaFeatures(page, [
    ["prefers-contrast", contrast],
    ["prefers-reduced-transparency", "no-preference"],
  ]);
}

/** Resolves `color-mix(in oklab, var(<token>) <pct>, transparent)` in the PAGE's own cascade, so the
 *  expectation is the theme's real value rather than a hardcoded colour. The probe is APPENDED before it
 *  is read: `getComputedStyle` on a detached element returns an empty string, which would make every
 *  comparison below silently compare "" to "". */
function resolveMixedFill(page: Page, token: string, pct: string): Promise<string> {
  return page.evaluate(
    ([t, p]: readonly [string, string]) => {
      const probe = document.createElement("div");
      probe.style.backgroundColor = `color-mix(in oklab, var(${t}) ${p}, transparent)`;
      document.body.append(probe);
      const resolved = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return resolved;
    },
    [token, pct] as const,
  );
}

function borderInlineEndWidthOf(locator: Locator): Promise<string> {
  return locator.evaluate((el) => getComputedStyle(el).getPropertyValue("border-inline-end-width"));
}

/** All four LOGICAL border widths. Read as a set, never one side: the defect this pins is a rule painting
 *  the three sides a surface never authors, which a single-side assertion is blind to by construction. */
function borderWidthsOf(locator: Locator): Promise<Record<"blockStart" | "blockEnd" | "inlineStart" | "inlineEnd", string>> {
  return locator.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      blockEnd: s.getPropertyValue("border-block-end-width"),
      blockStart: s.getPropertyValue("border-block-start-width"),
      inlineEnd: s.getPropertyValue("border-inline-end-width"),
      inlineStart: s.getPropertyValue("border-inline-start-width"),
    };
  });
}

function bgColorOf(locator: Locator): Promise<string> {
  return locator.evaluate((el) => getComputedStyle(el).backgroundColor);
}

interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** One FRAMEBUFFER pixel at page coordinates, decoded in-browser (no image dependency in the runner) —
 *  the same technique message-list-surface.ct.tsx uses. Computed style cannot answer the question this
 *  block asks: a border's contrast is what LANDS, i.e. the border composited over whatever the glass let
 *  through, and `getComputedStyle` reports the authored colour of each layer separately. */
async function samplePixel(page: Page, x: number, y: number): Promise<Rgb> {
  const clip = await page.screenshot({ clip: { height: 1, width: 1, x, y } });
  const dataUrl = `data:image/png;base64,${clip.toString("base64")}`;
  return await page.evaluate(async (url: string) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (ctx === null) {
      throw new Error("no 2d context");
    }
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, 1, 1).data;
    return { b: data[2] ?? 0, g: data[1] ?? 0, r: data[0] ?? 0 };
  }, dataUrl);
}

/** WCAG 2.1 relative luminance + contrast ratio, on framebuffer RGB (already composited, so no alpha). */
function contrastRatio(a: Rgb, b: Rgb): number {
  const luminance = ({ r, g, b: blue }: Rgb): number => {
    const channel = (c: number): number => {
      const s = c / 255;
      // WCAG's 0.03928 knee, written with a separator only because biome's numeric-literal rule wants one.
      return s <= 0.039_28 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(blue);
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG 1.4.11 non-text contrast: a UI boundary must clear 3:1 to count as visible. The whole point of
 *  this block is that the panel's TEXT was already 8.66:1 while its EDGE measured 1.16:1. */
const NON_TEXT_FLOOR = 3;

/**
 * Measures the list panel's inline-end seam off the framebuffer: the ratio between the border's own
 * pixels and the panel interior a few px inside it. `boundingBox()` is the BORDER box, so the last
 * rendered column belongs to the border.
 *
 * MOUNT WITH `omitMainRegion` OR THIS MEASURES NOTHING. The fixture's regions share one grid cell, so
 * `.shell-main` lays out directly on top of the panel and paints its opaque fill over the seam — the
 * first version of these pins sampled a uniform viewport and reported a flat 1.0 (the no-preference
 * control would have PASSED on that, which is why the control below floors the ratio above 1 as its own
 * positive control rather than only capping it).
 */
async function listPanelEdgeRatio(page: Page, panel: Locator): Promise<number> {
  const box = await panel.boundingBox();
  expect(box, "the list panel probe must be laid out before its edge can be sampled").not.toBeNull();
  const { x, y, width, height } = box as NonNullable<typeof box>;
  const midY = Math.floor(y + height / 2);
  const [edge, interior] = await Promise.all([samplePixel(page, Math.floor(x + width) - 1, midY), samplePixel(page, Math.floor(x + width) - 8, midY)]);
  const ratio = contrastRatio(edge, interior);
  // The MEASURED number, into reports/ct-report.json. An a11y threshold assertion that only ever prints
  // pass/fail makes the next reader re-derive the margin by hand; these annotations are the receipt.
  test.info().annotations.push({
    description: `${ratio.toFixed(2)}:1 · edge rgb(${edge.r},${edge.g},${edge.b}) vs interior rgb(${interior.r},${interior.g},${interior.b})`,
    type: "edge-contrast",
  });
  return ratio;
}

/** The contrast arm's own fill percentage (globals.css) — an authored dial with no token, like the reduce
 *  arm's 100%. Kept as one constant so a change to the sheet reds one line, not five. */
const CONTRAST_FILL = "92%";
const CONTRAST_FILL_ALPHA = 0.92;

test("#138 receipt: an emulated high-contrast user reports `more`; the shipped `high` spelling matched nothing", async ({ page }) => {
  // Not a defect pin (it passes against the un-respelled sheet) — it is the instrument receipt the whole
  // block rests on, and it reds if a chromium/playwright change ever revives the WebKit-era value.
  await emulateContrast(page, "more");
  const seen = await page.evaluate(() => ({
    more: matchMedia("(prefers-contrast: more)").matches,
    high: matchMedia("(prefers-contrast: high)").matches,
    noPreference: matchMedia("(prefers-contrast: no-preference)").matches,
  }));
  expect(seen).toStrictEqual({ more: true, high: false, noPreference: false });
});

test("contrast: more thickens ONLY the side each surface authors — the other three stay at 0px", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await emulateContrast(page, "more");
  const shell = await mount(<ShellCascadeFixture blurSurfaces={ALL_BLUR_SURFACES} />);
  // THE P1 DEFECT, from both directions. Tailwind preflight (`border: 0 solid`) leaves border-STYLE solid
  // everywhere, so a `border-width` shorthand here paints all four sides in `currentColor` — the panel's
  // near-white TEXT colour. The zero assertions are the load-bearing half: the 2px alone was green while a
  // 900px white stripe ran down the panel's left edge.
  await expect
    .poll(() => borderWidthsOf(shell.getByTestId("panel-probe")), { intervals: [20, 50, 100] })
    .toStrictEqual({ blockEnd: "0px", blockStart: "0px", inlineEnd: "2px", inlineStart: "0px" });
  // The MIRROR side, which is how we know the rule is per-side and not "whatever the list panel needed".
  await expect
    .poll(() => borderWidthsOf(shell.getByTestId("context-panel-probe")), { intervals: [20, 50, 100] })
    .toStrictEqual({ blockEnd: "0px", blockStart: "0px", inlineEnd: "0px", inlineStart: "2px" });
  // The composer authors all four sides (`border border-border`), so there the shorthand is correct.
  await expect
    .poll(() => borderWidthsOf(shell.getByTestId("composer-probe")), { intervals: [20, 50, 100] })
    .toStrictEqual({ blockEnd: "2px", blockStart: "2px", inlineEnd: "2px", inlineStart: "2px" });
  // Bubbles author NO border at any viewport — a contrast rule there does not thicken one, it MINTS one.
  // Their half of this block is the 92% dense fill, asserted below.
  await expect
    .poll(() => borderWidthsOf(shell.getByTestId("bubble-probe")), { intervals: [20, 50, 100] })
    .toStrictEqual({ blockEnd: "0px", blockStart: "0px", inlineEnd: "0px", inlineStart: "0px" });
});

test("contrast: more raises the glass fill to 92% — each surface keeping its OWN tint", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await emulateContrast(page, "more");
  const shell = await mount(<ShellCascadeFixture blurSurfaces={ALL_BLUR_SURFACES} />);
  const panel = shell.getByTestId("panel-probe");
  // The opacity half, through the glass's fill knob: chrome 70% → 92%, dense (bubbles) 88% → 92%. The old
  // hand-written arm bumped no bubble fill at all, and covered neither `.shell-main` nor the breakpoint.
  await expect.poll(() => bgAlpha(panel), { intervals: [20, 50, 100] }).toBeCloseTo(CONTRAST_FILL_ALPHA, 2);
  await expect.poll(() => bgAlpha(shell.getByTestId("bubble-probe")), { intervals: [20, 50, 100] }).toBeCloseTo(CONTRAST_FILL_ALPHA, 2);
  // THE TINT DEFECT: the deleted arm re-spelled the fill as a --color-sidebar mix for all four selectors,
  // including the two modal slots the glass rule tints --color-popover. Driving the knob leaves every
  // rule's own token standing, so the modal is a popover again.
  const [popoverMix, sidebarMix] = await Promise.all([
    resolveMixedFill(page, "--color-popover", CONTRAST_FILL),
    resolveMixedFill(page, "--color-sidebar", CONTRAST_FILL),
  ]);
  // Guard the assertion below against a theme where the two tokens happen to agree (it would pass for the
  // wrong reason on any palette that ever unified them).
  expect(popoverMix, "the two tints must differ, or the modal assertion proves nothing").not.toBe(sidebarMix);
  await expect.poll(() => bgColorOf(shell.getByTestId("dialog-probe")), { intervals: [20, 50, 100] }).toBe(popoverMix);
  await expect.poll(() => bgColorOf(shell.getByTestId("alert-dialog-probe")), { intervals: [20, 50, 100] }).toBe(popoverMix);
});

// The P2 pins. Width without colour is a doubled invisible line: the shipped hairline is 7% alpha, and
// side-eye measured the 2px result at 1.16:1 against the panel it separates — on a surface whose TEXT was
// already 8.66:1. Both arms run through the framebuffer because a translucent border over a translucent
// glass panel has no computed-style answer: `getComputedStyle` reports the two authored layers, never the
// pixel a reader actually sees.
for (const theme of ["dark", "light"] as const) {
  test(`contrast: more makes the list panel's seam actually VISIBLE (≥3:1 by framebuffer, ${theme})`, async ({ mount, page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await emulateContrast(page, "more");
    const shell = await mount(<ShellCascadeFixture blurSurfaces={ALL_BLUR_SURFACES} dataTheme={theme === "light" ? "light" : null} omitMainRegion={true} />);
    const panel = shell.getByTestId("panel-probe");
    await expect.poll(() => borderInlineEndWidthOf(panel), { intervals: [20, 50, 100] }).toBe("2px");
    await expect.poll(() => listPanelEdgeRatio(page, panel), { intervals: [50, 100, 200] }).toBeGreaterThanOrEqual(NON_TEXT_FLOOR);
  });

  test(`under contrast: no-preference that same seam is the hairline it always was (${theme})`, async ({ mount, page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await emulateContrast(page, "no-preference");
    const shell = await mount(<ShellCascadeFixture blurSurfaces={ALL_BLUR_SURFACES} dataTheme={theme === "light" ? "light" : null} omitMainRegion={true} />);
    const panel = shell.getByTestId("panel-probe");
    // The control that keeps the pin above honest: the raise is the PREFERENCE's doing, not the theme's.
    // A hairline below the non-text floor is the deliberate resting state — this block is what closes it.
    const ratio = await listPanelEdgeRatio(page, panel);
    expect(ratio, "the shipped hairline is BELOW the non-text floor — closing that is what this block is for").toBeLessThan(NON_TEXT_FLOOR);
    // …and strictly above 1, which is this test's own positive control: a screenshot that sampled the
    // wrong element (or a covered panel) returns the identical pixel twice and would otherwise sail
    // through the assertion above.
    expect(ratio, "edge and interior must differ at all — an exactly-1.0 ratio means the sample missed the seam").toBeGreaterThan(1);
  });
}

test("the contrast edge does NOT depend on the glass toggle — blur off, the seam is still raised", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await emulateContrast(page, "more");
  // THE P2 GATING DEFECT: every rule used to be gated on `html[data-blur-*]`, so a contrast user who
  // turned off an AESTHETIC toggle silently lost the whole accessibility treatment. No blur surfaces here.
  const shell = await mount(<ShellCascadeFixture omitMainRegion={true} />);
  const panel = shell.getByTestId("panel-probe");
  await expect.poll(() => borderInlineEndWidthOf(panel), { intervals: [20, 50, 100] }).toBe("2px");
  await expect.poll(() => listPanelEdgeRatio(page, panel), { intervals: [50, 100, 200] }).toBeGreaterThanOrEqual(NON_TEXT_FLOOR);
  // Still per-side with the glass off, i.e. the currentColor stripe cannot come back through this door.
  await expect
    .poll(() => borderWidthsOf(panel), { intervals: [20, 50, 100] })
    .toStrictEqual({ blockEnd: "0px", blockStart: "0px", inlineEnd: "2px", inlineStart: "0px" });
});

test("below the shell breakpoint the contrast edge is NOT emitted — that layout authors a different seam", async ({ mount, page }) => {
  await page.setViewportSize(MOBILE);
  await emulateContrast(page, "more");
  const shell = await mount(<ShellCascadeFixture blurSurfaces={ALL_BLUR_SURFACES} />);
  // The edge half carries shell.css's mobile complement (`width > 48rem`, the #135 literal) because below
  // it the panels are full-bleed overlays whose seam is `border-block-start`, not the inline edge — a
  // desktop rule there paints an edge no layout has. (The fill half needs no such scoping: it is a token
  // the glass recipe consumes, and no glass is emitted down here at all.)
  await expect.poll(() => borderInlineEndWidthOf(shell.getByTestId("panel-probe")), { intervals: [20, 50, 100] }).not.toBe("2px");
});

test("the same fixture under contrast: no-preference keeps the plain glass — the arm is a preference, not a baseline", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await emulateContrast(page, "no-preference");
  const shell = await mount(<ShellCascadeFixture blurSurfaces={ALL_BLUR_SURFACES} />);
  const panel = shell.getByTestId("panel-probe");
  await expect.poll(() => borderInlineEndWidthOf(panel), { intervals: [20, 50, 100] }).toBe("1px");
  // The token defaults (--blur-fill-chrome 70% / --blur-fill-dense 88%), i.e. strictly more translucent
  // than the contrast arm — which is the whole claim "more opacity" makes.
  await expect.poll(() => bgAlpha(panel), { intervals: [20, 50, 100] }).toBeLessThan(CONTRAST_FILL_ALPHA);
  await expect.poll(() => bgAlpha(shell.getByTestId("bubble-probe")), { intervals: [20, 50, 100] }).toBeLessThan(CONTRAST_FILL_ALPHA);
});

test("BOTH preferences set: reduced-transparency wins the alpha (fully solid, not 92%) and the contrast border still applies", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  // One CDP call, both features — see emulateMediaFeatures: setEmulatedMedia REPLACES the feature list,
  // so page.emulateMedia({contrast}) followed by a CDP reduced-transparency call would drop the contrast.
  await emulateMediaFeatures(page, [
    ["prefers-contrast", "more"],
    ["prefers-reduced-transparency", "reduce"],
  ]);
  const shell = await mount(<ShellCascadeFixture blurSurfaces={ALL_BLUR_SURFACES} />);
  await Promise.all(
    GLASS_PROBES.map(async (probe) => {
      // The rule the two arms are ordered by, and the reason the contrast fill lives behind
      // `not (prefers-reduced-transparency: reduce)` rather than trusting source order: a user asking for
      // less transparency gets 100%, never the contrast arm's 92%.
      await expect.poll(() => bgAlpha(shell.getByTestId(probe)), { intervals: [20, 50, 100] }).toBe(1);
      await expect.poll(() => backdropFilterOf(shell.getByTestId(probe)), { intervals: [20, 50, 100] }).toBe("none");
    }),
  );
  // …and the contrast arm's non-alpha half is unaffected by the yield: both preferences are honoured.
  await expect.poll(() => borderInlineEndWidthOf(shell.getByTestId("panel-probe")), { intervals: [20, 50, 100] }).toBe("2px");
});

/** The grain overlay paints in `.shell-grid::after`, i.e. on the fixture's ROOT element — `mount()`'s own
 *  locator, never `shell.getByTestId("shell-grid")` (getByTestId searches DESCENDANTS, so that spelling
 *  matches nothing and every poll below it times out reading like a style failure). */
function afterDisplayOf(shell: Locator): Promise<string> {
  return shell.evaluate((el) => getComputedStyle(el, "::after").display);
}

test("contrast: more drops the grain overlay (a noise texture works against a stated contrast preference)", async ({ mount, page }) => {
  await emulateContrast(page, "more");
  const shell = await mount(<ShellCascadeFixture surfaceTexture="grain" />);
  await expect.poll(() => afterDisplayOf(shell), { intervals: [20, 50, 100] }).toBe("none");
});

test("under contrast: no-preference the same grain overlay still paints — the drop is the preference's doing", async ({ mount, page }) => {
  await emulateContrast(page, "no-preference");
  const shell = await mount(<ShellCascadeFixture surfaceTexture="grain" />);
  await expect.poll(() => afterDisplayOf(shell), { intervals: [20, 50, 100] }).not.toBe("none");
});

test("the contrast fill is per-surface in the LIGHT theme too — the modal tracks --color-popover, not a baked colour", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await emulateContrast(page, "more");
  const shell = await mount(<ShellCascadeFixture blurSurfaces={ALL_BLUR_SURFACES} dataTheme="light" />);
  // Same assertion as the dark arm, resolved against the light palette: proof the fix is the fill KNOB
  // (a percentage) and not a colour this block re-spells — the failure mode the deleted --color-sidebar
  // mix was an instance of.
  const popoverMix = await resolveMixedFill(page, "--color-popover", CONTRAST_FILL);
  await expect.poll(() => bgColorOf(shell.getByTestId("dialog-probe")), { intervals: [20, 50, 100] }).toBe(popoverMix);
  await expect.poll(() => bgAlpha(shell.getByTestId("panel-probe")), { intervals: [20, 50, 100] }).toBeCloseTo(CONTRAST_FILL_ALPHA, 2);
});

test("background-image beats elevation: .shell-main goes transparent, .shell-topbar stays opaque", async ({ mount }) => {
  const shell = await mount(<ShellCascadeFixture elevation="ramp" hasBgImage={true} />);
  // THE BUG: shell.css's un-:where()'d elevation rule for .shell-main used to out-specificity the
  // has-bg-image transparent rule, burying the fixed <ThemeBackgroundLayer> under an opaque
  // --color-card fill even with an image set. This is the exact assertion that regression flips.
  await expect.poll(() => bgAlpha(shell.getByTestId("main-probe")), { intervals: [20, 50, 100] }).toBe(0);
  // .shell-topbar was deliberately EXCLUDED from the transparent rule — chrome stays legible.
  await expect.poll(() => bgAlpha(shell.getByTestId("topbar-probe")), { intervals: [20, 50, 100] }).toBe(1);
});

test("elevation alone (bg-image off) leaves .shell-main opaque — bg-image is what flips it, not ramp", async ({ mount }) => {
  const shell = await mount(<ShellCascadeFixture elevation="ramp" />);
  // Matrix cell: ramp × bg-off. Elevation-ramp's own fill (--color-card) is opaque — confirms the
  // transparency above comes from has-bg-image winning, not from ramp itself.
  await expect.poll(() => bgAlpha(shell.getByTestId("main-probe")), { intervals: [20, 50, 100] }).toBe(1);
});

// ── WS3: the reading/document CONTENT backing over a bg image (only Chats stays immersive) ──────────

test("bg-image + a non-Chats section: .shell-main gets a SOLID reading backing, not the photo", async ({ mount }) => {
  const shell = await mount(<ShellCascadeFixture hasBgImage={true} section="characters" />);
  // THE DEFECT: a document/reader section (character detail, world-info, …) used to inherit the Chats
  // immersive transparency and float its prose directly on the photo. A non-Chats section now backs the
  // content column with an opaque --color-card reading surface.
  await expect.poll(() => bgAlpha(shell.getByTestId("main-probe")), { intervals: [20, 50, 100] }).toBe(1);
});

test("bg-image + a non-Chats section + blur-panels: the reading backing upgrades to glass (panel parity)", async ({ mount }) => {
  const shell = await mount(<ShellCascadeFixture hasBgImage={true} section="characters" blurSurfaces={["panels"]} />);
  const main = shell.getByTestId("main-probe");
  await expect.poll(() => bgAlpha(main), { intervals: [20, 50, 100] }).toBeLessThan(1);
  await expect.poll(() => backdropFilterOf(main), { intervals: [20, 50, 100] }).toContain("blur(");
});

test("bg-image + the Chats section stays IMMERSIVE: .shell-main transparent (photo behind the thread)", async ({ mount }) => {
  const shell = await mount(<ShellCascadeFixture hasBgImage={true} section="chats" />);
  // The carve-out: Chats keeps the transparent path so the message thread shows the image behind bubbles
  // that carry their own fill — the reading-surface backing must NOT reach it.
  await expect.poll(() => bgAlpha(shell.getByTestId("main-probe")), { intervals: [20, 50, 100] }).toBe(0);
});

// ── WS3: the Chats-immersive landing HERO scrim chip (anchor the copy over the photo) ───────────────

test("bg-image + Chats: the landing empty-state hero gets a frosted scrim chip (anchored over the photo)", async ({ mount }) => {
  const shell = await mount(<ShellCascadeFixture hasBgImage={true} section="chats" />);
  const hero = shell.getByTestId("empty-state-probe");
  // Chats stays immersive (main transparent, asserted above) — but the empty-state COPY is anchored in a
  // translucent themed scrim so it clears AA over ANY photo region instead of floating at ~2:1.
  await expect.poll(() => bgAlpha(hero), { intervals: [20, 50, 100] }).toBeGreaterThan(0);
  await expect.poll(() => bgAlpha(hero), { intervals: [20, 50, 100] }).toBeLessThan(1);
  await expect.poll(() => backdropFilterOf(hero), { intervals: [20, 50, 100] }).toContain("blur(");
});

test("bg-image + a NON-Chats section: the empty-state hero is NOT scrim-chipped (backed content already)", async ({ mount }) => {
  const shell = await mount(<ShellCascadeFixture hasBgImage={true} section="characters" />);
  // Non-Chats content is already backed (the reading surface) — the hero needs no separate chip, so the
  // scrim rule is Chats-scoped and must NOT fire here.
  await expect.poll(() => bgAlpha(shell.getByTestId("empty-state-probe")), { intervals: [20, 50, 100] }).toBe(0);
});

test("no bg-image + Chats: the landing hero is NOT scrim-chipped (nothing to float over)", async ({ mount }) => {
  const shell = await mount(<ShellCascadeFixture section="chats" />);
  await expect.poll(() => bgAlpha(shell.getByTestId("empty-state-probe")), { intervals: [20, 50, 100] }).toBe(0);
});

test("useAppearanceRootEffects lands a representative axis on <html> as a real computed effect", async ({ mount, page }) => {
  await mount(<ShellCascadeFixture fontScale={1.25} />);
  // globals.css's `:root { font-size: calc(100% * var(--font-scale)) }` floor reads this custom
  // property — proves the root-stamp hook actually reaches computed style, not just a JS assignment.
  const fontScale = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--font-scale").trim());
  expect(fontScale).toBe("1.25");
});

// ── chatWidthPct / fontScale root vars — through the REAL AppShell (§11.1), not the bare fixture ──
// `useAppearance()` reads the synced `getUserSettings` blob (routeTrpc-stubbed here) — this exercises
// the actual production stamping path (app-shell.tsx's `--width-shell-content` inline style +
// `useAppearanceRootEffects`'s `--font-scale`), not a re-implementation of the clamp/scale formulas.

// The one browser-default constant this file leans on (no token exists for it — same precedent as
// avatar.ct.tsx's ROOT_PX): the UA root font-size before any `:root { font-size }` override.
const UA_ROOT_PX = 16;

test("chatWidthPct stamps a real rendered max-width on a --width-shell-content consumer", async ({ mount, page }) => {
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
  const computedMaxWidthPx = await shell.getByTestId("width-probe").evaluate((el) => Number.parseFloat(getComputedStyle(el).maxWidth));
  const expectedPx = (chatWidthPct / 100) * viewportWidth;
  expect(computedMaxWidthPx).toBeCloseTo(expectedPx, 0);
});

test("fontScale stamps a real rendered <html> font-size (UA root × fontScale)", async ({ mount, page }) => {
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
    .poll(() => page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize)), { intervals: [20, 50, 100] })
    .toBeCloseTo(UA_ROOT_PX * fontScale, 0);
});

// STRAY-FILE-DROP GUARD. A file dropped outside any dropzone navigates the tab to that file — the app is
// replaced by a PNG and the session (open chat, in-flight turn, unsaved drafts) goes with it. The shell
// cancels the browser default for FILE drags nothing else handled, and says where files DO go; a real
// dropzone still imports, because its own preventDefault runs first and the guard skips a handled event.

/** Where the probe parks its verdict — a body attribute rather than a window property, so the reader needs
 *  no cast (a `globalThis as unknown as {...}` is the fabrication the no-test-fabrication gate forbids). */
const DROP_PROBE_ATTR = "data-drop-prevented";

/** Records whether the drop's DEFAULT was cancelled — i.e. whether the browser would have navigated.
 *  Registered per drop and AFTER mount, so it runs after the shell's own window listener. */
async function watchDropDefault(page: Page): Promise<void> {
  await page.evaluate((attr) => {
    document.body.removeAttribute(attr);
    globalThis.addEventListener(
      "drop",
      (event) => {
        document.body.setAttribute(attr, String(event.defaultPrevented));
      },
      { once: true },
    );
  }, DROP_PROBE_ATTR);
}

function readDropDefault(page: Page): Promise<boolean> {
  return page.evaluate((attr) => document.body.getAttribute(attr) === "true", DROP_PROBE_ATTR);
}

/** Dispatch a real file drag+drop at a locator and report whether the default was cancelled. */
async function dropFileOn(page: Page, target: Locator, fileName: string): Promise<boolean> {
  await watchDropDefault(page);
  const dataTransfer = await page.evaluateHandle((name) => {
    const dt = new DataTransfer();
    dt.items.add(new File(["card-bytes"], name, { type: "image/png" }));
    return dt;
  }, fileName);
  await target.dispatchEvent("dragover", { dataTransfer });
  await target.dispatchEvent("drop", { dataTransfer });
  return readDropDefault(page);
}

test("a file dropped OUTSIDE any dropzone is swallowed (no navigation) and says where files go", async ({ mount, page }) => {
  await mount(<AppShellDropGuardStory />);
  const prevented = await dropFileOn(page, page.locator("main.shell-content"), "card.png");
  expect(prevented).toBe(true);
  await expect(page.getByText("Nothing imports from here")).toBeVisible();
  // Swallowed, not smuggled: the guard never feeds a stray file to some zone the user didn't aim at.
  await expect(page.getByTestId("imported")).toHaveText("");
});

test("the guard stays out of a REAL dropzone's way — a drop on the zone still imports, with no hint", async ({ mount, page }) => {
  await mount(<AppShellDropGuardStory />);
  const prevented = await dropFileOn(page, page.locator('[data-slot="file-dropzone"]'), "hero.png");
  expect(prevented).toBe(true); // the ZONE cancelled it — that is what stops the navigation there
  await expect(page.getByTestId("imported")).toHaveText("hero.png");
  await expect(page.getByText("Nothing imports from here")).toHaveCount(0);
});

test("a non-file drag is left entirely alone — the guard is files-only", async ({ mount, page }) => {
  await mount(<AppShellDropGuardStory />);
  await watchDropDefault(page);
  const dataTransfer = await page.evaluateHandle(() => {
    const dt = new DataTransfer();
    dt.setData("text/plain", "some dragged prose");
    return dt;
  });
  const main = page.locator("main.shell-content");
  await main.dispatchEvent("dragover", { dataTransfer });
  await main.dispatchEvent("drop", { dataTransfer });
  // Cancelling a text drop would break dropping selected text into the composer — its insertion IS the default.
  expect(await readDropDefault(page)).toBe(false);
  await expect(page.getByText("Nothing imports from here")).toHaveCount(0);
});

// ── PANE-LESS SECTIONS (side-eye F1/F2/F6) — no doors onto panes that do not exist ──────────────────

test("a section with NO panes ships NO panel chrome: no list toggle, no detail-panel toggle, no focus toggle", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([]), "character.list": { items: [], nextCursor: null } });
  const shell = await mount(<AppShellOnSectionStory section="home" />);

  await expect(shell.locator('[data-home-tile="home.jump"]')).toBeVisible();
  // Home declares BOTH panels unavailable, so all three panel affordances are absent — not disabled, not
  // present-but-dead. The focus toggle in particular cold-booted labelled "Exit focus mode", because zero
  // panels trivially reads as "both collapsed".
  await expect(page.getByRole("button", { name: LIST_TOGGLE_RE })).toHaveCount(0);
  await expect(page.getByRole("button", { name: CONTEXT_TOGGLE_RE })).toHaveCount(0);
  await expect(page.getByRole("button", { name: FOCUS_TOGGLE_RE })).toHaveCount(0);
  // …and the CONTEXT track carries no body at all (no "Select something to see its details here" pane
  // parked off-screen behind a toggle nothing can reach).
  await expect(page.locator('.shell-panel[data-panel-side="context"]')).toHaveAttribute("data-panel-mode", "collapsed");
  await expect(page.locator('.shell-panel[data-panel-side="context"] .shell-panel-body')).toBeEmpty();
});

test("a section WITH panes still ships both toggles — the gate is per-section capability, not a global removal", async ({ mount }) => {
  const shell = await mount(<AppShellStory />);

  await expect(shell.getByRole("button", { name: LIST_TOGGLE_RE })).toBeVisible();
  await expect(shell.getByRole("button", { name: CONTEXT_TOGGLE_RE })).toBeVisible();
  await expect(shell.getByRole("button", { name: FOCUS_TOGGLE_RE })).toBeVisible();
});

test("MOBILE: a collapsed drawer is the FULL viewport wide and entirely off-screen — never a dead slab over content", async ({ mount, page }) => {
  // The app-wide regression this pins: the desktop `--panel-context-w` rule out-specified the mobile
  // block's `width:100dvw`, so at ≤48rem a COLLAPSED context drawer kept its 272px desktop width and —
  // with `inset-inline:0` resolving to the inline start — painted 272px of dead panel OVER content on
  // EVERY section. Asserted on both panels, as rendered.
  await page.setViewportSize(MOBILE);
  await mount(<AppShellStory />);

  const assertOffScreenDrawer = async (side: string): Promise<void> => {
    const panel = page.locator(`.shell-panel[data-panel-side="${side}"]`);
    await expect(panel).toHaveAttribute("data-panel-mode", "collapsed");
    const width = await panel.evaluate((el) => Number.parseFloat(globalThis.getComputedStyle(el).width));
    expect(width).toBe(MOBILE.width);
    // …and its visible x-range is entirely outside the viewport (left of 0, or right of the width).
    const box = await panel.boundingBox();
    const start = box?.x ?? 0;
    const end = start + (box?.width ?? 0);
    expect(end <= 0 || start >= MOBILE.width).toBe(true);
  };

  await assertOffScreenDrawer("list");
  await assertOffScreenDrawer("context");
});

// ── OVERLAY IS A SHEET, NOT A DOCKED PANE (crunch-list item 22, owner receipt at ~960 CSS px) ───────
// In the 48–64rem band (and on mobile) a panel FLOATS over content that stays laid out full-width
// underneath, so controls are cut mid-element at the panel's edge. That reads as breakage unless the
// float itself is unmistakable — owner verbatim: "panels become not full height and act kinda strange".
// Measured on the live stack before the fix: `box-shadow: none` on the open overlay panel (the docked
// pane's 1px track hairline was its ONLY edge), and the context pane still wore the 2px ember
// content↔context binding with nothing to bind to. The scrim was already correct and DOES dim (sampled
// content text 171→72 sRGB with the sheet open), so these pin the two affordances that were missing,
// plus the background-inertness the scrim's `pointer-events` half already implied.

/** The computed `box-shadow` of an element — `"none"` when it has none. */
function boxShadowOf(locator: Locator): Promise<string> {
  return locator.evaluate((el) => getComputedStyle(el).boxShadow);
}

for (const side of ["list", "context"] as const) {
  test(`the ${side} pane floating at 48-64rem wears the house sheet elevation — a docked one does not`, async ({ mount, page }) => {
    await page.setViewportSize(NARROW_DESKTOP);
    const shell = await mount(<AppShellStory />);
    const panel = page.locator(`.shell-panel[data-panel-side="${side}"]`);
    const toggle = side === "list" ? LIST_TOGGLE_RE : CONTEXT_TOGGLE_RE;

    await shell.getByRole("button", { name: toggle }).click();
    await expect(panel).toHaveAttribute("data-panel-mode", "overlay");
    // --shadow-overlay is the app's ONE float recipe (dialog/popover/menu/tooltip/toast/drawer all ride
    // it); a sheet that shares it reads like every other float in the app instead of like a clipped dock.
    await expect.poll(() => boxShadowOf(panel), { intervals: [20, 50, 100] }).not.toBe("none");
    const floating = await boxShadowOf(panel);

    // …and the SAME pane docked at full width carries no float shadow — it is in the grid, not over it.
    // (chats' CONTEXT default is collapsed, so dock it explicitly; the LIST one is docked by default.)
    await page.setViewportSize(WIDE);
    if (side === "context") {
      await shell.getByRole("button", { name: CONTEXT_TOGGLE_RE }).click();
    }
    await expect(panel).toHaveAttribute("data-panel-mode", "docked");
    await expect.poll(() => boxShadowOf(panel), { intervals: [20, 50, 100] }).toBe("none");
    expect(floating).not.toBe("none");
  });
}

test("the ember content↔context binding is a DOCKED cue: the band keeps it docked, drops it floating", async ({ mount, page }) => {
  const shell = await mount(<AppShellStory />);
  const band = page.locator('.shell-panel[data-panel-side="context"] .shell-panel-header');

  // Docked (wide): the 2px ember inset edge binds the pane to the content column it explains.
  await page.setViewportSize(WIDE);
  await shell.getByRole("button", { name: CONTEXT_TOGGLE_RE }).click();
  await expect(page.locator('.shell-panel[data-panel-side="context"]')).toHaveAttribute("data-panel-mode", "docked");
  await expect.poll(() => boxShadowOf(band), { intervals: [20, 50, 100] }).not.toBe("none");

  // Floating (narrow band): the same edge has nothing to bind to and renders as an orphan amber stripe
  // under the topbar — off it comes. The sheet's own elevation is what says "this floats" now.
  // (Narrowing auto-downgrades the wide dock to a CLOSED slide-over — the toggle re-opens it as one.)
  await page.setViewportSize(NARROW_DESKTOP);
  await shell.getByRole("button", { name: CONTEXT_TOGGLE_RE }).click();
  await expect(page.locator('.shell-panel[data-panel-side="context"]')).toHaveAttribute("data-panel-mode", "overlay");
  await expect.poll(() => boxShadowOf(band), { intervals: [20, 50, 100] }).toBe("none");
});

test("content behind an open sheet is INERT — the scrim blocks the pointer, so it must block the keyboard too", async ({ mount, page }) => {
  await page.setViewportSize(NARROW_DESKTOP);
  const shell = await mount(<AppShellStory />);
  const contentControl = page.getByRole("button", { name: "content control" });
  const main = page.locator(".shell-content");

  // Closed: the content column is live — the control takes focus.
  await contentControl.focus();
  await expect(contentControl).toBeFocused();

  await shell.getByRole("button", { name: "Show list panel" }).click();
  await expect(page.locator('.shell-panel[data-panel-side="list"]')).toHaveAttribute("data-panel-mode", "overlay");
  // The scrim already swallows every click back there; a keyboard user could still Tab into controls
  // whose effect they cannot see. `inert` makes the two agree.
  await expect(main).toHaveAttribute("inert", "");
  await contentControl.focus();
  await expect(contentControl).not.toBeFocused();

  // The carve-out: the sheet's OWN close control lives in the topbar, above the scrim — it stays live,
  // so the sheet is never a trap (this is why the shell inerts the content column, not the whole frame).
  const closeToggle = shell.getByRole("button", { name: "Hide list panel" });
  await closeToggle.click();
  await expect(page.locator('.shell-panel[data-panel-side="list"]')).toHaveAttribute("data-panel-mode", "collapsed");
  await expect(main).not.toHaveAttribute("inert", "");
  await contentControl.focus();
  await expect(contentControl).toBeFocused();
});

test("MOBILE: the full-screen sheet gets the same elevation + inert content", async ({ mount, page }) => {
  await page.setViewportSize(MOBILE);
  const shell = await mount(<AppShellStory />);
  const panel = page.locator('.shell-panel[data-panel-side="list"]');

  // The phone vocabulary (finding 4): the lead control names the SCREEN it opens, not the frame region.
  await shell.getByRole("button", { name: LIST_TOGGLE_RE }).click();
  await expect(panel).toHaveAttribute("data-panel-mode", "overlay");
  await expect.poll(() => boxShadowOf(panel), { intervals: [20, 50, 100] }).not.toBe("none");
  await expect(page.locator(".shell-content")).toHaveAttribute("inert", "");
});

/** The overlay band's own dismiss, by its accessible name ("Close <section> list" / "… details"). */
const OVERLAY_CLOSE_RE = /^Close /u;

// A FLOATING PANEL CARRIES ITS OWN WAY OUT (side-eye 2026-08-06 P2). Docked and collapsed panels are
// closed from the topbar, which is the right home for a track. An OVERLAY is different: it floats over the
// column, and at 100dvw on a phone the scrim it floats over has no reachable pixel at all — the topbar
// toggle was the only exit, a control somewhere else for a surface covering the screen.
test("MOBILE: an overlay panel's band carries a DISMISS, and it closes the panel", async ({ mount, page }) => {
  await page.setViewportSize(MOBILE);
  const shell = await mount(<AppShellStory />);
  const panel = page.locator('.shell-panel[data-panel-side="list"]');

  // Docked/collapsed: the band offers no close — the topbar owns a track's toggle.
  await expect(panel.getByRole("button", { name: OVERLAY_CLOSE_RE })).toHaveCount(0);

  await shell.getByRole("button", { name: LIST_TOGGLE_RE }).click();
  await expect(panel).toHaveAttribute("data-panel-mode", "overlay");

  const dismiss = panel.getByRole("button", { name: OVERLAY_CLOSE_RE });
  await expect(dismiss).toBeVisible();
  await dismiss.click();
  await expect(panel).toHaveAttribute("data-panel-mode", "collapsed");
  // …and the content column is reachable again (the sheet's inert lifted with it).
  await expect(page.locator(".shell-content")).not.toHaveAttribute("inert", "");
});

// ── THE MOBILE ONE-SHELL RULE (owner-ruled 2026-08-03) ───────────────────────────────────────────────
// "On mobile, a list-bearing section with NO selection shows its LIST as the screen; selecting pushes to
// CONTENT with a back row" — applied by the SHELL to every section that declares a list, so there are no
// per-section exceptions to keep in step. What it replaced, MEASURED on the live stack at 320px before
// this landed: all seven list-bearing sections (chats · characters · corpus · config · databank · presets ·
// analytics) landed on their welcome card with the roster translated fully off-screen (list panel box
// x = -320), reachable only through a panel toggle — the phone user met a teaching card instead of the
// rows they came for, in every section.
//
// Driven at 320px — the narrowest real mount, which is the whole point of the rule — over each section's
// REAL selection seam (the story injects list/content bodies; `CtFakeSectionRegistry` passes the real
// `SectionDefinition.selection` through), so a section is covered by its own store, not a double.

const MOBILE_NARROW = { width: 320, height: 800 };

/** The coarse-pointer tap floor (`--spacing-touch-target` = 44px): the LEAD must always seat at least its
 *  one control, so anything at or under this is the measured collapse. */
const TOUCH_FLOOR_PX = 44;

/** Every list-bearing section the story can drive, with the rail label the back affordance derives from. */
const ONE_SHELL_SECTIONS: readonly { readonly id: SectionId; readonly label: string }[] = [
  { id: "chats", label: "Chats" },
  { id: "characters", label: "Characters" },
  { id: "corpus", label: "Corpus" },
  { id: "config", label: "Configuration" },
  { id: "databank", label: "Databank" },
];

for (const { id, label } of ONE_SHELL_SECTIONS) {
  test(`ONE-SHELL @320: ${id} shows its ROSTER as the screen with nothing selected, PUSHES to content on a selection, and comes BACK`, async ({
    mount,
    page,
  }) => {
    await page.setViewportSize(MOBILE_NARROW);
    const shell = await mount(<AppShellMobileRuleStory section={id} />);
    const listPanel = page.locator('.shell-panel[data-panel-side="list"]');
    const main = page.locator(".shell-content");

    // 1) NOTHING SELECTED ⇒ the roster IS the screen: in flow (`docked`), the full viewport wide, and
    //    starting at the left edge — not a sheet translated off-screen, and no scrim (nothing floats).
    await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");
    await expect(page.getByText(`${id} list pane`)).toBeVisible();
    await expect.poll(async () => (await listPanel.boundingBox())?.x ?? -9999, { intervals: [20, 50, 100] }).toBe(0);
    // Sub-pixel: a `100dvw` pane measures 319.99997 at a 320px viewport in Chromium.
    expect((await listPanel.boundingBox())?.width ?? 0).toBeCloseTo(MOBILE_NARROW.width, 1);
    await expect(page.locator(".shell-scrim")).toHaveAttribute("data-visible", "false");
    // The content column is covered by a full-viewport pane, so the keyboard must not reach behind it.
    await expect(main).toHaveAttribute("inert", "");
    // No way BACK from the screen you are already on.
    await expect(page.getByRole("button", { name: `Back to ${label}` })).toHaveCount(0);

    // 2) A SELECTION PUSHES: CONTENT takes the screen, the roster leaves it, and the topbar carries the
    //    one door back — the list TOGGLE gives way to it (one door, not two).
    await shell.getByRole("button", { name: "open a member" }).click();
    await expect(listPanel).toHaveAttribute("data-panel-mode", "collapsed");
    await expect(page.getByText(`${id} content pane`)).toBeVisible();
    await expect(main).not.toHaveAttribute("inert", "");
    const back = shell.getByRole("button", { name: `Back to ${label}` });
    await expect(back).toBeVisible();
    await expect(shell.getByRole("button", { name: LIST_TOGGLE_RE })).toHaveCount(0);

    // 3) BACK pops the detail: the section's own selection is cleared through its declared seam, so the
    //    roster is the screen again — the same state a fresh landing has.
    await back.click();
    await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");
    await expect(page.getByText(`${id} list pane`)).toBeVisible();
    await expect(page.getByRole("button", { name: `Back to ${label}` })).toHaveCount(0);
  });
}

// The escape hatch, and the reason the lead control is never dead in the no-selection arm: a section's
// no-selection CONTENT is a real surface for some sections (the corpus + analytics dashboards, the config
// welcome), so "hide the list" has to still mean it — and bring the roster back.
test("ONE-SHELL @320: the topbar toggle drops the roster screen to the section's own no-selection CONTENT, and restores it", async ({ mount, page }) => {
  await page.setViewportSize(MOBILE_NARROW);
  const shell = await mount(<AppShellMobileRuleStory section="corpus" />);
  const listPanel = page.locator('.shell-panel[data-panel-side="list"]');

  await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");
  // AND THE PHONE NAMES THE DESTINATION (finding 4, §14): "Hide list panel" describes a frame region a
  // phone does not have; these two labels are the section's two SCREENS, which is what the tap swaps.
  await shell.getByRole("button", { name: "Show Corpus overview" }).click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "collapsed");
  await expect(page.getByText("corpus content pane")).toBeVisible();
  await expect(page.locator(".shell-content")).not.toHaveAttribute("inert", "");

  await shell.getByRole("button", { name: "Show Corpus list" }).click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");
  await expect(page.getByText("corpus list pane")).toBeVisible();
});

// The rule is MOBILE-shaped applicability of ONE surface, not a mobile mode: at desktop widths the same
// section, the same seam and the same registry resolve exactly as before — a docked LIST beside CONTENT,
// and no back affordance anywhere (the LIST band's own back is the picker⇄projection swap, not this).
test("ONE-SHELL: the rule is applicability, not a mode — at 1280px the config roster stays a docked pane beside CONTENT with no back row", async ({
  mount,
  page,
}) => {
  await page.setViewportSize(WIDE);
  const shell = await mount(<AppShellMobileRuleStory section="config" />);
  const listPanel = page.locator('.shell-panel[data-panel-side="list"]');

  await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");
  await expect(page.getByText("config content pane")).toBeVisible();
  const box = await listPanel.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(0);
  expect(box?.width ?? WIDE.width).toBeLessThan(WIDE.width);
  await expect(page.locator(".shell-content")).not.toHaveAttribute("inert", "");

  await shell.getByRole("button", { name: "open a member" }).click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");
  await expect(page.getByRole("button", { name: "Back to Configuration" })).toHaveCount(0);
  await expect(shell.getByRole("button", { name: LIST_TOGGLE_RE })).toBeVisible();
});

// ── THE MOBILE TOPBAR BUDGET (side-eye P1) — a COARSE-POINTER frame, because the geometry depends on it ──
// `--viewport 320x800` alone renders a FINE-pointer layout no phone produces (the touch floors are
// `@media (pointer: coarse)`), so these run with `hasTouch` — Chromium then reports `pointer: coarse` and
// the row is the one a thumb actually meets.
//
// What they pin, measured before the fix at 320px: the trail took 277 of 320px, `.shell-topbar-lead`
// collapsed to 10.7px, and the back button's 48px box was overlapped by the ⌘K chip — every hit sample on
// the back button (50%/75%/90% of its box) resolved to the command palette. Tapping the active bottom tab
// does NOT clear a selection, so that button is the ONLY exit from an open chat.

test.describe("the mobile topbar at 320px, coarse pointer", () => {
  test.use({ viewport: MOBILE_NARROW, hasTouch: true });

  /** Every point in `box` that a thumb might land on — the corners inside the padding, the centre, and the
   *  three-quarter marks. Returns the `data-slot`/aria-label of whatever `elementFromPoint` resolves. */
  function hitSamples(page: Page, selector: string): Promise<readonly string[]> {
    return page.evaluate((sel) => {
      const target = document.querySelector(sel);
      if (target === null) {
        return ["<no such element>"];
      }
      const box = target.getBoundingClientRect();
      const fractions = [0.1, 0.25, 0.5, 0.75, 0.9];
      return fractions.map((f) => {
        const hit = document.elementFromPoint(box.left + box.width * f, box.top + box.height * f);
        if (hit === null) {
          return "<nothing>";
        }
        // The button itself, or anything inside it (its icon/svg), counts as the button.
        const owner = hit.closest("button");
        return owner === null ? `<not-a-button:${hit.tagName.toLowerCase()}>` : (owner.getAttribute("aria-label") ?? owner.textContent ?? "<unnamed>");
      });
    }, selector);
  }

  const backButtonSelector = '.shell-topbar button[aria-label="Back to Chats"]';

  test("P1: every hit sample on the back button lands the BACK BUTTON — not the control beside it", async ({ mount, page }) => {
    const shell = await mount(<AppShellMobileRuleStory section="chats" />);
    await shell.getByRole("button", { name: "open a member" }).click();
    const back = page.getByRole("button", { name: "Back to Chats" });
    await expect(back).toBeVisible();

    // POLLED TO SETTLED, not sampled on the first tick: the shell drives a real View Transition on a
    // section/selection write, and WHILE one is running Chromium hit-tests against the ::view-transition
    // pseudo-snapshots — `elementFromPoint` answers <html> for every point on the page, which would make
    // this assertion a coin flip rather than a measurement (probed: the whole ancestor chain reads
    // `pointer-events: auto` with real boxes, and only the hit test disagrees).
    const expected = ["Back to Chats", "Back to Chats", "Back to Chats", "Back to Chats", "Back to Chats"].join(" | ");
    await expect.poll(async () => (await hitSamples(page, backButtonSelector)).join(" | "), { intervals: [20, 50, 100, 200, 400] }).toBe(expected);

    // …and the click actually returns to the roster (the affordance is reachable, not merely present).
    await back.click();
    await expect(page.locator('.shell-panel[data-panel-side="list"]')).toHaveAttribute("data-panel-mode", "docked");
  });

  test("P1: the lead keeps a real box and the title never measures 0 — the trail is what gives", async ({ mount, page }) => {
    const shell = await mount(<AppShellMobileRuleStory section="chats" />);
    await shell.getByRole("button", { name: "open a member" }).click();
    await expect(page.getByRole("button", { name: "Back to Chats" })).toBeVisible();

    const lead = page.locator(".shell-topbar-lead");
    // SCOPED to the narrow arm on purpose: production's chat header carries its OWN `.shell-topbar-title`
    // (the room's name inside the WIDE cluster), so a bare class selector measures the hidden one — it
    // reads 0px wide and the assertion would pass against the wrong element (caught on the live stage).
    const title = page.locator('.shell-topbar-identity[data-identity="narrow"] .shell-topbar-title');
    const leadBox = await lead.boundingBox();
    const titleBox = await title.boundingBox();
    // The measured defect was lead=10.7px and title w=0. The floor is the control's own tap target plus a
    // readable name; assert BOXES, never attributes.
    expect(leadBox?.width ?? 0).toBeGreaterThan(TOUCH_FLOOR_PX);
    expect(titleBox?.width ?? 0).toBeGreaterThan(0);
    // The lead + trail together fit the row — nothing is stacked on top of anything.
    const trailBox = await page.locator(".shell-topbar-trail").boundingBox();
    expect((leadBox?.x ?? 0) + (leadBox?.width ?? 0)).toBeLessThanOrEqual((trailBox?.x ?? 0) + 1);
  });

  // The other half of the budget, and a defect the first pass INTRODUCED (caught on the live stage, not in
  // CT): letting the trail shrink with `min-width: 0` floored it at 26px while its icons kept their own
  // `flex: none` tap targets — the chat kebab landed at x=324 on a 320px viewport, four pixels off-screen
  // and unreachable. Every control's box must sit INSIDE the row's, which is the same geometry pin the
  // regex bulk bar carries.
  test("P1: every topbar control's box sits inside the viewport — nothing is pushed off the edge", async ({ mount, page }) => {
    const shell = await mount(<AppShellMobileRuleStory section="chats" />);
    await shell.getByRole("button", { name: "open a member" }).click();
    await expect(page.getByRole("button", { name: "Back to Chats" })).toBeVisible();

    const boxes = await page.locator(".shell-topbar button").evaluateAll((els) =>
      els
        .filter((el) => el.checkVisibility())
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { name: el.getAttribute("aria-label") ?? el.textContent ?? "?", left: r.left, right: r.right };
        }),
    );
    expect(boxes.length).toBeGreaterThan(0);
    for (const box of boxes) {
      expect.soft(box.left, `${box.name} starts inside the row`).toBeGreaterThanOrEqual(0);
      expect.soft(box.right, `${box.name} ends inside the row`).toBeLessThanOrEqual(MOBILE_NARROW.width);
    }
  });

  test("P1: the desktop-shaped trail affordances shed on a phone and the command modal keeps a home in the You sheet", async ({ mount, page }) => {
    const shell = await mount(<AppShellMobileRuleStory section="chats" />);
    // ⌘K and focus mode are gone from the phone row (the budget) …
    await expect(page.getByRole("button", { name: "Jump to… — the command menu" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: FOCUS_TOGGLE_RE })).toHaveCount(0);
    // … and the command modal is still REACHABLE, as a named row in the You sheet.
    await shell.getByRole("button", { name: "You", exact: true }).click();
    await expect(page.getByRole("button", { name: "Jump to…" })).toBeVisible();
  });

  // ── LEG 4 (side-eye's second pass): "stop treating a phone as a narrow desktop" ──────────────────
  // Every pin below is a COMPOSITION claim, not a size tweak: the frame that is not the screen does not
  // paint, the row that names the screen outranks the chrome around it, and a tab that is not the page
  // does not say it is.

  test("P2: the roster IS the screen — the CONTENT frame behind it does not paint at all", async ({ mount, page }) => {
    await mount(<AppShellMobileRuleStory section="characters" />);
    const listPanel = page.locator('.shell-panel[data-panel-side="list"]');
    await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");

    // MEASURED, not asserted by class: the content column used to sit under the roster at
    // display:flex/visibility:visible/opacity:1 with 100% overlap (149,341px²), and the landing's orange
    // CTA glow bled through the rows. `inert` had already fixed the keyboard; this is the paint.
    const content = page.locator(".shell-content");
    const shown = await content.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { display: cs.display, box: el.getBoundingClientRect().width * el.getBoundingClientRect().height };
    });
    expect(shown.display).toBe("none");
    expect(shown.box).toBe(0);

    // …and it comes back the moment CONTENT is the screen (a selection pushes it).
    await page.getByRole("button", { name: "open a member" }).click();
    await expect(listPanel).toHaveAttribute("data-panel-mode", "collapsed");
    await expect.poll(async () => content.evaluate((el) => getComputedStyle(el).display), { intervals: [20, 50, 100] }).not.toBe("none");
  });

  test("P2: the title outranks the chrome — the room's name takes more of the row than any one control", async ({ mount, page }) => {
    const shell = await mount(<AppShellMobileRuleStory section="chats" />);
    await shell.getByRole("button", { name: "open a member" }).click();
    const title = page.locator('.shell-topbar-identity[data-identity="narrow"] .shell-topbar-title');
    await expect(title).toBeVisible();

    // MEASURE THE ROOM, NOT THE STRING. A short room name legitimately renders narrow (the Text is
    // content-sized), so asserting the rendered title's width would pass or fail on the fixture's name
    // rather than on the row's composition. The claim is about SPACE: what the lead has left after its one
    // control is what any name gets, and that must out-rank any single piece of chrome beside it.
    const leadWidth = (await page.locator(".shell-topbar-lead").boundingBox())?.width ?? 0;
    const controls = await page
      .locator(".shell-topbar button")
      .evaluateAll((els) => els.filter((el) => el.checkVisibility()).map((el) => el.getBoundingClientRect().width));
    const widestControl = Math.max(...controls, 0);
    const roomForTheName = leadWidth - widestControl;
    // The measured defect was 80px of 320 (25%) with four trailing controls out-ranking the one thing
    // saying where you are. The floor is RELATIVE — a token retune of the tap target moves both sides.
    expect(roomForTheName).toBeGreaterThan(widestControl);
    expect(roomForTheName / MOBILE_NARROW.width).toBeGreaterThan(0.3);
    // …and the name itself is really painted in it (never the 0px the leg-2 defect produced).
    expect((await title.boundingBox())?.width ?? 0).toBeGreaterThan(0);
  });

  test("P2: the pushed frame's topbar names the MEMBER; the roster frame names the section", async ({ mount, page }) => {
    const shell = await mount(<AppShellMobileRuleStory section="config" />);
    const title = page.locator('.shell-topbar-identity[data-identity="narrow"] .shell-topbar-title');
    await expect(title).toHaveText("Configuration");

    await shell.getByRole("button", { name: "open a member" }).click();
    await expect(title).toHaveText("Ashen Spire");
    expect((await title.boundingBox())?.width ?? 0).toBeGreaterThan(0);
  });

  test("a11y: the bottom tab bar comes AFTER the topbar in DOM order on a phone (meaningful sequence)", async ({ mount, page }) => {
    await mount(<AppShellMobileRuleStory section="chats" />);
    const order = await page.evaluate(() => {
      const grid = document.querySelector(".shell-grid");
      if (grid === null) {
        return [];
      }
      const regionOf = (el: Element): string => {
        if (el.classList.contains("shell-rail")) {
          return "rail";
        }
        return el.classList.contains("shell-main") ? "main" : "other";
      };
      return [...grid.children].map(regionOf);
    });
    expect(order.indexOf("main")).toBeLessThan(order.indexOf("rail"));
  });
});

test("a11y: on the DESKTOP the rail still reads first — it is the leftmost column there", async ({ mount, page }) => {
  await page.setViewportSize(WIDE);
  await mount(<AppShellMobileRuleStory section="chats" />);
  const order = await page.evaluate(() => {
    const grid = document.querySelector(".shell-grid");
    if (grid === null) {
      return [];
    }
    const regionOf = (el: Element): string => {
      if (el.classList.contains("shell-rail")) {
        return "rail";
      }
      return el.classList.contains("shell-main") ? "main" : "other";
    };
    return [...grid.children].map(regionOf);
  });
  expect(order.indexOf("rail")).toBeLessThan(order.indexOf("main"));
});
