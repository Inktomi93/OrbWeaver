// CT: the composed chat-room pane (transcript + composer) — the surface that was untested before this
// task. Two shapes: a SEEDED DRAFT (the new-chat-with-character landing, J2/J3) renders each founding
// character's greeting as an editable message row (character-first, never an empty void) WITHOUT reading
// CANON (`chat.listMessages` — the ChatHandle discriminant is the gate; it DOES read the founding cards
// `character.get` for the greeting preview); a COMMITTED chat reads canon + roster (routeTrpc stubs
// `chat.listMessages`/`chat.getChat`) and renders the rows beside the composer.
//
// NOTE: `chat.listMessages` is stubbed at the NETWORK (routeTrpc) — the draft case asserts it is NEVER
// hit (the surface must not fetch CANON for a chat with no server row yet). `chat.listMessages` returns
// `MessagesPage { messages, cast }` (Chat-Macro-Resolution.md §1/§3 / D137) — every stub wraps via
// `makeMessagesPage`; the committed test also stubs `chat.getChat`'s roster + `cast` floor
// (message-list-surface.ct.tsx's `ROSTER_STUB` precedent).

import type { CastEntry, GroupConfig } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { CharacterId, MessageId, PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { testId } from "../../../../../packages/client/src/lib/test-ids.ts";
import { routeOrbSocket } from "../../../../support/ct/route-orb-socket.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { ChatRoomGreetingWindowStory, ChatRoomSurfaceStory, ChatSurfaceContributorStory } from "../_ct-stories.tsx";
import { CHAT_ID, makeMessagesPage, makeMessageView } from "../fixtures.ts";

// The divider's present-tense preview (PD-#7). Every map stubs it with a VALID resolved shape — the
// harness's unlisted-proc default (`data: null`) is out-of-contract for this query and crashes the
// surface (integration find, 2026-07-24). boundaryMessageId null = "everything fits" (no divider).
const PREVIEW_FIT_STUB = {
  "chat.previewContextFit": (): {
    boundaryMessageId: null;
    usedTokens: number;
    ceilingTokens: number;
    ceilingEstimated: boolean;
    reserveOutputTokens: number;
    droppedCount: number;
    compactSummary: null;
  } => ({
    boundaryMessageId: null,
    usedTokens: 120,
    ceilingTokens: 32_768,
    ceilingEstimated: false,
    reserveOutputTokens: 2048,
    droppedCount: 0,
    compactSummary: null,
  }),
};

const BUBBLE = '[data-slot="message-bubble"]';

const CANON = [
  makeMessageView({
    id: castId<MessageId>("msg_room_user"),
    role: "user",
    content: "Hi Aria",
    seq: 1,
  }),
  makeMessageView({
    id: castId<MessageId>("msg_room_ai"),
    role: "assistant",
    content: "Well met, traveller.",
    seq: 2,
  }),
];

const ROSTER_STUB = {
  ...PREVIEW_FIT_STUB,
  "chat.getChat": (): {
    participants: never[];
    anchorPersonaId: null;
    cast: readonly CastEntry[];
    group: GroupConfig;
  } => ({
    participants: [],
    anchorPersonaId: null,
    cast: [],
    group: DEFAULT_GROUP_CONFIG,
  }),
};

// ── ONE renderer for the room's body — the pins that used to run over the DRAFT greeting and its
// COMMITTED twin together (the owner report was "markdown doesn't apply before the chat is committed").
// The draft arm is gone with draft mode; the convergence claim it proved is now simply what the one
// renderer does, and these keep asserting it: emphasis is a native <em>, Streamdown renders strong as
// `<span data-streamdown="strong">` (the ghost-message-row.ct.tsx precedent), an inline code span is
// <code>, and the `{{user}}` macro resolves against the chat's ANCHOR persona.
const NOVA = "persona_nova";
const FORMATTED_BODY = "*She looks up.* **Well met**, {{user}} — try `:help` sometime.";

// The ST-card shape (Azarael: quoted dialogue + plain narration, zero asterisks) — the `colorQuotedSpeech`
// appearance knob has to reach the body from the settings read. The knob-OFF case is the discriminator: an
// always-on tint (a transform mounted unconditionally in the seal) passes the ON tests and fails that one.
const QUOTED_GREETING = "He doesn’t look up from the ledger. “You’re late,” he says.";
const DIALOGUE_SPAN = '[data-slot="dialogue"]';

async function expectFormattedBody(bubble: Locator): Promise<void> {
  await expect(bubble.locator("em")).toHaveText("She looks up.");
  await expect(bubble.locator('[data-streamdown="strong"]')).toHaveText("Well met");
  await expect(bubble.locator("code")).toHaveText(":help");
  await expect(bubble).toContainText("Well met, Nova —");
}

test("the COMMITTED arm tints that same quoted body identically (one renderer, both arms)", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...PREVIEW_FIT_STUB,
    "chat.listMessages": () => makeMessagesPage([makeMessageView({ id: castId<MessageId>("msg_room_quoted"), role: "assistant", content: QUOTED_GREETING })]),
    ...ROSTER_STUB,
  });
  const component = await mount(<ChatRoomSurfaceStory />);
  const tinted = component.locator(BUBBLE).first().locator(DIALOGUE_SPAN);
  await expect(tinted).toHaveCount(1);
  await expect(tinted).toHaveText("“You’re late,”");
});

