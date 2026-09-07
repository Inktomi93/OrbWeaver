// CT: the group character bar (chat-character-bar.tsx, task #29). Drives the production path over the stubbed
// network (routeTrpc) — `chat.getChat` supplies the roster. Proves the D16 size-gate (a solo roster of
// ≤1 character renders NO bar) and the multi-member render (a chip per character; a muted member's chip
// is marked/dimmed). Read-only surface — no mutations here (those live in the Roster tab + composer).
//
// The roster stub returns only what the bar reads (`participants` with kind/characterId/displayName/
// disabled) — a partial `ChatDetail`, the same posture as chats-section.ct's stub.

import type { ChatIdentity, GroupConfig } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import type { ParticipantRole } from "@orb/contracts/identity";
import type { CharacterId, MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { ChatCharacterBarStory, ChatRoomPhoneStory } from "../_ct-stories.tsx";
import { CHAT_AMBIENT_ROUTES, makeMessagesPage, makeMessageView } from "../fixtures.ts";

/** A character seat — only the fields the character bar reads; the rest is filler the bar ignores. */
function character(key: string, name: string, over: Record<string, unknown> = {}): unknown {
  return {
    id: `chat_participant_${key}`,
    kind: "character",
    userId: null,
    characterId: `character_${key}`,
    role: "member",
    displayName: name,
    disabled: false,
    talkativeness: 0.5,
    ...over,
  };
}

function roster(...members: unknown[]): unknown {
  return { participants: members };
}

/**
 * #637 — the per-seat card read the bar's tiles make, which this file never stubbed. Answered `null` it was a
 * silently inert pipeline: the tile's portrait/description resolve path never ran in any case here. Echoing
 * the REQUESTED id keeps one responder honest for every roster below (each seat asks for its own character),
 * rather than a single hard-coded card that would be right for one test and a lie for the rest.
 */
const CHARACTER_ROUTE: Record<string, unknown> = {
  "character.get": (input: unknown): unknown => ({
    id: (input as { characterId?: CharacterId } | undefined)?.characterId ?? castId<CharacterId>("character_unknown"),
    name: "Character seat",
    avatarHash: null,
    description: "",
    greetings: [],
  }),
};

/** A human seat — `role` seats a host/member; the bar's add-member gate is the separate server-resolved
 *  `viewerIsHost` field, NOT this seat's role (a member behind a host seat must not see the "+"). */
function human(role: ParticipantRole): unknown {
  return {
    id: `participant_${role}`,
    kind: "human",
    role,
    userId: `user_${role}`,
    characterId: null,
  };
}

/** A committed `ChatDetail` stub carrying the server-resolved host gate + a 2-character roster (so the bar
 *  renders past the D16 size-gate). A host FIRST human seat trips the retired first-seat proxy. */
function charactersWithHost(viewerIsHost: boolean): unknown {
  return {
    participants: [human("host"), human("member"), character("aria", "Aria"), character("bryn", "Bryn")],
    viewerIsHost,
  };
}

test("a solo roster (1 character) renders NO character bar (the D16 size-gate)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHARACTER_ROUTE, "chat.getChat": () => roster(character("aria", "Aria")) });
  const component = await mount(<ChatCharacterBarStory />);
  // Give the query a beat to settle, then assert the bar never appears.
  await expect(component.getByText("Aria")).toHaveCount(0);
  await expect(component.getByTestId("chat-character-bar")).toHaveCount(0);
});

test("a 2+ roster renders a chip per character", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHARACTER_ROUTE,
    "chat.getChat": () => roster(character("aria", "Aria"), character("bryn", "Bryn")),
  });
  const component = await mount(<ChatCharacterBarStory />);

  await expect(component.getByTestId("chat-character-bar")).toBeVisible();
  await expect(component.getByRole("group", { name: "Characters" })).toBeVisible();
  await expect(component.getByText("Aria")).toBeVisible();
  await expect(component.getByText("Bryn")).toBeVisible();
});

test("a muted member's chip is marked (dimmed)", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHARACTER_ROUTE,
    "chat.getChat": () => roster(character("aria", "Aria"), character("bryn", "Bryn", { disabled: true })),
  });
  const component = await mount(<ChatCharacterBarStory />);

  // Both chips render; exactly one carries the muted marker (Bryn).
  await expect(component.locator('[data-slot="character-chip"]')).toHaveCount(2);
  await expect(component.locator('[data-slot="character-chip"][data-muted]')).toHaveCount(1);
});

