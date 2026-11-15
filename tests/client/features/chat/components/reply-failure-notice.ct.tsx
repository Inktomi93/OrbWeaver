// A send whose message landed and whose reply then failed says so on the composer's line, with the server's reason and
// the next step, and raises no toast beside it. A send the room never took keeps its toast, with the provider's reason
// under it. A member is told the host's connection failed, on the line and in the toast, and is never sent to Connections.
// @subject packages/client/src/features/chat/components/composer-reply-failure-line.tsx
// @subject packages/client/src/features/chat/hooks/use-send-message.ts

import { CONNECTION_FIXABLE_FAILURE_REASONS, PROVIDER_FAILURE_REASON_PREFIX } from "@orb/contracts/chat";
import type { ChatId, UserId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { seedShellState } from "@orb/testkit/browser/spec";
import type { TrpcRecorder } from "@orb/testkit/ct";
import {
  noticeToast,
  ROOM_PROCEDURES,
  routeOrbSocket,
  routeTrpc,
  SECTION_PROCEDURES,
  SHELL_MOUNT_PROCEDURES,
  serveCorpusProcedures,
  trpcError,
} from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_TEXT_MODEL,
  connectDevice,
  createCorpusHarness,
  createCorpusProviderExecution,
} from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { CHAT_MESSAGE_INPUT_NAME, CHAT_SEND_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import { HOST_CONNECTION_FAILED_COPY, OPEN_CONNECTIONS_NAME, RETRY_REPLY_NAME, SEND_FAILED_TITLE } from "#client/features/chat/lib/send-failure-copy.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const LINE = '[data-slot="composer-reply-failure"]';
const TOAST = '[data-slot="toast-root"]';
const DRAFT = "Open the door.";

type Harness = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Harness["internalCallerFor"]>>;
type FixableReason = (typeof CONNECTION_FIXABLE_FAILURE_REASONS)[number];

/** The provider HTTP status the server classifies as `reason`. The switch covers every fixable reason, so a new one needs its status here. */
function refusalStatus(reason: FixableReason): number {
  switch (reason) {
    case "provider_auth_failed":
      return 401;
    case "provider_billing":
      return 402;
    case "provider_model_unavailable":
      return 404;
  }
}

const REJECTED_KEY = CONNECTION_FIXABLE_FAILURE_REASONS[0];

interface FailingProvider {
  readonly fetch: typeof fetch;
  /** Hold every chat completion until `open` resolves, so the room's bus reaches the page before the failure does. */
  holdUntil: (open: Promise<void>) => void;
}

/** The provider edge: every chat completion is refused as `reason`; the room's recall still embeds. */
function failingProvider(reason: FixableReason): FailingProvider {
  const embeddings = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "",
    structuredReplies: new Map(),
    images: [],
  });
  let gate: Promise<void> = Promise.resolve();
  return {
    fetch: async (input, init): Promise<Response> => {
      const request = new Request(input, init);
      if (request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions")) {
        await gate;
        return Response.json({ error: { message: "upstream refusal" } }, { status: refusalStatus(reason) });
      }
      return await embeddings.execute(request);
    },
    holdUntil: (open): void => {
      gate = open;
    },
  };
}

/** A room the owner hosts with a character reply, its chat turns bound to the scripted endpoint. */
async function failingRoom(root: Harness): Promise<{ readonly host: Caller; readonly chatId: ChatId }> {
  const principal = await root.principalFor(root.ownerId);
  const host = await root.internalCallerFor(root.ownerId);
  const connection = await root.services.connection.create({
    principal,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_TEXT_MODEL,
    declared: { kind: "generation", generation: { input: ["text"], context: { window: 32_000 } }, features: { detectServer: false } },
  });
  await host.connection.setBinding({ task: "chat", connectionId: connection.id });
  for (const chat of (await host.chat.listChats({ limit: 100 })).items) {
    const detail = await host.chat.getChat({ chatId: chat.id });
    const { messages } = await host.chat.listMessages({ chatId: chat.id, limit: 6 });
    if (detail.viewerIsHost && messages.some((message) => message.role === "assistant" && message.characterId !== null && message.kind === "standard")) {
      return { host, chatId: chat.id };
    }
  }
  throw new Error("The corpus has no hosted room with a character reply");
}

