// AppShell CT — the composed four-region frame end-to-end: the default chats CONTENT renders, a rail
// click switches the section (store → CONTENT/LIST slots), the topbar panel toggle collapses a panel
// via the §11.1 clamp-overlay (data-panel-mode + zero rendered width, not just a class string), the
// focus toggle drives immersive ⇄ command-center, and a footer modal trigger (derived from the modal
// registry) opens its real body. The MOBILE block (L6/J12 · D62 P3) covers the bottom-tab-bar reflow at a mobile
// viewport: the curated four tabs, land-on-CONTENT, and the "You" bottom sheet + its overflow/handoff.
// Each test gets a fresh page (isolated localStorage) so the store starts default.
//
// WHAT THIS FILE CAN AND CANNOT OBSERVE (#1677 — say it here, because a cold reader otherwise reads a
// green shell CT as covering the whole composition). Every mount here goes through
// `CtFakeSectionRegistry` (`tests/support/browser/ct-data-providers.tsx`), which is REAL for the shell's own
// anatomy — rail, `panels`, `panelDefaults`, `placeholder`, the modal/chrome/config registries, and each
// section's real `selection` store whenever a story injects a `list` — and STORY-INJECTED for everything a
// section RENDERS: `list`, `content`, `context`, `header` and `listHeader` bodies. So this file is the
// floor for shell CHROME: region layout, panel clamp/overlay, focus modes, the rail, the modal host, the
// mobile tab bar and the one-shell rule.
//
// It is NOT the observer of SECTION-TITLE COMPOSITION. `useSelectionTitle` falls back to the section's real
// hook only where no story overrides it, and `AppShellMobileRuleStory` — the story that drives the mobile
// title assertions — supplies a stand-in title for chats/characters/corpus/config/databank on purpose, so a
// real title composed from real list data cannot appear here at all. The narrow topbar's screen name, the
// phone's library census and per-section selection titles are observed over the REAL registry in
// `tests/client/routes/app-root.ct.tsx`; a defect in title composition must be pinned THERE. Do not restate
// that file's pins here — a duplicate over a fake registry proves the fake, not the product.

import type { BlurSurface } from "@orb/contracts/settings";
import { appearanceSettingsSchema, DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { MESSAGE_ROLES } from "@orb/kit/message-role";
import { SNAPPED_LENGTH_BASE_PX, TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { MODAL_SLOT_IDS } from "../../../../../packages/client/src/state/modal-slot-ids.ts";
import type { SectionId } from "../../../../../packages/client/src/state/section-ids.ts";
import APPEARANCE_PRESET_FILE from "../../../../../tooling/src/_shared/appearance-presets.json" with { type: "json" };
import { routeTrpc, trpcHold } from "../../../../support/node/route-trpc.ts";
import { makeCharacterDetail, makeCharacterSummary } from "../../character/fixtures.ts";
import { CHAT_ROOM_ROUTES, chatListResponder, makeChatSummary } from "../../chat/fixtures.ts";
import { GrainDoublePaintFixture, OverArtGlassCensusFixture, ShellCascadeFixture } from "../_cascade-fixtures.tsx";
import {
  AppShellChatsProjectionIntentStory,
  AppShellChatTopbarIdentityStory,
  AppShellChatTrackStory,
  AppShellDropGuardStory,
  AppShellListPrimaryStory,
  AppShellMobileRuleStory,
  AppShellNamedListBandStory,
  AppShellNoticeBandStory,
  AppShellOnSectionStory,
  AppShellStory,
  AppShellTrackDoorsStory,
  AppShellTrailProjectionStory,
  AppShellWidthProbeStory,
  ModalScrollStory,
} from "../_ct-stories.tsx";

/**
 * THE SHELL'S OWN AMBIENT READS (#649) — spread FIRST into every `routeTrpc` call in this file.
 *
 * The shell IS the composition root: every mount here brings up the You sheet's persona roster, the settings
 * pane's viewer identity, the home databank tile's rows + census, and the refinery door's session roster —
 * none of which is any ONE test's subject. Unfed, all six resolved `routeTrpc`'s null (which is not a view),
 * so six pipelines ran INERT across twenty-three mounts and a regression in any of them was invisible here.
 *
 * DEFAULTS, NOT A CEILING — a test whose subject IS one of these lists the same key AFTER the spread and
 * wins (the You-sheet tests' `persona.list`, the appearance-primacy tests' `settings.getUserSettings`, and
 * the boot-veil tests' `trpcHold()` on it all still do exactly that).
 */
const EMPTY_BANK_HEALTH = { byPhase: { embedding: 0, empty: 0, indexing: 0, ready: 0, stalled: 0 }, chunks: 0, passages: 0, total: 0 };
const SHELL_AMBIENT_ROUTES: Readonly<Record<string, unknown>> = {
  // The Settings section's LIST paints the four collection bands when a story lands on it — fed empty.
  "tag.listTagsWithUsage": [],
  "regex.listScripts": [],
  "worldInfo.listBooksWithUsage": [],
  "rosterPreset.list": [],
  // `ViewerView` — a projection of the request Principal (transport/trpc/routers/sessions.ts:25).
  "sessions.me": { userId: "user_ct_shell", handle: "ct_shell", globalRole: "user" },
  // The viewer's settings row at the production defaults — the appearance/tier readers the shell root
  // resolves `data-theme`, `--font-scale` and `data-reduced-motion` from.
  "settings.getUserSettings": { userId: "user_ct_shell", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 },
  // `PersonaDetail[]` — the You sheet's roster lens. Empty is the honest default for a fresh viewer.
  "persona.list": [],
  // Home's databank tile: the paged rows and the bank CENSUS beside them. BOTH or neither — an unstubbed
  // suspending read blanks the tile into its QueryBoundary (the app-root.ct.tsx precedent).
  "databank.list": { items: [], nextCursor: null, totalCount: 0 },
  "databank.bankHealth": EMPTY_BANK_HEALTH,
  // `RefinerySessionSummary[]` — the refinery door's roster read off the You sheet.
  "refinery.listSessions": [],
  // THE TOPBAR-TRAIL INBOX BELL (#1627, #1663). The bell used to be gated on `multiHumanCapable`, which is
  // FALSE for every mount in this file that does not stub `/api/auth/config` — so the widget did not mount
  // and its read never fired, and only the three `seatNotificationBell` topbar-identity tests had to feed it.
  // #1627 retired the gate (`notifications-chrome.tsx` says so in its header: "IT HAS NO VISIBILITY GATE"),
  // so EVERY mount in this file now runs the bell's `useInbox` for real and an unfed read leaves that
  // pipeline INERT across the whole file — which is exactly what the ratchet named.
  //
  // An EMPTY inbox is the honest ambient default: no mount here has the inbox as its subject, and a badged
  // bell would only add noise to the topbar-width and trail-order assertions. Same shape and same reasoning
  // as `tests/client/routes/app-root.ct.tsx:102`, which fed it ambiently for the same reason.
  "notifications.list": { items: [], nextCursor: null },
  // The home temp-chat tile's fire-and-forget janitor mutation. A CASCADE row: it is not in the #649 ledger
  // for this file because the tile could not mount at all while `databank.list`/`bankHealth` answered null —
  // the ratchet named it on the very next run once they were fed. `{reaped: 0}` is the honest "nothing
  // expired" default (home-temp-chat-tile-body.tsx:31 says so in as many words).
  //
  // NOT A PRODUCTION DEFECT — and `tests/client/routes/app-root.ct.tsx`'s comment on this same read claims
  // otherwise, so read this instead of that. Its `invalidates` reads `data !== undefined && data.reaped`
  // (home-temp-chat-tile-body.tsx:35-36), and `routeTrpc`'s unfed `null` does slip past a `!== undefined`
  // guard where a `!= null` would hold — but the WIRE type is `{reaped: number}`, non-nullable, so `data` on
  // the real network is only ever the row or `undefined`. The guard is correct; the null is the HARNESS's.
  // Feeding this makes the janitor's real reconcile path run, which is the whole point — it fixes nothing in
  // production because nothing there was broken.
  "chat.reapTemporaryChats": { reaped: 0 },
  // THE HERO-ROOM WARM (#1205, the same CASCADE shape the `reapTemporaryChats` row above describes). Home's
  // hearth tile WARMS the room its one focal action opens — `usePrefetchRoom` issues `chat.getChat` on the
  // tile's MOUNT, a human reaction time ahead of the Resume click (#1126) — and the chats-list rows warm the
  // same key on hover-rest/press/focus (#1180). The shell IS the composition root, so any mount here that
  // reaches home or the chats pane requests it. It could not appear in this file's #649 ledger because the
  // warm did not exist then; the ratchet named it on the first run after #1126 folded.
  //
  // Spread rather than respelled: `CHAT_ROOM_ROUTES` is the chat feature's own "room canon reads at their
  // empty-but-real defaults" map (a partial `ChatDetail` with a solo-less roster + an empty page), so the
  // shape stays single-homed with the surfaces that read it. Its `chat.listMessages` half rides along
  // deliberately — the shell does not request it today, and an unrequested stub costs nothing, but a story
  // that lands the shell IN a room will need it fed rather than nulled.
  ...CHAT_ROOM_ROUTES,
  // THE TOPBAR'S SCREEN NAME READS THE LIBRARY CENSUS (#1670, the same CASCADE shape as the two rows above).
  // The shell resolves what the narrow row calls the current screen through the ACTIVE section's
  // `useSelectionTitle` (`components/section-topbar-title.tsx`), and the Characters section answers that with
  // `Characters · <census>` when nobody is open — so every mount that lands the shell on Characters now
  // issues this read for the topbar, not only the library pane. It could not appear in this file's #649
  // ledger because the topbar did not read it then; the ratchet named it on the first run after #1670.
  //
  // NOT GATED TO THE LIBRARY ROUTE ON PURPOSE: the product legitimately issues this read for the title, and
  // gating the hook would hide a real read from the ratchet rather than exercise it. The empty-but-real
  // default is the full `CharacterListPageFixture` shape (`tests/client/features/character/fixtures.ts:239`
  // — `{items, nextCursor, totalCount}`), so the census hook's own zero-suppression runs for real: an empty
  // library prints the bare section name, which is what every mount in this file expects to see.
  "character.list": { items: [], nextCursor: null, totalCount: 0 },
  // ── THE SECTION CENSUS READS (#1676) — appended, not woven into the rows above ──────────────────────
  // Every list-bearing section's `useSelectionTitle` now composes its own census, because on a phone the
  // ONE-NAME rule sheds the LIST band's title and the count travels inside it. `CtFakeSectionRegistry`
  // supplies the REAL title hook for any section a story does not override, and the shell calls the ACTIVE
  // section's hook unconditionally — so landing this file's stories on a section runs that section's census
  // read for real, and an unfed one leaves the pipeline INERT (which is exactly what the ratchet names).
  //
  // Fed EMPTY, at each section's own CT shape: no mount here has a library's size as its subject, and a
  // section's `?? 0` census renders nothing at zero, so the topbar keeps printing the bare section label and
  // every existing width/name assertion in this file is untouched. A test whose subject IS one of these
  // lists the key AFTER the spread and wins, exactly as the rows above intend.
  //
  // `chat.listChats` is here because CHATS IS THE BORN-ACTIVE SECTION: its title hook runs on EVERY mount in
  // this file, not only the ones that navigate. The dozen tests that already spell it per-test still win.
  "chat.listChats": chatListResponder([]),
  "discovery.catalog": { genres: [], tones: [], topTags: [], tagPairs: [], totalDistilled: 0, totalCharacters: 0 },
  "stats.leaderboard": { rows: [], total: 0 },
  "preset.list": [],
  "plugin.list": [],
  "plugin.listSurfaces": [],
};

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
// ONE NAME AT EVERY WIDTH for the CONTEXT toggle (#875 F19, 2026-08-30) — the desktop `detail panel`
// spelling is gone, so this matcher no longer spans two arms: it IS the pin that the two-name split does
// not come back (a regex that still admitted the dead spelling would let it).
const CONTEXT_TOGGLE_RE = /^(?:Show|Hide) details$/u;
const FOCUS_TOGGLE_RE = /focus mode$/u;
const JUMP_COMMAND_MENU_RE = /jump.*command menu/iu;

/** WCAG 2.5.8 Target Size (Minimum) — the floor a revealed control owes on BOTH axes (side-eye rail-home
 *  P3-7). A literal because it is the standard's own number, not a token this app gets to pick. */
const TARGET_SIZE_FLOOR_PX = 24;

// Below the shell's `@media (max-width: 48rem)` breakpoint (768px) — the bottom-bar layout (L6/J12).
const MOBILE = { width: 390, height: 844 };

/** The You sheet's row floor in px, DERIVED from the token a `ListRow` body rides (`min-h-control-md`,
 *  list-row/variants.ts) at its coarse value — never a hardcoded literal (§13.7 contract; the
 *  tests/ui/tokens/index.ct.tsx precedent). 3rem → 48px under `pointer: coarse`. */
const SHEET_ROW_FLOOR_PX = SNAPPED_LENGTH_BASE_PX["spacing.control-md"];

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

// ── #193: THE NOTICE BAND — a notice REFLOWS the content column, it never covers it ──────────────────
// The ruled escape from toast-overlay occlusion. The residual this retires (`@orb/ui`
// `toast/variants.ts`) was explicit that no inset could solve it: a phone column is topbar → transcript →
// composer → tab bar, with no toast-height gap that is neither the transcript nor the composer, so an
// overlay stack had to cover one of them. The band deletes the choice by leaving the overlay plane: the
// stack is a FLOW row of `.shell-main`, so raising a notice pushes the content down.
//
// These assert the two halves that make it structural rather than lucky: the toast's box does not
// intersect the h1 or the composer AT ALL (occlusion is impossible, not merely avoided at this size),
// and the content pane genuinely LOST height to the band (it reflowed — it did not simply happen to sit
// somewhere else). Run at the phone mount, which is where the 60% burial was measured, and at a desktop
// one, because the band is ONE surface at every width (no mobile mode beside a desktop mode).

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

async function settledBox(locator: Locator): Promise<Box> {
  await expect(locator).toBeVisible();
  // The toast enters on a translate transition; a same-tick read would measure it mid-flight. SETTLED = two
  // CONSECUTIVE polls agreeing on `y`, and `expect.poll`'s own retry interval is what spaces them — so the
  // wait is on the rendered state, never on the page clock (Spine-Testing.md §3: no `waitForTimeout` in a CT).
  let previous: Box | null = null;
  await expect
    .poll(async () => {
      const current = await locator.boundingBox();
      const settled = previous !== null && current !== null && Math.abs(previous.y - current.y) < 0.5;
      previous = current;
      return settled;
    })
    .toBe(true);
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("expected a rendered box");
  }
  return box;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

interface NoticeGeometry {
  readonly toast: Box;
  readonly h1: Box;
  readonly transcript: Box;
  readonly composer: Box;
  readonly contentBefore: Box;
  readonly contentAfter: Box;
}

/** Measure the content column, raise one notice, and measure everything the notice could have hit. */
async function raiseNoticeAndMeasure(page: Page): Promise<NoticeGeometry> {
  const contentBefore = await settledBox(page.getByTestId("band-content-pane"));
  await page.getByTestId("raise-notice").click();
  const toast = await settledBox(page.locator('[data-slot="toast-root"]'));
  return {
    composer: await settledBox(page.getByTestId("band-composer-standin")),
    contentAfter: await settledBox(page.getByTestId("band-content-pane")),
    contentBefore,
    h1: await settledBox(page.getByTestId("band-h1")),
    toast,
    transcript: await settledBox(page.getByTestId("band-transcript")),
  };
}

test.describe("the notice band — coarse pointer, the phone mount where the burial was measured", () => {
  test.use({ hasTouch: true, viewport: { width: 430, height: 932 } });

  test("a notice reflows the phone content column instead of burying the transcript", async ({ mount, page }) => {
    await mount(<AppShellNoticeBandStory />);
    const g = await raiseNoticeAndMeasure(page);

    // THE DEFECT, first and measured: with the band removed, the overlay stack's box INTERSECTS the
    // reading surface (`toast ∩ transcript` = true, probe receipt) — that intersection is the 60% burial.
    expect(overlaps(g.toast, g.transcript)).toBe(false);
    expect(overlaps(g.toast, g.h1)).toBe(false);
    expect(overlaps(g.toast, g.composer)).toBe(false);
    // THE REFLOW: the content pane gave the band its height. Without this, the two non-overlap
    // assertions would also pass for a toast that had merely been parked somewhere empty.
    expect(g.contentAfter.height).toBeLessThan(g.contentBefore.height);
    expect(g.contentAfter.y).toBeGreaterThan(g.contentBefore.y);
    // …and the mechanism that bought it: the stack is in the BAND, not on the body, and the band is not
    // a stacking context painting over anything — it has no position of its own.
    await expect(page.locator('[data-slot="notice-band"] [data-slot="toast-root"]')).toHaveCount(1);
    await expect(page.locator('[data-slot="notice-band"]')).toHaveCSS("position", "static");
  });
});

test("a notice reflows the desktop content column too — ONE surface, not a mobile mode", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mount(<AppShellNoticeBandStory />);
  const g = await raiseNoticeAndMeasure(page);

  expect(overlaps(g.toast, g.transcript)).toBe(false);
  expect(overlaps(g.toast, g.h1)).toBe(false);
  expect(overlaps(g.toast, g.composer)).toBe(false);
  expect(g.contentAfter.height).toBeLessThan(g.contentBefore.height);
  await expect(page.locator('[data-slot="notice-band"] [data-slot="toast-root"]')).toHaveCount(1);
});

test("the shell band sheds overlay padding and caps a burst without covering content", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mount(<AppShellNoticeBandStory />);
  const raise = page.getByTestId("raise-notice");
  await raise.click();
  await raise.click();
  await raise.click();
  const viewport = page.locator('[data-slot="notice-band"] [data-slot="toast-viewport"]');
  await expect(viewport).toHaveCSS("padding-top", "0px");
  await expect(viewport).toHaveCSS("padding-bottom", "0px");
  await expect(page.locator('[data-slot="notice-band"] [data-slot="toast-root"]')).toHaveCount(3);
  const band = await settledBox(page.locator('[data-slot="notice-band"]'));
  expect(band.height).toBeLessThanOrEqual(224);
  expect(overlaps(await settledBox(page.getByTestId("band-transcript")), band)).toBe(false);
});

// A CAP THAT CLIPS MUST ALSO SCROLL (side-eye 2026-08-21 P3). The test above cannot see the difference:
// three SHORT notices fit inside `max-block-size: min(14rem, 30dvh)`, so `band.height <= 224` holds
// whether the cap bites or not. Driven by TALL notices the cap genuinely bites — and then the notices
// past the window are only readable if the capped viewport is operable, which for a pointer user means
// the wheel. The viewport's own class list opens with `pointer-events-none` (the primitive's default, so
// an EMPTY overlay stack never eats clicks on the controls it floats over), and in the band that default
// hands the wheel to the transcript underneath instead of to the scroller that is clipping the notice.
test("a capped burst is READABLE: the band's own scroller takes the wheel, not the transcript beneath it", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mount(<AppShellNoticeBandStory />);
  const raise = page.getByTestId("raise-tall-notice");
  await raise.click();
  await raise.click();
  await raise.click();
  const viewport = page.locator('[data-slot="notice-band"] [data-slot="toast-viewport"]');
  await expect(page.locator('[data-slot="notice-band"] [data-slot="toast-root"]')).toHaveCount(3);
  // The cap BITES — without this the wheel assertion below would be vacuous (nothing to scroll).
  await expect.poll(() => viewport.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeGreaterThan(0);
  const before = await settledBox(page.getByTestId("band-transcript"));

  // Aim at the GAP BETWEEN two notices, not at a card. A toast root re-enables pointer events for
  // itself, so a wheel over one already reaches the scroller; the gaps are the pixels the region's own
  // `pointer-events-none` gives away, and a reader aiming at the stack rather than at one card lands
  // there. Every pixel of the capped window belongs to the scroller or the cap is only sometimes real.
  const firstNotice = await settledBox(page.locator('[data-slot="notice-band"] [data-slot="toast-root"]').first());
  const box = await settledBox(viewport);
  await page.mouse.move(box.x + box.width / 2, firstNotice.y + firstNotice.height + 4);
  await page.mouse.wheel(0, 200);
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  // …and the reading surface underneath did not move instead (the wheel was not handed through).
  expect((await settledBox(page.getByTestId("band-transcript"))).y).toBe(before.y);
});

test("with nothing to say the band costs zero pixels — an empty shell is byte-for-byte the old layout", async ({ mount, page }) => {
  await mount(<AppShellNoticeBandStory />);
  // The band element exists (its ref is what the outlet portals into) and renders NOTHING.
  await expect(page.locator('[data-slot="notice-band"]')).toHaveCount(1);
  await expect(page.locator('[data-slot="notice-band"]')).toBeHidden();
});

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

// #895 — THE OPEN COMMITS THE PANEL'S CHROME; THE BODY FOLLOWS IN A LATER TASK. Latching the collapsed
// body's mount DURING RENDER kept it out of the boot commit (4a6c54cdf) and put the whole query-backed
// mount inside the open click's own discrete-event task instead: measured on the live stack at 4× CPU,
// 127ms of blocking against a 50ms budget, the worst LoAF attributed to `dispatchDiscreteEvent` with 43ms
// of forced style/layout in the click frame.
//
// THE OBSERVABLE IS TASK SEPARATION, NOT A CATCHABLE FLASH. A MutationObserver batches everything one task
// mutated into ONE callback, so "the mode flip and the body's arrival are in the same callback" is exactly
// "they are in the same task" — a durable structural property, not a state that only exists while something
// is in flight. Frame counting would not do: the effect flush plus a sliced transition render can finish
// inside one 16ms frame on a fast machine and the assertion would flake for a reason that is not the defect.
test("opening a collapsed panel does not mount its body in the click's own task (#895)", async ({ mount, page }) => {
  await page.setViewportSize(WIDE);
  await mount(<AppShellStory />);
  const contextPanel = page.locator('.shell-panel[data-panel-side="context"]');
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "collapsed");
  await expect(contextPanel.locator(".shell-panel-body")).toBeEmpty();

  // One observer over the panel: `data-panel-mode` changes on the aside AND child additions under its
  // body. Each callback is one task's worth of mutations, so the callback INDEX that carried each event
  // is the task identity we are asserting on.
  await page.evaluate(() => {
    const records: { tick: number; mode: boolean; body: boolean }[] = [];
    Object.assign(globalThis, { __ctPanelTasks: records });
    const aside = document.querySelector('.shell-panel[data-panel-side="context"]');
    const body = aside?.querySelector(".shell-panel-body") ?? null;
    if (aside === null || body === null) {
      return;
    }
    let tick = 0;
    const observer = new MutationObserver((mutations) => {
      tick += 1;
      const mode = mutations.some((m) => m.type === "attributes" && m.attributeName === "data-panel-mode");
      const bodyGrew = mutations.some((m) => m.type === "childList" && m.target === body && m.addedNodes.length > 0);
      if (mode || bodyGrew) {
        records.push({ tick, mode, body: bodyGrew });
      }
    });
    observer.observe(aside, { attributes: true, attributeFilter: ["data-panel-mode"], childList: true, subtree: true });
  });

  await page.getByRole("button", { name: CONTEXT_TOGGLE_RE }).click();
  await expect.poll(async () => await contextPanel.evaluate((el) => el.textContent ?? ""), { intervals: [20, 50, 100] }).toContain("chats context pane");

  // The verdict carries its OWN positive controls: a probe that never saw one of the two events reports
  // that, and can never read as `deferred`. On the pre-fix source this settles on `same-task` (measured:
  // both events arrived in observer callback 1).
  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const tasks = (globalThis as typeof globalThis & { __ctPanelTasks: { tick: number; mode: boolean; body: boolean }[] }).__ctPanelTasks;
          const modeTick = tasks.find((t) => t.mode)?.tick ?? null;
          const bodyTick = tasks.find((t) => t.body)?.tick ?? null;
          if (modeTick === null) {
            return "probe-blind:no-mode-flip";
          }
          if (bodyTick === null) {
            return "probe-blind:no-body-mount";
          }
          return bodyTick > modeTick ? "deferred" : "same-task";
        }),
      { intervals: [20, 50, 100] },
    )
    .toBe("deferred");
});

test("a collapsed CONTEXT body mounts only when opened, then follows the active section (§4.2 rule 1)", async ({ mount, page }) => {
  await page.setViewportSize(WIDE);
  await mount(<AppShellStory />);
  const contextPanel = page.locator('.shell-panel[data-panel-side="context"]');
  const panelText = (): Promise<string> => contextPanel.evaluate((el) => el.textContent ?? "");

  // Chats supplies a context slot, but its default panel mode is collapsed: an off-screen body must
  // cost no mount work until a user opens it.
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "collapsed");
  await expect(contextPanel.locator(".shell-panel-body")).toBeEmpty();
  // Constrain the CSS-owned prospective tracks without changing a viewport breakpoint or appearance
  // response. The observer must settle this rendered deficit before the first click.
  await page.locator(".shell-grid").evaluate((element) => {
    element.style.setProperty("--dimension-panel-floor", "35rem");
    element.style.setProperty("--dimension-panel-context-step", "35rem");
  });
  await page.getByRole("button", { name: CONTEXT_TOGGLE_RE }).click();
  // At CONTENT's floor, CONTEXT is a transient overlay. This must be true on the FIRST click: deriving
  // the regime from the just-written context override made the first click persist `docked` then vanish.
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "overlay");
  await expect.poll(panelText, { intervals: [20, 50, 100] }).toContain("chats context pane");
  await page.getByRole("button", { name: CONTEXT_TOGGLE_RE }).click();
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "collapsed");

  // Switch to corpus (no context slot) — the chats panel must be GONE (not merely hidden: the shell
  // reads only sections[activeSection], so the stale body is unmounted) and the honest placeholder in.
  await page.getByRole("button", { name: "Corpus" }).click();
  // The generic un-swept fallback's copy (side-eye F-12): its title is no longer the word "Details" —
  // the CONTEXT band directly above it already says that, so the pane printed it twice over one
  // voiceless sentence. A section that states its own `context.empty` gets its own words instead.
  await expect.poll(panelText, { intervals: [20, 50, 100] }).toContain("Pick something from the list and its details appear here");
  expect(await panelText()).not.toContain("chats context pane");
});

test("the rail foot carries NO modal trigger — Settings routes as a SECTION (#866 S4)", async ({ mount, page }) => {
  const shell = await mount(<AppShellStory />);
  // The `theme` modal retired into the Appearance group's Looks section (#297/F-2): the foot is the
  // Settings section button + the persona identity widget, and clicking Settings ROUTES — no dialog.
  await expect(shell.getByRole("button", { name: "Switch theme" })).toHaveCount(0);
  await shell.locator(".shell-rail").getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(shell.locator(".shell-rail").getByRole("button", { name: "Settings", exact: true })).toHaveAttribute("aria-current", "page");
});

// finalFocus (§13.8 R1 · side-eye P3): the store-driven modal mounts already-open (no DialogTrigger), so
// ModalHost captures the trigger at open and hands it to Base UI's `finalFocus` — on Escape-close, focus
// returns to the theme control, not lost to <body>. A keyboard user's place is preserved.
test("closing a modal returns focus to the control that opened it (finalFocus)", async ({ mount, page }) => {
  const shell = await mount(<AppShellStory />);
  const trigger = shell.getByRole("button", { name: "open new chat" });
  await trigger.focus();
  await trigger.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("positive control: the desktop Jump click opens the command palette and Escape returns to its durable trigger", async ({ mount, page }) => {
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "chat.listChats": chatListResponder([]) });
  const shell = await mount(<AppShellStory />);
  const trigger = shell.getByRole("button", { name: JUMP_COMMAND_MENU_RE });

  await trigger.click();
  await expect(page.getByRole("dialog", { name: "Jump to…" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Jump to…" })).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

for (const { chord, title } of [
  { chord: "Meta+KeyK", title: "Meta+K" },
  { chord: "Control+KeyK", title: "Control+K" },
] as const) {
  test(`${title} opens the click-owned command palette and Escape returns to the Jump trigger`, async ({ mount, page }) => {
    await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "chat.listChats": chatListResponder([]) });
    const shell = await mount(<AppShellStory />);
    const trigger = shell.getByRole("button", { name: JUMP_COMMAND_MENU_RE });
    await expect(trigger).toBeVisible();
    await page.keyboard.press(chord);
    const dialog = page.getByRole("dialog", { name: "Jump to…" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("combobox")).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Jump to…" })).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}

// THE FOCUS RETURN IS THE DURABLE TRIGGER, NOT WHOEVER HELD FOCUS WHEN THE DIALOG MOUNTED (#890). The
// chord path used to hand ModalHost its return target through a SIDE CHANNEL: `useCommandShortcut` focused
// the trigger inside a rAF so that `DialogModal`'s mount-time `document.activeElement` snapshot would happen
// to see it. Anything that moved focus between that rAF and React's commit — Chromium's own focus
// restoration after a Meta accelerator is the documented one — made the snapshot `document.body`, which is
// connected, so `finalFocus` dutifully returned focus to the BODY and `toBeFocused` on the trigger failed
// for good (a permanent wrong outcome from a racy capture, which is why the flake never healed on retry).
// This test injects that exact interleaving deterministically: the trigger steals its own focus back the one
// time it receives it, before the dialog can mount. RED on the pre-fix source, and no `--repeat-each` needed.
test("the command palette returns focus to the durable Jump trigger when nothing holds focus as the dialog mounts", async ({ mount, page }) => {
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "chat.listChats": chatListResponder([]) });
  const shell = await mount(<AppShellStory />);
  const trigger = shell.getByRole("button", { name: JUMP_COMMAND_MENU_RE });
  await expect(trigger).toBeVisible();

  // Armed, not permanent: the handler reads the dataset flag the test clears once the dialog is up, so the
  // steal cannot also swallow the focus RETURN this test is here to observe. The disarm goes through a CSS
  // locator, not `trigger`: while the dialog is open Base UI marks everything outside it `aria-hidden`, so
  // the ROLE locator stops resolving and a `trigger.evaluate` there only times out.
  const triggerElement = page.locator('button[aria-label*="command menu"]');
  await triggerElement.evaluate((element: HTMLElement) => {
    element.dataset["ctStealFocus"] = "armed";
    element.addEventListener("focus", () => {
      if (element.dataset["ctStealFocus"] === "armed") {
        element.blur();
      }
    });
  });

  await page.keyboard.press("Meta+KeyK");
  const dialog = page.getByRole("dialog", { name: "Jump to…" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("combobox")).toBeFocused();
  await triggerElement.evaluate((element: HTMLElement) => {
    element.dataset["ctStealFocus"] = "disarmed";
  });

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Jump to…" })).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

interface ShortcutEventInit {
  readonly altKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly key?: string;
  readonly metaKey?: boolean;
  readonly repeat?: boolean;
  readonly shiftKey?: boolean;
}

function dispatchCommandKey(page: Page, init: ShortcutEventInit, targetSelector?: string): Promise<boolean> {
  return page.evaluate(
    ({ eventInit, selector }) => {
      const target = selector === undefined ? document : document.querySelector(selector);
      if (target === null) {
        throw new Error(`missing shortcut target: ${selector}`);
      }
      const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "k", ...eventInit });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    },
    { eventInit: init, selector: targetSelector },
  );
}

test("the command shortcut ignores text-entry targets without preventing their browser behavior", async ({ mount, page }) => {
  await mount(<AppShellStory />);
  await page.evaluate(() => {
    const host = document.createElement("div");
    host.dataset["shortcutInputs"] = "true";
    host.innerHTML =
      '<input data-kind="input"><textarea data-kind="textarea"></textarea><select data-kind="select"><option>one</option></select><div contenteditable="true" data-kind="editable"><span data-kind="editable-child">edit</span></div>';
    document.body.append(host);
  });

  const kinds = ["input", "textarea", "select", "editable", "editable-child"] as const;
  const prevented = await Promise.all(kinds.map((kind) => dispatchCommandKey(page, { metaKey: true }, `[data-kind="${kind}"]`)));
  expect(prevented).toEqual(kinds.map(() => false));
  await expect(page.getByRole("dialog", { name: "Jump to…" })).toHaveCount(0);
});

test("default is prevented only for an exact, non-repeating command shortcut", async ({ mount, page }) => {
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "chat.listChats": chatListResponder([]) });
  await mount(<AppShellStory />);

  const ignored = [
    { key: "j", metaKey: true },
    { metaKey: true, shiftKey: true },
    { altKey: true, ctrlKey: true },
    { ctrlKey: true, metaKey: true },
    { metaKey: true, repeat: true },
    {},
  ] satisfies readonly ShortcutEventInit[];
  expect(await Promise.all(ignored.map((init) => dispatchCommandKey(page, init)))).toEqual(ignored.map(() => false));
  await expect(page.getByRole("dialog", { name: "Jump to…" })).toHaveCount(0);

  expect(await dispatchCommandKey(page, { ctrlKey: true })).toBe(true);
  await expect(page.getByRole("dialog", { name: "Jump to…" })).toBeVisible();
});

test("rapid command shortcuts own one pending frame and unmount cancels it", async ({ mount, page }) => {
  const component = await mount(<AppShellStory />);
  await page.evaluate(() => {
    const callbacks = new Map<number, FrameRequestCallback>();
    const probe = { callbacks, canceled: 0, nextId: 1, requested: 0 };
    Object.assign(globalThis, { __commandFrameProbe: probe });
    globalThis.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      const id = probe.nextId;
      probe.nextId += 1;
      probe.requested += 1;
      callbacks.set(id, callback);
      return id;
    };
    globalThis.cancelAnimationFrame = (id: number): void => {
      if (callbacks.delete(id)) {
        probe.canceled += 1;
      }
    };
  });
  const readProbe = (): Promise<{ canceled: number; pending: number; requested: number }> =>
    page.evaluate(() => {
      const probe = (
        globalThis as typeof globalThis & {
          __commandFrameProbe: { callbacks: Map<number, FrameRequestCallback>; canceled: number; requested: number };
        }
      ).__commandFrameProbe;
      return { canceled: probe.canceled, pending: probe.callbacks.size, requested: probe.requested };
    });

  expect(await dispatchCommandKey(page, { metaKey: true })).toBe(true);
  expect(await dispatchCommandKey(page, { ctrlKey: true })).toBe(true);
  expect(await readProbe()).toEqual({ canceled: 0, pending: 1, requested: 1 });

  await component.unmount();
  expect(await readProbe()).toEqual({ canceled: 1, pending: 0, requested: 1 });
});

test("an open New-chat modal owns the overlay and the command shortcut does nothing", async ({ mount, page }) => {
  const shell = await mount(<AppShellStory />);
  await shell.getByRole("button", { name: "open new chat" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("New chat");
  const close = dialog.getByRole("button", { name: "Close" });
  await close.focus();

  expect(await dispatchCommandKey(page, { metaKey: true })).toBe(false);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

  await expect(dialog).toContainText("New chat");
  await expect(page.getByRole("dialog", { name: "Jump to…" })).toHaveCount(0);
  await expect(close).toBeFocused();
});

test("the command keydown listener does not duplicate across rerenders and is removed on unmount", async ({ mount, page }) => {
  await page.evaluate(() => {
    const active = new Set<EventListenerOrEventListenerObject>();
    const originalAdd = document.addEventListener.bind(document);
    const originalRemove = document.removeEventListener.bind(document);
    const probe = { active, adds: 0, removes: 0 };
    Object.assign(globalThis, { __commandListenerProbe: probe });
    document.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void => {
      if (type === "keydown" && !active.has(listener)) {
        active.add(listener);
        probe.adds += 1;
      }
      originalAdd(type, listener, options);
    }) as typeof document.addEventListener;
    document.removeEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void => {
      if (type === "keydown" && active.delete(listener)) {
        probe.removes += 1;
      }
      originalRemove(type, listener, options);
    }) as typeof document.removeEventListener;
  });
  const component = await mount(<AppShellStory />);
  const readProbe = (): Promise<{ active: number; adds: number; removes: number }> =>
    page.evaluate(() => {
      const probe = (
        globalThis as typeof globalThis & { __commandListenerProbe: { active: Set<EventListenerOrEventListenerObject>; adds: number; removes: number } }
      ).__commandListenerProbe;
      return { active: probe.active.size, adds: probe.adds, removes: probe.removes };
    });
  await expect.poll(async () => (await readProbe()).active).toBe(1);
  const mounted = await readProbe();
  expect(mounted.active).toBe(1);

  await page.getByRole("button", { name: "Corpus", exact: true }).click();
  expect(await readProbe()).toEqual(mounted);

  await component.unmount();
  const unmounted = await readProbe();
  expect(unmounted.active).toBe(0);
  expect(unmounted.removes).toBe(mounted.adds);
  expect(await dispatchCommandKey(page, { metaKey: true })).toBe(false);
});

// The Theme arm retired with the modal (#866 S4) — Jump is the sheet's surviving modal handoff.
for (const handoff of [{ name: "Jump", trigger: "Jump to…" }] as const) {
  test(`MOBILE: You-sheet ${handoff.name} handoff returns focus to the durable You tab`, async ({ mount, page }) => {
    await page.setViewportSize(MOBILE);
    const shell = await mount(<AppShellStory />);
    const you = shell.getByRole("button", { name: "You" });
    await you.click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.getByRole("button", { name: handoff.trigger }).click();
    await expect(page.getByRole("dialog", { name: handoff.name })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(you).toBeFocused();
  });
}

test("MOBILE: an ordinary You-sheet close still returns focus to its durable trigger", async ({ mount, page }) => {
  await page.setViewportSize(MOBILE);
  const shell = await mount(<AppShellStory />);
  const you = shell.getByRole("button", { name: "You" });
  await you.click();
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(you).toBeFocused();
});

test("MOBILE: You-sheet Jump handoff keeps Search focused through Drawer cleanup and accepts immediate typing", async ({ mount, page }) => {
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "chat.listChats": chatListResponder([]) });
  await page.setViewportSize(MOBILE);
  const shell = await mount(<AppShellStory />);
  const you = shell.getByRole("button", { name: "You" });
  await you.click();
  await page.getByRole("button", { name: "Jump to…" }).click();

  const dialog = page.getByRole("dialog", { name: "Jump to…" });
  const input = dialog.getByRole("combobox");
  await expect(input).toBeFocused();
  await page.keyboard.type("r");
  await expect(input).toHaveValue("r");
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))));
  await expect(input).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(you).toBeFocused();
});

