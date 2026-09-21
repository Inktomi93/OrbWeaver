// CT: chat's "Recent chats" HOME tile, driven through the REAL `HomeSurface` (so the per-tile
// QueryBoundary + the kicker frame + the trailing action are the shipped ones) over the REAL data layer
// (`chat.listChats` stubbed at the network by routeTrpc).
//
// These assertions MOVED here from `chat-landing-surface.ct.tsx` when the launcher moved to home
// (owner decision H1 = D-1) — same coverage, new owner.
//
// Opening a recent is a CROSS-SECTION navigation, so the click must land the chat AND move the rail:
// asserted against the shell STORE, never a rendered echo.
//
// `CHAT_ROOM_ROUTES` is AMBIENT to every mount here since #1126: the hearth tile WARMS the room it offers
// (`usePrefetchRoom` — `chat.getChat` leaves with the tile's MOUNT rather than with the Resume click), so
// the roster key is requested by every tree in this file. Fed at its honest empty default so the warm-up
// runs for real instead of resolving routeTrpc's null; the last test in the file is the one whose SUBJECT
// it is. The map's `chat.listMessages` row rides along because the two are one feed — the owner ruled that
// read is NOT warmed (`use-prefetch-room.ts` carries the numbers), so nothing here requests it.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcHold } from "../../../../support/node/route-trpc.ts";
import { ChatRecentsHeroArtStory, ChatRecentsMobileStory, ChatRecentsPairStory, ChatRecentsTileStory } from "../_ct-stories.tsx";
import { CHAT_ROOM_ROUTES, chatListResponder, makeChatSummary, makeSeatPortrait } from "../fixtures.ts";

// Since #192 a room's faces ride the ROW (`ChatSummary.participantPortraits`), so a seat is a fixture
// field rather than an entry in a character-library stub the surface had to fetch and index.
const WREN_SEAT = makeSeatPortrait("char_wren", "Wren");
const CALAMITY_SEAT = makeSeatPortrait("char_calamity", "Calamity, Doomblade of the Ninth Epoch");
const MORGATHA_SEAT = makeSeatPortrait("char_morgatha", "Morgatha, the Undying Dark");
const RECENT = makeChatSummary({
  id: "chat_recent",
  title: "A grand adventure",
  participantNames: ["Wren"],
  filterCharacterIds: ["char_wren"],
  participantPortraits: [WREN_SEAT],
});
const GAME = makeChatSummary({ id: "chat_game", title: "The Ashfell run", participantNames: ["Wren"], isGame: true });
/** The row's description also carries its subtitle + stamp, so match the marker's datum WITHIN it. */
const GAME_MARKER_DATUM = /Game chat/u;
/** The recency STAMP the hero used to carry. It is the MASTHEAD's sentence alone now (rail sweep P2-6 —
 *  the two rendered the same instant 90px apart), so this pattern exists to assert its ABSENCE here. */
const HERO_STAMP = /last turn/u;
/** The SHORTENED character names, in credit order — the whole point of `characterCredit`. */
const SHORT_CREDIT_LINE = /^Calamity · Morgatha$/u;
/** One seat of the fixture room, for the island's accessible DESCRIPTION (the credit line rides it). */
const CHARACTER_IN_DESCRIPTION = /Wren/u;
const LONG_ROOM = makeChatSummary({
  id: "chat_long",
  title: "A grand adventure",
  participantNames: ["Calamity, Doomblade of the Ninth Epoch", "Morgatha, the Undying Dark"],
  filterCharacterIds: ["char_calamity", "char_morgatha"],
  participantPortraits: [CALAMITY_SEAT, MORGATHA_SEAT],
});
/** The SECOND room, so the pair has both arms: a hero AND an also-open list under it. `lastMessageAt` is
 *  older than the fixture default, which is what makes RECENT the one you would resume. */
const OLDER = makeChatSummary({ id: "chat_older", title: "The quiet ledger", participantNames: ["Wren"], lastMessageAt: 1 });
/** An also-open room with TWO character seats — the row arm of #147: two seats is where the leading slot
 *  grows from one portrait to a stack, i.e. where a late-landing character read used to move the text. */
