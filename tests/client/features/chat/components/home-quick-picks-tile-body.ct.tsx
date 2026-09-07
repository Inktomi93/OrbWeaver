// CT: chat's "Start with" HOME tile (the character FACE SHELF), driven through the REAL `HomeSurface`
// over the REAL data layer (`character.list` stubbed at the network by routeTrpc). Chat-owned by owner
// decision H6 — the tile's data and intent are "start a chat".
//
// These assertions MOVED here from `chat-landing-surface.ct.tsx` when the launcher moved to home.

import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import type { CharacterHandle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcHold } from "../../../../support/node/route-trpc.ts";
import { makeCharacterSummary, makeTagFixture } from "../../character/fixtures.ts";
import { ChatQuickPicksTileStory } from "../_ct-stories.tsx";

const ARIA = makeCharacterSummary({ id: "char_aria", name: "Aria" });
const BOLT = makeCharacterSummary({ id: "char_bolt", name: "Bolt" });
const CHAR_PAGE = { items: [ARIA, BOLT], nextCursor: null };
/** The two-line GLOSS of the long-name fixture below, matched by its head so the clamp can do its work. */
const LONG_GLOSS = /^An immortal/u;

/** The `chat.startChat` response the launcher awaits — the same shape `use-start-chat.ct.tsx` serves (a
 *  full `ChatDetail` under `chat`, because the seam seeds `chat.getChat` with it). */
function startChatResult(id: string): { chat: Record<string, unknown>; opening: null } {
  return {
    chat: {
      id,
      title: "A new room",
      participants: [],
      anchorPersonaId: null,
      identities: [],
      group: DEFAULT_GROUP_CONFIG,
      temporary: false,
      viewerIsHost: true,
      roomOverrides: {},
      background: null,
      rpg: null,
    },
    opening: null,
  };
}

test("renders the character faces inside the tile frame", async ({ mount, page }) => {
  await routeTrpc(page, { "character.list": CHAR_PAGE });

  const home = await mount(<ChatQuickPicksTileStory />);
  const tile = home.locator('[data-home-tile="chat.quickPicks"]');

  await expect(tile.getByText("Start with")).toBeVisible();
  await expect(tile.getByText("Aria")).toBeVisible();
  await expect(tile.getByText("Bolt")).toBeVisible();
  await expect(tile.getByRole("button", { name: "All characters" })).toBeVisible();
});

// ── RED-FIRST (rail sweep P2-7): the rail moves ONCE, after the room exists ─────────────────────────
// The handler moved the rail BEFORE awaiting `startChat`, which unmounted home with the pressed cell
// inside it and left `activeElement` on `<body>` — so the room that swapped in afterwards declined to take
// focus (the guarded `useFocusOnMount` cannot tell that swap from a cold load) and a keyboard user was left
// with no focus at all. Asserted through the affordances: the pressed cell is STILL the focused element
// while the mutation is in flight (it was gone), and the rail arrives when the room does.
test("P2-7 picking a face keeps focus on the cell until the room exists, then moves the rail — assert the STORE", async ({ mount, page }) => {
  const started = trpcHold();
  await routeTrpc(page, { "character.list": CHAR_PAGE, "chat.startChat": started });

  const home = await mount(<ChatQuickPicksTileStory />);
  const probe = home.locator("output");
  await expect(probe).not.toHaveText("section=chats");

  const cell = home.getByRole("button", { name: "Bolt" });
  await cell.press("Enter");
  // The deterministic barrier: the create is in flight and HELD, so the mid-flight arm is a settled state.
  await started.requested;
  await expect(probe).not.toHaveText("section=chats");
  await expect(cell).toBeFocused();

  started.release(startChatResult("chat_bolt"));
  await expect(probe).toHaveText("section=chats");
});

test("the trailing action jumps to the characters section", async ({ mount, page }) => {
  await routeTrpc(page, { "character.list": CHAR_PAGE });

  const home = await mount(<ChatQuickPicksTileStory />);
  await home.getByRole("button", { name: "All characters" }).click();

  await expect(home.locator("output")).toHaveText("section=characters");
});

