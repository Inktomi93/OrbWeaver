// Full-stack room reads, multiplexed attachment and bus-driven rename reconciliation.
// Ordinary tRPC queries and mutations share JSON POST batches; the tab's SSE socket is separate.

import type { streamAttachInputSchema } from "@orb/contracts/stream";
import { isPlainObject } from "@orb/kit/guards";
import type { ChatId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId, typeIdSchema } from "@orb/kit/ids";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { openChatByTitle, renameOpenChat } from "./support/chat-room.ts";
import type { StreamTap } from "./support/stream-tap.ts";
import { chatFrameTypes, tapStream, waitForRoomOpened } from "./support/stream-tap.ts";
import { WAIT_SHORT_MS, WAIT_UI_MS } from "./support/timeouts.ts";
import { deleteChat, listCharacters, startChat, trpc } from "./support/trpc.ts";

const POST_METHOD = "POST";
const POST_REQUEST = `→ ${POST_METHOD}`;
const TRPC_PREFIX = "/api/trpc/";
const OK_RESPONSE = "← 200";
const GET_CHAT = "chat.getChat";
const LIST_CHATS = "chat.listChats";
const LIST_MESSAGES = "chat.listMessages";
const ATTACH = "stream.attach";
const CONNECT = "stream.connect";
const UPDATE_TITLE = "chat.updateTitle";
const CHAT_UPDATED = "chatUpdated";

interface TimelineEntry {
  readonly phase: string;
  readonly procedure: string;
  readonly chatId?: ChatId;
  readonly batchSize?: number;
}

// Seed a uniquely titled chat through the API, open it through the Chats list, and wait for the server's
// `chatOpened` frame for THAT chat: attaching any other room leaves this wait unmet.
async function openSeededRoom(page: Page, tap: StreamTap): Promise<ChatId> {
  const characterId = (await listCharacters())[0]?.id;
  if (characterId === undefined) {
    throw new Error("global-setup seeds a character on every stack");
  }
  const chatId = await startChat([characterId]);
  const title = `e2e-seq-open-${Date.now()}`;
  await trpc.chat.updateTitle.mutate({ chatId, title });
  const since = tap.chatFrames.length;
  await openChatByTitle(page, title);
  await waitForRoomOpened(tap, chatId, since);
  return chatId;
}

// The recorder observes the client's raw batch body, so each input stays unknown until one field is read.
function inputChatId(procedure: string, input: unknown): ChatId | undefined {
  if (!isPlainObject(input)) {
    return undefined;
  }
  if (procedure === ATTACH) {
    const ref = input["ref"];
    return isPlainObject(ref) && ref["channel"] === "chat" ? typeIdSchema(ID_PREFIX.chat).parse(ref["chatId"]) : undefined;
  }
  if ((procedure === GET_CHAT || procedure === LIST_MESSAGES || procedure === UPDATE_TITLE) && "chatId" in input) {
    return typeIdSchema(ID_PREFIX.chat).parse(input["chatId"]);
  }
  return undefined;
}

// A batch body is index-keyed; an array-shaped body is read by the same index rather than dropped.
function batchInput(inputs: unknown, index: number): unknown {
  if (Array.isArray(inputs)) {
    const entries: readonly unknown[] = inputs;
    return entries[index];
  }
  return isPlainObject(inputs) ? inputs[String(index)] : undefined;
}

function batchEntries(phase: string, method: string, procedures: readonly string[], postData: string | null): readonly TimelineEntry[] {
  const inputs: unknown = method === POST_METHOD && postData !== null ? JSON.parse(postData) : undefined;
  return procedures.map((procedure, index) => {
    const chatId = inputChatId(procedure, batchInput(inputs, index));
    return { phase, procedure, batchSize: procedures.length, ...(chatId === undefined ? {} : { chatId }) };
  });
}