const PAIR_ROOM = makeChatSummary({
  id: "chat_pair",
  title: "The quiet ledger",
  participantNames: ["Calamity, Doomblade of the Ninth Epoch", "Morgatha, the Undying Dark"],
  filterCharacterIds: ["char_calamity", "char_morgatha"],
  participantPortraits: [CALAMITY_SEAT, MORGATHA_SEAT],
  lastMessageAt: 1,
});

test("renders the HERO room in its own block, and the also-open list in a SECOND peer block", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([RECENT, OLDER]) });

  const home = await mount(<ChatRecentsPairStory />);
  const hero = home.locator('[data-home-tile="chat.recents"]');
  const list = home.locator('[data-home-tile="chat.alsoOpen"]');

  await expect(hero.getByText("Pick up where you left off")).toBeVisible();
  // The NEWEST room is the hero — the surface's one focal island, not a row in a list (#102).
  await expect(hero.locator('[data-home-hearth="chat_recent"]')).toBeVisible();
  await expect(hero.getByText("A grand adventure")).toBeVisible();
  // The credit line — the island's ONE character rendering (the fixture's subtitle happens to be the same
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
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([RECENT, OLDER]) });

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
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([RECENT, OLDER]) });

  await mount(<ChatRecentsPairStory />);

  await expect(page.getByRole("region", { name: "Other rooms" }).getByRole("button", { name: "All chats" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Pick up where you left off" }).getByRole("button", { name: "All chats" })).toHaveCount(0);
});

test("#102 ONE ROOM OPEN: the hero renders and the also-open BLOCK does not — no band over an empty list", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([RECENT]) });

  const home = await mount(<ChatRecentsPairStory />);

  await expect(home.locator('[data-home-hearth="chat_recent"]')).toBeVisible();
  await expect(home.locator('[data-home-tile="chat.alsoOpen"]')).toHaveCount(0);
  await expect(home.getByText("Other rooms")).toHaveCount(0);
});

// ── RED-FIRST (#102 review F8/F14): the ramp's `title` step, and a rule between rooms ───────────────
test("#102-F8/F14 an also-open room title outranks its own gloss, and the rooms are ruled apart", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([RECENT, OLDER, GAME]) });

  const home = await mount(<ChatRecentsPairStory />);
  const list = home.locator('[data-home-tile="chat.alsoOpen"]');

  // The ramp relation, not a px literal: the room name is a step ABOVE the subtitle beside it (it was the
  // same 15px/13px pair every dense pane runs, on the one list that IS home's content).
  const readStepsAtAssertion = async (): Promise<typeof steps> =>
    await list
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
  await expect.poll(async () => (await readStepsAtAssertion()).title).toBeGreaterThan(steps.gloss);
  // …and it is the TITLE step the tier map resolves for a promoted row, not the row default the pane runs.
  const readPromotedAtAssertion = async (): Promise<typeof promoted> =>
    await list
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
  await expect.poll(async () => (await readPromotedAtAssertion()).resolved).toBe(promoted.titleStep);

  // F14: the mock rules each room off the one above it. The FIRST row carries no rule (the band's own
  // hairline is its edge); every later one does.
  const rules = await list.getByRole("listitem").evaluateAll((rows) => rows.map((row) => Number.parseFloat(globalThis.getComputedStyle(row).borderTopWidth)));
  expect(rules[0]).toBe(0);
  expect(rules.slice(1).every((width) => width > 0)).toBe(true);
});