/** The server's own sentence for this failure, read by sending through the same root. */
async function serverReason(caller: Caller, chatId: ChatId): Promise<string> {
  const failed = await caller.chat.send({ chatId, content: "Read the refusal.", timeZone: UTC_TIME_ZONE }).then(
    () => null,
    (error: unknown) => (error instanceof Error ? error.message : null),
  );
  if (failed === null) {
    throw new Error("The scripted provider failure did not fail the send");
  }
  return failed;
}

/** Open the room as `viewer`, every read and turn answered by that viewer's own root. With `bus`, the room's live
 *  events from the root reach the page, which is how the client learns its message landed. */
async function openRoom(
  page: Page,
  root: Harness,
  room: { readonly viewer: Caller; readonly chatId: ChatId; readonly provider: FailingProvider; readonly bus: boolean },
): Promise<TrpcRecorder> {
  const { viewer, chatId, provider, bus } = room;
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedShellState(page, { activeSection: "chats" });
  const rpc = routeTrpc(page, {
    ...serveCorpusProcedures(viewer, [
      ...SHELL_MOUNT_PROCEDURES,
      ...SECTION_PROCEDURES,
      ...ROOM_PROCEDURES,
      "persona.list",
      "rpg.getGame",
      "rpg.listTurnToolCalls",
      "chat.send",
      "chat.generate",
    ]),
    // The socket below serves this room alone.
    "stream.attach": ({ ref }) => (ref.channel === "chat" && ref.chatId !== chatId ? trpcError({ code: "NOT_FOUND" }) : null),
    "stream.detach": ({ ref }) => (ref.channel === "chat" && ref.chatId !== chatId ? trpcError({ code: "NOT_FOUND" }) : null),
  });
  if (bus) {
    const socket = await routeOrbSocket(page, {
      awaitRooms: [{ channel: "chat", chatId }],
      frames: (signal) =>
        new Promise((resolve) => {
          const stop = root.app.liveBuses.chat.subscribeAllChatEvents(({ event, seq }) => {
            if (event.chatId === chatId && event.type === "messageCommitted" && event.view?.role === "user") {
              stop();
              resolve([{ channel: "chat", chatId, seq, event }]);
            }
          });
          signal.addEventListener("abort", stop, { once: true });
        }),
    });
    provider.holdUntil(socket.served());
  }
  return await rpc;
}

async function send(page: Page): Promise<void> {
  await page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true }).fill(DRAFT);
  await page.getByRole("button", { name: CHAT_SEND_NAME, exact: true }).click();
}

for (const refusal of CONNECTION_FIXABLE_FAILURE_REASONS) {
  test(`a reply that fails with ${refusal} after the message landed says why on the composer line, offers Connections, and raises no toast`, async ({
    mount,
    page,
  }) => {
    const provider = failingProvider(refusal);
    await using root = await createCorpusHarness(undefined, { providerFetch: provider.fetch });
    const { host, chatId } = await failingRoom(root);
    const reason = await serverReason(host, chatId);
    const rpc = await openRoom(page, root, { viewer: host, chatId, provider, bus: true });
    await mount<typeof ChatRoomShellStory>(STORY, { chatId, socket: true });
    await send(page);

    const line = page.locator(LINE);
    await expect(line).toBeVisible();
    await expect(line).toHaveAttribute("data-reason", refusal);
    await expect(line).toContainText(reason);
    await expect(line.getByRole("button", { name: OPEN_CONNECTIONS_NAME, exact: true })).toBeVisible();
    await expect(page.locator(TOAST)).toHaveCount(0);

    // The retry is the composer's own generate on the saved message; failing again, it keeps the line.
    await line.getByRole("button", { name: RETRY_REPLY_NAME, exact: true }).click();
    await expect.poll(() => rpc.inputs("chat.generate")).toMatchObject([{ chatId }]);
    await expect(page.locator(LINE)).toHaveAttribute("data-reason", refusal);
    await expect(page.locator(TOAST)).toHaveCount(0);
  });
}

