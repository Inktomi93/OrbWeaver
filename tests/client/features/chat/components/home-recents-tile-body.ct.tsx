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
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { ChatRecentsTileStory } from "../_ct-stories.tsx";
import { chatListResponder, makeChatSummary } from "../fixtures.ts";

const RECENT = makeChatSummary({ id: "chat_recent", title: "A grand adventure", participantNames: ["Wren"] });
const GAME = makeChatSummary({ id: "chat_game", title: "The Ashfell run", participantNames: ["Wren"], isGame: true });
/** The row's description also carries its subtitle + stamp, so match the marker's datum WITHIN it. */
const GAME_MARKER_DATUM = /Game chat/u;
/** The HERO's cast/age kicker line. "Wren" alone is ambiguous by construction here — it is also the
 *  hero's scent line and the also-open row's subtitle — which is itself the tell that the anatomy landed. */
const HERO_CAST_LINE = /^Wren · last turn/u;
/** The SECOND room, so the tile has both arms: a hero AND an also-open list under it. `lastMessageAt` is
 *  older than the fixture default, which is what makes RECENT the one you would resume. */
const OLDER = makeChatSummary({ id: "chat_older", title: "The quiet ledger", participantNames: ["Wren"], lastMessageAt: 1 });

test("renders the HERO room plus the also-open list inside the tile frame", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([RECENT, OLDER]) });

  const home = await mount(<ChatRecentsTileStory />);
  const tile = home.locator('[data-home-tile="chat.recents"]');

  await expect(tile.getByText("Pick up where you left off")).toBeVisible();
  // The NEWEST room is the hero — the surface's one focal island, not a row in a list (#102).
  await expect(tile.locator('[data-home-hearth="chat_recent"]')).toBeVisible();
  await expect(tile.getByText("A grand adventure")).toBeVisible();
  await expect(tile.getByText(HERO_CAST_LINE)).toBeVisible();
  // …and everything else is the dense ALSO-OPEN list under it.
  await expect(tile.getByText("Also open")).toBeVisible();
  await expect(tile.getByRole("list", { name: "Also open" }).getByRole("listitem")).toHaveCount(1);
  await expect(tile.getByRole("button", { name: "All chats →" })).toBeVisible();
});

test("#102 ONE ROOM OPEN: the hero renders and the also-open BAND does not — no band over an empty list", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([RECENT]) });

  const home = await mount(<ChatRecentsTileStory />);
  const tile = home.locator('[data-home-tile="chat.recents"]');

  await expect(tile.locator('[data-home-hearth="chat_recent"]')).toBeVisible();
  await expect(tile.getByText("Also open")).toHaveCount(0);
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
  // theme resolves, the one room you would resume outranks the ones you would not.
  await routeTrpc(page, { "chat.listChats": chatListResponder([RECENT, OLDER]) });

  const home = await mount(<ChatRecentsTileStory />);

  const heroSize = await home
    .locator('[data-home-hearth="chat_recent"]')
    .getByText("A grand adventure")
    .evaluate((el) => Number.parseFloat(globalThis.getComputedStyle(el).fontSize));
  const rowSize = await home.getByText("The quiet ledger").evaluate((el) => Number.parseFloat(globalThis.getComputedStyle(el).fontSize));

  expect(heroSize).toBeGreaterThan(rowSize);
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
  await routeTrpc(page, { "chat.listChats": chatListResponder([RECENT]) });

  const home = await mount(<ChatRecentsTileStory />);
  await home.getByRole("button", { name: "All chats →" }).click();

  await expect(home.locator("output")).toHaveText("section=chats");
});

test("the rows are real LIST ITEMS, and the trailing action sits inside the tile's own named region", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([RECENT, OLDER]) });

  const home = await mount(<ChatRecentsTileStory />);

  // A `role="list"` whose children are generic divs announces as an empty list to AT (side-eye F4).
  await expect(home.getByRole("list", { name: "Also open" }).getByRole("listitem")).toHaveCount(1);
  // …and "All chats →" is announced under the tile's heading instead of standing alone as an arrow.
  await expect(home.getByRole("region", { name: "Pick up where you left off" }).getByRole("button", { name: "All chats →" })).toBeVisible();
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

  const home = await mount(<ChatRecentsTileStory />);
  const marker = home.getByRole("img", { name: "Game chat" });
  await expect(marker).toBeVisible();

  // It lives on the TITLE LINE, in the content column — not in the trailing cluster.
  await expect(marker.locator('xpath=ancestor::*[@data-slot="list-row-markers"]')).toHaveCount(1);
  // …and the row's own accessible description carries it, which is the whole point of the slot.
  await expect(home.getByRole("button", { name: "The Ashfell run", exact: true })).toHaveAccessibleDescription(GAME_MARKER_DATUM);
  // The orphan position doesn't even exist on this tile — it renders no row controls at all.
  await expect(home.locator('[data-slot="list-row-actions"]')).toHaveCount(0);
});

test("an empty chats list renders a TEACHING empty state with an action, not a blank tile", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([]) });

  const home = await mount(<ChatRecentsTileStory />);
  const tile = home.locator('[data-home-tile="chat.recents"]');

  await expect(tile.getByText("No chats yet")).toBeVisible();
  await expect(tile.getByRole("button", { name: "New chat" })).toBeVisible();
});
