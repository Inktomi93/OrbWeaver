// A send whose message landed and whose reply then failed says so on the composer's line, with the server's reason and
// the next step, and raises no toast beside it. A send the room never took keeps its toast, with the provider's reason
// under it. A member is told the host's connection failed, on the line and in the toast, and is never sent to Connections.
// @subject packages/client/src/features/chat/components/composer-reply-failure-line.tsx
// @subject packages/client/src/features/chat/hooks/use-send-message.ts

import {
  CONNECTION_FIXABLE_FAILURE_REASONS,
  EMPTY_GENERATION_CAUSE,
  EMPTY_GENERATION_OP_CODE,
  PROVIDER_FAILURE_REASON_PREFIX,
  RATE_LIMIT_RESETS_AT_DETAIL_KEY,
} from "@orb/contracts/chat";
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
import { terminalSseLine } from "@orb/testkit/node/helpers";
import type { Page } from "@playwright/test";
import { CHAT_MESSAGE_INPUT_NAME, CHAT_SEND_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import { COMPOSER_GENERATE_REPLY_NAME, guidedControlName } from "#client/features/chat/lib/composer-menu-names.ts";
import { VARIANT_GENERATE_NAME } from "#client/features/chat/lib/message-action-names.ts";
import {
  HOST_CONNECTION_FAILED_COPY,
  OPEN_CONNECTIONS_NAME,
  REPLY_NOT_WRITTEN_LEAD,
  RETRY_REPLY_NAME,
  SEND_FAILED_TITLE,
  SWIPE_FAILED_LEAD,
} from "#client/features/chat/lib/send-failure-copy.ts";
import { OPEN_PARAMS_NAME } from "#client/features/chat/lib/warning-notice.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const LINE = '[data-slot="composer-reply-failure"]';
const TOAST = '[data-slot="toast-root"]';
const RESET = '[data-slot="composer-reply-failure-reset"]';
const RATE_LIMITED_REASON = `${PROVIDER_FAILURE_REASON_PREFIX}rate_limit`;
const RESET_AT_MS = 1_900_000_000_000;
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

/** The provider edge: every chat completion is answered by `answer`; the room's recall still embeds. */
function providerAnswering(answer: () => Response): FailingProvider {
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
        return answer();
      }
      return await embeddings.execute(request);
    },
    holdUntil: (open): void => {
      gate = open;
    },
  };
}

/** Every chat completion is refused as `reason`. */
function failingProvider(reason: FixableReason): FailingProvider {
  return providerAnswering(() => Response.json({ error: { message: "upstream refusal" } }, { status: refusalStatus(reason) }));
}

/** Every chat completion ends with no prose and this finish reason: a model out of output limit, one that called tools only, or one that said nothing. */
function emptyProvider(finishReason: "length" | "tool_calls" | "stop"): FailingProvider {
  const frame = `data: ${JSON.stringify({ choices: [{ delta: { content: "" } }] })}`;
  return providerAnswering(
    () =>
      new Response(`${frame}\n\n${terminalSseLine({ finishReason, usage: { promptTokens: 4, completionTokens: 3 } })}\n\ndata: [DONE]\n\n`, {
        headers: { "content-type": "text/event-stream" },
      }),
  );
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
  room: {
    readonly viewer: Caller;
    readonly chatId: ChatId;
    readonly provider: FailingProvider;
    readonly bus: boolean;
    /** The wire answer a Generate reply gets in place of the server's own, for a failure the harness cannot drive in real time. */
    readonly generateFailure?: ReturnType<typeof trpcError>;
  },
): Promise<TrpcRecorder> {
  const { viewer, chatId, provider, bus, generateFailure } = room;
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
      "chat.swipe",
    ]),
    ...(generateFailure === undefined ? {} : { "chat.generate": () => generateFailure }),
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

