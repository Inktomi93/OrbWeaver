// Production client/native subscription link/adapter over real loopback HTTP and the real appRouter.
// Generation is injected; these are transport lifetime/replay proofs, not provider/domain execution proofs.
import "../../../support/composed-real.ts";
import { once } from "node:events";
import type { ServerResponse } from "node:http";
import { createServer } from "node:http";
import { join } from "node:path";
import { createTrpcClient, PostEventSource } from "@orb/client/data";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import type { ChatService } from "@orb/server/domain/chat";
import { createCas } from "@orb/server/infra/storage";
import { vi } from "vitest";
import { createApp } from "../../../../packages/server/src/entry/app.ts";
import { principal } from "../../../server/transport/trpc/_support.ts";
import { expect, OWNER_USER_ID, test } from "../../../support/fixtures.ts";

const CASES = [
  { mode: "partial-eof", generations: 1, requests: 1, idleBounds: 0, liveCells: 0, received: ["partial draft"] },
  { mode: "partial-drop", generations: 1, requests: 1, idleBounds: 0, liveCells: 0, received: ["partial draft"] },
  { mode: "transient-http", generations: 1, requests: 1, idleBounds: 0, liveCells: 0, received: [] },
  { mode: "resume-rejected", generations: 0, requests: 1, idleBounds: 0, liveCells: 0, received: [] },
  { mode: "live", generations: 1, requests: 1, idleBounds: 1, liveCells: 0, received: ["partial draft"] },
  { mode: "idle-expiry", generations: 1, requests: 1, idleBounds: 1, liveCells: 0, received: ["partial draft"] },
  { mode: "multiplex", generations: 0, requests: 2, idleBounds: 1, liveCells: 1, received: [] },
] as const;