// ── RED-FIRST (rail sweep P2-5): the focal carries NO accent border on any edge ─────────────────────
// The island shipped with a `--color-speaker` border-inline-start at `--immersive-stripe-width` (3px) over
// the card radius, which is `side-tab` AND `border-accent-on-rounded` — two ABSOLUTE impeccable rules
// (`tooling/src/ui-audit/lib/checks-decor.ts` `classifyAccentSide`). This asserts the RENDERED border box:
// every edge is either hairline or achromatic, so no re-spelling of the stripe can pass it. The focal is
// carried by the sanctioned pair instead — the elevated island's own shadow plus the rationed
// `--shadow-glow` on the ::before layer (a chromatic glow on the element's OWN box-shadow is the
// generated-UI tell the same file names, which is why the halo must stay on the pseudo-element).
test("#102/P2-5 CD3: the hero's focal is an elevated island + a ::before glow — never an accent border, never accent fill", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([RECENT, OLDER]) });

  const home = await mount(<ChatRecentsTileStory />);
  const hero = home.locator('[data-home-hearth="chat_recent"]');

  const readPaintAtAssertion = async (): Promise<typeof paint> =>
    await hero.evaluate((el) => {
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
  await expect.poll(async () => (await readPaintAtAssertion()).haloShadow).not.toBe("none");
  // …and the ELEVATED island's own shadow is the other sanctioned carrier (`Card elevated` — the finding
  // was that the card did not read as the page's focal at all once the illegal stripe was gone).
  await expect.poll(async () => (await readPaintAtAssertion()).ownShadow).not.toBe("none");
  // …and the island is NOT accent-filled: a focal made of fill is the thing CD3's ≤10% ceiling exists for.
  await expect.poll(async () => (await readPaintAtAssertion()).background).not.toBe(paint.speaker);
});

test("#102 RAMP: the hero title is the HEADLINE step — strictly larger than an also-open row's title", async ({ mount, page }) => {
  // One of the three measured defects was that `--text-headline` (20px) and `--text-display` (24px)
  // existed in tokens.json and appeared NOWHERE. This pins the relation, not a px literal: whatever the
  // theme resolves, the one room you would resume outranks the ones you would not. It still holds after
  // F8 promoted the also-open titles to 16px — headline (20) is a step above title (16), which is the
  // whole point of a six-step ramp with one job per step.
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([RECENT, OLDER]) });

  const home = await mount(<ChatRecentsPairStory />);

  const rowSize = await home.getByText("The quiet ledger").evaluate((el) => Number.parseFloat(globalThis.getComputedStyle(el).fontSize));

  await expect
    .poll(async () =>
      home
        .locator('[data-home-hearth="chat_recent"]')
        .getByText("A grand adventure")
        .evaluate((el) => Number.parseFloat(globalThis.getComputedStyle(el).fontSize)),
    )
    .toBeGreaterThan(rowSize);
});

// ── RED-FIRST (#102 review F5): the hero announces ONCE, with a verb ────────────────────────────────
// The measured tree was `button "Sabine Veyra" > group "Sabine Veyra" > img "Sabine Veyra" > img
// "Sabine Veyra"` — the room name five times over, and a name that is a NOUN on the one control the
// landing surface exists to offer. Asserted through the accessible name, which is the affordance.
test("#102-F5 the hero is named 'Resume <room>', arrow and all art excluded", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([RECENT, OLDER]) });

  const home = await mount(<ChatRecentsTileStory />);
  const hero = home.locator('[data-home-hearth="chat_recent"]');

  // Exactly the verb phrase: no trailing "→" (rail sweep P3-14 — the visible affordance still ends in the
  // glyph, the NAME does not), and no character names bleeding in from art that should not be in the tree.
  await expect(hero).toHaveAccessibleName("Resume A grand adventure");
  await expect(hero.getByRole("img")).toHaveCount(0);
  // …and the credit line rides the description (after the scent line).
  await expect(hero).toHaveAccessibleDescription(CHARACTER_IN_DESCRIPTION);
});

// ── RED-FIRST (rail sweep P2-6): the island renders its characters ONCE and its recency NEVER ─────────────
// It shipped with a 3-face 64px cover-crop strip AND the mono credit line (the same characters twice, one of
// them illegible at that crop), plus "· LAST TURN 2W AGO" under a masthead sentence that already said
// "You left off 2w ago in …". Asserted through what is RENDERED — a thumbnail strip and a stamp string —
// so it compiles and fails against the old source.
test("P2-6 the hero has NO thumbnail strip and NO recency stamp — one character rendering, no duplicated instant", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([LONG_ROOM]) });

  const home = await mount(<ChatRecentsTileStory />);
  const hero = home.locator('[data-home-hearth="chat_long"]');

  await expect(hero).toBeVisible();
  await expect(hero.locator('[data-slot="avatar-stack-root"]')).toHaveCount(0);
  await expect(hero.getByText(HERO_STAMP)).toHaveCount(0);
  // The ONE character rendering survives, and it is the credit line.
  await expect(hero.getByText(SHORT_CREDIT_LINE)).toBeVisible();
});

