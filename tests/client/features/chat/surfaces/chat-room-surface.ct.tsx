// CT: the composed chat-room pane (transcript + composer) — the surface that was untested before this
// task. Two shapes: a SEEDED DRAFT (the new-chat-with-character landing, J2/J3) renders each founding
// character's greeting as an editable message row (character-first, never an empty void) WITHOUT reading
// CANON (`chat.listMessages` — the ChatHandle discriminant is the gate; it DOES read the founding cards
// `character.get` for the greeting preview); a COMMITTED chat reads canon + roster (routeTrpc stubs
// `chat.listMessages`/`chat.getChat`) and renders the rows beside the composer.
//
// NOTE: `chat.listMessages` is stubbed at the NETWORK (routeTrpc) — the draft case asserts it is NEVER
// hit (the surface must not fetch CANON for a chat with no server row yet). `chat.listMessages` returns
// `MessagesPage { messages, macroNames }` (Chat-Macro-Resolution.md §1/§3) — every stub wraps via
// `makeMessagesPage`; the committed test also stubs `chat.getChat`'s roster + `macroNames` floor
// (message-list-surface.ct.tsx's `ROSTER_STUB` precedent).

import type { CharacterId, MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { testId } from "../../../../../packages/client/src/lib/test-ids";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { routeChatStream } from "../../../../support/ct/route-trpc-subscription";
import { ChatRoomSurfaceStory, ChatSurfaceContributorStory } from "../_ct-stories";
import { CHAT_ID, makeMacroNameProducer, makeMessagesPage, makeMessageView } from "../fixtures";

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
    macroNames: ReturnType<typeof makeMacroNameProducer>;
    personaAvatars: never[];
    characterAvatars: never[];
  } => ({
    participants: [],
    anchorPersonaId: null,
    macroNames: makeMacroNameProducer(),
    personaAvatars: [],
    characterAvatars: [],
  }),
};

test("a seeded draft renders the founding greeting as an editable row + the live composer, no CANON read", async ({ mount, page }) => {
  let listMessagesCalls = 0;
  await routeTrpc(page, {
    ...PREVIEW_FIT_STUB,
    "chat.listMessages": () => {
      listMessagesCalls += 1;
      return makeMessagesPage([]);
    },
    // A draft reads the FOUNDING card (character.get) to preview each greeting — but never CANON.
    "character.get": () => ({
      id: castId<CharacterId>("char_ct_room"),
      name: "Aria",
      greetings: ["Greetings, traveller."],
    }),
  });

  const component = await mount(<ChatRoomSurfaceStory committed={false} />);

  // The greeting renders as a normal message row (character-first, not an empty void), beside the composer.
  await expect(component.getByText("Greetings, traveller.")).toBeVisible();
  await expect(component.getByTestId(testId("composer"))).toBeVisible();
  await expect(component.getByRole("textbox", { name: "Message" })).toBeVisible();
  // The discriminant gate held — a draft NEVER read CANON (listMessages).
  expect(listMessagesCalls).toBe(0);
});

test("a committed chat reads canon and renders the rows beside the composer", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...PREVIEW_FIT_STUB,
    "chat.listMessages": () => makeMessagesPage(CANON),
    ...ROSTER_STUB,
  });

  const component = await mount(<ChatRoomSurfaceStory committed={true} />);

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
  await routeChatStream(page, { events: [] });
  // Delay the `send` POST so its in-flight (isPending) window is observably long — the disabled→enabled
  // bracket below is what proves onSettled RAN (isPending flips false only after the mutation settles,
  // which is strictly after onSettled's invalidate would have fired). Registered LAST ⇒ runs FIRST (LIFO),
  // falls through to routeChatStream → routeTrpc for everything it doesn't delay.
  await page.route("**/api/trpc/**", async (route) => {
    const req = route.request();
    if (req.method() === "POST" && req.url().includes("chat.send")) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    await route.fallback();
  });

  const component = await mount(<ChatRoomSurfaceStory committed={true} />);

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

// ── the FIRST send (draft→commit) clears the composer for the new chat ─────────────────────────────
// The bug: on a draft's first send, ChatRoomSurface.onCommitted migrates the in-flight text from the
// draftKey scope onto the new committed-chatId scope (visual continuity across the promotion). The
// clear-on-commit signal then fired onChange("") through the send hook's closure — captured at SEND time,
// still bound to the OLD draftKey scope — so it emptied the stale draftKey while the migrated text stayed
// on the new chatId key and RE-POPULATED the fresh chat's composer. Net: the first send left the sent text
// lingering; only the SECOND (already-committed) send cleared. The fix reads the LATEST onChange via a ref
// so the clear targets the current (committed) scope. This pins the whole draft→commit-via-send path
// end-to-end (real ChatRoomSurface + Composer + useSendMessage), driving the commit through a scripted
// user-role messageCommitted on the new chat's stream — the production clear-on-commit trigger.
test("the FIRST send on a draft clears the composer for the newly-committed chat (draft→commit doesn't carry the sent text forward)", async ({
  mount,
  page,
}) => {
  // startChat mints the committed id (CHAT_ID, the harness's committed constant); listMessages/getChat feed
  // the settled room. `chat.send` is HELD in flight (registered AFTER routeTrpc ⇒ runs FIRST, LIFO) — the
  // send promise stays open for the whole turn in production, so the clear-on-commit listener (torn down
  // when the send settles) stays alive to receive the commit signal driven below.
  const trpc = await routeTrpc(page, {
    ...ROSTER_STUB,
    "chat.startChat": () => ({ chat: { id: CHAT_ID } }),
    "chat.listMessages": () => makeMessagesPage([]),
    // The founding-card greeting preview the draft reads before commit.
    "character.get": () => ({ id: castId<CharacterId>("char_ct_room"), name: "Aria", greetings: ["Greetings, traveller."] }),
  });
  await page.route("**/api/trpc/**", async (route) => {
    const req = route.request();
    if (req.method() === "POST" && new URL(req.url()).pathname.includes("chat.send")) {
      await new Promise<void>(() => undefined);
      return;
    }
    await route.fallback();
  });

  const component = await mount(<ChatRoomSurfaceStory committed={false} />);
  const textarea = component.getByRole("textbox", { name: "Message" });

  await textarea.fill("First message");
  await component.getByRole("button", { name: "Send message" }).click();

  // The draft promoted to CHAT_ID (startChat fired) and the composer is disabled while the send holds in
  // flight — but the text is still there (clear rides the commit signal, never optimistic submit).
  await expect.poll(() => trpc.count("chat.startChat"), { intervals: [20, 50, 100] }).toBe(1);
  await expect(textarea).toBeDisabled();
  await expect(textarea).toHaveValue("First message");

  // Drive the caller's own user-row messageCommitted on the NEW chat (the production clear-on-commit
  // trigger, stood in for the SSE bus — ComposerStory's `drive-message-committed` precedent).
  await component.getByTestId("drive-message-committed").click();

  // The composer clears for the newly-committed chat. Before the fix, the send hook's stale onChange closure
  // cleared the OLD draftKey scope while the migrated sent text stayed on the CHAT_ID scope and
  // re-populated this composer — so it stayed "First message" (the "first send doesn't clear" bug).
  await expect(textarea).toHaveValue("");
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

  const component = await mount(<ChatRoomSurfaceStory committed={true} />);

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
