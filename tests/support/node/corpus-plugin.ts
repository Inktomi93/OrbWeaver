// Synthetic bundle bytes enter the real consent and sandbox lifecycle; private captures never become ISO data.
import { providerDefSchema } from "@orb/contracts/inference";
import type { PluginManifest } from "@orb/contracts/plugin";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, PLUGIN_UI_ASSETS_DIR, pluginManifestSchema } from "@orb/contracts/plugin";
import { pluginProviderClaims } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { and, eq, inArray } from "drizzle-orm";
import { FROZEN_AT_MS } from "../iso/clock.ts";
import type { CorpusPluginLibrary, CorpusPluginStage } from "../iso/corpus-plugin.ts";
import { corpusPluginInput } from "../iso/corpus-plugin.ts";
import { seedCorpusAccount } from "./corpus-auth.ts";
import {
  CORPUS_PLUGIN_OUTPUT_MANIFEST,
  CORPUS_PLUGIN_OUTPUT_PRIVATE_VALUE,
  CORPUS_PLUGIN_OUTPUT_SOURCE,
  CORPUS_PLUGIN_OUTPUT_SURFACE,
} from "./corpus-plugin-outputs.ts";
import { makeAssetBytes } from "./factories/asset.ts";
import { makePluginBundle, seedDistributedPlugin, seedInstalledPlugin, seedPluginGrant } from "./factories/plugin.ts";
import { seedAdminProvider, seedPluginProviders } from "./factories/provider.ts";
import { capturePluginRows } from "./factories/rows.ts";
import type { ServerTestHarness } from "./server.ts";

export const CORPUS_PLUGIN_STORAGE_KEY = "ledger";
export const CORPUS_PLUGIN_STORAGE_VALUE = "archived orbital witness";
export const CORPUS_PLUGIN_ASSET_PATH = `${PLUGIN_UI_ASSETS_DIR}ledger.png`;
export const CORPUS_PLUGIN_MANIFEST = pluginManifestSchema.parse({
  id: "corpus-ledger",
  name: "Corpus ledger",
  version: "1.0.0",
  hostVersion: PLUGIN_HOST_VERSIONS[0],
  entry: PLUGIN_MAIN_ENTRY,
  description: "Records the synthetic ledger in private guest storage.",
  capabilities: ["storage.kv"],
});

export const CORPUS_PLUGIN_PROVIDER_MANIFEST = pluginManifestSchema.parse({
  ...CORPUS_PLUGIN_MANIFEST,
  capabilities: CORPUS_PLUGIN_OUTPUT_MANIFEST.capabilities,
  providers: [
    {
      id: "plugin:corpus-ledger/text",
      label: "Corpus text",
      wire: "openai-compat",
      dialect: "openai-compatible",
      auth: "endpoint",
      apis: ["chat-completions"],
      catalog: "url",
      metered: false,
    },
  ],
});

export const CORPUS_ADMIN_PROVIDER = providerDefSchema.parse({
  id: "corpus-admin",
  label: "Corpus admin endpoint",
  wire: "openai-compat",
  dialect: "openai-compatible",
  auth: "endpoint",
  apis: ["chat-completions"],
  catalog: "url",
  metered: false,
});

const GUEST_SOURCE = `const host = orb.host(1); host.storage.set(${JSON.stringify(CORPUS_PLUGIN_STORAGE_KEY)}, ${JSON.stringify(CORPUS_PLUGIN_STORAGE_VALUE)});`;
const REFUSED_GUEST_SOURCE = 'throw new Error("corpus guest activation refused");';

/** Pack physical guest input only; production owns validation, consent, isolation and execution. */
export function corpusPluginBundle(
  asset: Uint8Array,
  manifest: PluginManifest = CORPUS_PLUGIN_MANIFEST,
  source: string = GUEST_SOURCE,
  mtime: number = FROZEN_AT_MS,
): Uint8Array {
  return makePluginBundle(manifest, source, mtime, { [CORPUS_PLUGIN_ASSET_PATH]: asset });
}

export interface SeededCorpusPlugins {
  readonly library: CorpusPluginLibrary;
  readonly wirePrivateLiterals: readonly string[];
  readonly installed: Awaited<ReturnType<typeof seedInstalledPlugin>>;
  readonly providers: Awaited<ReturnType<typeof seedPluginProviders>>;
  readonly distribution: Awaited<ReturnType<typeof seedDistributedPlugin>>;
  readonly recipient: Awaited<ReturnType<typeof seedPluginGrant>>;
  readonly repeated: Awaited<ReturnType<typeof seedDistributedPlugin>>;
  readonly tombstones: readonly (typeof pluginProviderClaims.$inferSelect)[];
  readonly admin: Awaited<ReturnType<typeof seedAdminProvider>>;
  readonly refused: Awaited<ReturnType<typeof seedPluginGrant>>;
  readonly publication: Awaited<ReturnType<ServerTestHarness["services"]["plugin"]["listDistributedPlugins"]>>;
}

