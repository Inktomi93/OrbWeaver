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

import type { GroupConfig } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import type { CharacterId, MessageId, PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { testId } from "../../../../../packages/client/src/lib/test-ids.ts";
import { routeOrbSocket } from "../../../../support/ct/route-orb-socket.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { ChatRoomSurfaceStory, ChatSurfaceContributorStory } from "../_ct-stories.tsx";
import { CHAT_ID, makeMacroNameProducer, makeMessagesPage, makeMessageView } from "../fixtures.ts";

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
    macroNames: ReturnType<typeof makeMacroNameProducer>;
    personaAvatars: never[];
    characterAvatars: never[];
    group: GroupConfig;
  } => ({
    participants: [],
    anchorPersonaId: null,
    macroNames: makeMacroNameProducer(),
    personaAvatars: [],
    characterAvatars: [],
    group: DEFAULT_GROUP_CONFIG,
  }),
};

// The draft transcript's MACRO producers (its half of what a committed room reads off `chat.getChat`):
// the viewer's owned personas + the two seed pointers + this character's persona connections feed
// `resolveDraftAnchorPersona`, so a draft greeting's `{{user}}` names the persona the commit will anchor.
const NOVA = "persona_nova";
const DRAFT_IDENTITY_STUB = {
  "persona.list": (): readonly { id: string; name: string; description: string }[] => [{ id: NOVA, name: "Nova", description: "a wandering cartographer" }],
  "persona.listConnectedToCharacter": (): readonly never[] => [],
  "settings.getUserSettings": (): { userId: UserId; schemaVersion: number; config: unknown; updatedAt: number } => ({
    userId: castId<UserId>("user_ct"),
    schemaVersion: 1,
    config: { ...DEFAULT_USER_SETTINGS, seeds: { ...DEFAULT_USER_SETTINGS.seeds, currentPersonaId: NOVA } },
    updatedAt: 0,
  }),
};

test("a seeded draft renders the founding greeting as an editable row + the live composer, no CANON read", async ({ mount, page }) => {
  let listMessagesCalls = 0;
  await routeTrpc(page, {
    ...PREVIEW_FIT_STUB,
    ...DRAFT_IDENTITY_STUB,
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

// A character added via the roster PANEL mid-draft (`addDraftCharacter`, the story's `add-panel-character`
// probe) must show its greeting row IMMEDIATELY — before commit — not just once the chat is created. The
// bug: `DraftGreetingThread` built its cast from `draftSeed.characterIds` ONLY, while the commit unions in
// `addedCharacterIds` (`resolveDraftCommit`) — so a panel-added character was invisible pre-commit and only
// appeared at commit. The fix threads `resolveDraftCharacterIds` (the commit's own union) through the render.
test("a panel-added character renders a greeting row pre-commit (same cast the commit will write)", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...PREVIEW_FIT_STUB,
    ...DRAFT_IDENTITY_STUB,
    "chat.listMessages": () => makeMessagesPage([]),
    "character.get": (input: unknown): unknown =>
      (input as { readonly characterId: CharacterId }).characterId === "char_ct_panel_added"
        ? { id: castId<CharacterId>("char_ct_panel_added"), name: "Bryn", greetings: ["Well met, wanderer."] }
        : { id: castId<CharacterId>("char_ct_room"), name: "Aria", greetings: ["Greetings, traveller."] },
  });

  const component = await mount(<ChatRoomSurfaceStory committed={false} />);

  await expect(component.getByText("Greetings, traveller.")).toBeVisible();
  // Not yet added — no Bryn row.
  await expect(component.getByText("Well met, wanderer.")).toHaveCount(0);

  await component.getByTestId("add-panel-character").click();

  // The panel-added character's greeting row renders WITHOUT any commit — the founding character's row
  // is unaffected.
  await expect(component.getByText("Well met, wanderer.")).toBeVisible();
  await expect(component.getByText("Greetings, traveller.")).toBeVisible();
});

// ── one renderer, both surfaces: a draft greeting is NOT a second rendering home ───────────────────
// The owner report was "markdown doesn't apply before the chat is committed". The draft greeting already
// rides the same MessageRow → MessageContent → @orb/ui/markdown path a committed row does (synth-greeting-
// row.ts decision #1), and these two tests pin that convergence with ONE body rendered through BOTH arms:
// a second, plain-text greeting renderer (or a draft that skipped `renderMessageForDisplay`) fails them.
// Emphasis is a native <em>; Streamdown renders strong as `<span data-streamdown="strong">` (the
// ghost-message-row.ct.tsx precedent), and an inline code span as <code>.
const FORMATTED_BODY = "*She looks up.* **Well met**, {{user}} — try `:help` sometime.";

async function expectFormattedBody(bubble: Locator): Promise<void> {
  await expect(bubble.locator("em")).toHaveText("She looks up.");
  await expect(bubble.locator('[data-streamdown="strong"]')).toHaveText("Well met");
  await expect(bubble.locator("code")).toHaveText(":help");
  // The macro resolved to the persona the commit will anchor — never the raw `{{user}}`, never the "User" floor.
  await expect(bubble).toContainText("Well met, Nova —");
}

test("a DRAFT greeting renders formatted through the shared pipeline (emphasis/strong/code + a resolved {{user}})", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...PREVIEW_FIT_STUB,
    ...DRAFT_IDENTITY_STUB,
    "chat.listMessages": () => makeMessagesPage([]),
    "character.get": () => ({ id: castId<CharacterId>("char_ct_room"), name: "Aria", greetings: [FORMATTED_BODY] }),
  });

  const component = await mount(<ChatRoomSurfaceStory committed={false} />);

  await expectFormattedBody(component.locator(BUBBLE).first());
  // The raw markup never reaches the reader (the tell of a plain-Text draft renderer).
  await expect(component.locator(BUBBLE).first()).not.toContainText("**Well met**");
});