// ── RED-FIRST (rail sweep P3-17): "Resume" is a hint on the card, not a link beside it ──────────────
// The whole island is the control, and this label rendered in `text-primary` — link ink — so the eye read
// "the link is over there" and the 700px of card beside it as inert. Asserted against the RESOLVED primary
// colour rather than a literal, so it holds under every palette.
test("P3-17 the hero's Resume label is not painted as a link", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([RECENT]) });

  const home = await mount(<ChatRecentsTileStory />);
  const label = home.locator('[data-home-hearth="chat_recent"]').getByText("Resume");

  const readInkAtAssertion = async (): Promise<typeof ink> =>
    await label.evaluate((el) => {
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

  await expect.poll(async () => (await readInkAtAssertion()).own).not.toBe(ink.primary);
  await expect.poll(async () => (await readInkAtAssertion()).own).toBe(ink.mutedInk);
});

// ── RED-FIRST (#102 review F12/F15/P1-1): the credit line's register, size and NAME LENGTH ──────────
test("#102-F12 the hero credit line is caps micro-caps at the label step, with SHORT character names", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([LONG_ROOM]) });

  const home = await mount(<ChatRecentsTileStory />);
  const hero = home.locator('[data-home-hearth="chat_long"]');
  const credit = hero.getByText(SHORT_CREDIT_LINE);

  // The appositive is dropped: "Calamity, Doomblade of the Ninth Epoch" reads "Calamity" here. It is the
  // room's characters at credit length, not the character library's index.
  await expect(credit).toBeVisible();

  const readTypeAtAssertion = async (): Promise<typeof type> =>
    await credit.evaluate((el) => {
      const style = globalThis.getComputedStyle(el);
      const probe = el.ownerDocument.createElement("span");
      probe.style.fontSize = "var(--text-label)";
      el.ownerDocument.body.append(probe);
      const labelStep = globalThis.getComputedStyle(probe).fontSize;
      probe.remove();
      return { size: style.fontSize, transform: style.textTransform, family: style.fontFamily, labelStep };
    });
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
  await expect.poll(async () => (await readTypeAtAssertion()).transform).toBe("uppercase");
  await expect.poll(async () => (await readTypeAtAssertion()).family.toLowerCase()).toContain("mono");
  // F15: and NOT below the readable floor — this line lives inside the hero's own button.
  await expect.poll(async () => (await readTypeAtAssertion()).size).toBe(type.labelStep);
  await expect.poll(async () => Number.parseFloat((await readTypeAtAssertion()).size)).toBeGreaterThanOrEqual(11);
});

// The #102-RULED "the hero face strip is SQUARE portrait art" pin was DELETED on the 2026-08-17 rail sweep
// with the strip it described (P2-5/P2-6: the same characters were already spelled out in the credit line, and at
// a 64px cover crop the faces were unreadable). The ruling it recorded — hero art is square, chats-list art
// is circular — has no live subject on this surface any more; the chats-list circle stays pinned by
// `tests/client/features/chat/surfaces/chat-list-surface.ct.tsx`. `P2-6` above is the arm that now keeps a
// strip from silently coming back.

test("opening a recent selects the chat AND moves the rail to chats — assert the STORE", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([RECENT]) });

  const home = await mount(<ChatRecentsTileStory />);
  const probe = home.locator("output");
  await expect(probe).not.toHaveText("section=chats");

  await home.getByText("A grand adventure").click();
  await expect(probe).toHaveText("section=chats");
});

test("the trailing action jumps to the chats section", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([RECENT, OLDER]) });

  const home = await mount(<ChatRecentsPairStory />);
  await home.getByRole("button", { name: "All chats" }).click();

  await expect(home.locator("output")).toHaveText("section=chats");
});

