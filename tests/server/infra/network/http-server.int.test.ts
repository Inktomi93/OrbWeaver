import "@orb/testkit/node/composed-real.ts";
import { request as nodeRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { drainHttpServer, joinNativeHttpRequest, serveHttpServer } from "@orb/server/infra/network";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

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

test("an unexpected native stream fault remains visible when owned cancellation races its error delivery", async () => {
  await using lifetime = new AsyncDisposableStack();
  const stop = new AbortController();
  const failure = new Error("controlled unexpected incoming-stream failure");
  const listening = Promise.withResolvers<AddressInfo>();
  const joined = Promise.withResolvers<PromiseSettledResult<void>[]>();
  let physicallyClosed = false;
  const server = serveHttpServer(
    {
      hostname: "127.0.0.1",
      port: 0,
      fetch: async (_input, bindings) => {
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
    expect(result).toEqual([{ status: "rejected", reason: new AggregateError([failure], "native HTTP stream completion failed") }]);
    expect(await clientError.promise).toMatchObject({ code: "ECONNRESET" });
  } finally {
    stop.abort();
    outgoing.destroy();
    await clientClosed.promise;
    await joined.promise;
  }
});
