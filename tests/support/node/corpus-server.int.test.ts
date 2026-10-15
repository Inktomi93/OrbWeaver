// @subject tests/support/node/fixtures.ts
// @subject packages/server/src/entry/auth/seam.ts
// @subject packages/server/src/domain/persona/verbs/create.ts
import "./composed-real.ts";
import { spawn } from "node:child_process";
import { authMeSchema, CSRF_HEADER, viewerViewSchema } from "@orb/contracts/identity";
import { createPersonaSchema, personaDetailSchema } from "@orb/contracts/persona";
import { pluginSurfaceStateSchema, pluginSurfaceViewSchema } from "@orb/contracts/plugin";
import { z } from "zod";
import { corpusReadInput } from "../iso/corpus.ts";
import { captureCookieAuth } from "./corpus-auth.ts";
import { createCorpusHarness, expect, test } from "./fixtures.ts";
import type { ServerTestHarness } from "./server.ts";
import { createServerHarness } from "./server.ts";

const PASSWORD = "corpus-consumer-fresh-native-password";
const MEMBER_PASSWORD = "corpus-consumer-fresh-native-member-password";
const MODEL_ENDPOINT = "https://corpus-consumer.example.invalid/v1";
const MODEL_ID = "corpus-consumer-model";

test("the committed corpus admits fresh native sessions and preserves public, owned, foreign and revoked reads", { tags: "slow" }, async ({
  corpusHarness,
}) => {
  const root = corpusHarness;
  const captured = root.corpus.wire.reads["persona.get"][0]?.output;
  const member = root.corpus.wire.memberIdentities?.notificationReader.viewer;
  const owner = root.corpus.wire.reads["sessions.me"][0]?.output;
  if (captured === undefined || member === undefined || owner === undefined) {
    throw new Error("The committed corpus has no native account/persona control cohort");
  }
  const expected = personaDetailSchema.parse(captured);
  const address = await root.listen();
  const origin = `http://${address.address}:${address.port}`;
  const url = new URL("/api/trpc/persona.get", origin);
  url.searchParams.set("input", JSON.stringify(corpusReadInput.persona(expected)));
  const publicHealth = await fetch(`${origin}/healthz`);
  expect(publicHealth.status).toBe(200);
  expect(await publicHealth.json()).toMatchObject({ status: "ok" });
  const anonymous = await fetch(url, { headers: { forwarded: "" } });
  expect(anonymous.status).toBe(401);
  await anonymous.arrayBuffer();
  const claim = (csrf: boolean): Promise<Response> =>
    fetch(`${origin}/api/auth/first-run`, {
      method: "POST",
      headers: csrf ? { [CSRF_HEADER]: "1" } : {},
      body: new URLSearchParams({ password: PASSWORD }),
    });
  const refused = await claim(false);
  expect(refused.status).toBe(403);
  await refused.arrayBuffer();
  const admitted = await claim(true);
  expect(admitted.status).toBe(200);
  await admitted.arrayBuffer();
  const cookie = admitted.headers
    .getSetCookie()
    .map((line) => line.split(";", 1).join(""))
    .join("; ");
  expect(cookie).not.toBe("");
  const identity = await fetch(`${origin}/api/trpc/sessions.me`, { headers: { cookie, forwarded: "" } });
  expect(z.object({ result: z.object({ data: viewerViewSchema }) }).parse(await identity.json()).result.data).toEqual(owner);
  const owned = await fetch(url, { headers: { cookie, forwarded: "" } });
  expect(z.object({ result: z.object({ data: personaDetailSchema }) }).parse(await owned.json()).result.data).toEqual(expected);
  const reset = await fetch(`${origin}/api/trpc/admin.resetPassword`, {
    method: "POST",
    headers: { cookie, [CSRF_HEADER]: "1", "content-type": "application/json" },
    body: JSON.stringify({ userId: member.userId, password: MEMBER_PASSWORD }),
  });
  expect(reset.status).toBe(200);
  await reset.arrayBuffer();
  const login = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { [CSRF_HEADER]: "1" },
    body: new URLSearchParams({ handle: member.handle, password: MEMBER_PASSWORD }),
  });
  expect(login.status).toBe(200);
  await login.arrayBuffer();
  const memberCookie = login.headers
    .getSetCookie()
    .map((line) => line.split(";", 1).join(""))
    .join("; ");
  const memberMe = await fetch(`${origin}/api/trpc/sessions.me`, { headers: { cookie: memberCookie, forwarded: "" } });
  expect(z.object({ result: z.object({ data: viewerViewSchema }) }).parse(await memberMe.json()).result.data).toEqual(member);
  const foreign = await fetch(url, { headers: { cookie: memberCookie, forwarded: "" } });
  expect(foreign.status).toBe(404);
  const foreignBody = await foreign.text();
  expect(foreignBody).toContain("NOT_FOUND");
  expect(foreignBody).not.toContain(expected.description);
  const logout = await fetch(`${origin}/api/auth/logout`, { method: "POST", headers: { cookie, [CSRF_HEADER]: "1" } });
  expect(logout.status).toBe(200);
  await logout.arrayBuffer();
  const revoked = await fetch(url, { headers: { cookie, forwarded: "" } });
  expect(revoked.status).toBe(401);
  await revoked.arrayBuffer();
  const signedOut = await fetch(`${origin}/api/auth/me`, { headers: { cookie, forwarded: "" } });
  expect(authMeSchema.parse(await signedOut.json()).authenticated).toBe(false);
});

