import { createCharacterSchema } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { IMAGERY_NEGATIVE_SLOT_ID } from "@orb/contracts/imagery";
import { providerDefSchema } from "@orb/contracts/inference";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { proseOverrideFromLegacy, resolveProseText } from "@orb/contracts/prose";
import { resolveImageryCaption, resolveImageryTemplate } from "@orb/contracts/settings";
import type { Resolved } from "@orb/inference";
import { ID_PREFIX } from "@orb/kit/ids";
import { processMacros } from "@orb/kit/macro";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import type { AppRouter } from "@orb/server";
import { authConfigFromEnv } from "@orb/server/entry/auth";
import { CORPUS_PROVIDER_ENDPOINT, createCorpusProviderExecution } from "@orb/testkit/node/corpus-provider.ts";
import { captureCookieAuth, seedCorpusConnections } from "@orb/testkit/node/corpus-seed.ts";
import { makeAssetBytes } from "@orb/testkit/node/factories/asset.ts";
import { seedChatInvite, seedInvitedChatParticipant } from "@orb/testkit/node/factories/chat.ts";
import { seedAdminProvider } from "@orb/testkit/node/factories/provider.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import type { ServerTestHarness } from "@orb/testkit/node/server.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { createTRPCClient, httpBatchLink } from "@trpc/client";

const HOST_MODEL = "imagery-host-utility";
const LIVE_MODEL = "imagery-host-utility-live";
const IMAGE_MODEL = "imagery-host-image";
const HOST_CAPTION = "Describe the host portrait.";
const HOST_TEMPLATE = "Extract the host portrait.";
const HOST_NEGATIVE = "host excluded detail";
const HOST_KEY = "imagery-host-funded-key";
const CAPTION = "  traveller, blue coat  ";
const CAPTION_MODE = "character_multimodal";

function physicalExecution(replies: readonly string[]): { execute: typeof fetch; requests: Request[]; images: Uint8Array[] } {
  const remaining = [...replies];
  const requests: Request[] = [];
  const images: Uint8Array[] = [];
  const provider = createCorpusProviderExecution({
    modelIds: [HOST_MODEL, LIVE_MODEL, IMAGE_MODEL],
    embedding: [1, 0, 0],
    chatText: () => {
      const reply = remaining.shift();
      if (reply === undefined) {
        throw new Error("the finite imagery completion script is exhausted");
      }
      return reply;
    },
    structuredReplies: new Map(),
    images,
    usage: { promptTokens: 40, completionTokens: 15 },
  });
  const execute: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.method === "POST") {
      requests.push(request.clone());
    }
    return await provider.execute(request);
  };
  return {
    execute,
    requests,
    images,
  };
}

async function policyRoom(root: ServerTestHarness): Promise<{
  host: Principal;
  member: Principal;
  character: Awaited<ReturnType<ServerTestHarness["services"]["character"]["create"]>>;
  chat: Awaited<ReturnType<ServerTestHarness["services"]["chat"]["startChat"]>>["chat"];
  utility: Awaited<ReturnType<ServerTestHarness["services"]["connection"]["create"]>>;
  avatarBytes: Uint8Array;
}> {
  const host = await root.principalFor((await root.actor()).id);
  const member = await root.principalFor((await root.actor()).id);
  await root.services.settings.updateAppSettings({
    principal: await root.principalFor(root.ownerId),
    partial: { privateEndpointAllowlist: [new URL(CORPUS_PROVIDER_ENDPOINT).hostname] },
  });
  await seedCorpusConnections(root, host);
  const credential = await root.services.credentials.add({ principal: host, provider: "custom-openai", key: HOST_KEY });
  const utility = await root.services.connection.create({
    principal: host,
    providerId: "custom-openai",
    credentialId: credential.id,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: HOST_MODEL,
    allowBackground: true,
    declared: {
      kind: "generation",
      generation: { input: ["text", "image"], context: { window: 32_000 }, sampling: { temperature: { min: 0, max: 2 } } },
      features: { detectServer: false, pricing: { inputPerMTok: 1, outputPerMTok: 2 } },
    },
  });
  const image = await root.services.connection.create({
    principal: host,
    providerId: "custom-openai",
    credentialId: credential.id,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: IMAGE_MODEL,
    allowBackground: true,
    declared: {
      kind: "generation",
      generation: { context: { window: 32_000 }, output: { modalities: ["image"] } },
      features: { detectServer: false, images: "images-api" },
    },
  });
  await root.services.connection.setBinding({ principal: host, task: "chat", connectionId: utility.id });
  await root.services.connection.setBinding({ principal: host, task: "summarize", connectionId: utility.id });
  await root.services.connection.setBinding({ principal: host, task: "generateImage", connectionId: image.id });
  const avatarBytes = makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset));
  const avatar = await root.services.assets.store({ principal: host, bytes: avatarBytes, kind: "avatar", mime: "image/png", enforceMagic: true });
  const character = await root.services.character.create({
    principal: host,
    input: createCharacterSchema.parse({
      handle: "policy-portrait",
      name: "Traveller",
      description: "A traveller in a blue coat.",
      avatarAssetId: avatar.assetId,
    }),
  });
  const { chat } = await root.services.chat.startChat({ principal: host, characterIds: [character.id], opening: "none" });
  const invite = await seedChatInvite(root, { principal: host, chatId: chat.id, input: { invitedHandle: member.handle } });
  await seedInvitedChatParticipant(root, { principal: member, inviteId: invite.id });
  await root.services.chat.commitMessage({ principal: host, chatId: chat.id, content: "The traveller stands beside the loom." });
  await root.services.settings.updateUserSettingsSection({
    principal: member,
    input: { section: "imagery", patch: { templates: { character: "Member extraction." }, captions: { [CAPTION_MODE]: "Member caption." } } },
  });
  await root.services.settings.updateUserSettingsSection({
    principal: member,
    input: { section: "prose", patch: { [IMAGERY_NEGATIVE_SLOT_ID]: proseOverrideFromLegacy("member excluded detail") } },
  });
  return { host, member, character, chat, utility, avatarBytes };
}

