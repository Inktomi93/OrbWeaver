import type { IncomingMessage } from "node:http";
import { request as nodeRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { queryObjects } from "node:v8";
import { drainHttpServer, joinNativeHttpRequest, serveHttpServer } from "@orb/server/infra/network";
import { expect, test } from "@orb/testkit/node";

const HEADER = "x-native-proof";
const HEADER_VALUE = "public-field-normalization";
const BODY = "the actual incoming bytes";
const silentDrainLog = { warn: (): void => undefined };

test.each([
  { method: "POST", body: BODY, cloneMethod: "POST", bodyUsed: true },
  { method: "TRACE", body: "", cloneMethod: "GET", bodyUsed: false },
])(
  "the actual $method adapter preserves native brand, metadata, header iteration and requested clone bytes",
  async ({ method, body, cloneMethod, bodyUsed }) => {
    await using lifetime = new AsyncDisposableStack();
    const listening = Promise.withResolvers<AddressInfo>();
    const server = serveHttpServer(
      {
        hostname: "127.0.0.1",
        port: 0,
        fetch: async (input) => {
          const clone = Request.prototype.clone.call(input);
          const before = input.bodyUsed;
          const [original, copied] = await Promise.all([input.text(), clone.text()]);
          return Response.json({
            method: input.method,
            cloneMethod: clone.method,
            header: new Headers([...input.headers]).get(HEADER),
            body: [original, copied],
            before,
            after: input.bodyUsed,
            cache: input.cache,
            credentials: input.credentials,
            integrity: input.integrity,
            keepalive: input.keepalive,
            mode: input.mode,
            redirect: input.redirect,
            referrer: input.referrer,
            referrerPolicy: input.referrerPolicy,
            destination: input.destination,
          });
        },
      },
      listening.resolve,
    );
    lifetime.defer(() => drainHttpServer(server, silentDrainLog));
    const address = await listening.promise;
    const bytes = await new Promise<string>((resolve, reject) => {
      const outgoing = nodeRequest(`http://${address.address}:${address.port}/native`, { method, headers: { [HEADER]: HEADER_VALUE } }, (incoming) => {
        if (incoming.statusCode !== 200) {
          incoming.resume();
          reject(new Error(`native normalization returned HTTP ${incoming.statusCode}`));
          return;
        }
        incoming.setEncoding("utf8");
        let received = "";
        incoming.on("data", (chunk: string) => {
          received += chunk;
        });
        incoming.once("end", () => resolve(received));
        incoming.once("error", reject);
      });
      outgoing.once("error", reject);
      outgoing.end(body);
    });
    expect(bytes).toBe(
      JSON.stringify({
        method,
        cloneMethod,
        header: HEADER_VALUE,
        body: [body, body],
        before: false,
        after: bodyUsed,
        cache: "default",
        credentials: "same-origin",
        integrity: "",
        keepalive: false,
        mode: "cors",
        redirect: "follow",
        referrer: "about:client",
        referrerPolicy: "",
        destination: "",
      }),
    );
  },
);

test("owned physical cancellation aborts native clones and joins actual inbound and outbound close", async () => {
  await using lifetime = new AsyncDisposableStack();
  const stop = new AbortController();
  const listening = Promise.withResolvers<AddressInfo>();
  const entered = Promise.withResolvers<void>();
  const joined = Promise.withResolvers<Promise<void>>();
  const reads = Promise.withResolvers<PromiseSettledResult<string>[]>();
  let cloneSignal: AbortSignal | undefined;
  const server = serveHttpServer(
    {
      hostname: "127.0.0.1",
      port: 0,
      fetch: async (input, bindings) => {
        const clone = Request.prototype.clone.call(input);
        cloneSignal = clone.signal;
        const reading = Promise.allSettled([input.text(), clone.text()]);
        joined.resolve(joinNativeHttpRequest(bindings, stop.signal));
        entered.resolve();
        reads.resolve(await reading);
        return new Response("physical cancellation settled");
      },
    },
    listening.resolve,
  );
  lifetime.defer(() => drainHttpServer(server, silentDrainLog));
  const address = await listening.promise;
  const outgoing = nodeRequest(`http://${address.address}:${address.port}/held`, { method: "POST", headers: { "transfer-encoding": "chunked" } });
  const clientError = Promise.withResolvers<Error>();
  const clientClosed = Promise.withResolvers<void>();
  outgoing.once("error", clientError.resolve);
  outgoing.once("close", clientClosed.resolve);
  outgoing.write(BODY);
  try {
    await entered.promise;
    expect(cloneSignal?.aborted).toBe(false);
    stop.abort();
    await expect.poll(() => cloneSignal?.aborted).toBe(true);
    await joined.promise;
    await clientClosed.promise;
    expect(cloneSignal?.aborted).toBe(true);
    expect((await reads.promise).map((result) => result.status)).toEqual(["rejected", "rejected"]);
    expect(await clientError.promise).toMatchObject({ code: "ECONNRESET" });
  } finally {
    stop.abort();
    outgoing.destroy();
    await clientClosed.promise;
    await joined.promise;
    await reads.promise;
  }
});

test.each([false, true])(
  "a real peer SSE disconnect after request GC=%s aborts its actual signal and joins both native closes without a transport fault",
  async (collectRequest) => {
    await using lifetime = new AsyncDisposableStack();
    const listening = Promise.withResolvers<AddressInfo>();
    const joined = Promise.withResolvers<PromiseSettledResult<void>[]>();
    const cancelled = Promise.withResolvers<void>();
    const nativeErrors: Array<{
      readonly code: string | undefined;
      readonly signalAborted: boolean;
      readonly incomingDestroyed: boolean;
      readonly incomingComplete: boolean;
      readonly outgoingClosed: boolean;
    }> = [];
    const outgoingErrors: Error[] = [];
    let initiallyAborted: boolean | undefined;
    let requestSignal: AbortSignal | undefined;
    let normalizedRequest: WeakRef<Request> | undefined;
    let physicallyClosed = false;
    const server = serveHttpServer(
      {
        hostname: "127.0.0.1",
        port: 0,
        fetch: (input, bindings) => {
          // Retaining the Request in this observer would mask a lost abort controller at its owner.
          const signal = input.signal;
          initiallyAborted = signal.aborted;
          requestSignal = signal;
          normalizedRequest = new WeakRef(input);
          bindings.incoming.on("error", (error: NodeJS.ErrnoException) => {
            nativeErrors.push({
              code: error.code,
              signalAborted: signal.aborted,
              incomingDestroyed: bindings.incoming.destroyed,
              incomingComplete: bindings.incoming.complete,
              outgoingClosed: bindings.outgoing.closed,
            });
          });
          bindings.outgoing.on("error", (error: Error) => outgoingErrors.push(error));
          joined.resolve(
            Promise.allSettled([joinNativeHttpRequest(bindings, signal)]).then((result) => {
              physicallyClosed = bindings.incoming.closed && bindings.outgoing.closed;
              return result;
            }),
          );
          return new Response(
            new ReadableStream<Uint8Array>({
              start(controller): void {
                controller.enqueue(new TextEncoder().encode(`data: ${BODY}\n\n`));
              },
              cancel(): void {
                cancelled.resolve();
              },
            }),
            { headers: { "content-type": "text/event-stream" } },
          );
        },
      },
      listening.resolve,
    );
    lifetime.defer(() => drainHttpServer(server, silentDrainLog));
    const address = await listening.promise;
    const response = Promise.withResolvers<IncomingMessage>();
    const delivered = Promise.withResolvers<string>();
    const clientClosed = Promise.withResolvers<void>();
    const outgoing = nodeRequest(`http://${address.address}:${address.port}/events`, (received) => {
      response.resolve(received);
      received.setEncoding("utf8");
      received.once("data", delivered.resolve);
      received.once("close", clientClosed.resolve);
    });
    outgoing.end();
    const incoming = await response.promise;
    try {
      expect(await delivered.promise).toBe(`data: ${BODY}\n\n`);
      expect(initiallyAborted).toBe(false);
      if (collectRequest) {
        queryObjects(Request, { format: "count" });
      }
      incoming.destroy();
      const result = await joined.promise;
      await Promise.all([clientClosed.promise, cancelled.promise]);
      expect(physicallyClosed).toBe(true);
      expect(requestSignal?.aborted).toBe(true);
      expect(nativeErrors).toEqual([{ code: "ECONNRESET", signalAborted: true, incomingDestroyed: true, incomingComplete: true, outgoingClosed: true }]);
      expect(outgoingErrors).toEqual([]);
      expect(result).toEqual([{ status: "fulfilled", value: undefined }]);
      queryObjects(Request, { format: "count" });
      expect(normalizedRequest?.deref()).toBeUndefined();
    } finally {
      incoming.destroy();
      outgoing.destroy();
      await Promise.all([clientClosed.promise, joined.promise, cancelled.promise]);
    }
  },
);

test.each([undefined, "ECONNRESET"])(
  "an unexpected native stream fault with code %s remains visible when owned cancellation races its error delivery",
  async (code) => {
    await using lifetime = new AsyncDisposableStack();
    const stop = new AbortController();
    const failure = Object.assign(new Error("controlled unexpected incoming-stream failure"), { code });
    const listening = Promise.withResolvers<AddressInfo>();
    const joined = Promise.withResolvers<PromiseSettledResult<void>[]>();
    let physicallyClosed = false;
    let failedDuringAbort: boolean | undefined;
    let completeAtError: boolean | undefined;
    const server = serveHttpServer(
      {
        hostname: "127.0.0.1",
        port: 0,
        fetch: async (_input, bindings) => {
          bindings.incoming.once("error", () => {
            failedDuringAbort = stop.signal.aborted;
            completeAtError = bindings.incoming.complete;
          });
          const completion = Promise.allSettled([joinNativeHttpRequest(bindings, stop.signal)]);
          bindings.incoming.destroy(failure);
          stop.abort();
          joined.resolve(await completion);
          physicallyClosed = bindings.incoming.closed && bindings.outgoing.closed;
          return new Response("native fault joined");
        },
      },
      listening.resolve,
    );
    lifetime.defer(() => drainHttpServer(server, silentDrainLog));
    const address = await listening.promise;
    const clientClosed = Promise.withResolvers<void>();
    const clientError = Promise.withResolvers<Error>();
    const outgoing = nodeRequest(`http://${address.address}:${address.port}/fault`, { method: "POST", headers: { "transfer-encoding": "chunked" } });
    outgoing.once("error", clientError.resolve);
    outgoing.once("close", clientClosed.resolve);
    outgoing.write(BODY);
    try {
      const result = await joined.promise;
      await clientClosed.promise;
      expect(physicallyClosed).toBe(true);
      expect(failedDuringAbort).toBe(true);
      expect(completeAtError).toBe(false);
      expect(result).toEqual([{ status: "rejected", reason: new AggregateError([new Error(failure.message)], "native HTTP stream completion failed") }]);
      expect(await clientError.promise).toMatchObject({ code: "ECONNRESET" });
    } finally {
      stop.abort();
      outgoing.destroy();
      await clientClosed.promise;
      await joined.promise;
    }
  },
);
