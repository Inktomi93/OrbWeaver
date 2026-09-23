// CT: the composed chat-room pane (transcript + composer) — the surface that was untested before this
// task. Two shapes: a SEEDED DRAFT (the new-chat-with-character landing, J2/J3) renders each founding
// character's greeting as an editable message row (character-first, never an empty void) WITHOUT reading
// CANON (`chat.listMessages` — the ChatHandle discriminant is the gate; it DOES read the founding cards
// `character.get` for the greeting preview); a COMMITTED chat reads canon + roster (routeTrpc stubs
// `chat.listMessages`/`chat.getChat`) and renders the rows beside the composer.
//
// NOTE: `chat.listMessages` is stubbed at the NETWORK (routeTrpc) — the draft case asserts it is NEVER
// hit (the surface must not fetch CANON for a chat with no server row yet). `chat.listMessages` returns
// `MessagesPage { messages, identities }` (Chat-Macro-Resolution.md §1/§3 / D137) — every stub wraps via
// `makeMessagesPage`; the committed test also stubs `chat.getChat`'s roster + `identities` floor
// (message-list-surface.ct.tsx's `ROSTER_STUB` precedent).

import type { ChatIdentity, GroupConfig } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { CharacterId, MessageId, PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { testId } from "../../../../../packages/client/src/lib/test-ids.ts";
import { routeOrbSocket } from "../../../../support/node/route-orb-socket.ts";
import type { TrpcFixtureOutput, TrpcInput, TrpcRoutes, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { ChatRoomGreetingWindowStory, ChatRoomSurfaceStory, ChatSurfaceContributorStory } from "../_ct-stories.tsx";
import { CHAT_AMBIENT_ROUTES, CHAT_ID, makeMessagesPage, makeMessageView } from "../fixtures.ts";

// The divider's present-tense preview. Every map stubs it with a VALID resolved shape — the
// harness's unlisted-proc default (`data: null`) is out-of-contract for this query and crashes the
// surface (integration find, 2026-07-24). boundaryMessageId null = "everything fits" (no divider).
const PREVIEW_FIT_STUB: TrpcRoutes<"chat.previewContextFit"> = {
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

const ROSTER_STUB: TrpcRoutes<"chat.getChat"> = {
  ...PREVIEW_FIT_STUB,
  "chat.getChat": (): {
    participants: never[];
    anchorPersonaId: null;
    identities: readonly ChatIdentity[];
    group: GroupConfig;
  } => ({
    participants: [],
    anchorPersonaId: null,
    identities: [],
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
    ...CHAT_AMBIENT_ROUTES,
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
    ...CHAT_AMBIENT_ROUTES,
    ...PREVIEW_FIT_STUB,
    "chat.listMessages": () => makeMessagesPage([makeMessageView({ id: castId<MessageId>("msg_room_greeting"), role: "assistant", content: FORMATTED_BODY })]),
    // The committed arm's `{{user}}` subject: the chat's ANCHOR persona + the identity entry that carries it
    // (the exact pair the draft arm predicts client-side).
    "chat.getChat": (): {
      participants: never[];
      anchorPersonaId: string;
      identities: readonly ChatIdentity[];
      group: GroupConfig;
    } => ({
      participants: [],
      anchorPersonaId: NOVA,
      identities: [{ kind: "persona", id: castId<PersonaId>(NOVA), name: "Nova", description: "a wandering cartographer", avatarHash: null }],
      group: DEFAULT_GROUP_CONFIG,
    }),
  });

  const component = await mount(<ChatRoomSurfaceStory />);

  const bubble = component.locator(BUBBLE).first();
  await expect(bubble).toBeVisible();
  await expectFormattedBody(bubble);
});

test("a committed chat reads canon and renders the rows beside the composer", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...PREVIEW_FIT_STUB, "chat.listMessages": () => makeMessagesPage(CANON), ...ROSTER_STUB });

  const component = await mount(<ChatRoomSurfaceStory />);

  await expect(component.getByText("Hi Aria")).toBeVisible();
  await expect(component.getByText("Well met, traveller.")).toBeVisible();
  await expect(component.getByTestId(testId("composer"))).toBeVisible();

  // Finding #2: the programmatically-focused room container carries an explicit role + aria-label so its
  // name never falls to name-from-content (which concatenated the whole toolbar: "Characters · Jump to latest ·
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
    ...CHAT_AMBIENT_ROUTES,
    ...PREVIEW_FIT_STUB,
    // The committed room reads its transcript ONCE (the list + the composer's tail-gate share the key).
    "chat.listMessages": () => makeMessagesPage([makeMessageView({ id: castId<MessageId>("msg_room_user"), role: "user", content: "Ping?" })]),
    // `send` resolves immediately (the turn's effect is bus-driven; the value is never read back).
    "chat.send": () => ({ messages: [], aborted: false }),
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
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage(CANON) });
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
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage(CANON) });

  const component = await mount(<ChatSurfaceContributorStory anchor="thread-flank" visible={true} />);

  await expect(component.getByTestId("ct-fake-surface-contribution")).toBeVisible();
  await expect(component.getByText("fake thread-flank")).toBeVisible();
  const flankRow = page.locator('[data-slot="chat-room-flank-row"]');
  await expect(flankRow).toHaveCSS("flex-direction", "row");
});