// A greeting is the highest-unbalanced-markdown surface there is (hand-authored ST cards habitually
// leave a narration asterisk open), so the `autoFixMarkdown` appearance knob has to reach the DRAFT
// greeting row, not just committed canon. OFF (the shipped default) renders the line as authored — a
// lone `*` is literal per CommonMark; ON closes the run at end-of-line (`@orb/kit/fix-markdown`).
const UNBALANCED_GREETING = "*She looks up and smiles";

async function routeUnbalancedGreeting(page: Page, autoFixMarkdown: boolean): Promise<void> {
  await routeTrpc(page, {
    ...PREVIEW_FIT_STUB,
    ...DRAFT_IDENTITY_STUB,
    "settings.getUserSettings": () => ({
      userId: castId<UserId>("user_ct"),
      schemaVersion: 1,
      config: { ...DEFAULT_USER_SETTINGS, appearance: { ...DEFAULT_USER_SETTINGS.appearance, autoFixMarkdown } },
      updatedAt: 0,
    }),
    "chat.listMessages": () => makeMessagesPage([]),
    "character.get": () => ({ id: castId<CharacterId>("char_ct_room"), name: "Aria", greetings: [UNBALANCED_GREETING] }),
  });
}

test("autoFixMarkdown ON closes an unbalanced greeting asterisk on the DRAFT row", async ({ mount, page }) => {
  await routeUnbalancedGreeting(page, true);
  const component = await mount(<ChatRoomSurfaceStory committed={false} />);
  await expect(component.locator(BUBBLE).first().locator("em")).toHaveText("She looks up and smiles");
});

test("autoFixMarkdown OFF leaves the same greeting as authored (the literal asterisk, no emphasis)", async ({ mount, page }) => {
  await routeUnbalancedGreeting(page, false);
  const component = await mount(<ChatRoomSurfaceStory committed={false} />);
  const bubble = component.locator(BUBBLE).first();
  await expect(bubble.locator("em")).toHaveCount(0);
  await expect(bubble).toContainText(UNBALANCED_GREETING);
});

