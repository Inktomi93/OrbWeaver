// CT: `useStartChat` — the ONE client creation seam (D166).
//
// Every launcher in the app — the new-chat picker, the home quick-picks tile, "New chat with the same characters",
// the character library's Chat-with CTA — fires THIS. Its three jobs are each pinned below, because each is
// silent when it breaks: the WIRE SHAPE it sends (creation intent only, never the nine-field draft carry
// that used to ride along), the NAVIGATION it performs, and the CACHE SEED that makes the room's first
// frame warm. It lives in `#data` because chat AND character both launch chats and a feature may never
// import another feature.
//
// A CT, not a unit test: the hook composes `createEntityMutation` + the real tRPC client + `#state` module
// actions, and its whole observable surface is what a mounted component sees.

import type { CharacterId, ChatId, MessageId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { TrpcRoutes } from "../../support/node/route-trpc.ts";
import { routeTrpc, trpcError, trpcHold } from "../../support/node/route-trpc.ts";
import { makeMessagesPage, makeMessageView } from "../features/chat/fixtures.ts";
import { StartChatStory } from "./_ct-stories.tsx";

const CREATED_ID = castId<ChatId>("chat_ct_start_chat");
const OPENING_TEXT = "Elias waits beside the ashfall road.";
const AUTHORITATIVE_TEXT = "Elias points toward the northern pass.";
const OPENING_MESSAGE = makeMessageView({
  id: castId<MessageId>("msg_ct_start_opening"),
  chatId: CREATED_ID,
  content: OPENING_TEXT,
});
const AUTHORITATIVE_MESSAGE = makeMessageView({
  id: castId<MessageId>("msg_ct_start_authoritative"),
  chatId: CREATED_ID,
  seq: 2,
  content: AUTHORITATIVE_TEXT,
});

const CREATED_CHAT = {
  id: CREATED_ID,
  title: "The Ashfall Road",
  identities: [],
};

const START_CHAT_ROUTES: TrpcRoutes<"chat.startChat" | "chat.listMessages"> = {
  "chat.startChat": { chat: CREATED_CHAT, opening: { messages: [OPENING_MESSAGE], aborted: false } },
  "chat.listMessages": makeMessagesPage([OPENING_MESSAGE]),
  // Deliberately NOT stubbed to the same row: `chat.getChat` answering `null` here is the CONTROL for the
  // seed pin below — if the response were not written into the cache, the reader would go cold.
};

test("the Start seam creates the room, enters it, and lands the rail on Chats", async ({ mount, page }) => {
  await routeTrpc(page, START_CHAT_ROUTES);

  const component = await mount(<StartChatStory />);
  const state = component.getByTestId("start-chat-state");
  // At rest the shell is on HOME (the launcher, D62 P4) — the section switch is part of what this seam does.
  await expect(state).toHaveText("chat=none section=home pending=false");

  await component.getByRole("button", { name: "start chat" }).click();

  await expect(state).toHaveText(`chat=${CREATED_ID} section=chats pending=false`);
});

test("the response seeds both room reads and confirms the message page after the native crossfade", async ({ mount, page }) => {
  const listMessages = trpcHold();
  await page.addInitScript(() => {
    let finish: (() => void) | undefined;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: (update: () => void | Promise<void>) => {
        const updateCallbackDone = Promise.resolve().then(update);
        return { ready: updateCallbackDone, finished: updateCallbackDone.then(() => finished), updateCallbackDone };
      },
    });
    (globalThis as typeof globalThis & { __finishStartChatTransition: () => void }).__finishStartChatTransition = (): void => {
      if (finish === undefined) {
        throw new Error("held View Transition has no release function");
      }
      finish();
    };
  });
  // CT's document is already loaded before the test body. The init script only installs on navigation.
  await page.reload();
  const trpc = await routeTrpc(page, {
    "chat.startChat": START_CHAT_ROUTES["chat.startChat"],
    "chat.listMessages": listMessages,
  });

  const component = await mount(<StartChatStory />);
  await component.getByRole("button", { name: "start chat" }).click();

  // The held transition is the planted boundary: the canonical confirmation must not land mid-crossfade.
  await expect(component.getByTestId("seeded-room")).toHaveText(`The Ashfall Road — ${OPENING_TEXT}`);
  await expect.poll(() => trpc.count("chat.getChat"), { intervals: [20, 50, 100] }).toBe(0);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await expect.poll(() => trpc.count("chat.listMessages")).toBe(0);

  await page.evaluate(() => (globalThis as typeof globalThis & { __finishStartChatTransition: () => void }).__finishStartChatTransition());
  await listMessages.requested;
  await expect.poll(() => trpc.count("chat.listMessages")).toBe(1);

  listMessages.release(makeMessagesPage([OPENING_MESSAGE, AUTHORITATIVE_MESSAGE]));

  await expect(component.getByTestId("seeded-room")).toHaveText(`The Ashfall Road — ${OPENING_TEXT} | ${AUTHORITATIVE_TEXT}`);
  await expect.poll(() => trpc.count("chat.listMessages")).toBe(1);
});