test("the rows are real LIST ITEMS, and the trailing action sits inside its own named region", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([RECENT, OLDER]) });

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
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([RECENT, GAME]) });

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
// The #147 HERO arm ("the face strip is born at its settled width") went the same way: its subject was the
// STRIP, which is still deleted. The hero's remaining half is the count assertion in the `P2-6` test above:
// zero avatar stacks, so there is nothing left that can arrive late and shove a column.

// ── #147 (the row twin) AS #192 SETTLED IT: there is no second read to be late ─────────────────────────
// The defect: an also-open row rendered ONE 32px initials blob while a whole-library `character.list` was in
// flight and an `AvatarStack` after it, so a two-seat room's text column moved 18px right per extra seat
// (`[data-slot=list-row-content] moved 18px,0px`, three of them in one recorded shift). #147 fixed it by
// sizing the slot off the seat COUNT, which the row already carried. #192 removed the second clock entirely:
// the seats ride the row. So the pin is now the STRONGER claim — the stack paints from the chat page alone,
// with `character.list` held open forever, and the row is at its settled width in that state. A regression
// that reintroduces a portrait read would hang here rather than merely shifting.
test("#147/#192 an also-open row's faces come from the CHAT page — held-open character.list, settled width anyway", async ({ mount, page }) => {
  const characters = trpcHold();
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([RECENT, PAIR_ROOM]), "character.list": characters });

  const home = await mount(<ChatRecentsPairStory />);
  const row = home.locator('[data-home-tile="chat.alsoOpen"] [data-slot="list-row-content"]').first();
  await expect(row).toBeVisible();
  // The two-seat room's stack is THERE while the character read is still pending — its faces never depended
  // on it. (`trpcHold` is never released: nothing in this pane may wait on that read.)
  await expect(home.locator('[data-home-tile="chat.alsoOpen"] [data-slot="avatar-stack-item"]')).toHaveCount(2);
  await expect.poll(async () => row.evaluate((el) => Math.round(el.getBoundingClientRect().x))).toBeGreaterThan(0);
});

test("an empty chats list renders a TEACHING empty state with an action, not a blank tile", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([]) });

  const home = await mount(<ChatRecentsTileStory />);
  const tile = home.locator('[data-home-tile="chat.recents"]');

  await expect(tile.getByText("No chats yet")).toBeVisible();
  await expect(tile.getByRole("button", { name: "New chat" })).toBeVisible();
});

// ── #205 THE HERO'S ART BLEED (owner-ruled 2026-08-18: "Hero gets its room's art") ────────────────────
// The landing's one focal island had no chroma, so the character photo grid across the shelf won every
// cold eye. The room's own portrait now bleeds in from the island's inline END and dissolves before it
// reaches any ink. What these pin is the part that is a PROMISE rather than a picture: that the bleed is
// decoration to AT, that it carries no character datum (the P2-5/P2-6 fact-once ruling this island was rebuilt
// under), and that the "faded to clean surface before the prose" half is GEOMETRY — the band starts where
// the content column is capped, so nothing has to be trusted about a gradient's alpha.

/** The same room with a seat that HAS a portrait — without a hash the hero has nothing to bleed and every
 *  art assertion would pass vacuously against a room that simply has no art. */
const LONG_ROOM_WITH_ART = makeChatSummary({
  id: "chat_long",
  title: "A grand adventure",
  participantNames: ["Calamity, Doomblade of the Ninth Epoch", "Morgatha, the Undying Dark"],
  filterCharacterIds: ["char_calamity", "char_morgatha"],
  participantPortraits: [{ ...CALAMITY_SEAT, avatarHash: "hash_calamity_portrait" }, MORGATHA_SEAT],
});
/** The FIRST seat's hash — the room's art is its first seat that has one, the same "one room, one face"
 *  rule the shared summary row applies to a single-avatar chat. */
const FIRST_SEAT_HASH = /hash_calamity_portrait/u;

