// The public tRPC client owns the adapter; only its HTTP response and native clock are controlled here.

import { once } from "node:events";
import type { IncomingHttpHeaders } from "node:http";
import { createServer } from "node:http";
import { text } from "node:stream/consumers";
import type { TrpcReadError } from "@orb/client/data";
import { createTrpcClient } from "@orb/client/data";
import type { ImpersonateStreamDelta } from "@orb/contracts/chat";
import { CSRF_HEADER } from "@orb/contracts/identity";
import type { StreamFrame } from "@orb/contracts/stream";
import { STREAM_INACTIVITY_TIMEOUT_MS, streamConnectInputSchema } from "@orb/contracts/stream";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { createSeededIds, FIXTURE_ID_CURSOR } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { TRPCClientError } from "@trpc/client";
import { afterEach, vi } from "vitest";
import { impersonateStreamDeltaSchema } from "#contracts/chat/impersonation.ts";

const ids = createSeededIds(FIXTURE_ID_CURSOR);
const INPUT = streamConnectInputSchema.parse({ socketId: ids.uuid() });
const CHAT_ID = mintTypeId(ID_PREFIX.chat, ids.next);
const CLIENT_URL = "http://127.0.0.1:1/api/trpc";
const SSE_HEADERS = { "content-type": "text/event-stream" };
const CONNECTED = "event: connected\ndata: {}\nretry: 100\n\n";
const RETURN = "event: return\ndata: \n\n";
const FIRST: StreamFrame = { channel: "control", type: "serverReady", serverInstanceId: "first-雪" };
const SECOND: StreamFrame = { channel: "control", type: "serverReady", serverInstanceId: "second" };
const DELTA = impersonateStreamDeltaSchema.parse({ delta: "A partial draft." });
const encoder = new TextEncoder();

function tracked(id: string, data: StreamFrame | ImpersonateStreamDelta): string {
  return `id: ${id}\ndata: ${JSON.stringify(data)}\n\n`;
}

function scriptFetch(answer: (request: Request, attempt: number) => Response | Promise<Response>): Request[] {
  const requests: Request[] = [];
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    requests.push(request);
    return Promise.resolve(answer(request, requests.length));
  });
  return requests;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("native POST subscriptions preserve input and CSRF, resume only committed frames, and finish on return", async () => {
  const posts: { readonly url: string; readonly method: string | undefined; readonly headers: IncomingHttpHeaders; readonly body: string }[] = [];
  const failed = Promise.withResolvers<never>();
  const completed = Promise.withResolvers<void>();
  const received: StreamFrame[] = [];
  const server = createServer((request, response) => {
    text(request)
      .then((body) => {
        posts.push({ url: request.url ?? "", method: request.method, headers: request.headers, body });
        response.writeHead(200, SSE_HEADERS);
        if (posts.length === 1) {
          response.write(`\ufeff${CONNECTED.replaceAll("\n", "\r\n")}`);
          response.write(`: comment\r\nid: 7\r\ndata: ${JSON.stringify(FIRST).replace(",", ",\r\ndata: ")}\r\n\r\nid: 999\ndata: `);
          response.end(new Uint8Array([0xe7, 0x95]));
        } else {
          response.end(`${CONNECTED}${tracked("8", SECOND)}${RETURN}`);
        }
      })
      .catch(failed.reject);
  });
  server.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("the native SSE fixture has no loopback address");
    }
    const client = createTrpcClient(`http://127.0.0.1:${address.port}/api/trpc?transportMarker=kept`);
    const subscription = client.stream.connect.subscribe(INPUT, {
      onData: (packet) => {
        if ("__subscriptionError" in packet.data) {
          failed.reject(new Error(packet.data.message));
          return;
        }
        received.push(packet.data);
      },
      onError: failed.reject,
      onComplete: completed.resolve,
    });
    try {
      await Promise.race([completed.promise, failed.promise]);
      expect(received).toEqual([FIRST, SECOND]);
      expect(posts).toHaveLength(2);
      for (const post of posts) {
        const url = new URL(post.url, CLIENT_URL);
        expect(url.pathname).toBe("/api/trpc/stream.connect");
        expect(url.searchParams.has("input")).toBe(false);
        expect(url.searchParams.get("transportMarker")).toBe("kept");
        expect(post.method).toBe("POST");
        expect(post.headers[CSRF_HEADER]).toBe("1");
        expect(post.headers["content-type"]).toBe("application/json");
        expect(post.headers.accept).toBe("text/event-stream");
        expect(post.body).toBe(JSON.stringify(INPUT));
      }
      expect(posts.map((post) => post.headers["last-event-id"])).toEqual([undefined, "7"]);
    } finally {
      subscription.unsubscribe();
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => (error === undefined ? resolve() : reject(error))));
  }
});