test("the COMMITTED arm renders that same body identically — the draft is not a second rendering home", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...PREVIEW_FIT_STUB,
    "chat.listMessages": () => makeMessagesPage([makeMessageView({ id: castId<MessageId>("msg_room_greeting"), role: "assistant", content: FORMATTED_BODY })]),
    // The committed arm's `{{user}}` subject: the chat's ANCHOR persona + the cast entry that carries it
    // (the exact pair the draft arm predicts client-side).
    "chat.getChat": (): {
      participants: never[];
      anchorPersonaId: string;
      cast: readonly CastEntry[];
      group: GroupConfig;
    } => ({
      participants: [],
      anchorPersonaId: NOVA,
      cast: [{ kind: "persona", id: castId<PersonaId>(NOVA), name: "Nova", description: "a wandering cartographer", avatarHash: null }],
      group: DEFAULT_GROUP_CONFIG,
    }),
  });

  const component = await mount(<ChatRoomSurfaceStory />);

  const bubble = component.locator(BUBBLE).first();
  await expect(bubble).toBeVisible();
  await expectFormattedBody(bubble);
});

test("a committed chat reads canon and renders the rows beside the composer", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...PREVIEW_FIT_STUB,
    "chat.listMessages": () => makeMessagesPage(CANON),
    ...ROSTER_STUB,
  });

  const component = await mount(<ChatRoomSurfaceStory />);

  await expect(component.getByText("Hi Aria")).toBeVisible();
  await expect(component.getByText("Well met, traveller.")).toBeVisible();
  await expect(component.getByTestId(testId("composer"))).toBeVisible();

  // Finding #2: the programmatically-focused room container carries an explicit role + aria-label so its
  // name never falls to name-from-content (which concatenated the whole toolbar: "Cast · Jump to latest ·
  // Attach images · Send message…"). The stubbed getChat has no title/participants, so the label falls to
  // the derived "Untitled chat" — the point is it's a SHORT, chat-scoped name, not the toolbar dump.
  const room = component.getByRole("group", { name: "Untitled chat" });
  await expect(room).toBeVisible();
  await expect(room).toHaveAccessibleName("Untitled chat");
});