test("filtering the command palette keeps the dialog and search geometry stable", async ({ mount, page }) => {
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "chat.listChats": chatListResponder([]) });
  const shell = await mount(<AppShellStory />);
  await shell.getByRole("button", { name: JUMP_COMMAND_MENU_RE }).click();
  const dialog = page.getByRole("dialog", { name: "Jump to…" });
  const input = dialog.getByRole("combobox");
  await expect(input).toBeVisible();
  const before = {
    dialog: await dialog.boundingBox(),
    input: await input.boundingBox(),
  };

  await input.fill("analytics");
  await expect(dialog.getByRole("option", { name: "Analytics", exact: true })).toBeVisible();
  const after = {
    dialog: await dialog.boundingBox(),
    input: await input.boundingBox(),
  };

  expect(before.dialog).not.toBeNull();
  expect(before.input).not.toBeNull();
  expect(after.dialog).not.toBeNull();
  expect(after.input).not.toBeNull();
  expect(after.dialog?.y).toBeCloseTo(before.dialog?.y ?? 0, 1);
  expect(after.input?.y).toBeCloseTo(before.input?.y ?? 0, 1);
});

test("the real command palette keeps roving selection exposed from its focused combobox", async ({ mount, page }) => {
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "chat.listChats": chatListResponder([]) });
  await page.setViewportSize(MOBILE);
  const shell = await mount(<AppShellStory />);
  await shell.getByRole("button", { name: "You" }).click();
  await page.getByRole("button", { name: "Jump to…" }).click();
  const dialog = page.getByRole("dialog", { name: "Jump to…" });
  const input = dialog.getByRole("combobox");
  await input.click();
  await input.fill("analytics");
  await expect(dialog.getByRole("option", { name: "Analytics", exact: true })).toBeVisible();
  await input.press("ArrowDown");

  const selected = dialog.getByRole("option", { selected: true });
  await expect(selected).toBeVisible();
  const selectedId = await selected.getAttribute("id");
  await expect(input).toHaveAttribute("aria-activedescendant", selectedId ?? "");
});

test("the command palette reserves a compact, stable result viewport while filtering", async ({ mount, page }) => {
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "chat.listChats": chatListResponder([]) });
  const shell = await mount(<AppShellStory />);
  await shell.getByRole("button", { name: JUMP_COMMAND_MENU_RE }).click();
  const dialog = page.getByRole("dialog", { name: "Jump to…" });
  const input = dialog.getByRole("combobox");
  const list = dialog.getByRole("listbox");
  await expect(input).toBeVisible();
  await expect.poll(async () => list.boundingBox()).not.toBeNull();
  const before = await list.boundingBox();

  await input.fill("analytics");
  await expect(dialog.getByRole("option", { name: "Analytics" })).toBeVisible();
  await expect.poll(async () => list.boundingBox()).not.toBeNull();
  const readAfterAtAssertion = async (): Promise<typeof after> => await list.boundingBox();
  const after = await list.boundingBox();
  // A 12rem viewport still scrolls the complete command set, while one result does not leave the former
  // 24rem sheet-sized void beneath it.
  await expect.poll(async () => (await readAfterAtAssertion())?.height).toBeLessThanOrEqual(192);
  await expect.poll(async () => (await readAfterAtAssertion())?.height).toBeCloseTo(before?.height ?? 0, 1);

  await input.fill("zzzzzzzz");
  const empty = dialog.getByText("No matches.", { exact: true });
  await expect(empty).toBeVisible();
  await expect.poll(async () => empty.boundingBox()).not.toBeNull();
  await expect.poll(async () => list.boundingBox()).not.toBeNull();
  const emptyBox = await empty.boundingBox();
  const emptyListBox = await list.boundingBox();
  const emptyCenter = (emptyBox?.y ?? 0) + (emptyBox?.height ?? 0) / 2;
  const listCenter = (emptyListBox?.y ?? 0) + (emptyListBox?.height ?? 0) / 2;
  expect(emptyCenter).toBeCloseTo(listCenter, 0);
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
  await shell.getByRole("button", { name: "open new chat" }).click();
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
    await expect.poll(async () => header.boundingBox()).not.toBeNull();
    const beforeBox = await header.boundingBox();
    await scrollInteriorToBottom(page);
    await expect.poll(async () => Math.abs(((await header.boundingBox())?.y ?? 0) - (beforeBox?.y ?? -999))).toBeLessThan(1.5);
  });
}

test("the drawer's sticky modal header resolves the raised stratum and paints above positioned content", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1024, height: 500 });
  await mount(<ModalScrollStory modalId="you" />);
  await page.getByTestId("tall-modal-body").waitFor({ state: "attached" });

  const header = page.locator(".shell-modal-header");
  await expect.poll(() => header.evaluate((element) => getComputedStyle(element).position)).toBe("sticky");
  await expect.poll(() => header.evaluate((element) => getComputedStyle(element).zIndex)).toBe(TOKENS["z.raised"].value);
  await scrollInteriorToBottom(page);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const headerElement = document.querySelector<HTMLElement>(".shell-modal-header");
        const probe = document.querySelector<HTMLElement>('[data-testid="modal-stacking-probe"]');
        if (headerElement === null || probe === null) {
          return "missing";
        }
        const headerRect = headerElement.getBoundingClientRect();
        const probeRect = probe.getBoundingClientRect();
        const boxesOverlap = probeRect.top < headerRect.bottom && probeRect.bottom > headerRect.top;
        const winner = document.elementFromPoint(headerRect.left + headerRect.width / 2, headerRect.top + headerRect.height / 2);
        return `${boxesOverlap ? "overlap" : "separate"}:${winner !== null && headerElement.contains(winner) ? "header" : "content"}`;
      }),
    )
    .toBe("overlap:header");
});

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
    await expect.poll(async () => popup.evaluate((el) => getComputedStyle(el).getPropertyValue("--color-background").trim())).toContain("300");
  });
}

// ── #960: colorization follows the custom-theme carrier into real portal surfaces ───────────────
// ThemeScope owns a custom palette inline on the common `display:contents` ancestor of `.shell-grid`
// and `[data-slot="portal-root"]`. Colorization must therefore redeclare its derived border tokens below
// that inline carrier on BOTH sibling branches. Drive one Dialog and the mobile-shaped Drawer, toggle the
// real html appearance attribute without remounting, and prove the same popup node changes with the shell.
function cssCustomProperty(locator: Locator, property: string): Promise<string> {
  return locator.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name).trim(), property);
}

const COLORIZATION_THEME_ID = mintTypeId(ID_PREFIX.theme);
const COLORIZATION_ACCENT = "oklch(0.72 0.19 152)";
const COLORIZATION_BACKGROUND = "oklch(0.24 0.06 272)";
const COLORIZATION_CUSTOM_CSS = '[data-testid="tall-modal-body"] { outline: 2px solid var(--color-border); }';

for (const modalId of ["command", "you"] as const) {
  test(`#960 custom-theme colorization reaches the real "${modalId}" portal without a remount`, async ({ mount, page }) => {
    await routeTrpc(page, {
      ...SHELL_AMBIENT_ROUTES,
      "settings.getUserSettings": {
        userId: "user_ct_shell_colorization",
        schemaVersion: 1,
        config: {
          ...DEFAULT_USER_SETTINGS,
          appearance: { ...DEFAULT_USER_SETTINGS.appearance, enableThemeColorization: false },
          theme: { ...DEFAULT_USER_SETTINGS.theme, selectedThemeId: COLORIZATION_THEME_ID },
        },
        updatedAt: 0,
      },
      "settings.getTheme": {
        id: COLORIZATION_THEME_ID,
        name: "Colorization CT",
        override: { accent: COLORIZATION_ACCENT, background: COLORIZATION_BACKGROUND },
        css: COLORIZATION_CUSTOM_CSS,
        isSeed: false,
        isDefault: false,
        createdAt: 0,
        updatedAt: 0,
      },
    });
    await mount(<ModalScrollStory includeThemePreview={true} modalId={modalId} />);
    await page.getByTestId("tall-modal-body").waitFor({ state: "attached" });

    const themeScope = page.locator('[data-slot="theme-scope"]:has(.shell-grid)');
    const grid = page.locator(".shell-grid");
    const portalRoot = page.locator('[data-slot="portal-root"]');
    const popup = page.locator('[data-slot="dialog-popup"], [data-slot="drawer-popup"]');
    const header = page.locator(".shell-modal-header");
    const customCssProbe = page.getByTestId("tall-modal-body");
    const nestedThemePreview = page.getByTestId("nested-theme-preview");
    await expect(popup).toBeVisible();
    await expect(header).toBeVisible();
    await expect(nestedThemePreview).toBeVisible();
    await expect.poll(() => cssCustomProperty(themeScope, "--color-primary")).toBe(COLORIZATION_ACCENT);
    await expect(page.locator("style[data-orb-theme-css]")).toHaveCount(1);
    await popup.evaluate((element) => {
      element.setAttribute("data-colorization-node", "same-node");
    });

    await page.evaluate(() => document.documentElement.removeAttribute("data-theme-colorization"));
    const off = await Promise.all([
      cssCustomProperty(grid, "--color-border"),
      cssCustomProperty(portalRoot, "--color-border"),
      cssCustomProperty(popup, "--color-border"),
    ]);
    expect(new Set(off).size, "the uncolorized custom border must share one inherited value").toBe(1);
    const offHeaderBorder = await header.evaluate((element) => getComputedStyle(element).borderBlockEndColor);
    const offCustomCssBorder = await customCssProbe.evaluate((element) => getComputedStyle(element).outlineColor);
    const nestedThemeBorder = await cssCustomProperty(nestedThemePreview, "--color-border");
    expect(offCustomCssBorder, "the selected theme's custom CSS must consume the inherited border token").toBe(offHeaderBorder);

    await page.evaluate(() => document.documentElement.setAttribute("data-theme-colorization", ""));
    await expect.poll(() => cssCustomProperty(grid, "--color-border")).not.toBe(off[0]);
    const on = await Promise.all([
      cssCustomProperty(grid, "--color-border"),
      cssCustomProperty(portalRoot, "--color-border"),
      cssCustomProperty(popup, "--color-border"),
    ]);
    expect(on[1], "the portal-root branch must carry the same derived border as the shell").toBe(on[0]);
    expect(on[2], "the real popup must inherit the portal-root branch's derived border").toBe(on[0]);
    await expect(popup).toHaveAttribute("data-colorization-node", "same-node");
    await expect.poll(() => header.evaluate((element) => getComputedStyle(element).borderBlockEndColor)).not.toBe(offHeaderBorder);
    await expect.poll(() => customCssProbe.evaluate((element) => getComputedStyle(element).outlineColor)).not.toBe(offCustomCssBorder);
    expect(await customCssProbe.evaluate((element) => getComputedStyle(element).outlineColor), "custom CSS must follow the resolved portal token family").toBe(
      await header.evaluate((element) => getComputedStyle(element).borderBlockEndColor),
    );
    expect(
      await cssCustomProperty(nestedThemePreview, "--color-border"),
      "an inline nested ThemeScope must remain isolated from the shell appearance axis",
    ).toBe(nestedThemeBorder);

    await page.evaluate(() => document.documentElement.removeAttribute("data-theme-colorization"));
    await expect.poll(() => cssCustomProperty(popup, "--color-border")).toBe(off[0]);
  });
}

test("#935 a requested custom-light theme proves its rendered palette and effective polarity through the real portal", async ({ mount, page }) => {
  const background = "oklch(0.94 0.02 92)";
  await routeTrpc(page, {
    ...SHELL_AMBIENT_ROUTES,
    "settings.getUserSettings": {
      userId: "user_ct_theme_carrier",
      schemaVersion: 1,
      config: {
        ...DEFAULT_USER_SETTINGS,
        theme: { ...DEFAULT_USER_SETTINGS.theme, selectedThemeId: COLORIZATION_THEME_ID },
      },
      updatedAt: 0,
    },
    "settings.getTheme": {
      id: COLORIZATION_THEME_ID,
      name: "Carrier light CT",
      override: { accent: COLORIZATION_ACCENT, background },
      css: '[data-testid="tall-modal-body"] { outline: 2px solid var(--color-border); }',
      isSeed: false,
      isDefault: false,
      createdAt: 0,
      updatedAt: 0,
    },
  });
  await mount(<ModalScrollStory modalId="command" />);
  const scope = page.locator('[data-slot="theme-scope"]:has(.shell-grid)');
  const portal = page.locator('[data-slot="portal-root"]');
  const popup = page.locator('[data-slot="dialog-popup"]');
  await expect(popup).toBeVisible();

  // A custom theme has no generated seed selector. The painted token and derived color-scheme on the
  // live ThemeScope are the proof of what won; the request/envelope receipt alone cannot establish this.
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
  await expect.poll(() => cssCustomProperty(scope, "--color-background")).toBe(background);
  await expect.poll(() => cssCustomProperty(scope, "color-scheme")).toBe("light");
  expect(await cssCustomProperty(portal, "--color-background")).toBe(background);
  expect(await cssCustomProperty(portal, "color-scheme")).toBe("light");
  expect(await cssCustomProperty(popup, "--color-background")).toBe(background);
  expect(await cssCustomProperty(popup, "color-scheme")).toBe("light");
  await expect(page.locator("style[data-orb-theme-css]")).toHaveCount(1);
});

test("#960 seed theme keeps byte-identical border tokens across root, shell, and portal in both colorization arms", async ({ mount, page }) => {
  await routeTrpc(page, SHELL_AMBIENT_ROUTES);
  await mount(<ModalScrollStory modalId="command" />);
  await page.getByTestId("tall-modal-body").waitFor({ state: "attached" });

  const surfaces = [page.locator("html"), page.locator(".shell-grid"), page.locator('[data-slot="portal-root"]'), page.locator('[data-slot="dialog-popup"]')];
  const readBorders = (): Promise<readonly string[]> => Promise.all(surfaces.map((surface) => cssCustomProperty(surface, "--color-border")));

  await page.evaluate(() => document.documentElement.removeAttribute("data-theme-colorization"));
  const off = await readBorders();
  expect(new Set(off).size, "the seed's uncolorized token must remain one inherited value").toBe(1);

  await page.evaluate(() => document.documentElement.setAttribute("data-theme-colorization", ""));
  await expect.poll(readBorders).not.toEqual(off);
  const on = await readBorders();
  expect(new Set(on).size, "the paired descendant arm must be byte-identical to the seed/root derivation").toBe(1);

  await page.evaluate(() => document.documentElement.removeAttribute("data-theme-colorization"));
  await expect.poll(readBorders).toEqual(off);
});

// ── #937: density belongs to the common ThemeScope carrier, not the shell grid ────────────────────
// The portal root is a SIBLING of `.shell-grid`, so stamping density on the grid gives the shell compact
// spacing while every Dialog/Drawer keeps the comfortable floor. Drive a real Dialog through AppShell's
// modal registry and compare the four resolved spacing intents at the two rendered surfaces. The locator
// used as the settle barrier admits the old grid carrier and the new ThemeScope carrier, so the compact
// arm reaches the mismatch against the old source instead of failing early on the new mechanism.
const DENSITY_SPACING_INTENTS = ["--spacing-field", "--spacing-row", "--spacing-block", "--spacing-section"] as const;

function densitySpacingIntents(locator: Locator): Promise<readonly string[]> {
  return locator.evaluate((element, properties) => {
    const style = getComputedStyle(element);
    return properties.map((property) => style.getPropertyValue(property).trim());
  }, DENSITY_SPACING_INTENTS);
}

for (const density of ["comfortable", "compact"] as const) {
  test(`#937 ${density}: a real portalled dialog inherits the shell's resolved density`, async ({ mount, page }) => {
    await routeTrpc(page, {
      ...SHELL_AMBIENT_ROUTES,
      "character.list": [],
      "settings.getUserSettings": () => ({
        userId: `user_ct_shell_density_${density}`,
        schemaVersion: 1,
        config: {
          ...DEFAULT_USER_SETTINGS,
          appearance: { ...DEFAULT_USER_SETTINGS.appearance, density },
        },
        updatedAt: 0,
      }),
    });
    const shell = await mount(<AppShellStory />);
    const themeScope = page.locator('[data-slot="theme-scope"]:has(.shell-grid)');
    const grid = page.locator(".shell-grid");
    const portalRoot = page.locator('[data-slot="portal-root"]');

    // SETTLED rendered density, expressed so this proof compiles and runs against both carrier shapes.
    await expect(page.locator(`.shell-grid[data-density="${density}"], [data-slot="theme-scope"][data-density="${density}"]:has(.shell-grid)`)).toHaveCount(1);

    await shell.getByRole("button", { name: "open new chat" }).click();
    const popup = page.locator('[data-slot="dialog-popup"]');
    await expect(popup).toBeVisible();

    const [shellSpacing, overlaySpacing] = await Promise.all([densitySpacingIntents(grid), densitySpacingIntents(popup)]);
    expect(overlaySpacing, `the ${density} portal spacing must match the shell`).toEqual(shellSpacing);

    // One carrier owns both branches: the grid and portal root are direct siblings under ThemeScope.
    await expect
      .poll(() =>
        themeScope.evaluate((scope) => {
          const shellGrid = scope.querySelector(":scope > .shell-grid");
          const portal = scope.querySelector(':scope > [data-slot="portal-root"]');
          return shellGrid !== null && portal !== null;
        }),
      )
      .toBe(true);
    await expect(themeScope).toHaveAttribute("data-density", density);
    await expect(grid).not.toHaveAttribute("data-density");
    await expect(portalRoot.locator('[data-slot="dialog-popup"]')).toHaveCount(1);
  });
}

const DENSITY_THEME_ID = mintTypeId(ID_PREFIX.theme);
const DENSITY_THEME_CASES = [
  { name: "Light seed", isSeed: true, expectedDensity: "comfortable", themeDensity: "compact", outerDensity: "compact" },
  { name: "custom", isSeed: false, expectedDensity: "compact", themeDensity: "compact", outerDensity: "comfortable" },
] as const;

for (const densityCase of DENSITY_THEME_CASES) {
  test(`#938 ${densityCase.name}: resolved density wins symmetrically in the shell and its portal root`, async ({ mount, page }) => {
    await routeTrpc(page, {
      ...SHELL_AMBIENT_ROUTES,
      "character.list": [],
      "settings.getUserSettings": () => ({
        userId: `user_ct_shell_density_${densityCase.isSeed ? "seed" : "custom"}`,
        schemaVersion: 1,
        config: {
          ...DEFAULT_USER_SETTINGS,
          appearance: { ...DEFAULT_USER_SETTINGS.appearance, density: "comfortable" },
          theme: { ...DEFAULT_USER_SETTINGS.theme, selectedThemeId: DENSITY_THEME_ID },
        },
        updatedAt: 0,
      }),
      "settings.getTheme": {
        id: DENSITY_THEME_ID,
        name: densityCase.isSeed ? "Light" : "Custom",
        override: { density: densityCase.themeDensity },
        css: null,
        isSeed: densityCase.isSeed,
        isDefault: false,
        createdAt: 0,
        updatedAt: 0,
      },
    });
    const shell = await mount(<AppShellStory />, { hooksConfig: { theme: { density: densityCase.outerDensity } } });
    const themeScope = page.locator('[data-slot="theme-scope"]:has(.shell-grid)').last();
    await expect(themeScope).toHaveAttribute("data-density", densityCase.expectedDensity);

    await shell.getByRole("button", { name: "open new chat" }).click();
    const popup = page.locator('[data-slot="dialog-popup"]');
    await expect(popup).toBeVisible();
    const canonical = await page.evaluate((density) => {
      const probe = document.createElement("div");
      probe.setAttribute("data-density", density);
      document.body.append(probe);
      const style = getComputedStyle(probe);
      const values = ["--spacing-field", "--spacing-row", "--spacing-block", "--spacing-section"].map((name) => style.getPropertyValue(name).trim());
      probe.remove();
      return values;
    }, densityCase.expectedDensity);
    await expect.poll(() => densitySpacingIntents(popup)).toEqual(canonical);
    await expect(page.locator('[data-slot="portal-root"] [data-slot="dialog-popup"]')).toHaveCount(1);
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

// #493 (side-eye 2026-08-22 rail-characters P2-3) — the LIST landmark's name was derived from the ACTIVE
// SECTION, so it could only ever describe the section. The Characters LIST pane swaps its whole contents to
// a character's CHATS when one is opened (the projection design's D2 arm); the visible band followed, the
// landmark did not, and navigating by landmark announced "Characters list, complementary" over a chat
// roster. The landmark is named BY THE BAND now, so whatever the band says, it says.
//
// Two arms, because "it follows" is the claim: the same shell, two band identities.
test("#493 the LIST landmark is named by its own band, and follows it when the pane swaps", async ({ mount, page }) => {
  const picker = await mount(<AppShellNamedListBandStory title="Characters" />);
  await expect(page.getByRole("complementary", { name: "Characters", exact: true })).toBeVisible();
  await picker.unmount();

  // The SWAPPED pane — the band reads `CHATS · SABINE VEYRA`, and so does the landmark.
  await mount(<AppShellNamedListBandStory accent="Sabine Veyra" title="Chats" />);
  await expect(page.getByRole("complementary", { name: "Chats · Sabine Veyra", exact: true })).toBeVisible();
  // …and the stale section-derived name is gone, not merely joined.
  await expect(page.getByRole("complementary", { name: "Chats list", exact: true })).toHaveCount(0);
});

// #1349 — A FENCE, NOT A DEFECT PROOF, AND IT SAYS SO. The row filed the LIST landmark's name as `Chats6`
// (noun and census run together) because the band's heading holds two inline spans with no text node
// between them. It is not true of the BROWSER: measured here 2026-09-04 through Chromium's own name
// computation (CDP `Accessibility.getFullAXTree` on this exact story) the node reads
// `complementary|Chats 6`, with the space, and Playwright's role engine agrees. The `Chats6` receipt came
// from an in-page hand-rolled name key that concatenates textContent — the already-filed instrument defect
// (snap `map-browser.ts` + the walker's `doorNameKey`). So nothing was changed for it; this pin exists to
// hold the browser-true name against a future edit to the band's structure, and it was GREEN before it.
test("#1349 fence: the LIST landmark's name keeps the census a separate word from the noun", async ({ mount, page }) => {
  await mount(<AppShellNamedListBandStory count={6} title="Chats" />);
  await expect(page.getByText("chats list pane")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Chats 6", exact: true })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Chats6", exact: true })).toHaveCount(0);
});

// The FALLBACK arm, and it is load-bearing rather than belt-and-braces: a section whose band is not a
// `ListPaneHeader` (refinery) renders no such heading, and an `aria-labelledby` that resolves to nothing
// falls through to `aria-label` per the accessible-name computation. `AppShellStory` supplies no band at
// all, which is exactly that case — the landmark-uniqueness pin above is the proof it still holds.

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
  await expect
    .poll(async () =>
      page.locator(".shell-grid").evaluate((grid) => {
        const candidates = [...grid.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')];
        const first = candidates.find((el) => !el.hasAttribute("disabled") && el.tabIndex >= 0);
        return first?.textContent ?? "";
      }),
    )
    .toBe("Skip to content");

  // AT REST it costs the pointer user nothing — asserted through the RESOLVED clip, not the class string
  // (which could survive a variant change that stopped clipping). Deliberately not a box assertion: the
  // button's own `size` arm pins a control height in a custom token, which is opaque to tailwind-merge and
  // survives `sr-only`'s 1px pair, so the rest box measures ~26px wide and is invisible anyway — the CLIP
  // is what hides it, and the clip is what this must read.
  await expect.poll(async () => skip.evaluate((el) => globalThis.getComputedStyle(el).clipPath)).toBe("inset(50%)");
  const restBox = await skip.boundingBox();

  // A real Tab first, so the page is in KEYBOARD modality — `:focus-visible` (which is what un-hides the
  // control) matches a programmatic focus only when the user's last interaction was a keypress, so a bare
  // `.focus()` on a fresh page would read as pointer focus and the reveal below would be a false red.
  await page.keyboard.press("Tab");
  await skip.focus();
  await expect(skip).toBeFocused();

  // …and taking focus REVEALS it (`not-focus-visible:sr-only`) — a skip link nobody can see while using it
  // is a keyboard trap wearing a fix. Unclipped AND wider than the clipped stub, both rendered.
  await expect.poll(async () => skip.evaluate((el) => globalThis.getComputedStyle(el).clipPath)).toBe("none");
  const focusedBox = await skip.boundingBox();
  expect(focusedBox?.width ?? 0).toBeGreaterThan(restBox?.width ?? 0);

  // …AND IT IS A REAL TARGET WHILE REVEALED (side-eye rail-home P3-7, WCAG 2.5.8). Measured on the live
  // shell: 94x18 with a computed padding of "0px" — bare text with a border and no box, under the 24x24
  // floor on its block axis, on the FIRST control a keyboard user meets. The cause was the reveal spelling,
  // not the Button: `sr-only focus-visible:not-sr-only` layers a RESET whose `padding: 0` / `height: auto`
  // land at the same specificity as the Button's own `h-control-sm px-block` and beat them. The pin reads
  // the rendered box rather than the class string, so any future respelling that loses the box is RED.
  expect(focusedBox?.height ?? 0).toBeGreaterThanOrEqual(TARGET_SIZE_FLOOR_PX);
  expect(focusedBox?.width ?? 0).toBeGreaterThanOrEqual(TARGET_SIZE_FLOOR_PX);
  // The box comes back because the control is simply the `sm` Button it declares itself to be — padding
  // included. Asserted separately from the height so a future `min-h-*` band-aid cannot pass this.
  await expect.poll(async () => skip.evaluate((el) => Number.parseFloat(globalThis.getComputedStyle(el).paddingInlineStart))).toBeGreaterThan(0);

  // It moves focus to the `<main>` scroll container itself (tabIndex=-1, named by the active section)
  // rather than to a control inside it, so the NEXT Tab lands on the section's first real affordance
  // whatever that section is — here, the story's "content control".
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(shell.getByRole("button", { name: "content control", exact: true })).toBeFocused();
});

// ── ARRIVAL FOCUS vs THE LIST-PANE PRIMARY (a11y #283) ─────────────────────────────────────────────
// SectionContent restores focus to the `<main>` content anchor on a section swap so a hidden Activity
// subtree never strands the reading cursor (WCAG). But it used to fire that restore UNCONDITIONALLY —
// including on rail NAVIGATION, where focus sits on the rail button the user just activated. Yanking focus
// into `<main>` there lands it PAST the LIST panel (which is DOM-before `<main>`), so a forward-Tab could
// never reach that section's primary create action — the band's "New character"/"New corpus item"/… — on
// any library section. The restore now runs only when the swap actually DROPPED focus (activeElement fell to
// <body>, i.e. it was inside the hidden content), which is the two tests below: navigation preserves it,
// genuine loss restores it.

test("a11y #283: keyboard rail navigation to a library section does NOT steal focus into <main> — the pane's primary stays in the forward tab order", async ({
  mount,
  page,
}) => {
  const shell = await mount(<AppShellListPrimaryStory />);
  // Barrier on the SETTLED landing section before navigating (chats is the story's landing).
  await expect(page.getByText("chats content pane")).toBeVisible();

  // Navigate to corpus through a REAL, keyboard-activated rail button: focus is on the button the user
  // pressed, exactly as a keyboard user arrives at a section. `exact` so it never collides with the LIST
  // primary's "New corpus item" (a substring name match otherwise resolves two buttons).
  const corpusTab = shell.getByRole("button", { name: "Corpus", exact: true });
  await corpusTab.focus();
  await expect(corpusTab).toBeFocused();
  await corpusTab.press("Enter");
  await expect(page.getByText("corpus content pane")).toBeVisible();
  // The pane's primary is rendered in the (docked) LIST panel.
  await expect(page.getByTestId("list-primary")).toBeVisible();

  // THE DEFECT: the arrival focus used to steal into `<main>`, past the LIST pane. It must not.
  await expect(page.getByRole("main")).not.toBeFocused();
  // Focus stayed on the rail button the user activated (the arrival point), so the forward tab order is
  // rail → list-band primary → content.
  await expect(corpusTab).toBeFocused();

  // …and the concrete tab-order proof, read off the rendered DOM: the arrival point (the focused element)
  // PRECEDES the pane's primary, which PRECEDES `<main>` — so a forward-Tab reaches the primary instead of
  // it being stranded behind the cursor. Under the old unconditional steal, focus was `<main>` (AFTER the
  // primary) and this resolved "unreachable".
  await expect
    .poll(() =>
      page.evaluate(() => {
        const focused = document.activeElement;
        const primary = document.querySelector('[data-testid="list-primary"]');
        const main = document.querySelector("main");
        if (focused === null || primary === null || main === null) {
          return "missing";
        }
        // querySelectorAll("*") yields every element in document (tree) order, so an index comparison IS the
        // forward tab direction — no compareDocumentPosition bitmask read.
        const order = [...document.querySelectorAll("*")];
        const iFocused = order.indexOf(focused);
        const iPrimary = order.indexOf(primary);
        const iMain = order.indexOf(main);
        return iFocused < iPrimary && iPrimary < iMain ? "reachable" : "unreachable";
      }),
    )
    .toBe("reachable");
});

// The WCAG restore is PRESERVED (fence): the story lands home→chats with focus on <body> (nothing had it),
// which is the genuine focus-loss shape — the swap must still move focus to the `<main>` content anchor so a
// hidden Activity never strands the reading cursor. Passes on both source versions; it guards the #283 fix
// from over-correcting into "never restore".
test("a11y #283: when the swap lands with focus dropped to <body>, arrival restores it to the main content anchor", async ({ mount, page }) => {
  await mount(<AppShellListPrimaryStory />);
  await expect(page.getByText("chats content pane")).toBeVisible();
  await expect(page.getByRole("main")).toBeFocused();
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
  // The ballooning guard: rendered mobile-bar buttons (`mobile: "tab"` sections + "You") must never
  // exceed the thumb-reach budget — a def flipping to `mobile: "tab"` must not silently balloon it. The
  // rail is now ONE DOM list (no `.shell-rail-mobile` twin); `getByRole` counts only the VISIBLE buttons,
  // so the `[data-mobile="sheet"]` entries (display:none on the bar) are correctly excluded.
  await expect.poll(async () => page.locator(".shell-rail").getByRole("button").count()).toBeLessThanOrEqual(MAX_MOBILE_TAB_BUTTONS);
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
    ...SHELL_AMBIENT_ROUTES,
    "persona.list": () => [SHEET_PERSONA],
    "settings.getUserSettings": () => ({
      userId: "user_ct_you",
      schemaVersion: 1,
      config: { ...DEFAULT_USER_SETTINGS, seeds: { ...DEFAULT_USER_SETTINGS.seeds, currentPersonaId: SHEET_PERSONA.id } },
      updatedAt: 0,
    }),
  });
  // The sheet's ACCOUNT FOOT (#866 S4 — the retired account modal's facts + Log out live in the persona
  // widget now) reads the auth `/config` + `/me` HTTP seams; stub them so the foot renders its facts.
  await page.route("**/api/auth/config", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ mode: "local", requiresLogin: true, localEnabled: true, oidcEnabled: false, discreetLogin: false, defaultHandle: "owner" }),
    }),
  );
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ authenticated: true, handle: "owner", role: "owner" }) }),
  );
  const shell = await mount(<AppShellStory />);
  await shell.getByRole("button", { name: "You", exact: true }).click();

  // The sheet is a BLIND PROJECTION over the resolved chrome list: the rail.end Settings SECTION row
  // (the theme modal retired into its Appearance group, #866 S4), the persona identity widget's sheet
  // lens (Playing-as header — mobile persona switching lives HERE), and the overflow sections.
  await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Switch theme" })).toHaveCount(0);
  // Exact: the who-head's gloss ("Playing as") and the current row's pill ("playing as") are BOTH real —
  // the un-exact string matches case-insensitively and trips strict mode.
  await expect(page.getByText("Playing as", { exact: true })).toBeVisible();
  // …and it is the CURRENT persona's row that says it (the row is the identity's ONE home, P2). The row's
  // select target is STATE-AWARE (side-eye 2026-08-07 P3a): on the persona you are already playing as it is
  // named for the state, not for a switch that would be a no-op — "Switch to X, current true" was the defect.
  await expect(page.getByRole("button", { name: `${SHEET_PERSONA.name} — current persona` })).toHaveAttribute("aria-current", "true");
  // The ACCOUNT FOOT replaced the Account-modal strip (#866 S4, owner-ruled F-3): the sheet renders the
  // identity facts + the mode-aware Log out inline — no modal handoff left to drive.
  await expect(page.getByTestId("account-surface")).toContainText("owner");
  await expect(page.getByTestId("account-logout")).toBeVisible();
  await expect(page.getByRole("button", { name: "Refinery" })).toBeVisible();
  // The sheet's own container is RENDERED (the close assertion below is then about a real disappearance).
  await expect(page.getByRole("dialog")).toBeVisible();

  // Tapping an overflow section switches the active section AND closes the sheet (setActiveSection +
  // closeModal), landing on that section's distinct placeholder copy.
  await page.getByRole("button", { name: "Analytics" }).click();
  // GONE, not merely restyled: the sheet container leaves the tree and its rows go with it.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Settings", exact: true })).toHaveCount(0);
  await expect(page.getByText("Charts over your corpus land here", { exact: false })).toBeVisible();
});

