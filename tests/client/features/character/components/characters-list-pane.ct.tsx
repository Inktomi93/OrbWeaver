// CT: the Characters MODAL LIST pane (list-pane-projection Arm A). Drives the PRODUCTION path — the real
// section registry's `list()`/`listHeader()` closures, the `makeCharactersSection` door param, and the
// chat-owned projection body threaded in at the door — over the network-stubbed `character.list`,
// `character.get` and `chat.listChats`.
//
// What it pins:
//   · the SWAP — no selection = the picker; a selection = her chats, in the same slot (D2, unconditional);
//   · the projection rows are the SERVER'S `characterId` narrowing (2026-08-09 — it used to be a client
//     `chatsWithCharacter(cache)` filter over the whole library) — a chat she LEFT is in (departed seats),
//     a chat she was never in is out, and the ORDER is the server's (D4, never re-sorted). The stub honours
//     the input (`chatListResponder`), so these arms still fail if the surface stops asking for her;
//   · the band swaps with the pane (D9): `CHARACTERS` + create ⇄ `‹ CHATS · <name>` + New chat;
//   · New chat fires the STORE ACTION with her id (the draft cast + the section switch), not a UI echo;
//   · back deselects AND restores focus to her row in the library — a swap that drops focus to <body> is
//     a defect (§3.7), so this is a behavioural assertion, not a class check;
//   · the empty projection TEACHES and ACTS (empty states are load-bearing).

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { CharacterHandle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { expectInstrumentTierLive } from "../../../../support/ct/tier-liveness.ts";
import type { ChatSummaryFixture } from "../../chat/fixtures.ts";
import { chatListResponder } from "../../chat/fixtures.ts";
import { CharactersListPaneStory, CharactersScreenStory } from "../_ct-stories.tsx";
import { makeCharacterDetail, makeCharacterSummary } from "../fixtures.ts";

const AZARAEL = "char_ct_azarael0001";
const SERA = "char_ct_sera00000001";

const CHARACTER_PAGE = {
  items: [makeCharacterSummary({ id: AZARAEL, name: "Azarael", createdAt: 2000 }), makeCharacterSummary({ id: SERA, name: "Sera", createdAt: 1000 })],
  nextCursor: null,
};

const SETTINGS = { userId: "user_ct_pane", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 };

/** `character.get` is the band + identity-row read; the COMPOSED story's editor reads the same key, so this
 *  is the full `CharacterDetail` (the editor's form seeds every field off it). */
const AZARAEL_DETAIL = makeCharacterDetail({ id: AZARAEL, handle: castId<CharacterHandle>("azarael"), name: "Azarael" });

/** The row's cast as the SERVER now sends it (NR4): the viewer's own seat is suppressed while another seat
 *  remains, so a fixture that lists the viewer ("Alex") is not the wire shape any more. */
const CAST_BY_SEAT: Record<string, string> = { [AZARAEL]: "Azarael", [SERA]: "Sera" };

function chat(fields: { id: string; title: string; seats: readonly string[]; lastMessageAt: number }): ChatSummaryFixture {
  return {
    id: fields.id,
    title: fields.title,
    starred: false,
    archived: false,
    parentChatId: null,
    lastMessageAt: fields.lastMessageAt,
    messageCount: 3,
    participantNames: fields.seats.map((seat) => CAST_BY_SEAT[seat] ?? seat),
    participantCharacterIds: fields.seats,
    lastMessagePreview: null,
    isGame: false,
    viewerRole: "host",
    createdAt: 0,
    updatedAt: fields.lastMessageAt,
  };
}

// Server order = newest-updated first. "The Gilded Ember" is a room Azarael has SINCE LEFT: her seat id is
// still on the row (the contract's departed-seat guarantee) while the present cast is someone else.
const HER_NEWEST = chat({ id: "chat_ct_newest", title: "Winter court", seats: [AZARAEL], lastMessageAt: 300 });
const HER_DEPARTED = chat({ id: "chat_ct_left", title: "The Gilded Ember", seats: [AZARAEL, SERA], lastMessageAt: 200 });
const NOT_HERS = chat({ id: "chat_ct_other", title: "Sera alone", seats: [SERA], lastMessageAt: 250 });
const CHATS = [HER_NEWEST, NOT_HERS, HER_DEPARTED];

const ROW_TITLE = '[data-slot="list-row-title"]';
const LIST_ROW_ROOT = '[data-slot="list-row-root"]';
const AVATAR_STACK = '[data-slot="avatar-stack-root"]';
const LEADING = '[data-slot="list-row-leading"]';
/** Every per-row kebab, by the shape of its name ("Chat actions for <subject>"). */
const ANY_ROW_MENU = /^Chat actions for /;
/** The identity gloss's two shapes: the RECENCY line that survived, and the census that must not return. */
const RECENCY_GLOSS = /^last /;
const CENSUS_GLOSS = /\d+ chats? · last /;
const NO_CHATS_YET = /no chats yet/i;
/** The page clock the stamp tests pin — never an ambient wall-clock read (test-determinism gate). */
const FROZEN_NOW = FROZEN_AT_MS;
const HOUR_MS = 3_600_000;

/** R1: New chat mints a REAL room — the minimal ChatDetail the startChat responder returns. */
const CREATED_CHAT_ID = "chat_pane_created";
const CREATED_CHAT = {
  id: CREATED_CHAT_ID,
  title: null,
  participants: [],
  anchorPersonaId: null,
  cast: [],
  group: { mode: "single" },
  temporary: false,
  viewerIsHost: true,
  roomOverrides: {},
  background: null,
  rpg: null,
};

function routeAll(page: Parameters<typeof routeTrpc>[0], chats: readonly ChatSummaryFixture[]): ReturnType<typeof routeTrpc> {
  return routeTrpc(page, {
    "character.list": () => CHARACTER_PAGE,
    "character.get": () => AZARAEL_DETAIL,
    "character.update": () => AZARAEL_DETAIL,
    "chat.listChats": chatListResponder(chats),
    "chat.startChat": { chat: CREATED_CHAT, opening: null, openingFailure: null },
    "settings.getUserSettings": () => SETTINGS,
  });
}

test("no selection: the pane is the PICKER and the band names the section with its ONE create primary", async ({ mount, page }) => {
  await routeAll(page, CHATS);
  const component = await mount(<CharactersListPaneStory />);

  await expect(component.getByText("Azarael", { exact: true })).toBeVisible();
  await expect(component.getByText("Sera", { exact: true })).toBeVisible();
  const band = page.getByTestId("list-band");
  await expect(band.getByRole("heading", { level: 2 })).toHaveText("Characters");
  // The projection chrome is absent in this mode — no back, no New chat.
  await expect(band.getByRole("button", { name: "Back to all characters" })).toHaveCount(0);
  await expect(band.getByRole("button", { name: "New chat" })).toHaveCount(0);
});

test("a selection SWAPS the same slot to her chats — the rows are exactly the projection, in server order", async ({ mount, page }) => {
  await routeAll(page, CHATS);
  const component = await mount(<CharactersListPaneStory selectedCharacterId={AZARAEL} />);

  await expect(component.getByText("Winter court")).toBeVisible();
  // The projection, exactly: her two rows (INCLUDING the room she left — departed seats are history), the
  // room she was never in excluded, and the server's recency order preserved (D4).
  await expect(component.locator(ROW_TITLE)).toHaveText(["Winter court", "The Gilded Ember"]);
  // The picker is GONE — one slot, two roles, not two lists stacked.
  await expect(component.getByRole("button", { name: "Sera", exact: true })).toHaveCount(0);
});

test("BOTH modes of the pane declare the INSTRUMENT tier, and both scan at the same 32px row rhythm", async ({ mount, page }) => {
  // Two of the four LIST-pane tier declarations live in this one slot (the character library and the
  // chats-with-character projection), and the pane's whole point is that they are the SAME list surface —
  // so a tier that resolved in one and not the other, or two portrait sizes (side-eye P2-5: the library ran
  // 40px against the chats panes' 24px), is exactly what this catches. Computed values, one mount each.
  await routeAll(page, CHATS);
  const picker = await mount(<CharactersListPaneStory />);
  await expect(picker.getByText("Azarael", { exact: true })).toBeVisible();
  await expectInstrumentTierLive(picker);
  const portrait = await picker
    .locator(LEADING)
    .first()
    .evaluate((el) => Math.round(el.getBoundingClientRect().height));

  await picker.update(<CharactersListPaneStory selectedCharacterId={AZARAEL} />);
  await expect(picker.getByText("Winter court")).toBeVisible();
  await expectInstrumentTierLive(picker);
  const projected = await picker
    .locator(LEADING)
    .first()
    .evaluate((el) => Math.round(el.getBoundingClientRect().height));

  expect(portrait).toBe(projected);
});

test("D3 the projection INHERITS the shared row upgrade: a multi-seat room stacks, a 1:1 does not", async ({ mount, page }) => {
  await routeAll(page, CHATS);
  const component = await mount(<CharactersListPaneStory selectedCharacterId={AZARAEL} />);
  await expect(component.getByText("Winter court")).toBeVisible();

  // One row anatomy, both surfaces (no fork): the 2-seat room she left stacks, her 1:1 keeps one portrait.
  await expect(component.locator(LIST_ROW_ROOT, { hasText: "The Gilded Ember" }).locator(AVATAR_STACK)).toBeVisible();
  await expect(component.locator(LIST_ROW_ROOT, { hasText: "Winter court" }).locator(AVATAR_STACK)).toHaveCount(0);
});

test("the band swaps with the pane (D9): back + CHATS · <name> + the New-chat primary", async ({ mount, page }) => {
  await routeAll(page, CHATS);
  await mount(<CharactersListPaneStory selectedCharacterId={AZARAEL} />);

  const band = page.getByTestId("list-band");
  await expect(band.getByRole("heading", { level: 2 })).toContainText("Azarael");
  await expect(band.getByRole("heading", { level: 2 })).toContainText("Chats");
  await expect(band.getByRole("button", { name: "Back to all characters", exact: true })).toBeVisible();
  // ONE primary for the mode — the character-create menu does not linger under her chats.
  await expect(band.getByRole("button", { name: "New chat", exact: true })).toBeVisible();
});

test("New chat fires the REAL startChat with her id and enters the minted room (R1), not a UI echo", async ({ mount, page }) => {
  const trpc = await routeAll(page, CHATS);
  const component = await mount(<CharactersListPaneStory selectedCharacterId={AZARAEL} />);
  await expect(component.getByText("Winter court")).toBeVisible();

  await page.getByTestId("list-band").getByRole("button", { name: "New chat", exact: true }).click();

  // The wire carried HER id (the store action's payload, not a UI echo)…
  await expect
    .poll(() => trpc.lastInput("chat.startChat"), { intervals: [20, 50, 100] })
    .toMatchObject({ characterIds: [AZARAEL] });
  // …and the store entered the REAL minted room + switched the section.
  await expect(component.getByTestId("started-chat")).toHaveText(CREATED_CHAT_ID);
  await expect(component.getByTestId("active-section")).toHaveText("chats");
});

test("back deselects AND restores focus to her row in the library (§3.7 — never <body>)", async ({ mount, page }) => {
  await routeAll(page, CHATS);
  const component = await mount(<CharactersListPaneStory selectedCharacterId={AZARAEL} />);
  await expect(component.getByText("Winter court")).toBeVisible();

  await page.getByTestId("list-band").getByRole("button", { name: "Back to all characters", exact: true }).click();

  // The picker is back…
  await expect(component.getByRole("button", { name: "Sera", exact: true })).toBeVisible();
  // …and focus landed on HER row, not the pane container and not <body>.
  await expect(component.getByRole("button", { name: "Azarael", exact: true })).toBeFocused();
});

// §3.7's forward half — the mirror of the back-focus test above, and it must be COMPOSED (side-eye P1,
// round 2). One selection mounts TWO focus-managing surfaces: this pane and the CONTENT editor beside it.
// A pane mounted alone proves nothing — the round-1 unconditional mount-focus passed in isolation while,
// in the real composition, it un-jammed the editor's `useFocusOnMount` guard (activeElement was no longer
// `<body>`) and the editor took the focus straight back. So the owner is decided by the selection INTENT,
// and both arms are asserted through the SAME composed mount.
test.describe("§3.7 the focus owner is decided by the selection INTENT (LIST + CONTENT composed)", () => {
  /** Where focus actually landed — polled, since both surfaces take it in mount effects. */
  function focusRegion(page: Parameters<typeof routeTrpc>[0]): Promise<{ onBody: boolean; inProjection: boolean; inContent: boolean }> {
    return page.evaluate(() => {
      const active = document.activeElement;
      const pane = document.querySelector('[data-slot="character-chats-projection"]');
      const content = document.querySelector('[data-testid="content-region"]');
      const holds = (region: Element | null): boolean => region !== null && active !== null && region.contains(active);
      return { onBody: active === document.body, inProjection: holds(pane), inContent: holds(content) };
    });
  }

  test("a pick FROM THE PICKER lands focus in the projection — the pane the click just transformed", async ({ mount, page }) => {
    await routeAll(page, CHATS);
    const component = await mount(<CharactersScreenStory deepLinkCharacterId={AZARAEL} />);

    await component.getByRole("button", { name: "Azarael", exact: true }).click();
    await expect(component.getByText("Winter court")).toBeVisible();
    // The editor is mounted and settled beside it — this is exactly the composition that used to steal back.
    await expect(component.getByRole("textbox", { name: "Name" })).toHaveValue("Azarael");

    await expect.poll(() => focusRegion(page), { intervals: [20, 50, 100, 200] }).toEqual({ onBody: false, inProjection: true, inContent: false });
  });

  test("a NON-picker entry (deep link / agent nav) leaves focus with the CONTENT editor", async ({ mount, page }) => {
    await routeAll(page, CHATS);
    const component = await mount(<CharactersScreenStory deepLinkCharacterId={AZARAEL} />);

    // Pressing a real control is the hook's own navigation discriminator (activeElement is not <body>), so
    // this is the arm where the editor legitimately claims focus — and the projection must not contest it.
    await component.getByTestId("deep-link").click();
    await expect(component.getByText("Winter court")).toBeVisible();
    await expect(component.getByRole("textbox", { name: "Name" })).toHaveValue("Azarael");

    await expect.poll(() => focusRegion(page), { intervals: [20, 50, 100, 200] }).toEqual({ onBody: false, inProjection: false, inContent: true });
  });
});

// P2c: this pane is the collision case — every row can be titled "Azarael", and the newest few share a
// stamp, so the per-row qualifier produced N identical accessible names. The escalation is resolved across
// the LIST, so the rendered names are distinct.
test("same-titled rows whose stamps ALSO collide still expose distinct action names", async ({ mount, page }) => {
  // The stamp is clock-relative, so the page clock is pinned: both rows land in the SAME "1h" bucket, which
  // is exactly the collision (a minute apart, indistinguishable on screen).
  await page.clock.setFixedTime(FROZEN_NOW);
  const twins = [
    chat({ id: "chat_ct_twin_a", title: "Azarael", seats: [AZARAEL], lastMessageAt: FROZEN_NOW - HOUR_MS }),
    chat({ id: "chat_ct_twin_b", title: "Azarael", seats: [AZARAEL], lastMessageAt: FROZEN_NOW - HOUR_MS - 60_000 }),
  ];
  await routeAll(page, twins);
  const component = await mount(<CharactersListPaneStory selectedCharacterId={AZARAEL} />);
  await expect(component.locator(ROW_TITLE)).toHaveText(["Azarael", "Azarael"]);

  // Both rows render "1h" — the stamp alone can no longer tell their actions apart, so the names escalate.
  const names = await page.getByRole("button", { name: ANY_ROW_MENU }).evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""));
  expect(names).toHaveLength(2);
  expect(new Set(names).size).toBe(2);
});

