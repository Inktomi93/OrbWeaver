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
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { ChatRecentsPairStory, ChatRecentsTileStory } from "../_ct-stories.tsx";
import { chatListResponder, makeChatSummary } from "../fixtures.ts";

const RECENT = makeChatSummary({ id: "chat_recent", title: "A grand adventure", participantNames: ["Wren"], participantCharacterIds: ["char_wren"] });
const GAME = makeChatSummary({ id: "chat_game", title: "The Ashfell run", participantNames: ["Wren"], isGame: true });
/** The row's description also carries its subtitle + stamp, so match the marker's datum WITHIN it. */
const GAME_MARKER_DATUM = /Game chat/u;
/** The HERO's recency STAMP, which is a span of its own so the cast can clip without taking the age with
 *  it. Leading middot: the separator lives inside the stamp so the accessible description reads as one
 *  sentence (adjacent inline nodes concatenate with no separator). */
const HERO_STAMP = /^· last turn/u;
/** A cast name in the mock's APPOSITIVE shape, which is what the credit line has to shorten (F1/F12): the
 *  full string was the widest min-content contribution on the page and set the whole grid's split. */
const LAST_TURN_RE = /last turn/u;
/** The SHORTENED cast, in credit order — the whole point of `castCredit`. */
const SHORT_CAST_LINE = /^Calamity · Morgatha$/u;
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

test("renders the HERO room in its own block, and the also-open list in a SECOND peer block", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([RECENT, OLDER]) });

  const home = await mount(<ChatRecentsPairStory />);
  const hero = home.locator('[data-home-tile="chat.recents"]');
  const list = home.locator('[data-home-tile="chat.alsoOpen"]');

  await expect(hero.getByText("Pick up where you left off")).toBeVisible();
  // The NEWEST room is the hero — the surface's one focal island, not a row in a list (#102).
  await expect(hero.locator('[data-home-hearth="chat_recent"]')).toBeVisible();
  await expect(hero.getByText("A grand adventure")).toBeVisible();
  await expect(hero.getByText(HERO_STAMP)).toBeVisible();
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
  const alsoOpen = page.getByRole("region", { name: "Also open" });
  await expect(pickUp).toBeVisible();
  await expect(alsoOpen).toBeVisible();
  // Both name themselves with a real h2 — no h3 anywhere in either block.
  await expect(pickUp.getByRole("heading", { level: 2, name: "Pick up where you left off" })).toBeVisible();
  await expect(alsoOpen.getByRole("heading", { level: 2, name: "Also open" })).toBeVisible();
  await expect(pickUp.getByRole("heading", { level: 3 })).toHaveCount(0);
  await expect(alsoOpen.getByRole("heading", { level: 3 })).toHaveCount(0);
  // …and "Also open" is NOT a descendant of the pick-up region (the nesting the finding names).
  await expect(pickUp.getByRole("region", { name: "Also open" })).toHaveCount(0);
});

// ── RED-FIRST (#102 review F13): "All chats →" belongs to the also-open band ────────────────────────
test("#102-F13 the trailing 'All chats →' sits on the ALSO-OPEN band, not on the pick-up row", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([RECENT, OLDER]) });

  await mount(<ChatRecentsPairStory />);

  await expect(page.getByRole("region", { name: "Also open" }).getByRole("button", { name: "All chats →" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Pick up where you left off" }).getByRole("button", { name: "All chats →" })).toHaveCount(0);
});

test("#102 ONE ROOM OPEN: the hero renders and the also-open BLOCK does not — no band over an empty list", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([RECENT]) });

  const home = await mount(<ChatRecentsPairStory />);

  await expect(home.locator('[data-home-hearth="chat_recent"]')).toBeVisible();
  await expect(home.locator('[data-home-tile="chat.alsoOpen"]')).toHaveCount(0);
  await expect(home.getByText("Also open")).toHaveCount(0);
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

