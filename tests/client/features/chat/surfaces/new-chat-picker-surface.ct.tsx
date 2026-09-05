// CT: the J2 new-chat character picker end-to-end. Drives the PRODUCTION path — `character.list`
// (routeTrpc, one bounded page) → `useSuspenseQuery` in `<QueryBoundary>` → the cmdk multi-select list.
// Asserts: character rows render; the "Blank chat" escape hatch is present; the confirm item's label
// reflects the live selection count (proving the multi-select toggle is wired); the search reaches the
// SERVER (owner ruling 2026-08-13) — this picker used to be ONE `limit: 100` page filtered by cmdk, so a
// character past the hundredth card could not be found here at all while she sat in the library.

import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { testId } from "../../../../../packages/client/src/lib/test-ids.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { characterListResponder, makeCharacterSummary } from "../../character/fixtures.ts";
import { CreateOnStartClickStory, NarrowNewChatPickerStory, NewChatPickerStory, TemporaryNewChatPickerStory } from "../_ct-stories.tsx";
import { CHAT_AMBIENT_ROUTES, makeMessagesPage } from "../fixtures.ts";

const ARIA = makeCharacterSummary({ id: "char_aria", name: "Aria" });
const BOLT = makeCharacterSummary({ id: "char_bolt", name: "Bolt" });
const CASS = makeCharacterSummary({ id: "char_cass", name: "Cass" });

const charPage = { items: [ARIA, BOLT], nextCursor: null, totalCount: 2 };

/** Three pickable rows — the selection count the mobile clip got WORST at (the Start label grew
 *  212→231→238px across 0→1→3 picks; side-eye 2026-08-22 #439). */
const threeCharPage = { items: [ARIA, BOLT, CASS], nextCursor: null, totalCount: 3 };

test("renders the character rows + the Blank chat escape hatch", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, "character.list": charPage });

  const component = await mount(<NewChatPickerStory />);

  await expect(component.getByText("Aria")).toBeVisible();
  await expect(component.getByText("Bolt")).toBeVisible();
  await expect(page.getByText("Blank chat")).toBeVisible();
  // #26 — the ambient default is an EMPTY saved-roster library, so the "Start from a saved roster" door
  // stays hidden (the program doc's empty-library rule: the AFFORDANCE hides, the modal keeps its own
  // empty state).
  await expect(page.getByRole("button", { name: "Start from a saved roster" })).toHaveCount(0);
});

// #26 — the saved-roster door appears exactly when the library HAS rosters (override after the spread —
// the CHAT_AMBIENT_ROUTES posture). The row is the two-sided pin for the ambient-empty assertion above.
test("a non-empty saved-roster library reveals the 'Start from a saved roster' door", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    "character.list": charPage,
    "rosterPreset.list": [
      {
        id: "roster_preset_ct",
        name: "The Troupe",
        description: "",
        memberCount: 1,
        members: [{ characterId: "char_aria", position: 0, talkativeness: null, disabled: false, name: "Aria", avatarHash: null }],
        anchorPersonaId: null,
        hasGroupConfig: false,
        rules: [],
        updatedAt: 1,
      },
    ],
  });

  await mount(<NewChatPickerStory />);

  await expect(page.getByRole("button", { name: "Start from a saved roster" })).toBeVisible();
});

test("the confirm item's label reflects the multi-select count", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, "character.list": charPage });

  const component = await mount(<NewChatPickerStory />);
  // Nothing picked yet — the confirm item teaches.
  await expect(component.getByText("Pick a character to start")).toBeVisible();

  await component.getByText("Aria").click();
  await expect(page.getByText("Start chat with 1 character")).toBeVisible();

  await component.getByText("Bolt").click();
  await expect(page.getByText("Start chat with 2 characters")).toBeVisible();
});

