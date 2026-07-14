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
import type { Locator, Page } from "@playwright/test";
import { MODAL_SLOT_IDS } from "../../../../../packages/client/src/state/shell-store";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { ShellCascadeFixture } from "../_cascade-fixtures";
import { AppShellStory, AppShellWidthProbeStory, ModalScrollStory } from "../_ct-stories";

/** The thumb-reach budget (L6/J12): rendered mobile-bar buttons (mobilePrimary sections + "You") must
 *  never exceed this — a def flipping `mobilePrimary: true` must not silently balloon the bar. */
const MAX_MOBILE_TAB_BUTTONS = 4;

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
  // <Activity> pane-keeping (UI-Arch §4a / D62 §4.2 rule 2): the prior section's CONTENT stays MOUNTED so
  // its scroll/virtual/form state survives a rail round-trip — it is HIDDEN (display:none), not unmounted.
  // (Only CONTENT is Activity-kept; LIST/CONTEXT still swap per-section, covered by the §4.2-rule-1 test.)
  await expect(page.getByText("chats content pane")).toBeHidden();
});

test("<Activity> pane-keeping: switching away and back keeps the SAME CONTENT node (state survives)", async ({
  mount,
  page,
}) => {
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
  await expect
    .poll(panelText, { intervals: [20, 50, 100] })
    .toContain("Select something to see its details here");
  expect(await panelText()).not.toContain("chats context pane");
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

// finalFocus (§13.8 R1 · side-eye P3): the store-driven modal mounts already-open (no DialogTrigger), so
// ModalHost captures the trigger at open and hands it to Base UI's `finalFocus` — on Escape-close, focus
// returns to the Settings control, not lost to <body>. A keyboard user's place is preserved.
test("closing a modal returns focus to the control that opened it (finalFocus)", async ({
  mount,
  page,
}) => {
  const shell = await mount(<AppShellStory />);
  const trigger = shell.getByRole("button", { name: "Settings" });
  await trigger.focus();
  await trigger.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

// ── No-window-scroll invariant (task #14) — registry-driven over MODAL_SLOTS ─────────────────────
// The shell is the window: html/body `overflow: clip` (client globals.css) means the DOCUMENT can never
// scroll — a modal taller than the viewport scrolls inside its OWN region, never the page. Looping the
// registry (not a hardcoded list) means a NEW modal id is covered for free — the registry-pairing spirit.
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
      if (
        (s.overflowY === "auto" || s.overflowY === "scroll") &&
        el.scrollHeight > el.clientHeight
      ) {
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
      if (
        (s.overflowY === "auto" || s.overflowY === "scroll") &&
        el.scrollHeight > el.clientHeight
      ) {
        el.scrollTop = el.scrollHeight;
        return;
      }
      el = el.parentElement;
    }
  });
}

for (const modalId of MODAL_SLOT_IDS) {
  test(`no-window-scroll: the "${modalId}" modal overflows its OWN region, never the document`, async ({
    mount,
    page,
  }) => {
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
    await expect
      .poll(() => scrollRegionContainment(page), { intervals: [20, 50, 100] })
      .toBe("descendant");

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

// ── Escape closes the top layer (§4.3 rule 6) — registry-driven over MODAL_SLOTS ──────────────────
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

// ── Modals inherit the active theme (D44 §12.1) — registry-driven over MODAL_SLOTS ────────────────
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
    const bg = await popup.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--color-background").trim(),
    );
    expect(bg).toContain("300");
  });
}

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
  // The ballooning guard: rendered mobile-bar buttons (mobilePrimary sections + "You") must never
  // exceed the thumb-reach budget — a def flipping `mobilePrimary: true` must not silently balloon it.
  const tabCount = await page.locator(".shell-rail-mobile").getByRole("button").count();
  expect(tabCount).toBeLessThanOrEqual(MAX_MOBILE_TAB_BUTTONS);
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
  // Same <Activity> pane-keeping as desktop: chats CONTENT stays mounted-but-hidden across the switch.
  await expect(page.getByText("chats content pane")).toBeHidden();
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