// The ST-card shape (Azarael: quoted dialogue + plain narration, zero asterisks) — the `colorQuotedSpeech`
// appearance knob has to reach BOTH body arms from the settings read, exactly like autoFixMarkdown above.
// The knob-OFF case is the discriminator: an always-on tint (a transform mounted unconditionally in the
// seal) passes the ON tests and fails this one.
const QUOTED_GREETING = "He doesn’t look up from the ledger. “You’re late,” he says.";
const DIALOGUE_SPAN = '[data-slot="dialogue"]';

async function routeQuotedGreeting(page: Page, colorQuotedSpeech: boolean): Promise<void> {
  await routeTrpc(page, {
    ...PREVIEW_FIT_STUB,
    ...DRAFT_IDENTITY_STUB,
    "settings.getUserSettings": () => ({
      userId: castId<UserId>("user_ct"),
      schemaVersion: 1,
      config: { ...DEFAULT_USER_SETTINGS, appearance: { ...DEFAULT_USER_SETTINGS.appearance, colorQuotedSpeech } },
      updatedAt: 0,
    }),
    "chat.listMessages": () => makeMessagesPage([]),
    "character.get": () => ({ id: castId<CharacterId>("char_ct_room"), name: "Aria", greetings: [QUOTED_GREETING] }),
  });
}

test("colorQuotedSpeech ON (the default) tints the quoted run on the DRAFT greeting row", async ({ mount, page }) => {
  await routeQuotedGreeting(page, true);
  const component = await mount(<ChatRoomSurfaceStory committed={false} />);
  const tinted = component.locator(BUBBLE).first().locator(DIALOGUE_SPAN);
  await expect(tinted).toHaveCount(1);
  await expect(tinted).toHaveText("“You’re late,”");
});

test("colorQuotedSpeech OFF renders the same greeting plain — the knob really reaches the row", async ({ mount, page }) => {
  await routeQuotedGreeting(page, false);
  const component = await mount(<ChatRoomSurfaceStory committed={false} />);
  const bubble = component.locator(BUBBLE).first();
  await expect(bubble).toContainText("You’re late,");
  await expect(bubble.locator(DIALOGUE_SPAN)).toHaveCount(0);
});

test("the COMMITTED arm tints that same quoted body identically (one renderer, both arms)", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...PREVIEW_FIT_STUB,
    "chat.listMessages": () => makeMessagesPage([makeMessageView({ id: castId<MessageId>("msg_room_quoted"), role: "assistant", content: QUOTED_GREETING })]),
    ...ROSTER_STUB,
  });
  const component = await mount(<ChatRoomSurfaceStory committed={true} />);
  const tinted = component.locator(BUBBLE).first().locator(DIALOGUE_SPAN);
  await expect(tinted).toHaveCount(1);
  await expect(tinted).toHaveText("“You’re late,”");
});

test("the COMMITTED arm renders that same body identically — the draft is not a second rendering home", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...PREVIEW_FIT_STUB,
    "chat.listMessages": () => makeMessagesPage([makeMessageView({ id: castId<MessageId>("msg_room_greeting"), role: "assistant", content: FORMATTED_BODY })]),
    // The committed arm's `{{user}}` subject: the chat's ANCHOR persona + the name producer that carries it
    // (the exact pair the draft arm predicts client-side).
    "chat.getChat": (): {
      participants: never[];
      anchorPersonaId: string;
      macroNames: ReturnType<typeof makeMacroNameProducer>;
      personaAvatars: never[];
      characterAvatars: never[];
      group: GroupConfig;
    } => ({
      participants: [],
      anchorPersonaId: NOVA,
      macroNames: makeMacroNameProducer({ personaNames: [{ id: castId<PersonaId>(NOVA), name: "Nova", description: "a wandering cartographer" }] }),
      personaAvatars: [],
      characterAvatars: [],
      group: DEFAULT_GROUP_CONFIG,
    }),
  });

  const component = await mount(<ChatRoomSurfaceStory committed={true} />);

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
    ...DRAFT_IDENTITY_STUB,
    "chat.startChat": () => ({ chat: { id: CHAT_ID }, openingFailure: null }),
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
  const component = await mount(<ChatRoomSurfaceStory committed={true} />);

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
  const component = await mount(<ChatRoomSurfaceStory committed={true} />);

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