/** Capture the actual routed publications under one native viewer, not private canonical row projections. */
export async function captureCorpusPluginStage(root: ServerTestHarness, viewerUserId: UserId, ids: CorpusPluginStage["ids"]): Promise<CorpusPluginStage> {
  const caller = await root.internalCallerFor(viewerUserId);
  const input = corpusPluginInput(ids);
  return {
    viewerUserId,
    ids,
    reads: {
      plugins: { input: input.plugins, output: await caller.plugin.list(input.plugins) },
      surfaces: { input: input.surfaces, output: await caller.plugin.listSurfaces(input.surfaces) },
      commands: { input: input.commands, output: await caller.plugin.listCommands(input.commands) },
      displayTransforms: { input: input.displayTransforms, output: await caller.plugin.listDisplayTransforms(input.displayTransforms) },
      assets: { input: input.assets, output: await caller.plugin.listBundleAssets(input.assets) },
      log: { input: input.log, output: await caller.plugin.getLog(input.log) },
      state: { input: input.state, output: await caller.plugin.getSurfaceState(input.state) },
    },
  };
}

/** Use an existing real recipient; only that recipient's explicit grant may start their guest. */
export async function seedCorpusPlugins(root: ServerTestHarness, recipientId: UserId): Promise<SeededCorpusPlugins> {
  const caller = await root.principalFor(root.ownerId);
  const recipientCaller = await root.principalFor(recipientId);
  const manifest = CORPUS_PLUGIN_PROVIDER_MANIFEST;
  const bytes = corpusPluginBundle(
    makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)),
    manifest,
    `${CORPUS_PLUGIN_OUTPUT_SOURCE}\n${GUEST_SOURCE}`,
    root.clock.now(),
  );
  const installed = await seedInstalledPlugin(root, { caller, bundle: bytes, grant: [] });
  const ownerIds = { pluginId: installed.outcome.id, surfaceId: CORPUS_PLUGIN_OUTPUT_SURFACE };
  const ownerPending = await captureCorpusPluginStage(root, caller.userId, ownerIds);
  const providers = await seedPluginProviders(
    root,
    { caller, pluginId: installed.outcome.id, grant: manifest.capabilities, acknowledgedNetHosts: [], enable: true },
    (manifest.providers ?? []).map((provider) => provider.id),
  );
  const ownerActive = await captureCorpusPluginStage(root, caller.userId, ownerIds);
  const distribution = await seedDistributedPlugin(root, { caller, bundle: bytes });
  const recipientInstall = distribution.installs.find(({ plugin }) => plugin.ownerId === recipientCaller.userId);
  if (recipientInstall === undefined) {
    throw new Error("actual corpus plugin distribution omitted the required recipient");
  }
  const recipient = await seedPluginGrant(root, {
    caller: recipientCaller,
    pluginId: recipientInstall.plugin.id,
    grant: manifest.capabilities,
    acknowledgedNetHosts: [],
    enable: true,
  });
  const recipientActive = await captureCorpusPluginStage(root, recipientCaller.userId, { ...ownerIds, pluginId: recipient.outcome.id });
  await root.services.plugin.setEnabled({ caller, pluginId: installed.outcome.id, enabled: false });
  const ownerDisabled = await captureCorpusPluginStage(root, caller.userId, ownerIds);
  const tombstones = await root.db
    .select()
    .from(pluginProviderClaims)
    .where(
      and(
        eq(pluginProviderClaims.ownerId, caller.userId),
        inArray(
          pluginProviderClaims.providerId,
          providers.map(({ claim }) => claim.providerId),
        ),
      ),
    );
  const repeated = await seedDistributedPlugin(root, { caller, bundle: bytes });
  const admin = await seedAdminProvider(root, CORPUS_ADMIN_PROVIDER, { admin: caller.userId });
  const refusedManifest = pluginManifestSchema.parse({ ...CORPUS_PLUGIN_MANIFEST, id: "corpus-refused", name: "Corpus refused activation" });
  const refusedInstall = await seedInstalledPlugin(root, {
    caller,
    bundle: corpusPluginBundle(makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)), refusedManifest, REFUSED_GUEST_SOURCE, root.clock.now()),
    grant: [],
  });
  const refused = await seedPluginGrant(root, {
    caller,
    pluginId: refusedInstall.outcome.id,
    grant: refusedManifest.capabilities,
    acknowledgedNetHosts: [],
    enable: true,
  });
  const rpc = await root.internalCallerFor(caller.userId);
  const publication = await rpc.plugin.listDistributed();
  const library: CorpusPluginLibrary = {
    ownerPending,
    ownerActive,
    recipientActive,
    ownerDisabled,
    ownerFinal: { viewerUserId: caller.userId, read: { input: undefined, output: await rpc.plugin.list() } },
    distribution: { viewerUserId: caller.userId, read: { input: undefined, output: publication }, installed: distribution.outcome, repeated: repeated.outcome },
  };
  return {
    installed,
    providers,
    distribution,
    recipient,
    repeated,
    tombstones,
    admin,
    refused,
    publication,
    library,
    wirePrivateLiterals: [CORPUS_PLUGIN_STORAGE_VALUE, CORPUS_PLUGIN_OUTPUT_PRIVATE_VALUE],
  };
}