test("mobile: the You sheet's Settings row switches to the config SECTION and closes the sheet", async ({ mount, page }) => {
  await page.setViewportSize(MOBILE);
  // Stub the persona identity widget's sheet-lens reads so the projected sheet renders cleanly (§E-5).
  await routeTrpc(page, {
    ...SHELL_AMBIENT_ROUTES,
    "persona.list": () => [],
    "settings.getUserSettings": () => ({ userId: "user_ct_you_handoff", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 }),
  });
  const shell = await mount(<AppShellStory />);
  await shell.getByRole("button", { name: "You", exact: true }).click();
  // Settings is a rail-foot SECTION since #866 S1 (`config`, `rail.zone: "rail.end"`, `mobile: "sheet"`),
  // so its You-sheet row is a section row: tapping it switches the active section AND closes the sheet
  // (setActiveSection + closeModal), exactly like the overflow sections beside it — no modal, no handoff.
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // The shell-isolation registry injects no config LIST/CONTENT (its non-injected sections render their
  // placeholder), so the landing is read at the SHELL: the CONTENT landmark is the Settings section's and
  // the bar's Settings tab took the swapped slot (#484 — a `rail.end` section borrows one like any other).
  await expect(page.getByRole("main", { name: "Settings content" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "Settings" })).toHaveAttribute("aria-current", "page");
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
      ...SHELL_AMBIENT_ROUTES,
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
/** ONE human seat and no other — the BG-C gate (`isSingleHumanRoom`): with a second human on the roster
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
  displayName: "Nate",
  handle: null,
  avatarAssetId: null,
  avatarHash: null,
};
/** The room's own chat-SET background (the cascade's first arm). `asset` + a stored hash is the ONLY kind
 *  that resolves to a paintable URL at all since `kind:"seeded"` retired (2026-09-18); `image/*` keeps it
 *  off the video layer. */
const ROOM_BACKGROUND = {
  kind: "asset",
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

/** The persisted overrides AFTER the store's own first write has landed — the only honest "before" for a
 *  test whose claim is "this action wrote nothing".
 *
 *  MEASURED (#247 lane, 2026-08-19): with no interaction at all, `orb:shell` reads `null` immediately after
 *  mount and `{}` a beat later — zustand-persist writes on REHYDRATE, not on the action under test. A
 *  `before` captured off the raw mount therefore races that write, and three tests here were passing only
 *  because the CT harness happened to mount an extra `<Toaster />` subtree that slowed the commit enough
 *  for the write to win. That is a flake with a stopwatch in it, not a guarantee. */
async function settledPersistedOverrides(page: Page): Promise<unknown> {
  await expect.poll(() => shellPersistedOverrides(page)).not.toBeNull();
  return shellPersistedOverrides(page);
}

test("at 48-64rem the focus toggle is NOT pre-pressed by the auto-collapse, and its second click exits (the measured no-op)", async ({ mount, page }) => {
  await page.setViewportSize(NARROW_DESKTOP);
  const shell = await mount(<AppShellStory />);
  const listPanel = page.locator('.shell-panel[data-panel-side="list"]');
  const focusToggle = shell.getByRole("button", { name: FOCUS_TOGGLE_RE });
  const before = await settledPersistedOverrides(page);

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

/** The probe's curated appearance profile is the one source of truth for the Reading arm. Parsing the
 * patch through the production schema gives this CT the same fallback/default semantics as the app. */
const READING_APPEARANCE = appearanceSettingsSchema.parse({
  ...DEFAULT_USER_SETTINGS.appearance,
  ...APPEARANCE_PRESET_FILE.presets.reading.appearance,
});
const APPEARANCE_PROFILE_NAMES = ["defaults", "maximal", "compact", "reading", "diagnostics"] as const;

function appearanceForProfile(name: (typeof APPEARANCE_PROFILE_NAMES)[number]): typeof READING_APPEARANCE {
  return appearanceSettingsSchema.parse({
    ...DEFAULT_USER_SETTINGS.appearance,
    ...APPEARANCE_PRESET_FILE.presets[name].appearance,
  });
}

interface PrimacyViolation {
  readonly width: number;
  readonly mode: string | null;
  readonly deficit: number;
  readonly list: number;
  readonly content: number;
  readonly context: number;
}

async function readingPrimacyViolationAt(page: Page, width: number): Promise<PrimacyViolation | null> {
  await page.setViewportSize({ width, height: 900 });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  const deficit = await page.locator(".shell-content-primacy-sentinel").evaluate((element) => element.getBoundingClientRect().width);
  const contextPanel = page.locator('.shell-panel[data-panel-side="context"]');
  const expectedMode = deficit > 0 ? "collapsed" : "docked";
  // BARRIER ON THE SETTLED MODE, never a one-shot read after two rAFs. The sentinel is rendered CSS and
  // is correct the moment layout settles, but the mode is three hops downstream of it (ResizeObserver →
  // useSyncExternalStore publish → React commit) — an unbarriered `getAttribute` reads whatever that
  // chain happens to have reached, which is a stopwatch race that passes alone and flakes under load.
  // The poll is bounded and its failure is REPORTED, not thrown: this helper's whole value is the
  // contiguous failing interval it collects across a width sweep, which a hard assertion would truncate
  // at the first bad width.
  await expect
    .poll(() => contextPanel.getAttribute("data-panel-mode"), { intervals: [20, 50, 100], timeout: 750 })
    .toBe(expectedMode)
    .catch(() => undefined);
  const mode = await contextPanel.getAttribute("data-panel-mode");
  const [, list = 0, content = 0, context = 0] = await shellTracks(page);
  const primacyFails = mode === "docked" && content + 0.5 < (list + context) / 2;

  const contentTitle = page.locator(".shell-content").getByText("Presets", { exact: true }).first();
  const commandButton = page.getByRole("button", { name: "⌘K jump — the command menu" });
  await expect(contentTitle).toBeVisible();
  await expect.poll(() => contentTitle.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect.poll(() => commandButton.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  return mode !== expectedMode || primacyFails ? { width, mode, deficit, list, content, context } : null;
}

async function renderedPrimacyCrossover(page: Page): Promise<{ constrained: number; equality: number }> {
  const deficitAt = async (width: number): Promise<number> => {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
    return page.locator(".shell-content-primacy-sentinel").evaluate((element) => element.getBoundingClientRect().width);
  };
  const locate = async (lower: number, upper: number): Promise<{ constrained: number; equality: number }> => {
    if (upper - lower === 1) {
      return { constrained: lower, equality: upper };
    }
    const width = Math.floor((lower + upper) / 2);
    const deficit = await deficitAt(width);
    if (deficit > 0) {
      return locate(width, upper);
    }
    return locate(lower, width);
  };

  const constrained = 1025;
  const equality = 1800;
  expect(await deficitAt(constrained)).toBeGreaterThan(0);
  expect(await deficitAt(equality)).toBe(0);
  return locate(constrained, equality);
}

test("#375 Reading derives the context crossover from the resolved pane geometry", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...SHELL_AMBIENT_ROUTES,
    "settings.getUserSettings": () => ({
      userId: "user_ct_shell_reading_primacy",
      schemaVersion: 1,
      config: { ...DEFAULT_USER_SETTINGS, appearance: READING_APPEARANCE },
      updatedAt: 0,
    }),
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  const shell = await mount(<AppShellStory />);
  await expect.poll(() => page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize))).toBe(20);
  await shell.getByRole("button", { name: "Presets" }).click();

  const violations: PrimacyViolation[] = [];
  for (let width = 1278; width <= 1302; width += 1) {
    const violation = await readingPrimacyViolationAt(page, width);
    if (violation !== null) {
      violations.push(violation);
    }
  }

  expect(violations).toEqual([]);

  const crossover = await renderedPrimacyCrossover(page);
  await page.setViewportSize({ width: crossover.constrained, height: 900 });
  const jumpLabel = page.locator(".shell-topbar-jump-label");
  await expect(jumpLabel).toBeVisible();
  await expect.poll(() => jumpLabel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.setViewportSize({ width: crossover.equality, height: 900 });
  const topbarTitle = page.locator(".shell-topbar-title:visible");
  await expect(topbarTitle).toHaveText("Presets");
  await expect.poll(() => topbarTitle.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});

// ── #846 / #860: THE TOPBAR YIELDS THE ROOM'S IDENTITY TO THE DOCKED CONTEXT PANE ───────────────────────
//
// MEASURED on the live stack at 1280×800 with BOTH panes docked: the content column is 568px and the room
// title rendered 104px of its 220px natural width, showing "Example — …" — the prefix every seeded room
// shares — on the one row that names the room, in exactly the state where the user has opened the detail
// panel to configure the room they can no longer identify. The owner ruled the fix by RELOCATION (#860):
// the room's name lives in the context pane's HEAD BAND, so while that pane is DOCKED the topbar sheds its
// title + the members chip + the recall chip (their home is on screen 300px away — one identity, one home)
// and keeps the avatar cluster. A collapsed pane leaves the row as it was: chats default to a collapsed
// pane, and a nameless room is the injury #846 describes.
//
// The pins read the RENDERED result through user-visible affordances (`offsetParent` — the yield is
// `display: none`), so both arms compile and run against the pre-#860 source, where the first REDS: the
// title and both chips were visible (and the title truncated) at dock+dock.

/** The room this pin seats: a name long enough to have been crushed, and a four-seat roster so the member
 *  chip renders at its real width. */
const TOPBAR_IDENTITY_ROOM = {
  title: "Example — The Ashen Spire",
  temporary: false,
  viewerIsHost: true,
  participants: [
    { id: "participant_host", kind: "human", role: "host", userId: "user_host", characterId: null, displayName: "Nate", avatarHash: null, leftSeq: null },
    {
      id: "participant_aria",
      kind: "character",
      role: "member",
      userId: null,
      characterId: "character_aria",
      displayName: "Aria",
      avatarHash: null,
      leftSeq: null,
    },
    {
      id: "participant_bolt",
      kind: "character",
      role: "member",
      userId: null,
      characterId: "character_bolt",
      displayName: "Bolt",
      avatarHash: null,
      leftSeq: null,
    },
    {
      id: "participant_cass",
      kind: "character",
      role: "member",
      userId: null,
      characterId: "character_cass",
      displayName: "Cass",
      avatarHash: null,
      leftSeq: null,
    },
  ],
};

interface TopbarIdentityReadout {
  readonly title: boolean;
  readonly membersChip: boolean;
  readonly recallChip: boolean;
  readonly avatars: boolean;
  /** The notifications bell — NOT a subject, a PREMISE: the `snap --isolated` stage renders the trail
   *  WITHOUT it (183px vs live main's 225px), so a receipt taken there measures a row the production user
   *  does not have. This pin refuses to read a bell-less row. */
  readonly bell: boolean;
  /** `clientWidth - scrollWidth` on the visible title, `NaN` when it is not rendered. */
  readonly titleSlack: number;
}

/** Seat the notifications BELL in the trail by answering the capability it gates on at the network
 *  boundary (`/api/auth/config.multiHumanCapable` — the honest source, the `chats-section.ct.tsx` idiom). */
async function seatNotificationBell(page: Page): Promise<void> {
  await page.route("**/api/auth/config", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        mode: "single",
        requiresLogin: false,
        localEnabled: false,
        oidcEnabled: false,
        discreetLogin: false,
        defaultHandle: null,
        multiHumanCapable: true,
      }),
    }),
  );
}

/** Drive the context pane to `mode`, settle, and read the identity row in ONE in-page pass. Rendered
 *  visibility is `offsetParent !== null` — the yield is `display: none`, which is exactly what that answers,
 *  and it does not care that the identity arm is `display: contents`. `expectTitleShed` names what the
 *  shed selector (`shell.css`'s `:has([data-slot="context-bracket-band"] :is(h1,h2,h3))`) is about to do —
 *  the caller already knows this from `mode` + the band it mounted, and stating it here turns it into a
 *  BARRIER instead of a hope. */
async function settledTopbarIdentity(page: Page, shell: Locator, mode: "docked" | "collapsed", expectTitleShed: boolean): Promise<TopbarIdentityReadout> {
  const contextPanel = page.locator('.shell-panel[data-panel-side="context"]');
  const current = await contextPanel.getAttribute("data-panel-mode");
  if (current !== mode) {
    await shell.getByRole("button", { name: mode === "docked" ? "Show details" : "Hide details" }).click();
  }
  await expect(contextPanel).toHaveAttribute("data-panel-mode", mode);
  await expect(page.locator('.shell-panel[data-panel-side="list"]')).toHaveAttribute("data-panel-mode", "docked");
  await expect(page.locator(".shell-grid")).toHaveAttribute("data-context-mode", mode);
  // BARRIER ON THE RESOLVED IDENTITY — the header renders a title-width skeleton (`aria-busy`) until the
  // room's `getChat` lands; a row read before that measures the shape of an identity, not one.
  await expect(page.locator('.shell-topbar-identity[data-identity="wide"] [aria-busy="true"]')).toHaveCount(0);
  await expect(page.locator('.shell-topbar-identity[data-identity="wide"] [data-slot="avatar-stack-root"]')).toHaveCount(1);
  // BARRIER ON THE DOCKED BAND OWNING THE TITLE (#1686) — the mode/context-mode attributes above are DOM
  // writes the assertions above already retried to settlement, but the `:has()` shed rule's effect on
  // `offsetParent` is a SEPARATE style/layout recalculation Chromium can perform on a later frame under
  // contention. The old code went straight from those attribute reads into a ONE-SHOT `page.evaluate()`
  // snapshot with no retry of its own — exactly the one-shot-cannot-certify-a-later-surface shape. A
  // web-first `toBeHidden()`/`toBeVisible()` on the title RETRIES until the shed rule has actually painted,
  // so the snapshot below always reads a settled row.
  const wideTitle = page.locator('.shell-topbar-identity[data-identity="wide"] .shell-topbar-title');
  await expect(wideTitle)[expectTitleShed ? "toBeHidden" : "toBeVisible"]();
  return page.evaluate(() => {
    const shown = (element: Element | null): boolean => element !== null && (element as HTMLElement).offsetParent !== null;
    const title = document.querySelector<HTMLElement>('.shell-topbar-identity[data-identity="wide"] .shell-topbar-title');
    return {
      title: shown(title),
      membersChip: shown(document.querySelector('[aria-label^="Members — "]')),
      recallChip: shown(document.querySelector('[aria-label^="Memory — "]')),
      avatars: shown(
        document.querySelector(
          '.shell-topbar-identity[data-identity="wide"] [data-slot="avatar-stack-root"], .shell-topbar-identity[data-identity="wide"] [data-slot="avatar-root"]',
        ),
      ),
      bell: shown(document.querySelector('[aria-label="Notifications"]')),
      titleSlack: title === null || !shown(title) ? Number.NaN : title.clientWidth - title.scrollWidth,
    };
  });
}

test("#846: at 1280 with BOTH panes docked the topbar yields the room's name + chips to the context band — the avatars stay", async ({ mount, page }) => {
  // The bell brings its own inbox read into the tree — FED ambiently by `SHELL_AMBIENT_ROUTES`, not declared.
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "chat.getChat": () => TOPBAR_IDENTITY_ROOM });
  await seatNotificationBell(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  // WITH THE BAND: the shed's condition is that the band NAMES the room (`shell.css` keys on it with
  // `:has()`), so a story whose context pane has no band would assert the yield in a state production
  // never has — which is exactly what this pin did until #896 put the condition in the selector.
  const shell = await mount(<AppShellChatTopbarIdentityStory withBand={true} />);

  const readout = await settledTopbarIdentity(page, shell, "docked", true);
  // The premise: the row carries the SAME trailing furniture a real account has.
  expect(readout.bell).toBe(true);
  // THE DEFECT PIN: nothing of the identity that the band now carries is on this row — no crushed title.
  expect(readout).toMatchObject({ title: false, membersChip: false, recallChip: false, avatars: true });
});

test("#846: with the context pane COLLAPSED the topbar names the room WHOLE, chips and all — the yield buys room, it does not keep it", async ({
  mount,
  page,
}) => {
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "chat.getChat": () => TOPBAR_IDENTITY_ROOM });
  await seatNotificationBell(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  const shell = await mount(<AppShellChatTopbarIdentityStory />);

  const readout = await settledTopbarIdentity(page, shell, "collapsed", false);
  expect(readout.bell).toBe(true);
  expect(readout).toMatchObject({ title: true, membersChip: true, recallChip: true, avatars: true });
  await expect(page.locator(".shell-topbar-title:visible")).toHaveText(TOPBAR_IDENTITY_ROOM.title);
  // …and WHOLE: with the pane closed the column has the room, so no "Example — …".
  expect(readout.titleSlack).toBeGreaterThanOrEqual(0);
});

// ── #896: THE YIELD REACHES EVERY IDENTITY VARIANT ────────────────────────────────────────────────────
// The post-fix drive REFUTED F4 at the phone: widening the rule from `docked` to `docked|overlay` fixed the
// desktop overlay widths and left `[data-identity="wide"]` in the selector, which the 430 shell's `narrow`
// identity mount cannot match — so the room's name still printed TWICE there (topbar y=13 + the band's
// `h2` at y=65) while 1024 and 768 printed once. One product rule, two behaviours, split by a viewport.
//
// WHY THIS COUNTS TOPBAR TITLES RATHER THAN ON-SCREEN NAME INSTANCES: this story mounts the shell with a
// stubbed room and no chats-section context definition, so the BAND's `h2` never renders here — a
// name-instance count would answer 0 in both arms and prove nothing. The band's own half is pinned where
// the band actually mounts (`chats-section.ct.tsx`, the #860 band-title pin). What is provable HERE, and
// what the refutation was actually about, is the rule I changed: at EVERY identity variant, an open pane
// yields the title, and a closed one keeps it. The existing #846 pins are blind to this by construction —
// they read the `wide` mount's own visibility and cannot see a second mount printing the same string.
const TOPBAR_YIELD_ARMS = [
  { width: 1280, height: 800, identity: "wide" },
  { width: 430, height: 740, identity: "narrow" },
] as const;

/** Drive the context pane to open/closed by READING its resolved mode, never by assuming which label the
 *  toggle currently carries (the story opens collapsed) or which mode "open" resolves to (docked at 1280,
 *  overlay at 430 — the very split this pin exists for). */
async function setContextPane(page: Page, shell: Locator, want: "open" | "collapsed"): Promise<void> {
  const grid = page.locator(".shell-grid");
  const collapsed = (await grid.getAttribute("data-context-mode")) === "collapsed";
  if (collapsed !== (want === "collapsed")) {
    await shell.getByRole("button", { name: collapsed ? "Show details" : "Hide details" }).click();
  }
  // ONE assertion for both directions — a branch here is a conditional `expect`, and the thing being
  // asserted is the same fact either way: the pane's collapsed-ness is what was asked for.
  await expect.poll(async () => (await grid.getAttribute("data-context-mode")) === "collapsed").toBe(want === "collapsed");
}

/** Every VISIBLE topbar title mount, at any identity — the count the wide-only readout could not take. */
function visibleTopbarTitles(page: Page): Promise<number> {
  return page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".shell-topbar-title")].filter((el) => el.checkVisibility()).length);
}

for (const arm of TOPBAR_YIELD_ARMS) {
  test(`#896 @${String(arm.width)} (${arm.identity} identity): an OPEN context pane yields the topbar title, a CLOSED one keeps it`, async ({
    mount,
    page,
  }) => {
    await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "chat.getChat": () => TOPBAR_IDENTITY_ROOM });
    await seatNotificationBell(page);
    await page.setViewportSize({ width: arm.width, height: arm.height });
    const shell = await mount(<AppShellChatTopbarIdentityStory withBand={true} />);

    // THE PREMISE, asserted before anything is trusted: this width really does mount the identity variant
    // the arm names. A green on an arm whose identity never mounted would prove nothing about the mount
    // the refutation was about — which is exactly how the first fix passed its own review.
    await expect(page.locator(`.shell-topbar-identity[data-identity="${arm.identity}"]`)).toHaveCount(1);

    // CLOSED: the row names the room. The pane is driven by READING its mode and clicking only when it
    // must change — the story opens collapsed, and `resolvePanelMode` answers `docked` at 1280 but
    // `overlay` at 430, so neither the starting state nor the open state may be assumed.
    await setContextPane(page, shell, "collapsed");
    await expect.poll(() => visibleTopbarTitles(page)).toBe(1);

    // OPEN: the band is on screen, so the row yields — at BOTH identities, which is the whole finding.
    await setContextPane(page, shell, "open");
    await expect.poll(() => visibleTopbarTitles(page)).toBe(0);
  });
}

test("#375 the context regime follows rendered shell geometry and releases its observer", async ({ mount, page }) => {
  await page.evaluate(() => {
    document.documentElement.dataset["primacyObserveCount"] = "0";
    document.documentElement.dataset["primacyDisconnectCount"] = "0";
    const primacyObservers = new WeakSet<ResizeObserver>();
    const nativeObserve = ResizeObserver.prototype.observe;
    const nativeDisconnect = ResizeObserver.prototype.disconnect;
    ResizeObserver.prototype.observe = function observe(target: Element, options?: ResizeObserverOptions): void {
      if (target.classList.contains("shell-content-primacy-sentinel")) {
        primacyObservers.add(this);
        document.documentElement.dataset["primacyObserveCount"] = String(Number(document.documentElement.dataset["primacyObserveCount"] ?? "0") + 1);
      }
      nativeObserve.call(this, target, options);
    };
    ResizeObserver.prototype.disconnect = function disconnect(): void {
      if (primacyObservers.has(this)) {
        document.documentElement.dataset["primacyDisconnectCount"] = String(Number(document.documentElement.dataset["primacyDisconnectCount"] ?? "0") + 1);
      }
      nativeDisconnect.call(this);
    };
  });
  await page.setViewportSize({ width: 1400, height: 900 });
  const component = await mount(<AppShellStory />);
  await component.getByRole("button", { name: "Presets" }).click();
  const contextPanel = page.locator('.shell-panel[data-panel-side="context"]');
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "docked");

  // Change the geometry CSS actually renders, independently of the appearance response. A media query
  // synthesized from the response cannot see either change; the shell's rendered signal must.
  await page.locator(".shell-grid").evaluate((element) => {
    element.setAttribute("style", `${element.getAttribute("style") ?? ""}; --dimension-panel-floor: 35rem; --dimension-panel-context-step: 35rem`);
  });
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "collapsed");
  await page.locator(".shell-grid").evaluate((element) => {
    element.style.removeProperty("--dimension-panel-floor");
    element.style.removeProperty("--dimension-panel-context-step");
  });
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "docked");

  await page.evaluate(() => {
    document.documentElement.style.fontSize = "150%";
  });
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "collapsed");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "100%";
  });
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "docked");
  await expect(page.locator("html")).toHaveAttribute("data-primacy-observe-count", "1");

  await page.locator(".shell-content-primacy-sentinel").evaluate((element) => {
    const renderedBox = element.getBoundingClientRect.bind(element);
    document.documentElement.dataset["primacyFontReadyReads"] = "0";
    element.getBoundingClientRect = (): DOMRect => {
      document.documentElement.dataset["primacyFontReadyReads"] = String(Number(document.documentElement.dataset["primacyFontReadyReads"] ?? "0") + 1);
      return renderedBox();
    };
  });
  await page.evaluate(() => {
    document.fonts.dispatchEvent(new Event("loadingdone"));
  });
  await expect(page.locator("html")).toHaveAttribute("data-primacy-font-ready-reads", "1");

  await component.unmount();
  await expect(page.locator("html")).toHaveAttribute("data-primacy-disconnect-count", "1");
  await page.evaluate(() => {
    document.fonts.dispatchEvent(new Event("loadingdone"));
  });
  await expect(page.locator("html")).toHaveAttribute("data-primacy-font-ready-reads", "1");
});

for (const profileName of APPEARANCE_PROFILE_NAMES) {
  test(`#375 ${profileName}: both sides of the rendered crossover preserve pane, keyboard, and focus behavior`, async ({ mount, page }) => {
    const appearance = appearanceForProfile(profileName);
    await routeTrpc(page, {
      ...SHELL_AMBIENT_ROUTES,
      "settings.getUserSettings": () => ({
        userId: `user_ct_shell_primacy_${profileName}`,
        schemaVersion: 1,
        config: { ...DEFAULT_USER_SETTINGS, appearance },
        updatedAt: 0,
      }),
    });
    await page.setViewportSize({ width: 1400, height: 900 });
    const shell = await mount(<AppShellStory />);
    await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue("--font-scale"))).not.toBe("");
    await shell.getByRole("button", { name: "Presets" }).click();
    const crossover = await renderedPrimacyCrossover(page);
    await page.setViewportSize({ width: crossover.constrained, height: 900 });

    const listPanel = page.locator('.shell-panel[data-panel-side="list"]');
    const contextPanel = page.locator('.shell-panel[data-panel-side="context"]');
    const contextToggle = shell.getByRole("button", { name: "Show details" });
    const focusToggle = shell.getByRole("button", { name: FOCUS_TOGGLE_RE });
    await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");
    await expect(contextPanel).toHaveAttribute("data-panel-mode", "collapsed");

    // The constrained CONTEXT is still a real first-click sheet; Escape remains its keyboard-equivalent
    // dismiss path rather than persisting a dock that the current geometry cannot honour.
    await contextToggle.click();
    await expect(contextPanel).toHaveAttribute("data-panel-mode", "overlay");
    await page.keyboard.press("Escape");
    await expect(contextPanel).toHaveAttribute("data-panel-mode", "collapsed");

    // Focus is still the one explicit flag: enter hides LIST, exit restores the registry/default layout
    // for this constrained regime without promoting CONTEXT to a persisted dock.
    await focusToggle.focus();
    await page.keyboard.press("Enter");
    await expect(listPanel).toHaveAttribute("data-panel-mode", "collapsed");
    await expect(contextPanel).toHaveAttribute("data-panel-mode", "collapsed");
    await page.keyboard.press("Enter");
    await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");
    await expect(contextPanel).toHaveAttribute("data-panel-mode", "collapsed");

    await page.setViewportSize({ width: crossover.equality, height: 900 });
    await expect(contextPanel).toHaveAttribute("data-panel-mode", "docked");
    const [, list = 0, content = 0, context = 0] = await shellTracks(page);
    expect(content + 0.5).toBeGreaterThanOrEqual((list + context) / 2);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}

// #375's SECTION-SHAPE GAP: every crossover test above drives PRESETS, whose CONTEXT pane defaults DOCKED
// (the O-19 ruling). FIVE of the eight sections are the other shape — list docked, context COLLAPSED
// (chats, characters, config, corpus, databank) — and they meet the same rendered crossover differently:
// the pane is CLOSED on both sides of it, so what moves is what the toggle PRODUCES. Constrained, the
// click is a transient sheet the geometry can honour; past the crossover the same click is the persisted
// dock, and it must not violate the primacy the crossover is defined by. A suite that only ever drove the
// docked-default shape pinned the auto-dock and left the other 5/8 of the app unpinned.
test("#375 a context-default-COLLAPSED section meets the crossover with a different toggle result", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  const shell = await mount(<AppShellStory />);
  const listPanel = page.locator('.shell-panel[data-panel-side="list"]');
  const contextPanel = page.locator('.shell-panel[data-panel-side="context"]');
  const contextToggle = shell.getByRole("button", { name: CONTEXT_TOGGLE_RE });
  const crossover = await renderedPrimacyCrossover(page);

  // CONSTRAINED side: chats' own defaults — the list docked beside a closed detail pane — and the toggle
  // opens the transient sheet, dismissible from the keyboard.
  await page.setViewportSize({ width: crossover.constrained, height: 900 });
  await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "collapsed");
  await contextToggle.click();
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "overlay");
  await page.keyboard.press("Escape");
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "collapsed");

  // EQUALITY side: nothing auto-docks (that is the docked-default section's arm, not this one) — the pane
  // the user closed stays closed, and NOW the toggle earns a real dock.
  await page.setViewportSize({ width: crossover.equality, height: 900 });
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "collapsed");
  await contextToggle.click();
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "docked");
  const [, list = 0, content = 0, context = 0] = await shellTracks(page);
  expect(content + 0.5).toBeGreaterThanOrEqual((list + context) / 2);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
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

// ── #383: A LIST TOGGLE MUST NOT ORPHAN AN OPEN CONTEXT SHEET ────────────────────────────────────────
// Hand-traced by side-eye 2026-08-21 and confirmed on this tree. At a content-constrained desktop the
// CONTEXT pane is an AUTO-OVERLAY, and its open/closed truth lives in `openOverlayPanel`; docked-wide
// CONTEXT reads the OTHER channel (the persisted `panelOverrides`). The regime itself is gated on the
// LIST's persisted override (`useShellLayout`'s `contextAutoOverlay`), so hiding the list MOVED CONTEXT
// between the two channels: the open sheet and its scrim collapsed with no user act, the now-meaningless
// request survived, and re-showing the list resurrected the sheet unbidden. It affects the five sections
// shaped list-docked + context-collapsed (chats, characters, config, corpus, databank).
//
// The pin is the trace itself — open the sheet, hide the list, show it again — asserted in BOTH width
// regimes, because a fix that merely CLEARED the orphaned request would still vanish the sheet, and one
// that dropped the LIST from the regime gate would change the unconstrained arm. A single width would
// prove neither: the constrained arm is where the defect lives, the unconstrained arm is what must not
// move.

/** Force the CONTENT-primacy deficit that puts CONTEXT in its auto-overlay regime, WITHOUT touching a
 *  viewport breakpoint or the appearance response: constrain the CSS-owned prospective tracks and wait
 *  for the shell's own sentinel to render the deficit the observer publishes. Returns once the rendered
 *  geometry says "constrained" — the settled state, never a bare rAF pair. */
async function forceConstrainedGeometry(page: Page): Promise<void> {
  await page.locator(".shell-grid").evaluate((element) => {
    element.style.setProperty("--dimension-panel-floor", "35rem");
    element.style.setProperty("--dimension-panel-context-step", "35rem");
  });
  await expect.poll(() => page.locator(".shell-content-primacy-sentinel").evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(0);
}

test("#383 an OPEN context sheet survives hiding and re-showing the LIST (the constrained regime)", async ({ mount, page }) => {
  await page.setViewportSize(WIDE);
  const shell = await mount(<AppShellStory />);
  const listPanel = page.locator('.shell-panel[data-panel-side="list"]');
  const contextPanel = page.locator('.shell-panel[data-panel-side="context"]');
  const listToggle = shell.getByRole("button", { name: LIST_TOGGLE_RE });
  await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");
  await forceConstrainedGeometry(page);

  // The user opens the detail pane: at CONTENT's floor it is a slide-over with a scrim behind it.
  await shell.getByRole("button", { name: CONTEXT_TOGGLE_RE }).click();
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "overlay");
  await expect(page.locator(".shell-scrim")).toHaveAttribute("data-visible", "true");

  // HIDE THE LIST. Nothing about that act was addressed to CONTEXT, so CONTEXT must still be on screen.
  // Its PRESENTATION changes — the freed width is exactly what the auto-overlay existed to protect, so it
  // lands as a dock — but it does not disappear. (Pre-fix: "collapsed", the silent vanish.)
  await listToggle.click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "collapsed");
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "docked");
  await expect(contextPanel).toContainText("chats context pane");

  // SHOW IT AGAIN. Both panes are back in the both-docked regime, so CONTEXT is a sheet again — still the
  // one the user opened, never re-opened for them. Continuous, in both directions.
  await listToggle.click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "overlay");
});

test("#383 a CLOSED context sheet is not resurrected by a LIST toggle (the other half of the orphan)", async ({ mount, page }) => {
  await page.setViewportSize(WIDE);
  const shell = await mount(<AppShellStory />);
  const listPanel = page.locator('.shell-panel[data-panel-side="list"]');
  const contextPanel = page.locator('.shell-panel[data-panel-side="context"]');
  const contextToggle = shell.getByRole("button", { name: CONTEXT_TOGGLE_RE });
  const listToggle = shell.getByRole("button", { name: LIST_TOGGLE_RE });
  await forceConstrainedGeometry(page);

  // Open it, then close it — the user's own dismissal.
  await contextToggle.click();
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "overlay");
  await contextToggle.click();
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "collapsed");

  // A pane the user closed stays closed across the same round-trip that carries an OPEN one.
  await listToggle.click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "collapsed");
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "collapsed");
  await listToggle.click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "collapsed");
});

test("#383 UNCONSTRAINED, the same three clicks stay a plain wide dock (the arm that must not move)", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1800, height: 900 });
  const shell = await mount(<AppShellStory />);
  const listPanel = page.locator('.shell-panel[data-panel-side="list"]');
  const contextPanel = page.locator('.shell-panel[data-panel-side="context"]');
  const listToggle = shell.getByRole("button", { name: LIST_TOGGLE_RE });
  // The control's premise, measured rather than assumed: at this width the shell renders NO primacy
  // deficit, so there is no auto-overlay regime for a list toggle to move CONTEXT in or out of.
  await expect.poll(() => page.locator(".shell-content-primacy-sentinel").evaluate((element) => element.getBoundingClientRect().width)).toBe(0);

  await shell.getByRole("button", { name: CONTEXT_TOGGLE_RE }).click();
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "docked");
  await listToggle.click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "collapsed");
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "docked");
  await listToggle.click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "docked");
  // …and no slide-over was invented on the way: nothing floats, so nothing is scrimmed.
  await expect(page.locator(".shell-scrim")).toHaveAttribute("data-visible", "false");
});

// ── #391: THE CARRY IS A PROPERTY OF THE FLIP, NOT OF THE TOGGLE THAT CAUSED IT ──────────────────────
// #383 fixed the orphan at `useShellLayout`'s two seams (togglePanel / collapsePanel). A FEATURE docking the
// LIST does the SAME flip through a different door — it cannot reach the hook, so it used to write
// `setPanelMode("list","docked")` straight past it and the identical orphan survived on a narrower trigger.
// `dockListPanel` is the door that pays the carry, and this pin drives it against the REAL frame: anything
// that docks the LIST owes CONTEXT the carry, whoever fired it. (Its original trigger was the character
// hero's "N chats ›" intent; #501 re-pointed that at the CONTEXT Chats tab, so the story fires the door
// itself — the invariant is the door's, never that one caller's.)
test("#391 an out-of-shell list dock carries CONTEXT across the flip it causes", async ({ mount, page }) => {
  await page.setViewportSize(WIDE);
  const shell = await mount(<AppShellChatsProjectionIntentStory />);
  const listPanel = page.locator('.shell-panel[data-panel-side="list"]');
  const contextPanel = page.locator('.shell-panel[data-panel-side="context"]');
  const listToggle = shell.getByRole("button", { name: LIST_TOGGLE_RE });
  await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");
  await forceConstrainedGeometry(page);

  // Collapse the LIST first — that leaves the auto-overlay regime, so the detail pane the user opens next
  // is a plain wide DOCK whose truth lives in `panelOverrides` (the channel the flip is about to leave).
  await listToggle.click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "collapsed");
  await shell.getByRole("button", { name: CONTEXT_TOGGLE_RE }).click();
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "docked");
  await expect(contextPanel).toContainText("characters context pane");

  // FIRE THE FEATURE-SIDE DOCK. It docks the LIST, which re-enters the auto-overlay regime — and CONTEXT, which
  // the user never touched, must still be on screen (as the sheet that regime paints). Pre-fix: "collapsed",
  // the same silent vanish #383 retired at the topbar.
  await shell.getByTestId("reveal-chats-projection").click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "overlay");
  await expect(contextPanel).toContainText("characters context pane");
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
  const before = await settledPersistedOverrides(page);

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
    ...SHELL_AMBIENT_ROUTES,
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
  const before = await settledPersistedOverrides(page);

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
  const before = await settledPersistedOverrides(page);

  await shell.getByRole("button", { name: "Show details" }).click();
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "overlay");
  await expect(scrim).toHaveAttribute("data-visible", "true");

  // …and it closes again on the next click, still ephemeral — a narrow-width toggle never rewrites the
  // user's WIDE dock preference.
  await shell.getByRole("button", { name: "Hide details" }).click();
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
  const before = await settledPersistedOverrides(page);

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
  const before = await settledPersistedOverrides(page);

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
  await shell.getByRole("button", { name: "open new chat" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  // The list panel was never in overlay mode to begin with, and stays that way — proves Escape here had
  // no effect on shell panel state at all (the modal owned it end to end).
  await expect(listPanel).not.toHaveAttribute("data-panel-mode", "overlay");
});

// ── Co-motion parity: the shell push + panel slide animate as ONE event (never-desync) ────────────
// the retired BASEUI-MOTION-AUDIT review §5 Layer 2 — the rendered-output guard the corpus desync needed. The track
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
// `.shell-main` (shell.css "THE PANEL PUSH IS A FLIP" + use-shell-track-flip.ts): prototyped on the live
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

  // THE FLIP ATTRIBUTE IS TRANSIENT SINCE #2456 — the hook releases it on `animationend` — so asserting
  // it is a RACE against the 220ms window, not a state read. What this test is about is a CSS FACT that
  // holds for exactly as long as the rule matches, so it waits the real motion out and PLANTS the
  // attribute to read the contract. `out` is the direction the collapse above actually produced, so the
  // planted state is the one the shell itself reaches (see the #1646 arms below for why a plant that
  // contradicts the current mode reads a different layout's number).
  await waitForShellFlipToSettle(page);
  await grid.evaluate((el) => el.setAttribute("data-list-flip", "out"));
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
  await grid.evaluate((el) => el.removeAttribute("data-list-flip"));
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
    // @orb-waive no-test-fabrication(unknown): a browser-context probe slot, written and read in this test alone. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
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
  // BARRIER ON THE FLIP'S OWN CLOCK, never a wall-clock guess (#1686). The old barrier was a fixed
  // [100,200,300,400]ms poll (1s total) past the nominal 220ms motion — under multi-lane load the box's
  // real frame timing stretches past that budget, so a layout-shift entry from a still-finishing FLIP or
  // co-motion transition can land AFTER the read. Wait for every animation the toggle actually started
  // (`.shell-main`'s FLIP animation + the list panel's own transform transition — both are `Animation`
  // objects) to reach `finished` before reading the counter; an already-finished animation resolves its
  // `finished` promise immediately, so this never blocks a fast run.
  await waitForShellFlipToSettle(page);
  await shell.getByRole("button", { name: "Show list panel" }).click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");
  await waitForShellFlipToSettle(page);

  const readTotal = (): Promise<number> =>
    // @orb-waive no-test-fabrication(unknown): reads back the probe slot installed above. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    page.evaluate(() => (globalThis as unknown as { __shiftTotal: number }).__shiftTotal);
  // A short poll remains for the observer's OWN dispatch latency (PerformanceObserver callbacks fire on a
  // microtask after the frame that produced the entry, not synchronously with `finished`), never for the
  // motion itself.
  await expect.poll(readTotal, { intervals: [50, 100, 150] }).toBeLessThan(0.1);
});

/** Wait for every `Animation` object currently on the shell's motion-bearing nodes (the FLIP on
 *  `.shell-main`, the co-motion transform transition on the list panel) to reach `playState: "finished"`.
 *  Read AFTER the triggering attribute assertion already resolved (§#1686) — the attribute and the
 *  animation start in the SAME commit (`useListTrackFlip`'s `useLayoutEffect`), so by then the `Animation`
 *  objects already exist; grabbing them here (rather than re-polling `getAnimations().length`) avoids the
 *  vacuous-true race of asking "is anything animating" before the animation has been created. */