function captureTimeline(page: Page): TimelineEntry[] {
  const timeline: TimelineEntry[] = [];
  const proceduresOf = (url: string): readonly string[] => new URL(url).pathname.split(TRPC_PREFIX)[1]?.split(",") ?? [];
  page.on("request", (request) => {
    if (request.url().includes(TRPC_PREFIX)) {
      timeline.push(...batchEntries(`→ ${request.method()}`, request.method(), proceduresOf(request.url()), request.postData()));
    }
  });
  page.on("response", (response) => {
    if (response.url().includes(TRPC_PREFIX)) {
      const request = response.request();
      timeline.push(...batchEntries(`← ${response.status()}`, request.method(), proceduresOf(response.url()), request.postData()));
    }
  });
  return timeline;
}

function expectInOrder(timeline: readonly TimelineEntry[], steps: readonly TimelineEntry[]): void {
  let i = 0;
  for (const entry of timeline) {
    const step = steps[i];
    if (step !== undefined && entry.phase === step.phase && entry.procedure === step.procedure && (step.chatId === undefined || entry.chatId === step.chatId)) {
      i += 1;
    }
    if (i === steps.length) {
      return;
    }
  }
  const labels = (entries: readonly TimelineEntry[]): string => entries.map((entry) => `${entry.phase} ${entry.procedure} ${entry.chatId ?? ""}`).join("\n  ");
  throw new Error(`Sequence not satisfied. Wanted in order:\n  ${labels(steps)}\nGot:\n  ${labels(timeline)}`);
}

