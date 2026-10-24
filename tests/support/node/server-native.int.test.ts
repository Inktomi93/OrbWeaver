import { access, mkdtemp, rm } from "node:fs/promises";
import { request as nodeRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { authConfigSchema } from "@orb/contracts/auth-config";
import { authMeSchema, CSRF_HEADER } from "@orb/contracts/identity";
import { streamConnectInputSchema } from "@orb/contracts/stream";
import { closeDb } from "@orb/db";
import { ID_PREFIX } from "@orb/kit/ids";
import { sniffMime } from "@orb/kit/image-sniff";
import { sql } from "drizzle-orm";
import { vi } from "vitest";
import { freshDb, freshHeldDb } from "./db.ts";
import { makeAssetBytes } from "./factories/asset.ts";
import { expect, test } from "./fixtures.ts";
import { createServerHarness } from "./server.ts";

const PASSWORD = "native-request-owned-password-not-a-session-fake";
const OVERSIZED_PASSWORD_REPETITIONS = 1024;

test("chunked native first-run keeps the real body limit, CSRF and password/session admission", async () => {
  await using harness = await createServerHarness({ env: { ["AUTH_MODE"]: "local", ["AUTH_FALLBACK"]: "owner" } });
  const address = await harness.listen();
  const origin = `http://${address.address}:${address.port}`;
  const send = (password: string): Promise<number | undefined> =>
    new Promise((resolve, reject) => {
      const outgoing = nodeRequest(
        `${origin}/api/auth/first-run`,
        {
          method: "POST",
          headers: { [CSRF_HEADER]: "1", "content-type": "application/x-www-form-urlencoded", "transfer-encoding": "chunked" },
        },
        (incoming) => {
          incoming.resume();
          incoming.once("end", () => resolve(incoming.statusCode));
          incoming.once("error", reject);
        },
      );
      outgoing.once("error", reject);
      const body = new URLSearchParams({ password }).toString();
      const split = Math.floor(body.length / 2);
      outgoing.write(body.slice(0, split));
      outgoing.end(body.slice(split));
    });
  expect(await send(PASSWORD.repeat(OVERSIZED_PASSWORD_REPETITIONS))).toBe(413);
  expect(await harness.app.sessions.ownerNeedsPassword()).toBe(true);
  expect(await send(PASSWORD)).toBe(200);
  expect(await harness.app.sessions.ownerNeedsPassword()).toBe(false);
  const owner = await harness.app.sessions.loadUserById(harness.ownerId);
  if (owner === null) {
    throw new Error("the native claim owner row disappeared");
  }
  const login = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { [CSRF_HEADER]: "1" },
    body: new URLSearchParams({ handle: owner.handle, password: PASSWORD }),
  });
  expect(login.status).toBe(200);
  await login.arrayBuffer();
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  if (cookie === undefined) {
    throw new Error("native chunked claim/login did not mint its real cookie");
  }
  expect(authMeSchema.parse(await (await fetch(`${origin}/api/auth/me`, { headers: { cookie } })).json())).toEqual({
    authenticated: true,
    handle: owner.handle,
    role: "owner",
  });
});