test("#205 the hero wears its room's art as a bleed — and it is DECORATION: aria-hidden, no character datum", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([LONG_ROOM_WITH_ART]) });

  const home = await mount(<ChatRecentsHeroArtStory />);
  const art = home.locator('[data-slot="art-bleed"]');
  await expect(art).toHaveCount(1);
  // It paints the ROOM's art, not a placeholder — the first seat that has a portrait.
  await expect(art).toHaveCSS("background-image", FIRST_SEAT_HASH);
  // …and it is invisible to AT: no role, no name, and the island's own name is still the VERB it was
  // rebuilt to be (side-eye F5 — a held-under-attack pin this change must not regress).
  await expect(art).toHaveAttribute("aria-hidden", "true");
  await expect(home.getByRole("button", { name: `Resume ${LONG_ROOM.title}` })).toBeVisible();
  // The strip P2-5 deleted is still deleted: the bleed restores CHROMA, never a second character rendering.
  await expect(home.locator('[data-slot="avatar-stack-item"]')).toHaveCount(0);
  await expect(home.getByText(SHORT_CREDIT_LINE)).toHaveCount(1);
});

test("#205 the bleed starts where the prose stops — NO ink over art, at either width", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([LONG_ROOM_WITH_ART]) });

  const home = await mount(<ChatRecentsHeroArtStory />);
  await expect(home.locator('[data-slot="art-bleed"]')).toBeAttached();

  // Every ink inside the island, measured against the band's own start edge. This is the whole legibility
  // argument: no plate is invoked because no text sits on art, and that is only true if it is TRUE.
  const readOverlapAtAssertion = async (): Promise<typeof overlap> =>
    await home.locator('[data-home-hearth="chat_long"]').evaluate((island) => {
      const band = island.querySelector('[data-slot="art-bleed"]')?.getBoundingClientRect();
      const inks = [...island.querySelectorAll("span,p")]
        .map((el) => ({ text: (el.textContent ?? "").trim().slice(0, 24), right: el.getBoundingClientRect().right }))
        .filter((ink) => ink.text.length > 0);
      return {
        bandLeft: band?.left ?? 0,
        bandWidth: band?.width ?? 0,
        worst: inks.reduce((max, ink) => (ink.right > max.right ? ink : max), { text: "", right: 0 }),
      };
    });
  const overlap = await home.locator('[data-home-hearth="chat_long"]').evaluate((island) => {
    const band = island.querySelector('[data-slot="art-bleed"]')?.getBoundingClientRect();
    const inks = [...island.querySelectorAll("span,p")]
      .map((el) => ({ text: (el.textContent ?? "").trim().slice(0, 24), right: el.getBoundingClientRect().right }))
      .filter((ink) => ink.text.length > 0);
    return {
      bandLeft: band?.left ?? 0,
      bandWidth: band?.width ?? 0,
      worst: inks.reduce((max, ink) => (ink.right > max.right ? ink : max), { text: "", right: 0 }),
    };
  });
  // The band is REAL at a desktop width (a zero-width band would make the assertion below vacuous).
  await expect.poll(async () => (await readOverlapAtAssertion()).bandWidth).toBeGreaterThan(0);
  // Sub-pixel tolerance only: the trailing "Resume →" hint ends AT the measure, which is the band's start.
  expect(overlap.worst.right, `"${overlap.worst.text}" runs into the art band`).toBeLessThanOrEqual(overlap.bandLeft + 1);
});

test("#205 a room whose characters have NO portrait renders no band at all — never an empty art slot", async ({ mount, page }) => {
  // `LONG_ROOM` is the same room with every seat's `avatarHash` null.
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([LONG_ROOM]) });

  const home = await mount(<ChatRecentsHeroArtStory />);
  await expect(home.getByRole("button", { name: `Resume ${LONG_ROOM.title}` })).toBeVisible();
  await expect(home.locator('[data-slot="art-bleed"]')).toHaveCount(0);
});

