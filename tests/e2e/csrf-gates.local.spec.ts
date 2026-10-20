// E2E (LOCAL mode): the CSRF gates over a real password-login cookie and the box owner's loopback session. Only the
// proxy-asserted header credential is exempt; the cookie and the loopback fallback are ambient, so a cross-site
// page could drive either. Every refusal is paired with the same call carrying the header, so a refusal is the gate.
import { randomBytes } from "node:crypto";
import { createTrpcClient as createProductionClient } from "@orb/client/data";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { TRPC_BATCH_MAX_ITEMS, TRPC_BATCH_MAX_URL_LENGTH } from "@orb/contracts/rpc";
import type { Handle, SocketId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/test";
import type { ActorClient } from "./support/actors.ts";
import { ambientHeaders, importsIdle, loginLocal, ownerActor, rawTrpcCall } from "./support/actors.ts";
import { LOCAL_MEMBER } from "./support/modes.ts";

const CSRF = { [CSRF_HEADER]: "1" };
/** Every CORS-simple byte ingest the guard fronts. */
const INGEST_ROUTES = [
  "/api/assets/upload",
  "/api/databank/upload",
  "/api/import",
  "/api/import/restore-card-lorebook",
  "/api/import/chat",
  "/api/import/tree",
  "/api/import/tree/review",
] as const;
const BUNDLE_ROUTE = "/api/import/bundle";
const PRUNE_URL = "/api/trpc/tag.pruneUnusedTags";
const MARKER_BYTES = 4;
const FRESH_PASSWORD = "csrf-gates-fresh-password";
/** Enough of a three-byte character that the query cannot fit the URL ceiling, under the card name cap. */
const LONG_TAIL = "界".repeat(Math.ceil(TRPC_BATCH_MAX_URL_LENGTH / encodeURIComponent("界").length) + 1);

function marker(label: string): string {
  return `${label}-${randomBytes(MARKER_BYTES).toString("hex")}`;
}

async function member(origin: string): Promise<ActorClient> {
  return await loginLocal(origin, castId<Handle>(LOCAL_MEMBER.handle), LOCAL_MEMBER.password);
}

async function tagNames(actor: ActorClient): Promise<string[]> {
  return (await actor.trpc.tag.listTags.query()).map((tag) => tag.name);
}

/** Status of an empty multipart POST: past the guard, every handler refuses the empty form itself. */
async function ingestStatus(origin: string, path: string, headers: Readonly<Record<string, string>>): Promise<number> {
  const response = await fetch(`${origin}${path}`, { method: "POST", headers, body: new FormData() });
  await response.arrayBuffer();
  return response.status;
}

test.describe("CSRF gate (cookie-authed mutations only)", () => {
  test("a cookie mutation WITHOUT the custom header → FORBIDDEN", async ({ baseURL }) => {
    const alice = await member(baseURL ?? "");
    const name = marker("csrf-refused");
    const refused = await rawTrpcCall(baseURL ?? "", { procedure: "tag.createTag", input: { input: { name } }, kind: "mutation" }, ambientHeaders(alice));
    expect(refused.status).toBe(403);
    expect(await tagNames(alice)).not.toContain(name);
  });

  test("a cookie mutation WITH the custom header passes", async ({ baseURL }) => {
    const alice = await member(baseURL ?? "");
    const name = marker("csrf-admitted");
    const admitted = await rawTrpcCall(baseURL ?? "", { procedure: "tag.createTag", input: { input: { name } }, kind: "mutation" }, alice.headers);
    expect(admitted.status).toBe(200);
    expect(await tagNames(alice)).toContain(name);
  });

  test("a query is never CSRF-gated (even cookie-authed without the header)", async ({ baseURL }) => {
    const alice = await member(baseURL ?? "");
    const read = await rawTrpcCall(baseURL ?? "", { procedure: "tag.listTags", input: undefined, kind: "query" }, ambientHeaders(alice));
    expect(read.status).toBe(200);
  });
});

test.describe("the tRPC mount over a cookie principal", () => {
  test("CONTROL: the cookie-arm CSRF gate still fires (JSON mutation, no x-orb-csrf → 403)", async ({ baseURL }) => {
    const origin = baseURL ?? "";
    const alice = await member(origin);
    const unused = marker("prune-survivor");
    await alice.trpc.tag.createTag.mutate({ input: { name: unused } });
    const response = await fetch(`${origin}${PRUNE_URL}`, {
      method: "POST",
      headers: { ...ambientHeaders(alice), "content-type": "application/json" },
      body: "null",
    });
    expect(response.status).toBe(403);
    expect(await tagNames(alice)).toContain(unused);
  });

  test("CONTROL: the cookie arm WITH x-orb-csrf still runs (the real client's batched write path)", async ({ baseURL }) => {
    const origin = baseURL ?? "";
    const alice = await member(origin);
    const unused = marker("prune-victim");
    await alice.trpc.tag.createTag.mutate({ input: { name: unused } });
    const response = await fetch(`${origin}${PRUNE_URL}?batch=1`, {
      method: "POST",
      headers: { ...alice.headers, "content-type": "application/json" },
      body: JSON.stringify({ 0: null }),
    });
    expect(response.status).toBe(200);
    expect(await tagNames(alice)).not.toContain(unused);
  });

  test("POST stream.connect with the input in a JSON body runs the subscription resolver", async ({ baseURL }) => {
    const origin = baseURL ?? "";
    // A fresh account, so no earlier socket of this run holds its presence.
    const handle = castId<Handle>(marker("socket-owner"));
    await ownerActor(origin).trpc.admin.createUser.mutate({ handle, password: FRESH_PASSWORD });
    const fresh = await loginLocal(origin, handle, FRESH_PASSWORD);
    const { userId } = await fresh.trpc.sessions.me.query();
    const online = async (): Promise<boolean> => (await fresh.trpc.notifications.presence.query({ userIds: [userId] })).onlineUserIds.includes(userId);
    // The resolver registers presence only once the procedure is admitted: the observable that separates it from
    // tRPC's 200 stream that would carry a refusal as a later frame.
    expect(await online()).toBe(false);
    const connection = new AbortController();
    try {
      const stream = await fetch(`${origin}/api/trpc/stream.connect`, {
        method: "POST",
        headers: { ...fresh.headers, "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify({ socketId: castId<SocketId>(marker("socket-leg-t-post")) }),
        signal: connection.signal,
      });
      expect(stream.status).toBe(200);
      expect(stream.headers.get("content-type")).toContain("text/event-stream");
      await expect.poll(online).toBe(true);
    } finally {
      connection.abort("the spec closed the socket");
    }
  });

  test("CONTROL: a form-encoded POST to the subscription is still the belt's 415", async ({ baseURL }) => {
    const origin = baseURL ?? "";
    const alice = await member(origin);
    const encoded = await fetch(`${origin}/api/trpc/stream.connect`, {
      method: "POST",
      headers: { ...alice.headers, "content-type": "application/x-www-form-urlencoded" },
      body: "socketId=socket_leg_t_form",
    });
    // tRPC refuses an urlencoded body itself; a multipart one it would dispatch, so only the belt stops it.
    const form = new FormData();
    form.set("socketId", "socket_leg_t_multipart");
    const multipart = await fetch(`${origin}/api/trpc/stream.connect`, { method: "POST", headers: alice.headers, body: form });
    expect({ encoded: encoded.status, multipart: multipart.status }).toEqual({ encoded: 415, multipart: 415 });
  });
});

test.describe("batches over a cookie principal", () => {
  for (const method of ["GET", "POST"] as const) {
    test(`${method} batches admit exactly the limit and reject overflow before procedure work`, async ({ baseURL }) => {
      const origin = baseURL ?? "";
      const alice = await member(origin);
      const unused = marker("batch-survivor");
      await alice.trpc.tag.createTag.mutate({ input: { name: unused } });
      const path = method === "GET" ? "tag.listTags" : "tag.pruneUnusedTags";
      const batch = (count: number): Promise<Response> =>
        fetch(`${origin}/api/trpc/${Array.from({ length: count }, () => path).join(",")}?batch=1`, {
          method,
          headers: method === "GET" ? ambientHeaders(alice) : { ...alice.headers, "content-type": "application/json" },
          ...(method === "POST" ? { body: "{}" } : {}),
        });
      const refused = await batch(TRPC_BATCH_MAX_ITEMS + 1);
      expect(refused.status).toBe(400);
      const refusal = await refused.text();
      expect(refusal).toContain("BAD_REQUEST");
      expect(refusal).not.toContain("stack");
      // The overflow ran no procedure: the unused tag a prune would delete is still there.
      expect(await tagNames(alice)).toContain(unused);
      const admitted = await batch(TRPC_BATCH_MAX_ITEMS);
      expect(admitted.status).toBe(200);
      const results: unknown = await admitted.json();
      expect(Array.isArray(results) ? results.length : null).toBe(TRPC_BATCH_MAX_ITEMS);
      // An admitted prune batch runs the procedure; a list batch leaves the tag where it was.
      expect((await tagNames(alice)).includes(unused)).toBe(method === "GET");
    });
  }

  test("the production client splits against the real mount and preserves each query's input, result and principal", async ({ baseURL }) => {
    const origin = baseURL ?? "";
    const alice = await member(origin);
    const owner = ownerActor(origin);
    const longName = `${marker("long-query")} ${LONG_TAIL}`;
    const names = [longName, ...Array.from({ length: TRPC_BATCH_MAX_ITEMS }, (_, index) => marker(`batch-query-${String(index)}`))];
    const owned = [names[0], names[1], names.at(-1)].filter((name): name is string => name !== undefined);
    for (const name of owned) {
      await alice.trpc.character.create.mutate({ input: { handle: marker("batch-character"), name, description: "batch split witness" } });
    }
    // Another account's identically named card must never surface for the member.
    await owner.trpc.character.create.mutate({ input: { handle: marker("foreign-character"), name: names[2] ?? "", description: "foreign witness" } });
    const batchSizes: number[] = [];
    const nativeFetch = globalThis.fetch;
    globalThis.fetch = (input, init): Promise<Response> => {
      const request = new Request(input, init);
      batchSizes.push(new URL(request.url).pathname.split("/").at(-1)?.split(",").length ?? 0);
      const headers = new Headers(request.headers);
      headers.set("cookie", ambientHeaders(alice)["cookie"] ?? "");
      return nativeFetch(new Request(request, { headers }));
    };
    try {
      const client = createProductionClient(`${origin}/api/trpc`);
      const results = await Promise.all(names.map((search) => client.character.list.query({ search, limit: 1 })));
      expect(batchSizes).toEqual([TRPC_BATCH_MAX_ITEMS, 1]);
      expect(results.map((page) => page.items.map((item) => item.name))).toEqual(names.map((name) => (owned.includes(name) ? [name] : [])));
    } finally {
      globalThis.fetch = nativeFetch;
    }
  });

  test("a valid long query is admitted over JSON POST without losing its input or principal", async ({ baseURL }) => {
    const origin = baseURL ?? "";
    const alice = await member(origin);
    const name = `${marker("long-post")} ${LONG_TAIL}`;
    await alice.trpc.character.create.mutate({ input: { handle: marker("long-post-character"), name, description: "long query witness" } });
    const response = await fetch(`${origin}/api/trpc/character.list?batch=1`, {
      method: "POST",
      headers: { ...alice.headers, "content-type": "application/json" },
      body: JSON.stringify({ 0: { search: name, limit: 1 } }),
    });
    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).toContain(name);
  });
});

test.describe("the byte-ingest guards key CSRF on every ambient credential", () => {
  for (const path of INGEST_ROUTES) {
    test(`${path}: cookie session WITHOUT the CSRF header → 403`, async ({ baseURL }) => {
      const alice = await member(baseURL ?? "");
      expect(await ingestStatus(baseURL ?? "", path, ambientHeaders(alice))).toBe(403);
    });

    test(`${path}: cookie session WITH the CSRF header → passes to the body cap`, async ({ baseURL }) => {
      const alice = await member(baseURL ?? "");
      expect(await ingestStatus(baseURL ?? "", path, alice.headers)).toBe(400);
    });
  }

  test("a COOKIE session without the CSRF header → 403, body untouched", async ({ baseURL }) => {
    const origin = baseURL ?? "";
    const alice = await member(origin);
    const before = await alice.trpc.workloads.list.query({ kind: "import-bundle" });
    const response = await fetch(`${origin}${BUNDLE_ROUTE}`, { method: "POST", headers: ambientHeaders(alice), body: new Uint8Array([1]) });
    expect(response.status).toBe(403);
    expect(await alice.trpc.workloads.list.query({ kind: "import-bundle" })).toEqual(before);
  });

  test("a cookie session WITH the CSRF header proceeds (the header is what lifts the ambient-credential gate)", async ({ baseURL }) => {
    const origin = baseURL ?? "";
    const alice = await member(origin);
    await importsIdle(alice);
    const response = await fetch(`${origin}${BUNDLE_ROUTE}`, { method: "POST", headers: alice.headers });
    expect(response.status).toBe(202);
  });

  test("the loopback OWNER FALLBACK without the CSRF header → 403 (its credential is ambient too)", async ({ baseURL }) => {
    const origin = baseURL ?? "";
    const owner = ownerActor(origin);
    expect((await owner.whoami()).role).toBe("owner");
    for (const path of [...INGEST_ROUTES, BUNDLE_ROUTE]) {
      expect(await ingestStatus(origin, path, {}), path).toBe(403);
    }
  });

  test("bundle route CSRF (#300): a fallback principal WITHOUT x-orb-csrf → 403, no owner write dispatched", async ({ baseURL }) => {
    const origin = baseURL ?? "";
    const owner = ownerActor(origin);
    const zip = new Uint8Array(await (await fetch(`${origin}/api/export/library?kinds=tag`)).arrayBuffer());
    await importsIdle(owner);
    const before = await owner.trpc.workloads.list.query({ kind: "import-bundle" });
    const blocked = await fetch(`${origin}${BUNDLE_ROUTE}`, { method: "POST", body: zip });
    expect(blocked.status).toBe(403);
    expect(await owner.trpc.workloads.list.query({ kind: "import-bundle" })).toEqual(before);
    const passed = await fetch(`${origin}${BUNDLE_ROUTE}`, { method: "POST", headers: CSRF, body: zip });
    expect(passed.status).toBe(202);
    expect((await owner.trpc.workloads.list.query({ kind: "import-bundle" })).length).toBe(before.length + 1);
  });
});
