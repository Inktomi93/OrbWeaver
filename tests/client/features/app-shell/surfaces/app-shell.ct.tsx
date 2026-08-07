// AppShell CT — the composed four-region frame end-to-end: the default chats CONTENT renders, a rail
// click switches the section (store → CONTENT/LIST slots), the topbar panel toggle collapses a panel
// via the §11.1 clamp-overlay (data-panel-mode + zero rendered width, not just a class string), the
// focus toggle drives immersive ⇄ command-center, and a footer modal trigger (derived from the modal
// registry) opens its real body. The MOBILE block (L6/J12 · D62 P3) covers the bottom-tab-bar reflow at a mobile
// viewport: the curated four tabs, land-on-CONTENT, and the "You" bottom sheet + its overflow/handoff.
// Each test gets a fresh page (isolated localStorage) so the store starts default.

import { blobUrl } from "@orb/contracts/assets";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { MESSAGE_ROLES } from "@orb/kit/message-role";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import type { SectionId } from "../../../../../packages/client/src/state/shell-store.ts";
import { MODAL_SLOT_IDS } from "../../../../../packages/client/src/state/shell-store.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { makeCharacterSummary } from "../../character/fixtures.ts";
import { makeChatSummary } from "../../chat/fixtures.ts";
import { ShellCascadeFixture } from "../_cascade-fixtures.tsx";
import {
  AppShellDraftBackgroundStory,
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
const LIST_TOGGLE_RE = /^(?:Show|Hide) list panel$/u;
const CONTEXT_TOGGLE_RE = /^(?:Show|Hide) detail panel$/u;
const FOCUS_TOGGLE_RE = /focus mode$/u;

// Below the shell's `@media (max-width: 48rem)` breakpoint (768px) — the bottom-bar layout (L6/J12).
const MOBILE = { width: 390, height: 844 };

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
  // …and it is the CURRENT persona's row that says it (the row is the identity's ONE home, P2).
  await expect(page.getByRole("button", { name: `Switch to ${SHEET_PERSONA.name}` })).toHaveAttribute("aria-current", "true");
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

// ── M10: auto-overlay — resolvePanel's 3-regime derivation (§4.1) ────────────────────────────────
// Chats' real `panelDefaults.list` is "docked" (chats-section.tsx). Below the shell-narrow breakpoint
// (64rem/1024px) but above mobile (48rem/768px), a `docked` resolution auto-downgrades to a CLOSED
// slide-over (§4.1: overlay is zero-width closed by default, opening only on demand) — NOT open-on-load
// (the refuted first M10 pass). Above 64rem it stays docked; below 48rem it's the unchanged
// `openOverlayPanel` mobile-sheet regime. The persisted `panelOverrides` (localStorage `orb:shell`) must
// never be written by the auto-mechanism, nor by opening/closing the narrow auto-overlay slide-over.

const WIDE = { width: 1280, height: 900 }; // >64rem
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
    "chat.listChats": [makeChatSummary({ id: "chat_recent_900", title: "A grand adventure" })],
    "character.list": { items: [makeCharacterSummary()], nextCursor: null },
  });
  await page.setViewportSize(NARROW_DESKTOP);
  const shell = await mount(<AppShellOnSectionStory section="home" />);

  const recents = shell.getByRole("list", { name: "Recent chats" });
  await expect(recents).toBeVisible();
  await expect(recents.getByText("A grand adventure")).toBeVisible();
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

// ── Co-motion parity: the shell grid track + panel slide animate as ONE event (never-desync) ──────
// BASEUI-MOTION-AUDIT.md §5 Layer 2 — the rendered-output guard the corpus desync needed. The grid
// track (`grid-template-columns`) and the collapsed panel (`transform`) are one visual event; they MUST
// carry the SAME transition duration + timing-function, and NEITHER may be `0s`/`none` (the `0s` arm is
// what catches ABSENCE — the actual corpus bug, where the track had NO transition while the panel slid).
// Layer 1's co-motion vars (`--shell-motion`/`--shell-ease` in shell.css) make divergence structurally
// impossible; this test proves it at the COMPUTED-STYLE level (a source lint can't see a missing rule).
// Had it existed pre-fix it fails on `0s !== 0.22s`. The panel is read in `collapsed` (an out-of-flow,
// transform-animated mode) — `docked` has no transform transition, so the test collapses it first.

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

