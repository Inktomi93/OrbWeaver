import "../../../support/composed-real.ts";
import type { Principal } from "@orb/contracts/identity";
import { IMAGE_DETAILS, modelIdSchema, providerIdSchema } from "@orb/contracts/inference";
import { chatParticipants, connectionBindings, messages, messageVariants, userConnections } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId, newId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { vi } from "vitest";
import { z } from "zod";
import type { RecordedRequest } from "../../../inference/backends/_hosted-support.ts";
import { openAiTextStream, scriptedSseFetch } from "../../../inference/backends/_hosted-support.ts";
import { makeGenerationCapability } from "../../../support/factories/resolved-connection.ts";
import { seedUser } from "../../../support/factories/user.ts";
import { test as base, expect } from "../../../support/fixtures.ts";
import { seedCharacter } from "../../domain/chat/_support.ts";

const IMAGE_URL = "image_url";
const bodySchema = z.object({
  messages: z.array(
    z.object({
      content: z
        .union([
          z.string(),
          z.array(z.object({ type: z.string(), [IMAGE_URL]: z.object({ url: z.string(), detail: z.enum(IMAGE_DETAILS).optional() }).optional() }).loose()),
        ])
        .nullish(),
    }),
  ),
});

const test = base.extend<{ requests: RecordedRequest[]; providerFetch: typeof fetch }>({
  requests: async ({}, use): Promise<void> => {
    await use([]);
  },
  providerFetch: async ({ requests }, use): Promise<void> => {
    const sse = scriptedSseFetch([openAiTextStream("The image is red."), openAiTextStream("Only the current member's image is visible.")], requests);
    await use((input, init) => {
      if (String(input).endsWith("/models")) {
        return Promise.resolve(Response.json({ data: [{ id: "quality-model" }] }));
      }
      return sse(input, init);
    });
  },
});