// The harness runs a provider's retry backoff on controlled timers, so a real 429 cannot settle inside a browser test; the
// server half of this case is `tests/server/domain/chat/engine/rate-limit-failure.int.test.ts`, which reads the real
// formatter's detail for a real 429. This case scripts the wire answer that formatter produces.
test("a Generate reply the provider rate-limited says when the limit resets", async ({ mount, page }) => {
  const provider = failingProvider(REJECTED_KEY);
  await using root = await createCorpusHarness(undefined, { providerFetch: provider.fetch });
  const { host, chatId } = await failingRoom(root);
  const resetsAt = RESET_AT_MS;
  const generateFailure = trpcError({
    code: "TOO_MANY_REQUESTS",
    message: "The provider is rate-limiting this connection.",
    reason: RATE_LIMITED_REASON,
    detail: { [RATE_LIMIT_RESETS_AT_DETAIL_KEY]: resetsAt },
  });
  await openRoom(page, root, { viewer: host, chatId, provider, bus: false, generateFailure });
  await mount<typeof ChatRoomShellStory>(STORY, { chatId });
  await generateReply(page);

  const line = page.locator(LINE);
  await expect(line).toHaveAttribute("data-reason", RATE_LIMITED_REASON);
  await expect(line.locator(RESET)).toHaveAttribute("data-resets-at", String(resetsAt));
});

test("a rejected key's failure line states no reset", async ({ mount, page }) => {
  const provider = failingProvider(REJECTED_KEY);
  await using root = await createCorpusHarness(undefined, { providerFetch: provider.fetch });
  const { host, chatId } = await failingRoom(root);
  await openRoom(page, root, { viewer: host, chatId, provider, bus: true });
  await mount<typeof ChatRoomShellStory>(STORY, { chatId, socket: true });
  await send(page);

  await expect(page.locator(LINE)).toHaveAttribute("data-reason", REJECTED_KEY);
  await expect(page.locator(LINE).locator(RESET)).toHaveCount(0);
});

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

/** The server's own sentence for a failed generate, read by asking for the reply through the same root. */
async function generateReason(caller: Caller, chatId: ChatId): Promise<string> {
  const failed = await caller.chat.generate({ chatId, timeZone: UTC_TIME_ZONE }).then(
    () => null,
    (error: unknown) => (error instanceof Error ? error.message : null),
  );
  if (failed === null) {
    throw new Error("The scripted provider answer did not fail the generate");
  }
  return failed;
}

/** Press the composer's Generate reply, the control a guided response is also fired from. */
async function generateReply(page: Page): Promise<void> {
  // The room's tail line offers an action of the same name for an unanswered message, so the guided cluster is named.
  await page
    .locator('[data-slot="composer-guided-cluster"]')
    .getByRole("button", { name: guidedControlName(COMPOSER_GENERATE_REPLY_NAME, false), exact: true })
    .click();
}

// One row per cause the server states for a generation that ended with no prose; a cause added to the contract fails tsc here.
const EMPTY_KINDS: Record<
  (typeof EMPTY_GENERATION_CAUSE)[keyof typeof EMPTY_GENERATION_CAUSE],
  { readonly finishReason: "length" | "tool_calls" | "stop"; readonly paramsDoor: boolean }
> = {
  [EMPTY_GENERATION_CAUSE.outputLimit]: { finishReason: "length", paramsDoor: true },
  [EMPTY_GENERATION_CAUSE.toolCalls]: { finishReason: "tool_calls", paramsDoor: false },
  [EMPTY_GENERATION_CAUSE.noText]: { finishReason: "stop", paramsDoor: false },
};

for (const [cause, kind] of Object.entries(EMPTY_KINDS)) {
  test(`a Generate reply that ends with ${cause} names the failed action and the server's cause on the composer line, with a toast-free room`, async ({
    mount,
    page,
  }) => {
    const provider = emptyProvider(kind.finishReason);
    await using root = await createCorpusHarness(undefined, { providerFetch: provider.fetch });
    const { host, chatId } = await failingRoom(root);
    const reason = await generateReason(host, chatId);
    await openRoom(page, root, { viewer: host, chatId, provider, bus: false });
    await mount<typeof ChatRoomShellStory>(STORY, { chatId });
    await generateReply(page);

    const line = page.locator(LINE);
    await expect(line).toBeVisible();
    await expect(line).toHaveAttribute("data-reason", EMPTY_GENERATION_OP_CODE);
    await expect(line).toHaveAttribute("data-cause", cause);
    await expect(line).toContainText(`${REPLY_NOT_WRITTEN_LEAD} ${reason}`);
    // Only the output limit is a setting the host changes: the preset's Params. Another reply asks for the same call by its own control.
    await expect(line.getByRole("button", { name: OPEN_PARAMS_NAME, exact: true })).toHaveCount(kind.paramsDoor ? 1 : 0);
    await expect(line.getByRole("button", { name: RETRY_REPLY_NAME, exact: true })).toHaveCount(0);
    await expect(page.locator(TOAST)).toHaveCount(0);
  });
}