type PluginService = ServerTestHarness["services"]["plugin"];

export interface CorpusPluginWithdrawal {
  readonly published: Awaited<ReturnType<typeof seedDistributedPlugin>>;
  readonly upgraded: Awaited<ReturnType<PluginService["upgrade"]>>;
  readonly before: Awaited<ReturnType<typeof capturePluginRows>>;
  readonly refused: readonly PromiseSettledResult<Awaited<ReturnType<PluginService["uninstallForAllUsers"]>>>[];
  readonly stillPublished: Awaited<ReturnType<PluginService["listDistributedPlugins"]>>;
  readonly withdrawn: Awaited<ReturnType<PluginService["uninstallForAllUsers"]>>;
  readonly after: Awaited<ReturnType<typeof capturePluginRows>>;
  readonly ownerInstalls: Awaited<ReturnType<PluginService["list"]>>;
  readonly remainingPublications: Awaited<ReturnType<PluginService["listDistributedPlugins"]>>;
  readonly lateApplication: Awaited<ReturnType<PluginService["applyDistributedPlugins"]>>;
}

/** Withdraw only the published version; a recipient's native upgrade and private state remain their own. */
export async function seedCorpusPluginWithdrawal(root: ServerTestHarness, recipientId: UserId): Promise<CorpusPluginWithdrawal> {
  const owner = await root.principalFor(root.ownerId);
  const recipient = await root.principalFor(recipientId);
  const bytes = corpusPluginBundle(makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)), CORPUS_PLUGIN_MANIFEST, GUEST_SOURCE, root.clock.now());
  const published = await seedDistributedPlugin(root, { caller: owner, bundle: bytes });
  const selected = published.installs.find(({ plugin }) => plugin.ownerId === recipient.userId);
  if (selected === undefined) {
    throw new Error("Native distribution omitted the withdrawal recipient");
  }
  await seedPluginGrant(root, {
    caller: recipient,
    pluginId: selected.plugin.id,
    grant: CORPUS_PLUGIN_MANIFEST.capabilities,
    acknowledgedNetHosts: [],
    enable: true,
  });
  const next = pluginManifestSchema.parse({ ...CORPUS_PLUGIN_MANIFEST, version: "2.0.0" });
  const upgraded = await root.services.plugin.upgrade({
    caller: recipient,
    pluginId: selected.plugin.id,
    bundle: corpusPluginBundle(makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)), next, GUEST_SOURCE, root.clock.now()),
  });
  const before = await capturePluginRows(root.db, recipient.userId, selected.plugin.id);
  const refused = await Promise.allSettled([root.services.plugin.uninstallForAllUsers({ caller: recipient, slug: published.outcome.slug })]);
  const stillPublished = await root.services.plugin.listDistributedPlugins({ caller: owner });
  const withdrawn = await root.services.plugin.uninstallForAllUsers({ caller: owner, slug: published.outcome.slug });
  const after = await capturePluginRows(root.db, recipient.userId, selected.plugin.id);
  const ownerInstalls = await root.services.plugin.list({ caller: owner });
  const remainingPublications = await root.services.plugin.listDistributedPlugins({ caller: owner });
  const lateUser = await seedCorpusAccount(root);
  const lateApplication = await root.services.plugin.applyDistributedPlugins({ caller: lateUser });
  return { published, upgraded, before, refused, stillPublished, withdrawn, after, ownerInstalls, remainingPublications, lateApplication };
}