test("a fake thread-flank contribution with `when:false` paints NO flank column (today's layout, unchanged)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage(CANON) });

  const component = await mount(<ChatSurfaceContributorStory anchor="thread-flank" visible={false} />);

  await expect(component.getByTestId("ct-fake-surface-contribution")).toHaveCount(0);
  // The STACK is now always in the tree (#680: the room's height chain must not fork on whether a
  // contributor happens to be registered) and carries `empty:hidden`, so the contract this row has always
  // asserted — no flank column in the layout — is now spelled as "out of layout" rather than "absent".
  await expect(page.locator('[data-slot="chat-thread-flank"]')).toBeHidden();
});

// ── #680: THE FLANK WRAPPER MUST BE LAYOUT-NEUTRAL ON BOTH AXES, AT BOTH ARMS ─────────────────────────
// ONE root cause, TWO defects, and the second is the silent one — both from `Row` baking `items-center`
// (@orb/ui layout variants) under a `@max-lg:flex-col` that flips DIRECTION but not ALIGNMENT:
//   · DESKTOP (row): the transcript is a content-height row child, so `MessageList`'s bounded-height
//     tripwire (`@orb/ui/lib/virtual-gap.ts` — THROWN, not warned) fires at mount and the room renders
//     "Couldn't load this conversation." with zero messages. Loud.
//   · MOBILE (column): `items-center` becomes a horizontal shrink-to-content, so the transcript computes
//     to WIDTH 0 — rows render zero-wide and thousands of px tall, off-screen. The reader sees an empty
//     room with NO console error and NO retry. Silent, and therefore worse.
// This is the axis-disagreement family: a direction override on a primitive that bakes cross-axis
// alignment. The fix replaces the baked alignment (`align="stretch"`) rather than overriding it at one
// breakpoint, so ONE declaration answers both arms.
//
// THE PIN THAT SHIPPED THE DEFECT MEASURED ONE AXIS AT ONE WIDTH. Width-equality was blind to the severed
// height chain; a desktop-only run was blind to the 0-width column. So this loop asserts BOTH axes at
// BOTH arms, with a thread long enough that an unbounded container exceeds the guard's 3×-viewport bound
// (`LONG_CANON` is the instrument: at 2 rows the broken layout measures short enough to pass, which is
// exactly how this went green).
const LONG_CANON = Array.from({ length: 80 }, (_, i) =>
  makeMessageView({
    id: castId<MessageId>(`msg_room_long_${String(i)}`),
    role: i % 2 === 0 ? "user" : "assistant",
    content: `Beat ${String(i)} — the harbour lamps gutter, and somewhere below deck a rope goes tight.`,
    seq: i + 1,
  }),
);
/** The tripwire's own bound (`UNBOUNDED_HEIGHT_VIEWPORT_MULTIPLIER`) — the number this pin measures against. */
const UNBOUNDED_VIEWPORT_MULTIPLE = 3;
const DESKTOP = { width: 1280, height: 800 } as const;
/** The two arms of the flank's own container query — beside (row) and stacked (column). The column arm is
 *  the one that rendered a 0-width transcript, so it is not optional coverage. */
const FLANK_ARMS = [
  { label: "desktop (beside)", viewport: DESKTOP },
  { label: "mobile (stacked)", viewport: { width: 430, height: 932 } },
] as const;