test("each row carries an HONEST tagline off the summary it already reads — pitch → tag line → NOTHING (#119)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "character.list": {
      items: [
        makeCharacterSummary({ id: "char_pitch", name: "Pitched", elevatorPitch: "The winter-court envoy" }),
        makeCharacterSummary({ id: "char_tags", name: "Tagged", tags: [makeTagFixture({ id: "t1", name: "noir" })] }),
        makeCharacterSummary({ id: "char_bare", name: "Bare", handle: castId<CharacterHandle>("bare_handle") }),
      ],
      nextCursor: null,
    },
  });

  const home = await mount(<ChatQuickPicksTileStory />);
  const tile = home.locator('[data-home-tile="chat.quickPicks"]');

  // Never invented copy: the distilled pitch when it exists, else the visible tag line, else NO second line —
  // the handle/slug is row identity, not caption copy (#119: a slug read as an unfinished shelf).
  await expect(tile.getByText("The winter-court envoy")).toBeVisible();
  await expect(tile.getByText("noir")).toBeVisible();
  await expect(tile.getByText("Bare")).toBeVisible();
  await expect(tile.getByText("bare_handle")).toHaveCount(0);
});

// ── RED-FIRST (rail sweep P2-8/P3-19): the cell's NAME is the character, the pitch is its DESCRIPTION ──
// The cell had no `aria-label`, so its name came from its own text content and AT read the two lines as one
// run-on string with no separator — the live receipt was `button "Calamity, Doomblade of the Ninth EpochA
// legendary, apocalypse-forged…"`. A name that long is also why every cell resolved by DOM PATH in a
// `snap --map`. Asserted through the accessible name/description pair, which is exactly the affordance.
test("P2-8 a quick-pick is named by the character alone, with its pitch as the DESCRIPTION", async ({ mount, page }) => {
  await routeTrpc(page, {
    "character.list": {
      items: [
        makeCharacterSummary({ id: "char_pitch", name: "Calamity, Doomblade of the Ninth Epoch", elevatorPitch: "A legendary, apocalypse-forged blade" }),
      ],
      nextCursor: null,
    },
  });

  const home = await mount(<ChatQuickPicksTileStory />);
  const cell = home.getByRole("listitem").getByRole("button");

  await expect(cell).toHaveAccessibleName("Calamity, Doomblade of the Ninth Epoch");
  await expect(cell).toHaveAccessibleDescription("A legendary, apocalypse-forged blade");
});

// ── RED-FIRST (rail sweep P2-9/P3-18): the name outranks its gloss, and neither cuts mid-word ─────────
// The two lines were `label` over `gloss prose` — 13px over 13px, the entity and a sentence about it at the
// same step — and both were `truncate`, which rendered "Morgatha, the Undy…" (not a name) and
// "A legendary, apocal…" (not a pitch). The name is a ramp step up and both lines clamp to two WRAPPED
// lines. Asserted on resolved geometry/type, never a px literal.
test("P2-9 the cell's name is a step above its gloss, and both wrap instead of cutting mid-word", async ({ mount, page }) => {
  await routeTrpc(page, {
    "character.list": {
      items: [
        makeCharacterSummary({
          id: "char_long",
          name: "Morgatha, the Undying Dark",
          elevatorPitch: "An immortal, bureaucratically-minded necromancer with a filing system",
        }),
      ],
      nextCursor: null,
    },
  });

  const home = await mount(<ChatQuickPicksTileStory />);
  const cell = home.getByRole("listitem").getByRole("button");
  const name = cell.getByText("Morgatha, the Undying Dark");
  const gloss = cell.getByText(LONG_GLOSS);

  const readTypeAtAssertion = async (): Promise<typeof type> =>
    await name.evaluate((el) => {
      const style = globalThis.getComputedStyle(el);
      const probe = el.ownerDocument.createElement("span");
      probe.style.fontSize = "var(--text-title)";
      el.ownerDocument.body.append(probe);
      const titleStep = globalThis.getComputedStyle(probe).fontSize;
      probe.remove();
      return { size: style.fontSize, titleStep, whiteSpace: style.whiteSpace, clamp: style.webkitLineClamp };
    });
  const type = await name.evaluate((el) => {
    const style = globalThis.getComputedStyle(el);
    const probe = el.ownerDocument.createElement("span");
    probe.style.fontSize = "var(--text-title)";
    el.ownerDocument.body.append(probe);
    const titleStep = globalThis.getComputedStyle(probe).fontSize;
    probe.remove();
    return { size: style.fontSize, titleStep, whiteSpace: style.whiteSpace, clamp: style.webkitLineClamp };
  });
  const glossSize = await gloss.evaluate((el) => globalThis.getComputedStyle(el).fontSize);

  // The `promoted` voice resolves the TITLE step — the relation, read off the token, not a hardcoded 16.
  await expect.poll(async () => (await readTypeAtAssertion()).size).toBe(type.titleStep);
  await expect.poll(async () => Number.parseFloat((await readTypeAtAssertion()).size)).toBeGreaterThan(Number.parseFloat(glossSize));
  // …and the name WRAPS (the Button base is `whitespace-nowrap`; a nowrap line in a clamp box overflows
  // with no ellipsis at all, which is why this was `truncate` before).
  await expect.poll(async () => (await readTypeAtAssertion()).whiteSpace).toBe("normal");
  await expect.poll(async () => (await readTypeAtAssertion()).clamp).toBe("2");
  // The gloss gets the same two-line budget — the room exists, and a 20-character cut taught nothing.
  await expect(gloss).toHaveCSS("-webkit-line-clamp", "2");
});

