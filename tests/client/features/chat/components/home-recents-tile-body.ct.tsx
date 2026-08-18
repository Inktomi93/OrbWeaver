// CT: chat's "Recent chats" HOME tile, driven through the REAL `HomeSurface` (so the per-tile
// QueryBoundary + the kicker frame + the trailing action are the shipped ones) over the REAL data layer
// (`chat.listChats` stubbed at the network by routeTrpc).
//
// These assertions MOVED here from `chat-landing-surface.ct.tsx` when the launcher moved to home
// (owner decision H1 = D-1) — same coverage, new owner.
//
// Opening a recent is a CROSS-SECTION navigation, so the click must land the chat AND move the rail:
// asserted against the shell STORE, never a rendered echo.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcHold } from "../../../../support/ct/route-trpc.ts";
import { ChatRecentsPairStory, ChatRecentsTileStory } from "../_ct-stories.tsx";
import { chatListResponder, makeChatSummary } from "../fixtures.ts";

const RECENT = makeChatSummary({ id: "chat_recent", title: "A grand adventure", participantNames: ["Wren"], participantCharacterIds: ["char_wren"] });
const GAME = makeChatSummary({ id: "chat_game", title: "The Ashfell run", participantNames: ["Wren"], isGame: true });
/** The row's description also carries its subtitle + stamp, so match the marker's datum WITHIN it. */
const GAME_MARKER_DATUM = /Game chat/u;
/** The recency STAMP the hero used to carry. It is the MASTHEAD's sentence alone now (rail sweep P2-6 —
 *  the two rendered the same instant 90px apart), so this pattern exists to assert its ABSENCE here. */
const HERO_STAMP = /last turn/u;
/** The SHORTENED cast, in credit order — the whole point of `castCredit`. */
const SHORT_CAST_LINE = /^Calamity · Morgatha$/u;
/** One seat of the fixture cast, for the island's accessible DESCRIPTION (the credit line rides it). */
const CAST_IN_DESCRIPTION = /Wren/u;
const LONG_CAST = makeChatSummary({
  id: "chat_long",
  title: "A grand adventure",
  participantNames: ["Calamity, Doomblade of the Ninth Epoch", "Morgatha, the Undying Dark"],
  participantCharacterIds: ["char_calamity", "char_morgatha"],
});
/** The character library the hero's cast strip resolves against — WITHOUT it `chatPortraits` returns [] and
 *  the hero renders no strip at all, so every assertion about the strip would pass vacuously. */
const CHARACTERS = {
  items: [
    { id: "char_calamity", name: "Calamity, Doomblade of the Ninth Epoch", avatarHash: null },
    { id: "char_morgatha", name: "Morgatha, the Undying Dark", avatarHash: null },
    { id: "char_wren", name: "Wren", avatarHash: null },
  ],
};
/** The SECOND room, so the pair has both arms: a hero AND an also-open list under it. `lastMessageAt` is
 *  older than the fixture default, which is what makes RECENT the one you would resume. */
const OLDER = makeChatSummary({ id: "chat_older", title: "The quiet ledger", participantNames: ["Wren"], lastMessageAt: 1 });
/** An also-open room with TWO character seats — the row arm of #147: two seats is where the leading slot
 *  grows from one portrait to a stack, i.e. where a late-landing character read used to move the text. */
const PAIR_ROOM = makeChatSummary({
  id: "chat_pair",
  title: "The quiet ledger",
  participantNames: ["Calamity, Doomblade of the Ninth Epoch", "Morgatha, the Undying Dark"],
  participantCharacterIds: ["char_calamity", "char_morgatha"],
  lastMessageAt: 1,
});