for (const { label, viewport } of FLANK_ARMS) {
  test(`#680 ${label}: a SILENT flank contributor leaves the transcript a REAL box — width > 0, height bounded`, async ({ mount, page }) => {
    await page.setViewportSize(viewport);
    await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage(LONG_CANON) });

    const component = await mount(<ChatSurfaceContributorStory anchor="thread-flank" visible={true} silent={true} />);

    // THE ROOM LOADED. Measured red against the pre-fix source: on the row arm the scroll window did not
    // exist at all (the tripwire throws inside `MessageList`'s layout effect, so the subtree never mounts
    // — live, the read boundary swaps in "Couldn't load this conversation."), and on the column arm it
    // existed at ZERO WIDTH with its rows parked off-screen.
    const scroller = page.locator('[data-slot="message-list-scroll"]');
    await expect(scroller).toBeVisible();
    await expect(component.getByText("Couldn't load this conversation.")).toHaveCount(0);
    const readBoxAtAssertion = async (): Promise<typeof box> => await scroller.boundingBox();
    const box = await scroller.boundingBox();
    // WIDTH — the silent defect. A zero-width transcript is an empty room with no error to report it.
    await expect.poll(async () => (await readBoxAtAssertion())?.width).toBeGreaterThan(0);
    // HEIGHT — the loud one, pinned as the guard's OWN predicate (it throws above 3× the viewport)
    // rather than as a magic number.
    await expect.poll(async () => (await readBoxAtAssertion())?.height).toBeGreaterThan(0);
    await expect.poll(async () => (await readBoxAtAssertion())?.height).toBeLessThan(viewport.height * UNBOUNDED_VIEWPORT_MULTIPLE);
    // …and the rows are ON SCREEN, which is the reader's own version of both assertions above.
    await expect(component.getByText("Beat 79 —", { exact: false })).toBeInViewport();
  });
}

test("#680 desktop: the flank wrapper is HEIGHT-neutral — a silent flank and no flank bound the transcript identically", async ({ mount, page }) => {
  await page.setViewportSize(DESKTOP);
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage(LONG_CANON) });

  const silent = await mount(<ChatSurfaceContributorStory anchor="thread-flank" visible={true} silent={true} />);
  await expect(page.locator('[data-slot="message-list-scroll"]')).toBeVisible();
  const readWithWrapperAtAssertion = async (): Promise<typeof withWrapper> => await page.locator('[data-slot="message-list-scroll"]').boundingBox();
  const withWrapper = await page.locator('[data-slot="message-list-scroll"]').boundingBox();

  await silent.unmount();
  const absent = await mount(<ChatSurfaceContributorStory anchor="thread-flank" visible={false} />);
  await expect(absent.getByText("Couldn't load this conversation.")).toHaveCount(0);
  const bare = await page.locator('[data-slot="message-list-scroll"]').boundingBox();

  // Both axes, because the lane that shipped #680 pinned only one of them.
  await expect.poll(async () => (await readWithWrapperAtAssertion())?.height).toBeGreaterThan(0);
  await expect.poll(async () => (await readWithWrapperAtAssertion())?.height).toBe(bare?.height);
  await expect.poll(async () => (await readWithWrapperAtAssertion())?.width).toBe(bare?.width);
});

// ── #685: THE FLANK COLUMN IS TOP-ANCHORED, AT BOTH ARMS ──────────────────────────────────────────────
// The finding: the needle meter "floats mid-air" — a 138x80 card hovering half-way down the painting
// instead of reading as room chrome. The mechanism is the flank column's cross-axis alignment, which is the
// SAME axis-disagreement family #680 fixed one property over: a flank widget is content-height, so where it
// sits in a full-height column is decided by the column's own alignment, and `Row`'s baked `items-center`
// centred the whole column before `align="stretch"` landed.
//
// SO THIS LOOP MEASURES BOTH ARMS ON THE AXIS EACH ARM ACTUALLY HAS. `@max-lg:flex-col` flips DIRECTION, so
// the flank's cross axis is the BLOCK axis beside (a centred column floats down the painting) and the INLINE
// axis stacked (a centred column floats away from the reading edge). Measured against the pre-#680 source
// (`git show cddc2b5ae^:…`), both arms are RED — which is the receipt that the centring the finding reported
// was the SAME baked `items-center` #680 removed, i.e. this loop is a FENCE on today's tree, not a fix.
// A one-arm pin is how the centring shipped in the first place (#680's own lesson).
const FLANK_START_ARMS = [
  { label: "desktop (beside)", viewport: DESKTOP, axis: "block" },
  { label: "mobile (stacked)", viewport: { width: 430, height: 932 }, axis: "inline" },
] as const;