// #334 — THE START AFFORDANCE IS A PERSISTENT FOOTER BUTTON, not a list option. The owner selected a
// character deep in the scrolling list and had "nowhere to click to start": the enabled "Start" affordance
// used to live in the picker's `leadingGroup`, which cmdk renders INSIDE the scrolling `CommandList`, so a
// pick made past the fold scrolled the only Start control out of reach. Asserted by ROLE — `button`, not
// cmdk's `option` — so this is a defect proof against the old shape, not a build error: on the old source
// the Start control is `role="option"` and these `getByRole("button", …)` queries find nothing.
test("the Start affordance is a persistent, role=button control — disabled at 0, enabled once a character is picked (#334)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, "character.list": charPage });

  const component = await mount(<NewChatPickerStory />);
  // Discoverable before it is usable: the button is rendered and teaching, but disabled, at zero selection.
  const startBefore = component.getByRole("button", { name: "Pick a character to start" });
  await expect(startBefore).toBeVisible();
  await expect(startBefore).toBeDisabled();

  await component.getByText("Aria").click();

  const startAfter = component.getByRole("button", { name: "Start chat with 1 character" });
  await expect(startAfter).toBeVisible();
  await expect(startAfter).toBeEnabled();
});

// #852 — THE START BUTTON HAS EXACTLY ONE NAME. side-eye 2026-08-30 reported the accessible name as the
// DOUBLED `"Pick a characterPick a character to start"` and read it as an sr-only twin; there is no sr-only
// span here — the two labels are the container-query arms (`@md:hidden` / `hidden @md:flex`), and the
// hidden one is `display: none`, which is out of the accessibility tree. `toHaveAccessibleName` is EXACT by
// default, so this pin is the two-sided proof: it reds on any spelling that concatenates the arms, and it
// names the arm each width is supposed to speak.
test("#852: the Start button's accessible name is the ONE arm its width shows — never both concatenated", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, "character.list": charPage });

  const wide = await mount(<NewChatPickerStory />);
  await expect(wide.getByRole("button", { name: /Pick a character/u })).toHaveAccessibleName("Pick a character to start");
});

test("#852: the NARROW picker's Start button speaks the compact arm alone", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, "character.list": charPage });

  const narrow = await mount(<NarrowNewChatPickerStory />);
  await expect(narrow.getByRole("button", { name: /Pick a character/u })).toHaveAccessibleName("Pick a character");
});

// ── #440 — ARRIVING IN THE PICKER PUTS THE CARET IN THE SEARCH BOX ───────────────────────────────
//
// The surface used to run `useFocusOnMount` on its own `<Stack tabIndex={-1} className="outline-none">`,
// which is neither the search box nor inside cmdk's key handler: every keystroke on arrival was swallowed,
// with no focus ring on screen to explain why (side-eye 2026-08-22 P1, measured live —
// `activeElement = DIV.relative`, `cmdk-input.value === ""` after typing "ab"). The picker now hands the
// caret to `CharacterPicker`'s own `autoFocusSearch`, which fires when the ROWS mount (at open time the
// body is still the suspense fallback, so Base UI's dialog initial-focus has nothing to land on).
//
// Asserted through the rendered affordance (the combobox's value), never the prop — so it compiles against
// the old source and goes RED there.
test("typing on arrival reaches the search box — the caret starts in the combobox (#440)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, "character.list": charPage });

  const component = await mount(<NewChatPickerStory />);
  await expect(component.getByText("Aria")).toBeVisible();

  await page.keyboard.type("ar");

  await expect(component.getByRole("combobox")).toHaveValue("ar");
});

test("the Tab chain still walks Search → Blank chat (#440)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, "character.list": charPage });

  const component = await mount(<NewChatPickerStory />);
  await expect(component.getByText("Aria")).toBeVisible();

  await page.keyboard.press("Tab");

  await expect(component.getByRole("button", { name: "Blank chat" })).toBeFocused();
});

// The selection COUNT is announced (side-eye 2026-08-22 ARIA rec #2): a user whose focus is in the search
// box never hears the Start button's accessible name change, so toggling a character was silent.
test("toggling a character announces the selection count (#440)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, "character.list": charPage });

  const component = await mount(<NewChatPickerStory />);
  await component.getByText("Aria").click();

  await expect(component.getByRole("status")).toHaveText("1 character selected");

  await component.getByText("Bolt").click();
  await expect(component.getByRole("status")).toHaveText("2 characters selected");
});

