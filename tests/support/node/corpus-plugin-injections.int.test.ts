// @subject packages/server/src/domain/chat/assembly/context.ts
// @subject packages/server/src/domain/plugin/substrate/plugin-macros.ts
import { spawn } from "node:child_process";
import { createCharacterSchema } from "@orb/contracts/character";
import { CHAT_INJECTION_POSITIONS } from "@orb/contracts/chat";
import { createPersonaSchema } from "@orb/contracts/persona";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { neutralizeMacros } from "@orb/kit/macro";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { pluginMacroName } from "@orb/server/domain/plugin";
import { seedCorpusActors } from "./corpus-actors.ts";
import { captureCorpusPluginHost } from "./corpus-plugin-host.ts";
import { CORPUS_EMBED_MODEL, CORPUS_EMBEDDING_VECTOR, CORPUS_STRUCTURED_REPLIES, CORPUS_TEXT_MODEL, createCorpusProviderExecution } from "./corpus-provider.ts";
import { seedCorpusLibraries } from "./corpus-seed.ts";
import { makePluginBundle } from "./factories/plugin.ts";
import { seedCharacterRows, seedInstalledPluginRows, seedPluginGrantRows } from "./factories/rows.ts";
import { expect, test } from "./fixtures.ts";
import { createServerHarness } from "./server.ts";

const SLUG = "injection-ledger";
const COUNT = "native:macro-count";
const OWNER_VALUE = "Owner native value {{incvar::guestEscape}}";
const MEMBER_VALUE = "Member native value {{incvar::guestEscape}}";
const MACRO = `{{${pluginMacroName(SLUG, "witness")}}}`;
const BROKEN = `{{${pluginMacroName(SLUG, "broken")}}}`;
const PRIVATE_FAILURE = "Private guest failure";
const manifest = pluginManifestSchema.parse({
  id: SLUG,
  name: "Native injection ledger",
  description: "Captures authored injection consumption through the native guest.",
  version: "1.0.0",
  hostVersion: PLUGIN_HOST_VERSIONS[0],
  entry: PLUGIN_MAIN_ENTRY,
  capabilities: ["chat.transform", "storage.kv"],
});

function guest(value: string): string {
  return `const h=orb.host(1);
  h.macros.register({name:"witness",description:"Native value",resolve:async()=>{
    const count=Number(await h.storage.get(${JSON.stringify(COUNT)})??"0")+1;
    await h.storage.set(${JSON.stringify(COUNT)},String(count));return ${JSON.stringify(value)};
  }});
  h.macros.register({name:"broken",description:"Refused native value",resolve:async()=>{throw new Error(${JSON.stringify(PRIVATE_FAILURE)});}});`;
}