test("renders the HERO room in its own block, and the also-open list in a SECOND peer block", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([RECENT, OLDER]) });

  const home = await mount(<ChatRecentsPairStory />);
  const hero = home.locator('[data-home-tile="chat.recents"]');
  const list = home.locator('[data-home-tile="chat.alsoOpen"]');

  await expect(hero.getByText("Pick up where you left off")).toBeVisible();
  // The NEWEST room is the hero — the surface's one focal island, not a row in a list (#102).
  await expect(hero.locator('[data-home-hearth="chat_recent"]')).toBeVisible();
  await expect(hero.getByText("A grand adventure")).toBeVisible();
  // The credit line — the island's ONE cast rendering (the fixture's subtitle happens to be the same
  // word, hence the voice-scoped locator).
  await expect(hero.locator('[data-voice="credit"]').getByText("Wren")).toBeVisible();
  // …and everything else is the dense ALSO-OPEN list, in a block of its own — NOT inside the hero's.
  await expect(hero.locator('[data-home-tile="chat.alsoOpen"]')).toHaveCount(0);
  await expect(list.getByRole("listitem")).toHaveCount(1);
});

// ── RED-FIRST (#102 review F6): the two blocks are PEERS in the document outline ────────────────────
// Before the split, "Also open" was a `<Section kicker>` INSIDE the recents body, so it rendered an h3
// inside the region named "Pick up where you left off" — a block that is a peer of home's other six
// announcing as a child of one of them (measured outline: h1 → h2 → h3 → h2×4 → h3). This asserts through
// the rendered a11y tree, which is what a screen-reader user actually walks.
test("#102-F6 the two hearth blocks are PEER h2 regions, neither nested inside the other", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([RECENT, OLDER]) });

  await mount(<ChatRecentsPairStory />);

  const pickUp = page.getByRole("region", { name: "Pick up where you left off" });
  const alsoOpen = page.getByRole("region", { name: "Other rooms" });
  await expect(pickUp).toBeVisible();
  await expect(alsoOpen).toBeVisible();
  // Both name themselves with a real h2 — no h3 anywhere in either block.
  await expect(pickUp.getByRole("heading", { level: 2, name: "Pick up where you left off" })).toBeVisible();
  await expect(alsoOpen.getByRole("heading", { level: 2, name: "Other rooms" })).toBeVisible();
  await expect(pickUp.getByRole("heading", { level: 3 })).toHaveCount(0);
  await expect(alsoOpen.getByRole("heading", { level: 3 })).toHaveCount(0);
  // …and "Also open" is NOT a descendant of the pick-up region (the nesting the finding names).
  await expect(pickUp.getByRole("region", { name: "Other rooms" })).toHaveCount(0);
});

// ── RED-FIRST (#102 review F13): "All chats →" belongs to the also-open band ────────────────────────
test("#102-F13 the trailing 'All chats' sits on the ALSO-OPEN band, not on the pick-up row", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([RECENT, OLDER]) });

  await mount(<ChatRecentsPairStory />);

  await expect(page.getByRole("region", { name: "Other rooms" }).getByRole("button", { name: "All chats" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Pick up where you left off" }).getByRole("button", { name: "All chats" })).toHaveCount(0);
});

test("#102 ONE ROOM OPEN: the hero renders and the also-open BLOCK does not — no band over an empty list", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([RECENT]) });

  const home = await mount(<ChatRecentsPairStory />);

  await expect(home.locator('[data-home-hearth="chat_recent"]')).toBeVisible();
  await expect(home.locator('[data-home-tile="chat.alsoOpen"]')).toHaveCount(0);
  await expect(home.getByText("Other rooms")).toHaveCount(0);
});