// ── #439 — THE ACTION FOOTER FITS ITS NARROWEST REAL MOUNT ───────────────────────────────────────
//
// At the mobile dialog (366px) the footer was a nowrap `justify-end` row whose two buttons were wider than
// its content box, so the overflow went LEFT and "Blank chat" painted 27–35px outside the dialog, clipped
// by the popup — WORSE as the Start label grew with the selection count. Two instruments were blind to it:
// `snap --expect-no-overflow` reads `scrollWidth` (a negative overflow is invisible to it, filed as #444)
// and design-audit's `clipped-positioned-child` did not fire. A per-button rect table is the only proof,
// so that is exactly what this pin is.
/** Per-button overhang against the mount's content box, in px — the rect table the review had to fall back
 *  on, as data a test can assert on. Rounded, so sub-pixel layout noise is not a failure. */
async function footerOverhang(page: Page): Promise<readonly { readonly label: string; readonly outsideLeft: number; readonly outsideRight: number }[]> {
  const dialog = await page.getByTestId("narrow-picker-mount").boundingBox();
  const buttons = await page.getByRole("button").all();
  const rows = await Promise.all(
    buttons.map(async (button: Locator) => {
      const box = await button.boundingBox();
      return {
        label: ((await button.textContent()) ?? "").trim(),
        outsideLeft: Math.max(0, Math.round((dialog?.x ?? 0) - (box?.x ?? 0))),
        outsideRight: Math.max(0, Math.round((box?.x ?? 0) + (box?.width ?? 0) - ((dialog?.x ?? 0) + (dialog?.width ?? 0)))),
      };
    }),
  );
  return rows;
}

test("at the mobile mount no action button paints outside the dialog — 1 selection (#439)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, "character.list": threeCharPage });

  const component = await mount(<NarrowNewChatPickerStory />);
  await component.getByText("Aria").click();

  // Blank chat + Start; the picker's own count/Clear footer is absent (no search term, walk exhausted).
  await expect(page.getByRole("button")).toHaveCount(2);
  await expect
    .poll(() => footerOverhang(page), { intervals: [50, 100, 200] })
    .toEqual([
      { label: expect.stringContaining("Blank chat"), outsideLeft: 0, outsideRight: 0 },
      { label: expect.any(String), outsideLeft: 0, outsideRight: 0 },
    ]);
});

test("at the mobile mount no action button paints outside the dialog — 3 selections (#439)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, "character.list": threeCharPage });

  const component = await mount(<NarrowNewChatPickerStory />);
  await component.getByText("Aria").click();
  await component.getByText("Bolt").click();
  await component.getByText("Cass").click();

  await expect(page.getByRole("button")).toHaveCount(2);
  await expect
    .poll(() => footerOverhang(page), { intervals: [50, 100, 200] })
    .toEqual([
      { label: expect.stringContaining("Blank chat"), outsideLeft: 0, outsideRight: 0 },
      { label: expect.any(String), outsideLeft: 0, outsideRight: 0 },
    ]);
});

// ── #441 — THE ZERO-SELECTION START IS QUIET, AND ITS TEACHING COPY IS READABLE ──────────────────
//
// It rendered as the loudest primary orange fill in the modal while disabled, with the teaching label
// composited at 2.64:1 by the primitive's `disabled:opacity-50` (design-audit P1; snap --contrast reported
// a false 7.56:1 PASS because css-resolve ignores the element's own opacity). `data-cta` is the attribute
// the primary CTA's accent ring keys off — it is the rendered tell of "this is THE call to action".
test("the Start button is the primary CTA only once it can act, and its teaching copy is undimmed (#441)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, "character.list": charPage });

  const component = await mount(<NewChatPickerStory />);
  const start = component.getByRole("button", { name: "Pick a character to start" });
  await expect(start).toBeVisible();
  await expect(start).not.toHaveAttribute("data-cta", "");
  await expect.poll(() => start.evaluate((el: HTMLElement): string => globalThis.getComputedStyle(el).opacity), { intervals: [50, 100, 200] }).toBe("1");

  await component.getByText("Aria").click();

  await expect(component.getByRole("button", { name: "Start chat with 1 character" })).toHaveAttribute("data-cta", "");
});