test("a Generate reply refused by the provider names the action, the provider's reason and the Connections door, and raises no toast", async ({
  mount,
  page,
}) => {
  const provider = failingProvider(REJECTED_KEY);
  await using root = await createCorpusHarness(undefined, { providerFetch: provider.fetch });
  const { host, chatId } = await failingRoom(root);
  const reason = await generateReason(host, chatId);
  await openRoom(page, root, { viewer: host, chatId, provider, bus: false });
  await mount<typeof ChatRoomShellStory>(STORY, { chatId });
  await generateReply(page);

  const line = page.locator(LINE);
  await expect(line).toBeVisible();
  await expect(line).toHaveAttribute("data-reason", REJECTED_KEY);
  await expect(line).toContainText(`${REPLY_NOT_WRITTEN_LEAD} ${reason}`);
  await expect(line.getByRole("button", { name: OPEN_CONNECTIONS_NAME, exact: true })).toBeVisible();
  await expect(page.locator(TOAST)).toHaveCount(0);
});

test("a Generate reply the provider rejects as a bad request says why and offers no settings door, because no setting fixes it", async ({ mount, page }) => {
  const provider = providerAnswering(() => Response.json({ error: { message: "malformed request" } }, { status: 400 }));
  await using root = await createCorpusHarness(undefined, { providerFetch: provider.fetch });
  const { host, chatId } = await failingRoom(root);
  const reason = await generateReason(host, chatId);
  await openRoom(page, root, { viewer: host, chatId, provider, bus: false });
  await mount<typeof ChatRoomShellStory>(STORY, { chatId });
  await generateReply(page);

  const line = page.locator(LINE);
  await expect(line).toHaveAttribute("data-reason", new RegExp(`^${PROVIDER_FAILURE_REASON_PREFIX}`, "u"));
  await expect(line).toContainText(`${REPLY_NOT_WRITTEN_LEAD} ${reason}`);
  await expect(line.getByRole("button", { name: OPEN_CONNECTIONS_NAME, exact: true })).toHaveCount(0);
  await expect(line.getByRole("button", { name: OPEN_PARAMS_NAME, exact: true })).toHaveCount(0);
  await expect(page.locator(TOAST)).toHaveCount(0);
});

test("a member whose Generate reply ends on the host's output limit reads the cause and is not sent to the host's Params", async ({ corpus, mount, page }) => {
  const provider = emptyProvider("length");
  await using root = await createCorpusHarness(undefined, { providerFetch: provider.fetch });
  using shared = await memberRoom(root, corpus.memberIdentities?.sharedMember.viewer.userId);
  const chatId = shared.chatId;
  await openRoom(page, root, { viewer: shared.member, chatId, provider, bus: false });
  await mount<typeof ChatRoomShellStory>(STORY, { chatId });
  await generateReply(page);

  const line = page.locator(LINE);
  await expect(line).toHaveAttribute("data-cause", EMPTY_GENERATION_CAUSE.outputLimit);
  await expect(line).toContainText(REPLY_NOT_WRITTEN_LEAD);
  await expect(line.getByRole("button", { name: OPEN_PARAMS_NAME, exact: true })).toHaveCount(0);
});

test("a swipe that ends on the output limit says so on the composer line, where the room's other turn failures say theirs, with the Params door", async ({
  mount,
  page,
}) => {
  const provider = emptyProvider("length");
  await using root = await createCorpusHarness(undefined, { providerFetch: provider.fetch });
  const { host, chatId } = await failingRoom(root);
  const reason = await generateReason(host, chatId);
  await openRoom(page, root, { viewer: host, chatId, provider, bus: false });
  await mount<typeof ChatRoomShellStory>(STORY, { chatId });
  await page.getByRole("button", { name: VARIANT_GENERATE_NAME, exact: true }).click();

  const line = page.locator(LINE);
  await expect(line).toBeVisible();
  await expect(line).toHaveAttribute("data-cause", EMPTY_GENERATION_CAUSE.outputLimit);
  await expect(line).toContainText(`${SWIPE_FAILED_LEAD} ${reason}`);
  await expect(line.getByRole("button", { name: OPEN_PARAMS_NAME, exact: true })).toBeVisible();
  await expect(page.locator(TOAST)).toHaveCount(0);
});