test("#102 CD3: the hero carries the focal as a SPEAKER STRIPE plus a ::before glow — never accent fill", async ({ mount, page }) => {
  // The focal moved here from the temp-chat primary (owner re-rule on #102). It is carried by geometry and
  // a rationed halo, not by paint: `design-audit-checks.ts` classifies a chromatic glow on an element's OWN
  // box-shadow as the generated-UI tell, so the halo must ride the ::before. Read from the RESOLVED style,
  // and compare against the theme's own resolved `--color-speaker`, so this holds under every palette
  // rather than pinning a Hearth literal.
  await routeTrpc(page, { "chat.listChats": chatListResponder([RECENT, OLDER]) });

  const home = await mount(<ChatRecentsTileStory />);
  const hero = home.locator('[data-home-hearth="chat_recent"]');

  const paint = await hero.evaluate((el) => {
    const own = globalThis.getComputedStyle(el);
    const halo = globalThis.getComputedStyle(el, "::before");
    const probe = el.ownerDocument.createElement("span");
    probe.style.color = "var(--color-speaker)";
    probe.style.borderLeftWidth = "var(--immersive-stripe-width)";
    probe.style.borderLeftStyle = "solid";
    el.ownerDocument.body.append(probe);
    const probed = globalThis.getComputedStyle(probe);
    const speaker = probed.color;
    const stripeToken = probed.borderLeftWidth;
    probe.remove();
    return {
      stripeColor: own.borderLeftColor,
      stripeWidth: own.borderLeftWidth,
      ownShadow: own.boxShadow,
      haloShadow: halo.boxShadow,
      background: own.backgroundColor,
      speaker,
      stripeToken,
    };
  });

  expect(paint.stripeColor).toBe(paint.speaker);
  expect(paint.stripeWidth).toBe(paint.stripeToken);
  expect(Number.parseFloat(paint.stripeWidth)).toBeGreaterThan(0);
  // The halo is on the pseudo-element…
  expect(paint.haloShadow).not.toBe("none");
  // …and NOT on the island's own box.
  expect(paint.ownShadow).toBe("none");
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
test("#102-F5 the hero is named 'Resume <room>' and its cast strip announces nothing", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([RECENT, OLDER]), "character.list": CHARACTERS });

  const home = await mount(<ChatRecentsTileStory />);
  const hero = home.locator('[data-home-hearth="chat_recent"]');

  await expect(hero).toHaveAccessibleName("Resume A grand adventure");
  // The cast strip is out of the accessible tree entirely: its seats are already in the credit line the
  // island is DESCRIBED by, so a named stack said each of them a second and third time.
  await expect(hero.locator('[data-slot="avatar-stack-root"]')).toHaveAttribute("aria-hidden", "true");
  await expect(hero.getByRole("img")).toHaveCount(0);
  // …and the cast/age line still rides the description (after the scent line), so nothing was lost by
  // taking the art out of the tree.
  await expect(hero).toHaveAccessibleDescription(LAST_TURN_RE);
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
  // …and the STAMP is its own span, so a long cast clips without taking the recency with it.
  await expect(hero.getByText(HERO_STAMP)).toBeVisible();

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

// ── RED-FIRST (#102 review, RULED question): the hero's cast is ART, not a roster ───────────────────
test("#102-RULED the hero cast strip is SQUARE portrait art, not the chat-list circle", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([LONG_CAST]), "character.list": CHARACTERS });

  const home = await mount(<ChatRecentsTileStory />);
  const seat = home.locator('[data-home-hearth="chat_long"] [data-slot="avatar-stack-item"]').first();

  const radius = await seat.evaluate((el) => {
    const probe = el.ownerDocument.createElement("span");
    probe.style.borderRadius = "var(--radius-base)";
    el.ownerDocument.body.append(probe);
    const portraitStep = globalThis.getComputedStyle(probe).borderTopLeftRadius;
    probe.remove();
    const own = globalThis.getComputedStyle(el);
    return { own: own.borderTopLeftRadius, portraitStep, width: own.width, height: own.height };
  });
  // The mock's `.fire .faces img{border-radius:var(--radius-base)}` — the PORTRAIT step, against the base
  // `.faces img{border-radius:full}` every other strip keeps.
  expect(radius.own).toBe(radius.portraitStep);
  // …and it is genuinely a rounded RECT, not a circle wearing a token name.
  expect(Number.parseFloat(radius.own)).toBeLessThan(Number.parseFloat(radius.width) / 2);
});

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
  await home.getByRole("button", { name: "All chats →" }).click();

  await expect(home.locator("output")).toHaveText("section=chats");
});

test("the rows are real LIST ITEMS, and the trailing action sits inside its own named region", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([RECENT, OLDER]) });

  const home = await mount(<ChatRecentsPairStory />);
  const alsoOpen = home.getByRole("region", { name: "Also open" });

  // A `role="list"` whose children are generic divs announces as an empty list to AT (side-eye F4).
  await expect(alsoOpen.getByRole("list").getByRole("listitem")).toHaveCount(1);
  // …and "All chats →" is announced under that block's heading instead of standing alone as an arrow.
  await expect(alsoOpen.getByRole("button", { name: "All chats →" })).toBeVisible();
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

// ── RED-FIRST (stickler 2026-08-16 F1): the SUB-MINUTE recency arm never reads "now ago" ────────────
// The hero's credit line composed `formatRelativeCompact(when)` — which returns the WORD "now" for any
// span under a minute — with a literal " ago", so the most common post-chat state ("you just sent a
// message, then opened home") rendered "· last turn now ago" (the credit voice uppercases it to
// "NOW AGO"). The fix is the kit's sentence form `formatRelativeAgo`, which reads "just now" sub-minute.
// Asserted through the RENDERED stamp text (the credit voice's uppercase is CSS, so the DOM string is
// what the sentence composes), not the new API — this compiles and fails against the old composition.
test("F1 a room whose last turn is seconds old reads 'just now', never 'now ago'", async ({ mount, page }) => {
  // Freeze the page clock so the component's "now" and the message time agree deterministically — no
  // ambient wall-clock read (test-determinism gate; Spine-Testing §3). A zero-span read exercises the sub-minute arm.
  await page.clock.setFixedTime(FROZEN_AT_MS);
  const recent = makeChatSummary({
    id: "chat_recent",
    title: "The Ashen Spire",
    participantNames: ["Wren"],
    participantCharacterIds: ["char_wren"],
    lastMessageAt: FROZEN_AT_MS,
  });
  await routeTrpc(page, { "chat.listChats": chatListResponder([recent]), "character.list": CHARACTERS });

  const home = await mount(<ChatRecentsTileStory />);
  const stamp = home.locator('[data-home-hearth="chat_recent"]').getByText(HERO_STAMP);

  await expect(stamp).toBeVisible();
  await expect(stamp).toHaveText("· last turn just now");
  await expect(stamp).not.toContainText("now ago");
});

test("an empty chats list renders a TEACHING empty state with an action, not a blank tile", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([]) });

  const home = await mount(<ChatRecentsTileStory />);
  const tile = home.locator('[data-home-tile="chat.recents"]');

  await expect(tile.getByText("No chats yet")).toBeVisible();
  await expect(tile.getByRole("button", { name: "New chat" })).toBeVisible();
});