test("#205 a NARROW island keeps its whole width for the prose — the bleed is desktop hierarchy, by geometry", async ({ mount, page }) => {
  // The 720px story pane, i.e. the arm the ruling calls "mobile untouched". There is no media query doing
  // this: `inset-inline-start: min(100%, var(--reading-measure))` collapses the band the moment the island
  // is narrower than the measure, so the phone arm and the docked-narrow arm are the same guarantee.
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([LONG_ROOM_WITH_ART]) });

  const home = await mount(<ChatRecentsTileStory />);
  await expect(home.getByRole("button", { name: `Resume ${LONG_ROOM.title}` })).toBeVisible();
  await expect.poll(async () => home.locator('[data-slot="art-bleed"]').evaluate((el) => el.getBoundingClientRect().width)).toBe(0);
});

// ── RED-FIRST (side-eye rail-home P3-4): the hero is a NATIVE button, not a div wearing role=button ──
// The finding was filed as a robustness note, not a defect: the synthesized pair on `Card interactive`
// (role + tabIndex + a hand-written Enter/Space handler) was VERIFIED WORKING on the live surface before it
// was filed. That is exactly why this pin asserts BOTH halves — the element KIND (which is what changed)
// and the activation + the accessible name (which are what must not). Asserted through the rendered tag and
// a real keypress, so it compiles and fails against the old source rather than against a new API.
test("P3-4 the hero is a real <button> — and Enter and Space still activate, with the verb name intact", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([RECENT, OLDER]) });

  const home = await mount(<ChatRecentsTileStory />);
  const hero = home.locator('[data-home-hearth="chat_recent"]');

  // The KIND. `div[role=button]` fails here; a native button carries the role implicitly, so the role
  // assertion below holds in both arms and only the tag name separates them.
  await expect.poll(() => hero.evaluate((el) => el.tagName)).toBe("BUTTON");
  // …and it is a plain button, never a submit — a card inside a form must not post it.
  await expect.poll(() => hero.evaluate((el) => (el as HTMLButtonElement).type)).toBe("button");
  await expect(hero).toHaveRole("button");
  // The ruling this must not disturb (side-eye 2026-08-16 F5): the name is the VERB, not the room.
  await expect(hero).toHaveAccessibleName("Resume A grand adventure");

  // BOTH activation keys, through the real keyboard — the behaviour the div arm hand-rolled and the
  // platform now owns. `press` on a focused control is the seam a user meets; the island survives it.
  await hero.focus();
  await hero.press("Enter");
  await expect(hero).toBeVisible();
  await hero.focus();
  await hero.press(" ");
  await expect(hero).toBeVisible();
});

// The UA reset the `as="button"` arm owes (card.tsx): a browser ships a button `inline-block` with
// `text-align: center`, and Tailwind's preflight resets a button's font and background but NEITHER of
// those — so an un-reset arm would render the hero's title, excerpt and credit line CENTRED. Read off the
// resolved style, because the class string could survive a variant change that stopped resetting.
test("P3-4 the native hero still reads left-aligned — the UA button centring is reset", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([RECENT, OLDER]) });

  const home = await mount(<ChatRecentsTileStory />);
  await expect
    .poll(async () => home.locator('[data-home-hearth="chat_recent"]').evaluate((el) => globalThis.getComputedStyle(el).textAlign))
    .not.toBe("center");
});

// ── RED-FIRST (side-eye HOME 2026-09-02 H17): the ACTION never sits between two lines of text ───────
// At the 430x932 coarse mount the credit line wraps ("SABINE VEYRA · CALAMITY ·" / "MORGATHA") and the
// row centred `RESUME →` against the PAIR, so the one affordance on the island rendered in the gutter
// between two lines of its own credit. The row aligns to START now: the action keeps the first line's
// box, the credit wraps under it, and NO name is dropped — which is the arm this takes over truncating
// the characters, because the credit line is the island's ONE character rendering (rail sweep P2-6) and the hero's
// own title ruling (side-eye F7) is that this island clamps rather than ellipses.
// Asserted as GEOMETRY (the action's top box against the credit's first line), so it fails against the
// old source and cannot be satisfied by a class string.
const WRAPPING_CREDIT = makeChatSummary({
  id: "chat_wrap",
  title: "A grand adventure",
  participantNames: ["Sabine Veyra", "Calamity, Doomblade of the Ninth Epoch", "Morgatha, the Undying Dark"],
  filterCharacterIds: ["char_sabine", "char_calamity", "char_morgatha"],
  participantPortraits: [CALAMITY_SEAT, MORGATHA_SEAT],
});

