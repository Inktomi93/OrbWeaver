// CT: the Characters section's IA — what each shell region IS, and what a selection does to them (#501,
// owner ruling 2026-08-22 "library stays docked"). Driven through the REAL section registry
// (`registry.get("characters").list()` / `.listHeader()` / `.context`), which is the production path: the
// `makeCharactersSection` door param, the chat-owned projection threaded in at the door, and the shell's own
// `SectionContextHost`. A bespoke mount of any one component would prove none of it.
//
// What it pins:
//   · the LIST pane is the LIBRARY in both arms — a selection no longer swaps it to her chats (the defect:
//     the section whose job is browsing 327 characters lost the library on every pick);
//   · the BAND has one mode — `CHARACTERS` + the create primary — and never grows a back chevron;
//   · her chats are a CONTEXT tab, carrying the same server-narrowed projection the LIST used to;
//   · the hero's "N chats ›" LANDS there (the re-pointed intent, asserted through the rendered tab state,
//     not through the store write).

import { AUTHORED_CARD_CREATOR } from "@orb/contracts/character";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { CharacterHandle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { chatListResponder, makeChatSummary, makeSeatPortrait } from "../../chat/fixtures.ts";
import { CharactersContextStory, CharactersListStory, CharactersScreenStory } from "../_ct-stories.tsx";
import { makeCharacterDetail, makeCharacterSummary } from "../fixtures.ts";

const AZARAEL = "char_ct_azarael0001";
const SERA = "char_ct_sera00000001";

const CHARACTER_PAGE = {
  items: [makeCharacterSummary({ id: AZARAEL, name: "Azarael", createdAt: 2000 }), makeCharacterSummary({ id: SERA, name: "Sera", createdAt: 1000 })],
  nextCursor: null,
  totalCount: 2,
};

const SETTINGS = { userId: "user_ct_pane", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 };

/** The band + the context tabs + the editor all read this key; the editor seeds every field off it. The
 *  RAW inputs are named separately because a derived field is re-derived from THEM, never from a finished
 *  row — see the shipped arm at the `#843` test below. */
const AZARAEL_INPUT = { id: AZARAEL, handle: castId<CharacterHandle>("azarael"), name: "Azarael" };
const AZARAEL_DETAIL = makeCharacterDetail(AZARAEL_INPUT);

const HER_CHAT = makeChatSummary({
  id: "chat_ct_newest",
  title: "Winter court",
  filterCharacterIds: [AZARAEL],
  participantNames: ["Azarael"],
  participantPortraits: [makeSeatPortrait(AZARAEL, "Azarael")],
  lastMessageAt: 300,
  updatedAt: 300,
});

async function routeAll(page: Page): Promise<void> {
  await routeTrpc(page, {
    "character.list": () => CHARACTER_PAGE,
    "character.get": () => AZARAEL_DETAIL,
    "character.update": () => AZARAEL_DETAIL,
    "chat.listChats": chatListResponder([HER_CHAT]),
    "settings.getUserSettings": () => SETTINGS,
    "worldInfo.listForCharacter": () => [],
    "persona.listConnectedToCharacter": () => [],
    "regex.listForCharacter": () => [],
    // #649 — the editor pane's STAGED tag-suggestion read was the last unfed one here, so the suggestion
    // tier ran INERT on `routeTrpc`'s null. Empty is the honest default (nothing staged for this card).
    "tag.listPendingSuggestions": () => [],
    // #841 — the CONTEXT strip carries a History tab now, so the snapshot log's read is ambient here too.
    // Empty is the honest default (nothing snapshotted for this card), and it is the arm the review
    // measured and called good.
    "character.listSnapshots": () => [],
  });
}

test("nothing selected: the LIST pane is the library and the band names the section with its ONE create primary", async ({ mount, page }) => {
  await routeAll(page);
  const component = await mount(<CharactersListStory />);

  await expect(component.getByText("Azarael", { exact: true })).toBeVisible();
  await expect(component.getByText("Sera", { exact: true })).toBeVisible();
  const band = page.getByTestId("list-band");
  await expect(band.getByRole("heading", { level: 2 })).toContainText("Characters");
  await expect(band.getByRole("heading", { level: 2 })).not.toContainText("Chats");
  await expect(band.getByRole("button", { name: "Back to all characters" })).toHaveCount(0);
  await expect(band.getByRole("button", { name: "New chat" })).toHaveCount(0);
});

// THE #501 PIN. Pre-#501 this arm rendered her CHATS in this slot and the picker was gone — "Sera" (the
// character you might look at next) had no row, and the band carried a back chevron to get her back.
test("a selection LEAVES THE LIBRARY DOCKED — every other character is still one click away", async ({ mount, page }) => {
  await routeAll(page);
  const component = await mount(<CharactersListStory selectedCharacterId={AZARAEL} />);

  // The library, whole: the open character AND the one you would look at next.
  await expect(component.getByRole("button", { name: "Azarael", exact: true })).toBeVisible();
  await expect(component.getByRole("button", { name: "Sera", exact: true })).toBeVisible();
  // …and her chats did NOT take the slot.
  await expect(component.getByText("Winter court")).toHaveCount(0);

  // The band has one mode: no back chevron to un-swap, no second create primary competing with New.
  const band = page.getByTestId("list-band");
  await expect(band.getByRole("heading", { level: 2 })).toContainText("Characters");
  await expect(band.getByRole("heading", { level: 2 })).not.toContainText("Chats");
  await expect(band.getByRole("button", { name: "Back to all characters" })).toHaveCount(0);
  await expect(band.getByRole("button", { name: "New chat" })).toHaveCount(0);
});

// …and the history the LIST stopped carrying is reachable, in CONTEXT, with the SAME rows.
test("her chats are a CONTEXT tab, carrying the server-narrowed projection", async ({ mount, page }) => {
  await routeAll(page);
  const component = await mount(<CharactersContextStory selectedCharacterId={AZARAEL} />);

  const chatsTab = component.getByRole("button", { name: "Chats", exact: true });
  await expect(chatsTab).toBeVisible();
  await chatsTab.click();
  await expect(component.getByText("Winter court")).toBeVisible();
  // The rows still name WHOSE chats these are, for a rotor reader — the identity ROW is gone (CONTENT
  // prints her portrait and name), the accessible name is not. ONE node carries it, not two.
  await expect(component.getByRole("list", { name: "Chats with Azarael" })).toBeVisible();
});

// The hero's "N chats ›" was a LIST intent (dock the pane her chats had become). It is a CONTEXT intent now,
// and the pin is the RENDERED landing — the tab the user ends up on — never the store write that got there.
test('the editor hero\'s "N chats ›" lands on the CONTEXT Chats tab', async ({ mount, page }) => {
  await routeAll(page);
  const component = await mount(<CharactersScreenStory deepLinkCharacterId={AZARAEL} />);

  await component.getByRole("button", { name: "Azarael", exact: true }).click();
  // Settled: the editor is up (its own read resolved) before anything is clicked in it.
  await expect(component.getByRole("textbox", { name: "Name" })).toHaveValue("Azarael");
  const context = component.getByTestId("context-region");
  // The resting tab is Overview — the overview card, not her chats. (It was named "Field" until #843: the
  // tab's resting body is the overview card with the pick-a-field line as its FOOTER, so "Field" described
  // the one state it was not in.) A rail CELL since #860 — a button carrying `aria-current`, never a tab.
  await expect(context.getByRole("button", { name: "Overview", exact: true })).toHaveAttribute("aria-current", "true");

  // The hero prints her census as the link's own name — one chat in this fixture.
  await component.getByTestId("content-region").getByRole("button", { name: "1 chat", exact: true }).click();

  await expect(context.getByRole("button", { name: "Chats", exact: true })).toHaveAttribute("aria-current", "true");
  await expect(context.getByText("Winter court")).toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// #841/#860 — THE SIX-SLOT META ROSTER, and the doors the junk drawer swallowed. "Options" held the theme
// editor, the Background picker, a three-paragraph Trust essay AND the snapshot log: `scrollHeight 2253` in
// a `clientHeight 693` pane, ~1560px of scrolling in a 384px column to reach the answer to "can I undo what
// I just did". The pin is the ROSTER plus the two new doors' own affordances — the defect was never that
// the snapshot log or the trust ladder did not work, it was that nothing on screen suggested they existed.
test("#841 the CONTEXT roster is the six named tabs, in order", async ({ mount, page }) => {
  await routeAll(page);
  const component = await mount(<CharactersContextStory selectedCharacterId={AZARAEL} />);

  // The roster is the context bracket's FOOT rail (#860): a toolbar of button cells, never `tab`s.
  await expect(component.locator('[data-slot="context-rail"] [data-slot="context-cell-caption"]')).toHaveText([
    "Overview",
    "Chats",
    "Links",
    "Look",
    "History",
    "Trust",
  ]);
  // …and the drawer's name is gone with the drawer.
  await expect(component.locator('[data-slot="context-rail"]').getByRole("button", { name: "Options", exact: true })).toHaveCount(0);
});

test("#841 the snapshot log is its own CONTEXT tab, one click from the open character", async ({ mount, page }) => {
  await routeAll(page);
  const component = await mount(<CharactersContextStory selectedCharacterId={AZARAEL} />);

  await component.locator('[data-slot="context-rail"]').getByRole("button", { name: "History", exact: true }).click();
  // The log's own affordance — the thing that used to be 1560px down the Options tab.
  await expect(component.getByRole("button", { name: "Snapshot now" })).toBeVisible();
  // …and its empty state, which the review found good and this change must not disturb.
  await expect(component.getByText("No snapshots yet.", { exact: false })).toBeVisible();
});

test("#841 Trust is its own door too — a security concern reads as one", async ({ mount, page }) => {
  await routeAll(page);
  const component = await mount(<CharactersContextStory selectedCharacterId={AZARAEL} />);

  await component.locator('[data-slot="context-rail"]').getByRole("button", { name: "Trust", exact: true }).click();
  await expect(component.getByRole("combobox", { name: "HTML rendering" })).toBeVisible();
  await expect(component.getByRole("combobox", { name: "External media" })).toBeVisible();
  // …and the LOOK tab is where the colours are, not here — the split is real on both sides.
  await expect(component.getByText("Accent", { exact: true })).toHaveCount(0);
});

// #843 — SHIPPED EXAMPLE CARDS SAID `Made here`. On a fresh install every one of the ten default
// characters told the user they had authored it, on the Origin card whose entire job is provenance, in the
// first state a new user ever sees.
//
// WHAT THIS PROVES MOVED WITH #865, AND SO DID THE SEAM. The card no longer re-derives the verdict from
// `creator`; the server derives it once (`characterProvenanceOf`) and ships `provenance` on BOTH read
// models, so what the wire says here is `provenance: "shipped"`. This file now pins the LABEL DISPATCH (the
// three arms and their words); the DERIVATION from `creator`/`importedFrom` is pinned where it now lives —
// `tests/contracts/character/index.contract.test.ts` and the character persistence/list int suites.
test("#843 the Origin card tells a shipped example card apart from one you made", async ({ mount, page }) => {
  await routeTrpc(page, {
    "character.list": () => CHARACTER_PAGE,
    // #900 — the shipped arm is DERIVED, not declared twice. This used to spread a hand-set
    // `creator: "orbweaver"` AND a hand-set `provenance: "shipped"` past the factory; now only the RAW
    // column is stated (the shared marker the seeder stamps, not a re-typed literal) and
    // `characterProvenanceOf` answers the verdict, so it cannot drift from the columns that produce it.
    // BUILT FROM `AZARAEL_INPUT`, NOT FROM `AZARAEL_DETAIL`: a derived field on the OVERRIDES is an
    // explicit pin (`overrides.provenance ?? …`), so re-running the factory over a finished row carries
    // the OLD verdict forward — measured, this file's #843 pin went red rendering `Made here`.
    "character.get": () => makeCharacterDetail({ ...AZARAEL_INPUT, creator: AUTHORED_CARD_CREATOR }),
    "character.update": () => AZARAEL_DETAIL,
    "chat.listChats": chatListResponder([]),
    "settings.getUserSettings": () => SETTINGS,
    "worldInfo.listForCharacter": () => [],
    "persona.listConnectedToCharacter": () => [],
    "regex.listForCharacter": () => [],
    "tag.listPendingSuggestions": () => [],
    "character.listSnapshots": () => [],
  });
  const component = await mount(<CharactersContextStory selectedCharacterId={AZARAEL} />);

  await expect(component.getByText("Origin", { exact: true })).toBeVisible();
  await expect(component.getByText("Example — shipped with Orbweaver")).toBeVisible();
  await expect(component.getByText("Made here", { exact: true })).toHaveCount(0);
});

// …and the two-sided control: a card with NO shipped marker still reads as the owner's own work, so this
// is a third arm on a three-arm fact, not a blanket relabel.
test("#843 a card without the shipped marker still reads as Made here", async ({ mount, page }) => {
  await routeAll(page);
  const component = await mount(<CharactersContextStory selectedCharacterId={AZARAEL} />);

  await expect(component.getByText("Origin", { exact: true })).toBeVisible();
  await expect(component.getByText("Made here", { exact: true })).toBeVisible();
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// #860 — THE HEAD BAND. The Characters pane joined the context bracket: the open character's identity sits
// in the band slot ABOVE the viewport (portrait · name · @handle · chips) and the six-cell roster is the
// FOOT rail, named for the artifact. Pre-#860 the pane opened on a bare "Detail" `tablist` and no identity
// at all — the CONTENT hero was the only place her name was printed, so a docked pane read as six anonymous
// tabs. The pin is the RENDERED band over the RENDERED rail, in that order, and the absence of the strip.
test("#860 the CONTEXT head band is the open character's identity, over a foot rail named for the artifact", async ({ mount, page }) => {
  await routeAll(page);
  const component = await mount(<CharactersContextStory selectedCharacterId={AZARAEL} />);

  const band = component.locator('[data-slot="character-context-band"]');
  await expect(band.getByRole("heading", { level: 2, name: "Azarael" })).toBeVisible();
  await expect(band.getByText("@azarael", { exact: true })).toBeVisible();
  // The chips: the census (one chat in this fixture — the same page-of-one the hero's link spends) and the
  // token estimate (the editor's own estimator, so the two can never disagree).
  await expect(band.getByText("1 chat", { exact: true })).toBeVisible();
  await expect(band.locator('[data-slot="character-context-band-tokens"]')).toHaveText(/^\d[\d,]* tokens$/);
  // No override on this card → NO "Own look" mark: the honest absence, not a marker for a false fact.
  await expect(band.getByRole("button", { name: "Own look" })).toHaveCount(0);

  // The roster is the FOOT rail — one toolbar named "Character", its kicker on top reading the selection —
  // and it sits BELOW the band in the column. The retired head strip is gone: no tablist anywhere.
  const rail = component.getByRole("toolbar", { name: "Character" });
  await expect(rail).toBeVisible();
  await expect(component.locator('[data-slot="context-rail-kicker"]')).toHaveText(/Character · Overview/);
  await expect(component.getByRole("tablist")).toHaveCount(0);
  const bandBox = await band.boundingBox();
  const railBox = await rail.boundingBox();
  if (bandBox === null || railBox === null) {
    throw new Error("band and rail must both be laid out");
  }
  expect(bandBox.y + bandBox.height).toBeLessThanOrEqual(railBox.y);
});

// …and the two-sided control on the mark: a card that DOES carry a look says so, in the band, as the same
// focusable trigger the hero prints (one component, one predicate — a second spelling here would drift).
test("#860 a card with its own look carries the Own look mark in the band", async ({ mount, page }) => {
  await routeTrpc(page, {
    "character.list": () => CHARACTER_PAGE,
    // `accent` is a card-embeddable `ThemeOverride` key; `primary` is a rendered CSS custom property and
    // never a wire key, so a stub carrying it projects to an empty card theme and the mark stays hidden.
    "character.get": () => ({ ...AZARAEL_DETAIL, themeOverride: { accent: "#ff8800" } }),
    "character.update": () => AZARAEL_DETAIL,
    "chat.listChats": chatListResponder([]),
    "settings.getUserSettings": () => SETTINGS,
    "worldInfo.listForCharacter": () => [],
    "persona.listConnectedToCharacter": () => [],
    "regex.listForCharacter": () => [],
    "tag.listPendingSuggestions": () => [],
    "character.listSnapshots": () => [],
  });
  const component = await mount(<CharactersContextStory selectedCharacterId={AZARAEL} />);

  const band = component.locator('[data-slot="character-context-band"]');
  await expect(band.getByRole("button", { name: "Own look" })).toBeVisible();
  // …and the census reads the empty arm honestly — plural, zero — rather than hiding the chip.
  await expect(band.getByText("0 chats", { exact: true })).toBeVisible();

  // #875 F6: the Own-look trigger is a BUTTON'S VISIBLE LABEL, and `context-rail.tsx` 300px away refuses
  // to draw interactive text below 11px ("the readable-floor ruling stands") while the mock's 10.5px
  // captions go unfollowed. This band shipped at the micro step anyway — `design-audit` reported
  // `undersized-ui-text` on `character-context-band` in every arm. `interactiveKicker` is the same
  // micro-caps instrument register at the readable 13px step; a design-audit row proves a day, this
  // proves every day.
  const ownLookLabel = band.getByRole("button", { name: "Own look" }).locator('[data-slot="text"]');
  await expect.poll(() => ownLookLabel.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(READABLE_FLOOR_PX);
});

/** The 11px interactive-text floor (side-eye #102 — the ruling that drove sub-11px interactive text to
 *  zero, restated at every band by #875 F6). A literal because it is the ruling's own number. */
const READABLE_FLOOR_PX = 11;

// THE PHONE ARM (#860 — `CharacterMobile.png`, the 430 sheet at a coarse pointer): the same column, every
// cell at the coarse height floor, and the SIX cells + the actions kebab fit the sheet's width in ONE row
// with no horizontal scroll. This fence CAN fail: MEASURED at a 384-wide coarse pane (a tablet-docked
// panel, not the phone) the cells' 44px touch floors overflow the track by 11px (scrollWidth 323 against
// clientWidth 312) — the rail scrolls there. At 430 the track has ~35px to spare, which is the arm the
// mock draws and the one this pins.
test.describe("phone", () => {
  test.use({ hasTouch: true });

  test("#860 at 430 coarse the six cells sit at the touch floor and fit the sheet in one row", async ({ mount, page }) => {
    await page.setViewportSize({ width: 430, height: 860 });
    await routeAll(page);
    const component = await mount(<CharactersContextStory selectedCharacterId={AZARAEL} paneWidth={430} />);

    const rail = component.getByRole("toolbar", { name: "Character" });
    await expect(rail.getByRole("button")).toHaveCount(6);
    // The SHORTEST cell clears the floor (so every cell does)…
    await expect
      .poll(() => rail.getByRole("button").evaluateAll((nodes) => Math.min(...nodes.map((n) => n.getBoundingClientRect().height))))
      .toBeGreaterThanOrEqual(52);
    // …and the track has nothing to scroll: its overflow is zero.
    await expect.poll(() => rail.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  });
});
