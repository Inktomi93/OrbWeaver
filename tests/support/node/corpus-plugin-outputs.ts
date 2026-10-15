// Real guest registrations and callbacks supply wire values; private rows and opaque room handles stay Node-only.
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { ID_PREFIX } from "@orb/kit/ids";
import { makeAssetBytes } from "./factories/asset.ts";
import { capturePluginOutputs, makePluginBundle, seedInstalledPlugin, seedPluginGrant } from "./factories/plugin.ts";
import type { ServerTestHarness } from "./server.ts";

type PluginCaller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>["plugin"];

export interface CorpusPluginOutputs {
  readonly caller: Awaited<ReturnType<ServerTestHarness["principalFor"]>>;
  readonly room: Awaited<ReturnType<Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>["chat"]["startChat"]>>["chat"];
  readonly installed: Awaited<ReturnType<typeof seedInstalledPlugin>>;
  readonly granted: Awaited<ReturnType<typeof seedPluginGrant>>;
  readonly pending: Awaited<ReturnType<typeof capturePluginOutputs>>;
  readonly active: Awaited<ReturnType<typeof capturePluginOutputs>>;
  readonly disabled: Awaited<ReturnType<typeof capturePluginOutputs>>;
  readonly action: Awaited<ReturnType<PluginCaller["invokeUiAction"]>>;
  readonly roomState: Awaited<ReturnType<PluginCaller["getSurfaceState"]>>;
  readonly command: Awaited<ReturnType<PluginCaller["invokeUiCommand"]>>;
  readonly commandState: Awaited<ReturnType<PluginCaller["getSurfaceState"]>>;
  readonly draft: Awaited<ReturnType<PluginCaller["invokeUiCommand"]>>;
  readonly draftState: Awaited<ReturnType<PluginCaller["getSurfaceState"]>>;
  readonly hostResult: Awaited<ReturnType<PluginCaller["uiHostCall"]>>;
  readonly display: Awaited<ReturnType<PluginCaller["transformForDisplay"]>>;
  readonly skippedDisplay: Awaited<ReturnType<PluginCaller["transformForDisplay"]>>;
  readonly snippet: Awaited<ReturnType<PluginCaller["runSnippet"]>>;
  readonly parseFailure: Awaited<ReturnType<PluginCaller["runSnippet"]>>;
  readonly runtimeFailure: Awaited<ReturnType<PluginCaller["runSnippet"]>>;
}

export const CORPUS_PLUGIN_OUTPUT_MANIFEST = pluginManifestSchema.parse({
  id: "corpus-output-ledger",
  name: "Output ledger",
  version: "1.0.0",
  description: "Publishes native registration and callback outputs.",
  hostVersion: PLUGIN_HOST_VERSIONS[0],
  entry: PLUGIN_MAIN_ENTRY,
  capabilities: ["ui.surface", "storage.kv", "chat.transform", "chat.read"],
});

export const CORPUS_PLUGIN_OUTPUT_SURFACE = "ledger";
export const CORPUS_PLUGIN_OUTPUT_SOURCE = `
const h = orb.host(1);
h.log.info("ledger activated");
h.ui.register({ id: "ledger", anchor: "page", title: "Ledger", tier: "static",
  spec: { kind: "text", value: { $state: "entry", fallback: "Awaiting entry" } },
  onAction: async ({ actionId, values, chat }) => {
    await h.ui.setState("ledger", { actionId, values, inRoom: chat !== null }, ...(chat ? [chat] : []));
    await h.ui.toast("success", "Entry recorded");
    await h.ui.openDialog("detail");
  }
});
h.ui.register({ id: "detail", anchor: "dialog", title: "Ledger detail", tier: "static", spec: { kind: "text", value: "Native detail" } });
h.ui.registerCommand({ name: "record", describe: "Record one entry", args: [{ name: "entry", type: "string", required: true }],
  onRun: async ({ args, values }) => { await h.ui.setState("ledger", { args, values }); }
});
h.ui.registerCommand({ name: "revise", describe: "Revise a draft", composerDraft: true, placements: [{ target: "composer-action", label: "Revise" }],
  onRun: async ({ args, values, draft }) => { await h.ui.setState("ledger", { args, values, draft }); return draft + " revised"; }
});
h.transforms.registerDisplay({ name: "annotate", apply: async ({ text, env }) => {
  if (text === "skip failed transform") throw new TypeError("display refusal");
  return text + " [ledger]";
}});
h.storage.set("entry", "private ledger value");
h.ui.setState("ledger", { entry: "Initial ledger entry" });
`;