for (const { label, viewport, axis } of FLANK_START_ARMS) {
  test(`#685 ${label}: the flank column starts at the flank ROW's ${axis} edge — never centred on its cross axis`, async ({ mount, page }) => {
    await page.setViewportSize(viewport);
    await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage(LONG_CANON) });

    const component = await mount(<ChatSurfaceContributorStory anchor="thread-flank" visible={true} />);

    const widget = component.getByTestId("ct-fake-surface-contribution");
    await expect(widget).toBeVisible();
    const flank = page.locator('[data-slot="chat-thread-flank"]');
    const row = page.locator('[data-slot="chat-room-flank-row"]');
    await expect(flank).toBeVisible();
    const flankBox = await flank.boundingBox();
    const rowBox = await row.boundingBox();
    const widgetBox = await widget.boundingBox();
    expect(flankBox, "the flank column must have a box to compare").not.toBeNull();
    expect(rowBox, "the flank row must have a box to compare").not.toBeNull();
    expect(widgetBox, "the flank widget must have a box to compare").not.toBeNull();
    // The CROSS-AXIS start: beside, the column's top is the row's top; stacked, its left is the row's left.
    // A centred column sits at half the free space on exactly that axis.
    const flankStart = axis === "block" ? (flankBox?.y ?? 0) : (flankBox?.x ?? 0);
    const rowStart = axis === "block" ? (rowBox?.y ?? 0) : (rowBox?.x ?? 0);
    expect(flankStart, `the flank's ${axis}-start against the row's`).toBeCloseTo(rowStart, 0);
    // …and the widget is at the START of the column it sits in (no free space above it inside the flank).
    expect(widgetBox?.y ?? 0).toBeCloseTo(flankBox?.y ?? 0, 0);
  });
}

// The finding's own words, as a receipt: "flank top edge aligned to the thread's top". Kept SEPARATE from
// the loop because it is inconclusive against the pre-#680 source for an unrelated reason — there the
// transcript did not mount at all (the bounded-height tripwire threw), so it is a fence on today's tree.
test("#685 desktop: the flank column's top edge is the TRANSCRIPT's top edge (room chrome, not a floater)", async ({ mount, page }) => {
  await page.setViewportSize(DESKTOP);
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage(LONG_CANON) });

  const component = await mount(<ChatSurfaceContributorStory anchor="thread-flank" visible={true} />);

  await expect(component.getByTestId("ct-fake-surface-contribution")).toBeVisible();
  const flank = page.locator('[data-slot="chat-thread-flank"]');
  const scroller = page.locator('[data-slot="message-list-scroll"]');
  await expect(scroller).toBeVisible();
  const flankBox = await flank.boundingBox();
  const threadBox = await scroller.boundingBox();
  expect(flankBox, "the flank column must have a box").not.toBeNull();
  expect(threadBox, "the transcript must have a box").not.toBeNull();
  // BESIDE means beside: the two columns start on the same line. (Only asserted on this arm — stacked, the
  // flank is BELOW the thread by construction, which the container-query row above already pins.)
  expect(flankBox?.y ?? 0).toBeCloseTo(threadBox?.y ?? 0, 0);
});

// ── #776: THE FLANK COLUMN IS BOUNDED, AND THE SEAM OWNS THAT ────────────────────────────────────────
// The seam's own law is that FLANK LAYOUT IS SEAM-OWNED so no consumer can crush the reading column
// (client-architecture-lockdown §6c/M8) — but the column carried no width bound, because every tenant it
// ever had was content-small by construction (a meter card). #679 U2 opened the anchor to PLUGIN surfaces,
// whose text is written by a third party: a one-line plugin caption took ~400px of a 1280px room on a
// rendered receipt, and nothing in the seam said no. The clamp therefore lives HERE, for every tenant —
// a contributor bounding only itself would leave the house's own future widgets unprotected AND put
// layout in a contribution, which is the thing §6c forbids.
//
// The pin is written against the SEAM's own declaration rather than a magic number: whatever `max-width`
// the flank column resolves to is what its box may not exceed, and the reading column keeps the majority
// of the row. RED-FIRST RECEIPT (2026-08-28, run against the pre-clamp source): this test did not merely
// miss the share floor — the transcript's scroll window resolved HIDDEN, i.e. the greedy single-line body
// took the whole row and shrank the thread to a zero box. That is the #680 SILENT arm (an empty room with
// no error and no retry), reachable by any wordy contributor.
const READING_COLUMN_MIN_SHARE = 0.7;