test.for(["return", "eof", "http"] as const)("one-shot impersonation %s never starts another request", async (ending) => {
  const requests = scriptFetch(() =>
    ending === "http"
      ? new Response("unavailable", { status: 503 })
      : new Response(`${CONNECTED}${tracked("0", DELTA)}${ending === "return" ? RETURN : ""}`, { headers: SSE_HEADERS }),
  );
  const ended = Promise.withResolvers<void>();
  const received: string[] = [];
  const errors: string[] = [];
  const subscription = createTrpcClient(CLIENT_URL).chat.impersonateStream.subscribe(
    { chatId: CHAT_ID, timeZone: UTC_TIME_ZONE },
    {
      onData: (packet) => {
        if ("delta" in packet.data) {
          received.push(packet.data.delta);
        }
      },
      onComplete: ended.resolve,
      onError: (error) => {
        errors.push(error.message);
        ended.resolve();
      },
    },
  );
  try {
    await ended.promise;
    expect(received).toEqual(ending === "http" ? [] : [DELTA.delta]);
    expect(errors).toHaveLength(ending === "return" ? 0 : 1);
    expect(requests).toHaveLength(1);
  } finally {
    subscription.unsubscribe();
  }
});

test.for([
  { status: 401, contentType: "text/event-stream" },
  { status: 200, contentType: "application/json" },
])("HTTP $status with $contentType is a terminal subscription refusal", async ({ status, contentType }) => {
  const requests = scriptFetch(() => new Response("[]", { status, headers: { "content-type": contentType } }));
  const refused = Promise.withResolvers<TrpcReadError>();
  const received: StreamFrame[] = [];
  const subscription = createTrpcClient(CLIENT_URL).stream.connect.subscribe(INPUT, {
    onData: (packet) => {
      if (!("__subscriptionError" in packet.data)) {
        received.push(packet.data);
      }
    },
    onError: refused.resolve,
  });
  try {
    const error = await refused.promise;
    expect(error).toBeInstanceOf(TRPCClientError);
    expect(error.data).toBeUndefined();
    expect(error.shape).toBeUndefined();
    expect(received).toEqual([]);
    expect(requests).toHaveLength(1);
  } finally {
    subscription.unsubscribe();
  }
});

test("unsubscribe before late headers cancels the late body without starting or delivering", async () => {
  const requested = Promise.withResolvers<Request>();
  const late = Promise.withResolvers<Response>();
  const cancelled = Promise.withResolvers<void>();
  const requests = scriptFetch((request) => {
    requested.resolve(request);
    return late.promise;
  });
  let cancellations = 0;
  const body = new ReadableStream<Uint8Array>({
    cancel: () => {
      cancellations += 1;
      cancelled.resolve();
    },
  });
  const notifications: string[] = [];
  const subscription = createTrpcClient(CLIENT_URL).stream.connect.subscribe(INPUT, {
    onStarted: () => notifications.push("started"),
    onData: () => notifications.push("data"),
    onError: () => notifications.push("error"),
  });
  try {
    const request = await requested.promise;
    subscription.unsubscribe();
    expect(request.signal.aborted).toBe(true);
    late.resolve(new Response(body, { headers: SSE_HEADERS }));
    await cancelled.promise;
    expect(cancellations).toBe(1);
    expect(body.locked).toBe(false);
    expect(notifications).toEqual([]);
    expect(requests).toHaveLength(1);
  } finally {
    subscription.unsubscribe();
    late.resolve(new Response(null));
    await body.cancel();
  }
});