test("the search input filters the character rows", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, "character.list": characterListResponder([ARIA, BOLT]) });

  const component = await mount(<NewChatPickerStory />);
  await expect(component.getByText("Aria")).toBeVisible();

  // cmdk owns the input's ARIA (combobox); there is exactly one per surface (its own CT queries it
  // name-less too — the aria-label doesn't resolve as the accessible name through cmdk's wiring).
  await component.getByRole("combobox").fill("bolt");
  await expect(component.getByText("Bolt")).toBeVisible();
  await expect(page.getByText("Aria")).toBeHidden();
});

// THE OWNER'S SECOND P1 SURFACE: the picker's own bounded page. The pin is a character who is NOT on the
// first page — under the old one-page-plus-cmdk shape she was unreachable from "new chat" no matter what
// was typed, which is exactly how the owner "found her in the new-chat window" only by luck.
const DEEP_LIBRARY = [
  ...Array.from({ length: 120 }, (_unused, at) => makeCharacterSummary({ id: `char_bulk_${String(at)}`, name: `Bulk ${String(at)}` })),
  makeCharacterSummary({ id: "char_deep", name: "Zephyrine" }),
];

test("typing reaches the WHOLE library — a character past the first page is findable", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, "character.list": characterListResponder(DEEP_LIBRARY) });

  const component = await mount(<NewChatPickerStory />);
  await expect(component.getByText("Bulk 0")).toBeVisible();
  // She is beyond the picker's page ceiling, so she is NOT in the DOM to be filtered client-side.
  await expect(component.getByText("Zephyrine")).toHaveCount(0);

  await component.getByRole("combobox").fill("zephyr");

  await expect.poll(() => (trpc.lastInput("character.list") as { search?: string } | undefined)?.search, { intervals: [50, 100, 200] }).toBe("zephyr");
  await expect(component.getByText("Zephyrine")).toBeVisible();
});

// ── CREATE-ON-START-CLICK (chat-creation-draft-mode-replacement.md §4.1/§4.11 R1) ────────────────────
//
// The Start affordance calls the REAL `chat.startChat` and navigates into the REAL room; the parallel
// draft-mode client runtime stops being the path. Both pins assert through affordances that exist in BOTH
// worlds, so they are defect proofs rather than build errors:
//   · the room's ⋯ menu "Rename" item — DISABLED on a draft (no server row to rename), enabled on a real
//     room. Same label, same aria-disabled attribute, in both shapes.
//   · the composer's own text — the §2.7 collision: `draftKey` was a MODULE COUNTER (`draft-N`) that resets
//     on reload, while `composer-draft-store` PERSISTS non-empty text under that key. Seed a previous
//     session's blob at `draft-2` (the first key `startNewChat` ever mints) and the first fresh room of the
//     next session inherits a stranger's unsent text. Keyed by the real ChatId the collision is
//     unrepresentable — there is no counter left to collide.

const CREATED_CHAT_ID = castId<ChatId>("chat_ct_created_on_start");

const CREATED_CHAT_DETAIL = {
  id: CREATED_CHAT_ID,
  title: null,
  participants: [],
  anchorPersonaId: null,
  identities: [],
  group: DEFAULT_GROUP_CONFIG,
  temporary: false,
  viewerIsHost: true,
  roomOverrides: {},
  background: null,
  rpg: null,
};

// The divider's present-tense preview — an unlisted-proc `null` is out-of-contract there and crashes the
// transcript (the chat-room-surface.ct.tsx note).
const PREVIEW_FIT_STUB = {
  boundaryMessageId: null,
  usedTokens: 0,
  ceilingTokens: 32_768,
  ceilingEstimated: false,
  reserveOutputTokens: 2048,
  droppedCount: 0,
  compactSummary: null,
};

/** Everything a created room needs to paint: the row itself (as `startChat`'s response AND as the read),
 *  its empty canon, and the fit preview. */
const CREATED_ROOM_ROUTES = {
  ...CHAT_AMBIENT_ROUTES,
  "character.list": { items: [ARIA, BOLT], nextCursor: null, totalCount: 2 },
  "chat.startChat": { chat: CREATED_CHAT_DETAIL, opening: null },
  "chat.getChat": CREATED_CHAT_DETAIL,
  "chat.listMessages": (): unknown => makeMessagesPage([]),
  "chat.previewContextFit": (): unknown => PREVIEW_FIT_STUB,
};