test("#776 desktop: a GREEDY flank contributor is bounded — the reading column keeps the room", async ({ mount, page }) => {
  await page.setViewportSize(DESKTOP);
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage(LONG_CANON) });

  const component = await mount(<ChatSurfaceContributorStory anchor="thread-flank" visible={true} greedy={true} />);

  await expect(component.getByTestId("ct-fake-surface-contribution")).toBeVisible();
  const flank = page.locator('[data-slot="chat-thread-flank"]');
  const scroller = page.locator('[data-slot="message-list-scroll"]');
  await expect(scroller).toBeVisible();
  const flankBox = await flank.boundingBox();
  const rowBox = await page.locator('[data-slot="chat-room-flank-row"]').boundingBox();
  const threadBox = await scroller.boundingBox();
  expect(flankBox, "the flank column must have a box").not.toBeNull();
  expect(rowBox, "the flank row must have a box").not.toBeNull();
  expect(threadBox, "the transcript must have a box").not.toBeNull();
  // 1. THE CLAMP IS IN FORCE — the column's own declared ceiling, read off the element, so this pin
  //    follows the token instead of hard-coding its value.
  const maxWidthPx = await flank.evaluate((el) => Number.parseFloat(getComputedStyle(el).maxWidth));
  expect(maxWidthPx, "the flank column must declare a max-width at the beside arm").toBeGreaterThan(0);
  expect(flankBox?.width ?? 0).toBeLessThanOrEqual(maxWidthPx + 1);
  // 2. …and the property that matters to a reader: the transcript still owns the room.
  expect((threadBox?.width ?? 0) / (rowBox?.width ?? 1)).toBeGreaterThan(READING_COLUMN_MIN_SHARE);
});

test("#776 mobile: below the stack threshold the clamp is RELEASED — the flank takes the full width", async ({ mount, page }) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage(LONG_CANON) });

  const component = await mount(<ChatSurfaceContributorStory anchor="thread-flank" visible={true} greedy={true} />);

  await expect(component.getByTestId("ct-fake-surface-contribution")).toBeVisible();
  const flankBox = await page.locator('[data-slot="chat-thread-flank"]').boundingBox();
  const rowBox = await page.locator('[data-slot="chat-room-flank-row"]').boundingBox();
  // STACKED, the flank is a full-width block UNDER the transcript — a clamped 220px column floating in a
  // 430px phone would be the clamp leaking into the arm it was never for.
  expect(flankBox?.width ?? 0).toBeCloseTo(rowBox?.width ?? 0, 0);
});

// THE SILENT-CONTRIBUTOR COLLAPSE (#16's needle meter is the case that needed it). A contributor whose
// applicability is DATA cannot answer the seam's SYNC `when`, so it mounts in every room and paints
// nothing where it does not apply. Without the flank stack's `empty:hidden`, every room without a tension
// score paid a flex child and its `gap="block"` step beside the transcript. This pins that "mounted but
// silent" and "not mounted" render IDENTICALLY — on the WIDTH axis, which is all it ever claimed; the
// #680 loop above is what covers the axes and arms this one is blind to.
test("a MOUNTED BUT SILENT thread-flank contribution costs the room nothing — the thread keeps its full width", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1024, height: 600 });
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage(CANON) });

  const silent = await mount(<ChatSurfaceContributorStory anchor="thread-flank" visible={true} silent={true} />);
  await expect(silent.getByText("Well met, traveller.")).toBeVisible();
  // The stack IS mounted (the contribution passed `when`) and is OUT of layout.
  const flank = page.locator('[data-slot="chat-thread-flank"]');
  await expect(flank).toHaveCount(1);
  await expect(flank).toBeHidden();
  // The TRANSCRIPT's own scroll box is the thing a reader sees narrow when a flank takes its share.
  const readSilentThreadAtAssertion = async (): Promise<typeof silentThread> => await page.locator('[data-slot="message-list-scroll"]').boundingBox();
  const silentThread = await page.locator('[data-slot="message-list-scroll"]').boundingBox();

  // …and the same room with the contribution NOT MOUNTED AT ALL gives the transcript the identical width.
  await silent.unmount();
  const absent = await mount(<ChatSurfaceContributorStory anchor="thread-flank" visible={false} />);
  await expect(absent.getByText("Well met, traveller.")).toBeVisible();
  await expect(page.locator('[data-slot="chat-thread-flank"]')).toBeHidden();
  const absentThread = await page.locator('[data-slot="message-list-scroll"]').boundingBox();

  // Both boxes must EXIST before their equality means anything — two `undefined`s compare equal, which is
  // how a width pin goes vacuous when a selector drifts.
  await expect.poll(async () => (await readSilentThreadAtAssertion())?.width).toBeGreaterThan(0);
  await expect.poll(async () => (await readSilentThreadAtAssertion())?.width).toBe(absentThread?.width);
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
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage(CANON) });

  const component = await mount(<ChatSurfaceContributorStory anchor="thread-flank" visible={true} />);

  // The flank is NOT hidden — it renders stacked, not dropped.
  await expect(component.getByTestId("ct-fake-surface-contribution")).toBeVisible();
  const flankRow = page.locator('[data-slot="chat-room-flank-row"]');
  await expect(flankRow).toHaveCSS("flex-direction", "column");
});