test("co-motion parity: the grid track and the collapsed panel share one non-zero duration + easing", async ({
  mount,
  page,
}) => {
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
  await expect
    .poll(() => bgAlpha(shell.getByTestId("panel-probe")), { intervals: [20, 50, 100] })
    .toBe(1);
  await expect
    .poll(() => bgAlpha(shell.getByTestId("main-probe")), { intervals: [20, 50, 100] })
    .toBe(1);
  await expect
    .poll(() => bgAlpha(shell.getByTestId("topbar-probe")), { intervals: [20, 50, 100] })
    .toBe(1);
  await expect
    .poll(() => backdropFilterOf(shell.getByTestId("panel-probe")), { intervals: [20, 50, 100] })
    .toBe("none");
});

test("glass beats elevation: ramp + blur-panels still leaves .shell-panel translucent", async ({
  mount,
}) => {
  const shell = await mount(<ShellCascadeFixture elevation="ramp" blurSurfaces={["panels"]} />);
  const panel = shell.getByTestId("panel-probe");
  // THE BUG: shell.css's un-:where()'d elevation rule used to out-specificity globals.css's glass
  // rule, so the panel painted the OPAQUE --color-surface-raised elevation fill instead of the
  // translucent glass mix even with blur-panels on. This is the exact assertion that regression flips.
  await expect.poll(() => bgAlpha(panel), { intervals: [20, 50, 100] }).toBeLessThan(1);
  await expect.poll(() => backdropFilterOf(panel), { intervals: [20, 50, 100] }).toContain("blur(");
  await expect
    .poll(() => backdropFilterOf(panel), { intervals: [20, 50, 100] })
    .toContain("saturate(");
});

test("glass beats elevation on composer and both dialog popup slots", async ({ mount }) => {
  const shell = await mount(
    <ShellCascadeFixture elevation="ramp" blurSurfaces={["composer", "modals"]} />,
  );
  const composer = shell.getByTestId("composer-probe");
  await expect.poll(() => bgAlpha(composer), { intervals: [20, 50, 100] }).toBeLessThan(1);
  await expect
    .poll(() => backdropFilterOf(composer), { intervals: [20, 50, 100] })
    .toContain("blur(");

  const dialog = shell.getByTestId("dialog-probe");
  const alertDialog = shell.getByTestId("alert-dialog-probe");
  await expect.poll(() => bgAlpha(dialog), { intervals: [20, 50, 100] }).toBeLessThan(1);
  await expect.poll(() => bgAlpha(alertDialog), { intervals: [20, 50, 100] }).toBeLessThan(1);
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
    await expect
      .poll(() => bgAlpha(shell.getByTestId("bubble-probe")), { intervals: [20, 50, 100] })
      .toBeLessThan(1);
    await expect
      .poll(() => backdropFilterOf(shell.getByTestId("bubble-probe")), { intervals: [20, 50, 100] })
      .toContain("blur(");
  });
}

test("elevation alone (glass off) leaves .shell-panel opaque — glass is what flips it, not ramp", async ({
  mount,
}) => {
  const shell = await mount(<ShellCascadeFixture elevation="ramp" />);
  // Matrix cell: ramp × glass-off. Elevation-ramp's own fill (--color-surface-raised) is opaque —
  // confirms the translucency above comes from the glass rule winning, not from ramp itself.
  await expect
    .poll(() => bgAlpha(shell.getByTestId("panel-probe")), { intervals: [20, 50, 100] })
    .toBe(1);
});

test("background-image beats elevation: .shell-main goes transparent, .shell-topbar stays opaque", async ({
  mount,
}) => {
  const shell = await mount(<ShellCascadeFixture elevation="ramp" hasBgImage={true} />);
  // THE BUG: shell.css's un-:where()'d elevation rule for .shell-main used to out-specificity the
  // has-bg-image transparent rule, burying the fixed <ThemeBackgroundLayer> under an opaque
  // --color-card fill even with an image set. This is the exact assertion that regression flips.
  await expect
    .poll(() => bgAlpha(shell.getByTestId("main-probe")), { intervals: [20, 50, 100] })
    .toBe(0);
  // .shell-topbar was deliberately EXCLUDED from the transparent rule — chrome stays legible.
  await expect
    .poll(() => bgAlpha(shell.getByTestId("topbar-probe")), { intervals: [20, 50, 100] })
    .toBe(1);
});

