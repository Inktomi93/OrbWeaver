import "./composed-real.ts";
import { sql } from "drizzle-orm";
import { expect, test } from "./fixtures.ts";
import { createServerHarness } from "./server.ts";

test("unread and consumer-locked production responses remain owned until root teardown", async () => {
  await using harness = await createServerHarness();
  const unread = await harness.http.request("/healthz");
  const locked = await harness.http.request("/healthz");
  expect(unread.status).toBe(200);
  expect(locked.status).toBe(200);
  expect(unread.headers.get("content-type")).toContain("application/json");
  expect(unread.body).not.toBeNull();
  expect(locked.body).not.toBeNull();
  const reader = locked.body?.getReader();
  if (reader === undefined) {
    throw new Error("health response has no body");
  }
  try {
    await harness[Symbol.asyncDispose]();
    await expect(reader.read()).rejects.toMatchObject({ name: "AbortError" });
    await expect(unread.text()).rejects.toMatchObject({ name: "AbortError" });
    await expect(harness.http.request("/healthz")).rejects.toThrow("HTTP lifetime is closed");
    await expect(harness.db.run(sql`select 1`)).rejects.toThrow();
    expect(harness.timers.pending()).toBe(0);
  } finally {
    reader.releaseLock();
  }
});

test("body consumption preserves the production wire and releases its request lifetime", async () => {
  await using harness = await createServerHarness();
  const response = await harness.http.request("/healthz");
  expect(response.status).toBe(200);
  expect(response.statusText).toBe("");
  expect(response.bodyUsed).toBe(false);
  const text = await response.text();
  expect(text).toContain('"status":"ok"');
  expect(response.bodyUsed).toBe(true);
  await harness[Symbol.asyncDispose]();
});