// NR2: the empty pane used to say it THREE times — "no chats yet" in the identity gloss, "No chats yet" in
// the empty state, and two competing New-chat primaries (the band's + the empty state's). One statement now.
test("an EMPTY projection is ONE statement with ONE primary — and the empty state still acts", async ({ mount, page }) => {
  await routeAll(page, [NOT_HERS]);
  const component = await mount(<CharactersListPaneStory selectedCharacterId={AZARAEL} />);

  await expect(component.locator('[data-slot="empty-state-title"]')).toHaveText("No chats yet");
  await expect(component.getByText("No chats with Azarael yet — start the first one.")).toBeVisible();
  // The identity gloss no longer repeats it — the empty state's title is the ONE place it is said (the
  // gloss drops entirely when there is nothing to count, so there is no second "no chats yet" anywhere).
  await expect(component.getByText(NO_CHATS_YET)).toHaveCount(1);
  // ONE primary in the LIST region: the band's. The empty state keeps its action, demoted to secondary.
  // `data-cta` is the primary CTA's own marker (the accent ring keys off it), so this is the rendered tell,
  // not a class check: exactly one New-chat in the whole LIST region carries it, and it is the band's.
  const paneAction = component.getByLabel("Chats with Azarael").getByRole("button", { name: "New chat", exact: true });
  await expect(paneAction).not.toHaveAttribute("data-cta", "");
  await expect(page.getByTestId("list-band").getByRole("button", { name: "New chat", exact: true })).toHaveAttribute("data-cta", "");
  // Demoted is not disarmed: it still mints the same real room (empty is never a dead end).
  await paneAction.click();
  await expect(component.getByTestId("started-chat")).toHaveText(CREATED_CHAT_ID);
});