test("a fake above-composer contribution appears between the selection bar slot and the composer", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage(CANON) });

  const component = await mount(<ChatSurfaceContributorStory anchor="above-composer" visible={true} />);

  await expect(component.getByTestId("ct-fake-surface-contribution")).toBeVisible();
});

test("a fake above-composer contribution's `when:false` hides it", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage(CANON) });

  const component = await mount(<ChatSurfaceContributorStory anchor="above-composer" visible={false} />);

  await expect(component.getByTestId("ct-fake-surface-contribution")).toHaveCount(0);
});

test("a fake message-footer contribution renders under a COMMITTED message row", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage(CANON) });

  const component = await mount(<ChatSurfaceContributorStory anchor="message-footer" visible={true} />);

  // One footer per COMMITTED row (CANON has 2 messages) — proves the anchor mounts PER-ROW, not once.
  const footers = component.getByTestId("ct-fake-surface-contribution");
  await expect(footers).toHaveCount(CANON.length);
  await expect(footers.first()).toBeVisible();
});

test("a fake message-footer contribution's `when:false` hides it on the row", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage(CANON) });

  const component = await mount(<ChatSurfaceContributorStory anchor="message-footer" visible={false} />);

  await expect(component.getByTestId("ct-fake-surface-contribution")).toHaveCount(0);
});

// ── DENSITY S6: the room DECLARES the instrument tier, and the transcript's islands resolve it ──────
// The MECHANISM probe lives in tests/ui/density-tier.suite.ct.tsx; it says nothing about whether the real
// chat room still declares a tier — a deleted <Surface>, a re-homed pane or a portaled row all leave the
// mechanism green and the room un-tiered (the S5 lesson, tests/support/browser/tier-liveness.ts). So these read
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
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage(CHOICES_CANON) });
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
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage(CHOICES_CANON) });
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
// phase-independent `CarriedAppearance` — the founding CARDS before commit, the roster after — so
// both arms below must land the SAME token from the SAME card.
//
// Asserted through the RENDERED custom property (the room's `<ThemeScope>` is what paints), never the
// resolver's return: `--color-primary` is what `accent` clamps to, and it is inherited by everything in
// the room. The GROUP arm is the discriminator — a fix that takes over from "any character card in the room" passes
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
    ...CHAT_AMBIENT_ROUTES,
    ...PREVIEW_FIT_STUB,
    "chat.listMessages": () => makeMessagesPage(CANON),
    "chat.getChat": (): TrpcFixtureOutput<"chat.getChat"> => ({
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
      identities: [],
      group: DEFAULT_GROUP_CONFIG,
    }),
  });

  const component = await mount(<ChatRoomSurfaceStory />);

  const bubble = component.locator(BUBBLE).first();
  await expect(bubble).toBeVisible();
  expect(await renderedAccent(bubble)).toBe(CARD_ACCENT);
});

