// The real operator route reads complete settings bytes through the owning domain, never an auth fallback.
import { automationTriggerFor } from "@orb/contracts/automation";
import { createCharacterSchema } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { createPersonaSchema } from "@orb/contracts/persona";
import { automationFires, characters } from "@orb/db";
import { ID_PREFIX } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { authConfigFromEnv } from "@orb/server/entry/auth";
import { expect, test } from "@orb/testkit/node";
import {
  createServerHarness,
  seedAutomationRule,
  seedAutomationTestFires,
  seedCharacter,
  seedPersona,
  seedPreset,
  seedRpgGame,
  seedUserSettings,
} from "@orb/testkit/node/composed";
import { eq, sql } from "drizzle-orm";

const PASSWORD = "operator-read-control-password";

test("the settings probe preserves key order and stored values while rejecting anonymous and delegated-admin readers", async () => {
  await using root = await createServerHarness({ authConfig: { ...authConfigFromEnv(), mode: "local", fallback: "deny" } });
  const zeta = { key: "application:debug-zeta", value: { marker: "operator-only-settings-marker", opaque: [null, true, 3] }, updatedAt: root.clock.now() };
  await root.services.settings.setGlobalSetting(zeta.key, zeta.value);
  root.clock.advance(1000);
  const alpha = { key: "application:debug-alpha", value: "stored-string-bytes", updatedAt: root.clock.now() };
  await root.services.settings.setGlobalSetting(alpha.key, alpha.value);
  const admin = await root.actor({ role: "admin" });
  const owner = await root.principalFor(root.ownerId);
  const signIn = async (principal: Principal): Promise<string> => {
    await root.services.admin.resetPassword({ principal: owner, userId: principal.userId, password: PASSWORD });
    const response = await root.http.request("/api/auth/login", {
      method: "POST",
      headers: { host: "localhost", [CSRF_HEADER]: "1" },
      body: new URLSearchParams({ handle: principal.handle, password: PASSWORD }),
    });
    expect(response.status).toBe(200);
    const cookie = response.headers
      .getSetCookie()
      .map((line) => line.split(";")[0])
      .join("; ");
    expect(cookie).not.toBe("");
    return cookie;
  };
  const adminCookie = await signIn(await root.principalFor(admin.id));
  const ownerCookie = await signIn(owner);
  for (const presented of ["", adminCookie]) {
    const refused = await root.http.request("/api/_debug/config/app", { headers: { host: "localhost", cookie: presented } });
    expect(refused.status).toBe(404);
    expect(await refused.text()).not.toContain(zeta.value.marker);
  }
  const admitted = await root.http.request("/api/_debug/config/app", {
    headers: { host: "localhost", cookie: ownerCookie },
  });
  expect(admitted.status).toBe(200);
  expect(await admitted.json()).toEqual({ effective: root.services.settings.getEffectiveConfig(), rows: [alpha, zeta] });

  const caller = await root.internalCallerFor(root.ownerId);
  const { chat } = await caller.chat.startChat({ characterIds: [] });
  const { row: persona } = await seedPersona(root, { principal: owner, input: createPersonaSchema.parse({ name: "Inspector persona", description: "" }) });
  const { row: preset } = await seedPreset(root, root.ownerId, { name: "Inspector preset", kind: "custom" });
  const created = await seedCharacter(root, {
    principal: owner,
    input: createCharacterSchema.parse({
      handle: "inspector-card",
      name: "Inspector card",
      description: "Stored card description",
      systemPrompt: "Stored private prompt",
    }),
  });
  await root.services.character.update({ principal: owner, characterId: created.view.id, input: { trustHtml: false, interactiveHtml: false } });
  const character = await root.db.select().from(characters).where(eq(characters.id, created.view.id)).get();
  if (character === undefined) {
    throw new Error("the production character update left no canonical row");
  }
  const settings = await seedUserSettings(root, {
    principal: owner,
    input: { section: "appearance", patch: {} },
  });
  const game = await seedRpgGame(root, { principal: owner, chatId: chat.id, mode: "lite" });
  const rule = await seedAutomationRule(root, {
    principal: owner,
    chatId: chat.id,
    name: "Inspector terminal control",
    timeZone: UTC_TIME_ZONE,
    trigger: automationTriggerFor("chatOpened"),
    actions: [{ type: "set_variable", scope: "global", key: "inspector_control", op: "set", value: "1" }],
  });
  const dryRun = await seedAutomationTestFires(root, { principal: owner, ruleId: rule.id });
  const terminal = dryRun.fires[0];
  if (terminal === undefined) {
    throw new Error("The production dry run did not supply its terminal fire.");
  }
  const reservedId = root.idSource.typeId(ID_PREFIX.automationFire);
  await root.db.insert(automationFires).values({ ...terminal, id: reservedId, outcome: "reserved", firedAt: terminal.firedAt + 1 });

  const raw = { futureVersion: "unparsed-inspector-evidence", opaque: [null, false, { order: ["zeta", "alpha"] }] };
  // Historic stored JSON must remain visible even when no current application schema accepts it.
  await root.db.run(sql`UPDATE user_settings SET config = ${JSON.stringify(raw)} WHERE user_id = ${root.ownerId}`);
  await root.db.run(sql`UPDATE presets SET config = ${JSON.stringify(raw)} WHERE id = ${preset.id}`);
  await root.db.run(sql`UPDATE personas SET metadata = ${JSON.stringify(raw)} WHERE id = ${persona.id}`);
  await root.db.run(sql`UPDATE rpg_games SET config = ${JSON.stringify(raw)} WHERE id = ${game.id}`);
  await root.db.run(sql`UPDATE chats SET runtime_variables = ${JSON.stringify(raw)} WHERE id = ${chat.id}`);
  await root.db.run(sql`UPDATE characters SET theme_override = ${JSON.stringify(raw)}, source = ${JSON.stringify(raw)} WHERE id = ${character.id}`);

  const read = async (path: string): Promise<unknown> => {
    const response = await root.http.request(path, { headers: { host: "localhost", cookie: ownerCookie } });
    expect(response.status, path).toBe(200);
    return await response.json();
  };
  expect(await read(`/api/_debug/config/user?userId=${root.ownerId}`)).toEqual({ count: 1, users: [{ ...settings, config: raw }] });
  const missingUserId = root.idSource.userId();
  expect(await read(`/api/_debug/config/user?userId=${missingUserId}`)).toEqual({ count: 0, users: [] });
  expect(await read(`/api/_debug/config/presets?ownerId=${root.ownerId}`)).toEqual({ count: 1, presets: [{ ...preset, config: raw }] });
  expect(await read(`/api/_debug/config/personas?ownerId=${root.ownerId}`)).toEqual({ count: 1, personas: [{ ...persona, metadata: raw }] });
  expect(await read(`/api/_debug/config/chat/${chat.id}`)).toMatchObject({
    room: {
      id: chat.id,
      title: chat.title,
      parentChatId: null,
      runtimeVariables: raw,
      participants: [{ kind: "human", userId: root.ownerId, characterId: null, activePersonaId: null, role: "host" }],
    },
    rpg: {
      id: game.id,
      chatId: chat.id,
      mode: game.mode,
      status: game.status,
      sessionNumber: game.sessionNumber,
      gmUserId: game.gmUserId,
      gmPresetId: game.gmPresetId,
      config: raw,
      createdAt: game.createdAt,
      updatedAt: game.updatedAt,
    },
  });
  const detail = await read(`/api/_debug/config/character/${character.id}`);
  expect(detail).toMatchObject({
    id: character.id,
    ownerId: root.ownerId,
    handle: character.handle,
    avatarAssetId: null,
    themeOverride: raw,
    backgroundOverride: null,
    card: { description: character.description, systemPrompt: character.systemPrompt, greetings: character.greetings, depthPrompt: null },
    provenance: { importedFrom: null, importHash: null, contentHash: character.contentHash, source: raw, creationDate: null, modificationDate: null },
    renderPolicy: { stored: { trustHtml: false, forbidExternalMedia: null, interactiveHtml: false }, resolved: { htmlTrust: "untrusted" }, cardTier: "tierA" },
  });
  expect(await read("/api/_debug/db/chats")).toMatchObject({
    count: 1,
    chats: [{ id: chat.id, title: chat.title, participantCount: 1, messageCount: 0 }],
  });
  expect(await read("/api/_debug/db/integrity")).toEqual({ ok: true, foreignKeyViolations: [], integrityCheck: ["ok"] });
  expect(await read(`/api/_debug/automation/fires?chatId=${chat.id}&ruleId=${rule.id}&limit=1`)).toEqual({ count: 1, fires: [terminal] });
  expect(await read(`/api/_debug/automation/fires?chatId=${chat.id}&ruleId=${rule.id}`)).toEqual({ count: dryRun.fires.length, fires: dryRun.fires });
  const missingChat = root.idSource.typeId(ID_PREFIX.chat);
  const absent = await root.http.request(`/api/_debug/config/chat/${missingChat}`, { headers: { host: "localhost", cookie: ownerCookie } });
  expect(absent.status).toBe(404);
  expect(await absent.json()).toEqual({ error: "no such chat" });
  const missingCharacter = root.idSource.typeId(ID_PREFIX.character);
  const absentCharacter = await root.http.request(`/api/_debug/config/character/${missingCharacter}`, { headers: { host: "localhost", cookie: ownerCookie } });
  expect(absentCharacter.status).toBe(404);
  expect(await absentCharacter.json()).toEqual({ error: "no such character" });
  for (const presented of ["", adminCookie]) {
    const refused = await root.http.request(`/api/_debug/config/character/${character.id}`, { headers: { host: "localhost", cookie: presented } });
    expect(refused.status).toBe(404);
    expect(await refused.text()).not.toContain(character.systemPrompt);
  }
});
