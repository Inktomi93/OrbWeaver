// Native HTTP transport controls use the composed product, including identity and persistence.
import { once } from "node:events";
import { createServer } from "node:http";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { TRPC_BATCH_MAX_ITEMS } from "@orb/contracts/rpc";
import { ID_PREFIX } from "@orb/kit/ids";
import { authConfigFromEnv } from "@orb/server/entry/auth";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { ownerActor, SESSION_COOKIE } from "./actors.ts";
import { createTrpcClient } from "./trpc.ts";

test("native success calls preserve paths, inputs, batched output identity and persisted mutations", async () => {
  await using root = await createServerHarness({
    authConfig: { ...authConfigFromEnv(), mode: "single-user", fallback: "owner" },
    physicalPeer: () => "127.0.0.1",
  });
  const address = await root.listen();
  const client = createTrpcClient(`http://127.0.0.1:${String(address.port)}`);
  const first = await client.chat.startChat.mutate({ characterIds: [], opening: "none" });
  const second = await client.chat.startChat.mutate({ characterIds: [], opening: "none" });
  await client.chat.updateTitle.mutate({ chatId: first.chat.id, title: "Native first room" });
  await client.chat.updateTitle.mutate({ chatId: second.chat.id, title: "Native second room" });
  const [right, left, viewer] = await Promise.all([
    client.chat.getChat.query({ chatId: second.chat.id }),
    client.chat.getChat.query({ chatId: first.chat.id }),
    client.sessions.me.query(),
  ]);
  expect([right.id, right.title, left.id, left.title, viewer.userId]).toEqual([
    second.chat.id,
    "Native second room",
    first.chat.id,
    "Native first room",
    root.ownerId,
  ]);
  const stored = await root.services.chat.getChat({ principal: await root.principalFor(root.ownerId), chatId: first.chat.id });
  expect(stored.title).toBe(left.title);
  const mixed = await Promise.allSettled([client.sessions.me.query(), client.chat.getChat.query({ chatId: root.idSource.typeId(ID_PREFIX.chat) })]);
  expect(mixed).toMatchObject([
    { status: "fulfilled", value: { userId: root.ownerId } },
    { status: "rejected", reason: { data: { code: "NOT_FOUND", httpStatus: 404, path: "chat.getChat" } } },
  ]);
  const beyondOneBatch = await Promise.all(Array.from({ length: TRPC_BATCH_MAX_ITEMS + 1 }, () => client.sessions.me.query()));
  expect(beyondOneBatch.map((identity) => identity.userId)).toEqual(Array.from({ length: TRPC_BATCH_MAX_ITEMS + 1 }, () => root.ownerId));
});

test("caller cookies and CSRF remain distinct from fallback and raw status probes", async () => {
  await using root = await createServerHarness({
    authConfig: { ...authConfigFromEnv(), mode: "local", fallback: "owner" },
    physicalPeer: () => "127.0.0.1",
  });
  const member = await root.actor();
  const session = await root.app.sessions.create({ userId: member.id });
  const address = await root.listen();
  const origin = `http://127.0.0.1:${String(address.port)}`;
  const headers = { cookie: `${SESSION_COOKIE}=${session.token}`, forwarded: "" };
  const client = createTrpcClient(origin, headers);
  expect((await client.sessions.me.query()).userId).toBe(member.id);
  await expect(client.settings.updateUserSettingsSection.mutate({ section: "appearance", patch: { chatStyle: "bubble" } })).rejects.toThrow("403");
  const admitted = createTrpcClient(origin, { ...headers, [CSRF_HEADER]: "1", "content-type": "text/plain" });
  await admitted.settings.updateUserSettingsSection.mutate({ section: "appearance", patch: { chatStyle: "bubble" } });
  expect((await admitted.settings.getUserSettings.query()).config.appearance.chatStyle).toBe("bubble");
  const owner = ownerActor(origin);
  expect((await owner.trpc.sessions.me.query()).userId).toBe(root.ownerId);
  const refused = await owner.expectError("notAProcedure", {}, "query");
  expect(refused.status).toBe(404);
  expect(refused.body).toContain("notAProcedure");
  await expect(createTrpcClient(origin, { forwarded: "" }).sessions.me.query()).rejects.toThrow("401");
});

test("upstream failures retain HTTP diagnostics and malformed success bytes reach the native parser", async () => {
  await using root = await createServerHarness({
    authConfig: { ...authConfigFromEnv(), mode: "single-user", fallback: "owner" },
    physicalPeer: () => "127.0.0.1",
  });
  const productResponse = await root.http.request("/api/trpc/sessions.me?batch=1");
  expect(productResponse.status).toBe(200);
  const productBytes = await productResponse.text();
  let status = 200;
  let body = productBytes;
  const paths: (string | undefined)[] = [];
  await using upstream = createServer((request, response) => {
    paths.push(request.url);
    response.writeHead(status, { "content-type": "application/json" });
    response.end(body);
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const address = upstream.address();
  if (address === null || typeof address === "string") {
    throw new Error("The upstream control has no native HTTP port");
  }
  const client = createTrpcClient(`http://127.0.0.1:${String(address.port)}`);
  expect((await client.sessions.me.query()).userId).toBe(root.ownerId);
  status = 503;
  await expect(client.sessions.me.query()).rejects.toThrow(`failed (503): ${productBytes}`);
  status = 200;
  body = "not a JSON response";
  await expect(client.sessions.me.query()).rejects.toThrow();
  expect(paths).toEqual(Array.from({ length: 3 }, () => "/api/trpc/sessions.me?batch=1&input=%7B%7D"));
});