// ── #490: THE STRIP CARRIES NO MUTATION AT ALL, HOST OR NOT ───────────────────────────────────────
// INVERTED, deliberately. The two cases here used to be "a member sees NO '+'" / "a host sees the '+'" —
// a host-gate pin on a door that should never have been on this strip: it made "add a character" a
// SIMULTANEOUSLY VISIBLE second door beside the CONTEXT panel's Characters header (`design-audit`
// `duplicate-action-door`, side-eye 2026-08-22), and this component's own header declares it
// "presence-at-a-glance only, no mutations". The host GATE is not what moved — the door's ONE home is
// `committed-members-tab.tsx`, where `members-panel.ct.tsx` pins exactly this host/member pair. Half a
// migration is the rot, so the old pins are re-aimed rather than left asserting a door that is gone.
test("#490 neither a host nor a member gets an add-member door on the strip (its ONE home is CONTEXT)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHARACTER_ROUTE, "chat.getChat": () => charactersWithHost(false) });
  const asMember = await mount(<ChatCharacterBarStory />);
  await expect(asMember.getByTestId("chat-character-bar")).toBeVisible();
  await expect(asMember.getByRole("button", { name: "Add a character" })).toHaveCount(0);
  await asMember.unmount();

  // The arm that would silently come back if someone re-mounted the popover behind the host gate.
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHARACTER_ROUTE, "chat.getChat": () => charactersWithHost(true) });
  const asHost = await mount(<ChatCharacterBarStory />);
  await expect(asHost.getByTestId("chat-character-bar")).toBeVisible();
  await expect(asHost.getByRole("button", { name: "Add a character" })).toHaveCount(0);
  // …and the strip is still the strip: it is not empty, it just does not mutate.
  await expect(asHost.locator('[data-slot="character-chip"]')).not.toHaveCount(0);
});

// ── #229/#237: the strip's OVER-ART legibility backing ────────────────────────────────────────────
// The bar sits in `.shell-main`, which a wallpaper makes transparent (shell.css), so its chips and names
// floated on the raw photo behind only a halo text-shadow — the over-art chrome class #106/#221 closed
// for the message row's own bands, and the one rule #237 extends across the shell's chrome. The backing
// is self-gated on the shell's `data-has-bg-image`, so the plain-background arm must not move a pixel.
test("#229: over a wallpaper the strip takes the derived plate + blur; without one it is byte-identical", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHARACTER_ROUTE, "chat.getChat": () => roster(character("a", "Birdie"), character("b", "Mira")) });
  const plain = await mount(<ChatCharacterBarStory />);
  const plainStrip = plain.getByTestId("chat-character-bar");
  await expect(plainStrip).toBeVisible();
  // No wallpaper ⇒ no plate, no blur: the strip is exactly the transparent band it always was.
  await expect
    .poll(async () =>
      plainStrip.evaluate((el) => {
        const s = getComputedStyle(el);
        return { backdrop: s.backdropFilter, bg: s.backgroundColor };
      }),
    )
    .toStrictEqual({ backdrop: "none", bg: "rgba(0, 0, 0, 0)" });
  await plain.unmount();

  const overArt = await mount(<ChatCharacterBarStory overArt={true} />);
  const artStrip = overArt.getByTestId("chat-character-bar");
  await expect(artStrip).toBeVisible();
  const readArtPaintAtAssertion = async (): Promise<typeof artPaint> =>
    await artStrip.evaluate((el) => {
      const s = getComputedStyle(el);
      return { backdrop: s.backdropFilter, bg: s.backgroundColor, plate: s.getPropertyValue("--color-reading-plate").trim() };
    });
  const artPaint = await artStrip.evaluate((el) => {
    const s = getComputedStyle(el);
    return { backdrop: s.backdropFilter, bg: s.backgroundColor, plate: s.getPropertyValue("--color-reading-plate").trim() };
  });
  // The fill is the ROW'S OWN plate token — the polarity-derived backing, never a hand-picked smoke.
  await expect.poll(async () => (await readArtPaintAtAssertion()).plate).not.toBe("");
  await expect.poll(async () => (await readArtPaintAtAssertion()).bg).not.toBe("rgba(0, 0, 0, 0)");
  await expect.poll(async () => (await readArtPaintAtAssertion()).backdrop).toContain("blur");
});

