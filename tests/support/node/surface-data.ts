// Walkthrough datasets and evidence remain private, including synthetic runs. Owner clones never run corpus producers.
import { spawn } from "node:child_process";
import { constants, existsSync } from "node:fs";
import { chmod, copyFile, lstat, mkdir, mkdtemp, open, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, sep } from "node:path";
import process from "node:process";
import type { AuthMode } from "@orb/contracts/identity";
import { AUTH_MODES, viewerViewSchema } from "@orb/contracts/identity";
import { connectionViewSchema } from "@orb/contracts/inference";
import type {
  assets as assetTable,
  characters as characterTable,
  chats as chatTable,
  Db,
  documents as documentTable,
  embeddingCalls as embeddingCallTable,
  embedGenerations as embedGenerationTable,
  embedSpaceState as embedSpaceTable,
  embedGenerationTargets as embedTargetTable,
  personas as personaTable,
  plugins as pluginTable,
  presets as presetTable,
  refinerySessions as refinerySessionTable,
  rosterPresets as rosterTable,
  workloadSchedules as scheduleTable,
  tags as tagTable,
  users as userTable,
  worldBooks as worldBookTable,
} from "@orb/db";
import { createIdSource, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import type { DataLayout } from "@orb/server/foundation/data-layout";
import { inheritedProcessEnv } from "@orb/tooling/floor/process/process-env";
import type { StageRow } from "@orb/tooling/snap";
import { z } from "zod";
import type { SurfaceDataMode } from "../iso/surface-data.ts";
import { AUTH_MODE_CAPABILITIES, authModeCapabilitySchema } from "./auth-mode-options.ts";
import type { NativeServerHarnessOptions, NativeServerTestHarness, ServerHarnessOptions, ServerRuntimeTime } from "./server.ts";

type SurfaceOwner = Pick<typeof userTable.$inferSelect, "id" | "handle">;
type SurfacePlugin = Pick<
  typeof pluginTable.$inferSelect,
  "id" | "ownerId" | "slug" | "version" | "bundleAssetId" | "status" | "grantedCapabilities" | "pendingReconsent" | "widenedNetHosts" | "manifest"
>;

interface SurfaceEmbeddingPosture {
  readonly generations: readonly Pick<typeof embedGenerationTable.$inferSelect, "id" | "ownerId" | "task" | "via">[];
  readonly targets: readonly (typeof embedTargetTable.$inferSelect)[];
  readonly spaces: readonly (typeof embedSpaceTable.$inferSelect)[];
  readonly calls: readonly Pick<typeof embeddingCallTable.$inferSelect, "id" | "ownerId" | "task" | "outcome" | "inputCount">[];
  readonly counts: {
    readonly characters: number;
    readonly images: number;
    readonly chatDigests: number;
    readonly chatSegments: number;
    readonly documents: number;
    readonly imageAnalyses: number;
    readonly imageSkips: number;
  };
}

export interface SurfaceSubjectInventory {
  readonly characters: readonly Pick<typeof characterTable.$inferSelect, "id">[];
  readonly personas: readonly Pick<typeof personaTable.$inferSelect, "id">[];
  readonly chats: readonly Pick<typeof chatTable.$inferSelect, "id">[];
  readonly presets: readonly Pick<typeof presetTable.$inferSelect, "id">[];
  readonly rosters: readonly Pick<typeof rosterTable.$inferSelect, "id">[];
  readonly worldBooks: readonly Pick<typeof worldBookTable.$inferSelect, "id">[];
  readonly assets: readonly Pick<typeof assetTable.$inferSelect, "id">[];
  readonly documents: readonly Pick<typeof documentTable.$inferSelect, "id">[];
  readonly refinerySessions: readonly Pick<typeof refinerySessionTable.$inferSelect, "id">[];
  readonly tags: readonly Pick<typeof tagTable.$inferSelect, "id">[];
  readonly plugins: readonly Pick<typeof pluginTable.$inferSelect, "id">[];
}

export const surfaceSubjectInventorySchema = z.strictObject({
  characters: z.array(z.strictObject({ id: typeIdSchema(ID_PREFIX.character) })).readonly(),
  personas: z.array(z.strictObject({ id: typeIdSchema(ID_PREFIX.persona) })).readonly(),
  chats: z.array(z.strictObject({ id: typeIdSchema(ID_PREFIX.chat) })).readonly(),
  presets: z.array(z.strictObject({ id: typeIdSchema(ID_PREFIX.preset) })).readonly(),
  rosters: z.array(z.strictObject({ id: typeIdSchema(ID_PREFIX.rosterPreset) })).readonly(),
  worldBooks: z.array(z.strictObject({ id: typeIdSchema(ID_PREFIX.worldBook) })).readonly(),
  assets: z.array(z.strictObject({ id: typeIdSchema(ID_PREFIX.asset) })).readonly(),
  documents: z.array(z.strictObject({ id: typeIdSchema(ID_PREFIX.document) })).readonly(),
  refinerySessions: z.array(z.strictObject({ id: typeIdSchema(ID_PREFIX.refinerySession) })).readonly(),
  tags: z.array(z.strictObject({ id: typeIdSchema(ID_PREFIX.tag) })).readonly(),
  plugins: z.array(z.strictObject({ id: typeIdSchema(ID_PREFIX.plugin) })).readonly(),
}) satisfies z.ZodType<SurfaceSubjectInventory>;

export interface SurfaceDataOptions {
  readonly dataMode: SurfaceDataMode;
  readonly privateRoot: string;
  readonly ownerDataDirectory?: string;
  readonly environment?: NodeJS.ProcessEnv;
  readonly onRunCreated?: (runRoot: string) => Promise<void>;
}

interface SurfaceDataProvenance {
  readonly source: NonNullable<StageRow["dbProvenance"]> | null;
  readonly owner: { readonly userId: SurfaceOwner["id"]; readonly handle: SurfaceOwner["handle"] };
  readonly subjects: SurfaceSubjectInventory;
  readonly plugins: readonly SurfacePlugin[];
  readonly pausedSchedules: readonly Pick<typeof scheduleTable.$inferSelect, "id" | "ownerId" | "kind">[];
  readonly embeddings: { readonly source: SurfaceEmbeddingPosture | null; readonly prepared: SurfaceEmbeddingPosture; readonly preserved: boolean | null };
}

export interface PreparedSurfaceData extends AsyncDisposable {
  readonly runRoot: string;
  readonly dataMode: SurfaceDataMode;
  readonly layout: DataLayout;
  readonly owner: SurfaceDataProvenance["owner"];
  readonly provenance: SurfaceDataProvenance;
}

export interface OpenSurfaceRoot extends AsyncDisposable {
  readonly root: NativeServerTestHarness;
  readonly origin: string;
  readonly pluginPosture: readonly SurfacePlugin[];
  readonly subjects: SurfaceSubjectInventory;
  readonly authentication: SurfaceAuthentication;
  readonly generation: z.output<typeof surfaceGenerationSchema>;
}

export const surfaceGenerationSchema = z.strictObject({
  connection: connectionViewSchema.pick({ id: true, model: true, label: true }),
  structuredConnection: connectionViewSchema.pick({ id: true, model: true, label: true }),
  completionText: z.string().min(1),
  cancelCue: z.string().min(1),
  requestEvidencePath: z.string().refine(isAbsolute, "Scripted provider evidence must stay within its absolute private run owner"),
  canonicalSyntheticEmbedding: z.boolean(),
});

export const surfaceAuthenticationSchema = z.object({
  mode: z.enum(AUTH_MODES),
  capability: authModeCapabilitySchema,
  multiHumanCapable: z.boolean(),
  subjects: z.array(z.object({ viewer: viewerViewSchema, password: z.string().nullable() })).min(1),
});
type SurfaceAuthentication = z.output<typeof surfaceAuthenticationSchema>;

export interface SurfaceRootOptions {
  readonly clientDistDir: string;
  readonly time: ServerRuntimeTime;
  readonly environment?: NodeJS.ProcessEnv;
  readonly authMode?: AuthMode;
}

async function privateDirectory(path: string): Promise<string> {
  const canonical = await realpath(path);
  const stat = await lstat(canonical);
  if (!stat.isDirectory()) {
    throw new Error("Surface artifacts require an ordinary directory");
  }
  if (process.platform === "win32") {
    const home = await realpath(homedir());
    const target = canonical;
    // Node exposes no Windows ACL evidence; use the inherited per-user profile policy, never POSIX mode as proof.
    if (target !== home && !target.startsWith(`${home}${sep}`)) {
      throw new Error("Surface Windows artifacts require a directory beneath the current user profile");
    }
    return canonical;
  }
  if (process.getuid === undefined || stat.mode % 0o1000 !== 0o700 || stat.uid !== process.getuid()) {
    throw new Error("Surface artifacts require an owned POSIX private directory with mode 0700");
  }
  return canonical;
}

/** Validate every native output against its inaccessible, external run owner. */
export async function assertSurfaceRunOutput(runRoot: string, artifactPath: string, environment: NodeJS.ProcessEnv = inheritedProcessEnv()): Promise<void> {
  const root = await privateDirectory(runRoot);
  const { assertLocalCorpusOutputRouting } = await import("./corpus.ts");
  assertLocalCorpusOutputRouting(root, artifactPath, environment);
}

/** Allocate evidence without loading or producing an application dataset. */
export async function createSurfaceArtifactRun(privateRoot: string, environment: NodeJS.ProcessEnv = inheritedProcessEnv()): Promise<string> {
  const parent = await privateDirectory(privateRoot);
  await assertSurfaceRunOutput(parent, join(parent, "surface-run"), environment);
  const runRoot = await mkdtemp(join(parent, "surface-"));
  if (process.platform !== "win32") {
    await chmod(runRoot, 0o700);
  }
  return runRoot;
}

async function secureCopiedTree(path: string): Promise<void> {
  const stat = await lstat(path);
  if (stat.isSymbolicLink() || !(stat.isDirectory() || stat.isFile())) {
    throw new Error("Surface dataset refuses symbolic links and special files");
  }
  if (process.platform !== "win32") {
    await chmod(path, stat.isDirectory() ? 0o700 : 0o600);
  }
  if (stat.isDirectory()) {
    for (const entry of await readdir(path)) {
      await secureCopiedTree(join(path, entry));
    }
  }
}

async function surfaceSubjects(db: Db, ownerId: SurfaceOwner["id"]): Promise<SurfaceSubjectInventory> {
  const { assets, characters, chatParticipants, documents, personas, plugins, presets, refinerySessions, rosterPresets, tags, worldBooks } = await import(
    "@orb/db"
  );
  const { asc, eq } = await import("drizzle-orm");
  return {
    characters: await db.select({ id: characters.id }).from(characters).where(eq(characters.ownerId, ownerId)).orderBy(asc(characters.id)),
    personas: await db.select({ id: personas.id }).from(personas).where(eq(personas.ownerId, ownerId)).orderBy(asc(personas.id)),
    chats: await db
      .selectDistinct({ id: chatParticipants.chatId })
      .from(chatParticipants)
      .where(eq(chatParticipants.userId, ownerId))
      .orderBy(asc(chatParticipants.chatId)),
    presets: await db.select({ id: presets.id }).from(presets).where(eq(presets.ownerId, ownerId)).orderBy(asc(presets.id)),
    rosters: await db.select({ id: rosterPresets.id }).from(rosterPresets).where(eq(rosterPresets.ownerId, ownerId)).orderBy(asc(rosterPresets.id)),
    worldBooks: await db.select({ id: worldBooks.id }).from(worldBooks).where(eq(worldBooks.ownerId, ownerId)).orderBy(asc(worldBooks.id)),
    assets: await db.select({ id: assets.id }).from(assets).where(eq(assets.ownerId, ownerId)).orderBy(asc(assets.id)),
    documents: await db.select({ id: documents.id }).from(documents).where(eq(documents.ownerId, ownerId)).orderBy(asc(documents.id)),
    refinerySessions: await db
      .select({ id: refinerySessions.id })
      .from(refinerySessions)
      .innerJoin(characters, eq(refinerySessions.characterId, characters.id))
      .where(eq(characters.ownerId, ownerId))
      .orderBy(asc(refinerySessions.id)),
    tags: await db.select({ id: tags.id }).from(tags).where(eq(tags.ownerId, ownerId)).orderBy(asc(tags.id)),
    plugins: await db.select({ id: plugins.id }).from(plugins).where(eq(plugins.ownerId, ownerId)).orderBy(asc(plugins.id)),
  };
}

async function pluginPosture(db: Db): Promise<readonly SurfacePlugin[]> {
  const { plugins } = await import("@orb/db");
  const { asc } = await import("drizzle-orm");
  // Every owner is inventoried because native plugin reactivation restores every owner's enabled rows.
  return await db
    .select({
      id: plugins.id,
      ownerId: plugins.ownerId,
      slug: plugins.slug,
      version: plugins.version,
      bundleAssetId: plugins.bundleAssetId,
      status: plugins.status,
      grantedCapabilities: plugins.grantedCapabilities,
      pendingReconsent: plugins.pendingReconsent,
      widenedNetHosts: plugins.widenedNetHosts,
      manifest: plugins.manifest,
    })
    .from(plugins)
    .orderBy(asc(plugins.id));
}

async function embeddingPosture(db: Db): Promise<SurfaceEmbeddingPosture> {
  const {
    characterEmbeddings,
    chatDigests,
    chatSegments,
    documentChunks,
    embeddingCalls,
    embedGenerations,
    embedGenerationTargets,
    embedSpaceState,
    imageAnalyses,
    imageEmbeddings,
    imageIndexSkips,
  } = await import("@orb/db");
  const { asc, count } = await import("drizzle-orm");
  // Whole-dataset custody evidence, not a viewer read: preserve every owner's completed work without reading text or vector bytes.
  return {
    generations: await db
      .select({ id: embedGenerations.id, ownerId: embedGenerations.ownerId, task: embedGenerations.task, via: embedGenerations.via })
      .from(embedGenerations)
      .orderBy(asc(embedGenerations.id)),
    targets: await db.select().from(embedGenerationTargets).orderBy(asc(embedGenerationTargets.ownerId), asc(embedGenerationTargets.task)),
    spaces: await db.select().from(embedSpaceState).orderBy(asc(embedSpaceState.ownerId), asc(embedSpaceState.scope)),
    calls: await db
      .select({
        id: embeddingCalls.id,
        ownerId: embeddingCalls.ownerId,
        task: embeddingCalls.task,
        outcome: embeddingCalls.outcome,
        inputCount: embeddingCalls.inputCount,
      })
      .from(embeddingCalls)
      .orderBy(asc(embeddingCalls.id)),
    counts: {
      characters: (await db.select({ count: count() }).from(characterEmbeddings))[0]?.count ?? 0,
      images: (await db.select({ count: count() }).from(imageEmbeddings))[0]?.count ?? 0,
      chatDigests: (await db.select({ count: count() }).from(chatDigests))[0]?.count ?? 0,
      chatSegments: (await db.select({ count: count() }).from(chatSegments))[0]?.count ?? 0,
      documents: (await db.select({ count: count() }).from(documentChunks))[0]?.count ?? 0,
      imageAnalyses: (await db.select({ count: count() }).from(imageAnalyses))[0]?.count ?? 0,
      imageSkips: (await db.select({ count: count() }).from(imageIndexSkips))[0]?.count ?? 0,
    },
  };
}

async function sourceEmbeddingPosture(sourceRoot: string, runRoot: string): Promise<SurfaceEmbeddingPosture> {
  const { closeDb, createDb, localPath } = await import("@orb/db");
  const { resolveDataLayout } = await import("@orb/server/foundation/data-layout");
  const source = localPath(resolveDataLayout({ ["DATA_DIR"]: sourceRoot }).databaseUrl);
  if (source === undefined) {
    throw new Error("Surface source requires a file-backed database");
  }
  const audit = resolveDataLayout({ ["DATA_DIR"]: join(runRoot, "source-posture") });
  const destination = localPath(audit.databaseUrl);
  if (destination === undefined) {
    throw new Error("Surface posture evidence requires a file-backed database");
  }
  await mkdir(audit.dbDir, { recursive: true, mode: 0o700 });
  try {
    for (const suffix of ["", "-wal", "-shm"]) {
      if (existsSync(source + suffix)) {
        if (!(await lstat(source + suffix)).isFile()) {
          throw new Error("Surface source database and sidecars must be regular files");
        }
        await copyFile(source + suffix, destination + suffix, constants.COPYFILE_EXCL);
      }
    }
    await secureCopiedTree(audit.root);
    const db = await createDb(audit.databaseUrl);
    try {
      return await embeddingPosture(db);
    } finally {
      // Baseline observation must not migrate, optimize or otherwise reinterpret the source's completed state.
      closeDb(db);
    }
  } finally {
    await rm(audit.root, { recursive: true, force: true });
  }
}

async function preparedEmbeddingPosture(layout: DataLayout): Promise<SurfaceEmbeddingPosture> {
  const { closeDb, createDb } = await import("@orb/db");
  const db = await createDb(layout.databaseUrl);
  try {
    return await embeddingPosture(db);
  } finally {
    closeDb(db);
  }
}

async function datasetInventory(layout: DataLayout, idleRequired: boolean): Promise<Pick<SurfaceDataProvenance, "owner" | "subjects" | "plugins">> {
  const { createDb, pendingTurns, preCloseHousekeeping, users, workloads } = await import("@orb/db");
  const { ACTIVE_WORKLOAD_STATUSES } = await import("@orb/contracts/workloads");
  const { count, eq, inArray } = await import("drizzle-orm");
  const db = await createDb(layout.databaseUrl);
  try {
    const owners = await db.select({ id: users.id, handle: users.handle, enabled: users.enabled }).from(users).where(eq(users.role, "owner"));
    const owner = owners[0];
    if (owners.length !== 1 || owner === undefined || !owner.enabled) {
      throw new Error("Surface dataset requires its existing enabled singleton owner");
    }
    if (idleRequired) {
      const active = await db.select({ count: count() }).from(workloads).where(inArray(workloads.status, ACTIVE_WORKLOAD_STATUSES));
      const pending = await db.select({ count: count() }).from(pendingTurns);
      if (active[0]?.count !== 0 || pending[0]?.count !== 0) {
        throw new Error("Surface owner clone refuses unfinished work and pending turns");
      }
    }
    return { owner: { userId: owner.id, handle: owner.handle }, subjects: await surfaceSubjects(db, owner.id), plugins: await pluginPosture(db) };
  } finally {
    await preCloseHousekeeping(db);
  }
}

function surfaceHarnessOptions(
  prepared: Pick<PreparedSurfaceData, "layout" | "runRoot" | "owner">,
  mode: AuthMode,
  clientDistDir?: string,
  execution: Pick<ServerHarnessOptions, "providerFetch" | "networkExecution"> = {},
): Omit<ServerHarnessOptions, "clock" | "timers" | "ids" | "ownerId"> & Pick<NativeServerHarnessOptions, "ownerId" | "idSource"> {
  return {
    ownerId: prepared.owner.userId,
    idSource: createIdSource(),
    startJobs: false,
    pluginSpawn: spawn,
    ...(clientDistDir === undefined ? {} : { clientDistDir }),
    temporaryParentDir: prepared.runRoot,
    casDir: prepared.layout.assets,
    variantDir: prepared.layout.variants,
    importStagingDir: prepared.layout.importStaging,
    relayDir: prepared.layout.relay,
    secretsDir: prepared.layout.secrets,
    rolePolicyConfig: { ["DEFAULT_USER_HANDLE"]: prepared.owner.handle, ["OWNER_HANDLES"]: prepared.owner.handle },
    env: { ["AUTH_MODE"]: mode },
    ...execution,
  };
}

async function quietCopiedSchedules(
  layout: DataLayout,
  runRoot: string,
  owner: SurfaceDataProvenance["owner"],
): Promise<SurfaceDataProvenance["pausedSchedules"]> {
  const { createDb, preCloseHousekeeping } = await import("@orb/db");
  const { createServerHarness } = await import("./server.ts");
  const db = await createDb(layout.databaseUrl);
  try {
    await using root = await createServerHarness({ ...surfaceHarnessOptions({ layout, runRoot, owner }, "single-user"), db });
    const schedules = (await root.services.workloads.listSchedules({ caller: null })).filter(({ enabled }) => enabled);
    for (const schedule of schedules) {
      await root.services.workloads.setScheduleEnabled({ caller: null, id: schedule.id, enabled: false });
    }
    return schedules.map(({ id, ownerId, kind }) => ({ id, ownerId, kind }));
  } finally {
    await preCloseHousekeeping(db);
  }
}

async function privateFailure(runRoot: string, error: unknown, environment?: NodeJS.ProcessEnv): Promise<never> {
  const { writePrivateFailureEvidence } = await import("./corpus.ts");
  let captured = false;
  try {
    const artifact = join(runRoot, "failure.txt");
    await assertSurfaceRunOutput(runRoot, artifact, environment);
    await using file = await open(artifact, "wx", 0o600);
    await writePrivateFailureEvidence(file, error);
    captured = true;
  } catch {
    captured = false;
  }
  // Native error causes can embed source content; only the private failure artifact may carry them.
  throw new Error(
    captured
      ? "Surface preparation failed; inspect failure.txt in the private run directory"
      : "Surface preparation failed; private failure evidence could not be retained",
  );
}

async function cloneSurfaceDataset(sourceRoot: string, layout: DataLayout): Promise<NonNullable<SurfaceDataProvenance["source"]>> {
  const { localPath } = await import("@orb/db");
  const { resolveDataLayout } = await import("@orb/server/foundation/data-layout");
  const { cloneMigratedStageDb } = await import("@orb/tooling/snap");
  const sourceLayout = resolveDataLayout({ ["DATA_DIR"]: sourceRoot });
  const sourceDb = localPath(sourceLayout.databaseUrl);
  if (sourceDb === undefined) {
    throw new Error("Surface source requires a file-backed database");
  }
  // The retained clone owner preserves symlinks: a symlinked database would scrub its original target.
  for (const suffix of ["", "-wal", "-shm"]) {
    if (existsSync(sourceDb + suffix) && !(await lstat(sourceDb + suffix)).isFile()) {
      throw new Error("Surface source database and sidecars must be regular files");
    }
  }
  await mkdir(layout.root, { mode: 0o700 });
  return await cloneMigratedStageDb(sourceDb, { databaseUrl: layout.databaseUrl, assetsDir: layout.assets });
}

/** Prepare only disposable bytes; owner mode never augments, rebinds or disables the source's content. */
export async function prepareSurfaceData(options: SurfaceDataOptions): Promise<PreparedSurfaceData> {
  const { dataMode, environment } = options;
  const { SURFACE_DATA_MODES } = await import("../iso/surface-data.ts");
  if (!z.enum(SURFACE_DATA_MODES).safeParse(dataMode).success || (dataMode === "owner") !== (options.ownerDataDirectory !== undefined)) {
    throw new Error("Surface data mode requires an explicit, matching source selection");
  }
  const sourceRoot = dataMode === "owner" ? await realpath(options.ownerDataDirectory ?? "") : undefined;
  if (sourceRoot !== undefined) {
    const privateRoot = await realpath(options.privateRoot);
    if (privateRoot === sourceRoot || privateRoot.startsWith(`${sourceRoot}${sep}`) || sourceRoot.startsWith(`${privateRoot}${sep}`)) {
      throw new Error("Surface source and artifact roots must be independent");
    }
  }
  const runRoot = await createSurfaceArtifactRun(options.privateRoot, environment);
  const { resolveDataLayout } = await import("@orb/server/foundation/data-layout");
  const layout = resolveDataLayout({ ["DATA_DIR"]: join(runRoot, "dataset") });
  try {
    await options.onRunCreated?.(runRoot);
    const sourceEmbeddings = sourceRoot === undefined ? null : await sourceEmbeddingPosture(sourceRoot, runRoot);
    const producers: Record<SurfaceDataMode, () => Promise<SurfaceDataProvenance["source"]>> = {
      owner: () => cloneSurfaceDataset(sourceRoot ?? "", layout),
      synthetic: async () => {
        const { createCorpusCapsule } = await import("./corpus.ts");
        const { createCorpusRecipe } = await import("./corpus-recipe.ts");
        const { options: recipe } = await createCorpusRecipe(runRoot);
        await using capsule = await createCorpusCapsule({ ...recipe, directory: join(runRoot, "producer") });
        await cloneSurfaceDataset(capsule.layout.root, layout);
        return null;
      },
    };
    const source = await producers[dataMode]();
    await secureCopiedTree(layout.root);
    const inventory = await datasetInventory(layout, dataMode === "owner");
    const pausedSchedules = dataMode === "owner" ? await quietCopiedSchedules(layout, runRoot, inventory.owner) : [];
    const preparedEmbeddings = await preparedEmbeddingPosture(layout);
    const embeddings = {
      source: sourceEmbeddings,
      prepared: preparedEmbeddings,
      preserved: sourceEmbeddings === null ? null : JSON.stringify(sourceEmbeddings) === JSON.stringify(preparedEmbeddings),
    };
    const provenance = { source, ...inventory, pausedSchedules, embeddings };
    await writeFile(join(runRoot, "provenance.json"), JSON.stringify(provenance), { mode: 0o600, flag: "wx" });
    if (dataMode === "owner" && embeddings.preserved !== true) {
      throw new Error("Surface owner preparation changed completed embedding metadata; inspect private provenance.json");
    }
    return { runRoot, dataMode, layout, owner: inventory.owner, provenance, [Symbol.asyncDispose]: () => rm(layout.root, { recursive: true, force: true }) };
  } catch (error) {
    await rm(layout.root, { recursive: true, force: true });
    return await privateFailure(runRoot, error, environment);
  }
}

async function prepareSurfaceAuthentication(root: NativeServerTestHarness, prepared: PreparedSurfaceData, mode: AuthMode): Promise<SurfaceAuthentication> {
  const capability = AUTH_MODE_CAPABILITIES[mode];
  const owner = await root.principalFor(prepared.owner.userId);
  const caller = await root.internalCallerFor(owner.userId);
  const viewer = await caller.sessions.me();
  if (!capability.members) {
    return { mode, capability, multiHumanCapable: root.app.multiHumanCapable(), subjects: [{ viewer, password: null }] };
  }
  const { readAccounts } = await import("./admin/accounts.ts");
  const { CORPUS_OWNER_PASSWORD } = await import("./corpus-recipe.ts");
  const accounts = await readAccounts(root);
  const member = accounts.find((account) => account.id !== owner.userId && account.enabled && account.role === "user");
  if (prepared.dataMode !== "synthetic" || member === undefined) {
    throw new Error("Surface local sessions require generated owner and member accounts");
  }
  await root.services.settings.updateAppSettings({ principal: owner, partial: { localMultiUser: true } });
  const subjects: SurfaceAuthentication["subjects"] = [];
  for (const userId of [owner.userId, member.id]) {
    await root.services.admin.resetPassword({ principal: owner, userId, password: CORPUS_OWNER_PASSWORD });
    const user = await root.internalCallerFor(userId);
    subjects.push({ viewer: await user.sessions.me(), password: CORPUS_OWNER_PASSWORD });
  }
  return { mode, capability, multiHumanCapable: root.app.multiHumanCapable(), subjects };
}

async function assertSurfaceOwnerAdmission(root: NativeServerTestHarness, origin: string, authentication: SurfaceAuthentication): Promise<void> {
  const subject = authentication.subjects[0];
  if (subject === undefined) {
    throw new Error("Surface owner admission has no expected subject");
  }
  const { signInWithPassword } = await import("./sign-in.ts");
  const cookie = subject.password === null ? undefined : await signInWithPassword(root, subject.viewer.handle, subject.password);
  const response = await fetch(`${origin}/api/trpc/sessions.me`, { ...(cookie === undefined ? {} : { headers: { cookie } }) });
  const result = z.object({ result: z.object({ data: viewerViewSchema }) }).safeParse(await response.json());
  if (!(response.ok && result.success) || JSON.stringify(result.data.result.data) !== JSON.stringify(subject.viewer)) {
    throw new Error("Surface native admission did not resolve the expected owner");
  }
}

interface SurfaceInventory {
  readonly plugins: readonly SurfacePlugin[];
  readonly subjects: SurfaceSubjectInventory;
  readonly embeddings: SurfaceEmbeddingPosture;
}

async function assertSurfaceInventory(
  root: NativeServerTestHarness,
  prepared: PreparedSurfaceData,
  afterNativeAdmission: boolean,
  expected: SurfaceInventory = {
    plugins: prepared.provenance.plugins,
    subjects: prepared.provenance.subjects,
    embeddings: prepared.provenance.embeddings.prepared,
  },
): Promise<SurfaceInventory> {
  const actual = {
    plugins: await pluginPosture(root.db),
    subjects: await surfaceSubjects(root.db, prepared.owner.userId),
    embeddings: await embeddingPosture(root.db),
  };
  const changed = {
    plugins: JSON.stringify(actual.plugins) !== JSON.stringify(expected.plugins),
    subjects: JSON.stringify(actual.subjects) !== JSON.stringify(expected.subjects),
    embeddings: JSON.stringify(actual.embeddings) !== JSON.stringify(expected.embeddings),
  };
  if (changed.plugins || changed.subjects || changed.embeddings) {
    await writeFile(join(prepared.runRoot, "initialization-failure.json"), JSON.stringify({ afterNativeAdmission, changed, expected, actual }), {
      mode: 0o600,
      flag: "wx",
    });
    throw new Error("Surface initialization changed the recorded subjects, plugin consent or completed embedding posture");
  }
  return actual;
}

async function admitSurfaceBoot(
  root: NativeServerTestHarness,
  prepared: PreparedSurfaceData,
  seededVersions: Readonly<Record<string, string>>,
): Promise<Pick<OpenSurfaceRoot, "subjects" | "pluginPosture">> {
  const { packShowcaseBundle, SHOWCASE_PLUGIN_SLUGS } = await import("@orb/showcase-plugins");
  const { parseBundle } = await import("@orb/server/domain/plugin");
  const { sha256Hex } = await import("@orb/server/primitives/content-hash");
  const { compareSemver } = await import("@orb/kit/semver");
  const principal = await root.principalFor(prepared.owner.userId);
  const settledVersions = (await root.services.settings.getUserSettings({ principal })).config.onboarding.seededPluginVersions;
  const settled = await pluginPosture(root.db);
  const upgrades: { readonly before: SurfacePlugin; readonly after: SurfacePlugin }[] = [];
  const accepted: SurfacePlugin[] = [];
  for (const before of prepared.provenance.plugins) {
    const after = settled.find(({ id }) => id === before.id);
    if (after === undefined || JSON.stringify(after) === JSON.stringify(before)) {
      accepted.push(before);
      continue;
    }
    const { version, bundleAssetId, manifest } = after;
    const priorVersion = before.version;
    const recorded = seededVersions[before.slug];
    const shipped = SHOWCASE_PLUGIN_SLUGS.some((slug) => slug === before.slug) ? await packShowcaseBundle(before.slug) : null;
    if (
      before.ownerId !== prepared.owner.userId ||
      (recorded !== undefined && recorded !== priorVersion) ||
      shipped === null ||
      compareSemver(version, priorVersion) <= 0 ||
      settledVersions[before.slug] !== version ||
      JSON.stringify({ ...before, version, bundleAssetId, manifest }) !== JSON.stringify(after)
    ) {
      accepted.push(before);
      continue;
    }
    const canonical = parseBundle(shipped).manifest;
    const stored = await root.app.assets.readOwnedAssetBytes(principal, bundleAssetId);
    if (canonical.version !== version || JSON.stringify(canonical) !== JSON.stringify(manifest) || sha256Hex(stored.bytes) !== sha256Hex(shipped)) {
      accepted.push(before);
      continue;
    }
    upgrades.push({ before, after });
    accepted.push(after);
  }
  const subjects = await surfaceSubjects(root.db, prepared.owner.userId);
  const priorAssets = new Set(prepared.provenance.subjects.assets.map(({ id }) => id));
  const currentAssets = new Set(subjects.assets.map(({ id }) => id));
  const removed = prepared.provenance.subjects.assets.filter(({ id }) => !currentAssets.has(id));
  const added = subjects.assets.filter(({ id }) => !priorAssets.has(id));
  const bundleOnly =
    removed.every(({ id }) => upgrades.some(({ before }) => before.bundleAssetId === id)) &&
    added.every(({ id }) => upgrades.some(({ after }) => after.bundleAssetId === id));
  const admitted = await assertSurfaceInventory(root, prepared, true, {
    plugins: accepted,
    subjects: bundleOnly ? { ...prepared.provenance.subjects, assets: subjects.assets } : prepared.provenance.subjects,
    embeddings: prepared.provenance.embeddings.prepared,
  });
  // Replacement bundle bytes belong to this boot, not to the original snapshot's subject census.
  const originals = { ...admitted.subjects, assets: admitted.subjects.assets.filter(({ id }) => priorAssets.has(id)) };
  await writeFile(join(prepared.runRoot, "boot-provenance.json"), JSON.stringify({ source: prepared.provenance, settled: admitted, upgrades, originals }), {
    mode: 0o600,
  });
  return { subjects: originals, pluginPosture: admitted.plugins };
}

/** Serve the production graph with jobs stopped, one owned scripted peer and all other provider/SDK execution refused. */
export async function openPreparedSurfaceRoot(prepared: PreparedSurfaceData, options: SurfaceRootOptions): Promise<OpenSurfaceRoot> {
  await assertSurfaceRunOutput(prepared.runRoot, options.clientDistDir, options.environment);
  const mode = options.authMode ?? "single-user";
  if (mode !== "single-user" && mode !== "local") {
    throw new Error("Surface OIDC and forward-header adapters have not been executed; use the existing protocol suites");
  }
  if (prepared.dataMode === "owner" && mode !== "single-user") {
    throw new Error("Surface owner clones preserve their accounts and admit only the loopback owner");
  }
  const { createDb, preCloseHousekeeping } = await import("@orb/db");
  const { createServerHarness } = await import("./server.ts");
  const { reactivatePluginsOnBoot } = await import("@orb/server/entry/boot");
  const { bootGrantFor } = await import("./boot-grant.ts");
  const { createSurfaceProvider } = await import("./surface-provider.ts");
  await using construction = new AsyncDisposableStack();
  const db = await createDb(prepared.layout.databaseUrl);
  construction.defer(() => preCloseHousekeeping(db));
  try {
    const provider = construction.use(await createSurfaceProvider(prepared.runRoot, prepared.dataMode));
    const root = construction.use(
      await createServerHarness({
        ...surfaceHarnessOptions(prepared, mode, options.clientDistDir, { providerFetch: provider.transport.fetch, networkExecution: provider.transport }),
        time: options.time,
        db,
      }),
    );
    // Idle plugin children are unref'ed; their startup belongs to this real listener, not an ambient test runner.
    const address = await root.listen();
    const origin = `http://127.0.0.1:${address.port}`;
    const activation = await reactivatePluginsOnBoot({
      db: bootGrantFor(db),
      logger: root.logger,
      setEnabled: root.services.plugin.setEnabled,
      resolvePrincipal: root.principalFor,
    });
    const restored = await pluginPosture(db);
    if (activation.failed !== 0 || JSON.stringify(restored) !== JSON.stringify(prepared.provenance.plugins)) {
      throw new Error("Surface plugin activation changed the recorded install, enable or consent posture");
    }
    await assertSurfaceInventory(root, prepared, false);
    const principal = await root.principalFor(prepared.owner.userId);
    const seededVersions = (await root.services.settings.getUserSettings({ principal })).config.onboarding.seededPluginVersions;
    const authentication = await prepareSurfaceAuthentication(root, prepared, mode);
    await assertSurfaceOwnerAdmission(root, origin, authentication);
    await root.settleBackground();
    const admittedBoot = await admitSurfaceBoot(root, prepared, seededVersions);
    const before = await root.services.settings.getAppSettingsWithOverrides({ principal });
    const admitted = [...new Set([...before.resolved.privateEndpointAllowlist, ...provider.privateEndpointAdmissions])];
    const admissionPath = join(dirname(provider.requestEvidencePath), "admission.json");
    const beforeAdmission = { effective: before.resolved.privateEndpointAllowlist, override: before.overrides.privateEndpointAllowlist ?? null };
    const temporary = await root.services.settings.updateAppSettings({ principal, partial: { privateEndpointAllowlist: admitted } });
    construction.defer(async () => {
      const restoredSettings = await root.services.settings.updateAppSettings({
        principal,
        partial: { privateEndpointAllowlist: before.overrides.privateEndpointAllowlist ?? null },
      });
      await writeFile(
        admissionPath,
        JSON.stringify({ before: beforeAdmission, temporary: temporary.privateEndpointAllowlist, restored: restoredSettings.privateEndpointAllowlist }),
        {
          mode: 0o600,
        },
      );
      if (JSON.stringify(restoredSettings.privateEndpointAllowlist) !== JSON.stringify(before.resolved.privateEndpointAllowlist)) {
        throw new Error("The copied provider admission did not restore its original effective allowlist");
      }
    });
    await writeFile(admissionPath, JSON.stringify({ before: beforeAdmission, temporary: temporary.privateEndpointAllowlist, restored: null }), { mode: 0o600 });
    const connection = await root.services.connection.create({
      principal,
      label: "Surface scripted generation",
      providerId: "custom-openai",
      credentialId: null,
      baseUrl: provider.baseUrl,
      model: (await import("./corpus-provider.ts")).CORPUS_TEXT_MODEL,
      allowBackground: false,
      declared: {
        kind: "generation",
        generation: { input: ["text"], context: { window: 32_000 }, output: { structured: false } },
        features: { detectServer: false },
      },
    });
    const structuredConnection = await root.services.connection.create({
      principal,
      label: "Surface scripted structured generation",
      providerId: "custom-openai",
      credentialId: null,
      baseUrl: provider.baseUrl,
      model: connection.model,
      allowBackground: false,
      declared: {
        kind: "generation",
        generation: { input: ["text"], context: { window: 32_000 }, output: { structured: true } },
        features: { detectServer: false },
      },
    });
    const generation = surfaceGenerationSchema.parse({
      connection: { id: connection.id, model: connection.model, label: connection.label },
      structuredConnection: { id: structuredConnection.id, model: structuredConnection.model, label: structuredConnection.label },
      completionText: provider.completionText,
      cancelCue: provider.cancelCue,
      requestEvidencePath: provider.requestEvidencePath,
      canonicalSyntheticEmbedding: provider.canonicalSyntheticEmbedding,
    });
    await secureCopiedTree(prepared.runRoot);
    const lifetime = construction.move();
    return { root, origin, ...admittedBoot, authentication, generation, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
  } catch (error) {
    return await privateFailure(prepared.runRoot, error, options.environment);
  }
}
