// The production room receives persisted messages through its real chat event subscription.
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { seedShellState } from "@orb/testkit/browser/spec";
import {
  absenceWindow,
  createShellAmbientReads,
  ROOM_PROCEDURES,
  routeAuthConfig,
  routeOrbSocket,
  routeTrpc,
  SECTION_PROCEDURES,
  serveCorpusProcedures,
  trpcError,
} from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { CORPUS_EMBED_MODEL, CORPUS_EMBEDDING_VECTOR, createCorpusHarness, createCorpusProviderExecution } from "@orb/testkit/node/composed";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const ROWS = 14;
const SCROLL_ROUNDING_PX = 1;
const SETTLE_MARGIN_MS = 400;

const WITHHOLD_FLAG = "__withholdScrollend";
const SILENCE_SCROLL = "__silenceScroll";

// The capability stays advertised and the reader's scroll away reports its end, but once armed no scroll ends with a
// `scrollend`: the jump's smooth scroll reaches the tail without one.
const withholdArmedScrollend = (flag: string): void => {
  const native = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function patched(this: EventTarget, type: string, ...rest: unknown[]): void {
    const [listener, ...options] = rest;
    if (type === "scrollend" && typeof listener === "function") {
      Reflect.apply(native, this, [
        type,
        (event: Event): void => {
          if (!Reflect.get(globalThis, flag)) {
            Reflect.apply(listener, this, [event]);
          }
        },
        ...options,
      ]);
      return;
    }
    Reflect.apply(native, this, [type, ...rest]);
  };
};

const withoutScrollend = (): void => {
  const native = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function patched(this: EventTarget, type: string, ...rest: unknown[]): void {
    if (type !== "scrollend") {
      Reflect.apply(native, this, [type, ...rest]);
    }
  };
  Reflect.deleteProperty(HTMLElement.prototype, "onscrollend");
  Reflect.deleteProperty(Element.prototype, "onscrollend");
  Reflect.deleteProperty(Window.prototype, "onscrollend");
  Reflect.deleteProperty(globalThis, "onscrollend");
  Reflect.deleteProperty(Document.prototype, "onscrollend");
};