test("member previews use the host's live Utility binding, preset and instructions; empty and unfunded calls refuse", async () => {
  const wire = physicalExecution([CAPTION, CAPTION, CAPTION, CAPTION, " "]);
  await using root = await createServerHarness({ startJobs: false, providerFetch: wire.execute, secretBoxKey: Buffer.alloc(32, 3) });
  const room = await policyRoom(root);
  const preview = (): ReturnType<ServerTestHarness["services"]["imagery"]["extractPrompt"]> =>
    root.services.imagery.extractPrompt({ caller: room.member, chatId: room.chat.id, mode: "character_multimodal", subjectCharacterId: room.character.id });
  const defaults = await root.services.settings.loadUserSettings(room.host.userId);
  expect(
    (await root.services.imagery.extractPrompt({ caller: room.member, chatId: room.chat.id, mode: "character", subjectCharacterId: room.character.id })).source,
  ).toBe("extracted");
  expect(await wire.requests[0]?.clone().json()).toMatchObject({
    model: HOST_MODEL,
    messages: expect.arrayContaining([
      {
        role: "system",
        content: processMacros(resolveImageryTemplate(defaults.imagery, "character"), {
          char: room.character.name,
          user: "User",
          persona: "",
          scenario: "",
          env: {},
          nowMs: root.clock.now(),
        }),
      },
    ]),
  });
  expect(await preview()).toMatchObject({ prompt: CAPTION.trim(), source: "captioned" });
  expect(await wire.requests[1]?.clone().json()).toMatchObject({
    model: HOST_MODEL,
    messages: expect.arrayContaining([{ role: "system", content: resolveImageryCaption(defaults.imagery, "character_multimodal") }]),
  });
  const preset = await root.services.preset.create({
    userId: room.host.userId,
    name: "Portrait Utility",
    kind: "custom",
    config: { ...DEFAULT_PROMPT_CONFIG, params: { temperature: 0.7 } },
  });
  await root.services.settings.updateUserSettingsSection({
    principal: room.host,
    input: { section: "seeds", patch: { summarizePreset: { kind: "preset", presetId: preset.id } } },
  });
  await root.services.settings.updateUserSettingsSection({
    principal: room.host,
    input: { section: "imagery", patch: { templates: { character: HOST_TEMPLATE }, captions: { [CAPTION_MODE]: HOST_CAPTION } } },
  });
  const captioned = await preview();
  expect(captioned.prompt).toBe(CAPTION.trim());
  expect(captioned.costUsd).toBeCloseTo(0.000_07, 8);
  expect(await wire.requests[2]?.clone().json()).toMatchObject({
    model: HOST_MODEL,
    temperature: 0.7,
    messages: expect.arrayContaining([{ role: "system", content: HOST_CAPTION }]),
  });
  expect(await wire.requests[2]?.clone().text()).toContain(Buffer.from(room.avatarBytes).toString("base64"));
  expect(wire.requests[2]?.headers.get("authorization")).toBe(`Bearer ${HOST_KEY}`);
  await root.services.connection.update({ principal: room.host, connectionId: room.utility.id, patch: { model: LIVE_MODEL } });
  await root.services.preset.update({ userId: room.host.userId, id: preset.id, config: { ...preset.config, params: { temperature: 0.4 } } });
  expect(
    (await root.services.imagery.extractPrompt({ caller: room.member, chatId: room.chat.id, mode: "character", subjectCharacterId: room.character.id })).source,
  ).toBe("extracted");
  expect(await wire.requests[3]?.clone().json()).toMatchObject({ model: LIVE_MODEL, temperature: 0.4 });
  expect(await wire.requests[3]?.clone().text()).toContain(HOST_TEMPLATE);
  await expect(preview()).rejects.toMatchObject({ name: "PromptExtractionFailedError" });
  expect(wire.requests).toHaveLength(5);
  await root.services.connection.update({ principal: room.host, connectionId: room.utility.id, patch: { allowBackground: false } });
  await expect(preview()).rejects.toThrow();
  expect(wire.requests).toHaveLength(5);
});