// ── #511: THE PHONE STRIP IS AN AVATAR STACK, AND THE TAX STOPS SCALING WITH NARROWNESS ───────────
//
// THE MEASURED DEFECT (this file's own instrument, coarse pointer, the real room pane at `paneHeight`
// 822 — the phone viewport minus the shell's topbar and tab bar). Strip HEIGHT by width × roster:
//
//        roster                                   430px      390px      320px
//   3 short character names                      40 (1 row) 40 (1 row) 40 (1 row)
//   2 humans named by EMAIL + 3 characters       70 (2)     70 (2)     70 (2)
//   4 card-realistic character names             70 (2)     100 (3)    130 (4)
//
// The tax is not a constant band — it grows as the screen shrinks, because the strip's answer to "no
// room" is to WRAP, and every wrapped row is taken from the transcript. 130px of a 430px-wide phone's
// pane spent naming four characters is the shape side-eye 2026-08-22 filed as "the reason you opened
// the room is the smallest thing on screen"; the ROSTER, not the width, decides how bad it gets, which
// is why a single-width receipt could never have chosen the fix.
//
// THE ARM (the review's own `adapt`): at a COARSE pointer the names go `sr-only` — the strip becomes the
// avatar stack the list rows already use, one row at every width and every roster, while the names stay
// in the ACCESSIBILITY TREE (a screen-reader user loses nothing) and stay VISIBLE at a fine pointer,
// where the pane is wide and the vertical budget is not scarce. It is pointer-conditional, not
// width-conditional, for the same reason `--spacing-touch-target` is: the phone is the host with both
// the scarce height AND the reader who is holding the device a foot from their face, where an avatar
// reads faster than a name. The REFUSED arms are recorded so they are not re-minted: merging the row
// into the TOPBAR duplicates the chat-header's member chip (§13 single-homing) and reaches into shell
// chrome this component does not own; collapse-on-scroll leaves the worst case (130px) standing at
// first paint, which is exactly when the reader is deciding whether the room is worth their thumb.
//
// THE FORK THE OWNER MAY WANT TO SEE: on a phone a character is IDENTIFIED BY FACE ONLY. Initials + the
// per-character hue seed carry an unfamiliar character weakly, and this is a deliberate trade of one glance
// for ~90px of transcript.

/** A human seat the strip actually PAINTS — `resolveHumanParticipants` filters on `leftSeq === null`, so
 *  a stub without it renders no human chips at all (which is why the older cases here show none). */
function seatedHuman(role: ParticipantRole, displayName: string): unknown {
  return {
    id: `participant_${role}`,
    kind: "human",
    role,
    userId: `user_${role}`,
    characterId: null,
    displayName,
    disabled: false,
    leftSeq: null,
    avatarHash: null,
  };
}

/** The compound worst case the matrix above found: two humans named by their EMAIL (#162 — that is what a
 *  human seat's display name is until a persona names it) beside card-realistic character names. */
const CROWDED_ROSTER = [
  seatedHuman("host", "studio@inktomi.tech"),
  seatedHuman("member", "casey@example.com"),
  character("aria", "Aria of the Ninth Gate"),
  character("bryn", "Bryn Ashgrove, the Warden"),
  character("azarael", "Azarael"),
  character("sera", "Sera of the Long Winter Court"),
];

const PHONE_ROOM_STUB = {
  ...CHAT_AMBIENT_ROUTES,
  ...CHARACTER_ROUTE,
  "chat.previewContextFit": (): unknown => ({
    boundaryMessageId: null,
    usedTokens: 120,
    ceilingTokens: 32_768,
    ceilingEstimated: false,
    reserveOutputTokens: 2048,
    droppedCount: 0,
    compactSummary: null,
  }),
  "chat.listMessages": (): unknown =>
    makeMessagesPage([makeMessageView({ id: castId<MessageId>("msg_phone"), role: "assistant", content: "North, past the spire." })]),
  "chat.getChat": (): { participants: readonly unknown[]; anchorPersonaId: null; identities: readonly ChatIdentity[]; group: GroupConfig } => ({
    participants: CROWDED_ROSTER,
    anchorPersonaId: null,
    identities: [],
    group: DEFAULT_GROUP_CONFIG,
  }),
};

/** One settled read of the strip's geometry AND of what each chip announces. `rows` is the count of
 *  DISTINCT chip tops — the wrap count, measured rather than inferred from a height. */
