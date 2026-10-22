// Native guest returns are retained in private plugin KV, never projected into the portable corpus.
import { characterCardV3Schema } from "@orb/contracts/character";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { DEFAULT_MEMORY_DEFAULTS } from "@orb/contracts/settings";
import type { JsonValue } from "@orb/kit/json";
import { jsonValueSchema } from "@orb/kit/json";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { pluginMacroName } from "@orb/server/domain/plugin";
import { CORPUS_PROVIDER_ENDPOINT } from "./corpus-provider.ts";
import type { SeededCorpusLibraries, seedCorpusActors } from "./corpus-seed.ts";
import { settleCorpusWorkloads } from "./corpus-workloads.ts";
import { capturePluginRows, makePluginBundle, seedInstalledPlugin, seedPluginGrant } from "./factories/plugin.ts";
import type { ServerTestHarness } from "./server.ts";

type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;
type Actors = Awaited<ReturnType<typeof seedCorpusActors>>;

export const CORPUS_PLUGIN_HOST_SLUG = "native-host-ledger";
export const CORPUS_PLUGIN_HOST_KEYS = {
  reads: "native:reads",
  produced: "native:produced",
  search: "native:search",
  event: "native:event",
  pubsub: "native:pubsub",
  transform: "native:transform",
  macro: "native:macro",
} as const;
export const CORPUS_PLUGIN_HOST_URL = "https://plugin.example.test/ledger";
export const CORPUS_PLUGIN_HOST_IMAGE_URL = "https://plugin.example.test/ledger.png";
export const CORPUS_PLUGIN_HOST_REPLY = "Native host funded witness.";
export const CORPUS_PLUGIN_HOST_MACRO = "Native macro witness";
export const CORPUS_PLUGIN_HOST_DRAFT = "Native resident turn";
export const CORPUS_PLUGIN_HOST_IMAGE_MODEL = "corpus-host-image-v1";

export const CORPUS_PLUGIN_HOST_MANIFEST = pluginManifestSchema.parse({
  id: CORPUS_PLUGIN_HOST_SLUG,
  name: "Native host ledger",
  description: "Retains private native host results and real callback deliveries.",
  version: "1.0.0",
  hostVersion: PLUGIN_HOST_VERSIONS[0],
  entry: PLUGIN_MAIN_ENTRY,
  capabilities: [
    "chat.read",
    "chat.variables.write",
    "worldinfo.read",
    "worldinfo.write",
    "storage.kv",
    "global_vars",
    "assets.read",
    "character.card_state",
    "databank.ingest",
    "character.ingest",
    "llm.quiet",
    "search.query",
    "imagery.generate",
    "net.fetch",
    "net.fetch_asset",
    "events.subscribe",
    "plugin_events",
    "chat.transform",
    "ui.surface",
  ],
  netHosts: [new URL(CORPUS_PLUGIN_HOST_URL).hostname],
});

export interface CorpusPluginHost {
  readonly plugin: Awaited<ReturnType<typeof seedPluginGrant>>;
  readonly installed: Awaited<ReturnType<typeof seedInstalledPlugin>>;
  readonly observations: Readonly<Record<string, JsonValue>>;
  readonly privateRows: Awaited<ReturnType<typeof capturePluginRows>>;
  readonly turn: Awaited<ReturnType<ServerTestHarness["services"]["chat"]["send"]>>;
  readonly exportJson: ReturnType<typeof characterCardV3Schema.parse>;
  readonly exportPng: Awaited<ReturnType<ServerTestHarness["app"]["assets"]["store"]>>;
  readonly imageConnection: Awaited<ReturnType<Caller["connection"]["create"]>>;
  readonly readAt: number;
}

/** Decode the guest's own JSON evidence, not a copied projection of any host method result. */
export async function captureCorpusPluginHost(
  root: ServerTestHarness,
  pluginId: CorpusPluginHost["plugin"]["plugin"]["id"],
  ownerId = root.ownerId,
): Promise<Pick<CorpusPluginHost, "observations" | "privateRows">> {
  const privateRows = await capturePluginRows(root.db, ownerId, pluginId);
  const observations = Object.fromEntries(
    privateRows.kv.filter((row) => row.key.startsWith("native:")).map((row) => [row.key, jsonValueSchema.parse(JSON.parse(row.value))]),
  );
  return { privateRows, observations };
}

