import "./composed-real.ts";
import { access } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { expect, test } from "./fixtures.ts";
import { createServerHarness } from "./server.ts";

const PRIVATE_PROVIDER = "inference.test";
const resolver = (hostname: string): Promise<readonly string[]> => {
  if (hostname !== PRIVATE_PROVIDER) {
    return Promise.reject(new Error("unscripted network lifetime hostname"));
  }
  return Promise.resolve(["192.168.1.7"]);
};

test("same-ID graphs retain independent endpoint publications and disposing the first cannot redirect or close the second", async () => {
  const firstCalls: string[] = [];
  const secondCalls: string[] = [];
  await using first = await createServerHarness({
    networkExecution: {
      resolver,
      fetch: (input, init) => {
        firstCalls.push(new Request(input, init).url);
        return Promise.resolve(new Response("first physical bytes"));
      },
    },
  });
  await using second = await createServerHarness({
    networkExecution: {
      resolver,
      fetch: (input, init) => {
        secondCalls.push(new Request(input, init).url);
        return Promise.resolve(new Response("second physical bytes"));
      },
    },
  });
  expect(first.ownerId).toBe(second.ownerId);
  await first.services.settings.updateAppSettings({
    principal: await first.principalFor(first.ownerId),
    partial: { privateEndpointAllowlist: [`${PRIVATE_PROVIDER}:11434`] },
  });
  await second.services.settings.updateAppSettings({
    principal: await second.principalFor(second.ownerId),
    partial: { privateEndpointAllowlist: [`${PRIVATE_PROVIDER}:8080`] },
  });
  const firstUrl = `http://${PRIVATE_PROVIDER}:11434/owned`;
  const secondUrl = `http://${PRIVATE_PROVIDER}:8080/owned`;
  expect(await first.app.egress.resolvedEndpointAdmission(firstUrl)).toBe("admitted");
  expect(await second.app.egress.resolvedEndpointAdmission(firstUrl)).toBe("refused");
  expect(await first.app.egress.resolvedEndpointAdmission(secondUrl)).toBe("refused");
  expect(await second.app.egress.resolvedEndpointAdmission(secondUrl)).toBe("admitted");
  await expect(second.app.egress.configuredEndpointFetch(firstUrl)).rejects.toMatchObject({ reason: "private-address" });
  expect(secondCalls).toEqual([]);
  expect(await (await first.app.egress.configuredEndpointFetch(firstUrl)).text()).toBe("first physical bytes");
  expect(firstCalls).toEqual([firstUrl]);
  await first[Symbol.asyncDispose]();
  await expect(first.app.egress.configuredEndpointFetch(firstUrl)).rejects.toThrow("egress lifetime is closed");
  expect(await (await second.app.egress.configuredEndpointFetch(secondUrl)).text()).toBe("second physical bytes");
  expect(secondCalls).toEqual([secondUrl]);
  expect(firstCalls).toEqual([firstUrl]);
});

test("full root cancellation joins a locked physical body before closing its database and timers", async () => {
  const cancelling = Promise.withResolvers<void>();
  const cancelled = Promise.withResolvers<void>();
  await using harness = await createServerHarness({
    networkExecution: {
      resolver,
      fetch: async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            cancel: () => {
              cancelling.resolve();
              return cancelled.promise;
            },
          }),
        ),
    },
  });
  await harness.services.settings.updateAppSettings({
    principal: await harness.principalFor(harness.ownerId),
    partial: { privateEndpointAllowlist: [`${PRIVATE_PROVIDER}:11434`] },
  });
  const response = await harness.app.egress.configuredEndpointFetch(`http://${PRIVATE_PROVIDER}:11434/held`);
  const reader = response.body?.getReader();
  if (reader === undefined) {
    throw new Error("the physical response omitted its held body");
  }
  const read = expect(reader.read()).rejects.toMatchObject({ name: "AbortError" });
  let closed = false;
  const disposal = Promise.resolve(harness[Symbol.asyncDispose]()).finally(() => {
    closed = true;
  });
  try {
    await cancelling.promise;
    expect(closed).toBe(false);
    expect(await harness.db.all(sql`select 1 as live`)).toEqual([{ live: 1 }]);
  } finally {
    cancelled.resolve();
    await disposal;
    await read;
    reader.releaseLock();
  }
  expect(closed).toBe(true);
  expect(harness.timers.pending()).toBe(0);
  await expect(harness.db.all(sql`select 1`)).rejects.toThrow();
});

test("a physical body cancellation failure remains visible after the root finishes database and directory cleanup", async () => {
  const failure = new Error("controlled physical body cancellation failure");
  await using harness = await createServerHarness({
    networkExecution: {
      resolver,
      fetch: async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            cancel: () => Promise.reject(failure),
          }),
        ),
    },
  });
  await harness.services.settings.updateAppSettings({
    principal: await harness.principalFor(harness.ownerId),
    partial: { privateEndpointAllowlist: [`${PRIVATE_PROVIDER}:11434`] },
  });
  const response = await harness.app.egress.configuredEndpointFetch(`http://${PRIVATE_PROVIDER}:11434/refused-cancel`);
  expect(response.status).toBe(200);
  await expect(harness[Symbol.asyncDispose]()).rejects.toThrow("egress physical cleanup failed");
  await expect(harness.db.all(sql`select 1`)).rejects.toThrow();
  await expect(access(harness.modelCacheDir)).rejects.toMatchObject({ code: "ENOENT" });
  expect(harness.timers.pending()).toBe(0);
});
