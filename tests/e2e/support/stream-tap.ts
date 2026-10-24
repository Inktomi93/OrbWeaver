// Observes the tab's ONE live stream (`stream.connect`, a POST event-stream, not a WebSocket) on the wire, so a
// spec waits on what the server really delivered instead of reading a client handle. Chromium's
// `Network.streamResourceContent` makes the streaming response's chunks arrive with their bytes; the tap
// decodes the SSE messages and keeps each data frame's routing fields. Install it BEFORE the first navigation:
// the connect request opens at boot and bytes sent earlier than the tap are not replayed.

import { isPlainObject } from "@orb/kit/guards";
import type { ChatId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { WAIT_SURFACE_MS } from "./timeouts.ts";

const CONNECT_PATH = "/api/trpc/stream.connect";
const CHAT_CHANNEL = "chat";
const CHAT_OPENED = "chatOpened";
const SSE_MESSAGE_BREAK = /\r?\n\r?\n/u;
const SSE_DATA_PREFIX = /^data: ?/u;
const SSE_LINE_BREAK = /\r?\n/u;
const chatIdSchema = typeIdSchema(ID_PREFIX.chat);

/** One chat-room data frame as delivered on the stream. */
export interface ChatWireFrame {
  readonly chatId: ChatId;
  readonly type: string;
}

export interface StreamTap {
  /** Chat-room frames in arrival order across every connection the tab opened. */
  readonly chatFrames: readonly ChatWireFrame[];
}

interface DataReceived {
  readonly requestId: string;
  readonly data?: string;
}

const taps = new WeakMap<Page, StreamTap>();

function chatFrameOf(message: string): ChatWireFrame | undefined {
  const data = message
    .split(SSE_LINE_BREAK)
    .filter((line) => SSE_DATA_PREFIX.test(line))
    .map((line) => line.replace(SSE_DATA_PREFIX, ""))
    .join("\n");
  if (data === "") {
    return undefined;
  }
  const envelope: unknown = JSON.parse(data);
  // A tracked event rides the wire as `{ id, data }`; an untracked one is the frame itself.
  const parsed = isPlainObject(envelope) && isPlainObject(envelope["data"]) ? envelope["data"] : envelope;
  if (!isPlainObject(parsed) || parsed["channel"] !== CHAT_CHANNEL || !isPlainObject(parsed["event"])) {
    return undefined;
  }
  const chatId = chatIdSchema.safeParse(parsed["chatId"]);
  const type = parsed["event"]["type"];
  return chatId.success && typeof type === "string" ? { chatId: chatId.data, type } : undefined;
}

/** Start observing the page's live stream. Call once per page, before its first navigation. */
export async function tapStream(page: Page): Promise<StreamTap> {
  const frames: ChatWireFrame[] = [];
  const cdp = await page.context().newCDPSession(page);
  const decoders = new Map<string, { readonly decoder: TextDecoder; text: string }>();
  const feed = (requestId: string, base64: string): void => {
    const stream = decoders.get(requestId);
    if (stream === undefined) {
      return;
    }
    stream.text += stream.decoder.decode(Buffer.from(base64, "base64"), { stream: true });
    const messages = stream.text.split(SSE_MESSAGE_BREAK);
    stream.text = messages.pop() ?? "";
    for (const message of messages) {
      const frame = chatFrameOf(message);
      if (frame !== undefined) {
        frames.push(frame);
      }
    }
  };
  cdp.on("Network.responseReceived", (event) => {
    if (!event.response.url.includes(CONNECT_PATH)) {
      return;
    }
    decoders.set(event.requestId, { decoder: new TextDecoder(), text: "" });
    // A failed start (the page closed mid-request) leaves the stream unobserved; the waiting spec then times out.
    cdp
      .send("Network.streamResourceContent", { requestId: event.requestId })
      .then((started) => feed(event.requestId, started.bufferedData))
      .catch(() => undefined);
  });
  cdp.on("Network.dataReceived", (event: DataReceived) => {
    if (event.data !== undefined) {
      feed(event.requestId, event.data);
    }
  });
  await cdp.send("Network.enable");
  const tap: StreamTap = { chatFrames: frames };
  taps.set(page, tap);
  return tap;
}

/** The tap installed on this page. */
export function streamTapOf(page: Page): StreamTap {
  const tap = taps.get(page);
  if (tap === undefined) {
    throw new Error("tapStream(page) must run before the page's first navigation");
  }
  return tap;
}

/** The types of one room's chat frames delivered since frame index `since`, in order. */
export function chatFrameTypes(tap: StreamTap, chatId: ChatId, since = 0): readonly string[] {
  return tap.chatFrames.slice(since).flatMap((frame) => (frame.chatId === chatId ? [frame.type] : []));
}

/** The cursor to pass as `since`: take it before the action that opens the room, so an earlier attach of the
 *  same chat on this page cannot satisfy the wait. */
export function frameCursor(page: Page): number {
  return streamTapOf(page).chatFrames.length;
}

/** Wait until the server has delivered the room's `chatOpened` frame at or after frame index `since`. */
export async function waitForRoomOpened(tap: StreamTap, chatId: ChatId, since: number): Promise<void> {
  await expect.poll(() => chatFrameTypes(tap, chatId, since), { timeout: WAIT_SURFACE_MS }).toContain(CHAT_OPENED);
}