// THE ANTI-STORM PIN (freshness plan Phase 4). The mutation-vs-bus rule is that a `send` invalidates
// NOTHING of its own (`busDriven` — createEntityMutation); the SSE bus is the sole freshness path. The
// exhaustive invalidation.test.ts pins the BUS half; the per-mutation `busDriven` marker pins the config.
// This pins the LIVE seam end-to-end: a REAL send through the REAL composer + useSendMessage, and the
// list is refetched ZERO extra times by the mutation. Isolation is the discriminator — NO bus turn is
// delivered (empty stream), so the ONLY thing that could refetch `listMessages` after the initial read is
// the mutation itself. It doesn't. A regression re-adding `invalidates` to the send mutation (or dropping
// `busDriven`) makes this count 2 and the test goes red — the "one send fired the list 4-5×" storm.
test("a committed send adds NO invalidation of its own — the list refetch is bus-only (busDriven)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    ...PREVIEW_FIT_STUB,
    // The committed room reads its transcript ONCE (the list + the composer's tail-gate share the key).
    "chat.listMessages": () => makeMessagesPage([makeMessageView({ id: castId<MessageId>("msg_room_user"), role: "user", content: "Ping?" })]),
    // `send` resolves immediately (the turn's effect is bus-driven; the value is never read back).
    "chat.send": () => null,
    ...ROSTER_STUB,
  });
  // NO bus turn — isolate the mutation's own contribution (the bus→refetch path is pinned separately in
  // message-list-surface.ct.tsx). With an empty stream, only the mutation could refetch the list.
  await routeOrbSocket(page, { frames: [] });
  // Delay the `send` POST so its in-flight (isPending) window is observably long — the disabled→enabled
  // bracket below is what proves onSettled RAN (isPending flips false only after the mutation settles,
  // which is strictly after onSettled's invalidate would have fired). Registered LAST ⇒ runs FIRST (LIFO),
  // falls through to routeOrbSocket → routeTrpc for everything it doesn't delay.
  await page.route("**/api/trpc/**", async (route) => {
    const req = route.request();
    if (req.method() === "POST" && req.url().includes("chat.send")) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    await route.fallback();
  });

  const component = await mount(<ChatRoomSurfaceStory />);

  // The transcript read once; baseline established.
  await expect(component.getByText("Ping?")).toBeVisible();
  await expect.poll(() => trpc.count("chat.listMessages"), { intervals: [20, 50, 100] }).toBe(1);

  // Fire a REAL send through the composer.
  await component.getByRole("textbox", { name: "Message" }).fill("Hello?");
  const sendButton = component.getByRole("button", { name: "Send message" });
  await sendButton.click();

  // In flight — the delayed POST holds `isPending` true (Send disabled). Nothing has settled yet.
  await expect(sendButton).toBeDisabled();
  // Settled — the mutation resolved AND onSettled ran (isPending → false re-enables Send). Any invalidate
  // the mutation was going to fire has already been kicked (synchronously, inside onSettled) by now.
  await expect(sendButton).toBeEnabled();

  // THE PIN: the send fired for real, and it refetched the list ZERO extra times. Bus-only freshness.
  await expect.poll(() => trpc.count("chat.send")).toBe(1);
  await expect.poll(() => trpc.count("chat.listMessages")).toBe(1);
});

// ── #13: the composer survives room-settle (no remount eats keystrokes) ───────────────────────────
// The bug: ComposerSlot rendered the composer inside a <Suspense> boundary whose fallback was a SECOND
// <Composer>; when listMessages settled the fallback swapped for the resolved child, remounting the
// <textarea> and dropping focus + every keystroke typed before the query resolved (the e2e lane's
// "typing right after room open registers only the FIRST character"). The fix reads the tail via a
// NON-suspending gated query so there is ONE stable <Composer> across the in-flight→settled transition.
// This pins it: listMessages is HELD, the user types the FULL message while it is in flight, THEN it
// settles — the typed value must be intact (a remount would have lost all but nothing, since the old
// suspended composer never mounted until settle; either way a regression drops the text).
test("#13: typing while listMessages is in flight survives the room settle — no composer remount eats keystrokes", async ({ mount, page }) => {
  let releaseList: (() => void) | undefined;
  const listHeld = new Promise<void>((resolve) => {
    releaseList = resolve;
  });
  // Hold listMessages via a route that BLOCKS on the release gate before falling through to routeTrpc
  // (registered AFTER routeTrpc ⇒ runs FIRST, LIFO; delegates the actual envelope + batch framing to
  // routeTrpc's fallback so the wire shape stays correct) — the room settle is under test control.
  await routeTrpc(page, { ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage(CANON) });
  await page.route("**/api/trpc/**", async (route) => {
    if (route.request().url().includes("chat.listMessages")) {
      await listHeld;
    }
    await route.fallback();
  });

  const component = await mount(<ChatRoomSurfaceStory />);

  // The composer is live IMMEDIATELY (single stable element, tailRole=null until the read warms) — the
  // old suspended composer would not exist yet (the boundary shows its fallback composer, a different
  // element). Type the FULL message with the transcript still in flight.
  const textarea = component.getByRole("textbox", { name: "Message" });
  await expect(textarea).toBeVisible();
  await textarea.click();
  await textarea.pressSequentially("Reply immediately", { delay: 10 });
  await expect(textarea).toHaveValue("Reply immediately");

  // Now the room settles — the transcript resolves and renders. A remount here (the regressed shape)
  // would blow away the typed value; the stable element keeps it.
  releaseList?.();
  await expect(component.getByText("Well met, traveller.")).toBeVisible();
  await expect(textarea).toHaveValue("Reply immediately");
  // Focus survived too (the same element was never torn down).
  await expect(textarea).toBeFocused();
});

// ── The chat-surface-anchor CONTRIBUTOR seam (client-architecture-lockdown.md §6c/M8 — new) ────────
// A fake `ChatSurfaceContribution` at each of the 3 anchors, registered at a door-mirroring
// `CtChatContributorSectionRegistry` in place of the empty registry, mounted through the REAL `chats`
// section's `content()` → `ChatContent` → `ChatRoomSurface`/`MessageRow` anchor-consumer path (this file's
// own `chat-room-surface.tsx`, and `message-row.tsx` for `message-footer`).

