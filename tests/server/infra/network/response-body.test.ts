import { createOwnedResponseBody } from "@orb/server/infra/network";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("abort joins actual upstream cancellation even with a consumer-locked body", async () => {
  const released = Promise.withResolvers<void>();
  const cancelStarted = Promise.withResolvers<unknown>();
  const events: string[] = [];
  const abort = new AbortController();
  const source = new Response(
    new ReadableStream<Uint8Array>({
      async cancel(reason: unknown): Promise<void> {
        events.push("cancel-started");
        cancelStarted.resolve(reason);
        await released.promise;
        events.push("cancel-finished");
      },
    }),
  );
  const owned = createOwnedResponseBody(source, abort.signal);
  const reader = owned.response.body?.getReader();
  if (reader === undefined) {
    throw new Error("owned streaming body is missing");
  }
  const settled = owned.settled.then(() => events.push("settled"));
  try {
    abort.abort();
    expect(await cancelStarted.promise).toBe(abort.signal.reason);
    expect(events).toEqual(["cancel-started"]);
    released.resolve();
    await settled;
    expect(events).toEqual(["cancel-started", "cancel-finished", "settled"]);
    await expect(reader.read()).rejects.toBe(abort.signal.reason);
  } finally {
    released.resolve();
    await owned.cancel();
    reader.releaseLock();
  }
});

test("an ignored body retains the actual cancellation rejection until cleanup has run", async () => {
  const released = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  const failure = new Error("physical upstream cancellation failed");
  const abort = new AbortController();
  const source = new Response(
    new ReadableStream<Uint8Array>({
      async cancel(): Promise<void> {
        started.resolve();
        await released.promise;
        throw failure;
      },
    }),
  );
  const owned = createOwnedResponseBody(source, abort.signal);
  const result = owned.settled.then(
    () => null,
    (error: unknown) => error,
  );
  try {
    abort.abort();
    await started.promise;
    released.resolve();
    expect(await result).toBe(failure);
    await expect(owned.response.text()).rejects.toBe(failure);
  } finally {
    released.resolve();
    await expect(owned.cancel()).rejects.toBe(failure);
  }
});

test("a pending read cannot settle ownership before upstream cancellation finishes", async () => {
  const released = Promise.withResolvers<void>();
  const readStarted = Promise.withResolvers<void>();
  const cancelStarted = Promise.withResolvers<void>();
  const abort = new AbortController();
  const source = new Response(
    new ReadableStream<Uint8Array>(
      {
        pull(): void {
          readStarted.resolve();
        },
        async cancel(): Promise<void> {
          cancelStarted.resolve();
          await released.promise;
        },
      },
      { highWaterMark: 0 },
    ),
  );
  const owned = createOwnedResponseBody(source, abort.signal);
  const reader = owned.response.body?.getReader();
  if (reader === undefined) {
    throw new Error("owned streaming body is missing");
  }
  let settled = false;
  const completion = owned.settled.then(() => {
    settled = true;
  });
  const reading = reader.read().then(
    () => null,
    (error: unknown) => error,
  );
  try {
    await readStarted.promise;
    abort.abort();
    await cancelStarted.promise;
    await Promise.resolve();
    expect(settled).toBe(false);
    released.resolve();
    await completion;
    expect(await reading).toBe(abort.signal.reason);
  } finally {
    released.resolve();
    await owned.cancel();
    reader.releaseLock();
  }
});

test("native clone consumption and independent headers survive the owned reader through EOF", async () => {
  const abort = new AbortController();
  const source = new Response("wire bytes", { status: 202, statusText: "Accepted", headers: { "x-marker": "original" } });
  const owned = createOwnedResponseBody(source, abort.signal);
  const clone = owned.response.clone();
  clone.headers.set("x-marker", "clone");
  expect(owned.response.headers.get("x-marker")).toBe("original");
  expect(owned.response.status).toBe(source.status);
  expect(owned.response.statusText).toBe(source.statusText);
  expect(owned.response.url).toBe(source.url);
  expect(owned.response.redirected).toBe(source.redirected);
  expect(owned.response.type).toBe(source.type);
  expect(owned.response.bodyUsed).toBe(false);
  expect(await clone.text()).toBe("wire bytes");
  expect(await owned.response.text()).toBe("wire bytes");
  expect(owned.response.bodyUsed).toBe(true);
  await owned.settled;
  abort.abort();
});