async function waitForShellFlipToSettle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const nodes = [document.querySelector<HTMLElement>(".shell-main"), document.querySelector<HTMLElement>('.shell-panel[data-panel-side="list"]')].filter(
      (node): node is HTMLElement => node !== null,
    );
    await Promise.all(nodes.flatMap((node) => node.getAnimations().map((animation) => animation.finished.catch(() => undefined))));
  });
}

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
  // The attribute arm below is now an ABSENCE over a transient attribute (#2456), which a release could
  // fake. This records every animation that starts, so "no FLIP was armed" is proved by the event too.
  await recordShellFlipStarts(page);

  const startX = await main.evaluate((el) => Math.round(el.getBoundingClientRect().x));
  // A bounded per-frame sampler — rAF, not a screenshot loop: the jolt is two frames wide, so anything
  // slower than the frame clock samples past it. Bounded so it cannot outlive the test.
  await page.evaluate(() => {
    // @orb-waive no-test-fabrication(unknown): a browser-context probe slot, written and read in this test alone. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
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
  expect(await readShellFlipStarts(page), "no shell FLIP animation may START with motion off").toEqual([]);
  // Read ONCE (never poll a shared array — a poll drains the very samples it is judging).
  // @orb-waive no-test-fabrication(unknown): reads back the probe slot installed above. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
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
//
// IT RECORDS THE ANIMATION, NOT THE ATTRIBUTE (#2456). The attribute is transient now — released on
// `animationend` — so `toHaveAttribute` is a poll against a 220ms window and would go red under load on a
// perfectly correct shell. An `animationstart` listener installed BEFORE the swap cannot miss it and is
// the honest subject anyway: what must still happen is that the FLIP RUNS.
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
  await recordShellFlipStarts(page);

  await shell.getByRole("button", { name: "Home" }).click();
  await expect(listPanel).not.toHaveAttribute("data-panel-mode", "docked");
  await expect.poll(() => readShellFlipStarts(page)).toContain("shell-main-flip");
});

/** Record every `animation-name` that STARTS anywhere in the shell from now on. The flip attributes are
 *  transient (#2456), so "did the FLIP run" is an event question, not an attribute question — and an
 *  `animationstart` listener installed before the trigger cannot race the window the way a poll can. */
function recordShellFlipStarts(page: Page): Promise<void> {
  return page.evaluate(() => {
    // @orb-waive no-test-fabrication(unknown): a browser-context probe slot, written and read in this file alone. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const bag = globalThis as unknown as { __flipStarts: string[] };
    bag.__flipStarts = [];
    document.addEventListener("animationstart", (event) => {
      bag.__flipStarts.push((event as AnimationEvent).animationName);
    });
  });
}

/** Read the recorder ONCE per poll — it is append-only, so re-reading is safe (unlike a drained ring). */
function readShellFlipStarts(page: Page): Promise<string[]> {
  // @orb-waive no-test-fabrication(unknown): reads back the probe slot installed above. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  return page.evaluate(() => (globalThis as unknown as { __flipStarts: string[] }).__flipStarts);
}