test("a member's room image uses the host's image connection and live negative prose, not the member's settings", async () => {
  const wire = physicalExecution([]);
  await using root = await createServerHarness({
    startJobs: false,
    providerFetch: wire.execute,
    secretBoxKey: Buffer.alloc(32, 3),
    authConfig: { ...authConfigFromEnv(), mode: "local", fallback: "deny" },
  });
  const room = await policyRoom(root);
  wire.images.push(makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)), makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)));
  const defaults = await root.services.settings.loadUserSettings(room.host.userId);
  const auth = await captureCookieAuth(root, room.member, "imagery-boundary-password");
  const url = "http://localhost/api/trpc";
  const headers = { cookie: auth.cookie, [CSRF_HEADER]: "1", "content-type": "application/json" };
  const invalid = await root.http.request(`${url}/chat.generateImage`, {
    method: "POST",
    headers,
    body: JSON.stringify({ chatId: room.chat.id, mode: "free", timeZone: UTC_TIME_ZONE }),
  });
  const refusal = await invalid.text();
  expect(invalid.status).toBe(400);
  expect(refusal).toContain("BAD_REQUEST");
  expect(refusal).toContain("prompt");
  expect(wire.requests).toHaveLength(0);
  const memberCaller = createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url,
        headers,
        fetch: async (address, init) => await root.http.request(String(address), init === undefined ? undefined : { ...init, signal: init.signal ?? null }),
      }),
    ],
  });
  const generate = (): ReturnType<ServerTestHarness["services"]["chat"]["generateImage"]> =>
    memberCaller.chat.generateImage.mutate({ chatId: room.chat.id, mode: "free", prompt: "The orbital loom.", n: 1, gallery: false, timeZone: UTC_TIME_ZONE });
  const first = await generate();
  expect(first.authorUserId).toBe(room.member.userId);
  expect(await wire.requests[0]?.clone().text()).toContain(resolveProseText(IMAGERY_NEGATIVE_SLOT_ID, defaults.prose));
  await root.services.settings.updateUserSettingsSection({
    principal: room.host,
    input: { section: "prose", patch: { [IMAGERY_NEGATIVE_SLOT_ID]: proseOverrideFromLegacy(HOST_NEGATIVE) } },
  });
  expect((await generate()).authorUserId).toBe(room.member.userId);
  expect(await wire.requests[1]?.clone().json()).toMatchObject({ model: IMAGE_MODEL, prompt: expect.stringContaining(HOST_NEGATIVE) });
  expect(await wire.requests[1]?.clone().text()).not.toContain("member excluded detail");
  expect(wire.requests.map((request) => request.headers.get("authorization"))).toEqual([`Bearer ${HOST_KEY}`, `Bearer ${HOST_KEY}`]);
  const stored = await root.services.assets.listOwned({ principal: room.host, kind: "generated", limit: 10 });
  expect(stored).toHaveLength(2);
  for (const asset of stored) {
    expect(await root.services.imagery.readProvenance({ caller: room.host, assetId: asset.assetId })).toMatchObject({ model: IMAGE_MODEL });
    expect(await root.services.imagery.readProvenance({ caller: room.member, assetId: asset.assetId })).toBeNull();
  }
  await root.services.connection.setBinding({ principal: room.host, task: "generateImage", connectionId: null });
  await expect(generate()).rejects.toThrow("room host");
  expect(wire.requests).toHaveLength(2);
  expect(await root.services.assets.listOwned({ principal: room.host, kind: "generated", limit: 10 })).toEqual(stored);
});