test("an upstream read error reaches the consumer but does not invent a cleanup failure", async () => {
  const failure = new Error("upstream body read failed");
  const abort = new AbortController();
  const source = new Response(
    new ReadableStream<Uint8Array>({
      pull(controller): void {
        controller.error(failure);
      },
    }),
  );
  const owned = createOwnedResponseBody(source, abort.signal);
  await expect(owned.response.text()).rejects.toBe(failure);
  await expect(owned.settled).resolves.toBeUndefined();
});

test("a genuine native fetch clone retains immutable headers and producer metadata", async () => {
  const source = await fetch("data:text/plain,wire%20bytes");
  const owned = createOwnedResponseBody(source, new AbortController().signal);
  const clone = owned.response.clone();
  expect(() => owned.response.headers.set("x-marker", "changed")).toThrow(TypeError);
  expect(() => clone.headers.set("x-marker", "changed")).toThrow(TypeError);
  expect(clone.url).toBe(source.url);
  expect(clone.type).toBe(source.type);
  expect(clone.redirected).toBe(source.redirected);
  expect(await clone.text()).toBe("wire bytes");
  expect(await owned.response.text()).toBe("wire bytes");
  await owned.settled;
});

test("outward locks and actual consumption refuse clone even before the lazy producer reader starts", async () => {
  const owned = createOwnedResponseBody(new Response("wire bytes"), new AbortController().signal);
  const reader = owned.response.body?.getReader();
  if (reader === undefined) {
    throw new Error("owned streaming body is missing");
  }
  try {
    expect(owned.response.bodyUsed).toBe(false);
    expect(() => owned.response.clone()).toThrow(TypeError);
  } finally {
    reader.releaseLock();
  }
  expect(await owned.response.text()).toBe("wire bytes");
  expect(owned.response.bodyUsed).toBe(true);
  expect(() => owned.response.clone()).toThrow(TypeError);
  await owned.settled;
});

test("native blob and form-data consumers honor current producer headers", async () => {
  const blobBody = createOwnedResponseBody(new Response("wire bytes", { headers: { "content-type": "text/plain" } }), new AbortController().signal);
  blobBody.response.headers.set("content-type", "image/png");
  expect((await blobBody.response.blob()).type).toBe("image/png");
  await blobBody.settled;
  const formBody = createOwnedResponseBody(new Response("a=one&b=two", { headers: { "content-type": "text/plain" } }), new AbortController().signal);
  formBody.response.headers.set("content-type", "application/x-www-form-urlencoded");
  expect([...(await formBody.response.formData())]).toEqual([
    ["a", "one"],
    ["b", "two"],
  ]);
  await formBody.settled;
});

test("shutdown starts every requested clone cancellation before joining their held physical upstream", async () => {
  const held = Promise.withResolvers<void>();
  const started = Promise.withResolvers<unknown>();
  const abort = new AbortController();
  const owned = createOwnedResponseBody(
    new Response(
      new ReadableStream<Uint8Array>(
        {
          async cancel(reason: unknown): Promise<void> {
            started.resolve(reason);
            await held.promise;
          },
        },
        { highWaterMark: 0 },
      ),
    ),
    abort.signal,
  );
  const clone = owned.response.clone();
  const originalReader = owned.response.body?.getReader();
  const cloneReader = clone.body?.getReader();
  let settled = false;
  const completion = owned.settled.then(() => {
    settled = true;
  });
  try {
    abort.abort();
    expect(await started.promise).toEqual([abort.signal.reason, abort.signal.reason]);
    await Promise.resolve();
    expect(settled).toBe(false);
    held.resolve();
    await completion;
    await expect(originalReader?.read()).rejects.toBe(abort.signal.reason);
    await expect(cloneReader?.read()).rejects.toBe(abort.signal.reason);
  } finally {
    held.resolve();
    await owned.cancel();
    originalReader?.releaseLock();
    cloneReader?.releaseLock();
  }
});