// ── #1316: the FLIP cancels ONE edge, and `.shell-main` has two ─────────────────────────────────────
// `.shell-main` does not TRANSLATE across a list toggle, it RESIZES: the start edge travels the whole
// `--list-track-docked`, the end edge does not move. So the single counter-translate above is only the
// right distance for START-aligned content, and for a child pinned to the END edge it does not cancel
// motion — it manufactures it. MEASURED on the isolated stage at 1280x800 (2026-09-05, per-rAF
// `getBoundingClientRect` across `Hide list panel` on a seeded chat, track 307px): `.shell-main` x held
// at 363 (the FLIP working) while `.shell-topbar-trail` x ran 1043 → 1350 → 1227 → 1151 → … → 1043, i.e.
// the ⌘K chip and the toggle cluster left the 1280px viewport for the first painted frame and swept back
// in over ~150ms to the pixel they started on.
//
// THIS IS THE DEFECT PROOF, NOT A FENCE: against the unmodified shell.css the corridor arm below reports
// strays a full track wide. Its premise arm — the trail's rendered start and end x are the SAME — is what
// makes the corridor a POINT; without it a trail that legitimately moved would make any excursion legal.
test("#1316 the END-pinned topbar trail never leaves its corridor while the FLIP pushes .shell-main", async ({ mount, page }) => {
  await page.setViewportSize(WIDE);
  await emulateMediaFeatures(page, [
    ["prefers-reduced-motion", "no-preference"],
    ["prefers-reduced-transparency", "no-preference"],
    ["prefers-contrast", "no-preference"],
  ]);
  const shell = await mount(<AppShellStory />);
  const listPanel = page.locator('.shell-panel[data-panel-side="list"]');
  const main = page.locator(".shell-main");
  const trail = page.locator(".shell-topbar-trail");
  await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");

  const readX = (locator: Locator): Promise<number> => locator.evaluate((el) => Math.round(el.getBoundingClientRect().x));
  // BARRIER ON THE SETTLED DOCK, not on the attribute (measured: the mode attribute lands while the mount's
  // OWN `in` FLIP is still running — the shell resolves `collapsed` before the viewport-regime effect
  // publishes `wide` — so an immediate read samples that animation and every endpoint below is wrong). Two
  // conditions, in ONE evaluate so they cannot be read a frame apart: nothing is animating, AND the rendered
  // fact the corridor needs holds — `.shell-main`'s start edge sits exactly on the docked panel's end edge.
  // A token-free geometric identity, so no literal track width is baked in here.
  await page.waitForFunction(() => {
    const mainEl = document.querySelector(".shell-main");
    const panelEl = document.querySelector('.shell-panel[data-panel-side="list"]');
    if (mainEl === null || panelEl === null) {
      return false;
    }
    const running = [...mainEl.getAnimations(), ...panelEl.getAnimations()].some((a) => a.playState === "running");
    return !running && Math.round(mainEl.getBoundingClientRect().x) === Math.round(panelEl.getBoundingClientRect().right);
  });
  const startMainX = await readX(main);
  const startTrailX = await readX(trail);

  // A bounded per-frame sampler over BOTH boxes — the excursion is ~150ms wide and a poll would sample
  // past its start. Installed before the click so the very first flipped frame is in the ring.
  await page.evaluate(() => {
    // @orb-waive no-test-fabrication(unknown): a browser-context probe slot, written and read in this test alone. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const bag = globalThis as unknown as { __flipXs: { main: number; trail: number }[] };
    bag.__flipXs = [];
    const mainEl = document.querySelector(".shell-main");
    const trailEl = document.querySelector(".shell-topbar-trail");
    const tick = (): void => {
      if (mainEl === null || trailEl === null || bag.__flipXs.length > 60) {
        return;
      }
      bag.__flipXs.push({
        main: Math.round(mainEl.getBoundingClientRect().x),
        trail: Math.round(trailEl.getBoundingClientRect().x),
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  await shell.getByRole("button", { name: "Hide list panel" }).click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "collapsed");
  // BARRIER ON THE SETTLED RENDER (never on the attribute): the mode lands a frame or more before the grid
  // is re-laid out at the new track, and the animation runs for `--shell-motion` after that.
  await expect.poll(() => readX(main), { intervals: [50, 100, 200, 300] }).not.toBe(startMainX);
  // …and past the motion itself, so the "end" positions below are resting positions rather than a sample
  // taken mid-animation (which would make the corridor's own endpoints wrong).
  await page.waitForFunction(() => !(document.querySelector(".shell-main")?.getAnimations() ?? []).some((a) => a.playState === "running"));
  const endMainX = await readX(main);
  const endTrailX = await readX(trail);

  // Read ONCE — a poll over a shared ring drains the samples it is judging.
  // @orb-waive no-test-fabrication(unknown): reads back the probe slot installed above. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  const samples = await page.evaluate(() => (globalThis as unknown as { __flipXs: { main: number; trail: number }[] }).__flipXs);
  expect(samples.length, "the rAF sampler must have run — an empty ring proves nothing").toBeGreaterThan(2);
  // The FLIP really happened (a no-op toggle would pass every arm below vacuously). The ring rides the
  // message because a vacuous pass and a mis-seated story look identical from the endpoints alone.
  const ring = samples.map((s) => `${s.main}/${s.trail}`).join(" ");
  expect(Math.abs(endMainX - startMainX), `the track must really change — start ${startMainX}, end ${endMainX}, main/trail ring: ${ring}`).toBeGreaterThan(100);
  // THE PREMISE: the trail is pinned to `.shell-main`'s END edge, which did not move. Its honest FLIP
  // distance is therefore ZERO and its corridor is a point.
  expect(Math.abs(endTrailX - startTrailX), `the trail must be END-pinned — start ${startTrailX}, end ${endTrailX}`).toBeLessThanOrEqual(1);
  const strays = samples.map((s) => s.trail).filter((x) => Math.abs(x - startTrailX) > 2);
  expect(strays, `.shell-topbar-trail left its ${startTrailX}±2 corridor: ${strays.join(", ")}`).toEqual([]);
});

// The CSS-contract twin for the reduced-motion SETTLE (#262), which holds the FLIP's `from` corner for
// exactly ONE painted frame — including, before #1316, a full track of it on the END-pinned trail, i.e. a
// one-frame disappearance of the ⌘K chip and the toggle cluster for the users who asked for LESS motion.
// Asserted by PLANTING the attribute and reading computed style rather than by sampling: a one-frame hold
// is a frame race, and what is actually load-bearing is that the two declarations are exact inverses.
test("#1316 the reduced-motion SETTLE holds the trail at the exact inverse of .shell-main's held corner", async ({ mount, page }) => {
  await page.setViewportSize(WIDE);
  await mount(<AppShellStory />);
  const grid = page.locator(".shell-grid");
  await expect(page.locator('.shell-panel[data-panel-side="list"]')).toHaveAttribute("data-panel-mode", "docked");

  // ONE evaluate for the plant AND both reads. Split across three round trips this flaked 1-in-5: the
  // #242 squeeze makes `--list-track-docked` depend on the CONTEXT pane's own mode, which settles a beat
  // after the list's, so the two boxes were sampled against DIFFERENT track widths (measured: main -307px
  // against trail -233.246px, the squeezed value) and "exact inverses" read false on a correct shell.
  const heldTranslates = (direction: "in" | "out"): Promise<{ main: string; trail: string }> =>
    grid.evaluate((el, value) => {
      el.setAttribute("data-list-settle", value);
      const read = (selector: string): string => {
        const target = document.querySelector(selector);
        return target === null ? "absent" : getComputedStyle(target).translate;
      };
      const pair = { main: read(".shell-main"), trail: read(".shell-topbar-trail") };
      el.removeAttribute("data-list-settle");
      return pair;
    }, direction);

  /** `translate: <x>px 0` → the signed pixel number; `none` (no rule matched) → null. */
  const offset = (value: string): number | null => {
    const px = /^(-?[\d.]+)px/.exec(value);
    return px?.[1] === undefined ? null : Number(px[1]);
  };

  for (const direction of ["in", "out"] as const) {
    const held = await heldTranslates(direction);
    const mainOffset = offset(held.main);
    const trailOffset = offset(held.trail);
    expect(mainOffset, `the settle must hold .shell-main on the "${direction}" arm, got ${held.main}`).not.toBeNull();
    expect(trailOffset, `the settle must hold .shell-topbar-trail on the "${direction}" arm, got ${held.trail}`).not.toBeNull();
    // Exact inverses: composed, the END-pinned trail sits at its own resting position for the held frame.
    expect(Math.round((mainOffset ?? 0) + (trailOffset ?? 0)), `held corners must cancel — main ${held.main}, trail ${held.trail}`).toBe(0);
    expect(Math.abs(mainOffset ?? 0), "the held corner must be a real track width, not zero").toBeGreaterThan(100);
  }
});

// NO COUNTER ON A PHONE either. The stamping hook is regime-blind, so on the one-column mobile grid — where
// a docking LIST is `position: fixed` over CONTENT and moves nothing — an un-cancelled counter would be the
// only thing animating: a full track of manufactured slide on the topbar's icon cluster. The `.shell-main`
// half of this rule has been in the mobile block since the FLIP landed; this is its twin arriving with #1316.
//
// HONEST LABEL: a FENCE, not a defect proof. It PASSES against the unmodified shell.css (measured
// 2026-09-05 — with no counter rule at all the trail trivially reports `animation-name: none`), so it
// cannot be the receipt for anything; what it exists for is the regression where the counter above lands
// and the mobile cancel does not follow it.
test("#1316 no END-pinned counter on a phone: the trail's flip animation is cancelled with .shell-main's", async ({ mount, page }) => {
  await page.setViewportSize(MOBILE);
  await mount(<AppShellStory />);
  // PLANTED, not driven: the mobile block is a CSS cancel, and stamping the attribute is the only way to
  // ask "would the rule have matched" on a regime where the hook's own stamp moves nothing. The page is
  // discarded with the test, so the stamp is never un-planted.
  await page.locator(".shell-grid").evaluate((el) => {
    el.setAttribute("data-list-flip", "out");
  });
  const animationNames = await page.locator(".shell-main, .shell-topbar-trail").evaluateAll((els) => els.map((el) => getComputedStyle(el).animationName));
  expect(animationNames.length, "both boxes must be present on the mobile shell").toBe(2);
  expect(animationNames, `mobile must cancel BOTH halves of the FLIP, got ${animationNames.join(" / ")}`).toEqual(["none", "none"]);
});

/** Collapse the LIST pane and BARRIER ON THE SETTLED RENDER — the mode attribute and then quiescence.
 *  A plain `waitForFunction` rather than an `expect`, because the arms that call it are conditional and a
 *  conditional `expect` is a lint refusal (and an honest one: a skipped assertion reads as a passing one). */
async function collapseListPane(shell: Locator, page: Page): Promise<void> {
  await shell.getByRole("button", { name: "Hide list panel" }).click();
  await page.waitForFunction(() => document.querySelector('.shell-panel[data-panel-side="list"]')?.getAttribute("data-panel-mode") === "collapsed");
  await waitForFlipToStop(page);
}

// NEW DESCRIBE (cb-list-collapse-motion / p-client-polish #1646, 2026-09-05) — a SEPARATE block from the
// #1316 tests above by design: p-client-ct-honesty is landing its own #846/CLS arms in this same file this
// week, and a fresh describe keeps the two lanes' edits union cleanly at merge (orchestrator notified).
//
// ── #1646: THE THIRD ALIGNMENT CLASS — a CENTRED child's honest FLIP distance is HALF the track ───────
// #1316 proved the END-pinned trail needs its own FULL-magnitude inverse counter because its honest delta
// is ZERO, not the track. The `.orb-chat-track` family is the THIRD shape: a `max-w-(--width-shell-content)`
// box centred by auto margins inside `.shell-main` moves by exactly HALF of `.shell-main`'s own resize —
// the #1316 receipt itself measured this as the retained residue (154px against a 307px track).
//
// READ THE KEYFRAME, NOT THE INTERPOLATED COMPUTED STYLE: a running CSS animation's `getComputedStyle(...)
// .translate` is whatever frame happens to be current when Playwright samples it — exactly why the phone
// fence above asserts `animationName` rather than a value. `Animation.effect.getKeyframes()` returns the
// AUTHORED (var/calc-resolved) keyframe list regardless of playback position, so it is what this test reads
// — the same technique, aimed at the encoded DISTANCE rather than at whether a rule matched at all.
//
// REAL CARRIERS, NOT A FABRICATED ROW (#2456). This used to append a bare `div.orb-chat-track` with
// `width: 100%`, which is NOT the box the counter is about: `CHAT_TRACK` also carries
// `max-w-(--width-shell-content)`, and an UNCAPPED box is one whose lead margin is always zero — it has no
// centring delta at all. The old percentage-based counter could not tell the two apart (its `100%` was the
// box's own width either way); the composed distance is derived from the TRACK now, so a fixture without
// the cap would be asserting a number no production carrier ever sees. `AppShellChatTrackStory` mounts the
// production string, which is what #2442 already moved the corridor arms onto.
//
// AND THE PLANTED DIRECTION MATCHES THE RENDERED MODE, which is new and is load-bearing (#2456). The
// distances are a difference between the CURRENT layout and the one the direction says came before it, so
// planting `out` while the pane is still DOCKED describes a third layout that never existed. `in` is read
// docked (the state a dock lands in) and `out` collapsed (the state a collapse lands in) — the two states
// the shell itself stamps them in.
test("#1646 the centred counter's keyframe is exactly half of .shell-main's own, opposite sign, on both FLIP arms", async ({ mount, page }) => {
  await page.setViewportSize(WIDE);
  await emulateMediaFeatures(page, [
    ["prefers-reduced-motion", "no-preference"],
    ["prefers-reduced-transparency", "no-preference"],
    ["prefers-contrast", "no-preference"],
  ]);
  const shell = await mount(<AppShellChatTrackStory />);
  const listPanel = page.locator('.shell-panel[data-panel-side="list"]');
  await landOnChats(shell, page);
  await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");
  await waitForSettledDock(page);

  const counters: { in: { main: number | null; row: number | null }; out: { main: number | null; row: number | null } } = {
    in: { main: null, row: null },
    out: { main: null, row: null },
  };
  for (const arm of [
    { direction: "in", mode: "docked" },
    { direction: "out", mode: "collapsed" },
  ] as const) {
    if (arm.mode === "collapsed") {
      await collapseListPane(shell, page);
    }
    const { mainRaw, rowRaw } = await page.locator(".shell-grid").evaluate((grid, dir) => {
      // FORCE THE MATCH-STATE TRANSITION: a CSS animation only (re)starts when a selector goes from not
      // matching to matching, and since #2456 there is ONE animation name per element rather than one per
      // direction — so removing, flushing style and re-setting is the only way to be sure the read sees a
      // freshly armed animation rather than whatever the shell's own stamp left running.
      grid.removeAttribute("data-list-flip");
      void grid.getBoundingClientRect();
      grid.setAttribute("data-list-flip", dir);
      const read = (selector: string): string | null => {
        const el = document.querySelector(selector);
        const anim = el?.getAnimations()[0];
        if (!(anim?.effect instanceof KeyframeEffect)) {
          return null;
        }
        const translate = anim.effect.getKeyframes()[0]?.["translate"];
        return typeof translate === "string" ? translate : null;
      };
      const result = { mainRaw: read(".shell-main"), rowRaw: read('[data-testid="track-row"]') };
      grid.removeAttribute("data-list-flip");
      return result;
    }, arm.direction);
    /** `"-307px 0px"` → `-307`; anything else fails loud via `not.toBeNull()` below. */
    const leadingPx = (value: string | null): number | null => {
      const match = value === null ? null : /^(-?[\d.]+)px/.exec(value);
      return match?.[1] === undefined ? null : Number(match[1]);
    };
    const mainPx = leadingPx(mainRaw);
    const rowPx = leadingPx(rowRaw);
    expect(mainPx, `.shell-main must carry a FLIP keyframe on the "${arm.direction}" arm, got ${String(mainRaw)}`).not.toBeNull();
    expect(rowPx, `the marker-bearing box must carry a counter keyframe on the "${arm.direction}" arm, got ${String(rowRaw)}`).not.toBeNull();
    expect(Math.abs(mainPx ?? 0), "the FLIP distance must be a real track width, not zero").toBeGreaterThan(100);
    // HALF, AND THE OTHER WAY: the centred box's honest delta is half of `.shell-main`'s own resize, and
    // the counter runs against the parent's translate, so the two carry opposite signs at a 2:1 ratio.
    expect(
      Math.abs((rowPx ?? 0) * -2 - (mainPx ?? 0)),
      `the centred counter must be half of .shell-main's corner, inverted — main ${String(mainPx)}, row ${String(rowPx)}`,
    ).toBeLessThan(1);
    counters[arm.direction] = { main: mainPx, row: rowPx };
  }
  // …and the two ARMS are exact inverses of each other, which is what makes a dock and the collapse that
  // undoes it one reversible event rather than two expressions that happen to agree.
  // Summed rather than rounded-then-compared: the centred counter is a HALF, so it lands on `.5` at every
  // odd track width and `Math.round` breaks a tie upward on both signs (153.5 -> 154, -153.5 -> -153).
  expect(Math.abs((counters.in.main ?? 0) + (counters.out.main ?? 0)), "the two arms must be exact inverses").toBeLessThan(1);
  expect(Math.abs((counters.in.row ?? 0) + (counters.out.row ?? 0)), "the two arms must be exact inverses").toBeLessThan(1);
});

// THE REDUCED-MOTION SETTLE (#262) TWIN — the held frame sets `translate` directly (no animation), so the
// rendered offset either side of the planted attribute is the honest subject. Same real carriers and same
// mode-matched plant as the arm above (#2456).
test("#1646 the reduced-motion SETTLE holds the centred carrier at exactly half the inverse of .shell-main's held corner", async ({ mount, page }) => {
  await page.setViewportSize(WIDE);
  const shell = await mount(<AppShellChatTrackStory />);
  const grid = page.locator(".shell-grid");
  const listPanel = page.locator('.shell-panel[data-panel-side="list"]');
  await landOnChats(shell, page);
  await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");
  await waitForSettledDock(page);

  // ACROSS A PAINTED FRAME, and that is not a wall-clock guess: a transform is resolved in the compositing
  // update, not in the layout `getBoundingClientRect` forces, so reading the rect in the same task reported
  // the parent's corner with the box's own missing entirely (measured here — and it reads exactly like a
  // rule that did not match, which is the trap). Two rAFs is the settle's OWN lifetime
  // (`settleWithoutMotion`'s docblock states why two), so this samples the frame the user actually sees.
  const heldTranslates = (direction: "in" | "out"): Promise<{ main: number; row: number }> =>
    grid.evaluate(async (el, value) => {
      const box = (selector: string): number => document.querySelector(selector)?.getBoundingClientRect().x ?? Number.NaN;
      const before = { main: box(".shell-main"), row: box('[data-testid="track-row"]') };
      el.setAttribute("data-list-settle", value);
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      });
      const after = { main: box(".shell-main"), row: box('[data-testid="track-row"]') };
      el.removeAttribute("data-list-settle");
      return { main: after.main - before.main, row: after.row - before.row };
    }, direction);

  for (const arm of [
    { direction: "in", mode: "docked" },
    { direction: "out", mode: "collapsed" },
  ] as const) {
    if (arm.mode === "collapsed") {
      await collapseListPane(shell, page);
    }
    const held = await heldTranslates(arm.direction);
    expect(Math.abs(held.main), `the held corner must be a real track width, not zero — main ${held.main}, row ${held.row}`).toBeGreaterThan(100);
    // THE ROW'S OWN OFFSET IS THE DIFFERENCE, because the row is a CHILD of `.shell-main` and its rect
    // carries the parent's held corner too — a rendered read has to subtract the parent out before it can
    // speak about the counter.
    const rowOwn = held.row - held.main;
    expect(Math.round(rowOwn * 2), `row must be held at exactly half the inverse of main: main ${held.main}, row own ${rowOwn}`).toBe(-Math.round(held.main));
    // …and composed, that is the honest HALF-track corner the transcript is actually held at.
    expect(Math.round(held.row * 2), `composed, the row must sit at half the track: main ${held.main}, row ${held.row}`).toBe(Math.round(held.main));
  }
});

// ── #2442: THE COUNTER NAMES A MARKER FAMILY, AND ITS MAGNITUDE IS THE CLAMPED DELTA ────────────────
// Side-eye live drive 2026-09-19 (docs/reviews/side-eye/2026-09-19-collapse-ux-touch-audits.md, AUDIT 1).
// #1646 countered `[data-slot=message-row]`, which is ONE of the six boxes that wear `CHAT_TRACK` — the
// room's one centred track (features/chat/lib/chat-track.ts). The composer wears it too, was not
// countered, and therefore rode `.shell-main`'s FULL-track translate: per-rAF census at 1280x800,
// `composer 437 → 591 → … → 284` while the transcript directly above it held still — a 154px shear
// between the reading column and the control the user is about to touch, on every toggle, both
// directions. CLS is structurally blind to it (a real click sets `hadRecentInput`), which is why the
// zero-shift test two blocks up stayed green through the whole thing.
//
// THE RECEIPT IS THE SAME PER-rAF `getBoundingClientRect` CENSUS THE LIVE DRIVE USED, and the shape of
// the assertion is #1316's corridor: a centred box legitimately TRAVELS across the FLIP (437 → 284), so
// what is a defect is leaving the corridor between its old and new resting positions. Pre-fix the
// composer's first painted frame is 154px OUTSIDE it.
//
// FABRICATED CONTENT, REAL GEOMETRY: `AppShellChatTrackStory` puts two boxes wearing the production
// `CHAT_TRACK` string in the chats CONTENT slot. This file cannot route a real transcript (#1677 header),
// and does not need to — the counter's subject is the TRACK, and these two resolve their horizontal
// placement through exactly the rule the six production carriers do.

/** DRIVE the section, never wait for the story to land it. `LandOn`'s mount effect races the shell store's
 *  own rehydration, and the race is REAL: measured here, `data-section` sat at `home` for the full poll on
 *  a story whose `LandOn` names chats — and `home` declares no LIST pane at all, so the next assertion
 *  reads a panel that is `collapsed` + `data-panel-available="false"` and looks exactly like a dock that
 *  refused. A rail click is what a user does and what the store cannot lose; polling the stamped section
 *  afterwards is the settled-render barrier. */
async function landOnChats(shell: Locator, page: Page): Promise<void> {
  await shell.getByRole("button", { name: "Chats" }).click();
  await expect.poll(() => page.locator(".shell-grid").getAttribute("data-section"), { intervals: [50, 100, 200, 400, 800] }).toBe("chats");
}

/** The x of the three boxes this block judges plus `.shell-main`'s WIDTH, read in ONE round trip so they
 *  can never be a frame apart. The width is what names the FIRST PAINTED FRAME of the flip: every x in
 *  that frame is HELD at the FLIP's `from` corner by construction (that is the whole mechanism), so x
 *  cannot say when the track changed — the resize can. */
function readTrackXs(page: Page): Promise<{ main: number; mainWidth: number; row: number; composer: number }> {
  return page.evaluate(() => {
    const x = (selector: string): number => {
      const el = document.querySelector(selector);
      return el === null ? Number.NaN : Math.round(el.getBoundingClientRect().x);
    };
    const mainEl = document.querySelector(".shell-main");
    return {
      main: x(".shell-main"),
      mainWidth: mainEl === null ? Number.NaN : Math.round(mainEl.getBoundingClientRect().width),
      row: x('[data-testid="track-row"]'),
      composer: x('[data-testid="track-composer"]'),
    };
  });
}

/** THE FLIP'S OWN CONTRACT, asserted on the frame it is about: in the first frame painted after the track
 *  resized, every centred carrier must still be where the user last saw it (±2px for the lead margin's
 *  `round(down, …, 1px)`). Returns the ring rendered for the failure message. */
function assertHeldFromCorner(
  samples: readonly { main: number; mainWidth: number; row: number; composer: number }[],
  rest: { main: number; mainWidth: number; row: number; composer: number },
  leg: string,
): void {
  const ring = samples.map((s) => `${s.main}:${s.mainWidth}/${s.row}/${s.composer}`).join(" ");
  expect(samples.length, `the rAF sampler must have run on "${leg}" — an empty ring proves nothing`).toBeGreaterThan(2);
  // NON-VACUITY, and the reason the width is sampled at all: the ring must actually STRADDLE the resize,
  // or "the first flipped frame" names nothing and every assertion below is about a resting layout.
  const flipIndex = samples.findIndex((sample) => Math.abs(sample.mainWidth - rest.mainWidth) > 2);
  expect(flipIndex, `the ring must contain the frame the track resized in on "${leg}" — ring ${ring}`).toBeGreaterThan(-1);
  const flipped = samples[flipIndex];
  expect(flipped, `sample ${flipIndex} must exist — ring ${ring}`).toBeDefined();
  for (const box of ["row", "composer"] as const) {
    expect(
      Math.abs((flipped?.[box] ?? Number.NaN) - rest[box]),
      `${box} moved on the first painted frame of "${leg}" (rest ${rest[box]}) — ring ${ring}`,
    ).toBeLessThanOrEqual(2);
  }
}

/** A bounded per-frame sampler over the same three boxes — rAF, not a poll: the excursion is ONE painted
 *  frame wide at its start, so anything slower than the frame clock samples past the very thing it judges.
 *  Installed BEFORE the click so the first flipped frame is in the ring. */
function installTrackSampler(page: Page): Promise<void> {
  return page.evaluate(() => {
    // @orb-waive no-test-fabrication(unknown): a browser-context probe slot, written and read in this block alone. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const bag = globalThis as unknown as { __trackXs: { main: number; mainWidth: number; row: number; composer: number }[] };
    bag.__trackXs = [];
    const main = document.querySelector(".shell-main");
    const row = document.querySelector('[data-testid="track-row"]');
    const composer = document.querySelector('[data-testid="track-composer"]');
    const tick = (): void => {
      if (main === null || row === null || composer === null || bag.__trackXs.length > 60) {
        return;
      }
      const mainBox = main.getBoundingClientRect();
      bag.__trackXs.push({
        main: Math.round(mainBox.x),
        mainWidth: Math.round(mainBox.width),
        row: Math.round(row.getBoundingClientRect().x),
        composer: Math.round(composer.getBoundingClientRect().x),
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** Read the ring ONCE — a poll over a shared array drains the samples it is judging. */
function readTrackSamples(page: Page): Promise<{ main: number; mainWidth: number; row: number; composer: number }[]> {
  // @orb-waive no-test-fabrication(unknown): reads back the probe slot installed above. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  return page.evaluate(() => (globalThis as unknown as { __trackXs: { main: number; mainWidth: number; row: number; composer: number }[] }).__trackXs);
}

/** BARRIER ON THE SETTLED DOCK, two conditions in ONE read (#1316's corridor test, verbatim): nothing is
 *  animating AND `.shell-main`'s start edge sits exactly on the docked panel's end edge. Geometry alone
 *  races the regime seed's own mount-time FLIP; the attribute alone lands a frame before the relayout. */
function waitForSettledDock(page: Page): Promise<unknown> {
  return page.waitForFunction(() => {
    const mainEl = document.querySelector(".shell-main");
    const panelEl = document.querySelector('.shell-panel[data-panel-side="list"]');
    if (mainEl === null || panelEl === null) {
      return false;
    }
    const running = [...mainEl.getAnimations(), ...panelEl.getAnimations()].some((a) => a.playState === "running");
    return !running && Math.round(mainEl.getBoundingClientRect().x) === Math.round(panelEl.getBoundingClientRect().right);
  });
}

/** Past the motion itself, so an "end" read is a RESTING position and not a mid-animation sample. */
function waitForFlipToStop(page: Page): Promise<unknown> {
  return page.waitForFunction(() => {
    const nodes = [
      document.querySelector(".shell-main"),
      document.querySelector('[data-testid="track-composer"]'),
      document.querySelector('[data-testid="track-row"]'),
    ];
    return !nodes.some((node) => (node?.getAnimations() ?? []).some((a) => a.playState === "running"));
  });
}

test("#2442 no .orb-chat-track carrier leaves its FLIP corridor — the composer counts, in BOTH directions", async ({ mount, page }) => {
  await page.setViewportSize(WIDE);
  await emulateMediaFeatures(page, [
    ["prefers-reduced-motion", "no-preference"],
    ["prefers-reduced-transparency", "no-preference"],
    ["prefers-contrast", "no-preference"],
  ]);
  const shell = await mount(<AppShellChatTrackStory />);
  const listPanel = page.locator('.shell-panel[data-panel-side="list"]');
  // The landed section is the premise, asserted before the mode (see the fontScale twin below for the
  // measured failure mode a missing section barrier produces — the HOME pane, which HAS no list).
  await landOnChats(shell, page);
  await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");
  await waitForSettledDock(page);

  // THE PREMISE: both carriers ARE the same centred box — same track, same delta. If they ever stop
  // sharing it, the single counter rule below is the wrong shape and this test must be re-derived.
  const docked = await readTrackXs(page);
  expect(docked.row, `both carriers must share the room's ONE track — row ${docked.row}, composer ${docked.composer}`).toBe(docked.composer);

  for (const leg of [
    { button: "Hide list panel", mode: "collapsed" },
    { button: "Show list panel", mode: "docked" },
  ] as const) {
    const rest = await readTrackXs(page);
    await installTrackSampler(page);
    await shell.getByRole("button", { name: leg.button }).click();
    await expect(listPanel).toHaveAttribute("data-panel-mode", leg.mode);
    // BARRIER ON THE SETTLED RENDER, never on the attribute: the mode lands a frame or more before the
    // grid is re-laid out at the new track, and the animation runs for `--shell-motion` after that.
    await expect.poll(async () => (await readTrackXs(page)).main, { intervals: [50, 100, 200, 300] }).not.toBe(rest.main);
    await waitForFlipToStop(page);
    const end = await readTrackXs(page);
    const samples = await readTrackSamples(page);

    const ring = samples.map((s) => `${s.main}:${s.mainWidth}/${s.row}/${s.composer}`).join(" ");
    // NON-VACUITY: a no-op toggle would make every corridor a point and pass this whole loop trivially.
    expect(Math.abs(end.main - rest.main), `the track must really change on "${leg.button}" — ring ${ring}`).toBeGreaterThan(100);
    // ARM 1 — the FLIP's own promise, on the frame it is about.
    assertHeldFromCorner(samples, rest, leg.button);

    // ARM 2 — and nothing leaves the corridor between the two resting positions afterwards either. This is
    // the arm the un-countered composer failed by 154px; it is kept beside ARM 1 because a counter of the
    // WRONG SIGN would hold the first frame and then travel outside the corridor to get back.
    for (const box of ["row", "composer"] as const) {
      const low = Math.min(rest[box], end[box]) - 2;
      const high = Math.max(rest[box], end[box]) + 2;
      const strays = samples.map((sample) => sample[box]).filter((x) => x < low || x > high);
      expect(strays, `${box} left its ${low}…${high} corridor on "${leg.button}": ${strays.join(", ")} — ring ${ring}`).toEqual([]);
    }
  }
});

// ── #2442 / A1-3: the CLAMPED delta, at the appearance the owner actually runs ───────────────────────
// `--list-track-docked / 2` is the honest delta only while the docked content column is WIDER than
// `--width-shell-content` — i.e. while the box really is the fixed-width box #1646's derivation names. At
// `--font-scale: 1.25` the dial's own floor (46.125rem) resolves 922.5px against an ~850px docked track,
// so the box is WIDTH-CONSTRAINED while docked: its width changes with the track and its left-edge delta
// is the track MINUS that width change, which the halved track over-applies (measured live: a 37px
// residual jump of the transcript on every collapse).
//
// THIS IS THE DOCK DIRECTION, AND THAT IS NOT A CONVENIENCE. The counter is derived from the box's own
// width, and `100%` is the containing block's width precisely when the cap binds — which is the DOCKED
// state. Collapsing from the same regime lands the box at its cap, where the collapsed parent's width is
// invisible to it; that arm is shell.css's stated #2442 fork and is deliberately not asserted here rather
// than pinned at a wrong value.
test("#2442 at fontScale 1.25 the docking counter is the box's CLAMPED delta, not half the track", async ({ mount, page }) => {
  await page.setViewportSize(WIDE);
  await emulateMediaFeatures(page, [
    ["prefers-reduced-motion", "no-preference"],
    ["prefers-reduced-transparency", "no-preference"],
    ["prefers-contrast", "no-preference"],
  ]);
  await routeTrpc(page, {
    ...SHELL_AMBIENT_ROUTES,
    "settings.getUserSettings": () => ({
      userId: "user_ct_shell_track_scale",
      schemaVersion: 1,
      config: { ...DEFAULT_USER_SETTINGS, appearance: { ...DEFAULT_USER_SETTINGS.appearance, fontScale: 1.25 } },
      updatedAt: 0,
    }),
  });
  const shell = await mount(<AppShellChatTrackStory />);
  const listPanel = page.locator('.shell-panel[data-panel-side="list"]');
  // BARRIER ON THE LANDED SECTION FIRST. With the settings read stubbed, the shell's boot can hold the
  // story's `LandOn` commit past the default expect timeout — measured once here, reading back the HOME
  // pane (`aria-label="Home list"`, `data-panel-available="false"`, i.e. a section with no LIST at all),
  // which looks exactly like a panel that refused to dock. The section is the premise; the mode is the
  // subject, and they are asserted in that order.
  await landOnChats(shell, page);
  await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");
  await expect
    .poll(() => page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize)), { intervals: [20, 50, 100] })
    .toBeCloseTo(UA_ROOT_PX * 1.25, 0);
  await waitForSettledDock(page);

  /** The rendered width of the centred box — the thing that decides which regime it is in. */
  const trackWidth = (): Promise<number> =>
    page.evaluate(() => Math.round(document.querySelector('[data-testid="track-composer"]')?.getBoundingClientRect().width ?? Number.NaN));
  const dockedWidth = await trackWidth();

  await shell.getByRole("button", { name: "Hide list panel" }).click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "collapsed");
  await waitForFlipToStop(page);
  // THE REGIME PREMISE, and the reason this test is not a duplicate of the one above: at this font scale
  // the box is CONSTRAINED while docked, so it GROWS when the track goes away. Equal widths here would
  // mean the cap never binds and the clamped delta collapses back to half the track — a vacuous pass.
  const collapsedWidth = await trackWidth();
  expect(collapsedWidth, `the cap must bind while docked — docked ${dockedWidth}, collapsed ${collapsedWidth}`).toBeGreaterThan(dockedWidth + 2);

  const rest = await readTrackXs(page);
  await installTrackSampler(page);
  await shell.getByRole("button", { name: "Show list panel" }).click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");
  await expect.poll(async () => (await readTrackXs(page)).main, { intervals: [50, 100, 200, 300] }).not.toBe(rest.main);
  await waitForFlipToStop(page);
  const end = await readTrackXs(page);
  const samples = await readTrackSamples(page);

  const ring = samples.map((s) => `${s.main}:${s.mainWidth}/${s.row}/${s.composer}`).join(" ");
  expect(Math.abs(end.main - rest.main), `the track must really change — ring ${ring}`).toBeGreaterThan(100);
  assertHeldFromCorner(samples, rest, "Show list panel");
  for (const box of ["row", "composer"] as const) {
    const low = Math.min(rest[box], end[box]) - 2;
    const high = Math.max(rest[box], end[box]) + 2;
    const strays = samples.map((sample) => sample[box]).filter((x) => x < low || x > high);
    expect(strays, `${box} left its ${low}…${high} corridor while docking at rem 20: ${strays.join(", ")} — ring ${ring}`).toEqual([]);
  }
});

// ── #2442 / A1-2: NO FLIP ON A PHONE means the PANEL too ─────────────────────────────────────────────
// The mobile block says "NO FLIP ON A PHONE" in as many words and cancels four selectors. Three of them
// won their specificity contest at equal weight on source order. The panel's did not: its own FLIP rule
// carries `[data-panel-mode="docked"]` as a fifth simple selector, so the panel's own keyframe (named
// `shell-list-panel-in` then, `shell-list-panel-flip` since #2456) kept running
// at coarse — and because that keyframe animates `translate` while the phone arm's panel rule transitions
// `transform`, the two COMPOSED. Measured live at 430x740: the docking sheet's first painted frame sat at
// -860, TWO panel widths off-canvas, and the first half of an expo ease-out played off-screen.
//
// TWO ARMS, both against the REAL mobile dock the ONE-SHELL rule produces (a selection pushes CONTENT, the
// back door docks the roster again) — no planted attribute, because the hook stamps a real `data-list-flip`
// on this very transition and that is the thing under test.
test("#2442 the phone's docking list sheet never enters from beyond its own width, and runs no FLIP animation", async ({ mount, page }) => {
  await page.setViewportSize(MOBILE);
  await emulateMediaFeatures(page, [
    ["prefers-reduced-motion", "no-preference"],
    ["prefers-reduced-transparency", "no-preference"],
    ["prefers-contrast", "no-preference"],
  ]);
  const shell = await mount(<AppShellMobileRuleStory section="chats" />);
  const listPanel = page.locator('.shell-panel[data-panel-side="list"]');
  await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");

  // Push the detail so the roster leaves the screen — the state the back door docks OUT of.
  await shell.getByRole("button", { name: "open a member" }).click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "collapsed");
  await page.waitForFunction(
    () => !(document.querySelector('.shell-panel[data-panel-side="list"]')?.getAnimations() ?? []).some((a) => a.playState === "running"),
  );

  const panelWidth = Math.round((await listPanel.boundingBox())?.width ?? 0);
  expect(panelWidth, "the phone sheet must be a real full-viewport width").toBeGreaterThan(100);

  await page.evaluate(() => {
    // @orb-waive no-test-fabrication(unknown): a browser-context probe slot, written and read in this test alone. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const bag = globalThis as unknown as { __panelXs: number[] };
    bag.__panelXs = [];
    const panel = document.querySelector('.shell-panel[data-panel-side="list"]');
    const tick = (): void => {
      if (panel === null || bag.__panelXs.length > 60) {
        return;
      }
      bag.__panelXs.push(Math.round(panel.getBoundingClientRect().x));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  await shell.getByRole("button", { name: "Back to Chats" }).click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");
  // ARM 1, sampled while the transition is still live: with the cancel out-specified the rule matches and
  // the computed name is the keyframe's. Read through `expect.poll` over the whole settle so the sample is
  // never a race — the value is a CSS FACT for as long as the rule matches, not a frame-width event.
  const animationNames = await page.locator('.shell-panel[data-panel-side="list"]').evaluate((el) => getComputedStyle(el).animationName);
  expect(animationNames, "the phone arm must cancel the list panel's own FLIP entrance").toBe("none");

  await page.waitForFunction(
    () => !(document.querySelector('.shell-panel[data-panel-side="list"]')?.getAnimations() ?? []).some((a) => a.playState === "running"),
  );
  // @orb-waive no-test-fabrication(unknown): reads back the probe slot installed above. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  const samples = await page.evaluate(() => (globalThis as unknown as { __panelXs: number[] }).__panelXs);
  expect(samples.length, "the rAF sampler must have run — an empty ring proves nothing").toBeGreaterThan(2);
  // ARM 2, the user-visible half: the sheet travels from ONE width off-canvas to 0. Anything beyond that
  // is the composed `translate` — off-screen travel the reader waits through.
  const strays = samples.filter((x) => x < -panelWidth - 2 || x > 2);
  expect(strays, `the phone sheet entered from beyond its own width (${panelWidth}): ${strays.join(", ")} — ring ${samples.join(" ")}`).toEqual([]);
});

// ── #2456: ONE GRAMMAR, THREE DOORS ─────────────────────────────────────────────────────────────────
// The owner's report (2026-09-19): "dock/undock list and context have uncentralized jank and the
// fullscreen button is jank and not consistent." dock-R's per-rAF census (#2449) named the cause — the
// CONTEXT track had no FLIP at all, so a context toggle CUT the topbar trail 1043 -> 659, the docking
// context pane 1280 -> 896, `.shell-main` 363 -> 328 and both `.orb-chat-track` carriers 437 -> 328 in ONE
// frame, and the FOCUS door (which drives both tracks) inherited every one of them.
//
// THE ACCEPTANCE IS THE CENSUS ITSELF: every door moves the same boxes on the same curve. A FLIP's whole
// promise is that in the first frame painted after the track resized, every box it counters is still where
// the user last saw it; after that it may only travel inside the corridor between its two resting
// positions. This block asserts exactly that, per box, per door, in both directions — the same shape as
// #1316's corridor and #2442's held-corner arms, widened to the boxes the other two doors move.
//
// IT IS THE DEFECT PROOF, NOT A FENCE. Against the unmodified shell.css every context and focus leg below
// reports the cut listed above (measured: trail 384px off its rest on the first flipped frame, both
// carriers 109px off, the context pane a full 384px).

/** The boxes a shell door moves, by the name the failure message prints. `.shell-rail` is deliberately
 *  absent: it is grid column 1 and the census measured it constant through every door, so a corridor arm
 *  over it would assert nothing. `.shell-content` and `.shell-topbar-lead` ride `.shell-main`'s own
 *  translate (start-aligned children), so they are covered by the `main` row rather than re-measured. */
const DOOR_BOXES = {
  main: ".shell-main",
  trail: ".shell-topbar-trail",
  listPanel: '.shell-panel[data-panel-side="list"]',
  contextPanel: '.shell-panel[data-panel-side="context"]',
  row: '[data-testid="track-row"]',
  composer: '[data-testid="track-composer"]',
  // #2463: THE LIST BAND'S TRAILING ACTION — the one box in the shell whose delta is neither the LIST
  // track, nor `.shell-main`'s width change, nor half of it. The list pane is anchored to the rail, so a
  // CONTEXT toggle leaves its start edge where it was and REFLOWS its width by the #242 squeeze (307 →
  // 272 at 1280x800); a child pinned to that pane's END edge therefore owes the pane's own width change,
  // which no existing counter carries. Measured before the fix: 304 → 269 in ONE frame on every context
  // toggle, i.e. the whole squeeze, on the pane's only primary action.
  listAction: '[data-testid="list-band-action"]',
} as const;

/** One frame of the door census: every box's x plus `.shell-main`'s WIDTH — the width is what names the
 *  frame the track resized in, because every x in that frame is HELD at the FLIP's `from` corner by
 *  construction (that is the whole mechanism) and therefore cannot say when the commit landed. */
function installDoorSampler(page: Page): Promise<void> {
  return page.evaluate((selectors) => {
    // @orb-waive no-test-fabrication(unknown): a browser-context probe slot, written and read in this block alone. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const bag = globalThis as unknown as { __doorXs: Record<string, number>[] };
    bag.__doorXs = [];
    /** One box's WIDTH, or NaN when it is not on the page — the two width readings below share it so the
     *  sampler stays inside its complexity budget with the #2474 pane reading added. */
    const widthOf = (selector: string): number => {
      const el = document.querySelector(selector);
      return el === null ? Number.NaN : Math.round(el.getBoundingClientRect().width);
    };
    const tick = (): void => {
      if (bag.__doorXs.length > 60) {
        return;
      }
      const frame: Record<string, number> = {};
      for (const [name, selector] of Object.entries(selectors)) {
        const el = document.querySelector(selector);
        frame[name] = el === null ? Number.NaN : Math.round(el.getBoundingClientRect().x * 10) / 10;
      }
      frame["mainWidth"] = widthOf(".shell-main");
      // #2474: the LIST pane's own WIDTH. Every other number in this frame is an `x`, and an x cannot see
      // this defect at all — the pane is anchored to the rail, so its start edge does not move when its
      // width does; the change lands on the trailing edge.
      frame["listPanelWidth"] = widthOf('.shell-panel[data-panel-side="list"]');
      bag.__doorXs.push(frame);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, DOOR_BOXES);
}

/** The same shape, read once — for the resting endpoints either side of a leg. */
function readDoorBoxes(page: Page): Promise<Record<string, number>> {
  return page.evaluate((selectors) => {
    const frame: Record<string, number> = {};
    for (const [name, selector] of Object.entries(selectors)) {
      const el = document.querySelector(selector);
      frame[name] = el === null ? Number.NaN : Math.round(el.getBoundingClientRect().x * 10) / 10;
    }
    const mainEl = document.querySelector(".shell-main");
    frame["mainWidth"] = mainEl === null ? Number.NaN : Math.round(mainEl.getBoundingClientRect().width);
    const listEl = document.querySelector('.shell-panel[data-panel-side="list"]');
    frame["listPanelWidth"] = listEl === null ? Number.NaN : Math.round(listEl.getBoundingClientRect().width);
    return frame;
  }, DOOR_BOXES);
}

/** Read the ring ONCE — a poll over a shared array drains the samples it is judging. */
function readDoorSamples(page: Page): Promise<Record<string, number>[]> {
  // @orb-waive no-test-fabrication(unknown): reads back the probe slot installed above. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  return page.evaluate(() => (globalThis as unknown as { __doorXs: Record<string, number>[] }).__doorXs);
}

/** Nothing in the whole shell is animating any more — the door is settled, so an endpoint read is a
 *  RESTING position rather than a mid-animation sample. Subtree-wide because a door moves five boxes. */
function waitForDoorToSettle(page: Page): Promise<unknown> {
  return page.waitForFunction(() => {
    const grid = document.querySelector(".shell-grid");
    return grid !== null && !grid.getAnimations({ subtree: true }).some((animation) => animation.playState === "running");
  });
}

/** Drive ONE door and return the census around it: the resting frame before, the per-rAF ring across, and
 *  the resting frame after. The sampler is installed BEFORE the click so the first flipped frame is in the
 *  ring — it is one frame wide and a poll samples past it. */
async function driveDoor(
  shell: Locator,
  page: Page,
  button: string,
): Promise<{
  rest: Record<string, number>;
  samples: Record<string, number>[];
  end: Record<string, number>;
}> {
  const rest = await readDoorBoxes(page);
  await installDoorSampler(page);
  await shell.getByRole("button", { name: button }).click();
  await page.waitForFunction((restWidth) => {
    const mainEl = document.querySelector(".shell-main");
    return mainEl !== null && Math.abs(Math.round(mainEl.getBoundingClientRect().width) - restWidth) > 2;
  }, rest["mainWidth"] ?? 0);
  await waitForDoorToSettle(page);
  const samples = await readDoorSamples(page);
  const end = await readDoorBoxes(page);
  return { rest, samples, end };
}

/** THE FLIP'S CONTRACT, asserted on the frame it is about, then on the whole glide:
 *   1. the ring STRADDLES the commit (else "the first flipped frame" names nothing);
 *   2. in that frame every countered box is still within 2px of where it rested (the `round(…, 1px)` on
 *      the panel tracks and the auto-margin halving each cost up to half a pixel);
 *   3. nothing leaves the corridor between the two resting positions afterwards — a counter of the WRONG
 *      SIGN holds frame one and then travels outside the corridor to get back, so arm 2 alone is not
 *      enough (that is the shape #2442's composer failed by 154px). */
function assertDoorHeld(
  census: { rest: Record<string, number>; samples: Record<string, number>[]; end: Record<string, number> },
  leg: string,
  boxes: readonly string[],
): void {
  const { rest, samples, end } = census;
  const ring = samples.map((s) => boxes.map((b) => s[b]).join("/")).join(" ");
  expect(samples.length, `the rAF sampler must have run on "${leg}" — an empty ring proves nothing`).toBeGreaterThan(2);
  // The annotation is load-bearing, not decoration: `noUncheckedIndexedAccess` makes this index access
  // `number | undefined` for tsc, while biome's own type service does not model that flag and calls both
  // a coalesce and a `Number()` conversion redundant. Stating the type makes the two agree.
  const restWidth: number | undefined = rest["mainWidth"];
  const flipIndex = samples.findIndex((sample) => Math.abs((sample["mainWidth"] ?? Number.NaN) - (restWidth ?? Number.NaN)) > 2);
  expect(flipIndex, `the ring must contain the frame the track resized in on "${leg}" — ring ${ring}`).toBeGreaterThan(-1);
  const flipped = samples[flipIndex] ?? {};
  // NON-VACUITY: at least one box must really have travelled, or every corridor is a point.
  const travelled = boxes.filter((box) => Math.abs((end[box] ?? 0) - (rest[box] ?? 0)) > 50);
  expect(travelled.length, `"${leg}" must actually move something — ring ${ring}`).toBeGreaterThan(0);
  for (const box of boxes) {
    expect(
      Math.abs((flipped[box] ?? Number.NaN) - (rest[box] ?? Number.NaN)),
      `${box} CUT on the first painted frame of "${leg}" (rest ${rest[box]}, frame ${flipped[box]}) — ring ${ring}`,
    ).toBeLessThanOrEqual(2);
    const low = Math.min(rest[box] ?? 0, end[box] ?? 0) - 2;
    const high = Math.max(rest[box] ?? 0, end[box] ?? 0) + 2;
    const strays = samples
      .slice(flipIndex)
      .map((sample) => sample[box] ?? Number.NaN)
      .filter((x) => x < low || x > high);
    expect(strays, `${box} left its ${low}…${high} corridor on "${leg}": ${strays.join(", ")} — ring ${ring}`).toEqual([]);
  }
}

/** Land the doors story on chats with BOTH panes in a known state: the list docked (its real default) and
 *  the context pane collapsed (its real default), settled. */
async function landDoorsStory(shell: Locator, page: Page): Promise<void> {
  await landOnChats(shell, page);
  await expect(page.locator('.shell-panel[data-panel-side="list"]')).toHaveAttribute("data-panel-mode", "docked");
  await expect(page.locator('.shell-panel[data-panel-side="context"]')).toHaveAttribute("data-panel-mode", "collapsed");
  await waitForSettledDock(page);
}

const LIST_DOOR_BOXES = ["main", "trail", "listPanel", "row", "composer"] as const;
// `listAction` rides the CONTEXT door only, and the omission from the other two sets is a MEASURED fact
// rather than a gap (#2463). The LIST door MOVES the pane the action lives in — its entrance/exit slide is
// the motion, not a defect to cancel — so a corridor arm over a box that is deliberately travelling
// off-screen would assert the opposite of the truth. The FOCUS door drives BOTH tracks, so it moves the
// list pane too and inherits the same exemption; what it does NOT inherit is a clean bill, because a
// collapsing list pane swaps its docked (squeezed) width for the unsqueezed `--panel-w` in the same frame
// its exit transition starts. That is a separate, pre-existing discontinuity of the PANE's own entrance
// corner (`--list-panel-flip-from` reads `--panel-w`, never `--list-track-was`), reported rather than
// silently folded into this row.
const CONTEXT_DOOR_BOXES = ["main", "trail", "contextPanel", "row", "composer", "listAction"] as const;
const FOCUS_DOOR_BOXES = ["main", "trail", "listPanel", "contextPanel", "row", "composer"] as const;

test("#2456 the LIST door holds every box it moves on the first painted frame, in both directions", async ({ mount, page }) => {
  await page.setViewportSize(WIDE);
  await emulateMediaFeatures(page, [
    ["prefers-reduced-motion", "no-preference"],
    ["prefers-reduced-transparency", "no-preference"],
    ["prefers-contrast", "no-preference"],
  ]);
  const shell = await mount(<AppShellTrackDoorsStory />);
  await landDoorsStory(shell, page);

  for (const leg of ["Hide list panel", "Show list panel"] as const) {
    const census = await driveDoor(shell, page, leg);
    expect(census.samples.length, `the rAF sampler must have run on "${leg}" — an empty ring proves nothing`).toBeGreaterThan(2);
    assertDoorHeld(census, leg, LIST_DOOR_BOXES);
  }
});

test("#2456 the CONTEXT door holds every box it moves on the first painted frame, in both directions", async ({ mount, page }) => {
  await page.setViewportSize(WIDE);
  await emulateMediaFeatures(page, [
    ["prefers-reduced-motion", "no-preference"],
    ["prefers-reduced-transparency", "no-preference"],
    ["prefers-contrast", "no-preference"],
  ]);
  const shell = await mount(<AppShellTrackDoorsStory />);
  await landDoorsStory(shell, page);

  for (const leg of ["Show details", "Hide details"] as const) {
    const census = await driveDoor(shell, page, leg);
    expect(census.samples.length, `the rAF sampler must have run on "${leg}" — an empty ring proves nothing`).toBeGreaterThan(2);
    assertDoorHeld(census, leg, CONTEXT_DOOR_BOXES);
  }
});

// THE COMPOUND DOOR, AND THE REASON THE DISTANCES ARE A DIFFERENCE OF LAYOUTS RATHER THAN A SUM OF TRACKS
// (shell.css "THE PREVIOUS LAYOUT, RE-DERIVED"). Focus drives BOTH tracks in one commit, and the #242
// squeeze makes each track's width depend on the other pane's mode — so a per-track sum loses the squeeze
// exactly here. Measured with a per-track sum in place: this leg held `.shell-main` at 363 when its old
// start edge was 328, 35px out, the squeeze to the pixel.
test("#2456 the FOCUS door moves the same boxes on the same curve, from BOTH panes docked", async ({ mount, page }) => {
  await page.setViewportSize(WIDE);
  await emulateMediaFeatures(page, [
    ["prefers-reduced-motion", "no-preference"],
    ["prefers-reduced-transparency", "no-preference"],
    ["prefers-contrast", "no-preference"],
  ]);
  const shell = await mount(<AppShellTrackDoorsStory />);
  await landDoorsStory(shell, page);
  // BOTH docked is the state the compound door is about — and the state the #242 squeeze exists in.
  await driveDoor(shell, page, "Show details");
  await expect(page.locator('.shell-panel[data-panel-side="context"]')).toHaveAttribute("data-panel-mode", "docked");

  for (const leg of ["Enter focus mode", "Exit focus mode"] as const) {
    const census = await driveDoor(shell, page, leg);
    expect(census.samples.length, `the rAF sampler must have run on "${leg}" — an empty ring proves nothing`).toBeGreaterThan(2);
    assertDoorHeld(census, leg, FOCUS_DOOR_BOXES);
  }
});

// THE OWNER'S OWN APPEARANCE (#2442 A1-3 measured the 37px residual there; #2456 owes the same matrix).
// At `--font-scale: 1.25` the reading cap binds while a pane is docked and stops binding once it is not —
// the MIXED regime, which is where the old percentage-derived counter could not tell `P = W` from
// `P >> W`. The distances read the shell's own track arithmetic now, so the same assertions hold.
//
// AT 1680, NOT AT 1280, AND THAT IS A RENDERED FACT RATHER THAN A CONVENIENCE. At rem 20 every shell
// dimension grows with the root font: 1280 puts `--content-primacy-deficit` at 20px, which is the shell's
// own crossover — the CONTEXT pane resolves to an auto-OVERLAY there and occupies no track at all, so
// there is no context door to measure (measured: `Show details` changes `.shell-main`'s width by zero and
// this test's own barrier times out). 1680 clears the crossover while KEEPING the regime this arm is for:
// the content column is 1207px with only the list docked and 790px with both, against a 1008px cap — the
// cap binding on one side of the toggle and not the other. The LIST door's own rem-20 mixed arm is at
// 1280 and is owned by the #2442 fontScale test above, which still runs it.
const WIDE_REM20 = { width: 1680, height: 900 };

test("#2456 both doors hold their boxes at rem 20, where the reading cap binds on one side only", async ({ mount, page }) => {
  await page.setViewportSize(WIDE_REM20);
  await emulateMediaFeatures(page, [
    ["prefers-reduced-motion", "no-preference"],
    ["prefers-reduced-transparency", "no-preference"],
    ["prefers-contrast", "no-preference"],
  ]);
  await routeTrpc(page, {
    ...SHELL_AMBIENT_ROUTES,
    "settings.getUserSettings": () => ({
      userId: "user_ct_shell_doors_scale",
      schemaVersion: 1,
      config: { ...DEFAULT_USER_SETTINGS, appearance: { ...DEFAULT_USER_SETTINGS.appearance, fontScale: 1.25 } },
      updatedAt: 0,
    }),
  });
  const shell = await mount(<AppShellTrackDoorsStory />);
  await landDoorsStory(shell, page);
  await expect
    .poll(() => page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize)), { intervals: [20, 50, 100] })
    .toBeCloseTo(UA_ROOT_PX * 1.25, 0);

  // THE REGIME PREMISE: the context pane must really DOCK here. Above the crossover it resolves to an
  // auto-overlay, which occupies no track — every corridor would be a point and the whole arm vacuous.
  const contextPane = page.locator('.shell-panel[data-panel-side="context"]');
  assertDoorHeld(await driveDoor(shell, page, "Show details"), "Show details @rem20", CONTEXT_DOOR_BOXES);
  await expect(contextPane).toHaveAttribute("data-panel-mode", "docked");

  for (const leg of ["Hide details", "Show details", "Enter focus mode", "Exit focus mode"] as const) {
    const boxes = leg.includes("details") ? CONTEXT_DOOR_BOXES : FOCUS_DOOR_BOXES;
    const census = await driveDoor(shell, page, leg);
    expect(census.samples.length, `the rAF sampler must have run on "${leg}" at rem 20`).toBeGreaterThan(2);
    assertDoorHeld(census, `${leg} @rem20`, boxes);
  }
});

// THE COARSE-POINTER ARM. The doors are width-driven, not pointer-driven, so this is a FENCE rather than a
// defect proof — what it is for is the regression where a touch-only rule (the ≥44px topbar floors) changes
// the trail's intrinsic width and the END-pinned counter's premise with it.
test.describe("#2456 the shell doors on a coarse pointer", () => {
  test.use({ hasTouch: true });

  test("#2456 every door still holds its boxes with touch emulation on", async ({ mount, page }) => {
    await page.setViewportSize(WIDE);
    await emulateMediaFeatures(page, [
      ["prefers-reduced-motion", "no-preference"],
      ["prefers-reduced-transparency", "no-preference"],
      ["prefers-contrast", "no-preference"],
    ]);
    // PROBE FIRST: a fine-pointer context would make this a duplicate of the tests above.
    const coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
    expect(coarse, "hasTouch must flip the coarse-pointer branch — otherwise this arm measures nothing new").toBe(true);
    const shell = await mount(<AppShellTrackDoorsStory />);
    await landDoorsStory(shell, page);

    for (const leg of ["Show details", "Hide details", "Hide list panel", "Show list panel"] as const) {
      const boxes = leg.includes("details") ? CONTEXT_DOOR_BOXES : LIST_DOOR_BOXES;
      const census = await driveDoor(shell, page, leg);
      expect(census.samples.length, `the rAF sampler must have run on "${leg}" at coarse`).toBeGreaterThan(2);
      assertDoorHeld(census, `${leg} @coarse`, boxes);
    }
  });
});

// ── #2474: THE COLLAPSING LIST PANE KEEPS THE WIDTH IT HAD ───────────────────────────────────────────
// The #2463 census found it and #2456 left it STATED: a collapsing LIST pane swapped its docked (squeezed)
// width for the unsqueezed `--panel-w` in the same frame its exit transition started — the box GREW 35px at
// 1280x800 as it began to leave. The pane is anchored to the rail, so that change lands on its TRAILING
// edge, which is why the whole `DOOR_BOXES` census above is blind to it: every other number there is an `x`,
// and this pane's `x` is correct throughout. The ring now carries `listPanelWidth` for exactly that reason.
//
// THE DEFECT IS A WIDTH, SO THE FIX IS NOT A COUNTER-TRANSLATE. Nothing can cancel a reflow from outside
// (shell.css says so for the band's action, one box over); what CAN be done is to stop making the change at
// that moment — the exiting pane holds `--list-collapsed-w-was` and the regime change happens after the
// animation, off-screen. Against the unmodified shell.css the first leg below reports 307 against a 272
// rest on its first flipped frame.

/** The FLIP's contract for the LIST pane's own WIDTH: the frame the track resized in still shows the width
 *  the pane had, and nothing afterwards leaves the corridor between the two resting widths. */
function assertListPaneWidthHeld(census: { rest: Record<string, number>; samples: Record<string, number>[]; end: Record<string, number> }, leg: string): void {
  const { rest, samples, end } = census;
  const ring = samples.map((sample) => sample["listPanelWidth"]).join(" ");
  const restWidth: number | undefined = rest["mainWidth"];
  const flipIndex = samples.findIndex((sample) => Math.abs((sample["mainWidth"] ?? Number.NaN) - (restWidth ?? Number.NaN)) > 2);
  expect(flipIndex, `the ring must contain the frame the track resized in on "${leg}" — pane widths ${ring}`).toBeGreaterThan(-1);
  // The annotations are load-bearing for the same reason the `restWidth` one above is: `noUncheckedIndexedAccess`
  // makes these `number | undefined` for tsc while biome's own type service does not model the flag and calls
  // the coalesce unreachable. Stating the type makes the two agree.
  const restPaneRead: number | undefined = rest["listPanelWidth"];
  const endPaneRead: number | undefined = end["listPanelWidth"];
  const restPane = restPaneRead ?? Number.NaN;
  const endPane = endPaneRead ?? Number.NaN;
  expect(
    Math.abs((samples[flipIndex]?.["listPanelWidth"] ?? Number.NaN) - restPane),
    `the LIST pane changed WIDTH on the first painted frame of "${leg}" (rest ${restPane}, frame ${samples[flipIndex]?.["listPanelWidth"]}) — ring ${ring}`,
  ).toBeLessThanOrEqual(2);
  const low = Math.min(restPane, endPane) - 2;
  const high = Math.max(restPane, endPane) + 2;
  const strays = samples
    .slice(flipIndex)
    .map((sample) => sample["listPanelWidth"] ?? Number.NaN)
    .filter((width) => width < low || width > high);
  expect(strays, `the LIST pane left its ${low}…${high} width corridor on "${leg}": ${strays.join(", ")} — ring ${ring}`).toEqual([]);
}

/** `--panel-w` resolved to REAL px by the engine (it is a `round()` expression, so `parseFloat` of the
 *  custom property's own computed value is NaN). The probe is absolute so it moves no geometry. */
function panelClampPx(page: Page): Promise<number> {
  return page.locator(".shell-grid").evaluate((grid: HTMLElement) => {
    const probe = grid.ownerDocument.createElement("div");
    probe.style.position = "absolute";
    probe.style.paddingTop = "var(--panel-w)";
    grid.append(probe);
    const px = Number.parseFloat(getComputedStyle(probe).paddingTop);
    probe.remove();
    return px;
  });
}

test("#2474 a collapsing LIST pane keeps its squeezed width for the whole exit, and re-enters at it", async ({ mount, page }) => {
  await page.setViewportSize(WIDE);
  await emulateMediaFeatures(page, [
    ["prefers-reduced-motion", "no-preference"],
    ["prefers-reduced-transparency", "no-preference"],
    ["prefers-contrast", "no-preference"],
  ]);
  const shell = await mount(<AppShellTrackDoorsStory />);
  await landDoorsStory(shell, page);
  // BOTH DOCKED is the state this is about: with only the list docked its track IS the clamp, the pane's
  // width never changes across the door, and every assertion below would be a fence over a point.
  await driveDoor(shell, page, "Show details");
  await expect(page.locator('.shell-panel[data-panel-side="context"]')).toHaveAttribute("data-panel-mode", "docked");

  // THE NON-VACUITY PREMISE, MEASURED RATHER THAN ASSUMED: the docked pane must really be narrower than the
  // clamp it used to swap to, or there is no width step for this arm to catch.
  const clamp = await panelClampPx(page);
  const docked = (await readDoorBoxes(page))["listPanelWidth"] ?? Number.NaN;
  expect(docked, `the #242 squeeze must be live here (pane ${docked} vs clamp ${clamp}) or this arm is a fence`).toBeLessThan(clamp - 2);

  for (const leg of ["Hide list panel", "Show list panel"] as const) {
    const census = await driveDoor(shell, page, leg);
    assertListPaneWidthHeld(census, leg);
    // …and the pane's ENTRANCE CORNER is the same fix's other half: it reads the width the collapsed pane
    // RESTED at, so docking from a squeezed layout no longer starts a whole squeeze too far out.
    assertDoorHeld(census, leg, LIST_DOOR_BOXES);
  }
});

// THE OWNER'S OWN APPEARANCE, and a `rem`-based media query cannot see it: every shell dimension grows with
// the root font, so the squeeze, the clamp and the crossover all move together at `--font-scale: 1.25`.
// 1680 for the same reason the #2456 rem-20 arm uses it — at 1280 the context pane resolves to an overlay
// and there is no both-docked layout to leave.
test("#2474 the exit width holds at rem 20, where the clamp and the squeeze have both moved", async ({ mount, page }) => {
  await page.setViewportSize(WIDE_REM20);
  await emulateMediaFeatures(page, [
    ["prefers-reduced-motion", "no-preference"],
    ["prefers-reduced-transparency", "no-preference"],
    ["prefers-contrast", "no-preference"],
  ]);
  await routeTrpc(page, {
    ...SHELL_AMBIENT_ROUTES,
    "settings.getUserSettings": () => ({
      userId: "user_ct_shell_list_exit_scale",
      schemaVersion: 1,
      config: { ...DEFAULT_USER_SETTINGS, appearance: { ...DEFAULT_USER_SETTINGS.appearance, fontScale: 1.25 } },
      updatedAt: 0,
    }),
  });
  const shell = await mount(<AppShellTrackDoorsStory />);
  await landDoorsStory(shell, page);
  await expect
    .poll(() => page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize)), { intervals: [20, 50, 100] })
    .toBeCloseTo(UA_ROOT_PX * 1.25, 0);
  await driveDoor(shell, page, "Show details");
  await expect(page.locator('.shell-panel[data-panel-side="context"]')).toHaveAttribute("data-panel-mode", "docked");

  const clamp = await panelClampPx(page);
  const docked = (await readDoorBoxes(page))["listPanelWidth"] ?? Number.NaN;
  expect(docked, `the squeeze must be live at rem 20 (pane ${docked} vs clamp ${clamp}) or this arm is a fence`).toBeLessThan(clamp - 2);

  for (const leg of ["Hide list panel", "Show list panel", "Enter focus mode"] as const) {
    assertListPaneWidthHeld(await driveDoor(shell, page, leg), `${leg} @rem20`);
  }
});

// THE COARSE ARM. The doors are width-driven rather than pointer-driven, so this is a FENCE — for the
// regression where a touch-only floor changes an intrinsic width and with it the premise the hold rests on.
test.describe("#2474 the list pane's exit width on a coarse pointer", () => {
  test.use({ hasTouch: true });

  test("#2474 the collapsing pane holds its width with touch emulation on", async ({ mount, page }) => {
    await page.setViewportSize(WIDE);
    await emulateMediaFeatures(page, [
      ["prefers-reduced-motion", "no-preference"],
      ["prefers-reduced-transparency", "no-preference"],
      ["prefers-contrast", "no-preference"],
    ]);
    const coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
    expect(coarse, "hasTouch must flip the coarse-pointer branch — otherwise this arm measures nothing new").toBe(true);
    const shell = await mount(<AppShellTrackDoorsStory />);
    await landDoorsStory(shell, page);
    await driveDoor(shell, page, "Show details");

    for (const leg of ["Hide list panel", "Show list panel"] as const) {
      assertListPaneWidthHeld(await driveDoor(shell, page, leg), `${leg} @coarse`);
    }
  });
});

// ── #2456: THE ATTRIBUTES ARE TRANSIENT ──────────────────────────────────────────────────────────────
// THE DEFECT PROOF for the half of #2456 that is not geometry. `use-shell-track-flip.ts` used to SET
// `data-list-flip` and never remove it, which was invisible while the list was the only animated track —
// and made a SECOND track impossible, because `animation` does not compose across two matching rules: a
// rule keyed on a permanently-present attribute wins the cascade forever and deletes the other track's
// motion (dock-R measured exactly that: after any context flip, list-undock cut 440 -> 56 in one frame).
// Against the unmodified hook this test is red on its very first assertion.
test("#2456 no flip attribute outlives its animation, on any door", async ({ mount, page }) => {
  await page.setViewportSize(WIDE);
  await emulateMediaFeatures(page, [
    ["prefers-reduced-motion", "no-preference"],
    ["prefers-reduced-transparency", "no-preference"],
    ["prefers-contrast", "no-preference"],
  ]);
  const shell = await mount(<AppShellTrackDoorsStory />);
  const grid = page.locator(".shell-grid");
  await landDoorsStory(shell, page);

  for (const leg of ["Show details", "Hide details", "Hide list panel", "Show list panel"] as const) {
    await driveDoor(shell, page, leg);
    // The release rides `animationend`, which fires a frame before the attribute drop lands in the DOM —
    // poll rather than read once, and read BOTH attributes so a half-release cannot pass.
    await expect
      .poll(() => grid.evaluate((el) => [el.getAttribute("data-list-flip"), el.getAttribute("data-context-flip")].filter((v) => v !== null)), {
        intervals: [16, 32, 64, 128],
      })
      .toEqual([]);
  }
});

// …AND A SECOND TOGGLE MID-ANIMATION RESTARTS RATHER THAN FREEZING.
//
// HONEST LABEL: a FENCE, not a defect proof. It PASSES against the unmodified source (measured
// 2026-09-19), because there the CONTEXT door starts no animation at all and the second click therefore
// restarts a fresh one by itself. What it exists for is the regression this grammar makes possible:
// with ONE animation name per element, a second stamp that does not force the match-state transition
// leaves the FIRST door's animation running and the second door's contribution never appears.
//
// With one animation NAME per element
// there is no name change to restart on any more, so the hook removes the attributes, forces one style
// read and re-stamps. Without that, the second door's contribution never appears and the element finishes
// the FIRST door's animation — which looks exactly like a freeze. Two toggles inside ~100ms, and the
// shell must still land on the geometry the second one asked for.
test("#2456 a second door opened mid-animation restarts the FLIP instead of freezing it", async ({ mount, page }) => {
  await page.setViewportSize(WIDE);
  await emulateMediaFeatures(page, [
    ["prefers-reduced-motion", "no-preference"],
    ["prefers-reduced-transparency", "no-preference"],
    ["prefers-contrast", "no-preference"],
  ]);
  const shell = await mount(<AppShellTrackDoorsStory />);
  await landDoorsStory(shell, page);
  const settled = await readDoorBoxes(page);

  // Door one, then door two one frame later — no settle barrier between them, which is the whole point.
  await shell.getByRole("button", { name: "Show details" }).click();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await shell.getByRole("button", { name: "Hide list panel" }).click();

  // THE RESTART: the second stamp must produce a FRESH animation on `.shell-main`. A `currentTime` still
  // climbing from the first door's start would be the freeze this test is named for.
  const currentTime = await page.locator(".shell-main").evaluate((el) => el.getAnimations().map((a) => Number(a.currentTime ?? 0)));
  expect(currentTime.length, "a restart must leave exactly one live animation on .shell-main").toBe(1);
  expect(currentTime[0] ?? Number.NaN, `the FLIP must have restarted, not continued — currentTime ${String(currentTime[0])}`).toBeLessThan(80);

  await waitForDoorToSettle(page);
  const after = await readDoorBoxes(page);
  // The shell lands where BOTH doors asked: the list track gone and the context track present, i.e. the
  // content column starts at the rail and is narrower than it was with the list docked and no context.
  await expect(page.locator('.shell-panel[data-panel-side="list"]')).toHaveAttribute("data-panel-mode", "collapsed");
  await expect(page.locator('.shell-panel[data-panel-side="context"]')).toHaveAttribute("data-panel-mode", "docked");
  expect(after["main"], `.shell-main must settle at the rail — before ${settled["main"]}, after ${after["main"]}`).toBeLessThan(settled["main"] ?? 0);
  expect(after["mainWidth"], "the content column must have lost the context track").toBeLessThan((settled["mainWidth"] ?? 0) + (settled["main"] ?? 0));
});

// ── #2456: THE REDUCED-MOTION SETTLE COVERS THE CONTEXT DOOR TOO ─────────────────────────────────────
// #262 gave the LIST door a one-frame hold instead of a FLIP for users who asked for less motion. The
// CONTEXT door had neither — with motion off OR on it simply cut. Same arms as the #151 pair above: no
// animation may be armed, and the shell must settle within one frame rather than animate.
//
// HONEST LABEL: a FENCE, not a defect proof. It PASSES against the unmodified source (measured
// 2026-09-19) for the wrong reason — there the context door arms nothing under ANY motion preference. It
// earns its place as the guard that the new context arm never becomes motion for a user who switched
// motion off, which is the #151 ruling this lane is closest to re-opening.
test("#2456 with motion off the CONTEXT door settles in one frame and arms no animation", async ({ mount, page }) => {
  await page.setViewportSize(WIDE);
  await emulateMediaFeatures(page, [
    ["prefers-reduced-motion", "reduce"],
    ["prefers-reduced-transparency", "no-preference"],
    ["prefers-contrast", "no-preference"],
  ]);
  const shell = await mount(<AppShellTrackDoorsStory />);
  const grid = page.locator(".shell-grid");
  await landDoorsStory(shell, page);
  await recordShellFlipStarts(page);

  await shell.getByRole("button", { name: "Show details" }).click();
  await expect(page.locator('.shell-panel[data-panel-side="context"]')).toHaveAttribute("data-panel-mode", "docked");
  expect(await grid.getAttribute("data-context-flip"), "no FLIP may be armed with motion off").toBeNull();
  expect(await readShellFlipStarts(page), "no shell FLIP animation may START with motion off").toEqual([]);
  // The SETTLE is released after exactly one painted frame — so it is gone by the time the shell is idle.
  await expect.poll(() => grid.getAttribute("data-context-settle"), { intervals: [16, 32, 64, 128] }).toBeNull();

  await emulateMediaFeatures(page, [
    ["prefers-reduced-motion", "no-preference"],
    ["prefers-reduced-transparency", "no-preference"],
    ["prefers-contrast", "no-preference"],
  ]);
});

// ── #2456: NO FLIP ON A PHONE means the CONTEXT pane too ─────────────────────────────────────────────
// HONEST LABEL: a FENCE. It PASSES against the unmodified source (measured 2026-09-19 — with no context
// rule to cancel, the pane trivially reports `animation-name: none`), so it cannot be the receipt for
// anything; it is the guard that the cancel follows the rule, which is exactly the pairing #2442 caught
// one pane over.
// The #2442 twin, one pane over and prevented rather than paid for: the phone's context sheet enters on
// its own `transform` transition (measured gliding 390 -> 0 over twelve frames), so the new docked
// entrance keyframe would COMPOSE with it — `translate` and `transform` are separate properties that ADD —
// and the sheet would enter from two widths out, exactly the defect #2442 measured on the list pane.
test("#2456 the phone arm cancels BOTH tracks' FLIP rules, panels included", async ({ mount, page }) => {
  await page.setViewportSize(MOBILE);
  await mount(<AppShellTrackDoorsStory />);
  // PLANTED, not driven: the mobile block is a CSS cancel, and stamping the attribute is the only way to
  // ask "would the rule have matched" on a regime where the hook's own stamp moves nothing.
  await page.locator(".shell-grid").evaluate((el) => {
    el.setAttribute("data-context-flip", "in");
    el.setAttribute("data-list-flip", "in");
  });
  const names = await page
    .locator('.shell-main, .shell-topbar-trail, .shell-panel[data-panel-side="list"], .shell-panel[data-panel-side="context"]')
    .evaluateAll((els) => els.map((el) => getComputedStyle(el).animationName));
  expect(names.length, "all four boxes must be present on the mobile shell").toBe(4);
  expect(names, `mobile must cancel every FLIP rule, got ${names.join(" / ")}`).toEqual(["none", "none", "none", "none"]);
});

// ── #262: skipping the FLIP was right; letting the RAW SHIFT through was the unexamined half ────────
// The #151 fix above stopped ARMING the FLIP under reduced motion — correct, a FLIP is a motion mechanism
// — and the track then just resized in one frame. That is a real, recorded layout shift, and it lands on
// exactly the users who asked for less motion: the former perf meter's `--goto <section>` on the merged tree
// (2026-08-19, live main WITH the #257 reduced-motion floor) measured presets 0.2032 · characters 0.2333 ·
// corpus 0.2295 on the reduced-motion arm against 0.0112 · 0.0038 · 0 with motion on, and analytics — the
// one section whose swap changes no LIST track — 0 on both. Source attribution, single entry, single node:
// `div.shell-main`, x 56→363 (`reports/perf-meter/scls-*`).
//
// THE FIX IS NOT A FLIP. `data-list-settle` holds `.shell-main` at its OLD column for exactly ONE painted
// frame — no duration, no easing, no interpolation, nothing to perceive as movement — and the release is a
// transform change, which the browser does not score. So the swap still reads as one instant cut (the
// reduced-motion contract) and the cut stops being scored as instability.
//
// THIS IS THE DEFECT PROOF, not a fence: run against the pre-#262 hook it measures ~0.2 here (recorded red
// before the fix: 0.2295 on this mount — the live corpus number to four places), and the < 0.1 CWV
// ceiling is the issue's own done bar.
// `hadRecentInput` is deliberately NOT filtered, for the reason the sibling shift test states: a click
// drives this swap, so the field metric would drop every entry and the assertion would pass against a
// fully broken shell.
test("#262 reduced motion: the section swap records no meaningful layout shift", async ({ mount, page }) => {
  await page.setViewportSize(WIDE);
  await emulateMediaFeatures(page, [
    ["prefers-reduced-motion", "reduce"],
    ["prefers-reduced-transparency", "no-preference"],
    ["prefers-contrast", "no-preference"],
  ]);
  const shell = await mount(<AppShellStory />);
  const listPanel = page.locator('.shell-panel[data-panel-side="list"]');
  const main = page.locator(".shell-main");
  await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");

  const readX = (): Promise<number> => main.evaluate((el) => Math.round(el.getBoundingClientRect().x));
  const startX = await readX();
  // Installed AFTER the mount settles, so boot/data-arrival shifts are never attributed to the swap.
  await page.evaluate(() => {
    // @orb-waive no-test-fabrication(unknown): a browser-context probe slot, written and read in this test alone. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const bag = globalThis as unknown as { __settleShift: number };
    bag.__settleShift = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        bag.__settleShift += (entry as PerformanceEntry & { value: number }).value;
      }
    }).observe({ type: "layout-shift" });
  });

  // Home is the one section declaring NO list pane, so the track genuinely disappears — the same swap the
  // #151 pair drives, and the one perf-meter scores in the other direction.
  await shell.getByRole("button", { name: "Home" }).click();
  await expect(listPanel).not.toHaveAttribute("data-panel-mode", "docked");
  // BARRIER ON THE SETTLED COLUMN, never on the mode attribute: the settle holds the OLD x for a frame by
  // design, so a total read before `.shell-main` reaches its new column would judge a swap still in flight.
  await expect.poll(readX).not.toBe(startX);
  const endX = await readX();
  expect(Math.abs(endX - startX), `the track must really change — start ${startX}, end ${endX}`).toBeGreaterThan(100);

  // Then two more frames plus the observer's own delivery hop, so the entry this test exists to catch has
  // certainly landed. A bare `expect.poll(<total>).toBeLessThan(0.1)` would pass on its FIRST read against a
  // fully broken shell, because the total starts at 0 — the pass must not be a race the assertion can win.
  await page.evaluate(
    async () =>
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 100)));
      }),
  );
  // @orb-waive no-test-fabrication(unknown): reads back the probe slot installed above. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  const total = await page.evaluate(() => (globalThis as unknown as { __settleShift: number }).__settleShift);
  expect(total, `the reduced-motion swap must stay inside the CWV budget — scored ${total}`).toBeLessThan(0.1);

  // Hand the page back in the file's baseline media state — the overrides outlive this test.
  await emulateMediaFeatures(page, [
    ["prefers-reduced-motion", "no-preference"],
    ["prefers-reduced-transparency", "no-preference"],
    ["prefers-contrast", "no-preference"],
  ]);
});