// ── RED-FIRST (#102 review F8/F14): the ramp's `title` step, and a rule between rooms ───────────────
test("#102-F8/F14 an also-open room title outranks its own gloss, and the rooms are ruled apart", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([RECENT, OLDER, GAME]) });

  const home = await mount(<ChatRecentsPairStory />);
  const list = home.locator('[data-home-tile="chat.alsoOpen"]');

  // The ramp relation, not a px literal: the room name is a step ABOVE the subtitle beside it (it was the
  // same 15px/13px pair every dense pane runs, on the one list that IS home's content).
  const steps = await list
    .locator('[data-slot="list-row-title"]')
    .first()
    .evaluate((el) => {
      const row = el.closest('[data-slot="list-row-root"]');
      const gloss = row?.querySelector('[data-slot="list-row-subtitle"]');
      return {
        title: Number.parseFloat(globalThis.getComputedStyle(el).fontSize),
        gloss: gloss === null || gloss === undefined ? 0 : Number.parseFloat(globalThis.getComputedStyle(gloss).fontSize),
      };
    });
  expect(steps.title).toBeGreaterThan(steps.gloss);
  // …and it is the TITLE step the tier map resolves for a promoted row, not the row default the pane runs.
  const promoted = await list
    .locator('[data-slot="list-row-title"]')
    .first()
    .evaluate((el) => {
      const probe = el.ownerDocument.createElement("span");
      probe.style.fontSize = "var(--text-title)";
      el.ownerDocument.body.append(probe);
      const titleStep = globalThis.getComputedStyle(probe).fontSize;
      probe.remove();
      return { resolved: globalThis.getComputedStyle(el).fontSize, titleStep };
    });
  expect(promoted.resolved).toBe(promoted.titleStep);

  // F14: the mock rules each room off the one above it. The FIRST row carries no rule (the band's own
  // hairline is its edge); every later one does.
  const rules = await list.getByRole("listitem").evaluateAll((rows) => rows.map((row) => Number.parseFloat(globalThis.getComputedStyle(row).borderTopWidth)));
  expect(rules[0]).toBe(0);
  expect(rules.slice(1).every((width) => width > 0)).toBe(true);
});

// ── RED-FIRST (rail sweep P2-5): the focal carries NO accent border on any edge ─────────────────────
// The island shipped with a `--color-speaker` border-inline-start at `--immersive-stripe-width` (3px) over
// the card radius, which is `side-tab` AND `border-accent-on-rounded` — two ABSOLUTE impeccable rules
// (`scripts/probes/design-audit-checks.ts` `classifyAccentSide`). This asserts the RENDERED border box:
// every edge is either hairline or achromatic, so no re-spelling of the stripe can pass it. The focal is
// carried by the sanctioned pair instead — the elevated island's own shadow plus the rationed
// `--shadow-glow` on the ::before layer (a chromatic glow on the element's OWN box-shadow is the
// generated-UI tell the same file names, which is why the halo must stay on the pseudo-element).
test("#102/P2-5 CD3: the hero's focal is an elevated island + a ::before glow — never an accent border, never accent fill", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([RECENT, OLDER]) });

  const home = await mount(<ChatRecentsTileStory />);
  const hero = home.locator('[data-home-hearth="chat_recent"]');

  const paint = await hero.evaluate((el) => {
    const own = globalThis.getComputedStyle(el);
    const halo = globalThis.getComputedStyle(el, "::before");
    const probe = el.ownerDocument.createElement("span");
    probe.style.color = "var(--color-speaker)";
    el.ownerDocument.body.append(probe);
    const speaker = globalThis.getComputedStyle(probe).color;
    probe.remove();
    /** One edge, as the accent-border checker reads it: its width and its resolved colour. */
    const edges = (["Top", "Right", "Bottom", "Left"] as const).map((side) => ({
      width: Number.parseFloat(own[`border${side}Width` as "borderTopWidth"]),
      color: own[`border${side}Color` as "borderTopColor"],
    }));
    return { edges, ownShadow: own.boxShadow, haloShadow: halo.boxShadow, background: own.backgroundColor, speaker };
  });

  // No edge is BOTH thick (the checker's ≥2px accent floor) and painted in the speaker hue.
  for (const edge of paint.edges) {
    expect(edge.width).toBeLessThan(2);
    expect(edge.color).not.toBe(paint.speaker);
  }
  // The rationed halo is on the pseudo-element…
  expect(paint.haloShadow).not.toBe("none");
  // …and the ELEVATED island's own shadow is the other sanctioned carrier (`Card elevated` — the finding
  // was that the card did not read as the page's focal at all once the illegal stripe was gone).
  expect(paint.ownShadow).not.toBe("none");
  // …and the island is NOT accent-filled: a focal made of fill is the thing CD3's ≤10% ceiling exists for.
  expect(paint.background).not.toBe(paint.speaker);
});