test.describe("the hero's action row at a phone width", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 430, height: 932 } });

  test("H17 the Resume hint keeps the credit's FIRST line — never centred against a wrapped pair", async ({ mount, page }) => {
    await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([WRAPPING_CREDIT]) });

    const home = await mount(<ChatRecentsMobileStory />);
    const hero = home.locator('[data-home-hearth="chat_wrap"]');
    // Voice-scoped: the fixture's SUBTITLE also contains the character names, so a bare text match resolves
    // two elements. The credit line is the `credit`-voiced span (the island's ONE character rendering).
    const credit = hero.locator('[data-slot="text"][data-voice="credit"]').first();

    // The premise, or everything below passes for the wrong reason: at this width the credit really does
    // wrap — its box is taller than one line of its own leading.
    await expect
      .poll(
        async () =>
          await credit.evaluate((el) => {
            const box = el.getBoundingClientRect();
            return box.height / Number.parseFloat(globalThis.getComputedStyle(el).lineHeight);
          }),
      )
      .toBeGreaterThan(1.5);
    // The action's box starts where the credit's does — i.e. on the credit's FIRST line, not centred
    // against both of them. One device pixel of tolerance for sub-pixel line-box rounding.
    await expect
      .poll(
        async () =>
          await hero.evaluate((island) => {
            const lines = island.querySelector('[data-slot="text"][data-voice="credit"]')?.getBoundingClientRect().top ?? 0;
            const hint = island.querySelectorAll('[data-slot="text"][data-voice="credit"]')[1]?.getBoundingClientRect().top ?? 0;
            return Math.abs(hint - lines);
          }),
      )
      .toBeLessThanOrEqual(1);
  });
});

// ── RED-FIRST (#1126, side-eye HOME 2026-09-02 H13): the hero WARMS the room it resumes ─────────────
// Resume used to enter a room whose two SUSPENDING reads were both cold — `chat.listMessages` +
// `chat.getChat`, the `useSuspenseQueries` pair in message-list-surface.tsx — so the room painted a
// skeleton and then MOVED it 52px down once `getChat` landed and `ChatCharacterBar` finally knew it had
// a roster to draw. Measured on the live stack: the strip settles at 40px and the room stack's gap is
// 12px (40 + 12 = the reported shift), and a SECOND Resume in the same browser lifetime — same click,
// warm cache — records no layout shift at all. So the defect is the COLD CACHE, not the layout.
// Asserted at the NETWORK seam, which is the one place a warm-up is observable: the roster key must have
// left the client on the hero's MOUNT, before anybody clicks anything.
//
// THE ROSTER READ ONLY (owner ruling 2026-09-02) — `chat.listMessages` is deliberately NOT warmed, so the
// room keeps its skeleton phase and the click keeps its cost. The both-reads arm was built and measured:
// it roughly halves aggregate blocking but moves the transcript render into the click step (rafGap
// 217/333/383ms -> 467/700/683ms), and the owner refused that trade. `use-prefetch-room.ts` carries the
// numbers; this file's `CHAT_ROOM_ROUTES` feed keeps `chat.listMessages` stubbed either way, because the
// ROOM still reads it whenever a mount here renders one.
test("#1126 the hero warms the room's roster read on mount, before the Resume click", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { ...CHAT_ROOM_ROUTES, "chat.listChats": chatListResponder([RECENT, OLDER]) });

  const home = await mount(<ChatRecentsPairStory />);
  await expect(home.locator('[data-home-hearth="chat_recent"]')).toBeVisible();

  // The WHOLE input list, not a count: it carries both halves of the claim at once — the hero's room was
  // warmed, and it is the ONLY room warmed. The also-open rooms are a list you scan, not a room you are
  // about to open, and warming eight of them would spend this surface's own connection budget on a bet
  // nobody placed; a `[{chat_recent}, {chat_older}, …]` array simply never equals this one.
  await expect.poll(() => trpc.inputs("chat.getChat")).toEqual([{ chatId: "chat_recent" }]);
});