// ── #176 (the FULL-MOTION half of the same sighting): the swap captures the CONTENT PANE, not the page ─
// `withViewTransition` captured the UA's default `root` name — the whole document — so
// `::view-transition-old(root)` was a frozen full-viewport image of the OLD page painted over the live
// one for the transition's whole duration. The shell's chrome does not stay put across this swap (home
// declares no LIST pane, chats does), so the frozen copy and the live one disagreed by a panel width:
// MEASURED per-frame on the live stack 2026-08-18 (every running animation paused and seeked, then
// photographed) at t=100ms of home→chats the frame carried TWO topbars — two ⌘K chips, two bells, the old
// "Home" title over the new list band. The fix names exactly one region (`.shell-content`) and opts the
// document root OUT of capture — see shell.css "THE VIEW TRANSITION IS SCOPED TO THE CONTENT PANE".
//
// THIS IS A DEFECT PROOF, NOT A FENCE: it reads the browser's OWN compositor state (which
// `::view-transition-*` pseudo-elements the UA built for this transition) and is red against the old
// stylesheet, which builds `(root)` and no `(orb-section-content)`. What it deliberately does NOT claim
// is the PIXEL verdict — a CT cannot photograph a mid-transition frame without racing the compositor, so
// the two-headers receipt is the live per-frame capture cited above, and this pins the mechanism that
// produced it. Observed at `transition.ready` (plus one frame later), which is the one instant the API
// makes deterministic — a rAF sampler would race a 220ms window.
test("#176 full motion: the section swap captures the CONTENT pane only — the document root is never snapshotted", async ({ mount, page }) => {
  await page.setViewportSize(WIDE);
  await emulateMediaFeatures(page, [
    ["prefers-reduced-motion", "no-preference"],
    ["prefers-reduced-transparency", "no-preference"],
    ["prefers-contrast", "no-preference"],
  ]);
  await page.addInitScript(() => {
    // @orb-waive no-test-fabrication(unknown): a browser-context probe slot, written and read in this test alone. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const bag = globalThis as unknown as { __vtNames: string[] };
    bag.__vtNames = [];
    const original = document.startViewTransition.bind(document);
    const record = (): void => {
      for (const animation of document.getAnimations()) {
        // `pseudoElement` lives on KeyframeEffect, not on the AnimationEffect base — a UA-generated
        // view-transition animation is a KeyframeEffect whose pseudoElement names its ::view-transition-*.
        const effect = animation.effect;
        const pseudo = effect instanceof KeyframeEffect ? effect.pseudoElement : null;
        if (pseudo !== null && pseudo.startsWith("::view-transition") && !bag.__vtNames.includes(pseudo)) {
          bag.__vtNames.push(pseudo);
        }
      }
    };
    document.startViewTransition = (callbackOptions?: StartViewTransitionOptions | ViewTransitionUpdateCallback): ViewTransition => {
      const transition = original(callbackOptions);
      transition.ready
        .then(() => {
          record();
          requestAnimationFrame(record);
        })
        .catch(() => undefined);
      return transition;
    };
  });
  await page.reload();

  const shell = await mount(<AppShellStory />);
  const grid = page.locator(".shell-grid");
  await expect(page.locator('.shell-panel[data-panel-side="list"]')).toHaveAttribute("data-panel-mode", "docked");

  // The reported repro, both ways: chats→home drops the LIST track, home→chats brings it back. Each leg
  // is barriered on the SETTLED section attribute, never on a mid-flight state.
  await shell.getByRole("button", { name: "Home" }).click();
  await expect(grid).toHaveAttribute("data-section", "home");
  await shell.getByRole("button", { name: "Chats" }).click();
  await expect(grid).toHaveAttribute("data-section", "chats");
  // …and one deeper swap, whose content pane is a different subtree again.
  await shell.getByRole("button", { name: "Characters" }).click();
  await expect(grid).toHaveAttribute("data-section", "characters");

  // Read ONCE (never poll a shared array — a poll drains the samples it is judging).
  // @orb-waive no-test-fabrication(unknown): reads back the probe slot installed above. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  const names = await page.evaluate(() => (globalThis as unknown as { __vtNames: string[] }).__vtNames);
  expect(names.length, "the swap must actually run a View Transition under full motion — an empty probe proves nothing").toBeGreaterThan(0);
  expect(
    names.filter((name) => name.includes("(root)")),
    `the document root must not be captured, or its frozen snapshot paints the old chrome over the new — got ${names.join(", ")}`,
  ).toEqual([]);
  expect(names, "the content pane must be the captured region — the swap still has to animate").toContain("::view-transition-group(orb-section-content)");
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
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "chat.getChat": { participants: [ROOM_HUMAN_SEAT], background: ROOM_BACKGROUND } });
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
    // @orb-waive no-test-fabrication(unknown): a browser-context globals bag, declared and read in this test alone. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
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
    // @orb-waive no-test-fabrication(unknown): reads back the same probe-only slot on the PAGE global (see the capture above). Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    page.evaluate(() => (globalThis as unknown as { __bootGrid: { cols: string; list: string | null } | null }).__bootGrid);

  // The capture is written ONCE (the observer disconnects) — poll until it lands, then read it settled.
  // The mode attribute is on the element AT INSERTION, not stamped by a later effect.
  await expect.poll(async () => (await readBoot())?.list ?? null, { intervals: [20, 50, 100] }).toBe("docked");
  const boot = await readBoot();
  // rail | LIST | content | context — the LIST track is already the resolved panel width, never 0px.
  // Settled snapshot: `__bootGrid` is written once at `.shell-grid` insertion and never again (the observer
  // disconnects); the poll above already awaited it, so this read is provably settled.
  const bootTracks = (boot?.cols ?? "").split(" ").map((t) => Number.parseFloat(t));
  // Settled snapshot: derived from the settled one-shot capture above, not a live DOM read.
  expect(bootTracks).toHaveLength(4);
  // Settled snapshot: same settled capture.
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

// ── #242: THE CONDITIONAL BOTH-DOCKED SQUEEZE (owner-ruled off the #240 fork) ───────────────────────
// With both panels docked the CONTENT track is what is left of the viewport, and at a normal desktop it
// lands under the transcript's reading floor (measured at 1360: 569.6px, 55.3 real characters per line —
// #213 found it and could not fix it from inside the pane). The ruled arm is a shell-grid one: the panes
// give up slack, conditionally. These pin the three properties that make it a DERIVATION rather than a
// breakpoint, all read off the browser's own resolved `grid-template-columns`:
//   1. WHERE IT BINDS — both docked at 1360: the content track reaches the floor token, and neither pane
//      is pushed past its own floor (list: the shared 17rem; context: the 24rem Waystone step, the
//      inherited 660b2dd4 ruling this split exists to keep);
//   2. WHERE IT DOES NOT — a viewport wide enough that the floor already fits is BYTE-IDENTICAL to the
//      plain clamps (the non-vacuity control for "conditional": 24vw / 30vw, un-squeezed);
//   3. IT IS BOTH-DOCKED ONLY — with the context pane collapsed the list track is its plain clamp, so a
//      single docked pane never pays for a deficit it is not causing.
const SQUEEZE_BINDS = { width: 1360, height: 900 };
const SQUEEZE_CLEAR = { width: 1600, height: 900 };
const BOTH_DOCKED_SHELL_STATE = JSON.stringify({
  state: { activeSection: "chats", panelOverrides: { chats: { list: "docked", context: "docked" } } },
  version: 2,
});
/** rail | list | content | context, in px, off the real grid — the only reading that proves a CSS `max()`
 *  resolved the way the sheet claims (the tracks are `calc()`s of `clamp()`s of viewport units). */
async function shellTracks(page: Page): Promise<readonly number[]> {
  const cols = await page.locator(".shell-grid").evaluate((el) => getComputedStyle(el).gridTemplateColumns);
  return cols.split(" ").map((t) => Number.parseFloat(t));
}
/** A `rem` token off the live root font-size — the squeeze's floors are rem, so the assertions must be
 *  too (they scale with appearance.fontScale by construction). */
function remPx(rem: number): number {
  return rem * UA_ROOT_PX;
}

test("#242 both docked at 1360: the content track reaches the reading floor, and neither pane goes past its own floor", async ({ mount, page }) => {
  await page.setViewportSize(SQUEEZE_BINDS);
  await page.addInitScript({
    content: `try { localStorage.setItem("orb:shell", ${JSON.stringify(BOTH_DOCKED_SHELL_STATE)}); } catch { /* storage disabled */ }`,
  });
  await page.reload();
  await mount(<AppShellStory />);
  await expect(page.locator('.shell-panel[data-panel-side="list"]')).toHaveAttribute("data-panel-mode", "docked");
  await expect(page.locator('.shell-panel[data-panel-side="context"]')).toHaveAttribute("data-panel-mode", "docked");

  const [rail = 0, list = 0, content = 0, context = 0] = await shellTracks(page);
  // THE RULED OUTCOME: the content track meets the floor (40rem = 640px), up from the 569.6px the same
  // viewport produced before the squeeze — the +70px the CT's reading-line measurement asked for.
  expect(content).toBeGreaterThanOrEqual(remPx(40) - 1);
  expect(rail + list + content + context).toBeCloseTo(SQUEEZE_BINDS.width, 0);
  // …bought out of BOTH panes, neither past its floor. The context floor is the Waystone container step:
  // 660b2dd4 widened this pane so a standard desktop REACHES 24rem, and #242 does not spend that.
  expect(list).toBeGreaterThanOrEqual(remPx(17));
  expect(list).toBeLessThan(0.24 * SQUEEZE_BINDS.width);
  expect(context).toBeGreaterThanOrEqual(remPx(24));
  expect(context).toBeLessThan(0.3 * SQUEEZE_BINDS.width);
});

test("#242 a viewport where the floor already fits is BYTE-IDENTICAL — the squeeze is conditional, not a resize", async ({ mount, page }) => {
  await page.setViewportSize(SQUEEZE_CLEAR);
  await page.addInitScript({
    content: `try { localStorage.setItem("orb:shell", ${JSON.stringify(BOTH_DOCKED_SHELL_STATE)}); } catch { /* storage disabled */ }`,
  });
  await page.reload();
  await mount(<AppShellStory />);
  await expect(page.locator('.shell-panel[data-panel-side="context"]')).toHaveAttribute("data-panel-mode", "docked");

  const [, list = 0, content = 0, context = 0] = await shellTracks(page);
  // The plain clamps: 24vw = 384 (under the 26rem cap) and 30vw = 480 (AT the 30rem cap). Nothing moved.
  expect(list).toBeCloseTo(0.24 * SQUEEZE_CLEAR.width, 0);
  expect(context).toBeCloseTo(remPx(30), 0);
  // …because there was no deficit to answer: the content track already clears the floor on its own.
  expect(content).toBeGreaterThan(remPx(40));
});

test("#242 the FLIP distance survives the squeeze: --list-track-docked is stable across the list toggle it describes", async ({ mount, page }) => {
  // The panel-push keyframes translate `.shell-main` by `--list-track-docked`, and they are sampled AFTER
  // the mode attribute flips — so if that var moved with the list's own mode, the `out` arm would cancel
  // the wrong distance and leave the recorded shift the FLIP exists to erase (up to ~49px here). It is
  // gated on the CONTEXT pane's mode for exactly this reason; this is that property, measured.
  await page.setViewportSize(SQUEEZE_BINDS);
  await page.addInitScript({
    content: `try { localStorage.setItem("orb:shell", ${JSON.stringify(BOTH_DOCKED_SHELL_STATE)}); } catch { /* storage disabled */ }`,
  });
  await page.reload();
  const shell = await mount(<AppShellStory />);
  const grid = page.locator(".shell-grid");
  // RESOLVED, not read: an unregistered custom property's computed value is the token STREAM
  // (`max(17rem, calc(clamp(…) - …))` — verified live), so the only way to learn the length the keyframe
  // will translate by is to make the browser lay a box out at it, exactly as the keyframe does.
  const flipDistance = (): Promise<number> =>
    grid.evaluate((el) => {
      const probe = document.createElement("div");
      probe.style.position = "absolute";
      probe.style.visibility = "hidden";
      probe.style.width = "var(--list-track-docked)";
      el.append(probe);
      const px = probe.getBoundingClientRect().width;
      probe.remove();
      return px;
    });

  const docked = await flipDistance();
  const [, listTrack = 0] = await shellTracks(page);
  // It IS the track it claims to describe (the squeezed width, not the clamp).
  expect(docked).toBeCloseTo(listTrack, 0);
  expect(docked).toBeLessThan(0.24 * SQUEEZE_BINDS.width);

  // …and it does not move when the list undocks — the state the `out` keyframe reads it in.
  await shell.getByRole("button", { name: LIST_TOGGLE_RE }).click();
  await expect(page.locator('.shell-panel[data-panel-side="list"]')).toHaveAttribute("data-panel-mode", "collapsed");
  expect(await flipDistance()).toBeCloseTo(docked, 0);
});

test("#242 the squeeze is BOTH-DOCKED only: with the context pane collapsed the list track is its plain clamp", async ({ mount, page }) => {
  await page.setViewportSize(SQUEEZE_BINDS);
  await mount(<AppShellStory />);
  // Chats' own defaults are LIST docked · CONTEXT collapsed — the state most readers are in.
  await expect(page.locator('.shell-panel[data-panel-side="list"]')).toHaveAttribute("data-panel-mode", "docked");
  await expect(page.locator('.shell-panel[data-panel-side="context"]')).toHaveAttribute("data-panel-mode", "collapsed");
  const [, list = 0, , context = 0] = await shellTracks(page);
  expect(list).toBeCloseTo(0.24 * SQUEEZE_BINDS.width, 0);
  expect(context).toBe(0);
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
/** THE PANE'S GLASS SUBJECT MOVED ONE LEVEL DOWN (#1154) — every assertion in this file is byte-identical,
 *  only the BOX it is asked of changed. `backdrop-filter` on `.shell-panel` made the whole pane one
 *  composited layer, which turns OFF per-paint baseline snapping for its entire subtree
 *  (integer-line-boxes.md Law 3/4: driven Characters measured nine off-grid text nodes, every one
 *  attributed to that aside), so both glass declarations moved onto a `::before` fill layer and the pane's
 *  own fill went transparent. A pseudo cannot be a `Locator`, so the three computed-style readers below
 *  take an optional pseudo instead — and ONLY the glass-emitting cases pass one: below the shell breakpoint
 *  (#135) and with the glass off, the pane still owns its own opaque fill and the pane is the right box. */
interface GlassBox {
  readonly host: Locator;
  readonly pseudo: string;
}

/** TWO SURFACES SHARE IT since #1173: `.shell-panel` (#1154) and `.shell-main`'s reading-surface glass,
 *  which is the same Law 3/4 defect one surface over and took the same carrier. Hence the name is the
 *  MECHANISM (`glassCarrier`), not the pane it was first written for. */
function glassCarrier(surface: Locator): GlassBox {
  return { host: surface, pseudo: "::before" };
}

function boxOf(target: Locator | GlassBox): { readonly host: Locator; readonly pseudo: string | null } {
  return "host" in target ? target : { host: target, pseudo: null };
}

function bgAlpha(target: Locator | GlassBox): Promise<number> {
  const { host, pseudo } = boxOf(target);
  return host.evaluate((el, p: string | null) => {
    const bg = getComputedStyle(el, p).backgroundColor;
    // This arrow body is serialized into a page.evaluate() browser closure — it can't reference a
    // module-level const (evaluate ships only the function's own source, no outer-scope capture).
    const slashMatch = bg.match(/\/\s*([\d.]+)\s*\)$/u);
    if (slashMatch !== null) {
      return Number(slashMatch[1]);
    }
    if (bg.startsWith("rgba(") || bg.startsWith("hsla(")) {
      const commaMatch = bg.match(/,\s*([\d.]+)\s*\)$/u);
      return commaMatch !== null ? Number(commaMatch[1]) : 1;
    }
    return 1;
  }, pseudo);
}

function backdropFilterOf(target: Locator | GlassBox): Promise<string> {
  const { host, pseudo } = boxOf(target);
  return host.evaluate((el, p: string | null) => getComputedStyle(el, p).backdropFilter, pseudo);
}

function filterOf(locator: Locator): Promise<string> {
  return locator.evaluate((el) => getComputedStyle(el).filter);
}

test("baseline (flat, no glass, no bg-image): surfaces are opaque, no backdrop-filter", async ({ mount }) => {
  const shell = await mount(<ShellCascadeFixture />);
  await expect.poll(() => bgAlpha(shell.getByTestId("panel-probe")), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => bgAlpha(shell.getByTestId("main-probe")), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => bgAlpha(shell.getByTestId("topbar-probe")), { intervals: [20, 50, 100] }).toBe(1);
  // Asked of the pane's glass CARRIER (#1154), which is where a backdrop-filter can now exist at all —
  // asking the pane would be trivially true on any tree and prove nothing.
  await expect.poll(() => backdropFilterOf(glassCarrier(shell.getByTestId("panel-probe"))), { intervals: [20, 50, 100] }).toBe("none");
});

test("Surface glow has one valid painted carrier without turning Surface into a box", async ({ mount }) => {
  const glowing = await mount(<ShellCascadeFixture elevation="glow" />);
  const root = glowing.locator('[data-slot="surface-root"]');
  await expect(root).toHaveCSS("display", "contents");
  await expect(root).toHaveCSS("border-top-width", "0px");
  await expect(root).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(root).toHaveCSS("border-top-left-radius", "0px");
  await expect.poll(() => filterOf(glowing.getByTestId("surface-carrier")), { intervals: [20, 50, 100] }).not.toBe("none");
});

test("flat Surface carrier keeps no glow filter", async ({ mount }) => {
  const flat = await mount(<ShellCascadeFixture elevation="flat" />);
  await expect.poll(() => filterOf(flat.getByTestId("surface-carrier")), { intervals: [20, 50, 100] }).toBe("none");
});

test("glass beats elevation: ramp + blur-panels still leaves .shell-panel translucent", async ({ mount }) => {
  const shell = await mount(<ShellCascadeFixture elevation="ramp" blurSurfaces={["panels"]} />);
  const panel = shell.getByTestId("panel-probe");
  // THE BUG: shell.css's un-:where()'d elevation rule used to out-specificity globals.css's glass
  // rule, so the panel painted the OPAQUE --color-surface-raised elevation fill instead of the
  // translucent glass mix even with blur-panels on. This is the exact assertion that regression flips —
  // and it still is after #1154: the glass rule that has to beat ramp on the PANE is now the one taking
  // the pane's fill to `transparent`, so ramp winning would read as alpha 1 here exactly as it always did.
  await expect.poll(() => bgAlpha(panel), { intervals: [20, 50, 100] }).toBeLessThan(1);
  const glass = glassCarrier(panel);
  await expect.poll(() => bgAlpha(glass), { intervals: [20, 50, 100] }).toBeLessThan(1);
  await expect.poll(() => backdropFilterOf(glass), { intervals: [20, 50, 100] }).toContain("blur(");
  await expect.poll(() => backdropFilterOf(glass), { intervals: [20, 50, 100] }).toContain("saturate(");
});

// ── #1120 · A CLOSED PANE PAYS FOR NO GLASS, AND THE TRACK LANDS ON THE PIXEL GRID ─────────────────
// side-eye HOME 2026-09-02 H3/H4. Home declares BOTH panes `"unavailable"`, and the ruled mechanism for
// that (owner decision H3 / arm L-b, `section-registry.ts`) is that the panel still renders and resolves
// `collapsed` — its track is already zero-width and the topbar offers no toggle. What was never ruled is
// that the off-screen box keeps its `backdrop-filter`: measured on the live app, home's two inert,
// aria-hidden, 80-byte asides were the ONLY two backdrop-filter elements on the page — the most expensive
// paint primitive in the browser, twice, blurring nothing, on the surface whose whole job is to appear
// instantly. It is not a home fact either: every section pays it for whichever pane it leaves closed.
//
// AND IT IS THE SAME FINDING TWICE. design-audit filed P2 `promoted-layer-offset` on that node in 7 of 10
// arms — "this element promotes itself to its own composited layer (backdrop-filter), which disables text
// snapping … lands −0.188 device px off the grid" — plus P3 `off-grid-transform` on its resting
// `matrix(1, 0, 0, 1, -363.188, 0)`. The promotion dies with the glass; the 0.188 is a SECOND cause
// (`24vw` of 1280 is 307.1875) and dies with the track rounding, which is why both are pinned here.
//
// THE POSITIVE CONTROLS ARE THE POINT: the DOCKED case below is the collapsed case's control (one axis
// apart on one fixture — without it, "no backdrop-filter" would also pass on a tree where the glass rule
// had simply been deleted), and an UNROUNDED probe on the raw `--dimension-panel` token is the grid
// assertion's (without it, "integral" would also pass at a viewport that happens to divide evenly). The
// two glass arms are separate tests because a CT mount owns its container — two mounts in one test throw
// "a container that already has a React root".
const OFF_GRID_VIEWPORTS = [1280, 1440, 1920] as const;

test("#1120 a COLLAPSED pane carries no backdrop-filter", async ({ mount }) => {
  const shell = await mount(<ShellCascadeFixture blurSurfaces={["panels"]} panelMode="collapsed" />);
  await expect.poll(() => backdropFilterOf(glassCarrier(shell.getByTestId("panel-probe"))), { intervals: [20, 50, 100] }).toBe("none");
  await expect.poll(() => backdropFilterOf(glassCarrier(shell.getByTestId("context-panel-probe"))), { intervals: [20, 50, 100] }).toBe("none");
});

test("#1120 …and an OPEN pane still does — the collapsed arm's control", async ({ mount }) => {
  const open = await mount(<ShellCascadeFixture blurSurfaces={["panels"]} panelMode="docked" />);
  await expect.poll(() => backdropFilterOf(glassCarrier(open.getByTestId("panel-probe"))), { intervals: [20, 50, 100] }).toContain("blur(");
  await expect.poll(() => backdropFilterOf(glassCarrier(open.getByTestId("context-panel-probe"))), { intervals: [20, 50, 100] }).toContain("saturate(");
});

// ── #1154 · THE PANE IS NOT THE PROMOTED LAYER — ITS GLASS IS, ONE BOX DOWN ────────────────────────
// The founding defect of docs/design/integer-line-boxes.md and the reason Law 4 exists: `backdrop-filter`
// on `.shell-panel` rasterizes the pane ONCE at its own sub-pixel position, so per-paint baseline snapping
// is off for every glyph inside it. Driven Characters measured `off-grid-text candidates=54 judged=33
// affected=9` with all nine attributed to `aside.shell-panel`, and half of them are unfixable by layout —
// the band's count span starts at 155.406px because that is the advance of the title run before it.
//
// THIS IS THE MECHANISM PIN, not a restatement of #1120's. It asserts the pane carries NONE of the three
// promotion shapes Law 3 names (backdrop-filter, a non-`auto` will-change, a 3D context — the exact set
// `ui-audit/ops/walker/census-grid.ts` walks ancestors for), WHILE the glass is on and painting. Its
// control is the line below it: the carrier must be promoted, or "the pane is not promoted" would also
// pass on a tree where the glass had simply stopped being emitted. Red-first against the unmodified
// source: the pane reports `blur(14px) saturate(1.4)` there — which is exactly what #1120's own OPEN-pane
// control asserted of the pane before this moved.
test("#1154 the pane carries none of Law 3's promotion shapes while its glass carrier carries the blur", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const shell = await mount(<ShellCascadeFixture blurSurfaces={["panels"]} panelMode="docked" />);
  const pane = shell.getByTestId("panel-probe");

  const promotion = await pane.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      backdrop: style.backdropFilter,
      threeD: style.transformStyle === "preserve-3d" || style.transform.startsWith("matrix3d"),
      willChange: style.willChange,
    };
  });
  expect(promotion, "any of these three makes every glyph in the pane inherit the layer's sub-pixel offset").toMatchObject({
    backdrop: "none",
    threeD: false,
    willChange: "auto",
  });
  // THE CONTROL — the glass is on and painting, one box down.
  await expect.poll(() => backdropFilterOf(glassCarrier(pane)), { intervals: [20, 50, 100] }).toContain("blur(");
});