// ── ONE RANK, NOT SIX LOOSE OBJECTS (side-eye home re-score 2026-08-18, #216-d) ─────────────────────
// `line-clamp-2` CAPS the name at two lines; it never RESERVED them. So in one grid row a one-line name
// and a two-line name pushed their pitch lines to different baselines — measured on the live shelf at
// 1920: `descTop` 359 (Hikari) vs 380 (Calamity, Doomblade of the Ninth Epoch), a 21px drift you cannot
// unsee. The receipt the review asked for is exactly this: every cell in a row reports the same descTop.
test("#216 every cell in a row starts its pitch at the same baseline, whatever its name's length", async ({ mount, page }) => {
  await routeTrpc(page, {
    "character.list": {
      items: [
        makeCharacterSummary({ id: "char_short", name: "Hikari", elevatorPitch: "A burnt-out night-shift medic." }),
        makeCharacterSummary({
          id: "char_long",
          name: "Calamity, Doomblade of the Ninth Epoch",
          elevatorPitch: "A legendary, apocalypse-forged blade.",
        }),
      ],
      nextCursor: null,
    },
  });

  const home = await mount(<ChatQuickPicksTileStory />);
  const cells = home.getByRole("list", { name: "Character quick-picks" }).getByRole("listitem");
  await expect(cells).toHaveCount(2);

  // The pitch's own top edge, per cell — geometry, never a class string.
  const pitchTops = await cells.evaluateAll((nodes: Element[]) =>
    nodes.map((cell) => {
      const spans = [...cell.querySelectorAll("span[data-slot='text']")];
      const pitch = spans.at(-1);
      return pitch === undefined ? Number.NaN : Math.round(pitch.getBoundingClientRect().top);
    }),
  );

  expect(pitchTops[0]).toBe(pitchTops[1]);
  // …and the reservation is what does it: the SHORT name's box is two lines tall even with one line in it.
  const nameBoxes = await cells.evaluateAll((nodes: Element[]) =>
    nodes.map((cell) => {
      const name = cell.querySelector("span[data-slot='text']");
      return name === null ? Number.NaN : Math.round(name.getBoundingClientRect().height);
    }),
  );
  expect(nameBoxes[0]).toBe(nameBoxes[1]);
});

