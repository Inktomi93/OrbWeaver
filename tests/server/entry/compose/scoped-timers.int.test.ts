// @subject packages/server/src/entry/compose/services.ts
// A guest that never answers is unblocked only by its deadline. Each phase stalls on ONE deadline and first lets
// real time pass it, so the work proceeds only when the harness scheduler the root scoped is ticked. The
// turn-lock heartbeat has its own proof (`tests/server/domain/chat/engine/core-concurrency.int.test.ts`).
import { spawn } from "node:child_process";
import { setTimeout as realDelay } from "node:timers/promises";
import type { ChatBusEvent } from "@orb/contracts/chat";
import { CHAT_INJECTION_POSITIONS } from "@orb/contracts/chat";
import type { PluginManifest } from "@orb/contracts/plugin";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { pluginMacroName } from "@orb/server/domain/plugin";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
  makePluginBundle,
  seedInstalledPlugin,
  seedPluginGrant,
} from "@orb/testkit/node/composed";
import { terminalSseLine } from "@orb/testkit/node/helpers";

const MACRO = "omen";
const NEVER = "const h = orb.host(1); const never = () => new Promise(() => {});";
const STALLED_MACRO_SOURCE = `${NEVER} h.macros.register({ name: ${JSON.stringify(MACRO)}, description: "Never answers.", resolve: never });`;
const STALLED_TRANSFORMS_SOURCE = `${NEVER}
h.transforms.register({ name: "stall", point: "assembled_dynamic", apply: never });
h.transforms.registerDisplay({ name: "stall", apply: never });`;
const REPLY = "The deadline let the turn through.";
// Longer than any guest deadline on these paths, so an ambient timer would have fired inside it.
const AMBIENT_WINDOW_MS = 1500;
// One step of the harness scheduler; the poll repeats it until the guarded work proceeds.
const TICK_MS = 250;
const POLL = { timeout: 20_000, interval: 25 } as const;

function stalledManifest(id: string): PluginManifest {
  return pluginManifestSchema.parse({
    id,
    name: `Stalled ${id}`,
    version: "1.0.0",
    description: "Registers guest callbacks that never answer.",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    capabilities: ["chat.transform"],
  });
}

async function installEnabled(h: ChatRoot, manifest: PluginManifest, source: string): Promise<PluginId> {
  const installed = await seedInstalledPlugin(h.root, { caller: h.owner, bundle: makePluginBundle(manifest, source, h.root.clock.now()), grant: [] });
  await seedPluginGrant(h.root, { caller: h.owner, pluginId: installed.outcome.id, grant: manifest.capabilities, acknowledgedNetHosts: [], enable: true });
  return installed.outcome.id;
}

function completion(text: string): Response {
  const frames = [`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}`, terminalSseLine(), "data: [DONE]"];
  return new Response(`${frames.join("\n\n")}\n\n`, { headers: { "content-type": "text/event-stream" } });
}

test("the root's scoped timers drive the plugin macro, prompt-transform and display-transform deadlines", { tags: ["slow"] }, async () => {
  const corpus = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: REPLY,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const generations: string[] = [];
  await using h = await createChatRoot({
    server: { pluginSpawn: spawn },
    memoryEnabled: false,
    group: { output: "per-speaker", policy: "list", allowSelfResponses: true },
    providerFetch: async (input, init) => {
      const request = new Request(input, init);
      if (request.method !== "POST" || !new URL(request.url).pathname.endsWith("/chat/completions")) {
        return await corpus.execute(request);
      }
      generations.push(await request.text());
      return completion(REPLY);
    },
  });
  const character = h.characters[0];
  if (character === undefined) {
    throw new Error("the composed room seated no character");
  }
  const skips: ChatBusEvent[] = [];
  using subscription = new DisposableStack();
  subscription.defer(
    h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
      if (event.chatId === h.chatId && event.type === "warning" && event.code === "prompt_transform_skipped") {
        skips.push(event);
      }
    }),
  );
  const guardedTurn = async (): Promise<string | undefined> => {
    const before = generations.length;
    const turn = h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: character.id });
    await realDelay(AMBIENT_WINDOW_MS);
    expect(generations).toHaveLength(before);
    await expect
      .poll(() => {
        h.root.timers.advance(TICK_MS);
        return generations.length;
      }, POLL)
      .toBe(before + 1);
    expect(await turn).toMatchObject({ aborted: false });
    return generations[before];
  };

  const macroManifest = stalledManifest("stalledmacro");
  const macroPlugin = await installEnabled(h, macroManifest, STALLED_MACRO_SOURCE);
  await h.caller.chat.setChatInjection({
    chatId: h.chatId,
    position: CHAT_INJECTION_POSITIONS[0],
    role: "system",
    depth: 0,
    order: 0,
    content: `Omen:[{{${pluginMacroName(macroManifest.id, MACRO)}}}]`,
  });
  // The macro deadline renders the stalled macro empty.
  expect(await guardedTurn()).toContain("Omen:[]");
  expect(skips).toEqual([]);

  await h.root.services.plugin.uninstall({ caller: h.owner, pluginId: macroPlugin });
  await installEnabled(h, stalledManifest("stalledtransforms"), STALLED_TRANSFORMS_SOURCE);
  // The prompt-transform deadline skips the transform and says so on the bus.
  expect(await guardedTurn()).toBeDefined();
  expect(skips).toEqual([expect.objectContaining({ code: "prompt_transform_skipped" })]);

  const text = "A row the stalled transform never rewrites.";
  let display: Awaited<ReturnType<typeof h.caller.plugin.transformForDisplay>> | undefined;
  const displayed = h.caller.plugin.transformForDisplay({ chatId: h.chatId, messageId: h.root.idSource.typeId(ID_PREFIX.message), text }).then((result) => {
    display = result;
  });
  await realDelay(AMBIENT_WINDOW_MS);
  expect(display).toBeUndefined();
  await expect
    .poll(() => {
      h.root.timers.advance(TICK_MS);
      return display;
    }, POLL)
    .toEqual({ text });
  await displayed;
  await h.root.settleBackground();
});