test("a fake thread-flank contribution appears beside the thread (the flank column activates)", async ({ mount, page }) => {
  // Wide content width — comfortably above the @max-lg (32rem/512px) stack threshold, so the flank
  // row's container query resolves to the beside (row) layout.
  await page.setViewportSize({ width: 1024, height: 600 });
  await routeTrpc(page, { ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage(CANON) });

  const component = await mount(<ChatSurfaceContributorStory anchor="thread-flank" visible={true} />);

  await expect(component.getByTestId("ct-fake-surface-contribution")).toBeVisible();
  await expect(component.getByText("fake thread-flank")).toBeVisible();
  const flankRow = page.locator('[data-slot="chat-room-flank-row"]');
  await expect(flankRow).toHaveCSS("flex-direction", "row");
});

test("a fake thread-flank contribution with `when:false` renders NO flank column (today's layout, unchanged)", async ({ mount, page }) => {
  await routeTrpc(page, { ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage(CANON) });

  const component = await mount(<ChatSurfaceContributorStory anchor="thread-flank" visible={false} />);

  await expect(component.getByTestId("ct-fake-surface-contribution")).toHaveCount(0);
  await expect(page.locator('[data-slot="chat-thread-flank"]')).toHaveCount(0);
});

// THE RULING (2026-07-15) — the thread-flank anchor is the SEAM's responsibility, not the
// contributor's: flank layout must be responsive-correct BY CONSTRUCTION so a live flank never
// crushes the thread's reading column at narrow content width. Proven via a CONTAINER query (the
// chat-content region's own inline size), NOT a viewport media query — the flank stacks below the
// thread instead.
test("a fake thread-flank contribution STACKS below the thread at narrow content width (no crushed reading column)", async ({ mount, page }) => {
  // Below the @max-lg (32rem/512px) container-query threshold — the flank row must switch to
  // column, keeping the thread at full (readable) width instead of splitting it with the flank.
  await page.setViewportSize({ width: 400, height: 600 });
  await routeTrpc(page, { ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage(CANON) });

  const component = await mount(<ChatSurfaceContributorStory anchor="thread-flank" visible={true} />);

  // The flank is NOT hidden — it renders stacked, not dropped.
  await expect(component.getByTestId("ct-fake-surface-contribution")).toBeVisible();
  const flankRow = page.locator('[data-slot="chat-room-flank-row"]');
  await expect(flankRow).toHaveCSS("flex-direction", "column");
});

test("a fake above-composer contribution appears between the selection bar slot and the composer", async ({ mount, page }) => {
  await routeTrpc(page, { ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage(CANON) });

  const component = await mount(<ChatSurfaceContributorStory anchor="above-composer" visible={true} />);

  await expect(component.getByTestId("ct-fake-surface-contribution")).toBeVisible();
});

test("a fake above-composer contribution's `when:false` hides it", async ({ mount, page }) => {
  await routeTrpc(page, { ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage(CANON) });

  const component = await mount(<ChatSurfaceContributorStory anchor="above-composer" visible={false} />);

  await expect(component.getByTestId("ct-fake-surface-contribution")).toHaveCount(0);
});

test("a fake message-footer contribution renders under a COMMITTED message row", async ({ mount, page }) => {
  await routeTrpc(page, { ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage(CANON) });

  const component = await mount(<ChatSurfaceContributorStory anchor="message-footer" visible={true} />);

  // One footer per COMMITTED row (CANON has 2 messages) — proves the anchor mounts PER-ROW, not once.
  const footers = component.getByTestId("ct-fake-surface-contribution");
  await expect(footers).toHaveCount(CANON.length);
  await expect(footers.first()).toBeVisible();
});

test("a fake message-footer contribution's `when:false` hides it on the row", async ({ mount, page }) => {
  await routeTrpc(page, { ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage(CANON) });

  const component = await mount(<ChatSurfaceContributorStory anchor="message-footer" visible={false} />);

  await expect(component.getByTestId("ct-fake-surface-contribution")).toHaveCount(0);
});

