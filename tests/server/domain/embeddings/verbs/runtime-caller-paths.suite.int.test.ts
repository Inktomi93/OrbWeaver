// @subject packages/server/src/domain/imagery/verbs/generate-picture.ts
// @subject packages/server/src/domain/rpg/tools/rounds/tool-round.ts
// @subject packages/server/src/domain/rpg/tools/rounds/populate.ts
// @subject packages/inference/src/roles/executor.ts
import { createCharacterSchema } from "@orb/contracts/character";
import { RPG_NO_CHANGES_TOOL, RPG_STATE_CHANGES_FIELD } from "@orb/contracts/rpg";
import { assets, auditLogs, rpgSheets } from "@orb/db";
import { ProviderError } from "@orb/inference";
import { ID_PREFIX } from "@orb/kit/ids";
import { getLog } from "@orb/server/foundation/observability";
import { expect } from "@orb/testkit/node";
import { createServerHarness, makeAssetBytes } from "@orb/testkit/node/composed";
import { TEST_PROVIDER_ID } from "@orb/testkit/node/helpers";
import { and, eq } from "drizzle-orm";
import { vi } from "vitest";
import { FUNDING_KEY, fundingConnection, fundingRoom, test } from "./runtime-funding.fixtures.ts";

test("the composed imagery orchestrator stores real image provenance and strikes only its failed foreground call", async ({
  app,
  harness,
  db,
  ownerCaller,
  fundingProvider,
}) => {
  const key = await ownerCaller.credentials.add({ provider: TEST_PROVIDER_ID, key: FUNDING_KEY, metadata: { auth: "endpoint" } });
  const connection = await fundingConnection({ ownerCaller, harness, task: "generateImage", credentialId: key.id, allowBackground: false });
  await ownerCaller.connection.setBinding({ task: "generateImage", connectionId: connection.connectionId });
  fundingProvider.image(makeAssetBytes(harness.idSource.typeId(ID_PREFIX.asset)));
  const caller = await harness.principalFor(harness.ownerId);
  const input = { caller, mode: "free" as const, prompt: "The funded orbital ledger." };
  const picture = await app.services.imagery.generatePicture(input);
  expect(picture.images).toHaveLength(1);
  const image = picture.images[0];
  if (image === undefined) {
    throw new Error("the real imagery producer returned no image");
  }
  expect(await db.select().from(assets).where(eq(assets.id, image.assetId))).toMatchObject([
    { ownerId: harness.ownerId, kind: "generated", mime: "image/png" },
  ]);
  expect(await ownerCaller.imagery.readProvenance({ assetId: image.assetId })).toMatchObject({ model: connection.model, prompt: input.prompt });
  const before = await db.select().from(assets);
  fundingProvider.status(401);
  await expect(app.services.imagery.generatePicture(input)).toThrowProviderError("auth_failed");
  expect(await db.select().from(assets)).toEqual(before);
  expect((await ownerCaller.credentials.list()).find((row) => row.id === key.id)?.revokedReason).toBe("auth_failed");
  expect(
    await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, key.id), eq(auditLogs.action, "credential.markRevoked"))),
  ).toHaveLength(1);
  expect(fundingProvider.calls).toHaveLength(2);
});