test("native ingress uses its actual peer for first-run while preserving CSRF, relay refusal and cookie admission", async () => {
  await using harness = await createServerHarness({ env: { ["AUTH_MODE"]: "local", ["AUTH_FALLBACK"]: "owner" } });
  const address = await harness.listen();
  const origin = `http://${address.address}:${address.port}`;
  const config = authConfigSchema.parse(await (await fetch(`${origin}/api/auth/config`)).json());
  expect(config.localFirstRun).toBe(true);
  expect(config.clientScope).toBe("loopback");
  const absent = authConfigSchema.parse(await (await harness.http.request("/api/auth/config")).json());
  expect(absent.localFirstRun).toBe(false);
  const noCsrf = await fetch(`${origin}/api/auth/first-run`, { method: "POST", body: new URLSearchParams({ password: PASSWORD }) });
  expect(noCsrf.status).toBe(403);
  await noCsrf.arrayBuffer();
  const relayed = await fetch(`${origin}/api/auth/first-run`, {
    method: "POST",
    headers: { [CSRF_HEADER]: "1", "x-forwarded-for": "127.0.0.1" },
    body: new URLSearchParams({ password: PASSWORD }),
  });
  expect(relayed.status).toBe(403);
  await relayed.arrayBuffer();
  const claim = await fetch(`${origin}/api/auth/first-run`, {
    method: "POST",
    headers: { [CSRF_HEADER]: "1" },
    body: new URLSearchParams({ password: PASSWORD }),
  });
  expect(claim.status).toBe(200);
  await claim.arrayBuffer();
  const cookie = claim.headers.get("set-cookie")?.split(";")[0];
  if (cookie === undefined) {
    throw new Error("native first-run did not mint its real session cookie");
  }
  const owner = await harness.app.sessions.loadUserById(harness.ownerId);
  if (owner === null) {
    throw new Error("the real root owner row disappeared before native admission");
  }
  const me = authMeSchema.parse(await (await fetch(`${origin}/api/auth/me`, { headers: { cookie } })).json());
  expect(me).toEqual({ authenticated: true, handle: owner.handle, role: "owner" });
  const repeat = await fetch(`${origin}/api/auth/first-run`, {
    method: "POST",
    headers: { [CSRF_HEADER]: "1" },
    body: new URLSearchParams({ password: PASSWORD }),
  });
  expect(repeat.status).toBe(409);
  await repeat.arrayBuffer();
});

test("same-ID native roots singleflight their own listeners and out-of-order closure preserves the sibling", async () => {
  const authConfig = { mode: "local", fallback: "deny" } satisfies NonNullable<Parameters<typeof createServerHarness>[0]>["authConfig"];
  await using first = await createServerHarness({ authConfig });
  await using second = await createServerHarness({ authConfig });
  expect(first.ownerId).toBe(second.ownerId);
  const [firstAddress, firstAgain, secondAddress] = await Promise.all([first.listen(), first.listen(), second.listen()]);
  expect(firstAgain).toEqual(firstAddress);
  expect(firstAddress.port).not.toBe(secondAddress.port);
  const firstOrigin = `http://${firstAddress.address}:${firstAddress.port}`;
  const secondOrigin = `http://${secondAddress.address}:${secondAddress.port}`;
  const claim = await fetch(`${firstOrigin}/api/auth/first-run`, {
    method: "POST",
    headers: { [CSRF_HEADER]: "1" },
    body: new URLSearchParams({ password: PASSWORD }),
  });
  expect(claim.status).toBe(200);
  await claim.arrayBuffer();
  const cookie = claim.headers.get("set-cookie")?.split(";")[0];
  if (cookie === undefined) {
    throw new Error("native owner claim omitted its real session cookie");
  }
  const own = authMeSchema.parse(await (await fetch(`${firstOrigin}/api/auth/me`, { headers: { cookie } })).json());
  expect(own.authenticated).toBe(true);
  const foreign = authMeSchema.parse(await (await fetch(`${secondOrigin}/api/auth/me`, { headers: { cookie } })).json());
  expect(foreign).toEqual({ authenticated: false, handle: null, role: null });
  await first[Symbol.asyncDispose]();
  await expect(first.listen()).rejects.toThrow("HTTP lifetime is closed");
  await expect(fetch(`${firstOrigin}/healthz`)).rejects.toThrow();
  const stillLive = await fetch(`${secondOrigin}/healthz`);
  expect(stillLive.status).toBe(200);
  await stillLive.arrayBuffer();
});