// ── DENSITY S6: the room DECLARES the instrument tier, and the transcript's islands resolve it ──────
// The MECHANISM probe lives in tests/ui/density-tier.suite.ct.tsx; it says nothing about whether the real
// chat room still declares a tier — a deleted <Surface>, a re-homed pane or a portaled row all leave the
// mechanism green and the room un-tiered (the S5 lesson, tests/support/ct/tier-liveness.ts). So these read
// the transcript's own island back from the browser: the `:::choices` block is the transcript's
// always-reachable tier-resolved island (a <Card>, so its padding + radius come from the tier map and not
// from anything this feature spells). Every expectation resolves its token from the SAME document.
const CHOICES_CANON = [
  makeMessageView({
    id: castId<MessageId>("msg_room_choices"),
    role: "assistant",
    content: "The corridor forks.\n:::choices\n1. Draw your blade.\n2. Slip into the shadows.\n:::",
    seq: 1,
  }),
];

/** The px a spacing/radius token resolves to in the live CT document — never a hardcoded step. */
function resolveTokenPx(root: Locator, token: string): Promise<number> {
  return root.evaluate((node, name) => {
    const probe = node.ownerDocument.createElement("div");
    probe.style.padding = `var(${name})`;
    node.ownerDocument.body.append(probe);
    const px = Number.parseFloat(getComputedStyle(probe).paddingTop);
    probe.remove();
    return px;
  }, token);
}

function computedPx(el: Locator, property: "paddingLeft" | "borderTopLeftRadius"): Promise<number> {
  return el.evaluate((node, prop) => Number.parseFloat(getComputedStyle(node)[prop]), property);
}

/** The transcript island whose BOX the tier map owns: the `<Card>` wrapping the choices block. `Card` always
 *  stamps its own `data-slot="card-root"` (it is the slot tiers.css keys on), so the block's own marker rides
 *  the content inside it and the island is addressed through it. */
const CHOICES_ISLAND = '[data-slot="card-root"]:has([data-slot="message-choices"])';

test("the chat room declares the INSTRUMENT tier — the transcript's island resolves --spacing-row, not the tier-less --spacing-block", async ({
  mount,
  page,
}) => {
  await routeTrpc(page, { ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage(CHOICES_CANON) });
  const component = await mount(<ChatRoomSurfaceStory />);

  const island = component.locator(CHOICES_ISLAND).first();
  await expect(island).toBeVisible();
  const row = await resolveTokenPx(island, "--spacing-row");
  const block = await resolveTokenPx(island, "--spacing-block");
  expect(row, "the two steps must differ or this proves nothing").not.toBe(block);
  expect(await computedPx(island, "paddingLeft"), "an un-tiered room falls back to the airy --spacing-block step").toBe(row);
  // D6 + CD2 (side-eye ruling 2026-08-03): `--radius-card` is the ELEVATED step (the bubble this island
  // sits INSIDE), grouped content inside a surface is `--radius-base`, and a NESTED island steps one below
  // that again — `--radius-inset`. The choices block is nested by construction (it renders inside the
  // bubble), so this specimen reads the nested step, and its border is gone: one box, one axis of
  // separation, the fill alone carrying the distinction.
  expect(await computedPx(island, "borderTopLeftRadius")).toBe(await resolveTokenPx(island, "--radius-inset"));
  expect(await computedPx(island, "borderTopLeftRadius")).toBeLessThan(await resolveTokenPx(island, "--radius-base"));
  const borderWidth = await island.evaluate((node) => Number.parseFloat(getComputedStyle(node).borderTopWidth));
  expect(borderWidth, "CD2: the nested island drops its border rather than adding a second edge inside the bubble's").toBe(0);
});

test("LIVE: stripping data-surface-tier off the room moves the transcript island back to the tier-less step", async ({ mount, page }) => {
  await routeTrpc(page, { ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage(CHOICES_CANON) });
  const component = await mount(<ChatRoomSurfaceStory />);

  const island = component.locator(CHOICES_ISLAND).first();
  await expect(island).toBeVisible();
  const before = await computedPx(island, "paddingLeft");
  await page.evaluate(() => {
    for (const node of document.querySelectorAll("[data-surface-tier]")) {
      node.removeAttribute("data-surface-tier");
    }
  });
  const after = await computedPx(island, "paddingLeft");
  expect(after, "the tier map is INERT in this room — nothing under it actually resolves the tier").not.toBe(before);
  expect(after).toBe(await resolveTokenPx(island, "--spacing-block"));
});