test("native plugin values render once in authored injections without re-expanding prepared or foreign content", { tags: ["slow"] }, async () => {
  const bodies: string[] = [];
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: (body) => {
      bodies.push(body);
      return "Native injection reply.";
    },
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using root = await createServerHarness({ pluginSpawn: spawn, providerFetch: physical.execute });
  const actors = await seedCorpusActors(root);
  const library = await seedCorpusLibraries(root);
  const caller = await root.internalCallerFor(root.ownerId);
  const chatId = library.room.chat.id;
  await root.services.chat.setChatAnchorPersona({ principal: actors.owner, chatId, personaId: library.persona.id });
  const installed = await seedInstalledPluginRows(root, {
    caller: actors.owner,
    bundle: makePluginBundle(manifest, guest(OWNER_VALUE), root.clock.now()),
    grant: [],
  });
  await seedPluginGrantRows(root, {
    caller: actors.owner,
    pluginId: installed.plugin.id,
    grant: manifest.capabilities,
    acknowledgedNetHosts: [],
    enable: true,
  });
  const templates: Awaited<ReturnType<typeof caller.chat.setChatInjection>>[] = [];
  for (const position of CHAT_INJECTION_POSITIONS) {
    templates.push(
      await caller.chat.setChatInjection({
        chatId,
        position,
        role: "system",
        depth: 0,
        order: 20,
        content: `${position}: ${MACRO} / {{char}} / {{user}} / ${BROKEN}`,
      }),
    );
  }
  // Insert backwards; production's persisted order must govern both mutation and delivery.
  templates.push(
    await caller.chat.setChatInjection({
      chatId,
      position: "in_chat",
      role: "user",
      depth: 0,
      order: 10,
      content: "ordered-second: {{getvar::injectionRuns}}",
    }),
  );
  templates.push(
    await caller.chat.setChatInjection({ chatId, position: "in_chat", role: "user", depth: 0, order: 5, content: "ordered-first: {{incvar::injectionRuns}}" }),
  );
  const send = (principal: typeof actors.owner, personaId: typeof library.persona.id): ReturnType<typeof root.services.chat.send> =>
    root.services.chat.send({
      principal,
      chatId,
      personaId,
      content: "Consume authored native injections.",
      timeZone: UTC_TIME_ZONE,
      intent: { maxOutputTokens: 64 },
      guided: { action: "response", input: "Prepared steer {{incvar::steerEscape}}", placement: { kind: "inject", role: "user" } },
    });
  expect((await send(actors.owner, library.persona.id)).aborted).toBe(false);
  const ownerWire = bodies.at(-1);
  expect(ownerWire).toBeDefined();
  for (const position of CHAT_INJECTION_POSITIONS) {
    expect(ownerWire).toContain(`${position}: ${neutralizeMacros(OWNER_VALUE)} / ${library.character.name} / ${library.persona.name} /`);
  }
  expect(ownerWire).toContain("ordered-first: 1");
  expect(ownerWire).toContain("ordered-second: 1");
  expect(ownerWire?.indexOf("ordered-first:")).toBeLessThan(ownerWire?.indexOf("ordered-second:") ?? 0);
  expect(ownerWire).toContain(neutralizeMacros("Prepared steer {{incvar::steerEscape}}"));
  expect(ownerWire).not.toContain(BROKEN);
  expect(ownerWire).not.toContain(PRIVATE_FAILURE);
  expect((await captureCorpusPluginHost(root, installed.plugin.id)).observations[COUNT]).toBe(1);
  expect(await caller.chat.getRuntimeVariables({ chatId })).toMatchObject({ injectionRuns: "1" });
  expect(await caller.chat.getRuntimeVariables({ chatId })).not.toHaveProperty("guestEscape");
  expect(await caller.chat.getRuntimeVariables({ chatId })).not.toHaveProperty("steerEscape");
  expect(await caller.chat.listChatInjections({ chatId })).toEqual(expect.arrayContaining(templates));

  const member = await root.principalFor(actors.secondUserId);
  const other = await root.internalCallerFor(member.userId);
  await expect(other.chat.setChatInjection({ chatId, position: "in_chat", role: "system", depth: 0, content: "Foreign replacement" })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  const invite = await root.services.chat.createInvite({ principal: actors.owner, chatId, input: { invitedHandle: member.handle } });
  await root.services.chat.acceptInvite({ principal: member, inviteId: invite.invite.id });
  const persona = await root.services.persona.create({
    principal: member,
    input: createPersonaSchema.parse({ name: "Native member persona", description: "Member identity witness." }),
  });
  const memberInstall = await seedInstalledPluginRows(root, {
    caller: member,
    bundle: makePluginBundle(manifest, guest(MEMBER_VALUE), root.clock.now()),
    grant: [],
  });
  await seedPluginGrantRows(root, {
    caller: member,
    pluginId: memberInstall.plugin.id,
    grant: manifest.capabilities,
    acknowledgedNetHosts: [],
    enable: true,
  });
  await using presenceLifetime = new AsyncDisposableStack();
  const online = new AbortController();
  presenceLifetime.defer(() => online.abort());
  root.app.presence.connect(root.ownerId, online.signal);
  const priorRequests = bodies.length;
  expect((await send(member, persona.id)).aborted).toBe(false);
  expect(bodies).toHaveLength(priorRequests + 1);
  const memberWire = bodies.at(-1);
  expect(memberWire).toContain(`in_chat: ${neutralizeMacros(OWNER_VALUE)} / ${library.character.name} / ${library.persona.name} /`);
  expect(memberWire).toContain(`${persona.name}: Consume authored native injections.`);
  expect(memberWire).not.toContain(neutralizeMacros(MEMBER_VALUE));
  expect((await captureCorpusPluginHost(root, installed.plugin.id)).observations[COUNT]).toBe(2);
  expect((await captureCorpusPluginHost(root, memberInstall.plugin.id, member.userId)).observations).not.toHaveProperty(COUNT);
  await expect(other.chat.setChatInjection({ chatId, position: "in_chat", role: "system", depth: 0, content: "Member replacement" })).rejects.toMatchObject({
    code: "BAD_REQUEST",
  });

  await root.services.plugin.setEnabled({ caller: actors.owner, pluginId: installed.plugin.id, enabled: false });
  expect((await send(actors.owner, library.persona.id)).aborted).toBe(false);
  expect(bodies.at(-1)).not.toContain(neutralizeMacros(OWNER_VALUE));
  expect(bodies.at(-1)).not.toContain(neutralizeMacros(MEMBER_VALUE));
  expect((await captureCorpusPluginHost(root, installed.plugin.id)).observations[COUNT]).toBe(2);
  expect(await caller.chat.getRuntimeVariables({ chatId })).toMatchObject({ injectionRuns: "3" });
  expect(await caller.chat.listChatInjections({ chatId })).toEqual(expect.arrayContaining(templates));
  const memberCharacter = await seedCharacterRows(root, {
    principal: member,
    input: createCharacterSchema.parse({ handle: "member-injection", name: "Member native character", description: "Owned member character." }),
  });
  const memberRoom = await root.services.chat.startChat({
    principal: member,
    characterIds: [memberCharacter.view.id],
    anchorPersonaId: persona.id,
    opening: "none",
  });
  await other.chat.setChatInjection({ chatId: memberRoom.chat.id, position: "in_chat", role: "system", depth: 0, content: `member-owned: ${MACRO}` });
  const beforeOwned = bodies.length;
  expect(
    (
      await root.services.chat.send({
        principal: member,
        chatId: memberRoom.chat.id,
        content: "Own funding scope.",
        timeZone: UTC_TIME_ZONE,
        intent: { maxOutputTokens: 64 },
      })
    ).aborted,
  ).toBe(false);
  expect(bodies).toHaveLength(beforeOwned + 1);
  expect(bodies.at(-1)).toContain(`member-owned: ${neutralizeMacros(MEMBER_VALUE)}`);
  expect(bodies.at(-1)).not.toContain(neutralizeMacros(OWNER_VALUE));
  expect((await captureCorpusPluginHost(root, memberInstall.plugin.id, member.userId)).observations[COUNT]).toBe(1);
  expect((await captureCorpusPluginHost(root, installed.plugin.id)).observations[COUNT]).toBe(2);
});