async function rollNativeDice(root: ServerTestHarness): ReturnType<Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>["rpg"]["rollDice"]> {
  const caller = await root.internalCallerFor(root.ownerId);
  const { chat } = await caller.chat.startChat({ characterIds: [], opening: "none" });
  await caller.rpg.createGame({ chatId: chat.id, mode: "lite", ruleset: "d20" });
  return await caller.rpg.rollDice({ chatId: chat.id, notation: "2d6+3" });
}

test("canonical corpus dice ignore a structural RNG override while the ordinary root retains real injection", { tags: "slow" }, async ({ corpusHarness }) => {
  const structural = {
    secretBoxKey: null,
    providerFetch: (): Promise<Response> => Promise.resolve(Response.json({ data: [{ id: MODEL_ID }] })),
    networkExecution: {
      resolver: (hostname: string): Promise<readonly string[]> =>
        hostname === new URL(MODEL_ENDPOINT).hostname ? Promise.resolve(["93.184.215.14"]) : Promise.reject(new Error("unscripted corpus endpoint")),
    },
    random: (): never => {
      throw new Error("unsupported corpus random override reached production dice");
    },
  };
  await using resumed = await createCorpusHarness(undefined, structural);
  const baseline = await rollNativeDice(corpusHarness);
  expect(await rollNativeDice(resumed)).toEqual(baseline);
  const caller = await resumed.internalCallerFor(resumed.ownerId);
  const models = await caller.connection.draftCatalogModels({ providerId: "custom-openai", baseUrl: MODEL_ENDPOINT });
  expect(models.listed && models.models.map(({ id }) => id)).toEqual([MODEL_ID]);
  await using ordinary = await createServerHarness({ random: () => 0.25 });
  expect((await rollNativeDice(ordinary)).rolls).toEqual([2, 2]);
  expect(baseline.rolls).not.toEqual([2, 2]);
});

test("independently restored corpus graphs continue deterministic production writes and retain the original owned rows", { tags: "slow" }, async ({
  corpusHarness,
}) => {
  await using second = await createCorpusHarness();
  const roots = [corpusHarness, second];
  const written = await Promise.all(
    roots.map(async (root) => {
      const caller = await root.internalCallerFor(root.ownerId);
      const captured = root.corpus.wire.reads["persona.get"][0]?.output;
      if (captured === undefined) {
        throw new Error("The committed corpus has no owned persona witness");
      }
      const baseline = personaDetailSchema.parse(captured);
      expect(await caller.persona.get(corpusReadInput.persona(baseline))).toEqual(baseline);
      const created = await caller.persona.create({ input: createPersonaSchema.parse({ name: "Corpus continuation", description: baseline.description }) });
      expect(created.id).not.toBe(baseline.id);
      expect(created.createdAt).toBe(root.clock.now());
      expect(created.createdAt).toBeGreaterThanOrEqual(Math.max(...root.corpus.wire.reads["chat.getChat"].map(({ output }) => output.updatedAt)));
      root.timers.advance(1);
      const updated = await caller.persona.update({ personaId: created.id, input: { name: "Corpus continued" } });
      expect(updated.updatedAt).toBe(root.clock.now());
      expect(updated.updatedAt).toBeGreaterThan(created.updatedAt);
      expect(await caller.persona.get({ personaId: created.id })).toEqual(updated);
      expect(await caller.persona.get(corpusReadInput.persona(baseline))).toEqual(baseline);
      return { created, updated };
    }),
  );
  expect(written[0]).toEqual(written[1]);
});