for (const { mode, ...expected } of CASES) {
  test(`native stream lifetime and non-replay policy (${mode})`, async ({ app, db, clock, importStagingDir }) => {
    let generations = 0;
    let requests = 0;
    let closedSockets = 0;
    let activeRequests = 0;
    let peakRequests = 0;
    let socketFrames = 0;
    let liveCells = 0;
    const reconnected = Promise.withResolvers<void>();
    const partial = Promise.withResolvers<void>();
    const ended = Promise.withResolvers<void>();
    const cancelled = Promise.withResolvers<void>();
    const socketClosed = Promise.withResolvers<void>();
    const handlerFailure = Promise.withResolvers<never>();
    const impersonateStream: ChatService["impersonateStream"] = async function* ({ signal }) {
      if (signal === undefined) {
        throw new Error("the mounted subscription must supply its cancellation signal");
      }
      generations += 1;
      if (generations > 1) {
        handlerFailure.reject(new Error(`generation invoked ${generations} times for one subscription`));
      }
      const stopped = new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
      try {
        yield { delta: "partial draft" };
        await stopped;
      } finally {
        cancelled.resolve();
      }
    };
    const mounted = createApp({
      now: clock.now,
      db,
      seam: {
        resolvePrincipal: () => Promise.resolve({ principal: principal("user", { userId: OWNER_USER_ID }), sessionId: null, csrfHeaderPresent: false }),
        debugGateAdmits: () => false,
      },
      services: { ...app.services, chat: { ...app.services.chat, impersonateStream } },
      rateLimit: { enforce: () => Promise.resolve() },
      presence: { connect: () => undefined, read: (userId) => ({ userId, online: true, lastSeenAt: null }) },
      sockets: app.sockets,
      assets: app.assets,
      cas: createCas(join(importStagingDir, "unhit-cas")),
      character: app.services.character,
      portability: app.portability,
      settleImportMemory: app.settleImportMemory,
      importWorldInfo: app.importWorldInfo,
      importCardScripts: app.importCardScripts,
      exportService: app.exportService,
      sessions: app.sessions,
      isShuttingDown: () => false,
      credentialsKeyOk: () => true,
      inContainer: false,
      relayHosts: () => [],
      shareState: () => ({ state: "off" }),
      seedUserCharacters: () => undefined,
      oidcProviderName: "fixture",
    });
    async function handlePartial(response: ServerResponse, abort: AbortController): Promise<boolean> {
      if (mode === "multiplex") {
        if (requests > 1) {
          return false;
        }
        await partial.promise;
        response.destroy();
        return true;
      }
      if (mode === "transient-http") {
        // The router already invoked generation; the relay loses its response and answers 503.
        abort.abort();
        response.writeHead(503, { "retry-after": "0", "content-type": "text/plain" });
        response.end("temporarily unavailable");
        return true;
      }
      if (mode === "live" || mode === "idle-expiry") {
        return false;
      }
      await partial.promise;
      if (mode === "partial-drop") {
        response.destroy();
      } else {
        response.end();
      }
      return true;
    }
    async function streamResponse(result: Response, response: ServerResponse, abort: AbortController): Promise<void> {
      const reader = result.body?.getReader();
      if (reader === undefined) {
        throw new Error("expected SSE response body");
      }
      startResponse(result, response);
      const decoder = new TextDecoder();
      let frame = "";
      try {
        for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
          const text = decoder.decode(chunk.value);
          frame += text;
          forwardChunk(response, chunk.value);
          if (!frame.includes("\n\n")) {
            continue;
          }
          const hasPartial = frame.includes(mode === "multiplex" ? "serverReady" : "partial draft");
          frame = "";
          if (hasPartial && (await handlePartial(response, abort))) {
            return;
          }
        }
      } finally {
        abort.abort();
        await reader.cancel();
        reader.releaseLock();
      }
    }
    function startResponse(result: Response, response: ServerResponse): void {
      if (mode === "transient-http") {
        return;
      }
      response.writeHead(result.status, Object.fromEntries(result.headers));
      if (mode === "multiplex") {
        response.write("retry: 100\n");
      }
    }
    function forwardChunk(response: ServerResponse, chunk: Uint8Array): void {
      if (mode !== "transient-http") {
        response.write(chunk);
      }
    }
    const server = createServer((request, response) => {
      requests += 1;
      activeRequests += 1;
      peakRequests = Math.max(peakRequests, activeRequests);
      const abort = new AbortController();
      response.on("close", () => {
        closedSockets += 1;
        activeRequests -= 1;
        abort.abort();
        if (closedSockets === (mode === "multiplex" ? 2 : 1)) {
          socketClosed.resolve();
        }
      });
      void (async (): Promise<void> => {
        const chunks: Buffer[] = [];
        for await (const chunk of request) {
          if (!Buffer.isBuffer(chunk)) {
            throw new Error("expected HTTP bytes");
          }
          chunks.push(chunk);
        }
        const result = await mounted.fetch(
          new Request(`http://127.0.0.1${request.url}`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              accept: "text/event-stream",
              "x-orb-csrf": "1",
              ...(mode === "resume-rejected" ? { "last-event-id": "0" } : {}),
            },
            body: Buffer.concat(chunks).toString("utf8"),
            signal: abort.signal,
          }),
          { incoming: request },
        );
        await streamResponse(result, response, abort);
      })().catch((error: Error) => {
        // A disconnected HTTP writer has no remaining consumer; any fault while live fails the test.
        if (!response.destroyed) {
          handlerFailure.reject(error);
          response.destroy();
        }
      });
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("expected loopback listener");
    }
    const timers = vi.spyOn(globalThis, "setTimeout");
    const clearedTimers = vi.spyOn(globalThis, "clearTimeout");
    const networkBodies: ReadableStream<Uint8Array>[] = [];
    const nativeFetch = globalThis.fetch.bind(globalThis);
    const fetchObserver = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init): Promise<Response> => {
      const answer = await nativeFetch(input, init);
      if (answer.body !== null) {
        networkBodies.push(answer.body);
      }
      return answer;
    });
    let idleBounds = 0;
    let remainingIdleBounds = 0;
    let eventSource: PostEventSource | undefined;
    function fireIdleDeadline(): void {
      const cleared = new Set(clearedTimers.mock.calls.map(([id]) => id));
      const idleCallback = timers.mock.calls.find(
        (call, index) => call[1] === 45_000 && timers.mock.results[index]?.type === "return" && !cleared.has(timers.mock.results[index]?.value),
      )?.[0];
      if (idleCallback === undefined) {
        throw new Error("the native live stream has no owned inactivity deadline");
      }
      idleCallback();
    }
    const client = createTrpcClient(`http://127.0.0.1:${address.port}/api/trpc`);
    const received: string[] = [];
    const handle =
      mode === "multiplex"
        ? client.stream.connect.subscribe(
            { socketId: "socket_native_reconnect" },
            {
              onStarted: ({ context }) => {
                const source = context?.["eventSource"];
                if (source instanceof PostEventSource) {
                  eventSource = source;
                }
              },
              onData: (envelope) => {
                const payload = envelope.data;
                if (!("__subscriptionError" in payload) && payload.channel === "control" && payload.type === "serverReady") {
                  socketFrames += 1;
                  partial.resolve();
                  if (socketFrames === 2) {
                    reconnected.resolve();
                  }
                }
              },
              onError: (error) => handlerFailure.reject(error),
            },
          )
        : client.chat.impersonateStream.subscribe(
            { chatId: mintTypeId(ID_PREFIX.chat), timeZone: UTC_TIME_ZONE },
            {
              onStarted: ({ context }) => {
                const source = context?.["eventSource"];
                if (source instanceof PostEventSource) {
                  eventSource = source;
                }
              },
              onData: (envelope) => {
                if ("delta" in envelope.data) {
                  received.push(envelope.data.delta);
                  partial.resolve();
                }
              },
              onError: () => ended.resolve(),
            },
          );
    try {
      if (mode === "live" || mode === "idle-expiry" || mode === "multiplex") {
        await Promise.race([mode === "multiplex" ? reconnected.promise : partial.promise, handlerFailure.promise]);
        await new Promise<void>((resolve) => setImmediate(resolve));
        // One adapter-owned idle bound, not a second native watchdog that can recreate EventSource.
        const cleared = new Set(clearedTimers.mock.calls.map(([id]) => id));
        idleBounds = timers.mock.results.filter(
          (result, index) => timers.mock.calls[index]?.[1] === 45_000 && result.type === "return" && !cleared.has(result.value),
        ).length;
        liveCells = app.sockets.liveSocketCount(OWNER_USER_ID);
        if (mode === "idle-expiry") {
          fireIdleDeadline();
          await Promise.race([ended.promise, handlerFailure.promise]);
        } else {
          eventSource?.close();
        }
        const afterClose = new Set(clearedTimers.mock.calls.map(([id]) => id));
        remainingIdleBounds = timers.mock.results.filter(
          (result, index) => timers.mock.calls[index]?.[1] === 45_000 && result.type === "return" && !afterClose.has(result.value),
        ).length;
        handle.unsubscribe();
      } else {
        await Promise.race([ended.promise, handlerFailure.promise]);
      }
      await Promise.race([expected.generations === 0 ? Promise.resolve() : cancelled.promise, handlerFailure.promise]);
      await socketClosed.promise;
      await vi.waitFor(() => expect(app.sockets.liveSocketCount(OWNER_USER_ID)).toBe(0));
      expect(generations).toBe(expected.generations);
      expect(idleBounds).toBe(expected.idleBounds);
      expect(remainingIdleBounds).toBe(0);
      expect(networkBodies).toHaveLength(expected.requests);
      expect(networkBodies.map((body) => body.locked)).toEqual(Array.from({ length: expected.requests }, () => false));
      expect(liveCells).toBe(expected.liveCells);
      expect(requests).toBe(expected.requests);
      expect(closedSockets).toBe(expected.requests);
      expect(peakRequests).toBe(1);
      expect(received).toEqual(expected.received);
    } finally {
      handle.unsubscribe();
      timers.mockRestore();
      clearedTimers.mockRestore();
      fetchObserver.mockRestore();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => (error === undefined ? resolve() : reject(error))));
    }
  });
}