test("elevation alone (bg-image off) leaves .shell-main opaque — bg-image is what flips it, not ramp", async ({
  mount,
}) => {
  const shell = await mount(<ShellCascadeFixture elevation="ramp" />);
  // Matrix cell: ramp × bg-off. Elevation-ramp's own fill (--color-card) is opaque — confirms the
  // transparency above comes from has-bg-image winning, not from ramp itself.
  await expect
    .poll(() => bgAlpha(shell.getByTestId("main-probe")), { intervals: [20, 50, 100] })
    .toBe(1);
});

// ── WS3: the reading/document CONTENT backing over a bg image (only Chats stays immersive) ──────────

test("bg-image + a non-Chats section: .shell-main gets a SOLID reading backing, not the photo", async ({
  mount,
}) => {
  const shell = await mount(<ShellCascadeFixture hasBgImage={true} section="characters" />);
  // THE DEFECT: a document/reader section (character detail, world-info, …) used to inherit the Chats
  // immersive transparency and float its prose directly on the photo. A non-Chats section now backs the
  // content column with an opaque --color-card reading surface.
  await expect
    .poll(() => bgAlpha(shell.getByTestId("main-probe")), { intervals: [20, 50, 100] })
    .toBe(1);
});

test("bg-image + a non-Chats section + blur-panels: the reading backing upgrades to glass (panel parity)", async ({
  mount,
}) => {
  const shell = await mount(
    <ShellCascadeFixture hasBgImage={true} section="characters" blurSurfaces={["panels"]} />,
  );
  const main = shell.getByTestId("main-probe");
  await expect.poll(() => bgAlpha(main), { intervals: [20, 50, 100] }).toBeLessThan(1);
  await expect.poll(() => backdropFilterOf(main), { intervals: [20, 50, 100] }).toContain("blur(");
});

test("bg-image + the Chats section stays IMMERSIVE: .shell-main transparent (photo behind the thread)", async ({
  mount,
}) => {
  const shell = await mount(<ShellCascadeFixture hasBgImage={true} section="chats" />);
  // The carve-out: Chats keeps the transparent path so the message thread shows the image behind bubbles
  // that carry their own fill — the reading-surface backing must NOT reach it.
  await expect
    .poll(() => bgAlpha(shell.getByTestId("main-probe")), { intervals: [20, 50, 100] })
    .toBe(0);
});

// ── WS3: the Chats-immersive landing HERO scrim chip (anchor the copy over the photo) ───────────────

test("bg-image + Chats: the landing empty-state hero gets a frosted scrim chip (anchored over the photo)", async ({
  mount,
}) => {
  const shell = await mount(<ShellCascadeFixture hasBgImage={true} section="chats" />);
  const hero = shell.getByTestId("empty-state-probe");
  // Chats stays immersive (main transparent, asserted above) — but the empty-state COPY is anchored in a
  // translucent themed scrim so it clears AA over ANY photo region instead of floating at ~2:1.
  await expect.poll(() => bgAlpha(hero), { intervals: [20, 50, 100] }).toBeGreaterThan(0);
  await expect.poll(() => bgAlpha(hero), { intervals: [20, 50, 100] }).toBeLessThan(1);
  await expect.poll(() => backdropFilterOf(hero), { intervals: [20, 50, 100] }).toContain("blur(");
});

test("bg-image + a NON-Chats section: the empty-state hero is NOT scrim-chipped (backed content already)", async ({
  mount,
}) => {
  const shell = await mount(<ShellCascadeFixture hasBgImage={true} section="characters" />);
  // Non-Chats content is already backed (the reading surface) — the hero needs no separate chip, so the
  // scrim rule is Chats-scoped and must NOT fire here.
  await expect
    .poll(() => bgAlpha(shell.getByTestId("empty-state-probe")), { intervals: [20, 50, 100] })
    .toBe(0);
});

test("no bg-image + Chats: the landing hero is NOT scrim-chipped (nothing to float over)", async ({
  mount,
}) => {
  const shell = await mount(<ShellCascadeFixture section="chats" />);
  await expect
    .poll(() => bgAlpha(shell.getByTestId("empty-state-probe")), { intervals: [20, 50, 100] })
    .toBe(0);
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
    .poll(
      () =>
        page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize)),
      { intervals: [20, 50, 100] },
    )
    .toBeCloseTo(UA_ROOT_PX * fontScale, 0);
});