test("unsubscribe suppresses a queued late frame and releases the response reader", async () => {
  const ready = Promise.withResolvers<ReadableStreamDefaultController<Uint8Array>>();
  let cancellations = 0;
  const body = new ReadableStream<Uint8Array>({
    start: ready.resolve,
    cancel: () => {
      cancellations += 1;
    },
  });
  const controller = await ready.promise;
  controller.enqueue(encoder.encode(`${CONNECTED}${tracked("1", FIRST)}`));
  scriptFetch(() => new Response(body, { headers: SSE_HEADERS }));
  const delivered = Promise.withResolvers<void>();
  const received: StreamFrame[] = [];
  const subscription = createTrpcClient(CLIENT_URL).stream.connect.subscribe(INPUT, {
    onData: (packet) => {
      if (!("__subscriptionError" in packet.data)) {
        received.push(packet.data);
        delivered.resolve();
      }
    },
  });
  try {
    await delivered.promise;
    expect(received).toEqual([FIRST]);
    controller.enqueue(encoder.encode(tracked("2", SECOND)));
    subscription.unsubscribe();
    await vi.waitFor(() => expect(body.locked).toBe(false));
    expect(cancellations).toBe(1);
    expect(received).toEqual([FIRST]);
  } finally {
    subscription.unsubscribe();
    controller.error(new Error("the queued-frame fixture is closing"));
  }
});

test("the adapter owns inactivity and unsubscribe cancels both an idle reader and a pending retry", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const ready = Promise.withResolvers<ReadableStreamDefaultController<Uint8Array>>();
  let cancellations = 0;
  const body = new ReadableStream<Uint8Array>({
    start: ready.resolve,
    cancel: () => {
      cancellations += 1;
    },
  });
  const controller = await ready.promise;
  controller.enqueue(encoder.encode(`event: connected\ndata: {"reconnectAfterInactivityMs":1}\n\n${tracked("1", FIRST)}`));
  const requests = scriptFetch((_request, attempt) =>
    attempt === 1 ? new Response(body, { headers: SSE_HEADERS }) : new Response(CONNECTED, { headers: SSE_HEADERS }),
  );
  const client = createTrpcClient(CLIENT_URL);
  const delivered = Promise.withResolvers<void>();
  const subscription = client.stream.connect.subscribe(INPUT, { onData: () => delivered.resolve() });
  let retrying: ReturnType<typeof client.stream.connect.subscribe> | undefined;
  try {
    await delivered.promise;
    await vi.advanceTimersByTimeAsync(1);
    expect(requests).toHaveLength(1);
    subscription.unsubscribe();
    await vi.advanceTimersByTimeAsync(STREAM_INACTIVITY_TIMEOUT_MS);
    expect(requests[0]?.signal.aborted).toBe(true);
    expect(cancellations).toBe(1);
    expect(body.locked).toBe(false);

    const phases: string[] = [];
    const reconnecting = Promise.withResolvers<void>();
    retrying = client.stream.connect.subscribe(INPUT, {
      onStarted: () => phases.push("started"),
      onConnectionStateChange: (state) => {
        if (state.state === "connecting" && phases.includes("started")) {
          reconnecting.resolve();
        }
      },
    });
    await reconnecting.promise;
    retrying.unsubscribe();
    await vi.runAllTimersAsync();
    expect(requests).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    subscription.unsubscribe();
    retrying?.unsubscribe();
    controller.error(new Error("the inactivity fixture is closing"));
  }
});