test("an opening-less response seeds an empty first frame and still closes the pre-attach gap", async ({ mount, page }) => {
  const listMessages = trpcHold();
  const trpc = await routeTrpc(page, {
    "chat.startChat": { chat: CREATED_CHAT, opening: null },
    "chat.listMessages": listMessages,
  });

  const component = await mount(<StartChatStory />);
  await component.getByRole("button", { name: "start chat" }).click();
  await listMessages.requested;

  await expect(component.getByTestId("seeded-room")).toHaveText("The Ashfall Road — empty");
  await expect.poll(() => trpc.count("chat.listMessages")).toBe(1);

  listMessages.release(makeMessagesPage([AUTHORITATIVE_MESSAGE]));

  await expect(component.getByTestId("seeded-room")).toHaveText(`The Ashfall Road — ${AUTHORITATIVE_TEXT}`);
  await expect.poll(() => trpc.count("chat.listMessages")).toBe(1);
});

test("the wire carries CREATION INTENT ONLY — no draft carry rides along", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, START_CHAT_ROUTES);

  const component = await mount(<StartChatStory />);
  await component.getByRole("button", { name: "start chat" }).click();
  await expect(component.getByTestId("start-chat-state")).toContainText(CREATED_ID);

  // The nine-field carry (`seedGreetings`/`rosterOverrides`/`groupConfig`/`roomOverrides`/`injections`/
  // `guided`/`startAsGame`/`opening:"generate"`) was the whole reason a rowless draft had to exist. The
  // input this seam sends names the room and nothing else; every one of those config concerns is now the
  // committed verb it shadowed, reachable because the room exists.
  await expect
    .poll(() => Object.keys((trpc.lastInput("chat.startChat") ?? {}) as Record<string, unknown>).toSorted(), { intervals: [20, 50, 100] })
    .toEqual(["anchorPersonaId", "characterIds", "title"]);
});

test("a FAILED create leaves the caller where they were — no half-navigation into a room that does not exist", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.startChat": trpcError({ message: "nope" }) });

  const component = await mount(<StartChatStory />);
  const state = component.getByTestId("start-chat-state");

  await component.getByRole("button", { name: "start chat" }).click();

  // NEITHER pointer moves on a rejected create: no chat, and not even the section switch — the navigation
  // is sequenced AFTER the awaited mutation precisely so a failure cannot strand the user on an empty
  // Chats landing wondering what happened. The picker stays open on its picked cast (its own CT covers that
  // half) and the mutation's `errorToast` says why.
  await expect(state).toHaveText("chat=none section=home pending=false");
});

test("a founding character set rides through as characterIds", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, START_CHAT_ROUTES);
  // MINTED, never a hand-written literal — `typeIdSchema` validates the 26-char suffix at RUNTIME.
  const aria: CharacterId = mintTypeId(ID_PREFIX.character);

  const component = await mount(<StartChatStory characterIds={[aria]} />);
  await component.getByRole("button", { name: "start chat" }).click();
  await expect(component.getByTestId("start-chat-state")).toContainText(CREATED_ID);

  await expect
    .poll(() => (trpc.lastInput("chat.startChat") as { characterIds: string[] } | undefined)?.characterIds, { intervals: [20, 50, 100] })
    .toEqual([aria]);
});
