// Real guest registrations and callbacks supply wire values; private rows and opaque room handles stay Node-only.

import type { PluginCommandArgSpec, PluginUiOutcome } from "@orb/contracts/plugin";
import { PLUGIN_HOST_VERSIONS, PLUGIN_LOG_LEVELS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { ID_PREFIX } from "@orb/kit/ids";
import type { PluginLogView } from "@orb/server/domain/plugin";
import { LOG_BYTES_PER_INVOCATION, LOG_LINES_PER_INVOCATION, PLUGIN_LOG_RING_CHARS, PLUGIN_LOG_RING_LINES } from "@orb/server/infra/plugin-host";
import { seedCorpusAccount } from "./corpus-auth.ts";
import { makeAssetBytes } from "./factories/asset.ts";
import type { CapturedPluginOutputs } from "./factories/plugin.ts";
import { capturePluginOutputs, makePluginBundle } from "./factories/plugin.ts";
import { capturePluginRows, seedInstalledPluginRows, seedPluginGrantRows } from "./factories/rows.ts";
import type { ServerHarnessOptions, ServerTestHarness } from "./server.ts";

type PluginCaller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>["plugin"];

export interface CorpusPluginOutputs {
  readonly caller: Awaited<ReturnType<ServerTestHarness["principalFor"]>>;
  readonly room: Awaited<ReturnType<Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>["chat"]["startChat"]>>["chat"];
  readonly installed: Awaited<ReturnType<typeof seedInstalledPluginRows>>;
  readonly granted: Awaited<ReturnType<typeof seedPluginGrantRows>>;
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
export const CORPUS_PLUGIN_OUTPUT_PRIVATE_VALUE = "private ledger value";
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
h.storage.set("entry", ${JSON.stringify(CORPUS_PLUGIN_OUTPUT_PRIVATE_VALUE)});
h.ui.setState("ledger", { entry: "Initial ledger entry" });
`;

/** Exercise native admission and callbacks once; callers retain lifecycle stages instead of rebuilding publications. */
export async function seedCorpusPluginOutputs(root: ServerTestHarness): Promise<CorpusPluginOutputs> {
  const caller = await root.principalFor(root.ownerId);
  const rpc = await root.internalCallerFor(root.ownerId);
  const room = (await rpc.chat.startChat({ characterIds: [] })).chat;
  const installed = await seedInstalledPluginRows(root, {
    caller,
    bundle: makePluginBundle(CORPUS_PLUGIN_OUTPUT_MANIFEST, CORPUS_PLUGIN_OUTPUT_SOURCE, root.clock.now(), {
      "ui/assets/ledger.png": makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)),
    }),
    grant: [],
  });
  const params = { caller, pluginId: installed.outcome.id, surfaceId: CORPUS_PLUGIN_OUTPUT_SURFACE };
  const pending = await capturePluginOutputs(root, params);
  const granted = await seedPluginGrantRows(root, {
    caller,
    pluginId: installed.outcome.id,
    grant: CORPUS_PLUGIN_OUTPUT_MANIFEST.capabilities,
    acknowledgedNetHosts: [],
    enable: true,
  });
  const active = await capturePluginOutputs(root, params);
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
  const disabled = await capturePluginOutputs(root, params);
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

const CORPUS_PLUGIN_CALLBACK_URL = "https://callbacks.example.test/held";
const CORPUS_PLUGIN_TYPED_ARGS = [
  { name: "count", type: "number", required: true },
  { name: "choice", type: "enum", enumValues: ["keep", "drop"], required: true },
  { name: "quiet", type: "boolean", required: true },
  { name: "title", type: "string", required: true },
] as const satisfies readonly PluginCommandArgSpec[];
export const CORPUS_PLUGIN_TYPED_VALUES = { count: 2, choice: "keep", quiet: true, title: "Native callback" };
export const CORPUS_PLUGIN_CALLBACK_VALUE = "Private native callback value";

export interface CorpusPluginCallbackNetwork {
  readonly networkExecution: NonNullable<ServerHarnessOptions["networkExecution"]>;
  readonly requested: Promise<void>;
  readonly release: () => void;
}

export interface CorpusPluginCallbackLifecycle {
  readonly installed: Awaited<ReturnType<typeof seedInstalledPluginRows>>;
  readonly retained: CapturedPluginOutputs;
  readonly stale: CapturedPluginOutputs;
  readonly beforeRefusals: CapturedPluginOutputs;
  readonly invalid: readonly PromiseSettledResult<PluginUiOutcome>[];
  readonly afterRefusals: CapturedPluginOutputs;
  readonly failedAction: readonly PromiseSettledResult<PluginUiOutcome>[];
  readonly afterFailure: CapturedPluginOutputs;
  readonly afterFailureRows: Awaited<ReturnType<typeof capturePluginRows>>;
  readonly clean: PluginUiOutcome;
  readonly afterClean: CapturedPluginOutputs;
  readonly afterCleanRows: Awaited<ReturnType<typeof capturePluginRows>>;
  readonly storage: CapturedPluginOutputs;
  readonly narrowed: Awaited<ReturnType<typeof seedPluginGrantRows>>;
  readonly revokedStorage: CapturedPluginOutputs;
  readonly retiredDraft: readonly PromiseSettledResult<PluginUiOutcome>[];
  readonly disabled: CapturedPluginOutputs;
  readonly unavailable: readonly PromiseSettledResult<PluginUiOutcome>[];
  readonly restarted: CapturedPluginOutputs;
  readonly uninstalled: readonly PromiseSettledResult<PluginUiOutcome>[];
}

export interface CorpusPluginLogRing {
  readonly installed: Awaited<ReturnType<typeof seedInstalledPluginRows>>;
  readonly initial: readonly PluginLogView[];
  readonly lineBatches: number;
  readonly lines: readonly PluginLogView[];
  readonly limited: readonly PluginLogView[];
  readonly charBatches: number;
  readonly chars: readonly PluginLogView[];
  readonly repeated: readonly PluginLogView[];
  readonly foreignRead: readonly PromiseSettledResult<readonly PluginLogView[]>[];
  readonly disabled: readonly PluginLogView[];
  readonly restarted: readonly PluginLogView[];
}

/** One held external response lets native disable race a real guest continuation, never a fabricated host frame. */
export function createCorpusPluginCallbackNetwork(): CorpusPluginCallbackNetwork {
  const requested = Promise.withResolvers<void>();
  const response = Promise.withResolvers<Response>();
  let consumed = false;
  const execute: typeof fetch = (input, init) => {
    const request = new Request(input, init);
    if (request.url !== CORPUS_PLUGIN_CALLBACK_URL || request.method !== "GET" || consumed) {
      throw new Error("Unscripted native callback network request");
    }
    consumed = true;
    requested.resolve();
    return response.promise;
  };
  return {
    networkExecution: { fetch: execute, resolver: (): Promise<readonly string[]> => Promise.resolve(["93.184.215.14"]) } satisfies NonNullable<
      ServerHarnessOptions["networkExecution"]
    >,
    requested: requested.promise,
    release: (): void => response.resolve(new Response("Native callback continuation")),
  };
}

/** Retain native callback values, refusals and lifecycle stages without adding them to portable publication. */
export async function seedCorpusPluginCallbackLifecycle(root: ServerTestHarness, network: CorpusPluginCallbackNetwork): Promise<CorpusPluginCallbackLifecycle> {
  const caller = await root.principalFor(root.ownerId);
  const rpc = await root.internalCallerFor(root.ownerId);
  const room = (await rpc.chat.startChat({ characterIds: [], opening: "none" })).chat;
  const foreignRpc = await root.internalCallerFor((await seedCorpusAccount(root)).userId);
  const foreignRoom = (await foreignRpc.chat.startChat({ characterIds: [], opening: "none" })).chat;
  const manifest = pluginManifestSchema.parse({
    ...CORPUS_PLUGIN_OUTPUT_MANIFEST,
    id: "corpus-callbacks",
    name: "Callback lifecycle",
    capabilities: ["ui.surface", "storage.kv", "chat.read", "net.fetch"],
    netHosts: [new URL(CORPUS_PLUGIN_CALLBACK_URL).hostname],
  });
  const source = `const h=orb.host(1); let calls=0; let retained=null;
  const publish=async(value)=>{calls+=1;await h.ui.setState("ledger",{calls,...value});};
  h.ui.register({id:"ledger",anchor:"page",title:"Callback ledger",tier:"static",spec:{kind:"text",value:"Native callbacks"},onAction:async({actionId,chat,values})=>{
    if(actionId==="retain"){retained=chat;await publish({retained:chat!==null,variables:await h.chat.getVariables(chat)});return;}
    await publish({actionId,values});
    if(actionId==="throw"){await h.ui.toast("error","Callback refused");throw new TypeError("Native callback refusal");}
  }});
  h.ui.register({id:"readonly",anchor:"page",title:"Read-only ledger",tier:"static",spec:{kind:"text",value:"No callback"}});
  h.ui.registerCommand({name:"typed",describe:"Validate typed values",args:${JSON.stringify(CORPUS_PLUGIN_TYPED_ARGS)},onRun:async({values})=>{await publish({values});}});
  h.ui.registerCommand({name:"stale",describe:"Reject an earlier invocation handle",onRun:async()=>{
    let staleError=null;let staleMessage=null;try{await h.chat.getVariables(retained);}catch(error){staleError=error.name;staleMessage=error.message;}
    await publish({staleError,staleMessage,variables:await h.chat.getVariables(h.chat.current())});
  }});
  h.ui.registerCommand({name:"storage",describe:"Read current consent",onRun:async()=>{
    try{await publish({stored:await h.storage.get("entry")});}catch(error){await publish({storageError:error.name});}
  }});
  h.ui.registerCommand({name:"draft",describe:"Continue an admitted draft",composerDraft:true,placements:[{target:"composer-action",label:"Continue"}],onRun:async({draft})=>{
    await h.net.fetch(${JSON.stringify(CORPUS_PLUGIN_CALLBACK_URL)});return draft+" continued";
  }});
  if(h.grants.includes("storage.kv"))h.storage.set("entry",${JSON.stringify(CORPUS_PLUGIN_CALLBACK_VALUE)});
  h.ui.setState("ledger",{calls:0});`;
  const installed = await seedInstalledPluginRows(root, {
    caller,
    bundle: makePluginBundle(manifest, source, root.clock.now()),
    grant: [],
  });
  await seedPluginGrantRows(root, {
    caller,
    pluginId: installed.plugin.id,
    grant: manifest.capabilities,
    acknowledgedNetHosts: manifest.netHosts ?? [],
    enable: true,
  });
  const pluginId = installed.plugin.id;
  const params = { caller, pluginId, surfaceId: "ledger" };
  const capture = (): ReturnType<typeof capturePluginOutputs> => capturePluginOutputs(root, params);
  const typed = (
    values: NonNullable<Parameters<PluginCaller["invokeUiCommand"]>[0]["values"]> = CORPUS_PLUGIN_TYPED_VALUES,
  ): ReturnType<PluginCaller["invokeUiCommand"]> => rpc.plugin.invokeUiCommand({ pluginId, name: "typed", args: "native", values, chatId: room.id });
  await rpc.plugin.invokeUiAction({ pluginId, surfaceId: "ledger", actionId: "retain", values: {}, chatId: room.id });
  const retained = await capture();
  await rpc.plugin.invokeUiCommand({ pluginId, name: "stale", args: "", chatId: room.id });
  const stale = await capture();
  await typed();
  const beforeRefusals = await capture();
  const invalid = await Promise.allSettled([
    rpc.plugin.invokeUiCommand({ pluginId, name: "typed", args: "", values: {}, chatId: room.id }),
    typed({ ...CORPUS_PLUGIN_TYPED_VALUES, count: "2" }),
    typed({ ...CORPUS_PLUGIN_TYPED_VALUES, choice: "foreign" }),
    typed({ ...CORPUS_PLUGIN_TYPED_VALUES, quiet: "true" }),
    typed({ ...CORPUS_PLUGIN_TYPED_VALUES, title: false }),
    rpc.plugin.invokeUiCommand({ pluginId, name: "draft", args: "", chatId: room.id }),
    rpc.plugin.invokeUiCommand({ pluginId, name: "absent", args: "", chatId: room.id }),
    rpc.plugin.invokeUiAction({ pluginId, surfaceId: "readonly", actionId: "record", values: {} }),
    rpc.plugin.invokeUiAction({ pluginId, surfaceId: "ledger", actionId: "record", values: {}, chatId: foreignRoom.id }),
    foreignRpc.plugin.invokeUiAction({ pluginId, surfaceId: "ledger", actionId: "record", values: {} }),
  ]);
  const afterRefusals = await capture();
  const failedAction = await Promise.allSettled([rpc.plugin.invokeUiAction({ pluginId, surfaceId: "ledger", actionId: "throw", values: {} })]);
  const afterFailure = await capture();
  const afterFailureRows = await capturePluginRows(root.db, caller.userId, pluginId);
  const clean = await typed();
  const afterClean = await capture();
  const afterCleanRows = await capturePluginRows(root.db, caller.userId, pluginId);
  await rpc.plugin.invokeUiCommand({ pluginId, name: "storage", args: "", chatId: null });
  const storage = await capture();
  const narrowed = await seedPluginGrantRows(root, {
    caller,
    pluginId,
    grant: ["ui.surface", "chat.read", "net.fetch"],
    acknowledgedNetHosts: manifest.netHosts ?? [],
  });
  await rpc.plugin.invokeUiCommand({ pluginId, name: "storage", args: "", chatId: null });
  const revokedStorage = await capture();
  await root.services.plugin.setGrant({ caller, pluginId, grant: manifest.capabilities, acknowledgedNetHosts: manifest.netHosts ?? [], enable: true });
  const running = Promise.allSettled([rpc.plugin.invokeUiCommand({ pluginId, name: "draft", args: "", chatId: room.id, composerDraft: "Native draft" })]);
  try {
    await Promise.race([
      network.requested,
      running.then(() => {
        throw new Error("Native draft ended before reaching its external callback edge");
      }),
    ]);
    await root.services.plugin.setEnabled({ caller, pluginId, enabled: false });
  } finally {
    network.release();
  }
  const retiredDraft = await running;
  const disabled = await capture();
  const unavailable = await Promise.allSettled([
    rpc.plugin.invokeUiAction({ pluginId, surfaceId: "ledger", actionId: "record", values: {} }),
    rpc.plugin.invokeUiCommand({ pluginId, name: "typed", args: "", values: CORPUS_PLUGIN_TYPED_VALUES, chatId: null }),
  ]);
  await root.services.plugin.setEnabled({ caller, pluginId, enabled: true });
  const restarted = await capture();
  await root.services.plugin.uninstall({ caller, pluginId });
  const uninstalled = await Promise.allSettled([
    rpc.plugin.invokeUiAction({ pluginId, surfaceId: "ledger", actionId: "record", values: {} }),
    rpc.plugin.invokeUiCommand({ pluginId, name: "typed", args: "", values: CORPUS_PLUGIN_TYPED_VALUES, chatId: null }),
  ]);
  return {
    installed,
    retained,
    stale,
    beforeRefusals,
    invalid,
    afterRefusals,
    failedAction,
    afterFailure,
    afterFailureRows,
    clean,
    afterClean,
    afterCleanRows,
    storage,
    narrowed,
    revokedStorage,
    retiredDraft,
    disabled,
    unavailable,
    restarted,
    uninstalled,
  };
}

/** Drive real log calls past staging and resident bounds, preserving snapshots before the next native invocation. */
export async function seedCorpusPluginLogRing(root: ServerTestHarness): Promise<CorpusPluginLogRing> {
  const caller = await root.principalFor(root.ownerId);
  const manifest = pluginManifestSchema.parse({ ...CORPUS_PLUGIN_OUTPUT_MANIFEST, id: "corpus-log-ring", capabilities: ["ui.surface"] });
  const source = `const h=orb.host(1);const levels=${JSON.stringify(PLUGIN_LOG_LEVELS)};
  for(const level of levels)h.log[level]("Native "+level);
  h.ui.registerCommand({name:"lines",describe:"Write a bounded native batch",onRun:({args})=>{
    for(let line=0;line<${LOG_LINES_PER_INVOCATION + 1};line+=1)h.log[levels[line%levels.length]]("batch:"+args+":"+line);
  }});
  h.ui.registerCommand({name:"chars",describe:"Write one bounded native long line",onRun:({args})=>{h.log.warn(args+":"+"x".repeat(${LOG_BYTES_PER_INVOCATION * 2}));}});`;
  const installed = await seedInstalledPluginRows(root, {
    caller,
    bundle: makePluginBundle(manifest, source, root.clock.now()),
    grant: [],
  });
  await seedPluginGrantRows(root, {
    caller,
    pluginId: installed.plugin.id,
    grant: manifest.capabilities,
    acknowledgedNetHosts: [],
    enable: true,
  });
  const rpc = await root.internalCallerFor(root.ownerId);
  const params = { caller, pluginId: installed.plugin.id };
  const initial = await root.services.plugin.getLog(params);
  const lineBatches = Math.floor(PLUGIN_LOG_RING_LINES / LOG_LINES_PER_INVOCATION) + 1;
  for (let batch = 0; batch < lineBatches; batch += 1) {
    root.clock.advance(1);
    await rpc.plugin.invokeUiCommand({ pluginId: params.pluginId, name: "lines", args: String(batch), chatId: null });
  }
  const lines = await root.services.plugin.getLog(params);
  const limited = await rpc.plugin.getLog({ pluginId: params.pluginId, limit: 5 });
  const charBatches = Math.floor(PLUGIN_LOG_RING_CHARS / LOG_BYTES_PER_INVOCATION) + 1;
  for (let batch = 0; batch < charBatches; batch += 1) {
    root.clock.advance(1);
    await rpc.plugin.invokeUiCommand({ pluginId: params.pluginId, name: "chars", args: String(batch), chatId: null });
  }
  const chars = await root.services.plugin.getLog(params);
  const foreign = await root.internalCallerFor((await seedCorpusAccount(root)).userId);
  const foreignRead = await Promise.allSettled([foreign.plugin.getLog({ pluginId: params.pluginId })]);
  const repeated = await root.services.plugin.getLog(params);
  await root.services.plugin.setEnabled({ caller, pluginId: params.pluginId, enabled: false });
  const disabled = await root.services.plugin.getLog(params);
  await root.services.plugin.setEnabled({ caller, pluginId: params.pluginId, enabled: true });
  const restarted = await root.services.plugin.getLog(params);
  return { installed, initial, lineBatches, lines, limited, charBatches, chars, foreignRead, repeated, disabled, restarted };
}