// ── THE ROOM-THEME TAKEOVER REACHES THE DRAFT PHASE (owner dogfood 2026-08-06) ────────────────────
// "the whole 'draft' mode is sloppy as fuck." One measured half of it: the sole-character chrome takeover
// resolved off `chat.getChat`'s roster, which a draft has none of, so a room started with a themed card
// wore the viewer's default chrome and re-skinned itself at the first send. It now resolves off the
// phase-independent `CarriedAppearanceCast` — the founding CARDS before commit, the roster after — so
// both arms below must land the SAME token from the SAME card.
//
// Asserted through the RENDERED custom property (the room's `<ThemeScope>` is what paints), never the
// resolver's return: `--color-primary` is what `accent` clamps to, and it is inherited by everything in
// the room. The GROUP arm is the discriminator — a fix that takes over from "any card in the cast" passes
// the solo arm and fails it.
const CARD_ACCENT = "oklch(0.62 0.21 305)";
const CARD_THEME = { accent: CARD_ACCENT, speaker: CARD_ACCENT };

/** The room's rendered accent — read off the transcript's own bubble, so a takeover that never reached
 *  the DOM (or landed on a detached scope) fails. */
function renderedAccent(root: Locator): Promise<string> {
  return root.evaluate((node) => getComputedStyle(node).getPropertyValue("--color-primary").trim());
}

test("COMMITTED: the SAME card resolves the SAME room accent through the roster (one rule, both phases)", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...PREVIEW_FIT_STUB,
    "chat.listMessages": () => makeMessagesPage(CANON),
    "chat.getChat": () => ({
      participants: [
        { id: "cp_human", kind: "human", characterId: null, displayName: "Alex", leftSeq: null, avatarHash: null, role: "host" },
        {
          id: "cp_aria",
          kind: "character",
          characterId: "char_ct_room",
          displayName: "Aria",
          leftSeq: null,
          avatarHash: null,
          role: "member",
          themeOverride: CARD_THEME,
        },
      ],
      anchorPersonaId: null,
      cast: [],
      group: DEFAULT_GROUP_CONFIG,
    }),
  });

  const component = await mount(<ChatRoomSurfaceStory />);

  const bubble = component.locator(BUBBLE).first();
  await expect(bubble).toBeVisible();
  expect(await renderedAccent(bubble)).toBe(CARD_ACCENT);
});

// ── THE CAST STRIP SERVES BOTH PHASES (side-eye P2, 2026-08-06) ───────────────────────────────────
// The strip existed only for a COMMITTED chat, so a group DRAFT — a room that already knows its whole
// founding cast — showed no cast at all above the transcript. Same strip, same >1 floor; the phase only
// decides where the seats come from. The SOLO arm is the discriminator: a fix that mounts the strip
// unconditionally passes the group case and wrongly paints a one-character room.

/** The add-member door's accessible name, in both phases ("Add a character"). */

// ── THE GREETING WINDOW (chat-creation-draft-mode-replacement.md §4.8 / fork F6, R3) ────────────────
//
// A seeded greeting is REAL CANON from the creation click (R1), and it stays malleable until the first user
// turn freezes it (`freezeGreetingVolatiles`, verbs/turn.ts). Stepping it among the card's alternates was a
// pre-send affordance backed by a client store; R1 deleted that store and the affordance went dark. It is
// back here, over the committed row, driven by the host-gated `chat.setSeededGreeting` verb.
//
// The pin asserts the AFFORDANCE and the WIRE, not the store: the strip's `n / m` counter and its chevrons
// on a greeting row, the verb firing with the stepped INDEX (never free text — the server resolves the
// alternate from the card, so this door can't be a second content-write), and the row re-rendering the new
// alternate once canon reflects it.

const GREETING_CHARACTER = castId<CharacterId>("char_room_greeter");
const ALT_0 = "The night market hums.";
const ALT_1 = "She looks up from the ledger.";
const ALT_2 = "Rain, again.";
/** The card's openings, in card order — the strip's `n / m` domain and the verb's index space. */
const ALTERNATES = [ALT_0, ALT_1, ALT_2];
const GREETING_ID = castId<MessageId>("msg_room_seeded_greeting");

/** A room whose canon is ONE seeded greeting and NO user row — the malleable window, and the state a
 *  just-created room is in. `alternateIdx` moves the served canon, standing in for the write the verb makes. */