// NR5: the pane BELOW the identity row is the census, so the gloss doesn't repeat the count — it carries the
// one thing the rows don't state at a glance (recency).
test("the identity gloss is RECENCY only — the rows below it are the census", async ({ mount, page }) => {
  await routeAll(page, CHATS);
  const component = await mount(<CharactersListPaneStory selectedCharacterId={AZARAEL} />);
  await expect(component.getByText("Winter court")).toBeVisible();

  await expect(component.getByText(RECENCY_GLOSS)).toBeVisible();
  // Not "2 chats · last …": the count is the editor hero's job (CONTENT tier, no list under it).
  await expect(component.getByText(CENSUS_GLOSS)).toHaveCount(0);
});

// ── THE PICKER'S VIEW CONTROLS SURVIVE 320px (side-eye P2) ───────────────────────────────────────────
// Four controls shared one row — search + sort + Group + the bulk pencil — and at this pane's real 320px
// width the search box came out 95px against the 119px its own placeholder needs, rendering "Search chai".
// The search is the row's PRIMARY control, so it now carries a floor and the view controls wrap beneath it.
// The need is MEASURED from the input's own font rather than pinned at a number, so a type-scale retune
// cannot quietly re-open the defect.

test("the search input fits its own placeholder at the pane's 320px width", async ({ mount, page }) => {
  await routeTrpc(page, { "character.list": CHARACTER_PAGE, "settings.getUserSettings": SETTINGS, "chat.listChats": chatListResponder([]) });
  const component = await mount(<CharactersListPaneStory />);
  const search = component.getByRole("textbox", { name: "Search characters" });
  await expect(search).toBeVisible();

  const measured = await search.evaluate((el: HTMLInputElement) => {
    const style = getComputedStyle(el);
    const ctx = document.createElement("canvas").getContext("2d");
    if (ctx === null) {
      return { box: 0, needed: 0 };
    }
    ctx.font = [style.fontStyle, style.fontWeight, style.fontSize, style.fontFamily].join(" ");
    const inner = el.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
    return { box: inner, needed: ctx.measureText(el.placeholder).width };
  });
  expect(measured.needed).toBeGreaterThan(0);
  expect(measured.box).toBeGreaterThanOrEqual(measured.needed);
});