for (const vehicle of ["structured", "tools"] as const) {
  test(`a composed RPG ${vehicle} post-commit round preserves canon and strikes its actual failed call`, async ({ fundingProvider, networkExecution }) => {
    await using root = await createServerHarness({
      providerFetch: fundingProvider.fetch,
      runtimeSpan: fundingProvider.span,
      secretBoxKey: Buffer.alloc(32, 1),
      networkExecution,
    });
    const caller = await root.internalCallerFor(root.ownerId);
    const key = await caller.credentials.add({ provider: TEST_PROVIDER_ID, key: FUNDING_KEY, metadata: { auth: "endpoint" } });
    const connection = await fundingConnection({ ownerCaller: caller, harness: root, task: "chat", credentialId: key.id, allowBackground: false });
    await caller.connection.setBinding({ task: "chat", connectionId: connection.connectionId });
    const chatId = await fundingRoom(caller);
    await caller.rpg.createGame({ chatId, mode: "lite" });
    await caller.rpg.updateConfig({ chatId, extractionMode: "cheap", patch: { stateCaptureVehicle: vehicle } });
    expect(await caller.rpg.getConfigView({ chatId })).toMatchObject({ extractionMode: "cheap", stateCaptureVehicle: vehicle });
    if (vehicle === "tools") {
      fundingProvider.toolReply(RPG_NO_CHANGES_TOOL, JSON.stringify({}));
    } else {
      fundingProvider.reply(JSON.stringify({ [RPG_STATE_CHANGES_FIELD]: [{ tool: RPG_NO_CHANGES_TOOL, args: {} }] }));
    }
    const principal = await root.principalFor(root.ownerId);
    const first = await root.services.chat.send({ principal, chatId, content: "The party reaches the orbital ledger." });
    expect(first.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    await root.settleBackground();
    const before = fundingProvider.calls.length;
    expect(before).toBeGreaterThanOrEqual(2);
    const path = fundingProvider.calls.at(-1);
    if (path === undefined) {
      throw new Error("the genuine RPG round never called its provider");
    }
    fundingProvider.statusFor(path, 401, 1);
    using warn = vi.spyOn(getLog(), "warn");
    const committed = await root.services.chat.send({ principal, chatId, content: "The ledger remains open after the next beat." });
    await root.settleBackground();
    await vi.waitFor(async () => {
      root.timers.advance(1000);
      expect((await caller.credentials.list()).find((row) => row.id === key.id)?.revokedReason).toBe("auth_failed");
    });
    expect(committed.aborted).toBe(false);
    expect(committed.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect((await caller.chat.listMessages({ chatId })).messages.slice(-2).map((message) => message.id)).toEqual(
      committed.messages.map((message) => message.id),
    );
    const failure = fundingProvider.errors.at(-1);
    expect(failure).toBeInstanceOf(ProviderError);
    expect(failure).toMatchObject({ kind: "auth_failed" });
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ event: "rpg.toolround.failed", chatId, err: failure }), expect.any(String));
    expect(fundingProvider.calls.slice(before)).toEqual([path, path]);
    expect(
      await root.db
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.entityId, key.id), eq(auditLogs.action, "credential.markRevoked"))),
    ).toHaveLength(1);
  });
}

test("the real host populate caller reports a provider refusal without overwriting its successfully filled sheet", async ({
  harness,
  db,
  ownerCaller,
  fundingProvider,
}) => {
  const key = await ownerCaller.credentials.add({ provider: TEST_PROVIDER_ID, key: FUNDING_KEY, metadata: { auth: "endpoint" } });
  const connection = await fundingConnection({ ownerCaller, harness, task: "chat", credentialId: key.id, allowBackground: false });
  await ownerCaller.connection.setBinding({ task: "chat", connectionId: connection.connectionId });
  const character = await ownerCaller.character.create({
    input: createCharacterSchema.parse({ handle: "funding-populate", name: "Funding archivist", description: "The archivist begins at level two." }),
  });
  const { chat } = await ownerCaller.chat.startChat({ characterIds: [character.id], opening: "none" });
  await ownerCaller.rpg.createGame({ chatId: chat.id, mode: "lite" });
  fundingProvider.reply(JSON.stringify({ sheet: { title: "Archivist", level: 2 } }));
  const input = { chatId: chat.id, actorRef: { kind: "character" as const, characterId: character.id } };
  expect(await ownerCaller.rpg.populateFromCharacter(input)).toEqual({ ok: true, populated: true });
  const before = await db.select().from(rpgSheets);
  expect(before).toHaveLength(1);
  fundingProvider.status(401);
  expect(await ownerCaller.rpg.populateFromCharacter(input)).toMatchObject({ ok: false, reason: expect.any(String) });
  expect(await db.select().from(rpgSheets)).toEqual(before);
  expect((await ownerCaller.credentials.list()).find((row) => row.id === key.id)?.revokedReason).toBe("auth_failed");
  expect(
    await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, key.id), eq(auditLogs.action, "credential.markRevoked"))),
  ).toHaveLength(1);
  expect(fundingProvider.calls).toHaveLength(2);
});