test.describe("order-of-operations", () => {
  test("sequence matching accepts reordered batches but rejects wrong procedures, transport and order", () => {
    const request = { phase: POST_REQUEST, procedure: GET_CHAT };
    const response = { phase: OK_RESPONSE, procedure: GET_CHAT };
    expectInOrder([...batchEntries(POST_REQUEST, POST_METHOD, [LIST_CHATS, GET_CHAT], null), response], [request, response]);
    expect(() => expectInOrder([{ phase: POST_REQUEST, procedure: LIST_CHATS }, response], [request, response])).toThrow("Sequence not satisfied");
    expect(() => expectInOrder([{ phase: POST_REQUEST, procedure: `${GET_CHAT}Lineage` }, response], [request, response])).toThrow("Sequence not satisfied");
    expect(() => expectInOrder([{ phase: "→ GET", procedure: GET_CHAT }, response], [request, response])).toThrow("Sequence not satisfied");
    expect(() => expectInOrder([response, request], [request, response])).toThrow("Sequence not satisfied");

    const roomId = mintTypeId(ID_PREFIX.chat);
    const otherRoomId = mintTypeId(ID_PREFIX.chat);
    const roomAttach = { phase: POST_REQUEST, procedure: ATTACH, chatId: roomId };
    const batch = [GET_CHAT, LIST_MESSAGES, ATTACH];
    const extract = (ref: ReturnType<typeof streamAttachInputSchema.parse>["ref"]): readonly TimelineEntry[] =>
      batchEntries(
        POST_REQUEST,
        POST_METHOD,
        batch,
        JSON.stringify({
          0: { chatId: roomId },
          1: { chatId: roomId },
          2: { ref },
        }),
      );
    expect(() => expectInOrder(extract({ channel: "notifications" }), [roomAttach])).toThrow("Sequence not satisfied");
    // These controls traverse the real indexed extractor, not a hand-built timeline projection.
    expectInOrder(extract({ channel: "chat", chatId: roomId }), [roomAttach]);
    expect(() => expectInOrder(extract({ channel: "chat", chatId: otherRoomId }), [roomAttach])).toThrow("Sequence not satisfied");
    const wrongReads = batchEntries(
      POST_REQUEST,
      POST_METHOD,
      batch,
      JSON.stringify({
        0: { chatId: otherRoomId },
        1: { chatId: otherRoomId },
        2: { ref: { channel: "chat", chatId: roomId } },
      }),
    );
    for (const procedure of [GET_CHAT, LIST_MESSAGES]) {
      expect(() => expectInOrder(wrongReads, [{ phase: POST_REQUEST, procedure, chatId: roomId }])).toThrow("Sequence not satisfied");
    }
  });

  test("opening a chat reads its room and attaches on the ONE POST socket", async ({ page }) => {
    const tap = await tapStream(page);
    const timeline = captureTimeline(page);
    const roomId = await openSeededRoom(page, tap);
    try {
      // Mount reads and room attachment dispatch concurrently; each must complete, not win a race.
      await expect(() => {
        for (const procedure of [GET_CHAT, LIST_MESSAGES, ATTACH]) {
          expectInOrder(timeline, [
            { phase: POST_REQUEST, procedure, chatId: roomId },
            { phase: OK_RESPONSE, procedure, chatId: roomId },
          ]);
        }
        const socketRequests = timeline.filter((entry) => entry.phase.startsWith("→ ") && entry.procedure === CONNECT);
        expect(socketRequests.length).toBeGreaterThanOrEqual(1);
        expect(socketRequests.every((entry) => entry.phase === POST_REQUEST && entry.batchSize === 1)).toBe(true);
        // StrictMode can cancel a start, but only one socket may successfully open.
        expect(timeline.filter((entry) => entry.phase === OK_RESPONSE && entry.procedure === CONNECT)).toHaveLength(1);
      }).toPass({ timeout: WAIT_UI_MS });
    } finally {
      await deleteChat(roomId);
    }
  });

  // A rename also emits `chatsChanged` on the user room, which alone refetches the room and list reads, so the
  // refetch order cannot prove chat-room delivery. The `chatUpdated` frame on the chat room's own stream does.
  test("rename → POST updateTitle → chatUpdated frame on the room's stream → POST room/list refetch", async ({ page }) => {
    const tap = await tapStream(page);
    const timeline = captureTimeline(page);
    const roomId = await openSeededRoom(page, tap);
    try {
      const framesBefore = tap.chatFrames.length;
      const newTitle = `e2e-seq-${Date.now()}`;
      await renameOpenChat(page, newTitle);
      await expect(page.getByText(newTitle).first()).toBeVisible({ timeout: WAIT_SHORT_MS });
      await expect.poll(() => chatFrameTypes(tap, roomId, framesBefore), { timeout: WAIT_UI_MS }).toContain(CHAT_UPDATED);

      await expect(() => {
        expectInOrder(timeline, [
          { phase: POST_REQUEST, procedure: UPDATE_TITLE, chatId: roomId },
          { phase: OK_RESPONSE, procedure: UPDATE_TITLE, chatId: roomId },
        ]);
        // Only the room's `chatUpdated` refetches the transcript read, so this proves the client handled the
        // frame, not just that the server sent it (the user room's `chatsChanged` refetches the other two).
        expectInOrder(timeline, [
          { phase: POST_REQUEST, procedure: UPDATE_TITLE, chatId: roomId },
          { phase: POST_REQUEST, procedure: LIST_MESSAGES, chatId: roomId },
          { phase: OK_RESPONSE, procedure: LIST_MESSAGES, chatId: roomId },
        ]);
        // SSE delivery and the mutation response travel independently; neither must arrive first.
        for (const procedure of [GET_CHAT, LIST_CHATS]) {
          expectInOrder(timeline, [
            { phase: POST_REQUEST, procedure: UPDATE_TITLE, chatId: roomId },
            { phase: POST_REQUEST, procedure, ...(procedure === GET_CHAT ? { chatId: roomId } : {}) },
            { phase: OK_RESPONSE, procedure, ...(procedure === GET_CHAT ? { chatId: roomId } : {}) },
          ]);
        }
      }).toPass({ timeout: WAIT_UI_MS });
    } finally {
      await deleteChat(roomId);
    }
  });
});