test("member quality and historical attachment refusals use the actual room-scoped compose and SDK path", async ({ app, db, services, clock, requests }) => {
  const host = await seedUser(db, { id: newId<UserId>(), handle: castId("qualityhost") });
  const member = await seedUser(db, { id: newId<UserId>(), handle: castId("qualitymember") });
  const principal = (user: typeof host): Principal => ({ userId: user.id, handle: user.handle, role: user.role, externalId: null, via: "header" });
  const hostPrincipal = principal(host);
  const memberPrincipal = principal(member);
  await services.settings.updateUserSettingsSection({
    principal: hostPrincipal,
    input: { section: "chat", patch: { attachmentQuality: { imageDetail: "high", videoMaxResolution: "original" } } },
  });
  await services.settings.updateUserSettingsSection({
    principal: memberPrincipal,
    input: { section: "chat", patch: { attachmentQuality: { imageDetail: "low", videoMaxResolution: "480" } } },
  });
  await services.settings.updateUserSettingsSection({ principal: hostPrincipal, input: { section: "memory", patch: { enabled: false } } });
  const chatConnection = mintTypeId(ID_PREFIX.userConnection);
  const embedConnection = mintTypeId(ID_PREFIX.userConnection);
  await db.insert(userConnections).values([
    {
      id: chatConnection,
      ownerId: host.id,
      label: "Quality test",
      providerId: providerIdSchema.parse("custom-openai"),
      model: modelIdSchema.parse("quality-model"),
      baseUrl: "https://quality.example/v1",
      declared: { kind: "generation", generation: makeGenerationCapability({ input: ["text", "image"], imageDetail: true }) },
      createdAt: clock.now(),
      updatedAt: clock.now(),
    },
    {
      id: embedConnection,
      ownerId: host.id,
      label: "Uncalled embedding role",
      providerId: providerIdSchema.parse("local-light"),
      model: modelIdSchema.parse("jinaai/jina-clip-v2"),
      createdAt: clock.now(),
      updatedAt: clock.now(),
    },
  ]);
  for (const [task, connectionId] of [
    ["chat", chatConnection],
    ["embed", embedConnection],
  ] as const) {
    await db.insert(connectionBindings).values({ id: mintTypeId(ID_PREFIX.connectionBinding), actorKind: "user", userId: host.id, task, connectionId });
  }
  const characterId = await seedCharacter(db, host.id, "quality", { id: mintTypeId(ID_PREFIX.character) });
  const { chat } = await services.chat.startChat({ principal: hostPrincipal, characterIds: [characterId], opening: "none" });
  await db.insert(chatParticipants).values({
    id: mintTypeId(ID_PREFIX.chatParticipant),
    chatId: chat.id,
    kind: "human",
    userId: member.id,
    role: "member",
    joinedAt: clock.now(),
    joinSeq: 0,
  });
  const live = new AbortController();
  app.presence.connect(host.id, live.signal);
  try {
    const image: Promise<Buffer> = sharp({ create: { width: 16, height: 16, channels: 3, background: { r: 255, g: 0, b: 0 } } })
      .png()
      .toBuffer();
    const bytes = await image;
    const asset = await services.assets.store({ principal: memberPrincipal, kind: "attachment", mime: "image/png", bytes, enforceMagic: true });
    expect(app.assets).toBe(services.assets);
    const loadBytes = vi.spyOn(app.assets, "loadAssetBytes");
    const resolveRow = vi.spyOn(app.assets, "assetCasRefById");
    try {
      await services.chat.send({ principal: memberPrincipal, chatId: chat.id, content: `Inspect this ![picture](asset:${asset.assetId}).` });
      expect(requests).toHaveLength(1);
      const body = bodySchema.parse(requests[0]?.body);
      const images = body.messages.flatMap((message) => (Array.isArray(message.content) ? message.content.filter((part) => part.type === IMAGE_URL) : []));
      expect(images).toEqual([{ type: "image_url", [IMAGE_URL]: { url: `data:image/png;base64,${bytes.toString("base64")}`, detail: "high" } }]);
      expect((await services.settings.getUserSettings({ principal: memberPrincipal })).config.chat.attachmentQuality.imageDetail).toBe("low");
      // The same-room allow proves compose reads the exposed asset handle's methods at invocation time.
      expect(loadBytes).toHaveBeenCalledWith(asset.assetId);
      const departed = await seedUser(db, { id: newId<UserId>(), handle: castId("qualitydeparted") });
      const foreign = await seedUser(db, { id: newId<UserId>(), handle: castId("qualityforeign") });
      const { chat: otherChat } = await services.chat.startChat({ principal: hostPrincipal, characterIds: [characterId], opening: "none" });
      await db.insert(chatParticipants).values([
        {
          id: mintTypeId(ID_PREFIX.chatParticipant),
          chatId: chat.id,
          kind: "human",
          userId: departed.id,
          role: "member",
          joinedAt: clock.now(),
          joinSeq: 0,
          leftSeq: 1,
        },
        {
          id: mintTypeId(ID_PREFIX.chatParticipant),
          chatId: otherChat.id,
          kind: "human",
          userId: foreign.id,
          role: "member",
          joinedAt: clock.now(),
          joinSeq: 0,
        },
      ]);
      const departedAsset = await services.assets.store({ principal: principal(departed), kind: "attachment", mime: "image/png", bytes, enforceMagic: true });
      const foreignAsset = await services.assets.store({ principal: principal(foreign), kind: "attachment", mime: "image/png", bytes, enforceMagic: true });
      const goneAssetId = mintTypeId(ID_PREFIX.asset);
      const [slot] = await db
        .select({ selectedVariantId: messages.selectedVariantId })
        .from(messages)
        .where(and(eq(messages.chatId, chat.id), eq(messages.role, "user")))
        .limit(1);
      if (slot?.selectedVariantId === undefined || slot.selectedVariantId === null) {
        throw new Error("The successful member turn did not persist its user variant.");
      }
      // Seed hostile historical references, bypassing send's own attachment-owner filter intentionally.
      await db
        .update(messageVariants)
        .set({
          content: [
            `CURRENT_ROOM_MARKER ![current](asset:${asset.assetId})`,
            `OTHER_ROOM_MARKER ![foreign](asset:${foreignAsset.assetId})`,
            `DEPARTED_MARKER ![departed](asset:${departedAsset.assetId})`,
            `GONE_MARKER ![gone](asset:${goneAssetId})`,
          ].join("\n"),
        })
        .where(eq(messageVariants.id, slot.selectedVariantId));
      loadBytes.mockClear();
      resolveRow.mockClear();
      await services.chat.send({ principal: hostPrincipal, chatId: chat.id, content: "Inspect the earlier attachment boundary markers." });
      expect(requests).toHaveLength(2);
      const refusedBody = bodySchema.parse(requests[1]?.body);
      const refusedImages = refusedBody.messages.flatMap((message) =>
        Array.isArray(message.content) ? message.content.filter((part) => part.type === IMAGE_URL) : [],
      );
      expect(refusedImages).toEqual(images);
      for (const marker of ["CURRENT_ROOM_MARKER", "OTHER_ROOM_MARKER", "DEPARTED_MARKER", "GONE_MARKER"]) {
        expect(JSON.stringify(refusedBody)).toContain(marker);
      }
      expect(loadBytes).toHaveBeenCalledWith(asset.assetId);
      for (const refusedId of [foreignAsset.assetId, departedAsset.assetId, goneAssetId]) {
        expect(resolveRow).toHaveBeenCalledWith(refusedId);
        expect(loadBytes).not.toHaveBeenCalledWith(refusedId);
      }
    } finally {
      loadBytes.mockRestore();
      resolveRow.mockRestore();
    }
  } finally {
    live.abort();
  }
});