/** Reuse real corpus authorship and funding; one resident guest obtains every value through its actual membrane. */
export async function seedCorpusPluginHost(root: ServerTestHarness, actors: Actors, library: SeededCorpusLibraries): Promise<CorpusPluginHost> {
  const caller = await root.internalCallerFor(root.ownerId);
  const principal = await root.principalFor(root.ownerId);
  const exportedJson = await root.app.exportService.exportCharacter({ principal, characterId: library.character.id, format: "json" });
  const exportedPng = await root.app.exportService.exportCharacter({ principal, characterId: library.character.id, format: "png" });
  if (exportedJson === null || exportedPng === null) {
    throw new Error("native library character export omitted its owned source");
  }
  const exportJson = characterCardV3Schema.parse(JSON.parse(new TextDecoder().decode(exportedJson.bytes)));
  const exportPng = await root.app.assets.store({ principal, kind: "attachment", mime: "image/png", bytes: exportedPng.bytes });
  const inputs = {
    keys: CORPUS_PLUGIN_HOST_KEYS,
    slug: CORPUS_PLUGIN_HOST_SLUG,
    characterId: library.character.id,
    bookId: library.world.book.id,
    assetId: library.asset.assetId,
    cardAssetId: exportPng.assetId,
    card: exportJson,
    url: CORPUS_PLUGIN_HOST_URL,
    imageUrl: CORPUS_PLUGIN_HOST_IMAGE_URL,
    macro: CORPUS_PLUGIN_HOST_MACRO,
  };
  const source = `const h = orb.host(1); const input = ${JSON.stringify(inputs)};
h.events.on("asset.created", async (fact) => { await h.storage.set(input.keys.event, JSON.stringify(fact)); });
h.pubsub.on(input.slug, "ledger", async (event) => { await h.storage.set(input.keys.pubsub, JSON.stringify(event)); });
h.transforms.register({ name: "witness", point: "user_input", apply: async (args) => {
  await h.storage.set(input.keys.transform, JSON.stringify(args)); return args.draft + " [native transform]";
}});
h.macros.register({ name: "witness", description: "Native macro witness", resolve: async () => {
  await h.storage.set(input.keys.macro, "true"); return input.macro;
}});
h.ui.registerCommand({ name: "inspect", describe: "Inspect admitted native host values", onRun: async () => {
  const room = h.chat.current();
  const applied = await h.chat.applyVariableOps(room, [{op:"set",key:"nativeHost",value:"bound"}]);
  const stale = await h.chat.applyVariableOps(room, [{op:"set",key:"nativeHost",value:"lost"}], [{key:"nativeHost",expected:"outdated"}]);
  await h.variables.set("native-global", "installer value"); const globalValue = await h.variables.get("native-global");
  await h.variables.delete("native-global"); const globalAbsent = await h.variables.get("native-global");
  await h.storage.set("cell", "first"); const stored = await h.storage.get("cell");
  const casApplied = await h.storage.compareAndSet("cell", "first", "second");
  const casStale = await h.storage.compareAndSet("cell", "first", "third");
  const keys = await h.storage.list("cell"); await h.storage.delete("cell"); const absent = await h.storage.get("cell");
  const cardAbsent = await h.character.getCardData(input.characterId);
  await h.character.setCardData(input.characterId, {witness:"native card"}); const cardState = await h.character.getCardData(input.characterId);
  await h.worldInfo.upsertEntry(room, {bookId:input.bookId,entryKey:"native",keys:["native"],contentTemplate:"Native guest lore",position:"before"});
  await h.storage.set(input.keys.reads, JSON.stringify({version:h.version,grants:h.grants,at:h.clock.nowEpochMs(),random:h.random.next(),ids:[h.ids.mint(),h.ids.mint()],tokens:h.tokens.count("native token witness"),room,
    messages:await h.chat.listMessages(room),variables:await h.chat.getVariables(room),characters:await h.chat.listCharacters(room),applied,stale,
    books:await h.worldInfo.listBooks(room),entries:await h.worldInfo.listEntries(room,input.bookId),asset:await h.assets.read(input.assetId),
    globalValue,globalAbsent,stored,casApplied,casStale,keys,absent,cardAbsent,cardState}));
}});
h.ui.registerCommand({name:"produce",describe:"Produce owned native guest results",onRun:async()=>{
  const room=h.chat.current(); const document=await h.databank.ingest({name:"Native guest source",text:"The native guest ledger preserves a funded witness."});
  const ingested=await h.character.ingest(input.card); const repeated=await h.character.ingest(input.card); const withArt=await h.character.ingestAsset(input.cardAssetId);
  const quiet=await h.llm.quiet("Report the native funded witness.");
  const fetched=await h.net.fetch(input.url); const fetchedAsset=await h.net.fetchAsset(input.imageUrl);
  const image=await h.imagery.generatePicture(room,{mode:"free",prompt:"Native guest ledger",n:1,reuse:"never"});
  await h.storage.set(input.keys.produced,JSON.stringify({document,ingested,repeated,withArt,quiet,fetched,fetchedAsset,image}));
}});
h.ui.registerCommand({name:"search",describe:"Read indexed native guest source",onRun:async()=>{
  await h.storage.set(input.keys.search,JSON.stringify(await h.search.documents("native guest ledger",{limit:3})));
}});
h.ui.registerCommand({name:"emit",describe:"Publish installer-scoped private data",args:[{name:"witness",type:"string",required:true}],onRun:async({values})=>{
  await h.pubsub.emit("ledger",{witness:values.witness});
}});`;
  await caller.chat.commitMessage({ chatId: library.room.chat.id, content: "Native host transcript witness.", timeZone: UTC_TIME_ZONE });
  const installed = await seedInstalledPlugin(root, {
    caller: principal,
    bundle: makePluginBundle(CORPUS_PLUGIN_HOST_MANIFEST, source, root.clock.now()),
    grant: [],
  });
  const plugin = await seedPluginGrant(root, {
    caller: principal,
    pluginId: installed.outcome.id,
    grant: CORPUS_PLUGIN_HOST_MANIFEST.capabilities,
    acknowledgedNetHosts: CORPUS_PLUGIN_HOST_MANIFEST.netHosts ?? [],
    enable: true,
  });
  const imageConnection = await caller.connection.create({
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_PLUGIN_HOST_IMAGE_MODEL,
    allowBackground: true,
    declared: {
      kind: "generation",
      generation: { context: { window: 32_000 }, output: { modalities: ["text", "image"] } },
      features: { images: "images-api", detectServer: false },
    },
  });
  await caller.connection.setBinding({ task: "generateImage", connectionId: imageConnection.id });
  await caller.connection.setBinding({
    task: "summarize",
    connectionId: actors.connections.text.id,
    actor: { kind: "plugin-grant", pluginId: plugin.plugin.id },
  });
  const invoke = async (name: string): Promise<void> => {
    try {
      await caller.plugin.invokeUiCommand({ pluginId: plugin.plugin.id, name, args: "", chatId: library.room.chat.id });
    } catch (cause) {
      throw new Error(`native guest command '${name}' refused`, { cause });
    }
  };
  const readAt = root.clock.now();
  await invoke("inspect");
  await invoke("produce");
  for (let scene = 0; scene < DEFAULT_MEMORY_DEFAULTS.blockSize + DEFAULT_MEMORY_DEFAULTS.verbatimWindow; scene += 1) {
    await caller.chat.commitMessage({
      chatId: library.room.chat.id,
      content: `Native host archive scene ${scene}: The ledger records the funded witness.`,
      timeZone: UTC_TIME_ZONE,
    });
  }
  const jobs = (await caller.workloads.list()).filter((job) => job.kind === "databank-ingest" && job.status !== "succeeded");
  await caller.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: true } });
  await settleCorpusWorkloads(root, caller, [
    ...jobs,
    await caller.workloads.start({ input: { kind: "index", params: { source: "all" } }, mode: "singular" }),
    await caller.workloads.start({ input: { kind: "memory-backfill", params: {} }, mode: "singular" }),
    await caller.workloads.start({ input: { kind: "databank-reindex", params: { scope: { kind: "owner" }, mode: "chunk-embed" } }, mode: "singular" }),
  ]);
  await invoke("search");
  await caller.character.update({
    characterId: library.character.id,
    input: { description: `${library.character.description}\nWitness: {{${pluginMacroName(CORPUS_PLUGIN_HOST_SLUG, "witness")}}}` },
  });
  const turn = await root.services.chat.send({
    principal,
    chatId: library.room.chat.id,
    content: CORPUS_PLUGIN_HOST_DRAFT,
    intent: { maxContextTokens: 4096, maxOutputTokens: 64 },
    timeZone: UTC_TIME_ZONE,
  });
  await root.settleBackground();
  return { installed, plugin, exportJson, exportPng, imageConnection, readAt, turn, ...(await captureCorpusPluginHost(root, plugin.plugin.id)) };
}