test("#1120 the shell's panel tracks resolve to whole CSS pixels at every width — with the raw token as the control", async ({ mount, page }) => {
  const shell = await mount(<ShellCascadeFixture />);
  const grid = shell.getByTestId("shell-grid");

  const rows: string[] = [];
  const fractional: string[] = [];
  let controlSawAFraction = false;
  for (const width of OFF_GRID_VIEWPORTS) {
    await page.setViewportSize({ width, height: 900 });
    const cell = await grid.evaluate((host) => {
      // A probe per expression: an unregistered custom property's COMPUTED value is the substituted token
      // stream (`round(var(--dimension-panel), 1px)`), not a length — so the only way to read what the
      // track actually resolves to is to lay a box out with it.
      const measure = (expression: string): number => {
        const probe = host.ownerDocument.createElement("div");
        probe.style.inlineSize = expression;
        host.append(probe);
        const width_ = probe.getBoundingClientRect().width;
        probe.remove();
        return width_;
      };
      return { list: measure("var(--panel-w)"), context: measure("var(--panel-context-w)"), raw: measure("var(--dimension-panel)") };
    });
    rows.push(`${String(width)}\tlist ${cell.list.toFixed(4)}\tcontext ${cell.context.toFixed(4)}\traw token ${cell.raw.toFixed(4)}`);
    for (const [side, resolved] of [
      ["list", cell.list],
      ["context", cell.context],
    ] as const) {
      if (!Number.isInteger(resolved)) {
        fractional.push(`${String(width)}: the ${side} track resolved ${resolved.toFixed(4)}px — off the device-pixel grid at DPR 1`);
      }
    }
    if (!Number.isInteger(cell.raw)) {
      controlSawAFraction = true;
    }
  }
  console.info(`\n#1120 shell panel track resolution (px)\n${rows.join("\n")}\n`);
  // The PLANTED CONTROL: the raw token is what the tracks used to name, and it is fractional at these
  // widths. If it ever comes back integral everywhere, this test proves nothing and must say so.
  expect(controlSawAFraction, "the unrounded token is integral at every probed width — this test can no longer detect the defect it pins").toBe(true);
  expect(fractional, fractional.join("\n")).toEqual([]);
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
  // The pane's CARRIER is the node a glass rule would paint down here (#1154) — asking the pane itself
  // could no longer fail.
  await expect.poll(() => backdropFilterOf(glassCarrier(panel)), { intervals: [20, 50, 100] }).toBe("none");
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
  const glass = glassCarrier(shell.getByTestId("panel-probe"));
  await expect.poll(() => backdropFilterOf(glass), { intervals: [20, 50, 100] }).toContain("blur(");
  await expect.poll(() => bgAlpha(glass), { intervals: [20, 50, 100] }).toBeLessThan(1);
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

/** The node the glass block actually PAINTS for a probe. Four of the five surfaces are painted on the slot
 *  itself; the pane's is painted on its `::before` glass carrier (#1154 — see `glassCarrier`). Routing it
 *  here keeps both loops below a single census over the same five surfaces, with every assertion unchanged. */
function glassSubjectOf(shell: Locator, probe: (typeof GLASS_PROBES)[number]): Locator | GlassBox {
  const node = shell.getByTestId(probe);
  return probe === "panel-probe" ? glassCarrier(node) : node;
}

test("reduced-transparency turns every glass surface SOLID (alpha 1) and drops backdrop-filter", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await emulateReducedTransparency(page, "reduce");
  const shell = await mount(<ShellCascadeFixture blurSurfaces={ALL_BLUR_SURFACES} />);
  await Promise.all(
    GLASS_PROBES.map(async (probe) => {
      // THE BUG: `revert` resolved each of these to rgba(0,0,0,0) — a stated preference for LESS
      // transparency produced surfaces with none of their own paint at all.
      await expect.poll(() => bgAlpha(glassSubjectOf(shell, probe)), { intervals: [20, 50, 100] }).toBe(1);
      await expect.poll(() => backdropFilterOf(glassSubjectOf(shell, probe)), { intervals: [20, 50, 100] }).toBe("none");
    }),
  );
});

test("the same fixture under no-preference still gets the glass — reduce is a preference, not a kill", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await emulateReducedTransparency(page, "no-preference");
  const shell = await mount(<ShellCascadeFixture blurSurfaces={ALL_BLUR_SURFACES} />);
  const glass = glassCarrier(shell.getByTestId("panel-probe"));
  await expect.poll(() => bgAlpha(glass), { intervals: [20, 50, 100] }).toBeLessThan(1);
  await expect.poll(() => backdropFilterOf(glass), { intervals: [20, 50, 100] }).toContain("blur(");
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
  //
  // ASKED OF THE CARRIER since #1173 — byte-identical assertions, one box down. `.shell-main` itself now
  // paints `background: none` whenever the glass rule fires, so asking IT for an opaque fill would read
  // the absence of a fill as a failure of the preference.
  await expect.poll(() => bgAlpha(glassCarrier(shell.getByTestId("main-probe"))), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => backdropFilterOf(glassCarrier(shell.getByTestId("main-probe"))), { intervals: [20, 50, 100] }).toBe("none");
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

function bgColorOf(target: Locator | GlassBox): Promise<string> {
  const { host, pseudo } = boxOf(target);
  return host.evaluate((el, p: string | null) => getComputedStyle(el, p).backgroundColor, pseudo);
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
  await expect
    .poll(async () =>
      page.evaluate(() => ({
        more: matchMedia("(prefers-contrast: more)").matches,
        high: matchMedia("(prefers-contrast: high)").matches,
        noPreference: matchMedia("(prefers-contrast: no-preference)").matches,
      })),
    )
    .toStrictEqual({ more: true, high: false, noPreference: false });
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
  const panel = glassCarrier(shell.getByTestId("panel-probe"));
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
  await expect.poll(() => bgAlpha(glassCarrier(panel)), { intervals: [20, 50, 100] }).toBeLessThan(CONTRAST_FILL_ALPHA);
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
      await expect.poll(() => bgAlpha(glassSubjectOf(shell, probe)), { intervals: [20, 50, 100] }).toBe(1);
      await expect.poll(() => backdropFilterOf(glassSubjectOf(shell, probe)), { intervals: [20, 50, 100] }).toBe("none");
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

// BOTH READ `.shell-grid` BY ITS TESTID, never the mount root. The grain rule's host is
// `html[data-texture="grain"] .shell-grid::after`, and these used to pass the mount-result locator — which
// worked only for as long as the fixture's single root element HAPPENED to be the grid. #623 gave the fixture
// a portalled sibling (production's dialog home), and the pair immediately showed the hazard: the `more` arm
// went red against the mount container's absent `::after`, while its `no-preference` twin kept PASSING —
// vacuously, on the same absent pseudo-element. Naming the host is the honest read either way.
test("contrast: more drops the grain overlay (a noise texture works against a stated contrast preference)", async ({ mount, page }) => {
  await emulateContrast(page, "more");
  const shell = await mount(<ShellCascadeFixture surfaceTexture="grain" />);
  await expect.poll(() => afterDisplayOf(shell.getByTestId("shell-grid")), { intervals: [20, 50, 100] }).toBe("none");
});

test("under contrast: no-preference the same grain overlay still paints — the drop is the preference's doing", async ({ mount, page }) => {
  await emulateContrast(page, "no-preference");
  const shell = await mount(<ShellCascadeFixture surfaceTexture="grain" />);
  await expect.poll(() => afterDisplayOf(shell.getByTestId("shell-grid")), { intervals: [20, 50, 100] }).not.toBe("none");
});

// ── #435: ONE grain layer per pixel ────────────────────────────────────────────────────────────────
// The ratified host is the WHOLE shell (`.shell-grid::after`), so an in-shell card that ALSO painted its
// own arm composed the film twice over exactly the card's pixels. `content` is the honest read here, not
// `opacity`: the fix suppresses the pseudo-element outright, and a suppressed pseudo still reports the
// inherited/initial opacity, so an opacity assertion would pass on the double-painting tree too.
function afterContentOf(probe: Locator): Promise<string> {
  return probe.evaluate((el) => getComputedStyle(el, "::after").content);
}

test("grain: an in-shell card does NOT paint its own second layer (the whole-shell ::after already covers it)", async ({ mount, page }) => {
  await emulateContrast(page, "no-preference");
  await mount(<GrainDoublePaintFixture />);
  await expect.poll(() => afterContentOf(page.getByTestId("in-shell-card")), { intervals: [20, 50, 100] }).toBe("none");
  // …while the grid's own layer is the one still painting over that card.
  await expect.poll(() => afterDisplayOf(page.getByTestId("grain-shell-grid")), { intervals: [20, 50, 100] }).not.toBe("none");
});

test("grain: a card OUTSIDE the shell grid keeps its own arm — a portalled dialog has no other carrier", async ({ mount, page }) => {
  await emulateContrast(page, "no-preference");
  await mount(<GrainDoublePaintFixture />);
  const outside = page.getByTestId("outside-shell-card");
  await expect.poll(() => afterContentOf(outside), { intervals: [20, 50, 100] }).not.toBe("none");
  await expect.poll(() => outside.evaluate((el) => getComputedStyle(el, "::after").opacity), { intervals: [20, 50, 100] }).toBe("0.04");
});

/** Luminance standard deviation over a screenshot REGION, decoded in-browser (the `samplePixel` technique
 *  below, widened from one pixel). Grain is PAINT — a `background-image` noise tile composited through
 *  `mix-blend-mode: soft-light` — so computed style can report each authored layer but never how many of
 *  them landed. The film's amplitude IS the spread of the pixels around a flat fill, which makes stddev
 *  the direct measure of "how many grain layers is this surface wearing". */
async function regionNoiseStdDev(page: Page, box: { x: number; y: number; width: number; height: number }): Promise<number> {
  // fullPage: `.shell-grid` is a viewport-tall grid, so the out-of-shell probe (its sibling, standing in
  // for a portalled card) lays out BELOW the fold and a viewport-clipped screenshot refuses the region.
  const clip = await page.screenshot({ clip: box, fullPage: true });
  const dataUrl = `data:image/png;base64,${clip.toString("base64")}`;
  return await page.evaluate(async (url: string) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    if (ctx === null) {
      throw new Error("no 2d context");
    }
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, img.width, img.height);
    const values: number[] = [];
    for (let i = 0; i < data.length; i += 4) {
      values.push(0.2126 * (data[i] ?? 0) + 0.7152 * (data[i + 1] ?? 0) + 0.0722 * (data[i + 2] ?? 0));
    }
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length);
  }, dataUrl);
}

test("grain: the in-shell card wears exactly ONE film by framebuffer, the same as the out-of-shell card", async ({ mount, page }) => {
  await emulateContrast(page, "no-preference");
  await mount(<GrainDoublePaintFixture />);
  const inShell = await page.getByTestId("in-shell-card").boundingBox();
  const outside = await page.getByTestId("outside-shell-card").boundingBox();
  if (inShell === null || outside === null) {
    throw new Error("grain probes did not lay out");
  }
  // Both probes are the SAME flat fill at the SAME size, so the out-of-shell card is this test's own
  // one-layer control — a ratio, not an absolute, survives any future change to the opacity token.
  const [inside, control] = [await regionNoiseStdDev(page, inShell), await regionNoiseStdDev(page, outside)];
  test.info().annotations.push({ description: `in-shell=${inside.toFixed(3)} outside=${control.toFixed(3)}`, type: "grain-stddev" });
  // Positive control FIRST: a zero-noise read means the screenshot never saw the film (the `/grain.svg`
  // 404 the CT harness used to serve did exactly that — playwright-ct.config.ts's publicDir), which would
  // make the ratio below pass 0/0-style on a tree that double-paints. Measured one-layer control ≈ 0.405.
  expect(control).toBeGreaterThan(0.2);
  // Red-first receipt (#435, this file's own pins run against the pre-fix globals.css): in-shell 0.810 vs
  // outside 0.405 — the second film, exactly doubling the amplitude. Post-fix: 0.405 vs 0.405.
  expect(inside / control).toBeLessThan(1.25);
});

test("grain: texture=none paints nothing on either card (the suppression is not what makes the in-shell card bare)", async ({ mount, page }) => {
  await emulateContrast(page, "no-preference");
  await mount(<GrainDoublePaintFixture surfaceTexture="none" />);
  await expect.poll(() => afterContentOf(page.getByTestId("outside-shell-card")), { intervals: [20, 50, 100] }).toBe("none");
  await expect.poll(() => afterContentOf(page.getByTestId("grain-shell-grid")), { intervals: [20, 50, 100] }).toBe("none");
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
  await expect.poll(() => bgAlpha(glassCarrier(shell.getByTestId("panel-probe"))), { intervals: [20, 50, 100] }).toBeCloseTo(CONTRAST_FILL_ALPHA, 2);
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
  // The reading surface's glass moved onto its own `::before` carrier at #1173 (the #1154 mechanism, one
  // surface over) — same two assertions, asked of the box that now paints them.
  const main = glassCarrier(shell.getByTestId("main-probe"));
  await expect.poll(() => bgAlpha(main), { intervals: [20, 50, 100] }).toBeLessThan(1);
  await expect.poll(() => bgAlpha(main), { intervals: [20, 50, 100] }).toBeGreaterThan(0);
  await expect.poll(() => backdropFilterOf(main), { intervals: [20, 50, 100] }).toContain("blur(");
  // …and the pane it belongs to paints NO fill of its own, so the composite is exactly one tint over one
  // filtered backdrop — the byte-identity clause of the carrier move.
  await expect.poll(() => bgAlpha(shell.getByTestId("main-probe")), { intervals: [20, 50, 100] }).toBe(0);
});

// ── #1173 · THE READING SURFACE IS NOT THE PROMOTED LAYER EITHER ──────────────────────────────────
// The #1154 mechanism pin, one surface over. `.shell-main` promotes (`backdrop-filter`) and it CONTAINS
// the reading column's text, which is Law 3/4 exactly (integer-line-boxes.md §10/§11): the layer is
// rasterized once at its own sub-pixel offset, so per-paint baseline snapping is off for every glyph in
// the content column. It escaped #1154's own measurement only because the audited arm (Characters) carried
// no wallpaper and this rule is gated on `[data-has-bg-image]` — the fixture below supplies exactly that.
//
// Red-first against the unmodified source: `.shell-main` reports `blur(14px) saturate(1.4)` there, which
// is what the panel-parity test above asserted OF THE PANE before this moved. The control is the same one
// #1154 uses — the carrier must be painting, or "the surface is not promoted" would also pass on a tree
// where the glass had simply stopped being emitted.
test("#1173 the reading surface carries none of Law 3's promotion shapes while its glass carrier carries the blur", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const shell = await mount(<ShellCascadeFixture blurSurfaces={["panels"]} hasBgImage={true} section="characters" />);
  const main = shell.getByTestId("main-probe");

  const promotion = await main.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      backdrop: style.backdropFilter,
      threeD: style.transformStyle === "preserve-3d" || style.transform.startsWith("matrix3d"),
      willChange: style.willChange,
    };
  });
  expect(promotion, "any of these three makes every glyph in the reading column inherit the layer's sub-pixel offset").toMatchObject({
    backdrop: "none",
    threeD: false,
    willChange: "auto",
  });
  // THE CONTROL — the glass is on and painting, one box down.
  await expect.poll(() => backdropFilterOf(glassCarrier(main)), { intervals: [20, 50, 100] }).toContain("blur(");
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
  await expect.poll(async () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--font-scale").trim())).toBe("1.25");
});

// ── chatWidthPct / fontScale root vars — through the REAL AppShell (§11.1), not the bare fixture ──
// `useAppearance()` reads the synced `getUserSettings` blob (routeTrpc-stubbed here) — this exercises
// the actual production stamping path (app-shell.tsx's `--width-shell-content` inline style +
// `useAppearanceRootEffects`'s `--font-scale`), not a re-implementation of the clamp/scale formulas.

// The one browser-default constant this file leans on (no token exists for it — same precedent as
// avatar.ct.tsx's ROOT_PX): the UA root font-size before any `:root { font-size }` override.
const UA_ROOT_PX = 16;

test("chatWidthPct stamps a real rendered max-width on a --width-shell-content consumer", async ({ mount, page }) => {
  const chatWidthPct = 90; // clear of the clamp's 46.125rem floor at any CT viewport ≥ 820px wide (#1204).
  await routeTrpc(page, {
    ...SHELL_AMBIENT_ROUTES,
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
  const expectedPx = (chatWidthPct / 100) * viewportWidth;
  await expect.poll(async () => shell.getByTestId("width-probe").evaluate((el) => Number.parseFloat(getComputedStyle(el).maxWidth))).toBeCloseTo(expectedPx, 0);
});

// ── #1204: THE DIAL'S WIDTH MATRIX — a point measurement never proves a range property ──────────────
//
// The test above proves ONE point of the clamp (the viewport term, at a percentage chosen to clear the
// floor). `--width-shell-content` is `clamp(--dimension-shell-content-floor, <chatWidthPct>dvw, 100dvw)`,
// which is three regimes, and the one that had been WRONG since Geist landed was the FLOOR — a `680px`
// literal in app-shell.tsx that no skin could hold 65 `ch` at (#1204). So the matrix walks all three
// against the SAME dial position: below the crossover the floor term wins, AT the crossover the two terms
// are equal and the hand-over is continuous (no step), above it the viewport term wins.
//
// EVERY EXPECTATION IS THE RESOLVED TOKEN, never a hardcoded 738: the floor is a rem token, so a
// fontScale or a token retune must move the assertion with it, not red it. The non-vacuity is structural —
// the three viewports straddle the crossover, so no single value can satisfy all three rows.
//
// WHAT THIS DOES NOT PIN is the reading LINE at that floor: the line is what survives the transcript row's
// gutter and the active skin's insets, which this stage has no transcript to measure. That half is
// `tests/client/features/chat/chat-room-track.suite.ct.tsx`'s `#1204` loop, over flat AND echo.
const DIAL_MATRIX_PCT = 50;

async function dialFloorPx(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.style.width = "var(--dimension-shell-content-floor)";
    document.body.append(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width;
  });
}

test("#1204 the chat-width dial's clamp: the floor binds below the crossover, hands over AT it, and yields above it", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...SHELL_AMBIENT_ROUTES,
    "settings.getUserSettings": () => ({
      userId: "user_ct_shell_dial_matrix",
      schemaVersion: 1,
      config: { ...DEFAULT_USER_SETTINGS, appearance: { ...DEFAULT_USER_SETTINGS.appearance, chatWidthPct: DIAL_MATRIX_PCT } },
      updatedAt: 0,
    }),
  });
  const shell = await mount(<AppShellWidthProbeStory />);
  const readProbe = async (): Promise<number> => await shell.getByTestId("width-probe").evaluate((el) => Number.parseFloat(getComputedStyle(el).maxWidth));

  const floorPx = await dialFloorPx(page);
  expect(floorPx).toBeGreaterThan(0);
  // The crossover is where the reader's own percentage first reaches the floor. Derived from the token,
  // so it moves with it — the whole point of taking the floor out of the feature as a literal.
  const crossoverWidth = Math.round((floorPx * 100) / DIAL_MATRIX_PCT);

  // 1. BELOW: the dvw term is short of the floor, so the floor is what the reader gets — the regime the
  //    #1204 defect lived in, where the narrowest dial position must still be a readable line.
  await page.setViewportSize({ width: crossoverWidth - 200, height: 900 });
  await expect.poll(readProbe).toBeCloseTo(floorPx, 0);

  // 2. AT the crossover: both terms resolve to the same width, so the hand-over is continuous. A floor
  //    that did not agree with the viewport term here would step the thread's width under the reader.
  await page.setViewportSize({ width: crossoverWidth, height: 900 });
  await expect.poll(readProbe).toBeCloseTo(floorPx, 0);
  await expect.poll(readProbe).toBeCloseTo((crossoverWidth * DIAL_MATRIX_PCT) / 100, 0);

  // 3. ABOVE: the reader's percentage owns the width again and the floor is inert — the clamp is a floor,
  //    not a fixed width, and a regression that pinned the track at the floor would red exactly here.
  const wide = crossoverWidth + 400;
  await page.setViewportSize({ width: wide, height: 900 });
  await expect.poll(readProbe).toBeCloseTo((wide * DIAL_MATRIX_PCT) / 100, 0);
  expect((wide * DIAL_MATRIX_PCT) / 100).toBeGreaterThan(floorPx);
});

test("fontScale stamps a real rendered <html> font-size (UA root × fontScale)", async ({ mount, page }) => {
  const fontScale = 1.25;
  await routeTrpc(page, {
    ...SHELL_AMBIENT_ROUTES,
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

// ── #188 P2-4 — the app's own reduced-motion pref must REACH the surfaces outside the shell grid ─────
// The `[data-reduced-motion="true"] *` floor (@orb/ui globals.css) is a DESCENDANT selector, so wherever
// the app stamps that flag decides what it can silence. Stamped on `.shell-grid` it silenced the sections
// and missed everything mounted beside the router or portalled to <body>: the boot veil, the route-pending
// brand shimmer, the toaster, every popup. Measured on home before the fix — with the in-app toggle ON the
// loader still ran its keyframe and dropped 67-83ms frames; only the OS media query ever stopped it.
//
// The probe is a `.orb-weave-shimmer` element appended to <body>, i.e. exactly the DOM POSITION the boot
// veil and route-pending occupy (main.tsx mounts them above the router, outside the grid). The in-grid
// twin is the control: it proves the floor rule itself is live in this harness, so an out-of-grid zero
// cannot be read as "the stylesheet never loaded".
const SHIMMER_CLASS = "orb-weave-shimmer";
/** The reduced-motion floor writes `animation-duration: 0.01ms`; the unfloored shimmer runs at
 *  `--motion-breathe` (whole seconds). 1ms sits three orders of magnitude below the live value and above
 *  any rounding the computed-style serializer applies to 0.01ms — a threshold, not a pixel guess. */
const FLOORED_ANIMATION_S = 0.001;

test("#188 the app's reduced-motion pref floors an animation OUTSIDE the shell grid (the boot-veil position)", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...SHELL_AMBIENT_ROUTES,
    "settings.getUserSettings": () => ({
      userId: "user_ct_shell_reduced_motion",
      schemaVersion: 1,
      config: {
        ...DEFAULT_USER_SETTINGS,
        appearance: { ...DEFAULT_USER_SETTINGS.appearance, reducedMotion: true },
      },
      updatedAt: 0,
    }),
  });
  await mount(<AppShellStory />);

  const durations = async (): Promise<{ outside: number; inside: number }> =>
    page.evaluate((shimmerClass) => {
      const read = (host: Element): number => {
        const probe = document.createElement("div");
        probe.className = shimmerClass;
        host.append(probe);
        const seconds = Number.parseFloat(getComputedStyle(probe).animationDuration);
        probe.remove();
        return seconds;
      };
      const grid = document.querySelector(".shell-grid");
      return { outside: read(document.body), inside: grid === null ? Number.NaN : read(grid) };
    }, SHIMMER_CLASS);

  // The CONTROL first: inside the grid the floor has always applied, so a live rule is proven here.
  await expect.poll(async () => (await durations()).inside, { intervals: [20, 50, 100] }).toBeLessThanOrEqual(FLOORED_ANIMATION_S);
  // The FINDING: the same pref must reach the boot veil's position. Before the fix this measured
  // `--motion-breathe` (seconds), because <body> is not a descendant of `.shell-grid`.
  await expect.poll(async () => (await durations()).outside, { intervals: [20, 50, 100] }).toBeLessThanOrEqual(FLOORED_ANIMATION_S);
});

// ── #188 N-1 — the pref must be answered at BOOT, not ~1.2s into it ──────────────────────────────────
// `data-reduced-motion` can only be right once `settings.getUserSettings` resolves, and the boot veil
// weaves + drops frames a beat before that — so the app's own reduced-motion setting loses the boot race
// on every visit. The fix persists the last authoritative answer per device and replays it before React
// mounts (`main.tsx` → `stampAppearanceBootHint`), which only holds if the shell's own stamp does not
// CLOBBER it back to the schema default while the read is still in flight. That clobber is what these
// pin, at the seam a CT can actually see: the settings read is HELD open (`trpcHold`), so "unresolved"
// is an indefinitely stable rendered state, never a flash.
const REDUCED_MOTION_ATTR = "data-reduced-motion";
/** The device-local boot hint's blob (`createPersistedStore("appearance-boot")`, legacy/unbound key).
 *  The store carries all four boot axes since #231; this arm only ever asserts the motion one. */
const REDUCED_MOTION_HINT_BLOB = JSON.stringify({ state: { reducedMotion: true, fontScale: 1, density: "comfortable", dataTheme: null }, version: 1 });

test("#188 a device that remembers reducedMotion=ON keeps the flag stamped while getUserSettings is still in flight", async ({ mount, page }) => {
  await page.addInitScript({
    content: `try { localStorage.setItem("orb:appearance-boot", ${JSON.stringify(REDUCED_MOTION_HINT_BLOB)}); } catch { /* storage disabled */ }`,
  });
  await page.reload();
  const settings = trpcHold();
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "settings.getUserSettings": settings });
  await mount(<AppShellStory />);
  // The barrier is the HELD request, not a timer: past this the shell has mounted and its root effect has
  // run with an unresolved read, which is exactly the window the boot veil animates in.
  await settings.requested;
  await expect
    .poll(async () => page.evaluate((attr) => document.documentElement.getAttribute(attr), REDUCED_MOTION_ATTR), { intervals: [20, 50, 100] })
    .toBe("true");
});

test("#188 CONTROL: a device with NO hint is not stamped ON by the pending read — the pref is remembered, never guessed", async ({ mount, page }) => {
  const settings = trpcHold();
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "settings.getUserSettings": settings });
  await mount(<AppShellStory />);
  await settings.requested;
  await expect
    .poll(async () => page.evaluate((attr) => document.documentElement.getAttribute(attr), REDUCED_MOTION_ATTR), { intervals: [20, 50, 100] })
    .not.toBe("true");
});

// ── #188 N-8 — WCAG 2.5.3 Label in Name, read the way axe reads it ───────────────────────────────────
// The prior ruling on this chip (§13.10, in app-shell.tsx) put the WORD "jump" in the name so the one
// word on the button was speakable. axe's `label-content-name-mismatch` still failed it on the live
// landing (Lighthouse, 2026-08-18): 2.5.3 wants the WHOLE visible label inside the name, and this
// button's visible label is the chip plus the word. The pin reads the rendered text rather than
// restating it, so a copy change on either side cannot drift them apart silently.
test("#188 the ⌘K chip's accessible name CONTAINS its visible label verbatim (WCAG 2.5.3)", async ({ mount, page }) => {
  await page.setViewportSize(WIDE);
  await mount(<AppShellStory />);
  const chip = page.locator('header.shell-topbar [data-slot="button"]').filter({ hasText: "jump" }).first();
  // `textContent`, NOT `innerText` (side-eye rail-home P3-3, 2026-08-22). This pin used to read `innerText`
  // and passed while the live surface FAILED the same audit: `innerText` is layout-aware and inserts a line
  // break between two flex items, so it normalised to "⌘K jump" whichever way the DOM was built. axe reads
  // the visible label by CONCATENATING the node's text, i.e. `textContent` — which was the literal string
  // "⌘Kjump", not a substring of the name. The pin now reads it the way the audit does, so the separating
  // text node between the <kbd> chip and the word is load-bearing and its removal is RED here.
  const readConcatenatedAtAssertion = async (): Promise<typeof concatenated> =>
    (await chip.evaluate((el) => el.textContent ?? "")).replaceAll(/\s+/gu, " ").trim();
  const concatenated = (await chip.evaluate((el) => el.textContent ?? "")).replaceAll(/\s+/gu, " ").trim();
  await expect.poll(async () => await readConcatenatedAtAssertion()).toBe("⌘K jump");
  await expect(chip).toHaveAccessibleName(new RegExp(`^${concatenated.replaceAll("⌘", "\\u2318")}`, "u"));
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
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "chat.listChats": chatListResponder([]), "character.list": { items: [], nextCursor: null } });
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
  // …AND THE SECTION'S DECLARATION IS PUBLISHED, not merely obeyed (#1122). An unavailable pane and a
  // merely-collapsed one render the SAME `data-panel-mode="collapsed"`, so every probe outside React could
  // only guess between them: `agent-nav/panel-request.ts` inferred it from a write that failed to land
  // ("the active section LIKELY declares no pane" — it READS this attribute now and refuses without
  // hedging, #1149), and design-audit's SURFACE-AXIS census had to call a
  // structurally-unreachable mode WITHHELD — publishing three NO-VERDICT axes no arm can close, beside
  // `population-verdict=complete`. `data-panel-available` is that declaration, read straight off
  // `layout.listAvailable`/`contextAvailable`; the DOCKED-section test below is its positive control.
  await expect(page.locator('.shell-panel[data-panel-side="list"]')).toHaveAttribute("data-panel-available", "false");
  await expect(page.locator('.shell-panel[data-panel-side="context"]')).toHaveAttribute("data-panel-available", "false");
});

// #1223 — THE SAME DOOR, ONE SECTION OVER. Extensions declares `context: {kind:"none"}` (a plugin page owns
// its whole CONTENT region and has no host-drawn inspector) but declared no `panels`, and the shell derives
// availability from `panels.context` ALONE — so the topbar shipped a live "Show details" toggle that opened
// the generic "isn't wired yet" placeholder on the platform's own front page. A section with a LIST and no
// CONTEXT is the mixed case the home test cannot cover: the list toggle must survive.
test("a section with a LIST but NO context pane ships the list toggle and NO detail-panel toggle", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...SHELL_AMBIENT_ROUTES,
    "chat.listChats": chatListResponder([]),
    "character.list": { items: [], nextCursor: null },
    "plugin.list": () => [],
    "plugin.listSurfaces": () => [],
  });
  const shell = await mount(<AppShellOnSectionStory section="extensions" />);

  await expect(shell.getByRole("button", { name: LIST_TOGGLE_RE })).toBeVisible();
  await expect(page.getByRole("button", { name: CONTEXT_TOGGLE_RE })).toHaveCount(0);
  // The #1122 declaration, published per panel: LIST is real here, CONTEXT is not — "false everywhere"
  // cannot pass this pair, and neither can "true everywhere".
  await expect(page.locator('.shell-panel[data-panel-side="list"]')).toHaveAttribute("data-panel-available", "true");
  await expect(page.locator('.shell-panel[data-panel-side="context"]')).toHaveAttribute("data-panel-available", "false");
  await expect(page.locator('.shell-panel[data-panel-side="context"] .shell-panel-body')).toBeEmpty();
});

test("a section WITH panes still ships both toggles — the gate is per-section capability, not a global removal", async ({ mount }) => {
  const shell = await mount(<AppShellStory />);

  await expect(shell.getByRole("button", { name: LIST_TOGGLE_RE })).toBeVisible();
  await expect(shell.getByRole("button", { name: CONTEXT_TOGGLE_RE })).toBeVisible();
  await expect(shell.getByRole("button", { name: FOCUS_TOGGLE_RE })).toBeVisible();
  // The #1122 control in the other polarity: a section that DOES declare its panes publishes `true`, so
  // "false everywhere" cannot pass on a tree where the attribute was hardcoded or dropped.
  await expect(shell.locator('.shell-panel[data-panel-side="list"]')).toHaveAttribute("data-panel-available", "true");
  await expect(shell.locator('.shell-panel[data-panel-side="context"]')).toHaveAttribute("data-panel-available", "true");
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
    await expect.poll(async () => panel.evaluate((el) => Number.parseFloat(globalThis.getComputedStyle(el).width))).toBe(MOBILE.width);
    // …and its visible x-range is entirely outside the viewport (left of 0, or right of the width).
    await expect
      .poll(async () => {
        const box = await panel.boundingBox();
        const start = box?.x ?? 0;
        const end = start + (box?.width ?? 0);
        return end <= 0 || start >= MOBILE.width;
      })
      .toBe(true);
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

/** THE BAND'S TWO INSET EDGES, READ APART (#1154). This pin used to ask whether the band's `box-shadow`
 *  was `"none"`, which was exact while the ember was the ONLY shadow the band could carry. It no longer is:
 *  the band's bottom separator moved from `border-block-end` to a second inset stop on the same property,
 *  because `height: 3rem` PLUS a border is a 48px border box with a 47px CONTENT box and `align-items:
 *  center` then half-pixels every occupant (integer-line-boxes.md Law 4; pinned in
 *  tests/client/components/list-pane-header.ct.tsx). THE RULING SURVIVES — ITS INPUT CHANGED: "a floating
 *  context band drops the ember" is unchanged and still asserted; what moved is what `"none"` meant.
 *  So the stops are read by GEOMETRY, which is what distinguishes them on the pixels too — the ember is an
 *  inset stop at the band's TOP (positive block offset), the separator an inset stop at its BOTTOM
 *  (negative) — and the floating arm now also pins that the separator SURVIVES, which the old spelling
 *  could not have said. Chromium serializes each stop as `<color> <x> <y> <blur> <spread> [inset]`. */
async function bandEdges(band: Locator): Promise<{ readonly ember: boolean; readonly rule: boolean; readonly raw: string }> {
  return await band.evaluate((el) => {
    const raw = getComputedStyle(el).boxShadow;
    const stops: string[] = [];
    let depth = 0;
    let current = "";
    for (const char of raw) {
      depth += char === "(" ? 1 : 0;
      depth -= char === ")" ? 1 : 0;
      if (char === "," && depth === 0) {
        stops.push(current.trim());
        current = "";
        continue;
      }
      current += char;
    }
    stops.push(current.trim());
    const painted = stops.filter((stop) => stop.includes("inset") && !/rgba\([^)]*,\s*0\)/u.test(stop));
    const blockOffset = (stop: string): number => Number.parseFloat((stop.match(/-?[\d.]+px/gu) ?? [])[1] ?? "0");
    return { ember: painted.some((stop) => blockOffset(stop) > 0), raw, rule: painted.some((stop) => blockOffset(stop) < 0) };
  });
}

test("the ember content↔context binding is a DOCKED cue: the band keeps it docked, drops it floating", async ({ mount, page }) => {
  const shell = await mount(<AppShellStory />);
  const band = page.locator('.shell-panel[data-panel-side="context"] .shell-panel-header');

  // Docked (wide): the 2px ember inset edge binds the pane to the content column it explains.
  await page.setViewportSize(WIDE);
  await shell.getByRole("button", { name: CONTEXT_TOGGLE_RE }).click();
  await expect(page.locator('.shell-panel[data-panel-side="context"]')).toHaveAttribute("data-panel-mode", "docked");
  await expect.poll(async () => (await bandEdges(band)).ember, { intervals: [20, 50, 100] }).toBe(true);

  // Floating (narrow band): the same edge has nothing to bind to and renders as an orphan amber stripe
  // under the topbar — off it comes. The sheet's own elevation is what says "this floats" now.
  // (Narrowing auto-downgrades the wide dock to a CLOSED slide-over — the toggle re-opens it as one.)
  await page.setViewportSize(NARROW_DESKTOP);
  await shell.getByRole("button", { name: CONTEXT_TOGGLE_RE }).click();
  await expect(page.locator('.shell-panel[data-panel-side="context"]')).toHaveAttribute("data-panel-mode", "overlay");
  await expect.poll(async () => (await bandEdges(band)).ember, { intervals: [20, 50, 100] }).toBe(false);
  // …and ONLY the ember goes: a floating band is still a chrome row and still owns its bottom separator.
  const floating = await bandEdges(band);
  expect(floating.rule, `the band's separator must survive the ember drop — computed: ${floating.raw}`).toBe(true);
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

/** WHO OWNS THE TOPMOST PIXEL at a point, named by the shell region that claims it. `elementFromPoint`
 *  rather than a box comparison: overlapping boxes prove nothing about paint order, and this is the only
 *  question a user can ask of a stack ("what does my finger land on?"). Portal first — a portal float is
 *  never inside `.shell-grid`, so a grid-region answer for a float would be the bug. */
function ownerAtPoint(page: Page, x: number, y: number): Promise<string> {
  return page.evaluate(
    ({ px, py }) => {
      const hit = document.elementFromPoint(px, py);
      if (hit === null) {
        return "none";
      }
      if (hit.closest('[data-slot="portal-root"]') !== null) {
        return "portal";
      }
      if (hit.closest('.shell-panel[data-panel-side="context"]') !== null) {
        return "sheet";
      }
      if (hit.closest(".shell-rail") !== null) {
        return "rail";
      }
      if (hit.closest(".shell-scrim") !== null) {
        return "scrim";
      }
      if (hit.closest(".shell-content") !== null) {
        return "content";
      }
      return hit.tagName.toLowerCase();
    },
    { px: x, py: y },
  );
}

// ── THE SHELL IS AN ISOLATED STACKING SCOPE, AND A FLOAT ESCAPES IT THROUGH THE PORTAL (#1794) ────────
// `.shell-grid` carries `isolation: isolate`, so EVERY z-index written inside the shell — the rail, the
// scrim, a docked/overlay panel — is resolved against that box's own children and can never out-paint
// anything mounted beside the grid. A cross-boundary float therefore escapes by being PORTALED to
// `[data-slot="portal-root"]` (the grid's `display:contents` sibling), never by naming a higher token: the
// number the shell writes only orders the shell.
//
// Two different claims, and this test says which is which rather than letting a green read as both:
//   · the Z-INDEX EQUALITY is the SCOPE pin (#1794's actual change) — the mobile sheet used to spell the
//     PORTAL-owned `--z-modal` here, which bought it nothing inside the isolated scope and mis-stated
//     where the rung lives. RED against the pre-fix source (`50` vs the `--z-overlay` token's `40`).
//   · the HIT-TESTS are a FENCE, not a defect proof: they held at the old value too, which is exactly the
//     finding — the rung was over-reaching, never mis-ordering. They exist so the move is provably safe
//     and cannot regress. Positive control taken by planting `var(--z-base)` on the sheet in shell.css:
//     the tab-bar-row probe flipped `sheet` → `rail`, so the probe does bite.
test("MOBILE: the CONTEXT sheet rides the shell's OWN overlay rung, and a portal float still covers it", async ({ mount, page }) => {
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "chat.listChats": chatListResponder([]) });
  await page.setViewportSize(MOBILE);
  const shell = await mount(<AppShellStory />);
  const contextPanel = page.locator('.shell-panel[data-panel-side="context"]');

  // The mechanism the whole ruling rests on — without it the shell's numbers WOULD compete with the floats.
  await expect(page.locator(".shell-grid")).toHaveCSS("isolation", "isolate");

  await shell.getByRole("button", { name: CONTEXT_TOGGLE_RE }).click();
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "overlay");

  // ORDERING FIRST, as the user meets it — and first in SOURCE too, so a planted regression fails on the
  // rendered fact rather than on the token spelling. The sheet owns every pixel it covers: the content
  // column beneath it AND the bottom tab bar's row, which THIS sheet deliberately takes (#875 F9) — the one
  // place the shell asks a panel to out-paint the rail, and the reason the old comment reached for a
  // modal-tier number.
  //
  // VIEWPORT coordinates, not the panel's own box: this sheet is `width: 100dvw` and reaches the screen's
  // bottom edge, so the two points below are inside it BY CONSTRUCTION — a box-derived point would agree
  // with a sheet that had drifted off-screen. Polled, because the sheet arrives on a `transform`
  // transition and a single sample lands mid-slide.
  const settled = { intervals: [20, 50, 100, 200] };
  await expect.poll(() => ownerAtPoint(page, MOBILE.width / 2, MOBILE.height - 8), settled).toBe("sheet");
  await expect.poll(() => ownerAtPoint(page, MOBILE.width / 2, MOBILE.height / 2), settled).toBe("sheet");

  // SCOPE: read off the token, never a literal — a re-rank of the scale must not silently pass here.
  await expect(contextPanel).toHaveCSS("z-index", TOKENS["z.overlay"].value);

  // …and the ⌘K palette — a PORTAL float — still covers the sheet that is covering the screen.
  expect(await dispatchCommandKey(page, { metaKey: true })).toBe(true);
  const dialog = page.getByRole("dialog", { name: "Jump to…" });
  await expect(dialog).toBeVisible();
  // It escaped by MOUNT POSITION, not by out-numbering the shell: it is not inside `.shell-grid` at all.
  await expect(page.locator('.shell-grid [role="dialog"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="portal-root"] [role="dialog"]')).toHaveCount(1);
  // …and the SAME point that answered "sheet" a moment ago now answers "portal": the float is on top of
  // the surface that was on top of the screen. (Polled: the palette has its own entrance.)
  await expect.poll(() => ownerAtPoint(page, MOBILE.width / 2, MOBILE.height / 2), settled).toBe("portal");
  // The sheet is still open underneath it — the float covered it, it did not close it.
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "overlay");
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
  { id: "config", label: "Settings" },
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
  await expect(page.getByRole("button", { name: "Back to Settings" })).toHaveCount(0);
  await expect(shell.getByRole("button", { name: LIST_TOGGLE_RE })).toBeVisible();
});