test("the default corpus resumes native plugin ownership, public registrations and disable cleanup under fresh cookies", { tags: "slow" }, async () => {
  await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
  const library = root.corpus.wire.pluginLibrary;
  const foreignViewer = root.corpus.wire.memberIdentities?.sharedMember.viewer;
  if (library === undefined || foreignViewer === undefined) {
    throw new Error("The committed corpus has no native plugin adoption cohort");
  }
  const active = library.ownerActive;
  const auth = await captureCookieAuth(root, await root.principalFor(root.ownerId), PASSWORD);
  expect(auth.identity.viewer.userId).toBe(active.viewerUserId);
  const headers = { cookie: auth.cookie, forwarded: "" };
  const statePath = `/api/trpc/plugin.getSurfaceState?input=${encodeURIComponent(JSON.stringify(active.reads.state.input))}`;
  const readState = async (): Promise<ReturnType<typeof pluginSurfaceStateSchema.parse> | null> => {
    const response = await root.http.request(statePath, { headers });
    expect(response.status).toBe(200);
    return z.object({ result: z.object({ data: pluginSurfaceStateSchema.nullable() }) }).parse(await response.json()).result.data;
  };
  expect(await readState()).toBeNull();
  const enable = await root.http.request("/api/trpc/plugin.setEnabled", {
    method: "POST",
    headers: { ...headers, [CSRF_HEADER]: "1", "content-type": "application/json" },
    body: JSON.stringify({ pluginId: active.ids.pluginId, enabled: true }),
  });
  expect(enable.status).toBe(200);
  await enable.arrayBuffer();
  expect(await readState()).toEqual(active.reads.state.output);
  const surfaces = await root.http.request("/api/trpc/plugin.listSurfaces", { headers });
  expect(surfaces.status).toBe(200);
  expect(z.object({ result: z.object({ data: pluginSurfaceViewSchema.array() }) }).parse(await surfaces.json()).result.data).toEqual(
    active.reads.surfaces.output,
  );
  const action = await root.http.request("/api/trpc/plugin.invokeUiAction", {
    method: "POST",
    headers: { ...headers, [CSRF_HEADER]: "1", "content-type": "application/json" },
    body: JSON.stringify({ ...active.reads.state.input, actionId: "record", values: { entry: "Native clone entry" } }),
  });
  expect(action.status).toBe(200);
  await action.arrayBuffer();
  expect(await readState()).toEqual({ actionId: "record", values: { entry: "Native clone entry" }, inRoom: false });
  const foreign = await captureCookieAuth(root, await root.principalFor(foreignViewer.userId), MEMBER_PASSWORD);
  const refused = await root.http.request(statePath, { headers: { cookie: foreign.cookie, forwarded: "" } });
  expect(refused.status).toBe(404);
  const refusedBytes = await refused.text();
  expect(refusedBytes).toContain("NOT_FOUND");
  expect(refusedBytes).not.toContain("Native clone entry");
  expect(await readState()).toEqual({ actionId: "record", values: { entry: "Native clone entry" }, inRoom: false });
  const disable = await root.http.request("/api/trpc/plugin.setEnabled", {
    method: "POST",
    headers: { ...headers, [CSRF_HEADER]: "1", "content-type": "application/json" },
    body: JSON.stringify({ pluginId: active.ids.pluginId, enabled: false }),
  });
  expect(disable.status).toBe(200);
  await disable.arrayBuffer();
  expect(await readState()).toBeNull();
  const rpc = await root.internalCallerFor(root.ownerId);
  expect(await rpc.plugin.listSurfaces()).toEqual(library.ownerDisabled.reads.surfaces.output);
  expect(await rpc.plugin.listCommands()).toEqual(library.ownerDisabled.reads.commands.output);
  expect(await rpc.plugin.getLog(active.reads.log.input)).toEqual(library.ownerDisabled.reads.log.output);
  expect(await rpc.plugin.listBundleAssets(active.reads.assets.input)).toEqual(active.reads.assets.output);
});
