import { createCharacterSchema } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY, CSRF_HEADER } from "@orb/contracts/identity";
import { IMAGERY_NEGATIVE_SLOT_ID } from "@orb/contracts/imagery";
import { providerDefSchema, WARNING_CODE } from "@orb/contracts/inference";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { resolveProseText } from "@orb/contracts/prose";
import { resolveImageryCaption, resolveImageryTemplate } from "@orb/contracts/settings";
import type { Resolved } from "@orb/inference";
import { ProviderError } from "@orb/inference";
import { ID_PREFIX } from "@orb/kit/ids";
import { processMacros } from "@orb/kit/macro";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import type { AppRouter } from "@orb/server";
import { PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import {
  CORPUS_PROVIDER_ENDPOINT,
  captureCookieAuth,
  createCorpusProviderExecution,
  createServerHarness,
  makeAssetBytes,
  seedAdminProvider,
  seedChatInvite,
  seedCorpusConnections,
  seedInvitedChatParticipant,
} from "@orb/testkit/node/composed";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { proseOverrideFromLegacy } from "#contracts/prose-slot/index.ts";
import { SIZE_PRESETS } from "#server/domain/imagery/substrate/size.ts";

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
  await seedInvitedChatParticipant(root, { principal: member, inviteId: invite.invite.id });
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
  await expect(preview()).rejects.toThrow(ProviderError);
  expect(wire.requests).toHaveLength(5);
});

test("a member's room image uses the host's image connection and live negative prose, not the member's settings", async () => {
  const wire = physicalExecution([]);
  await using root = await createServerHarness({
    startJobs: false,
    providerFetch: wire.execute,
    secretBoxKey: Buffer.alloc(32, 3),
    env: { [AUTH_MODE_KEY]: "local", [AUTH_FALLBACK_KEY]: "deny" },
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

test("the count, size and negative on chat.generateImage reach the provider request, and every picture posts in one message", async () => {
  const wire = physicalExecution([]);
  await using root = await createServerHarness({ startJobs: false, providerFetch: wire.execute, secretBoxKey: Buffer.alloc(32, 3) });
  const room = await policyRoom(root);
  wire.images.push(makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)), makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)));
  const negative = "extra fingers, watermark";
  const caller = await root.internalCallerFor(room.member.userId);
  const posted = await caller.chat.generateImage({
    chatId: room.chat.id,
    mode: "free",
    prompt: "The orbital loom.",
    n: 2,
    size: "portrait",
    negative,
    gallery: false,
    timeZone: UTC_TIME_ZONE,
  });
  expect(wire.requests).toHaveLength(1);
  const portrait = SIZE_PRESETS.portrait;
  expect(await wire.requests[0]?.clone().json()).toMatchObject({
    n: 2,
    size: `${portrait.width}x${portrait.height}`,
    prompt: expect.stringContaining(negative),
  });
  const stored = await root.services.assets.listOwned({ principal: room.host, kind: "generated", limit: 10 });
  expect(stored).toHaveLength(2);
  for (const asset of stored) {
    expect(posted.content).toContain(`asset:${asset.assetId}`);
  }
});