function greetingWindowRoutes(alternateIdx: number): Record<string, unknown> {
  return {
    ...PREVIEW_FIT_STUB,
    "chat.listMessages": (): unknown =>
      makeMessagesPage([
        makeMessageView({
          id: GREETING_ID,
          role: "assistant",
          characterId: GREETING_CHARACTER,
          content: ALTERNATES[alternateIdx] ?? ALT_0,
          seq: 1,
        }),
      ]),
    "chat.getChat": (): unknown => ({
      participants: [
        { id: "cp_greeter", kind: "character", characterId: GREETING_CHARACTER, displayName: "Aria", avatarHash: null, leftSeq: null, role: "member" },
      ],
      anchorPersonaId: null,
      cast: [],
      group: DEFAULT_GROUP_CONFIG,
    }),
    // The card is where the ALTERNATES live — the strip reads them to know how many there are and which one
    // is showing; the server re-reads the same card to resolve the index it is handed.
    "character.get": (): unknown => ({
      id: GREETING_CHARACTER,
      name: "Aria",
      avatarHash: null,
      greetings: ALTERNATES.map((text) => ({ text })),
    }),
    "chat.setSeededGreeting": (): unknown => ({ ok: true }),
  };
}

test("a seeded greeting in the pre-first-turn window offers its card's alternates", async ({ mount, page }) => {
  await routeTrpc(page, greetingWindowRoutes(0));

  const component = await mount(<ChatRoomGreetingWindowStory />);

  await expect(component.locator(BUBBLE).first()).toContainText(ALT_0);
  // The pager says which alternate of how many — the same `n / m` grammar the variant strip uses, so a
  // greeting behaves like every other steppable row.
  await expect(component.getByText("1 / 3")).toBeVisible();
  await expect(component.getByRole("button", { name: "Next greeting" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Previous greeting" })).toBeVisible();
});

test("stepping fires setSeededGreeting with the stepped INDEX, and never any text", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, greetingWindowRoutes(0));

  const component = await mount(<ChatRoomGreetingWindowStory />);
  await expect(component.getByText("1 / 3")).toBeVisible();

  await component.getByRole("button", { name: "Next greeting" }).click();

  await expect
    .poll(() => trpc.lastInput("chat.setSeededGreeting"), { intervals: [20, 50, 100] })
    .toEqual({ chatId: CHAT_ID, messageId: GREETING_ID, greetingIndex: 1 });
  // THE WIRE CARRIES NO TEXT — the whole point of the index shape. The server resolves the alternate from
  // the card, so this host-gated door can never become a second free-text content write. A client that
  // "helpfully" started sending the resolved string would pass every visual assertion and fail this one.
  const sent = trpc.lastInput("chat.setSeededGreeting") as Record<string, unknown>;
  expect(Object.keys(sent).toSorted()).toEqual(["chatId", "greetingIndex", "messageId"]);
});

test("the row re-renders the SERVER's bytes when the edit lands on the bus (never an optimistic local swap)", async ({ mount, page }) => {
  // The verb is `busDriven`: it emits `messageEdited`, the room's socket delivers it, and the invalidation
  // seam refetches canon. So the row's new text must arrive from `listMessages`, not from the click — which
  // is what this drives. Serving alternate 1 from the start of the refetch is the stand-in for the write.
  let served = 0;
  await routeTrpc(page, {
    ...greetingWindowRoutes(0),
    "chat.listMessages": (): unknown =>
      makeMessagesPage([
        makeMessageView({
          id: GREETING_ID,
          role: "assistant",
          characterId: GREETING_CHARACTER,
          content: ALTERNATES[served] ?? ALT_0,
          seq: 1,
        }),
      ]),
    "chat.setSeededGreeting": (input: unknown): unknown => {
      served = (input as { readonly greetingIndex: number }).greetingIndex;
      return { ok: true };
    },
  });

  const component = await mount(<ChatRoomGreetingWindowStory />);
  await expect(component.getByText("1 / 3")).toBeVisible();

  await component.getByRole("button", { name: "Next greeting" }).click();
  // The row does NOT move on the click alone — the mutation is `busDriven`, so until the edit lands there is
  // nothing to re-read. (This is the control for the assertion below: a client that swapped the text locally
  // would already be showing alternate 2 here.)
  await expect(component.locator(BUBBLE).first()).toContainText(ALT_0);

  // Now the room's own bus event, through the REAL reducer → the invalidation seam → a canon refetch.
  await component.getByTestId("drive-message-edited").click();

  await expect(component.locator(BUBBLE).first()).toContainText(ALT_1);
  // …and the counter follows the CONTENT, because the strip derives its position from the row's text.
  await expect(component.getByText("2 / 3")).toBeVisible();
});

test("a room PAST its first user turn offers no greeting step — the window is closed", async ({ mount, page }) => {
  // The discriminator, and the reason the window is a render-time fact and not just a server refusal: the
  // affordance must not be on screen at all once `freezeGreetingVolatiles` has baked the row, or every click
  // is a doomed round-trip that reads to the user as a broken control.
  await routeTrpc(page, {
    ...greetingWindowRoutes(0),
    "chat.listMessages": (): unknown =>
      makeMessagesPage([
        makeMessageView({
          id: GREETING_ID,
          role: "assistant",
          characterId: GREETING_CHARACTER,
          content: ALT_0,
          seq: 1,
        }),
        makeMessageView({ id: castId<MessageId>("msg_room_first_user"), role: "user", content: "Hello.", seq: 2 }),
      ]),
  });

  const component = await mount(<ChatRoomGreetingWindowStory />);

  await expect(component.locator(BUBBLE).first()).toContainText(ALT_0);
  await expect(component.getByRole("button", { name: "Next greeting" })).toHaveCount(0);
});

// ── THE APPEARANCE KNOBS, RE-HOMED ON A COMMITTED ROW ──────────────────────────────────────────────
//
// `autoFixMarkdown` and `colorQuotedSpeech` had pins, and both ran over the DRAFT greeting row — the surface
// R1 deleted. Their SUBJECT was never the draft: it is that a settings-read knob reaches the ONE renderer
// every message body goes through. Losing them with the phase they happened to be written over was a real
// coverage hole (reported at R1, closed here), so they are back over the row that always existed.
//
// The OFF arm of each is the discriminator. An always-on transform (one mounted unconditionally in the seal)
// passes both ON tests and fails both OFF ones — which is exactly the defect shape a knob test exists for.

/** The settings read with ONE appearance knob overridden — everything else stays at its shipped default. */
function routeWithAppearance(page: Page, appearance: Record<string, unknown>, content: string): Promise<unknown> {
  return routeTrpc(page, {
    ...PREVIEW_FIT_STUB,
    ...ROSTER_STUB,
    "settings.getUserSettings": (): unknown => ({
      userId: castId<UserId>("user_ct"),
      schemaVersion: 1,
      config: { ...DEFAULT_USER_SETTINGS, appearance: { ...DEFAULT_USER_SETTINGS.appearance, ...appearance } },
      updatedAt: 0,
    }),
    "chat.listMessages": (): unknown => makeMessagesPage([makeMessageView({ id: castId<MessageId>("msg_room_knob"), role: "assistant", content })]),
  });
}

// Hand-authored cards habitually leave a narration asterisk open, so this is the highest-unbalanced-markdown
// body there is. OFF (the shipped default) renders it as authored — a lone `*` is literal per CommonMark;
// ON closes the run at end-of-line (`@orb/kit/fix-markdown`).
const UNBALANCED_BODY = "*She looks up and smiles";

test("autoFixMarkdown ON closes an unbalanced asterisk on a committed row", async ({ mount, page }) => {
  await routeWithAppearance(page, { autoFixMarkdown: true }, UNBALANCED_BODY);

  const component = await mount(<ChatRoomSurfaceStory />);

  await expect(component.locator(BUBBLE).first().locator("em")).toHaveText("She looks up and smiles");
});

test("autoFixMarkdown OFF leaves the same body as authored (the literal asterisk, no emphasis)", async ({ mount, page }) => {
  await routeWithAppearance(page, { autoFixMarkdown: false }, UNBALANCED_BODY);

  const component = await mount(<ChatRoomSurfaceStory />);

  const bubble = component.locator(BUBBLE).first();
  await expect(bubble.locator("em")).toHaveCount(0);
  await expect(bubble).toContainText(UNBALANCED_BODY);
});

// The ST-card shape (quoted dialogue + plain narration, zero asterisks) — `colorQuotedSpeech` has to reach
// both body arms from the same settings read.
const QUOTED_BODY = "He doesn’t look up from the ledger. “You’re late,” he says.";

test("colorQuotedSpeech ON (the default) tints the quoted run", async ({ mount, page }) => {
  await routeWithAppearance(page, { colorQuotedSpeech: true }, QUOTED_BODY);

  const component = await mount(<ChatRoomSurfaceStory />);

  const tinted = component.locator(BUBBLE).first().locator(DIALOGUE_SPAN);
  await expect(tinted).toHaveCount(1);
  await expect(tinted).toHaveText("“You’re late,”");
});

test("colorQuotedSpeech OFF renders the same body plain — the knob really reaches the row", async ({ mount, page }) => {
  await routeWithAppearance(page, { colorQuotedSpeech: false }, QUOTED_BODY);

  const component = await mount(<ChatRoomSurfaceStory />);

  const bubble = component.locator(BUBBLE).first();
  await expect(bubble).toContainText("You’re late,");
  await expect(bubble.locator(DIALOGUE_SPAN)).toHaveCount(0);
});