// ── THE CHARACTER STRIP SERVES BOTH PHASES (side-eye P2, 2026-08-06) ──────────────────────────────
// The strip existed only for a COMMITTED chat, so a group DRAFT — a room that already knows its whole
// founding characters — showed none of them above the transcript. Same strip, same >1 floor; the phase only
// decides where the seats come from. The SOLO arm is the discriminator: a fix that mounts the strip
// unconditionally passes the group case and wrongly paints a one-character room.

/** The add-member door's accessible name, in both phases ("Add a character"). */

// ── THE GREETING WINDOW (D166) ────────────────
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
function greetingWindowRoutes(alternateIdx: number): TrpcRoutes<"chat.listMessages" | "chat.getChat" | "character.get" | "chat.setSeededGreeting"> {
  return {
    ...CHAT_AMBIENT_ROUTES,
    ...PREVIEW_FIT_STUB,
    "chat.listMessages": () =>
      makeMessagesPage([
        makeMessageView({
          id: GREETING_ID,
          role: "assistant",
          characterId: GREETING_CHARACTER,
          content: ALTERNATES[alternateIdx] ?? ALT_0,
          seq: 1,
        }),
      ]),
    "chat.getChat": () => ({
      participants: [
        { id: "cp_greeter", kind: "character", characterId: GREETING_CHARACTER, displayName: "Aria", avatarHash: null, leftSeq: null, role: "member" },
      ],
      anchorPersonaId: null,
      identities: [],
      group: DEFAULT_GROUP_CONFIG,
    }),
    // The card is where the ALTERNATES live — the strip reads them to know how many there are and which one
    // is showing; the server re-reads the same card to resolve the index it is handed.
    "character.get": () => ({
      id: GREETING_CHARACTER,
      name: "Aria",
      avatarHash: null,
      greetings: ALTERNATES.map((text) => ({ text })),
    }),
    "chat.setSeededGreeting": () =>
      makeMessageView({ id: GREETING_ID, role: "assistant", characterId: GREETING_CHARACTER, content: ALTERNATES[alternateIdx] ?? ALT_0, seq: 1 }),
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
  const readSentAtAssertion = async (): Promise<typeof sent> => trpc.lastInput("chat.setSeededGreeting") as Record<string, unknown>;
  const sent = trpc.lastInput("chat.setSeededGreeting") as Record<string, unknown>;
  await expect.poll(async () => Object.keys(await readSentAtAssertion()).toSorted()).toEqual(["chatId", "greetingIndex", "messageId"]);
});

test("the row re-renders the SERVER's bytes when the edit lands on the bus (never an optimistic local swap)", async ({ mount, page }) => {
  // The verb is `busDriven`: it emits `messageEdited`, the room's socket delivers it, and the invalidation
  // seam refetches canon. So the row's new text must arrive from `listMessages`, not from the click — which
  // is what this drives. Serving alternate 1 from the start of the refetch is the stand-in for the write.
  let served = 0;
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...greetingWindowRoutes(0),
    "chat.listMessages": () =>
      makeMessagesPage([
        makeMessageView({
          id: GREETING_ID,
          role: "assistant",
          characterId: GREETING_CHARACTER,
          content: ALTERNATES[served] ?? ALT_0,
          seq: 1,
        }),
      ]),
    "chat.setSeededGreeting": (input: TrpcInput<"chat.setSeededGreeting">) => {
      served = input.greetingIndex;
      return makeMessageView({ id: GREETING_ID, role: "assistant", characterId: GREETING_CHARACTER, content: ALTERNATES[served] ?? ALT_0, seq: 1 });
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
    ...CHAT_AMBIENT_ROUTES,
    ...greetingWindowRoutes(0),
    "chat.listMessages": () =>
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
function routeWithAppearance(
  page: Page,
  appearance: Partial<TrpcWireOutput<"settings.getUserSettings">["config"]["appearance"]>,
  content: string,
): Promise<unknown> {
  return routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...PREVIEW_FIT_STUB,
    ...ROSTER_STUB,
    "settings.getUserSettings": () => ({
      userId: castId<UserId>("user_ct"),
      schemaVersion: 1,
      config: { ...DEFAULT_USER_SETTINGS, appearance: { ...DEFAULT_USER_SETTINGS.appearance, ...appearance } },
      configUnreadable: null,
      updatedAt: 0,
    }),
    "chat.listMessages": () => makeMessagesPage([makeMessageView({ id: castId<MessageId>("msg_room_knob"), role: "assistant", content })]),
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