// `quiet` names the scroll whose end the page learns of only from the other signal.
for (const [title, nativeScrollend, profile, quiet] of [
  ["a browser with scrollend", true, undefined, undefined],
  ["a browser without scrollend", false, withoutScrollend, undefined],
  ["a browser whose jump scroll ends without a scrollend", true, withholdArmedScrollend, "jump"],
  ["a browser that reports the end of a scroll but delivers no scroll events", true, undefined, "away"],
] as const) {
  test(`the pill counts a message that lands while the reader is away, and clears once the jump reaches the tail, in ${title}`, async ({
    corpus,
    mount,
    page,
  }) => {
    if (profile === withholdArmedScrollend) {
      await page.addInitScript(profile, WITHHOLD_FLAG);
    } else if (profile !== undefined) {
      await page.addInitScript(profile);
    }
    const provider = createCorpusProviderExecution({
      modelIds: [CORPUS_EMBED_MODEL],
      embedding: CORPUS_EMBEDDING_VECTOR,
      chatText: "",
      structuredReplies: new Map(),
      images: [],
    });
    await using root = await createCorpusHarness(undefined, { providerFetch: provider.execute });
    const caller = await root.internalCallerFor(root.ownerId);
    const captured = corpus.reads["chat.getChat"][0]?.output;
    if (captured === undefined) {
      throw new Error("Committed corpus omitted a chat");
    }
    const chatId = (await caller.chat.getChat({ chatId: captured.id })).id;
    const source = (await caller.chat.listMessages({ chatId })).messages.at(-1);
    if (source === undefined) {
      throw new Error("Committed chat omitted its messages");
    }
    for (let row = 0; row < ROWS; row++) {
      await caller.chat.commitMessage({ chatId, content: source.content, timeZone: UTC_TIME_ZONE });
    }
    await seedShellState(page, { activeSection: "chats" });
    const auth = await root.http.request("/api/auth/config");
    const authBody = await auth.text();
    await routeAuthConfig(page, authBody);
    await routeTrpc(page, {
      ...createShellAmbientReads(corpus, root.ownerId),
      ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, "notifications.presence", "rpg.getGame", "rpg.listTurnToolCalls"]),
      "stream.attach": ({ ref }) => (ref.channel === "chat" && ref.chatId === chatId ? null : trpcError({ code: "NOT_FOUND" })),
      "stream.detach": ({ ref }) => (ref.channel === "chat" && ref.chatId === chatId ? null : trpcError({ code: "NOT_FOUND" })),
    });
    const listening = Promise.withResolvers<void>();
    const joined = Promise.withResolvers<void>();
    const stop = new AbortController();
    let started = false;
    await using subscription = new AsyncDisposableStack();
    subscription.defer(async () => {
      stop.abort();
      if (started) {
        await joined.promise;
      }
    });
    const socket = await routeOrbSocket(page, {
      awaitAttaches: 1,
      frames: async (signal) => {
        started = true;
        const events = root.app.liveBuses.chat.subscribeChatEvents(chatId, AbortSignal.any([signal, stop.signal]));
        listening.resolve();
        try {
          for await (const entry of events) {
            if (entry.event.type === "messageCommitted") {
              if (entry.seq === null) {
                throw new Error("The committed message has no durable sequence");
              }
              return [{ channel: "chat", chatId, seq: entry.seq, event: entry.event }];
            }
          }
          return [];
        } catch (error) {
          if (!stop.signal.aborted) {
            throw error;
          }
          return [];
        } finally {
          joined.resolve();
        }
      },
    });
    await page.setViewportSize({ width: 900, height: 420 });
    const component = await mount<typeof ChatRoomShellStory>(STORY, { chatId, socket: true });
    expect(
      await page.evaluate(() => ({
        element: "onscrollend" in document.createElement("div"),
        window: "onscrollend" in globalThis,
        document: "onscrollend" in document,
      })),
    ).toEqual({ element: nativeScrollend, window: nativeScrollend, document: nativeScrollend });
    const scroller = page.locator('[data-slot="message-list-scroll"]');
    const distanceFromTail = (): Promise<number> => scroller.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight);
    await expect.poll(() => scroller.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
    await expect.poll(distanceFromTail).toBeLessThanOrEqual(SCROLL_ROUNDING_PX);
    const pill = page.getByRole("button", { name: /^Jump to latest/u });
    await expect(pill).toHaveCount(0);
    await listening.promise;
    await expect.poll(() => socket.attaches().some((ref) => ref.channel === "chat" && ref.chatId === chatId)).toBe(true);
    if (quiet === "away") {
      // Let the arrival scrolls' quiet-period sample land first, or it would read the scroll away below.
      await absenceWindow(page, SETTLE_MARGIN_MS);
      // Capture-phase delivery stops at the document, so no scroll listener on the transcript hears the reader's scroll away.
      await page.evaluate((key) => {
        const controller = new AbortController();
        Reflect.set(globalThis, key, controller);
        document.addEventListener("scroll", (event) => event.stopPropagation(), { capture: true, signal: controller.signal });
      }, SILENCE_SCROLL);
    }
    await scroller.evaluate((element) => {
      element.scrollTop = 0;
    });
    await absenceWindow(page, SETTLE_MARGIN_MS);
    if (quiet === "away") {
      await page.evaluate((key) => {
        const controller: unknown = Reflect.get(globalThis, key);
        if (controller instanceof AbortController) {
          controller.abort();
        }
      }, SILENCE_SCROLL);
    }
    expect(await distanceFromTail()).toBeGreaterThan(await scroller.evaluate((element) => element.clientHeight));
    const outcome = await caller.chat.commitMessage({ chatId, content: source.content, timeZone: UTC_TIME_ZONE });
    const committed = outcome.messages.at(-1);
    if (committed === undefined) {
      throw new Error("The native commit returned no message");
    }
    await expect(page.getByRole("button", { name: "Jump to latest, 1 new message", exact: true })).toBeVisible();
    if (quiet === "jump") {
      await page.evaluate((flag) => Reflect.set(globalThis, flag, true), WITHHOLD_FLAG);
    }
    await page.getByRole("button", { name: "Jump to latest, 1 new message", exact: true }).click();
    await expect.poll(distanceFromTail).toBeLessThanOrEqual(SCROLL_ROUNDING_PX);
    await expect(page.locator(`[data-message-id="${committed.id}"]`)).toBeVisible();
    await expect(pill).toHaveCount(0);
    await component.unmount();
    await joined.promise;
  });
}