/** Exercise native admission and callbacks once; callers retain lifecycle stages instead of rebuilding publications. */
export async function seedCorpusPluginOutputs(root: ServerTestHarness): Promise<CorpusPluginOutputs> {
  const caller = await root.principalFor(root.ownerId);
  const rpc = await root.internalCallerFor(root.ownerId);
  const room = (await rpc.chat.startChat({ characterIds: [] })).chat;
  const installed = await seedInstalledPlugin(root.db, root.services.plugin.install, {
    caller,
    bundle: makePluginBundle(CORPUS_PLUGIN_OUTPUT_MANIFEST, CORPUS_PLUGIN_OUTPUT_SOURCE, root.clock.now(), {
      "ui/assets/ledger.png": makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)),
    }),
    grant: [],
  });
  const params = { caller, pluginId: installed.outcome.id, surfaceId: CORPUS_PLUGIN_OUTPUT_SURFACE };
  const pending = await capturePluginOutputs(root.services.plugin, params);
  const granted = await seedPluginGrant(root.db, root.services.plugin.setGrant, {
    caller,
    pluginId: installed.outcome.id,
    grant: CORPUS_PLUGIN_OUTPUT_MANIFEST.capabilities,
    acknowledgedNetHosts: [],
    enable: true,
  });
  const active = await capturePluginOutputs(root.services.plugin, params);
  const action = await rpc.plugin.invokeUiAction({
    pluginId: installed.outcome.id,
    surfaceId: CORPUS_PLUGIN_OUTPUT_SURFACE,
    actionId: "record",
    values: { entry: "Room entry" },
    chatId: room.id,
  });
  const roomState = await rpc.plugin.getSurfaceState({ pluginId: installed.outcome.id, surfaceId: CORPUS_PLUGIN_OUTPUT_SURFACE, chatId: room.id });
  const command = await rpc.plugin.invokeUiCommand({
    pluginId: installed.outcome.id,
    name: "record",
    args: "entry=Native",
    values: { entry: "Native" },
    chatId: null,
  });
  const commandState = await rpc.plugin.getSurfaceState({ pluginId: installed.outcome.id, surfaceId: CORPUS_PLUGIN_OUTPUT_SURFACE });
  const draft = await rpc.plugin.invokeUiCommand({ pluginId: installed.outcome.id, name: "revise", args: "", chatId: room.id, composerDraft: "Native draft" });
  const draftState = await rpc.plugin.getSurfaceState({ pluginId: installed.outcome.id, surfaceId: CORPUS_PLUGIN_OUTPUT_SURFACE });
  const hostResult = await rpc.plugin.uiHostCall({ pluginId: installed.outcome.id, fn: "storage.get", argsJson: JSON.stringify(["entry"]) });
  const messageId = root.idSource.typeId(ID_PREFIX.message);
  const display = await rpc.plugin.transformForDisplay({ chatId: room.id, messageId, text: "Native row" });
  const skippedDisplay = await rpc.plugin.transformForDisplay({ chatId: room.id, messageId, text: "skip failed transform" });
  const snippet = await rpc.plugin.runSnippet({ chatId: room.id, code: 'orb.host(1).log.info("Native snippet");' });
  const parseFailure = await rpc.plugin.runSnippet({ chatId: room.id, code: "const =" });
  const runtimeFailure = await rpc.plugin.runSnippet({ chatId: room.id, code: 'throw new TypeError("Native runtime refusal");' });
  await root.services.plugin.setEnabled({ caller, pluginId: installed.outcome.id, enabled: false });
  const disabled = await capturePluginOutputs(root.services.plugin, params);
  return {
    caller,
    room,
    installed,
    granted,
    pending,
    active,
    action,
    roomState,
    command,
    commandState,
    draft,
    draftState,
    hostResult,
    display,
    skippedDisplay,
    snippet,
    parseFailure,
    runtimeFailure,
    disabled,
  };
}