test("co-motion parity: the grid track and the collapsed panel share one non-zero duration + easing", async ({ mount, page }) => {
  const shell = await mount(<AppShellStory />);
  const grid = page.locator(".shell-grid");
  const listPanel = page.locator('.shell-panel[data-panel-side="list"]');

  // Collapse the list panel so it enters the transform-animated `collapsed` mode (docked has no slide).
  await shell.getByRole("button", { name: "Hide list panel" }).click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "collapsed");

  const gridMotion = await transitionOf(grid, "grid-template-columns");
  const panelMotion = await transitionOf(listPanel, "transform");

  // The absence arm (the corpus bug): neither side may be a no-transition. `220ms` = `--motion-base`.
  expect(gridMotion.duration).not.toBe("0s");
  expect(panelMotion.duration).not.toBe("0s");
  expect(gridMotion.ease).not.toBe("none");
  expect(panelMotion.ease).not.toBe("none");

  // The divergence arm: they animate as ONE event — equal duration AND equal easing (the co-motion vars
  // guarantee this by construction; this asserts it landed in computed style, not just source).
  expect(gridMotion.duration).toBe(panelMotion.duration);
  expect(gridMotion.ease).toBe(panelMotion.ease);
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
  await routeTrpc(page, { "chat.listChats": [], "character.list": { items: [], nextCursor: null } });
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

  await shell.getByRole("button", { name: "Show list panel" }).click();
  await expect(panel).toHaveAttribute("data-panel-mode", "overlay");
  await expect.poll(() => boxShadowOf(panel), { intervals: [20, 50, 100] }).not.toBe("none");
  await expect(page.locator(".shell-content")).toHaveAttribute("inert", "");
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
  await shell.getByRole("button", { name: "Hide list panel" }).click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "collapsed");
  await expect(page.getByText("corpus content pane")).toBeVisible();
  await expect(page.locator(".shell-content")).not.toHaveAttribute("inert", "");

  await shell.getByRole("button", { name: "Show list panel" }).click();
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

// ── BG-C DRAFT PARITY (owner dogfood 2026-08-06) ──────────────────────────────────────────────────
// "character backgrounds and avatars also dont show up until the first message." The app-root background
// layer resolved its carried source from `chat.getChat`'s roster, which a DRAFT does not have — so a chat
// started with a character wore the viewer's default chrome and re-skinned itself the instant the first
// send created the row. These mount the REAL shell over a REAL pre-send draft (`startNewChat`, no chat id
// anywhere) and read the painted layer back off the DOM. The group/blank arms are the discriminators: a
// fix that simply paints "the first card it can find" passes the solo arm and fails both of them.

const DRAFT_CARD_HASH = "hash_draft_card_bg";

/** A founding card carrying a BG-C background — the `character.get` payload the draft cast reads. */
function draftCardWithBackground(): unknown {
  return {
    id: mintTypeId(ID_PREFIX.character),
    name: "Aria",
    greetings: ["Greetings, traveller."],
    themeOverride: null,
    backgroundOverride: {
      kind: "asset",
      seededId: "",
      externalUrl: "",
      provenanceUrl: "",
      assetId: "asset_draft_card",
      assetHash: DRAFT_CARD_HASH,
      mime: "image/png",
    },
  };
}

const BACKGROUND_LAYER = '[data-slot="theme-background-layer"]';

test("BG-C draft: a SOLO founding card's background paints on the shell before any message exists", async ({ mount, page }) => {
  await routeTrpc(page, { "character.get": draftCardWithBackground });

  await mount(<AppShellDraftBackgroundStory characterIds={[mintTypeId(ID_PREFIX.character)]} />);

  // The layer is the app-root paint (not a class string): it exists, and it carries THIS card's blob url.
  const layer = page.locator(BACKGROUND_LAYER);
  await expect(layer).toHaveCount(1);
  await expect(layer).toHaveAttribute("style", new RegExp(blobUrl(DRAFT_CARD_HASH), "u"));
  // The shell's own opaque background stands down for the photo — the same gate the committed room uses.
  await expect(page.locator(".shell-grid")).toHaveAttribute("data-has-bg-image", "true");
});

test("BG-C draft: a GROUP founding cast paints NOTHING — no arbitrary pick among two cards", async ({ mount, page }) => {
  await routeTrpc(page, { "character.get": draftCardWithBackground });

  await mount(<AppShellDraftBackgroundStory characterIds={[mintTypeId(ID_PREFIX.character), mintTypeId(ID_PREFIX.character)]} />);

  await expect(page.getByText("chats content pane")).toBeVisible();
  await expect(page.locator(BACKGROUND_LAYER)).toHaveCount(0);
  await expect(page.locator(".shell-grid")).not.toHaveAttribute("data-has-bg-image", "true");
});

test("BG-C draft: a BLANK draft (no founding cast) paints nothing", async ({ mount, page }) => {
  await routeTrpc(page, { "character.get": draftCardWithBackground });

  await mount(<AppShellDraftBackgroundStory characterIds={[]} />);

  await expect(page.getByText("chats content pane")).toBeVisible();
  await expect(page.locator(BACKGROUND_LAYER)).toHaveCount(0);
});