test("#102 RAMP: the hero title is the HEADLINE step — strictly larger than an also-open row's title", async ({ mount, page }) => {
  // One of the three measured defects was that `--text-headline` (20px) and `--text-display` (24px)
  // existed in tokens.json and appeared NOWHERE. This pins the relation, not a px literal: whatever the
  // theme resolves, the one room you would resume outranks the ones you would not. It still holds after
  // F8 promoted the also-open titles to 16px — headline (20) is a step above title (16), which is the
  // whole point of a six-step ramp with one job per step.
  await routeTrpc(page, { "chat.listChats": chatListResponder([RECENT, OLDER]) });

  const home = await mount(<ChatRecentsPairStory />);

  const heroSize = await home
    .locator('[data-home-hearth="chat_recent"]')
    .getByText("A grand adventure")
    .evaluate((el) => Number.parseFloat(globalThis.getComputedStyle(el).fontSize));
  const rowSize = await home.getByText("The quiet ledger").evaluate((el) => Number.parseFloat(globalThis.getComputedStyle(el).fontSize));

  expect(heroSize).toBeGreaterThan(rowSize);
});

// ── RED-FIRST (#102 review F5): the hero announces ONCE, with a verb ────────────────────────────────
// The measured tree was `button "Sabine Veyra" > group "Sabine Veyra" > img "Sabine Veyra" > img
// "Sabine Veyra"` — the room name five times over, and a name that is a NOUN on the one control the
// landing surface exists to offer. Asserted through the accessible name, which is the affordance.
test("#102-F5 the hero is named 'Resume <room>', arrow and all art excluded", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([RECENT, OLDER]), "character.list": CHARACTERS });

  const home = await mount(<ChatRecentsTileStory />);
  const hero = home.locator('[data-home-hearth="chat_recent"]');

  // Exactly the verb phrase: no trailing "→" (rail sweep P3-14 — the visible affordance still ends in the
  // glyph, the NAME does not), and no cast names bleeding in from art that should not be in the tree.
  await expect(hero).toHaveAccessibleName("Resume A grand adventure");
  await expect(hero.getByRole("img")).toHaveCount(0);
  // …and the cast line rides the description (after the scent line).
  await expect(hero).toHaveAccessibleDescription(CAST_IN_DESCRIPTION);
});

// ── RED-FIRST (rail sweep P2-6): the island renders its cast ONCE and its recency NEVER ─────────────
// It shipped with a 3-face 64px cover-crop strip AND the mono credit line (the same cast twice, one of
// them illegible at that crop), plus "· LAST TURN 2W AGO" under a masthead sentence that already said
// "You left off 2w ago in …". Asserted through what is RENDERED — a thumbnail strip and a stamp string —
// so it compiles and fails against the old source.
test("P2-6 the hero has NO thumbnail strip and NO recency stamp — one cast rendering, no duplicated instant", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([LONG_CAST]), "character.list": CHARACTERS });

  const home = await mount(<ChatRecentsTileStory />);
  const hero = home.locator('[data-home-hearth="chat_long"]');

  await expect(hero).toBeVisible();
  await expect(hero.locator('[data-slot="avatar-stack-root"]')).toHaveCount(0);
  await expect(hero.getByText(HERO_STAMP)).toHaveCount(0);
  // The ONE cast rendering survives, and it is the credit line.
  await expect(hero.getByText(SHORT_CAST_LINE)).toBeVisible();
});

// ── RED-FIRST (rail sweep P3-17): "Resume" is a hint on the card, not a link beside it ──────────────
// The whole island is the control, and this label rendered in `text-primary` — link ink — so the eye read
// "the link is over there" and the 700px of card beside it as inert. Asserted against the RESOLVED primary
// colour rather than a literal, so it holds under every palette.
test("P3-17 the hero's Resume label is not painted as a link", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([RECENT]) });

  const home = await mount(<ChatRecentsTileStory />);
  const label = home.locator('[data-home-hearth="chat_recent"]').getByText("Resume");

  const ink = await label.evaluate((el) => {
    const probe = el.ownerDocument.createElement("span");
    probe.style.color = "var(--color-primary)";
    el.ownerDocument.body.append(probe);
    const primary = globalThis.getComputedStyle(probe).color;
    probe.remove();
    const muted = el.ownerDocument.createElement("span");
    muted.style.color = "var(--color-muted-foreground)";
    el.ownerDocument.body.append(muted);
    const mutedInk = globalThis.getComputedStyle(muted).color;
    muted.remove();
    return { own: globalThis.getComputedStyle(el).color, primary, mutedInk };
  });

  expect(ink.own).not.toBe(ink.primary);
  expect(ink.own).toBe(ink.mutedInk);
});