test("imagery retains a real dropped-edit warning and filters a real native unsupported-count warning", async () => {
  const endpoint = "https://native-warning-image.test/v1beta";
  const model = "native-warning-image";
  const requests: Request[] = [];
  let pixels: Uint8Array = new Uint8Array();
  let remaining = 2;
  await using root = await createServerHarness({
    startJobs: false,
    secretBoxKey: Buffer.alloc(32, 3),
    networkExecution: { resolver: () => Promise.resolve(["93.184.215.14"]) },
    providerFetch: (input, init) => {
      const request = new Request(input, init);
      if (request.method === "GET" && request.url.startsWith(`${endpoint}/models`)) {
        return Promise.resolve(Response.json({ models: [{ name: `models/${model}`, supportedGenerationMethods: ["generateContent"] }] }));
      }
      if (request.method !== "POST" || request.url !== `${endpoint}/models/${model}:generateContent` || remaining === 0) {
        return Promise.reject(new Error("the finite native warning image script rejected an unscripted request"));
      }
      remaining -= 1;
      requests.push(request.clone());
      return Promise.resolve(
        Response.json({
          candidates: [
            {
              content: { role: "model", parts: [{ inlineData: { mimeType: "image/png", data: Buffer.from(pixels).toString("base64") } }] },
              finishReason: "STOP",
            },
          ],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4, totalTokenCount: 14 },
        }),
      );
    },
  });
  pixels = makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset));
  const principal = await root.principalFor(root.ownerId);
  const provider = providerDefSchema.parse({
    id: "controlled-warning-native",
    label: "Controlled native image warnings",
    wire: "google-generative-ai",
    auth: "endpoint",
    apis: ["google-generative-ai"],
    catalog: "url",
    metered: true,
  });
  await seedAdminProvider(root, provider, { admin: principal.userId });
  const credential = await root.services.credentials.add({ principal, provider: provider.id, key: HOST_KEY });
  const connection = await root.services.connection.create({
    principal,
    providerId: provider.id,
    credentialId: credential.id,
    baseUrl: endpoint,
    model,
    allowBackground: true,
    declared: { kind: "generation", generation: { context: { window: 32_000 }, output: { modalities: ["image"] } } },
  });
  await root.services.connection.setBinding({ principal, task: "generateImage", connectionId: connection.id });
  const { resolved } = await root.services.connection.resolve({ principal, task: "generateImage" });
  const nativeConnection: Resolved<"generateImage"> = { ...resolved, task: "generateImage" };
  const native = await root.app.runtime.executor.generateImage({ connection: nativeConnection, prompt: "The orbital loom.", n: 2, edit: { image: pixels } });
  expect(native.warnings.map(({ code }) => code)).toEqual(["sdk_unsupported_setting", "image_edit_dropped"]);
  const avatar = await root.services.assets.store({
    principal,
    bytes: makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)),
    kind: "avatar",
    mime: "image/png",
    enforceMagic: true,
  });
  const subject = await root.services.character.create({
    principal,
    input: createCharacterSchema.parse({ handle: "warning-subject", name: "Warning subject", description: "A traveller.", avatarAssetId: avatar.assetId }),
  });
  const filtered = await root.services.imagery.generatePicture({
    caller: principal,
    mode: "character",
    subjectCharacterId: subject.id,
    prompt: "The orbital loom.",
    n: 2,
    useAvatarReference: true,
    reuse: "never",
  });
  expect(filtered.warnings).toEqual([{ code: "image_edit_dropped", detail: expect.stringContaining(model) }]);
  const image = filtered.images[0];
  if (image === undefined) {
    throw new Error("the actual imagery warning path stored no generated image");
  }
  const stored = await root.services.assets.readOwnedAssetBytes(principal, image.assetId);
  expect(stored.mime).toBe("image/png");
  expect(Buffer.from(stored.bytes).equals(Buffer.from(pixels))).toBe(true);
  expect(requests).toHaveLength(2);
  expect(remaining).toBe(0);
});
