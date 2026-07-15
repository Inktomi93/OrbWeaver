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
import { makeMacroNameProducer, makeMessagesPage, makeMessageView } from "../fixtures";

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
  "chat.getChat": (): {
    participants: never[];
    anchorPersonaId: null;
    macroNames: ReturnType<typeof makeMacroNameProducer>;
    personaAvatars: never[];
  } => ({
    participants: [],
    anchorPersonaId: null,
    macroNames: makeMacroNameProducer(),
    personaAvatars: [],
  }),
};

test("a seeded draft renders the founding greeting as an editable row + the live composer, no CANON read", async ({
  mount,
  page,
}) => {
  let listMessagesCalls = 0;
  await routeTrpc(page, {
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

test("a committed chat reads canon and renders the rows beside the composer", async ({
  mount,
  page,
}) => {
  await routeTrpc(page, {
    "chat.listMessages": () => makeMessagesPage(CANON),
    ...ROSTER_STUB,
  });

  const component = await mount(<ChatRoomSurfaceStory committed={true} />);

  await expect(component.getByText("Hi Aria")).toBeVisible();
  await expect(component.getByText("Well met, traveller.")).toBeVisible();
  await expect(component.getByTestId(testId("composer"))).toBeVisible();
});

// THE ANTI-STORM PIN (freshness plan Phase 4). The mutation-vs-bus rule is that a `send` invalidates
// NOTHING of its own (`busDriven` — createEntityMutation); the SSE bus is the sole freshness path. The
// exhaustive invalidation.test.ts pins the BUS half; the per-mutation `busDriven` marker pins the config.
// This pins the LIVE seam end-to-end: a REAL send through the REAL composer + useSendMessage, and the
// list is refetched ZERO extra times by the mutation. Isolation is the discriminator — NO bus turn is
// delivered (empty stream), so the ONLY thing that could refetch `listMessages` after the initial read is
// the mutation itself. It doesn't. A regression re-adding `invalidates` to the send mutation (or dropping
// `busDriven`) makes this count 2 and the test goes red — the "one send fired the list 4-5×" storm.
test("a committed send adds NO invalidation of its own — the list refetch is bus-only (busDriven)", async ({
  mount,
  page,
}) => {
  const trpc = await routeTrpc(page, {
    // The committed room reads its transcript ONCE (the list + the composer's tail-gate share the key).
    "chat.listMessages": () =>
      makeMessagesPage([
        makeMessageView({ id: castId<MessageId>("msg_room_user"), role: "user", content: "Ping?" }),
      ]),
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
  expect(trpc.count("chat.send")).toBe(1);
  expect(trpc.count("chat.listMessages")).toBe(1);
});

// ── The chat-surface-anchor CONTRIBUTOR seam (client-architecture-lockdown.md §6c/M8 — new) ────────
// A fake `ChatSurfaceContribution` at each of the 3 anchors, registered at a door-mirroring
// `CtChatContributorSectionRegistry` in place of the empty registry, mounted through the REAL `chats`
// section's `content()` → `ChatContent` → `ChatRoomSurface`/`MessageRow` anchor-consumer path (this file's
// own `chat-room-surface.tsx`, and `message-row.tsx` for `message-footer`).

test("a fake thread-flank contribution appears beside the thread (the flank column activates)", async ({
  mount,
  page,
}) => {
  // Wide content width — comfortably above the @max-lg (32rem/512px) stack threshold, so the flank
  // row's container query resolves to the beside (row) layout.
  await page.setViewportSize({ width: 1024, height: 600 });
  await routeTrpc(page, { ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage(CANON) });

  const component = await mount(
    <ChatSurfaceContributorStory anchor="thread-flank" visible={true} />,
  );

  await expect(component.getByTestId("ct-fake-surface-contribution")).toBeVisible();
  await expect(component.getByText("fake thread-flank")).toBeVisible();
  const flankRow = page.locator('[data-slot="chat-room-flank-row"]');
  await expect(flankRow).toHaveCSS("flex-direction", "row");
});

test("a fake thread-flank contribution with `when:false` renders NO flank column (today's layout, unchanged)", async ({
  mount,
  page,
}) => {
  await routeTrpc(page, { ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage(CANON) });

  const component = await mount(
    <ChatSurfaceContributorStory anchor="thread-flank" visible={false} />,
  );

  await expect(component.getByTestId("ct-fake-surface-contribution")).toHaveCount(0);
  await expect(page.locator('[data-slot="chat-thread-flank"]')).toHaveCount(0);
});

// THE RULING (2026-07-15) — the thread-flank anchor is the SEAM's responsibility, not the
// contributor's: flank layout must be responsive-correct BY CONSTRUCTION so a live flank never
// crushes the thread's reading column at narrow content width. Proven via a CONTAINER query (the
// chat-content region's own inline size), NOT a viewport media query — the flank stacks below the
// thread instead.
test("a fake thread-flank contribution STACKS below the thread at narrow content width (no crushed reading column)", async ({
  mount,
  page,
}) => {
  // Below the @max-lg (32rem/512px) container-query threshold — the flank row must switch to
  // column, keeping the thread at full (readable) width instead of splitting it with the flank.
  await page.setViewportSize({ width: 400, height: 600 });
  await routeTrpc(page, { ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage(CANON) });

  const component = await mount(
    <ChatSurfaceContributorStory anchor="thread-flank" visible={true} />,
  );

  // The flank is NOT hidden — it renders stacked, not dropped.
  await expect(component.getByTestId("ct-fake-surface-contribution")).toBeVisible();
  const flankRow = page.locator('[data-slot="chat-room-flank-row"]');
  await expect(flankRow).toHaveCSS("flex-direction", "column");
});

test("a fake above-composer contribution appears between the selection bar slot and the composer", async ({
  mount,
  page,
}) => {
  await routeTrpc(page, { ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage(CANON) });

  const component = await mount(
    <ChatSurfaceContributorStory anchor="above-composer" visible={true} />,
  );

  await expect(component.getByTestId("ct-fake-surface-contribution")).toBeVisible();
});

test("a fake above-composer contribution's `when:false` hides it", async ({ mount, page }) => {
  await routeTrpc(page, { ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage(CANON) });

  const component = await mount(
    <ChatSurfaceContributorStory anchor="above-composer" visible={false} />,
  );

  await expect(component.getByTestId("ct-fake-surface-contribution")).toHaveCount(0);
});

test("a fake message-footer contribution renders under a COMMITTED message row", async ({
  mount,
  page,
}) => {
  await routeTrpc(page, { ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage(CANON) });

  const component = await mount(
    <ChatSurfaceContributorStory anchor="message-footer" visible={true} />,
  );

  // One footer per COMMITTED row (CANON has 2 messages) — proves the anchor mounts PER-ROW, not once.
  const footers = component.getByTestId("ct-fake-surface-contribution");
  await expect(footers).toHaveCount(CANON.length);
  await expect(footers.first()).toBeVisible();
});

test("a fake message-footer contribution's `when:false` hides it on the row", async ({
  mount,
  page,
}) => {
  await routeTrpc(page, { ...ROSTER_STUB, "chat.listMessages": () => makeMessagesPage(CANON) });

  const component = await mount(
    <ChatSurfaceContributorStory anchor="message-footer" visible={false} />,
  );

  await expect(component.getByTestId("ct-fake-surface-contribution")).toHaveCount(0);
});