// ── RED-FIRST (#102 review F12/F15/P1-1): the credit line's register, size and NAME LENGTH ──────────
test("#102-F12 the hero credit line is caps micro-caps at the label step, with SHORT cast names", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([LONG_CAST]), "character.list": CHARACTERS });

  const home = await mount(<ChatRecentsTileStory />);
  const hero = home.locator('[data-home-hearth="chat_long"]');
  const credit = hero.getByText(SHORT_CAST_LINE);

  // The appositive is dropped: "Calamity, Doomblade of the Ninth Epoch" reads "Calamity" here. It is the
  // room's cast at credit length, not the character library's index.
  await expect(credit).toBeVisible();

  const type = await credit.evaluate((el) => {
    const style = globalThis.getComputedStyle(el);
    const probe = el.ownerDocument.createElement("span");
    probe.style.fontSize = "var(--text-label)";
    el.ownerDocument.body.append(probe);
    const labelStep = globalThis.getComputedStyle(probe).fontSize;
    probe.remove();
    return { size: style.fontSize, transform: style.textTransform, family: style.fontFamily, labelStep };
  });
  // F12: the mock's UPPERCASE micro-caps register, in the mono face.
  expect(type.transform).toBe("uppercase");
  expect(type.family.toLowerCase()).toContain("mono");
  // F15: and NOT below the readable floor — this line lives inside the hero's own button.
  expect(type.size).toBe(type.labelStep);
  expect(Number.parseFloat(type.size)).toBeGreaterThanOrEqual(11);
});

// The #102-RULED "the hero cast strip is SQUARE portrait art" pin was DELETED on the 2026-08-17 rail sweep
// with the strip it described (P2-5/P2-6: the same cast was already spelled out in the credit line, and at
// a 64px cover crop the faces were unreadable). The ruling it recorded — hero art is square, chats-list art
// is circular — has no live subject on this surface any more; the chats-list circle stays pinned by
// `tests/client/features/chat/surfaces/chat-list-surface.ct.tsx`. `P2-6` above is the arm that now keeps a
// strip from silently coming back.

test("opening a recent selects the chat AND moves the rail to chats — assert the STORE", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([RECENT]) });

  const home = await mount(<ChatRecentsTileStory />);
  const probe = home.locator("output");
  await expect(probe).not.toHaveText("section=chats");

  await home.getByText("A grand adventure").click();
  await expect(probe).toHaveText("section=chats");
});

test("the trailing action jumps to the chats section", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([RECENT, OLDER]) });

  const home = await mount(<ChatRecentsPairStory />);
  await home.getByRole("button", { name: "All chats" }).click();

  await expect(home.locator("output")).toHaveText("section=chats");
});

test("the rows are real LIST ITEMS, and the trailing action sits inside its own named region", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([RECENT, OLDER]) });

  const home = await mount(<ChatRecentsPairStory />);
  const alsoOpen = home.getByRole("region", { name: "Other rooms" });

  // A `role="list"` whose children are generic divs announces as an empty list to AT (side-eye F4).
  await expect(alsoOpen.getByRole("list").getByRole("listitem")).toHaveCount(1);
  // …and "All chats →" is announced under that block's heading instead of standing alone as an arrow.
  await expect(alsoOpen.getByRole("button", { name: "All chats" })).toBeVisible();
});

