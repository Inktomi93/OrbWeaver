// CT: the keystone surface end-to-end. Drives the PRODUCTION path — listMessages read (routeTrpc) +
// the live room stream (routeChatStream fulfills a real tRPC SSE body) → useChatBus → applyChatBusEvent
// → the chat-stream store → the invalidation refetch. Asserts: canon renders; a send turn streams a
// ghost then swaps to the canonical row after turnCompleted refetches listMessages; and a draft handle
// (no server id) shows the empty state without ever hitting the server (skipToken).
//
// NOTE: `trpc.chat.listMessages` is stubbed at the NETWORK (routeTrpc) — the tRPC proxy builds the path
// structurally, so the CT runs even before the transport verb lands (it's being wired in parallel).

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { routeChatStream } from "../../../../support/ct/route-trpc-subscription";
import { MessageListSurfaceStory } from "../_ct-stories";
import { CHAT_ID, makeMessageView } from "../fixtures";

const USER_VIEW = makeMessageView({
  id: castId<MessageId>("msg_user"),
  role: "user",
  content: "Ping?",
  seq: 1,
});
const AI_VIEW = makeMessageView({
  id: castId<MessageId>("msg_ai"),
  role: "assistant",
  content: "Hello world",
  seq: 2,
});

// The scripted turn: start → two text deltas → complete (targetMessageId null → the ghost appends).
const TURN: ChatBusEvent[] = [
  {
    type: "turnStarted",
    chatId: CHAT_ID,
    intent: "send",
    api: "chat-completions",
    source: "openrouter",
    model: "test-model",
    speakerCharacterId: null,
    targetMessageId: null,
  },
  { type: "delta", chatId: CHAT_ID, delta: { chatId: CHAT_ID, kind: "text", text: "Hello " } },
  { type: "delta", chatId: CHAT_ID, delta: { chatId: CHAT_ID, kind: "text", text: "world" } },
  { type: "turnCompleted", chatId: CHAT_ID, intent: "send", messageId: AI_VIEW.id },
];

test("renders canon, then streams a turn and swaps the ghost for the canonical row", async ({
  mount,
  page,
}) => {
  let listCall = 0;
  const trpc = await routeTrpc(page, {
    // First read = just the user turn; the post-turnCompleted refetch adds the assistant reply.
    "chat.listMessages": () => (listCall++ === 0 ? [USER_VIEW] : [USER_VIEW, AI_VIEW]),
  });
  await routeChatStream(page, { events: TURN });

  const component = await mount(<MessageListSurfaceStory />);

  // Canon renders.
  await expect(component.getByText("Ping?")).toBeVisible();
  // The turn completes → listMessages refetches → the assistant reply lands as a canonical row.
  await expect(component.getByText("Hello world")).toBeVisible();
  await expect.poll(() => trpc.count("chat.listMessages")).toBeGreaterThanOrEqual(2);
});

test("a draft handle shows the empty state and never reads the server", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "chat.listMessages": () => [USER_VIEW],
  });

  const component = await mount(<MessageListSurfaceStory committed={false} />);

  await expect(component.getByText("No messages yet.")).toBeVisible();
  // skipToken: a draft never builds the key, so the server is never hit.
  expect(trpc.count("chat.listMessages")).toBe(0);
});