// ── AND THE SAME RULE ONE ROW DOWN (side-eye rail-home P3-5, 2026-08-22) ────────────────────────────
// The filed finding was "the NAME band has a ragged bottom edge in every arm". That half is RETRACTED by
// measurement — on the live shelf every name element is 43px and every cell bottom in a row is identical,
// because #216-d above already reserves the name's two lines. What was still a clamp WITHOUT a reservation
// is the pitch under it: a one-line pitch and a two-line pitch in the same row end their cells at different
// baselines, which is the same defect the test above fixed, one line further down. `lines={2}` is the same
// sanctioned variant. Asserted through the cell's rendered BOTTOM — the edge the eye actually reads as
// ragged — with pitches of deliberately different lengths and names of the SAME length, so a regression in
// the name reservation cannot make this pass for the other reason.
test("P3-5 every cell in a row ENDS at the same edge, whatever its pitch's length", async ({ mount, page }) => {
  await routeTrpc(page, {
    "character.list": {
      items: [
        makeCharacterSummary({ id: "char_terse", name: "Hikari", elevatorPitch: "A medic." }),
        makeCharacterSummary({
          id: "char_wordy",
          name: "Renata",
          elevatorPitch: "A burnt-out night-shift medic who has stopped counting the ones she could not save.",
        }),
      ],
      nextCursor: null,
    },
  });

  const home = await mount(<ChatQuickPicksTileStory />);
  const cells = home.getByRole("list", { name: "Character quick-picks" }).getByRole("listitem");
  await expect(cells).toHaveCount(2);
  // The long pitch must actually WRAP, or this passes for the wrong reason (two one-line pitches always
  // align). Its box is two lines of the pitch's own leading; the terse one now reserves the same.
  const pitchBoxes = await cells.evaluateAll((nodes: Element[]) =>
    nodes.map((cell) => {
      const spans = [...cell.querySelectorAll("span[data-slot='text']")];
      const pitch = spans.at(-1);
      return pitch === undefined ? Number.NaN : Math.round(pitch.getBoundingClientRect().height);
    }),
  );
  expect(pitchBoxes[0]).toBe(pitchBoxes[1]);

  const cellBottoms = await cells.evaluateAll((nodes: Element[]) => nodes.map((cell) => Math.round(cell.getBoundingClientRect().bottom)));
  expect(cellBottoms[0]).toBe(cellBottoms[1]);
});

test("the cells are real LIST ITEMS inside the list — a role=list of generic divs announces empty", async ({ mount, page }) => {
  await routeTrpc(page, { "character.list": CHAR_PAGE });

  const home = await mount(<ChatQuickPicksTileStory />);

  await expect(home.getByRole("list", { name: "Character quick-picks" }).getByRole("listitem")).toHaveCount(2);
});

test("#102 SHELF: extra width buys MORE faces, never BIGGER ones", async ({ mount, page }) => {
  // Measured on the mockup pass: an auto-FIT `1fr` shelf grew 250px portraits at 2000px and read as a
  // gallery. `cols="cellFixed"` is `auto-fill` at a FIXED track, so the cell is the same size at both
  // widths and only the COUNT per row moves. Asserted by measuring one cell at two pane widths.
  await routeTrpc(page, { "character.list": CHAR_PAGE });

  await page.setViewportSize({ width: 700, height: 900 });
  const home = await mount(<ChatQuickPicksTileStory />);
  const cell = home.getByRole("listitem").first();
  const narrow = await cell.boundingBox();

  await page.setViewportSize({ width: 2000, height: 900 });
  const wide = await cell.boundingBox();

  expect(narrow?.width ?? 0).toBeGreaterThan(0);
  expect(wide?.width ?? 0).toBe(narrow?.width ?? -1);
});

test("the tile's trailing action lives INSIDE the tile's own named region — '→' is never an orphan", async ({ mount, page }) => {
  await routeTrpc(page, { "character.list": CHAR_PAGE });

  const home = await mount(<ChatQuickPicksTileStory />);

  await expect(home.getByRole("region", { name: "Start with" }).getByRole("button", { name: "All characters" })).toBeVisible();
});

test("an empty library renders a TEACHING empty state with an action, not a blank tile", async ({ mount, page }) => {
  await routeTrpc(page, { "character.list": { items: [], nextCursor: null } });

  const home = await mount(<ChatQuickPicksTileStory />);
  const tile = home.locator('[data-home-tile="chat.quickPicks"]');

  await expect(tile.getByText("No characters yet")).toBeVisible();
  await expect(tile.getByRole("button", { name: "Create your first character" })).toBeVisible();
});