// Home polish, held: the side-eye receipt was `img "Game chat"` announced as a BARE SIBLING in
// `list-row-actions` — a state glyph stranded outside the row it describes, so a screen reader met it as a
// loose image after the row instead of as part of the row. The tile composes the shared `ChatSummaryRow`,
// so it inherits ListRow's title-line `markers` slot; this pins that it actually LANDED here (a tile that
// hand-rolled its rows would silently keep the orphan) — the datum rides the body's description.
test("a game row's marker is INSIDE the row's description, never an orphan beside it", async ({ mount, page }) => {
  // RECENT leads (it is the newer room), so GAME lands in the ALSO-OPEN list — which is where the shared
  // `ChatSummaryRow` anatomy, and therefore this marker slot, actually applies. The hero has its own
  // "Game" badge and is not a ListRow at all.
  await routeTrpc(page, { "chat.listChats": chatListResponder([RECENT, GAME]) });

  const home = await mount(<ChatRecentsPairStory />);
  const marker = home.getByRole("img", { name: "Game chat" });
  await expect(marker).toBeVisible();

  // It lives on the TITLE LINE, in the content column — not in the trailing cluster.
  await expect(marker.locator('xpath=ancestor::*[@data-slot="list-row-markers"]')).toHaveCount(1);
  // …and the row's own accessible description carries it, which is the whole point of the slot.
  await expect(home.getByRole("button", { name: "The Ashfell run", exact: true })).toHaveAccessibleDescription(GAME_MARKER_DATUM);
  // The orphan position doesn't even exist on this tile — it renders no row controls at all.
  await expect(home.locator('[data-slot="list-row-actions"]')).toHaveCount(0);
});

// The stickler-F1 "just now, never now ago" pin lived on the hero's recency STAMP, which the 2026-08-17
// rail sweep deleted (P2-6 — the masthead sentence one line above rendered the same instant). The ruling it
// guards is unchanged and still pinned where the sentence now lives alone:
// `tests/client/features/chat/components/home-masthead-body.ct.tsx` ("F1 the masthead reads 'You left off
// just now'"). Nothing on this tile composes a relative time any more.
//
// The #147 HERO arm ("the cast strip is born at its settled width") went the same way: its subject was the
// strip, and the tile body no longer issues the `character.list` read at all — the arm's own `trpcHold`
// barrier could never resolve, which is exactly how a test outlives its defect. The row twin below still
// pins the mechanism where portraits are still read. The hero's half is now the count assertion in the
// `P2-6` test above: zero avatar stacks, so there is nothing left that can arrive late and shove a column.

// ── RED-FIRST (#147, the row twin): a list row's leading slot is sized by the SEAT COUNT ───────────────
// Same defect one weight down: an also-open row rendered ONE 32px initials blob while the character read was
// in flight and an `AvatarStack` after it, so a two-seat room's text column moved 18px right per extra seat
// (`[data-slot=list-row-content] moved 18px,0px`, three of them in one recorded shift).
test("#147 an also-open row's leading slot is sized by the seat count — the row text does not move when the portraits land", async ({ mount, page }) => {
  const characters = trpcHold();
  await routeTrpc(page, { "chat.listChats": chatListResponder([RECENT, PAIR_ROOM]), "character.list": characters });

  const home = await mount(<ChatRecentsPairStory />);
  const row = home.locator('[data-home-tile="chat.alsoOpen"] [data-slot="list-row-content"]').first();
  await expect(row).toBeVisible();
  await characters.requested;
  const held = await row.evaluate((el) => Math.round(el.getBoundingClientRect().x));

  characters.release(CHARACTERS);
  await expect(home.locator('[data-home-tile="chat.alsoOpen"] [data-slot="avatar-stack-item"]')).toHaveCount(2);
  const landed = await row.evaluate((el) => Math.round(el.getBoundingClientRect().x));

  expect(landed).toBe(held);
});

test("an empty chats list renders a TEACHING empty state with an action, not a blank tile", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([]) });

  const home = await mount(<ChatRecentsTileStory />);
  const tile = home.locator('[data-home-tile="chat.recents"]');

  await expect(tile.getByText("No chats yet")).toBeVisible();
  await expect(tile.getByRole("button", { name: "New chat" })).toBeVisible();
});