test("a send whose message the client never saw land keeps the failed-send toast, with the provider's reason under it", async ({ mount, page }) => {
  const provider = failingProvider(REJECTED_KEY);
  await using root = await createCorpusHarness(undefined, { providerFetch: provider.fetch });
  const { host, chatId } = await failingRoom(root);
  const reason = await serverReason(host, chatId);
  await openRoom(page, root, { viewer: host, chatId, provider, bus: false });
  await mount<typeof ChatRoomShellStory>(STORY, { chatId });
  await send(page);

  await expect(noticeToast(page, { title: SEND_FAILED_TITLE, description: reason })).toBeVisible();
  await expect(page.locator(LINE)).toHaveCount(0);
});

/** The failing room shared with the corpus member, with the host online so the member's turn runs at once (an
 *  offline host's room queues it, and nothing fails). Returns the member's caller and the host's own reason. */
async function memberRoom(
  root: Harness,
  memberId: UserId | undefined,
): Promise<{ readonly member: Caller; readonly chatId: ChatId; readonly hostReason: string } & Disposable> {
  if (memberId === undefined) {
    throw new Error("The corpus has no member identity");
  }
  const { host, chatId } = await failingRoom(root);
  await host.settings.updateAppSettings({ partial: { localMultiUser: true } });
  // The multi-human capability binds when a caller is built, so both callers follow the setting.
  const sharing = await root.internalCallerFor(root.ownerId);
  const member = await root.internalCallerFor(memberId);
  await member.invites.redeemInvite({ token: (await sharing.invites.createInvite({ chatId, input: {} })).token });
  const hostReason = await serverReason(sharing, chatId);
  const hostDevice = new AbortController();
  await connectDevice(root, root.ownerId, hostDevice.signal);
  return { member, chatId, hostReason, [Symbol.dispose]: () => hostDevice.abort() };
}

test("a member whose reply fails on the host's connection is told so, without the host's detail or a Connections door", async ({ corpus, mount, page }) => {
  const provider = failingProvider(REJECTED_KEY);
  await using root = await createCorpusHarness(undefined, { providerFetch: provider.fetch });
  using shared = await memberRoom(root, corpus.memberIdentities?.sharedMember.viewer.userId);
  const chatId = shared.chatId;
  await openRoom(page, root, { viewer: shared.member, chatId, provider, bus: true });
  await mount<typeof ChatRoomShellStory>(STORY, { chatId, socket: true });
  await send(page);

  const line = page.locator(LINE);
  await expect(line).toBeVisible();
  await expect(line).toHaveAttribute("data-reason", new RegExp(`^${PROVIDER_FAILURE_REASON_PREFIX}`, "u"));
  await expect(line.getByRole("button", { name: RETRY_REPLY_NAME, exact: true })).toBeVisible();
  // The host's own reason names the host's settings; the member reads neither it nor the door to them.
  await expect(line).not.toContainText(shared.hostReason);
  await expect(line.getByRole("button", { name: OPEN_CONNECTIONS_NAME, exact: true })).toHaveCount(0);
  await expect(page.locator(TOAST)).toHaveCount(0);
});

test("a member whose send the client never saw land reads the failed-send toast without the host's detail", async ({ corpus, mount, page }) => {
  const provider = failingProvider(REJECTED_KEY);
  await using root = await createCorpusHarness(undefined, { providerFetch: provider.fetch });
  using shared = await memberRoom(root, corpus.memberIdentities?.sharedMember.viewer.userId);
  const chatId = shared.chatId;
  await openRoom(page, root, { viewer: shared.member, chatId, provider, bus: false });
  await mount<typeof ChatRoomShellStory>(STORY, { chatId });
  await send(page);

  await expect(noticeToast(page, { title: SEND_FAILED_TITLE, description: HOST_CONNECTION_FAILED_COPY })).toBeVisible();
  await expect(page.locator(TOAST)).not.toContainText(shared.hostReason);
  await expect(page.locator(LINE)).toHaveCount(0);
});
