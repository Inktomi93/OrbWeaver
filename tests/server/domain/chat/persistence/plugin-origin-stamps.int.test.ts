// A plugin UI command's turn stamps its origin on canon: the initiator and automationDepth columns no
// message view projects, in the invoking room only.
// @subject packages/server/src/domain/plugin/verbs/invoke-ui-command.ts
// @subject packages/server/src/domain/chat/verbs/turn.ts

import { spawn } from "node:child_process";
import { createCharacterSchema } from "@orb/contracts/character";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { messages, messageVariants } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { makePluginBundle } from "@orb/testkit/node/composed";
import { seedInstalledPluginRows, seedPluginGrantRows } from "@orb/testkit/node/rows";
import { eq } from "drizzle-orm";
import { textRoom } from "../scenario-physical.ts";

type Room = Awaited<ReturnType<typeof textRoom>>;

const COMMAND = "request_turn";
const MANIFEST = pluginManifestSchema.parse({
  id: "tail-origin",
  name: "Native turn origin witness",
  description: "Requests a real room turn through a native command.",
  version: "1.0.0",
  hostVersion: PLUGIN_HOST_VERSIONS[0],
  entry: PLUGIN_MAIN_ENTRY,
  capabilities: ["ui.surface", "chat.read", "turn.trigger"],
});
const ENTERED = "native command entered";
/** A guest whose command requests a turn with `hints` as the guest-supplied second argument. */
function requestingGuest(hints: Readonly<Record<string, string | number>>): string {
  return `const host=orb.host(1);host.ui.registerCommand({name:${JSON.stringify(COMMAND)},describe:"Request a room turn",onRun:async()=>{host.log.info(${JSON.stringify(ENTERED)});await host.chat.requestTurn(host.chat.current(),${JSON.stringify(hints)});}});`;
}
const GUEST = requestingGuest({ initiator: "human", automationDepth: 0 });

/** The witness plugin installed and enabled by the room's owner; returns the command that requests a turn. */
async function enableWitness(h: Room, guest = GUEST): Promise<Omit<Parameters<Room["root"]["services"]["plugin"]["invokeUiCommand"]>[0], "chatId">> {
  const installed = await seedInstalledPluginRows(h.root, {
    caller: h.owner,
    bundle: makePluginBundle(MANIFEST, guest, h.root.clock.now()),
    grant: [],
  });
  const enabled = await seedPluginGrantRows(h.root, {
    caller: h.owner,
    pluginId: installed.plugin.id,
    grant: MANIFEST.capabilities,
    acknowledgedNetHosts: [],
    enable: true,
  });
  expect(enabled.outcome.status).toBe("enabled");
  return { caller: h.owner, pluginId: installed.plugin.id, name: COMMAND, args: "" };
}

test("a native command refuses foreign rooms before guest execution and cannot turn its forged human hint into a human slot", async () => {
  await using h = await textRoom(["The actual plugin requests this reply."], {
    group: { output: "per-speaker", policy: "list", allowSelfResponses: true },
    server: { pluginSpawn: spawn },
  });
  const foreign = await h.root.principalFor((await h.root.actor()).id);
  const character = await h.root.services.character.create({
    principal: foreign,
    input: createCharacterSchema.parse({ handle: "foreign-origin-witness", name: "Foreign keeper", description: "A private foreign room." }),
  });
  const foreignRoom = await h.root.services.chat.startChat({ principal: foreign, characterIds: [character.id], opening: "none" });
  const command = await enableWitness(h);
  await expect(h.root.services.plugin.invokeUiCommand({ ...command, chatId: foreignRoom.chat.id })).rejects.toBeInstanceOf(DomainNotFoundError);
  await expect(h.root.services.plugin.invokeUiCommand({ ...command, chatId: mintTypeId(ID_PREFIX.chat) })).rejects.toBeInstanceOf(DomainNotFoundError);
  expect((await h.root.services.plugin.getLog({ caller: h.owner, pluginId: command.pluginId })).filter(({ message }) => message === ENTERED)).toEqual([]);
  expect(h.requests.filter(({ method }) => method === "POST")).toEqual([]);
  expect(await h.root.db.select().from(messages)).toEqual([]);

  await h.root.services.plugin.invokeUiCommand({ ...command, chatId: h.chatId });
  await h.root.settleBackground();
  const canon = await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq);
  expect(canon).toHaveLength(1);
  expect(canon).toMatchObject([{ role: "assistant", initiator: "plugin", automationDepth: 1, characterId: h.characters[0]?.id }]);
  const selected = canon[0]?.selectedVariantId;
  if (selected === undefined || selected === null) {
    throw new Error("the native command produced no selected assistant variant");
  }
  expect((await h.root.db.select().from(messageVariants).where(eq(messageVariants.id, selected)).get())?.content).toBe(
    "The actual plugin requests this reply.",
  );
  expect((await h.root.services.plugin.getLog({ caller: h.owner, pluginId: command.pluginId })).filter(({ message }) => message === ENTERED)).toHaveLength(1);
  expect(h.requests.filter(({ method }) => method === "POST")).toHaveLength(1);
  expect(await h.root.db.select().from(messages).where(eq(messages.chatId, foreignRoom.chat.id))).toEqual([]);
});

test("a plugin-requested first reply claims the unstarted room before its canon and accounting writes", async () => {
  await using h = await textRoom(["The plugin opens the room."], { server: { pluginSpawn: spawn } });
  const listed = async (): Promise<boolean> => (await h.root.services.chat.listChats({ principal: h.owner })).items.some(({ id }) => id === h.chatId);
  const command = await enableWitness(h);
  expect(await listed()).toBe(false);

  await h.root.services.plugin.invokeUiCommand({ ...command, chatId: h.chatId });
  await h.root.settleBackground();

  const page = await h.root.services.chat.listMessages({ principal: h.owner, chatId: h.chatId });
  expect(page.messages).toMatchObject([{ role: "assistant", characterId: h.characters[0]?.id, content: "The plugin opens the room." }]);
  expect(await listed()).toBe(true);
  const live = await h.root.services.stats.overview(h.owner.userId);
  expect(live).toMatchObject({ chats: 1, assistantTurns: 1 });
  await h.root.services.stats.reconcile(h.owner.userId);
  expect(await h.root.services.stats.overview(h.owner.userId)).toEqual(live);
});

test("a plugin request naming a non-roster speaker is refused before it claims the unstarted room", async () => {
  await using h = await textRoom(["No reply is owed."], { server: { pluginSpawn: spawn } });
  const listed = async (): Promise<boolean> => (await h.root.services.chat.listChats({ principal: h.owner })).items.some(({ id }) => id === h.chatId);
  const command = await enableWitness(h, requestingGuest({ speakerCharacterId: mintTypeId(ID_PREFIX.character) }));

  await expect(h.root.services.plugin.invokeUiCommand({ ...command, chatId: h.chatId })).rejects.toThrow();
  await h.root.settleBackground();

  expect((await h.root.services.plugin.getLog({ caller: h.owner, pluginId: command.pluginId })).filter(({ message }) => message === ENTERED)).toHaveLength(1);
  expect((await h.root.services.chat.listMessages({ principal: h.owner, chatId: h.chatId })).messages).toEqual([]);
  expect(h.requests.filter(({ method }) => method === "POST")).toEqual([]);
  expect(await listed()).toBe(false);
});
