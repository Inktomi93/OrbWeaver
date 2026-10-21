// @subject packages/server/src/domain/plugin/verbs/invoke-ui-command.ts
// @subject packages/server/src/domain/chat/verbs/turn.ts
import "@orb/testkit/node/composed-real.ts";
import { spawn } from "node:child_process";
import { createCharacterSchema } from "@orb/contracts/character";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { messages, messageVariants } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { makePluginBundle, seedInstalledPlugin, seedPluginGrant } from "@orb/testkit/node/factories/plugin.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { eq } from "drizzle-orm";
import { textRoom } from "../scenario-physical.ts";

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
const GUEST = `const host=orb.host(1);host.ui.registerCommand({name:${JSON.stringify(COMMAND)},describe:"Request a room turn",onRun:async()=>{host.log.info(${JSON.stringify(ENTERED)});await host.chat.requestTurn(host.chat.current(),{initiator:"human",automationDepth:0});}});`;

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
  const installed = await seedInstalledPlugin(h.root.db, h.root.services.plugin.install, {
    caller: h.owner,
    bundle: makePluginBundle(MANIFEST, GUEST, h.root.clock.now()),
    grant: [],
  });
  const enabled = await seedPluginGrant(h.root.db, h.root.services.plugin.setGrant, {
    caller: h.owner,
    pluginId: installed.plugin.id,
    grant: MANIFEST.capabilities,
    acknowledgedNetHosts: [],
    enable: true,
  });
  expect(enabled.outcome.status).toBe("enabled");
  const command = { caller: h.owner, pluginId: installed.plugin.id, name: COMMAND, args: "" };
  await expect(h.root.services.plugin.invokeUiCommand({ ...command, chatId: foreignRoom.chat.id })).rejects.toBeInstanceOf(DomainNotFoundError);
  await expect(h.root.services.plugin.invokeUiCommand({ ...command, chatId: mintTypeId(ID_PREFIX.chat) })).rejects.toBeInstanceOf(DomainNotFoundError);
  expect((await h.root.services.plugin.getLog({ caller: h.owner, pluginId: installed.plugin.id })).filter(({ message }) => message === ENTERED)).toEqual([]);
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
  expect((await h.root.services.plugin.getLog({ caller: h.owner, pluginId: installed.plugin.id })).filter(({ message }) => message === ENTERED)).toHaveLength(
    1,
  );
  expect(h.requests.filter(({ method }) => method === "POST")).toHaveLength(1);
  expect(await h.root.db.select().from(messages).where(eq(messages.chatId, foreignRoom.chat.id))).toEqual([]);
});