test("a chat-completions image wire warns of the count and size it dropped, a default size stays quiet, and a rule-fired picture warns the same", async () => {
  const wire = physicalExecution([]);
  let pixels: Uint8Array = new Uint8Array();
  const reply = (): Response =>
    Response.json({
      id: "image-reply",
      object: "chat.completion",
      created: 0,
      model: IMAGE_MODEL,
      choices: [
        {
          index: 0,
          ["finish_reason"]: "stop",
          message: {
            role: "assistant",
            content: "",
            images: [{ type: "image_url", ["image_url"]: { url: `data:image/png;base64,${Buffer.from(pixels).toString("base64")}` } }],
          },
        },
      ],
    });
  await using root = await createServerHarness({
    startJobs: false,
    secretBoxKey: Buffer.alloc(32, 3),
    networkExecution: { resolver: () => Promise.resolve([PUBLIC_PEER_ADDRESS]) },
    providerFetch: async (input, init) => {
      const request = new Request(input, init);
      return request.method === "POST" ? reply() : await wire.execute(request);
    },
  });
  const room = await policyRoom(root);
  pixels = makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset));
  const credential = await root.services.credentials.add({ principal: room.host, provider: "openrouter", key: HOST_KEY });
  const modalities = await root.services.connection.create({
    principal: room.host,
    providerId: "openrouter",
    credentialId: credential.id,
    baseUrl: null,
    model: IMAGE_MODEL,
    allowBackground: true,
    declared: {
      kind: "generation",
      generation: { context: { window: 32_000 }, output: { modalities: ["text", "image"] } },
      features: { detectServer: false, images: "chat-modalities" },
    },
  });
  await root.services.connection.setBinding({ principal: room.host, task: "generateImage", connectionId: modalities.id });
  const warned: string[] = [];
  using subscription = new DisposableStack();
  subscription.defer(
    root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
      if (event.chatId === room.chat.id && event.type === "warning") {
        warned.push(event.code);
      }
    }),
  );
  const caller = await root.internalCallerFor(room.host.userId);
  const request = { chatId: room.chat.id, mode: "free", prompt: "The orbital loom.", gallery: false, timeZone: UTC_TIME_ZONE } as const;
  await caller.chat.generateImage(request);
  expect(warned).toEqual([]);
  pixels = makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset));
  await caller.chat.generateImage({ ...request, n: 2, size: "portrait" });
  expect(warned).toEqual([WARNING_CODE.imageCountDropped, WARNING_CODE.imageSizeDropped]);

  // A rule-fired picture spends the same wire, so it owes the room the same notices.
  warned.length = 0;
  pixels = makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset));
  const rule = await root.services.automation.createRule({
    principal: room.host,
    chatId: room.chat.id,
    name: "Two tall drawings",
    trigger: { bus: "chat", type: "chatOpened" },
    predicateCel: null,
    actions: [
      { type: "generate_image", mode: "free", prompt: "a lighthouse", n: 2, size: "portrait", useAvatarReference: false, reuse: "never", quiet: false },
    ],
    timeZone: UTC_TIME_ZONE,
  });
  await root.services.automation.setRuleEnabled({ principal: room.host, ruleId: rule.id, enabled: true });
  await root.services.automation.handleEvent({ type: "chatOpened", chatId: room.chat.id });
  expect(warned).toEqual([WARNING_CODE.imageCountDropped, WARNING_CODE.imageSizeDropped]);

  // The notices are room-wide: the host who owns the picture and the member who only watches both replay both pictures' notices.
  const replayed = async (principal: Principal): Promise<readonly string[]> =>
    (await root.services.chat.replayChatEvents({ principal, chatId: room.chat.id })).flatMap(({ event }) => (event.type === "warning" ? [event.code] : []));
  const both = [WARNING_CODE.imageCountDropped, WARNING_CODE.imageSizeDropped, WARNING_CODE.imageCountDropped, WARNING_CODE.imageSizeDropped];
  expect(await replayed(room.host)).toEqual(both);
  expect(await replayed(room.member)).toEqual(both);
});

test("a count, size or negative skips the reuse gate under default reuse, and that picture is never reused", async () => {
  const wire = physicalExecution([CAPTION, CAPTION, CAPTION, CAPTION]);
  await using root = await createServerHarness({ startJobs: false, providerFetch: wire.execute, secretBoxKey: Buffer.alloc(32, 3) });
  const room = await policyRoom(root);
  for (let index = 0; index < 5; index += 1) {
    wire.images.push(makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)));
  }
  const portrait = { caller: room.host, mode: CAPTION_MODE, subjectCharacterId: room.character.id } as const;
  const plain = await root.services.imagery.generatePicture(portrait);
  expect(plain.reused).toBe(false);
  expect((await root.services.imagery.generatePicture(portrait)).reused).toBe(true);
  for (const knob of [{ n: 2 }, { size: "landscape" }, { negative: "extra fingers" }] as const) {
    expect(await root.services.imagery.generatePicture({ ...portrait, ...knob })).toMatchObject({ reused: false });
  }
  const after = await root.services.imagery.generatePicture(portrait);
  expect(after).toMatchObject({ reused: true, images: [{ assetId: plain.images[0]?.assetId }] });
});

test("imagery retains a real dropped-edit warning and a real native dropped-count warning", async () => {
  const endpoint = "https://native-warning-image.test/v1beta";
  const model = "native-warning-image";
  const requests: Request[] = [];
  let pixels: Uint8Array = new Uint8Array();
  let remaining = 2;
  await using root = await createServerHarness({
    startJobs: false,
    secretBoxKey: Buffer.alloc(32, 3),
    networkExecution: { resolver: () => Promise.resolve([PUBLIC_PEER_ADDRESS]) },
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
  expect(native.warnings.map(({ code }) => code)).toEqual([WARNING_CODE.imageCountDropped, WARNING_CODE.imageEditDropped]);
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
  expect(filtered.warnings).toEqual([
    { code: WARNING_CODE.imageEditDropped, detail: expect.stringContaining(model) },
    { code: WARNING_CODE.imageCountDropped, detail: expect.stringContaining(model) },
  ]);
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