test("native socket disposal joins the held actual room pump before closing ingress or its database", async () => {
  await using database = new AsyncDisposableStack();
  const held = await freshHeldDb();
  database.defer(() => closeDb(held.db));
  await using harness = await createServerHarness({ db: held.db, env: { ["AUTH_MODE"]: "single-user", ["AUTH_FALLBACK"]: "owner" } });
  const caller = await harness.internalCallerFor(harness.ownerId);
  const chat = (await caller.chat.startChat({ characterIds: [] })).chat;
  const { socketId } = streamConnectInputSchema.parse({ socketId: harness.ids.uuid() });
  const address = await harness.listen();
  const origin = `http://${address.address}:${address.port}`;
  const url = new URL("/api/trpc/stream.connect", origin);
  url.searchParams.set("input", JSON.stringify({ socketId }));
  const response = await fetch(url, { headers: { accept: "text/event-stream" } });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  const reader = response.body?.getReader();
  if (reader === undefined) {
    throw new Error("the actual native socket omitted its stream");
  }
  await reader.read();
  const gate = held.hold(/select min\(.*from "chat_events"/u);
  const stopped = Promise.withResolvers<void>();
  // biome-ignore lint/nursery/useDisposables: this borrowed bus belongs to the root; the native socket case observes its stop before actual pump joins.
  const tap = harness.app.liveBuses.chatOpen;
  const setTap = tap.setChatOpenTap;
  const observed = vi.spyOn(tap, "setChatOpenTap").mockImplementation((next) => {
    setTap.call(tap, next);
    if (next === null) {
      stopped.resolve();
    }
  });
  let disposal: Promise<void> | undefined;
  try {
    await caller.stream.attach({ socketId, ref: { channel: "chat", chatId: chat.id }, sinceSeq: 0 });
    await gate.reached;
    let disposed = false;
    disposal = Promise.resolve(harness[Symbol.asyncDispose]()).then(() => {
      disposed = true;
    });
    await stopped.promise;
    expect(disposed).toBe(false);
    expect(await held.db.all(sql`select 1 as live`)).toEqual([{ live: 1 }]);
    gate.release();
    await disposal;
    expect(harness.app.sockets.liveSocketCount()).toBe(0);
    await expect(fetch(`${origin}/healthz`)).rejects.toThrow();
    expect(harness.timers.pending()).toBe(0);
    expect(await held.db.all(sql`select 1 as retained`)).toEqual([{ retained: 1 }]);
  } finally {
    gate.release();
    await disposal;
    await Promise.allSettled([reader.cancel()]);
    reader.releaseLock();
    observed.mockRestore();
  }
});

test("supplied persistent CAS and variants survive root disposal and remain readable by the next real graph", async () => {
  await using callerResources = new AsyncDisposableStack();
  const directory = await mkdtemp(join(tmpdir(), "codex-compose-media-997-958-persistent-"));
  callerResources.defer(() => rm(directory, { recursive: true, force: true }));
  const db = await freshDb();
  callerResources.defer(() => closeDb(db));
  const casDir = join(directory, "cas");
  const variantDir = join(directory, "variants");
  await using first = await createServerHarness({ db, casDir, variantDir });
  const bytes = makeAssetBytes(first.idSource.typeId(ID_PREFIX.asset));
  const stored = await first.services.assets.store({
    principal: await first.principalFor(first.ownerId),
    bytes,
    mime: sniffMime(bytes),
    kind: "background",
    enforceMagic: true,
  });
  await first.settleBackground();
  await first[Symbol.asyncDispose]();
  await expect(access(first.modelCacheDir)).rejects.toMatchObject({ code: "ENOENT" });
  await access(casDir);
  await access(variantDir);
  await using second = await createServerHarness({ db, casDir, variantDir, ownerId: first.ownerId });
  const restored = await second.services.assets.readOwnedAssetBytes(await second.principalFor(second.ownerId), stored.assetId);
  expect([...restored.bytes]).toEqual([...bytes]);
  expect(await db.all(sql`select 1 as retained`)).toEqual([{ retained: 1 }]);
});