test("the Start click MINTS THE ROOM — the picker fires chat.startChat and lands in a real room, not a draft", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, CREATED_ROOM_ROUTES);

  const component = await mount(<CreateOnStartClickStory />);
  await page.getByText("Blank chat").click();

  // Barrier on the SETTLED rendered room (the composer is the room's own affordance), never on a request
  // count — a node-side count is not a browser-side settle.
  await expect(component.getByTestId(testId("composer"))).toBeVisible();

  // The room is REAL: "Rename" needs a server row, so a draft renders it aria-disabled with an unlock
  // reason. Enabled here is the whole claim.
  await component.getByRole("button", { name: "Chat options" }).click();
  const rename = page.getByRole("menuitem", { name: "Rename" });
  await expect(rename).toBeVisible();
  await expect(rename).not.toHaveAttribute("aria-disabled", "true");

  await expect.poll(() => trpc.count("chat.startChat"), { intervals: [20, 50, 100] }).toBe(1);
});

test("the persistent Start button mints the room with the PICKED characters (#334)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, CREATED_ROOM_ROUTES);

  const component = await mount(<CreateOnStartClickStory />);
  await component.getByText("Aria").click();

  // Click the FOOTER button (role=button), the affordance that stays in view after a pick — not the row.
  await component.getByRole("button", { name: "Start chat with 1 character" }).click();

  await expect(component.getByTestId(testId("composer"))).toBeVisible();
  await expect.poll(() => trpc.lastInput("chat.startChat"), { intervals: [20, 50, 100] }).toMatchObject({ characterIds: ["char_aria"] });
});

test("temporary intent survives the dev Strict Mode mount probe and reaches chat.startChat", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, CREATED_ROOM_ROUTES);
  const component = await mount(<TemporaryNewChatPickerStory />);

  await component.getByRole("button", { name: "Open temporary picker" }).click();
  await expect(component.getByTestId("new-chat-intent")).toContainText("temporary=true");
  await page.getByText("Blank chat").click();

  await expect.poll(() => trpc.lastInput("chat.startChat"), { intervals: [20, 50, 100] }).toMatchObject({ temporary: true });
});

test("a previous session's unsent composer text CANNOT repopulate a different room (the §2.7 draftKey collision)", async ({ mount, page }) => {
  // Seeded BEFORE the page's JS runs: the store rehydrates at module init, so a post-mount write would
  // prove nothing (the composer-draft-store.ct.tsx posture). `draft-2` is the FIRST key the module counter
  // ever handed a new chat — `draft-1` was minted at module load for the landing state.
  await page.addInitScript(() => {
    const drafts = { ["draft-2"]: "a stranger's unsent line" };
    globalThis.localStorage.setItem("orb:composer-draft", JSON.stringify({ state: { drafts }, version: 1 }));
  });
  await page.reload();
  await routeTrpc(page, CREATED_ROOM_ROUTES);

  const component = await mount(<CreateOnStartClickStory />);
  await page.getByText("Blank chat").click();

  await expect(component.getByTestId(testId("composer"))).toBeVisible();
  await expect(component.getByRole("textbox", { name: "Message" })).toHaveValue("");
});

// ── #1748: the shared picker's reservation key is the OWNER'S ────────────────────────────────────────
// `CharacterPicker` is mounted by eight owners, so it may never mint a `reserveKey` of its own — one literal
// inside the composite is ONE remembered box for all eight, the duplicate-key defect by a route the
// reservation gate's literal census cannot see through a shared component. The prop is a pass-through and
// every owner supplies its own; this pane is the pin for that, asserted at the OWNER (not at the composite),
// so the proof compiles against the pre-change tree and reds there for the right reason: no key, no memory.
test("#1748 the new-chat picker reserves its box under THIS owner's key, not the composite's", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, "character.list": charPage });

  const component = await mount(<NewChatPickerStory />);
  // SETTLED: the rows are the boundary's resolved child, so the measuring wrapper has run.
  await expect(component.getByText("Aria")).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const key = Object.keys(localStorage).find((k) => k.includes("surface-box"));
        const blob = key === undefined ? "{}" : (localStorage.getItem(key) ?? "{}");
        return (JSON.parse(blob) as { state?: { boxes?: Record<string, number> } }).state?.boxes?.["chat.newChatPicker"] ?? 0;
      }),
    )
    .toBeGreaterThan(0);
});