// ── #1349: THE ROSTER SCREEN IS THE MAIN LANDMARK, AND THE SKIP LANDS ON IT ──────────────────────────
// The ONE-SHELL rule made the roster the screen and shell.css `display:none`s `.shell-content` behind it —
// so on the phone landing the ONLY `main` landmark in the document was an unrendered node. Measured on live
// main 2026-09-04 at `--mobile`: the first Tab stop was "Skip to content", Enter left focus exactly where it
// was (its target measured `{display:"none", inert:true, width:0}`), and design-audit fired
// `landmark-missing body` on 8 of 10 sections. The fix is the shell's, once, for every section: whichever
// region IS the screen carries `main`. Pinned as a per-state count, because "exactly one" is the claim in
// BOTH states — the roster screen and the pushed detail.
test("#1349 @320: the roster screen is the ONE main landmark and the skip link lands focus on it", async ({ mount, page }) => {
  await page.setViewportSize(MOBILE_NARROW);
  const shell = await mount(<AppShellMobileRuleStory section="chats" />);
  const listPanel = page.locator('.shell-panel[data-panel-side="list"]');
  await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");

  // ONE main, and it is the roster pane — `getByRole` ignores the `display:none` content column exactly as
  // the a11y tree does, which is the whole defect stated positively.
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("main")).toHaveAttribute("data-panel-side", "list");

  // …and the skip control reaches it. A real Tab first so the page is in keyboard modality (the reveal is
  // `:focus-visible`), then activate the control the way a keyboard user does.
  await page.keyboard.press("Tab");
  const skip = shell.getByRole("button", { name: "Skip to content", exact: true });
  await skip.focus();
  await skip.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();

  // A SELECTION pushes the detail: CONTENT is the screen again, and it is again the one main.
  await shell.getByRole("button", { name: "open a member" }).click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "collapsed");
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("main")).toHaveClass(/shell-content/u);
});

// The DESKTOP twin of the same claim: the roster is a complementary pane beside CONTENT there, so the
// content column keeps `main` and the skip keeps landing on it. One shell rule, two regimes, no per-section
// exception — and this is the arm that would go red if the mobile fix leaked into the wide layout.
test("#1349 @1280: the content column keeps the ONE main landmark and the roster stays complementary", async ({ mount, page }) => {
  await page.setViewportSize(WIDE);
  await mount(<AppShellMobileRuleStory section="chats" />);

  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("main")).toHaveClass(/shell-content/u);
  await expect(page.locator('.shell-panel[data-panel-side="list"]')).not.toHaveAttribute("role", "main");
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
    await expect(page.getByRole("button", { name: "⌘K jump — the command menu" })).toHaveCount(0);
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
    const readShownAtAssertion = async (): Promise<typeof shown> =>
      await content.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { display: cs.display, box: el.getBoundingClientRect().width * el.getBoundingClientRect().height };
      });
    const shown = await content.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { display: cs.display, box: el.getBoundingClientRect().width * el.getBoundingClientRect().height };
    });
    await expect.poll(async () => (await readShownAtAssertion()).display).toBe("none");
    await expect.poll(async () => (await readShownAtAssertion()).box).toBe(0);

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
    await expect(title).toHaveText("Settings");

    await shell.getByRole("button", { name: "open a member" }).click();
    await expect(title).toHaveText("Ashen Spire");
    expect((await title.boundingBox())?.width ?? 0).toBeGreaterThan(0);
  });

  test("a11y: the bottom tab bar comes AFTER the topbar in DOM order on a phone (meaningful sequence)", async ({ mount, page }) => {
    await mount(<AppShellMobileRuleStory section="chats" />);
    const readOrderAtAssertion = async (): Promise<typeof order> =>
      await page.evaluate(() => {
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
    await expect.poll(async () => (await readOrderAtAssertion()).indexOf("main")).toBeLessThan(order.indexOf("rail"));
  });
});

test("a11y: on the DESKTOP the rail still reads first — it is the leftmost column there", async ({ mount, page }) => {
  await page.setViewportSize(WIDE);
  await mount(<AppShellMobileRuleStory section="chats" />);
  const readOrderAtAssertion = async (): Promise<typeof order> =>
    await page.evaluate(() => {
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
  await expect.poll(async () => (await readOrderAtAssertion()).indexOf("rail")).toBeLessThan(order.indexOf("main"));
});

// ── #231 — the same NO-CLOBBER contract, widened to the axes that resize and repaint the whole shell ──
// `--font-scale` sets the ROOT font size and every shell dimension is rem-derived, and `data-theme`
// selects the whole palette. Both arrive from reads the shell cannot wait for, so `main.tsx` replays this
// device's remembered answers before React mounts (`stampAppearanceBootHint`). That only holds if the
// shell's own first commit RECONCILES with the replay instead of stamping the schema default over it —
// measured cost of the clobber: boot CLS 0.1963–0.3398 at scale 1.25 (2–3.4× budget, and 209ms AFTER the
// boot veil's own exit stamp), plus a dark→light palette swap animating colour on everything.
//
// The init script does exactly what the composition root does, in the same order: seed the remembered
// blob, then stamp the root. The barrier is the HELD request, so "unresolved" is an indefinitely stable
// rendered state rather than a flash that a fast machine would miss.
const FONT_SCALE_VAR = "--font-scale";
const DATA_THEME_ATTR = "data-theme";
/** The boot hint's blob (`createPersistedStore("appearance-boot")`, legacy/unbound key). */
const APPEARANCE_HINT_BLOB = JSON.stringify({
  state: { reducedMotion: false, fontScale: 1.25, density: "compact", dataTheme: "light" },
  version: 1,
});

async function bootWithAppearanceHint(page: Page): Promise<void> {
  await page.addInitScript({
    content: `try {
      localStorage.setItem("orb:appearance-boot", ${JSON.stringify(APPEARANCE_HINT_BLOB)});
      document.documentElement.style.setProperty("--font-scale", "1.25");
      document.documentElement.setAttribute("data-theme", "light");
    } catch { /* storage disabled */ }`,
  });
  await page.reload();
}

test("#231 a remembered fontScale survives the shell's first commit while getUserSettings is in flight", async ({ mount, page }) => {
  await bootWithAppearanceHint(page);
  const settings = trpcHold();
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "settings.getUserSettings": settings });
  await mount(<AppShellStory />);
  await settings.requested;
  await expect
    .poll(async () => page.evaluate((v) => document.documentElement.style.getPropertyValue(v), FONT_SCALE_VAR), { intervals: [20, 50, 100] })
    .toBe("1.25");
  // …and the common shell/portal carrier already has the remembered DENSITY, so neither branch reflows
  // into it later.
  await expect(page.locator('[data-slot="theme-scope"]:has(.shell-grid)')).toHaveAttribute("data-density", "compact");
});

test("#231 a remembered theme survives it too — a Light user never cold-boots the dark palette", async ({ mount, page }) => {
  await bootWithAppearanceHint(page);
  const settings = trpcHold();
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "settings.getUserSettings": settings });
  await mount(<AppShellStory />);
  await settings.requested;
  await expect
    .poll(async () => page.evaluate((attr) => document.documentElement.getAttribute(attr), DATA_THEME_ATTR), { intervals: [20, 50, 100] })
    .toBe("light");
});

test("#231 CONTROL: a device with NO hint is not scaled or themed by the pending read — remembered, never guessed", async ({ mount, page }) => {
  const settings = trpcHold();
  await routeTrpc(page, { ...SHELL_AMBIENT_ROUTES, "settings.getUserSettings": settings });
  await mount(<AppShellStory />);
  await settings.requested;
  const readRootAtAssertion = async (): Promise<typeof root> =>
    await page.evaluate(
      ([v, attr]) => ({
        scale: document.documentElement.style.getPropertyValue(v as string),
        theme: document.documentElement.getAttribute(attr as string),
      }),
      [FONT_SCALE_VAR, DATA_THEME_ATTR],
    );
  const root = await page.evaluate(
    ([v, attr]) => ({
      scale: document.documentElement.style.getPropertyValue(v as string),
      theme: document.documentElement.getAttribute(attr as string),
    }),
    [FONT_SCALE_VAR, DATA_THEME_ATTR],
  );
  await expect.poll(async () => (await readRootAtAssertion()).scale).toBe("1");
  await expect.poll(async () => (await readRootAtAssertion()).theme).toBeNull();
});

// ── #237: the CHROME PANES never got D144's polarity floor ─────────────────────────────────────────
// Over a room wallpaper the glass paints `.shell-panel` at a FIXED `--blur-fill-chrome` (70%) of its own
// tint, so 30% of whatever art is behind lands in the pane. Under the DARK arm that measured 8.48:1; the
// same node under `--theme Light` measured 3.69:1 (pixel-sampled — the css-resolve path says 7.01 and
// misses it entirely, because the wallpaper is a PAINT layer). It is the same defect class #217 closed
// for the reading plate: a translucent surface whose alpha was designed, not derived. The fix composites
// the pane's own tint over `--color-reading-plate` — D144's already-derived, polarity-aware over-art
// backing — on the LIGHT arm only, so the dark arm stays byte-identical (D144(d): the sacred dark rooms
// do not move). Both partners of that mix are at or above the plate's derived alpha, so the result is
// too, by construction — no new number is invented anywhere.
const OVER_ART_BLUR: readonly BlurSurface[] = ["panels"];

// The two alpha spellings a computed fill can carry.
const SLASH_ALPHA = /\/\s*([\d.]+)\s*\)/u;
const RGBA_ALPHA = /^rgba?\([^)]*,\s*([\d.]+)\s*\)$/u;

/** The alpha of a computed `color(...)`/`oklab(...)`/`rgb(...)` fill — the slash arm, or 1 when opaque. */
function alphaOf(color: string): number {
  const slash = SLASH_ALPHA.exec(color);
  if (slash?.[1] !== undefined) {
    return Number(slash[1]);
  }
  const rgba = RGBA_ALPHA.exec(color);
  return rgba?.[1] === undefined ? 1 : Number(rgba[1]);
}

test("#237: over a wallpaper a LIGHT palette's panes take the derived plate floor; the DARK arm does not move", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  // #1154 moved the pane's FILL onto its `::before` glass carrier (the pane itself must stop being a
  // promoted layer, or its text loses baseline snapping). The subject of every read below moved with it;
  // not one assertion changed, and the plate rule is the same `light-dark()` one rule, one level down.
  const dark = await mount(<ShellCascadeFixture blurSurfaces={OVER_ART_BLUR} hasBgImage={true} omitMainRegion={true} />);
  const darkFill = await bgColorOf(glassCarrier(dark.getByTestId("panel-probe")));
  await dark.unmount();
  const light = await mount(<ShellCascadeFixture blurSurfaces={OVER_ART_BLUR} dataTheme="light" hasBgImage={true} omitMainRegion={true} />);
  const lightFill = await bgColorOf(glassCarrier(light.getByTestId("panel-probe")));
  // The LIGHT arm clears the polarity-derived reading-plate alpha for a light base (#217: 0.921 at the
  // owner-ruled reference ink). Pre-#237 it was the flat 0.7 that produced the 3.69:1 reading.
  const plateAlpha = await light.getByTestId("panel-probe").evaluate((el) => getComputedStyle(el).getPropertyValue("--color-reading-plate").trim());
  test.info().annotations.push({ description: `light pane ${lightFill} · plate ${plateAlpha} · dark pane ${darkFill}`, type: "pane-fill" });
  expect(alphaOf(lightFill)).toBeGreaterThanOrEqual(alphaOf(plateAlpha));
  // The DARK arm is byte-identical to the pane WITHOUT a wallpaper — the rule cannot touch it at all.
  await light.unmount();
  const darkPlain = await mount(<ShellCascadeFixture blurSurfaces={OVER_ART_BLUR} omitMainRegion={true} />);
  expect(darkFill).toBe(await bgColorOf(glassCarrier(darkPlain.getByTestId("panel-probe"))));
});

test("#237: the LIGHT pane's SECONDARY ink clears AA against what LANDS over worst-case (black) art", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  // The ink measured is `--color-muted-foreground`, not the pane's own `color`: the node the delta report
  // sampled at 3.69:1 is the list pane's TITLE KICKER, and the pane's full-strength foreground was never
  // the failing one (it survives the fixed 70% fill on its own margin). The floor has to be proven on the
  // WEAKEST ink the pane paints, or the pin passes on a surface that is still failing where it hurts.
  //
  // The wallpaper is a paint layer the shell goes transparent for, so the worst LEGAL art (a pure-black
  // photo at BACKGROUND_DIM_MIN 0) is reproduced by painting the page behind the transparent grid.
  await page.evaluate(() => {
    document.body.style.background = "#000";
  });
  const light = await mount(<ShellCascadeFixture blurSurfaces={OVER_ART_BLUR} dataTheme="light" hasBgImage={true} omitMainRegion={true} />);
  const panel = light.getByTestId("panel-probe");
  const box = await panel.boundingBox();
  expect(box, "the pane must be laid out before its fill can be sampled").not.toBeNull();
  const { x, y, width, height } = box as NonNullable<typeof box>;
  const landed = await samplePixel(page, Math.floor(x + width / 2), Math.floor(y + height / 2));
  const ink = await panel.evaluate((el) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (ctx === null) {
      throw new Error("no 2d context");
    }
    ctx.fillStyle = getComputedStyle(el).getPropertyValue("--color-muted-foreground").trim();
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return { b: b ?? 0, g: g ?? 0, r: r ?? 0 };
  });
  const readRatioAtAssertion = async (): Promise<typeof ratio> =>
    contrastRatio(
      await panel.evaluate((el) => {
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext("2d");
        if (ctx === null) {
          throw new Error("no 2d context");
        }
        ctx.fillStyle = getComputedStyle(el).getPropertyValue("--color-muted-foreground").trim();
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        return { b: b ?? 0, g: g ?? 0, r: r ?? 0 };
      }),
      landed,
    );
  const ratio = contrastRatio(ink, landed);
  test.info().annotations.push({
    description: `${ratio.toFixed(2)}:1 · pane kicker ink rgb(${ink.r},${ink.g},${ink.b}) vs LANDED rgb(${landed.r},${landed.g},${landed.b}) over black art`,
    type: "pane-contrast",
  });
  await expect.poll(async () => await readRatioAtAssertion()).toBeGreaterThanOrEqual(4.5);
});

// ── #623: THE MODAL SLOTS NEVER ADOPTED D144'S OVER-ART FLOOR ──────────────────────────────────────
// Side-eye pixel-sampled the /imagine modal live under the LIGHT palette over a room wallpaper: "Preview
// prompt" 4.25:1, the blind-spend hint 4.29:1, the "Character" mode button 4.26:1 — all below AA — while the
// same tokens measured 7.06-7.50:1 under the owner's dark arm and 7.62:1 in a modal over an opaque backdrop.
// That is the #237 defect one surface over: `html[data-blur-modals] [data-slot="dialog-popup"]` mixes
// `--color-popover` at a FIXED `--blur-fill-chrome` over `transparent`, so 30% of whatever is behind the
// popup lands inside it — and what is behind it is arbitrary art, which this feature itself puts there
// ("Set as background" hangs a generated image behind the room).
//
// It is an ADOPTION, not a new mechanism and not a regression: `--color-reading-plate`
// (kit/theme-derivation `readingPlateAlpha`) already solves "a translucent backing over worst-case art"
// polarity-aware, #217 minted it, #237 threaded it into `.shell-panel`, and a search of every plate/polarity
// row (#204 #217 #218 #221 #223 #229 #232 #237 #241 #468 #487) turns up none that ever covered a popup.
//
// THE FIXTURE HAD TO BE FIXED FIRST. Its dialog probes used to sit inside `.shell-grid`; production portals a
// popup to a SIBLING `[data-slot="portal-root"]`, so a grid-scoped selector would have measured green here
// and shipped nothing at all. See `_cascade-fixtures.tsx`.
const AA_NORMAL = 4.5;

/** The ink a probe would paint at `varName`, decoded through a canvas so an `oklch()` token becomes RGB — a
 *  regex over the computed string cannot do it, because the value passes through VERBATIM as `oklch(...)`. */
function tokenInk(probe: Locator, varName: string): Promise<Rgb> {
  return probe.evaluate((el, name) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (ctx === null) {
      throw new Error("no 2d context");
    }
    ctx.fillStyle = getComputedStyle(el).getPropertyValue(name).trim();
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return { b: b ?? 0, g: g ?? 0, r: r ?? 0 };
  }, varName);
}

/** The contrast a surface's WEAKEST ink actually achieves: `--color-muted-foreground` against the pixels that
 *  LAND inside the probe over worst-case art. Muted, not `color`, for #237's reason — a surface's
 *  full-strength foreground survives the 70% fill on its own margin, so a pin on it passes while the surface
 *  is still failing where it hurts (side-eye measured exactly the muted family here: the spend hint, the
 *  ghost read-the-chat button, the unselected mode labels). */
async function landedMutedContrast(page: Page, probe: Locator): Promise<{ readonly ratio: number; readonly landed: Rgb; readonly ink: Rgb }> {
  const box = await probe.boundingBox();
  expect(box, "the probe must be laid out before its pixels can be sampled").not.toBeNull();
  const { x, y, width, height } = box as NonNullable<typeof box>;
  const landed = await samplePixel(page, Math.floor(x + width / 2), Math.floor(y + height / 2));
  const ink = await tokenInk(probe, "--color-muted-foreground");
  return { ink, landed, ratio: contrastRatio(ink, landed) };
}

test("#623: over worst-case art a LIGHT palette's DIALOG POPUP clears AA on its weakest ink", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  // The wallpaper is a paint layer the grid goes transparent for, so the worst LEGAL art (a pure-black photo
  // at BACKGROUND_DIM_MIN 0) is reproduced by painting the page behind it.
  await page.evaluate(() => {
    document.body.style.background = "#000";
  });
  const light = await mount(<OverArtGlassCensusFixture dataTheme="light" />);
  const dialog = await landedMutedContrast(page, light.getByTestId("census-dialog"));
  test.info().annotations.push({
    description: `dialog ${dialog.ratio.toFixed(2)}:1 · muted ink rgb(${dialog.ink.r},${dialog.ink.g},${dialog.ink.b}) vs LANDED rgb(${dialog.landed.r},${dialog.landed.g},${dialog.landed.b})`,
    type: "over-art-contrast",
  });
  expect(dialog.ratio).toBeGreaterThanOrEqual(AA_NORMAL);
});

test("#623: the DARK arm's dialog popup does not move a pixel (D144(d) — the sacred rooms stand)", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const dark = await mount(<OverArtGlassCensusFixture />);
  const overArt = await bgColorOf(dark.getByTestId("census-dialog"));
  await dark.unmount();
  // The same slot with NO wallpaper: the fix is `light-dark()`-gated, so the dark arm must be byte-identical.
  const plain = await mount(<ShellCascadeFixture blurSurfaces={["modals"]} />);
  expect(overArt).toBe(await bgColorOf(plain.getByTestId("dialog-probe")));
});

// THE BLAST RADIUS IS EVERY DIALOG, so it is measured rather than argued. `[data-slot="dialog-popup"]` is
// what the settings modal, the command palette, New chat, Add document, Account and the imagery modals all
// paint through (one `DialogPopup`), and the raise must be invisible to every one of them when there is no
// wallpaper to composite. The OTHER overlay families are untouched by construction — Popover, Select, Menu
// and Drawer carry their own slots and appear nowhere in the new selector.
test("#623: with NO wallpaper the LIGHT arm's dialog popup is byte-identical (the raise is art-gated)", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const withArt = await mount(<ShellCascadeFixture blurSurfaces={["modals"]} dataTheme="light" hasBgImage={true} />);
  const artFill = await bgColorOf(withArt.getByTestId("dialog-probe"));
  await withArt.unmount();
  const plain = await mount(<ShellCascadeFixture blurSurfaces={["modals"]} dataTheme="light" />);
  const plainFill = await bgColorOf(plain.getByTestId("dialog-probe"));
  // `ShellCascadeFixture` gives the popup its production home (a portalled SIBLING of the grid), so the
  // wallpaper-gated rule genuinely applies in the first arm and genuinely does not in the second.
  expect(artFill).not.toBe(plainFill);
  expect(alphaOf(artFill)).toBeGreaterThan(alphaOf(plainFill));
});

// THE CENSUS IS NOW A FENCE, NOT A REPORT — and the sentence it used to carry is why.
//
// It was written as "the census the fix did NOT change": `.shell-panel` took D144's floor at #237 and was the
// only ASSERTED row (the positive control — a census that reds on surfaces its lane was fenced out of would
// be parking someone else's work inside a failing test), while `.shell-main` and `[data-slot="composer"]`
// were measured-and-annotated as "the same defect waiting to be filed". Both have since been filed and
// fixed: `.shell-main`'s carrier took the arm at `a743e4799` (#1173), and the composer plus the three
// `[data-slot="message-bubble"]` roles take it here, off the `over-art-plate-arm` gate's own warnings
// (globals.css:306/419/423/427 — "mixes `var(--color-…)` over `transparent` and no `[data-has-bg-image]`
// rule gives that pair a `light-dark()` plate arm").
//
// So every `color-mix(…, transparent)` glass surface in the sheet now has a plate arm, and the honest shape
// of this test flips with that: what was a report of an open gap is the CLOSURE PIN.
//
// MEASURED BOTH WAYS, AND THE TWO HALVES OF THE SET DIFFER — stated because a reader should not take this
// arm as evidence that all four newly-threaded surfaces were failing. Against the UNMODIFIED globals.css
// (`git show HEAD:…` restored, this same mount): panel 6.40 · shell-main 6.99 · composer 3.30 · bubble/user
// 4.81 · bubble/assistant 5.41 · bubble/system 4.84. The COMPOSER was a live AA failure at 3.30:1 — a person
// typing over a dark room photo, which is the whole defect class. The three bubbles already cleared AA on
// their own denser fill and take the arm for CONFORMANCE (D144's floor is derived, not designed: a bubble
// whose alpha happens to clear today is still an undeclared number the next palette can move), and their
// ratios rise with it. A census that reported "all six red" would be overclaiming; this comment is the
// receipt that they were not.
//
// STILL MEASURED ON THE WEAKEST INK (`--color-muted-foreground`, `landedMutedContrast`'s own reason): a
// surface's full-strength foreground survives the fixed fill on its own margin, so a pin on it passes while
// the surface is still failing where it hurts. And still on the LANDED PIXELS over pure-black art — the
// css-resolve path reports a clean number here and misses the defect entirely, because a wallpaper is a
// PAINT layer, not a computed background (#237's own receipt: 7.01 computed against 3.69 sampled).
test("#623 census: EVERY glass surface over worst-case art clears AA on the LIGHT arm", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => {
    document.body.style.background = "#000";
  });
  const light = await mount(<OverArtGlassCensusFixture dataTheme="light" />);
  const rows = [
    { label: "panel(#237, control)", probe: "census-panel" },
    { label: "shell-main(#1173)", probe: "census-main" },
    { label: "composer", probe: "census-composer" },
    { label: "bubble/user", probe: "census-bubble-user" },
    { label: "bubble/assistant", probe: "census-bubble-assistant" },
    { label: "bubble/system", probe: "census-bubble-system" },
  ] as const;
  const measured: { readonly label: string; readonly ratio: number }[] = [];
  for (const row of rows) {
    measured.push({ label: row.label, ...(await landedMutedContrast(page, light.getByTestId(row.probe))) });
  }
  test.info().annotations.push({
    description: `${measured.map((m) => `${m.label} ${m.ratio.toFixed(2)}:1`).join(" · ")} — AA floor ${AA_NORMAL}`,
    type: "over-art-census",
  });
  for (const m of measured) {
    expect(m.ratio, `${m.label} over black art`).toBeGreaterThanOrEqual(AA_NORMAL);
  }
});

// THE DARK ARM DOES NOT MOVE (D144(d) — the sacred dark rooms), for the surfaces this lane threaded. The
// plate rides the LIGHT arm of a `light-dark()` whose DARK arm re-spells the plateless base verbatim, so the
// claim is byte-identity rather than a ratio: a dark room with a wallpaper renders exactly what it rendered
// before the arm existed. Asserted against the SAME mount with no wallpaper, which is what "the rule cannot
// touch it at all" means — the #237 pane arm's own construction, on the four surfaces that just took it.
// THE PER-ROLE CONTROL IS A SEPARATE MOUNT, NOT A DISTINCTNESS HEURISTIC. A first cut of this test proved
// the role selector still reached by asserting the three dark fills were three distinct values; it RED on the
// tree at `oklab(0.255 …/0.88) · oklab(0.205 …/0.88) · oklab(0.255 …/0.88)` — `--color-user-bubble` and
// `--color-system-bubble` resolve to the SAME value in the default dark palette, which is a palette fact and
// not a defect. So each role is compared to ITS OWN no-wallpaper twin (`ShellCascadeFixture`'s `messageRole`
// switch), which is a stronger claim than distinctness and does not depend on how a seed happens to be tuned.
test("the composer and the three bubbles do not move on the DARK arm (D144(d))", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const roles = ["user", "assistant", "system"] as const;
  const overArt = await mount(<OverArtGlassCensusFixture />);
  const composerOverArt = await bgColorOf(overArt.getByTestId("census-composer"));
  const bubblesOverArt: string[] = [];
  for (const role of roles) {
    bubblesOverArt.push(await bgColorOf(overArt.getByTestId(`census-bubble-${role}`)));
  }
  await overArt.unmount();

  // `hasBgImage` is baked into the census fixture's grid, so the no-wallpaper control is a DIFFERENT fixture:
  // `ShellCascadeFixture` carries the switch, and its composer/bubble probes are the same two slots under the
  // same glass surfaces. One mount per role, because its bubble probe wears one `data-role` at a time.
  const plainBubbles: string[] = [];
  let composerPlain = "";
  for (const role of roles) {
    const plain = await mount(<ShellCascadeFixture blurSurfaces={ALL_BLUR_SURFACES} messageRole={role} />);
    composerPlain = await bgColorOf(plain.getByTestId("composer-probe"));
    plainBubbles.push(await bgColorOf(plain.getByTestId("bubble-probe")));
    await plain.unmount();
  }
  test.info().annotations.push({
    description: `over-art composer ${composerOverArt} · bubbles ${bubblesOverArt.join(" · ")} || plain composer ${composerPlain} · bubbles ${plainBubbles.join(" · ")}`,
    type: "dark-arm",
  });
  expect(composerOverArt, "the dark composer over art is the plateless base verbatim").toBe(composerPlain);
  expect(bubblesOverArt, "each dark bubble role over art is its own plateless base verbatim").toEqual(plainBubbles);
});

// -- #1669 arm A: THE CHARACTERS PANE'S PHONE CHROME, MEASURED ON THE REAL SCREEN --------------------
// WHY IT LIVES IN THE APP-SHELL CT and not beside the surface it is about. The saving this ratchets is a
// CSS one the shell owns: shell.css's "...AND THE BAND GOES WITH IT WHEN NOTHING IS LEFT" `:has()` chain
// sheds the LIST chrome band once nothing but the identity cluster is in it, and that rule is keyed on
// `.shell-grid[data-list-mode="docked"]` inside the `<=48rem` media query. The surface CT's own story mounts
// the band WITHOUT the shell grid and at a fixed-width div inside a desktop viewport, so neither condition
// can hold there and its "#1661 the phone's chrome budget" fence structurally cannot see the shed - it
// measures the SURFACE's own chrome and keeps doing so. This is the whole-screen number the #1669 ruling was
// written against (`snap --goto characters --isolated --mobile`, 280px of a 740px phone at 430 coarse):
// topbar 48 + LIST band 48 + body pad 8 + search/sort 44 + gap 6 + VIEW 53 + gap 8 + FILTERS 57 + gap 8.
//
// WHAT MOVED: the band's `[import][+ New]` cluster is a SECTION-SCOPED `topbar.trail` chrome entry on a
// phone (`features/character/lib/character-create-chrome.tsx`), so the band has nothing left and goes. The
// desktop band is untouched, and #520's "one New door on the plane" is preserved by the entry's third gate -
// it stands down when the LIST is not the screen, which is exactly where the landing mints its own doors.
//
// MEASURED HERE, both arms: **288px** with the band shed, against **336px** on the unmodified source - the
// red-first receipt, taken by restoring `characters-list-header.tsx` + the CT chrome registry from HEAD and
// re-running these same two mounts, which also reported the trail carrying no `New` at all. That is 48px,
// the band's own row; the ruling predicted ~56 on the assumption of a gap under it, and there is none. It is
// WIDTH-INVARIANT across the phone band: nothing in this chrome wraps at either end, so the smaller phone is
// no worse and the bigger one no better. 290 is the measured number plus 2px of sub-pixel headroom. Its
// POSITIVE CONTROL is the desktop twin at the foot of this block, which measures the same plane in the state
// that must NOT shed.
const CHARACTERS_PHONE_CHROME_CEILING_PX = 290;
const CHARACTERS_PHONE_ARMS = [320, 390] as const;

/** The routes the Characters plane needs on top of the shell's own ambient set. `character.get` is fed
 *  because the #520 half of the trail pin OPENS her - the editor beside the list is a real read, and an
 *  unfed one leaves that pipeline inert while this file claims to have driven a selection. */
function charactersPlaneRoutes(): Readonly<Record<string, unknown>> {
  return {
    ...SHELL_AMBIENT_ROUTES,
    "chat.listChats": chatListResponder([]),
    "character.list": { items: [makeCharacterSummary({ id: "char_phone", name: "Starla" })], nextCursor: null, totalCount: 1 },
    "character.get": makeCharacterDetail({ id: "char_phone", name: "Starla" }),
    // The editor's own two ambient reads, fed empty: opening her is half the #520 pin, and an unfed read
    // leaves those pipelines inert while this file claims to have driven a selection.
    "tag.listPendingSuggestions": [],
    "regex.listForCharacter": [],
  };
}

/** Her LIST row, addressed inside the list pane. The CONTENT pane's landing shelves offer a button with the
 *  same accessible name, so an unscoped `getByRole` is two elements on the desktop arm. */
function starlaRow(page: Page): Locator {
  return page.locator('.shell-panel[data-panel-side="list"]').getByRole("button", { name: "Starla", exact: true });
}

/** The whole screen's chrome: the top of the shell to the top of the character list. */
async function charactersScreenChrome(shell: Locator): Promise<number> {
  const list = shell.getByRole("list", { name: "Character library" });
  const [shellBox, listBox] = await Promise.all([shell.boundingBox(), list.boundingBox()]);
  return Math.round((listBox?.y ?? 0) - (shellBox?.y ?? 0));
}

test.describe("#1669 the Characters plane's phone chrome", () => {
  test.use({ hasTouch: true });

  for (const width of CHARACTERS_PHONE_ARMS) {
    test(`at ${String(width)}px coarse the LIST band is shed and the chrome above the first row holds its budget`, async ({ mount, page }) => {
      await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
      await page.setViewportSize({ width, height: 740 });
      await routeTrpc(page, charactersPlaneRoutes());
      const shell = await mount(<AppShellOnSectionStory section="characters" />);
      await expect(starlaRow(page)).toBeVisible();

      // THE GEOMETRY IS READ FIRST, deliberately: a red here has to PRINT the number this fence is about,
      // and an earlier structural assertion would abort the test before any pixel was measured.
      expect(await charactersScreenChrome(shell)).toBeLessThanOrEqual(CHARACTERS_PHONE_CHROME_CEILING_PX);
      // ...AND THE BAND IS GONE, measured as PAINT and not as a class: `display:none` is what the `:has()`
      // chain resolves to, and a band that merely lost its title would still be a 48px row here.
      await expect(page.locator('.shell-panel[data-panel-side="list"] .shell-panel-header')).toBeHidden();
    });

    test(`at ${String(width)}px coarse the band's two doors are on the TOPBAR TRAIL, and only while the list is the screen`, async ({ mount, page }) => {
      await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
      await page.setViewportSize({ width, height: 740 });
      await routeTrpc(page, charactersPlaneRoutes());
      await mount(<AppShellOnSectionStory section="characters" />);
      await expect(starlaRow(page)).toBeVisible();

      // Both verbs, in the trail, by their production accessible names - the SAME cluster the desktop band
      // renders, so neither is buried a click deep inside the other.
      const trail = page.locator(".shell-topbar-trail");
      await expect(trail.getByRole("button", { name: "New", exact: true })).toBeVisible();
      await expect(trail.getByRole("button", { name: "Import a character card" })).toBeVisible();

      // ...AND THE TRAIL STILL SAYS WHERE YOU ARE. The topbar's whole job on a phone is the screen title
      // (side-eye leg-4 P2, the budget `plugin-commands-chrome.tsx` records), so the entry is only paid for
      // if the title survives beside it with a real box.
      // `[data-identity="narrow"]` — the row paints TWO identity cells and swaps them by container
      // query; the wide one is the empty box at this width, so a bare class selector is two elements.
      const identity = page.locator('.shell-topbar-identity[data-identity="narrow"]');
      expect((await identity.boundingBox())?.width ?? 0).toBeGreaterThan(0);

      // #520 IS INTACT: open a character and the LIST stops being the screen, so the trail entry stands
      // down and the landing's own doors are the only ones on the plane.
      await starlaRow(page).click();
      await expect(trail.getByRole("button", { name: "New", exact: true })).toHaveCount(0);
    });
  }
});

// The DESKTOP twin, and the arm that goes red if the phone entry leaks past its applicability: the band
// keeps its cluster and the trail carries no section primary at all.
test("#1669 @desktop: the Characters LIST band keeps its own doors and the topbar trail carries none", async ({ mount, page }) => {
  await page.setViewportSize(WIDE);
  await routeTrpc(page, charactersPlaneRoutes());
  await mount(<AppShellOnSectionStory section="characters" />);
  await expect(starlaRow(page)).toBeVisible();

  const band = page.locator('.shell-panel[data-panel-side="list"] .shell-panel-header');
  await expect(band).toBeVisible();
  await expect(band.getByRole("button", { name: "New", exact: true })).toBeVisible();
  await expect(page.locator(".shell-topbar-trail").getByRole("button", { name: "New", exact: true })).toHaveCount(0);
});

// ── #1789: THE TOPBAR TRAIL IS A LENS OVER THE ONE CHROME REGISTRY ───────────────────────────────────
// D73 says every global affordance in the shell frame is a `ChromeEntry` in ONE registry and the
// rail/topbar/You-sheet are blind lenses over the resolved list. The topbar was the half that never
// landed: `topbar.trail` was deliberately unmapped in `assembleChrome`, so the shell rendered the ⌘K chip
// from its OWN `useModalRegistry()` lookup, ahead of the registry's widgets — the zone's CONTENTS and its
// ORDER both came from a second place, and no registry answer could move either.
//
// The two pins below are mechanism proofs, not fences: the stories hand the shell a chrome registry while
// leaving the REAL modal registry underneath, so on the pre-fix source the deleted lookup still finds the
// command modal and the chip renders (and leads) no matter what the chrome registry says. Measured RED on
// 43ae0481a: the first saw the chip with ZERO trail modal entries, the second read it first at `order: -10`
// against a widget declaring `-20`.
test("#1789 the ⌘K chip is the topbar.trail MODAL entry's presentation — with no such entry there is no chip", async ({ mount, page }) => {
  await page.setViewportSize(WIDE);
  await mount(<AppShellTrailProjectionStory includeCommand={false} />);

  // Barrier on the SETTLED zone: its widget painted, so the chip's absence is a verdict about the
  // projection rather than a read taken before the trail rendered anything at all.
  await expect(page.locator(".shell-topbar-trail").getByTestId("fake-trail-widget")).toBeVisible();
  await expect(page.getByRole("button", { name: "⌘K jump — the command menu" })).toHaveCount(0);
});

test("#1789 …and with the entry present its POSITION is the registry's sort, not the lens's JSX order", async ({ mount, page }) => {
  await page.setViewportSize(WIDE);
  await mount(<AppShellTrailProjectionStory widgetOrder={-20} />);
  const trail = page.locator(".shell-topbar-trail");
  await expect(trail.getByRole("button", { name: "⌘K jump — the command menu" })).toBeVisible();

  // The widget declares an EARLIER order than the derived modal entry, so it renders first. Hardcoded
  // ahead of the zone (as the bespoke chip was), the chip cannot yield that slot to anything.
  await expect
    .poll(() => trail.locator("button").evaluateAll((elements) => elements.map((el) => el.getAttribute("data-testid") ?? el.getAttribute("aria-label") ?? "")))
    .toEqual(["fake-trail-widget", "⌘K jump — the command menu"]);
});

// A FENCE, not a defect proof (the bespoke chip was hardcoded first, so this passed before the fix): the
// PRODUCTION order is unchanged by the fold. The chip's lead position is now `commandModal.trigger.order`,
// which is the only place it is spelled.
test("#1789 @fence the production trail still LEADS with the ⌘K chip, ahead of every widget", async ({ mount, page }) => {
  await page.setViewportSize(WIDE);
  await mount(<AppShellStory />);
  const trail = page.locator(".shell-topbar-trail");
  await expect(trail.getByRole("button", { name: "⌘K jump — the command menu" })).toBeVisible();

  const names = await trail.locator("button").evaluateAll((elements) => elements.map((el) => el.getAttribute("aria-label") ?? ""));
  expect(names[0]).toBe("⌘K jump — the command menu");
  expect(names.length).toBeGreaterThan(1);
});