function measureStrip(page: Page): Promise<{
  readonly height: number;
  readonly rows: number;
  readonly names: readonly string[];
  readonly nameInkWidths: readonly number[];
  readonly avatarWidth: number;
}> {
  return page.evaluate(() => {
    const strip = document.querySelector('[data-testid="chat-character-bar"]') as HTMLElement;
    const chips = [...document.querySelectorAll('[data-slot="character-chip"],[data-slot="human-chip"]')];
    const avatar = strip.querySelector('[data-slot="avatar-root"]') as HTMLElement;
    return {
      height: Math.round(strip.getBoundingClientRect().height),
      rows: new Set(chips.map((el) => Math.round(el.getBoundingClientRect().top))).size,
      // The ANNOUNCED name, read off the name node's textContent — never the chip's (the avatar's
      // initials fallback is text too) and never `innerText`, which is layout-aware and would go blank
      // exactly when the arm works. The whole point is that the name survives the visual collapse.
      names: chips.map((el) => (el.querySelector('[data-slot="text"]')?.textContent ?? "").trim()),
      // The name's own LAYOUT footprint: `sr-only` clamps it to a 1px clipped box, so this is what
      // separates "the name is hidden" from "the name is still spending the row's width".
      nameInkWidths: chips.map((el) => Math.round((el.querySelector('[data-slot="text"]') as HTMLElement | null)?.getBoundingClientRect().width ?? -1)),
      avatarWidth: Math.round(avatar.getBoundingClientRect().width),
    };
  });
}

for (const width of [430, 390, 320]) {
  test.describe(`#511 phone strip at ${width}px`, () => {
    test.use({ viewport: { width, height: 932 }, hasTouch: true });

    test(`the strip is ONE row of avatars — the crowded roster cannot wrap it (${width}px)`, async ({ mount, page }) => {
      await routeTrpc(page, PHONE_ROOM_STUB);
      const room = await mount(<ChatRoomPhoneStory paneHeight={822} />);
      // The pointer class is the arm's whole condition — read it before trusting a single measurement.
      // Settled snapshot: a media-query match on a CONTEXT flag fixed before the page opened (`hasTouch`), so
      // nothing async can change it (the face-strip / touch-target-floor suites read it the same way).
      await expect.poll(async () => await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
      await expect(room.getByTestId("chat-character-bar")).toBeVisible();
      await expect(room.locator('[data-slot="character-chip"]')).toHaveCount(4);

      const measured = await measureStrip(page);
      expect(measured.rows, `the strip wrapped to ${measured.rows} rows at ${width}px (height ${measured.height}px)`).toBe(1);
      // Every name is still ANNOUNCED — the collapse is visual, never a deletion.
      expect(measured.names).toEqual([
        "Aria of the Ninth Gate",
        "Bryn Ashgrove, the Warden",
        "Azarael",
        "Sera of the Long Winter Court",
        "studio@inktomi.tech",
        "casey@example.com",
      ]);
      // …and none of them SPENDS the row: an sr-only span is clipped to 1px, so no name can push the
      // next chip onto a second line. Asserted per chip, because one un-collapsed name is the defect.
      for (const ink of measured.nameInkWidths) {
        expect(ink).toBeLessThanOrEqual(1);
      }
      // The strip is now as tall as its avatars plus its own band padding, at every width — the tax is
      // FLAT instead of growing as the screen narrows.
      expect(measured.height).toBeLessThan(measured.avatarWidth * 2);
    });
  });
}

// THE FINE-POINTER ARM IS UNCHANGED — the desktop strip still reads as names, because the trade above is
// paid for by a phone's scarce height and a desktop pane has neither the scarcity nor the tab bar.
test.describe("#511 the desktop strip keeps its names", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("at a fine pointer the names are painted, not merely announced", async ({ mount, page }) => {
    await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHARACTER_ROUTE, "chat.getChat": () => ({ participants: CROWDED_ROSTER }) });
    const component = await mount(<ChatCharacterBarStory />);
    await expect(component.getByTestId("chat-character-bar")).toBeVisible();
    // Settled snapshot: the same context-fixed media match as the coarse arm — no `hasTouch`, decided before
    // the page opened, and it is the discriminator for this whole describe.
    await expect.poll(async () => await page.evaluate(() => matchMedia("(pointer: fine)").matches)).toBe(true);

    await expect(component.getByText("Aria of the Ninth Gate")).toBeVisible();
    const measured = await measureStrip(page);
    // The ink is REAL here — every name spends width, which is the desktop strip's whole design.
    for (const ink of measured.nameInkWidths) {
      expect(ink).toBeGreaterThan(measured.avatarWidth);
    }
  });
});
