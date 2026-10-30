// Storage-boundary controls prove clone fidelity, secret scrubbing and private output custody using real persisted data.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, lstat, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { createCharacterSchema } from "@orb/contracts/character";
import type { PluginManifest } from "@orb/contracts/plugin";
import {
  assets,
  characterEmbeddings,
  characters,
  createDb,
  embedGenerations,
  embedGenerationTargets,
  embedSpaceState,
  localPath,
  plugins,
  preCloseHousekeeping,
  rosterPresets,
  runMigrations,
  sessions,
  tags,
  userCredentials,
  users,
  workloadSchedules,
  worldBooks,
} from "@orb/db";
import type { CharacterId, PluginId, RefinerySessionId, TagId, UserId, WorkloadScheduleId } from "@orb/kit/ids";
import { brandedId, createIdSource, ID_PREFIX } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import type { DataLayout } from "@orb/server/foundation/data-layout";
import { resolveDataLayout } from "@orb/server/foundation/data-layout";
import { budget } from "@orb/tooling/floor/host/load-budget";
import { spawnNicedTranscript } from "@orb/tooling/floor/process/proc";
import { inheritedProcessEnv } from "@orb/tooling/floor/process/process-env";
import { asc, count, eq, sql } from "drizzle-orm";
import { createFrozenClock } from "../iso/clock.ts";
import { parseSurfaceProviderEvidence } from "../iso/surface-data.ts";
import { createControlledTimers } from "../iso/timers.ts";
import { AUTH_MODE_CAPABILITIES } from "./auth-mode-options.ts";
import { readRoomCanon } from "./chat/canon.ts";
import { seedCorpusConnections } from "./corpus-actors.ts";
import { CORPUS_PLUGIN_MANIFEST } from "./corpus-plugin.ts";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "./corpus-provider.ts";
import { SHIPPED_MIGRATIONS } from "./db.ts";
import { makeAssetBytes } from "./factories/asset.ts";
import { makePluginBundle } from "./factories/plugin.ts";
import { expect, test } from "./fixtures.ts";
import { servePhysicalPeer } from "./physical-peer.ts";
import type { NativeServerTestHarness, ServerTestHarness } from "./server.ts";
import { createServerHarness, SECRET_BOX_TEST_KEY } from "./server.ts";
import { signInWithPassword } from "./sign-in.ts";
import type { PreparedSurfaceData, SurfaceSubjectInventory } from "./surface-data.ts";
import {
  assertSurfaceRunOutput,
  createSurfaceArtifactRun,
  openPreparedSurfaceRoot,
  prepareSurfaceData,
  surfaceSubjectInventorySchema,
} from "./surface-data.ts";
import { createSurfaceProvider } from "./surface-provider.ts";

const LOCAL_ENVIRONMENT = inheritedProcessEnv({ ["CI"]: undefined, ["GITHUB_ACTIONS"]: undefined });
const SOURCE_HANDLE = brandedId("Handle").parse("retained-surface-owner");
const SOURCE_PASSWORD = "surface-source-password";
const SOURCE_SECRET = "surface-source-provider-key";
const STANDALONE_STARTUP_TIMEOUT_MS = 30_000;
const POST_ADMISSION_CREATIONS = 16;

async function exerciseClonedCharacterCrud(
  root: NativeServerTestHarness,
  originals: readonly Awaited<ReturnType<ServerTestHarness["services"]["character"]["get"]>>[],
): Promise<void> {
  const caller = await root.internalCallerFor(root.ownerId);
  const created: Awaited<ReturnType<typeof caller.character.create>>[] = [];
  // Keep the new rows until the batch completes, so a reset fixture cursor cannot reuse an occupied identity.
  for (let index = 0; index < POST_ADMISSION_CREATIONS; index++) {
    const input = createCharacterSchema.parse({
      handle: `surface-id-probe-${String(index)}`,
      name: `Disposable ID probe ${String(index)}`,
      description: "Disposable probe",
    });
    const card = await caller.character.create({ input });
    created.push(card);
  }
  for (const card of created) {
    const characterId = card.id;
    expect(await caller.character.get({ characterId })).toEqual(card);
    const name = "Updated disposable runtime character";
    await caller.character.update({ characterId, input: { name } });
    expect((await caller.character.get({ characterId })).name).toBe(name);
    await caller.character.remove({ characterId });
    await expect(caller.character.get({ characterId })).rejects.toMatchObject({ code: "NOT_FOUND" });
  }
  expect(await Promise.all(originals.map(({ id }) => caller.character.get({ characterId: id })))).toEqual(originals);
  await root.settleBackground();
}

async function expectPosixPrivateMode(path: string, mode: number): Promise<void> {
  if (process.platform === "win32") {
    return;
  }
  expect((await lstat(path)).mode % 0o1000).toBe(mode);
}

interface SourceDataset {
  readonly layout: DataLayout;
  readonly ownerId: UserId;
  readonly cardId: CharacterId;
  readonly foreignId: CharacterId;
  readonly pluginId: PluginId;
  readonly refineryId: RefinerySessionId;
  readonly foreignRefineryId: RefinerySessionId;
  readonly tagId: TagId;
  readonly asset: Awaited<ReturnType<ServerTestHarness["app"]["assets"]["store"]>>;
  readonly bytes: Uint8Array;
  readonly subjects: Pick<SurfaceSubjectInventory, "characters" | "rosters" | "worldBooks" | "assets" | "tags">;
  readonly embeddingCount: number;
  readonly originalCharacters: readonly Awaited<ReturnType<ServerTestHarness["services"]["character"]["get"]>>[];
}

async function sourceDataset(parent: string, withEmbeddings = false): Promise<SourceDataset> {
  const layout = resolveDataLayout({ ["DATA_DIR"]: join(parent, "source") });
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "Completed fixture work",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const db = await createDb(layout.databaseUrl);
  try {
    await runMigrations(db, SHIPPED_MIGRATIONS);
    await using root = await createServerHarness({
      db,
      startJobs: false,
      pluginSpawn: spawn,
      providerFetch: physical.execute,
      secretBoxKey: SECRET_BOX_TEST_KEY,
      temporaryParentDir: parent,
      casDir: layout.assets,
      variantDir: layout.variants,
      importStagingDir: layout.importStaging,
      rolePolicyConfig: { ["OWNER_HANDLES"]: SOURCE_HANDLE, ["DEFAULT_USER_HANDLE"]: SOURCE_HANDLE },
      env: { ["AUTH_MODE"]: "local", ["AUTH_FALLBACK"]: "deny" },
    });
    const owner = await root.principalFor(root.ownerId);
    await root.services.admin.resetPassword({ principal: owner, userId: owner.userId, password: SOURCE_PASSWORD });
    await root.services.credentials.add({ principal: owner, provider: "custom-openai", key: SOURCE_SECRET });
    await root.services.sessions.create({ userId: owner.userId });
    const card = await root.services.character.create({
      principal: owner,
      input: createCharacterSchema.parse({ handle: "retained-card", name: "Retained", description: "Original fixture text" }),
    });
    const other = await root.actor({ handle: brandedId("Handle").parse("foreign-surface-user") });
    const foreign = await root.services.character.create({
      principal: await root.principalFor(other.id),
      input: createCharacterSchema.parse({ handle: "foreign-card", name: "Foreign", description: "Foreign fixture text" }),
    });
    const refinery = await root.services.refinery.startSession({ principal: owner, characterId: card.id });
    const foreignRefinery = await root.services.refinery.startSession({ principal: await root.principalFor(other.id), characterId: foreign.id });
    const tag = await root.services.tag.createTag({ principal: owner, input: { name: "Retained owner tag" } });
    await root.services.tag.createTag({ principal: await root.principalFor(other.id), input: { name: "Foreign owner tag" } });
    const installed = await root.services.plugin.install({
      caller: owner,
      bundle: makePluginBundle(CORPUS_PLUGIN_MANIFEST, 'orb.host(1).storage.set("marker", "retained");', root.clock.now()),
      grant: ["storage.kv"],
    });
    await root.services.plugin.setEnabled({ caller: owner, pluginId: installed.id, enabled: true });
    const bytes = makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset));
    const asset = await root.app.assets.store({ principal: owner, bytes, mime: "image/png", kind: "gallery" });
    // This source owner has removed the managed examples; a normal build must respect that decision.
    await root.services.settings.updateUserSettingsSection({ principal: owner, input: { section: "onboarding", patch: { examplePluginsSeeded: true } } });
    const cookie = await signInWithPassword(root, SOURCE_HANDLE, SOURCE_PASSWORD);
    const address = await root.listen();
    const admission = await fetch(`http://127.0.0.1:${address.port}/api/trpc/sessions.me`, { headers: { cookie } });
    expect(admission.status).toBe(200);
    expect(await admission.json()).toMatchObject({ result: { data: { userId: owner.userId } } });
    await root.settleBackground();
    if (withEmbeddings) {
      await root.services.settings.updateAppSettings({ principal: owner, partial: { privateEndpointAllowlist: [new URL(CORPUS_PROVIDER_ENDPOINT).hostname] } });
      await seedCorpusConnections(root, owner);
      await root.app.embeddings.embedCorpus({ ownerId: owner.userId, force: true, signal: new AbortController().signal });
    }
    await root.settleBackground();
    const subjects = {
      characters: await db.select({ id: characters.id }).from(characters).where(eq(characters.ownerId, owner.userId)).orderBy(asc(characters.id)),
      rosters: await db.select({ id: rosterPresets.id }).from(rosterPresets).where(eq(rosterPresets.ownerId, owner.userId)).orderBy(asc(rosterPresets.id)),
      worldBooks: await db.select({ id: worldBooks.id }).from(worldBooks).where(eq(worldBooks.ownerId, owner.userId)).orderBy(asc(worldBooks.id)),
      assets: await db.select({ id: assets.id }).from(assets).where(eq(assets.ownerId, owner.userId)).orderBy(asc(assets.id)),
      tags: await db.select({ id: tags.id }).from(tags).where(eq(tags.ownerId, owner.userId)).orderBy(asc(tags.id)),
    };
    return {
      layout,
      ownerId: owner.userId,
      cardId: card.id,
      foreignId: foreign.id,
      pluginId: installed.id,
      refineryId: refinery.id,
      foreignRefineryId: foreignRefinery.id,
      tagId: tag.id,
      asset,
      bytes,
      subjects,
      embeddingCount: (await db.select({ count: count() }).from(characterEmbeddings))[0]?.count ?? 0,
      originalCharacters: await Promise.all(subjects.characters.map(({ id }) => root.services.character.get({ principal: owner, characterId: id }))),
    };
  } finally {
    await preCloseHousekeeping(db);
  }
}

test("owner intake preserves original subjects and plugin consent, scrubs only cloned auth, and never edits source bytes", { tags: "slow" }, async () => {
  const parent = await mkdtemp(join(tmpdir(), "orb-surface-owner-"));
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => rm(parent, { recursive: true, force: true }));
  const source = await sourceDataset(parent, true);
  const database = localPath(source.layout.databaseUrl);
  assert(database !== undefined);
  const before = await readFile(database);
  const privateRoot = join(parent, "private");
  await mkdir(privateRoot, { mode: 0o700 });
  await using prepared = await prepareSurfaceData({ dataMode: "owner", privateRoot, ownerDataDirectory: source.layout.root, environment: LOCAL_ENVIRONMENT });
  expect(prepared.owner).toEqual({ userId: source.ownerId, handle: SOURCE_HANDLE });
  expect(prepared.provenance.source).toMatchObject({ copiedFrom: database, cloned: true });
  expect(prepared.provenance.subjects).toMatchObject(source.subjects);
  expect(prepared.provenance.subjects.characters).toContainEqual({ id: source.cardId });
  expect(prepared.provenance.subjects.characters).not.toContainEqual({ id: source.foreignId });
  expect(prepared.provenance.subjects.refinerySessions).toEqual([{ id: source.refineryId }]);
  expect(prepared.provenance.subjects.refinerySessions).not.toContainEqual({ id: source.foreignRefineryId });
  expect(prepared.provenance.subjects.tags).toContainEqual({ id: source.tagId });
  expect(prepared.provenance.subjects.plugins).toEqual([{ id: source.pluginId }]);
  expect(surfaceSubjectInventorySchema.parse(prepared.provenance.subjects)).toEqual(prepared.provenance.subjects);
  expect(surfaceSubjectInventorySchema.safeParse({ ...prepared.provenance.subjects, characters: [{ id: source.ownerId }] }).success).toBe(false);
  expect(prepared.provenance.plugins).toMatchObject([
    { id: source.pluginId, ownerId: source.ownerId, status: "enabled", grantedCapabilities: ["storage.kv"], pendingReconsent: false, widenedNetHosts: [] },
  ]);
  expect(prepared.provenance.embeddings.preserved).toBe(true);
  expect(prepared.provenance.embeddings.prepared).toEqual(prepared.provenance.embeddings.source);
  expect(prepared.provenance.embeddings.prepared.counts.characters).toBeGreaterThan(0);
  expect(prepared.provenance.embeddings.prepared.generations).toContainEqual(expect.objectContaining({ ownerId: source.ownerId, task: "embed" }));
  expect(prepared.provenance.embeddings.prepared.spaces).toContainEqual(expect.objectContaining({ ownerId: source.ownerId, scope: "cards" }));
  const clone = await createDb(prepared.layout.databaseUrl);
  try {
    expect(await clone.select().from(userCredentials)).toEqual([]);
    expect(await clone.select().from(sessions)).toEqual([]);
    const cloneOwners = await clone.select({ id: users.id, passwordHash: users.passwordHash }).from(users).where(eq(users.id, source.ownerId));
    expect(cloneOwners).toEqual([{ id: source.ownerId, passwordHash: null }]);
    expect(await clone.select({ id: plugins.id, status: plugins.status }).from(plugins)).toEqual([{ id: source.pluginId, status: "enabled" }]);
  } finally {
    await preCloseHousekeeping(clone);
  }
  const clonedFiles = await readdir(prepared.layout.assets, { recursive: true });
  const assetFile = clonedFiles.find((path) => path.endsWith(source.asset.hash));
  assert(assetFile !== undefined);
  const cloneAsset = join(prepared.layout.assets, assetFile);
  expect(await readFile(cloneAsset)).toEqual(Buffer.from(source.bytes));
  await expectPosixPrivateMode(cloneAsset, 0o600);
  await expectPosixPrivateMode(prepared.runRoot, 0o700);
  await expectPosixPrivateMode(join(prepared.runRoot, "provenance.json"), 0o600);
  const clientDistDir = join(prepared.runRoot, "client");
  await mkdir(clientDistDir, { mode: 0o700 });
  await writeFile(join(clientDistDir, "index.html"), "<!doctype html><title>Owner clone mutation control</title>", { mode: 0o600 });
  const clock = createFrozenClock();
  using timers = createControlledTimers(clock);
  await using server = await openPreparedSurfaceRoot(prepared, {
    clientDistDir,
    time: { now: clock.now, monotonicNow: clock.now, timers },
    environment: LOCAL_ENVIRONMENT,
  });
  await exerciseClonedCharacterCrud(server.root, source.originalCharacters);
  await server[Symbol.asyncDispose]();
  await writeFile(cloneAsset, "clone mutation");
  expect(await readFile(join(source.layout.assets, assetFile))).toEqual(Buffer.from(source.bytes));
  expect(await readFile(database)).toEqual(before);
  await prepared[Symbol.asyncDispose]();
  await expect(lstat(prepared.layout.root)).rejects.toThrow();
  expect((await lstat(join(prepared.runRoot, "provenance.json"))).isFile()).toBe(true);
});

async function prepareManagedUpgrade(
  parent: string,
  fault: "none" | "consent" | "subjects",
): Promise<{
  readonly prepared: PreparedSurfaceData;
  readonly installed: Awaited<ReturnType<ServerTestHarness["services"]["plugin"]["install"]>>;
  readonly shipped: PluginManifest;
  readonly database: string;
  readonly before: Uint8Array;
  readonly clientDistDir: string;
}> {
  const source = await sourceDataset(parent);
  const { readShowcaseManifest } = await import("@orb/showcase-plugins");
  const shipped = await readShowcaseManifest("oracle-deck");
  assert(shipped !== null);
  const db = await createDb(source.layout.databaseUrl);
  let installed: Awaited<ReturnType<ServerTestHarness["services"]["plugin"]["install"]>>;
  try {
    await using root = await createServerHarness({ db, ownerId: source.ownerId, startJobs: false, temporaryParentDir: parent, casDir: source.layout.assets });
    const principal = await root.principalFor(source.ownerId);
    installed = await root.services.plugin.install({
      caller: principal,
      bundle: makePluginBundle({ ...shipped, version: "0.0.0" }, "orb.host(1);", root.clock.now()),
      grant: shipped.capabilities,
    });
    await root.services.settings.updateUserSettingsSection({
      principal,
      input: { section: "onboarding", patch: { seededPluginVersions: { [shipped.id]: installed.version } } },
    });
    if (fault === "consent") {
      await db.run(
        sql`CREATE TRIGGER surface_upgrade_drift AFTER UPDATE OF version ON plugins WHEN OLD.version = '0.0.0' AND NEW.version <> OLD.version BEGIN UPDATE plugins SET granted_capabilities = '[]' WHERE id = NEW.id; END`,
      );
    } else if (fault === "subjects") {
      await db.run(
        sql`CREATE TRIGGER surface_upgrade_drift AFTER UPDATE OF version ON plugins WHEN OLD.version = '0.0.0' AND NEW.version <> OLD.version BEGIN DELETE FROM tags; END`,
      );
    }
  } finally {
    await preCloseHousekeeping(db);
  }
  const database = localPath(source.layout.databaseUrl);
  assert(database !== undefined);
  const before = await readFile(database);
  const privateRoot = join(parent, "private");
  await mkdir(privateRoot, { mode: 0o700 });
  const prepared = await prepareSurfaceData({ dataMode: "owner", privateRoot, ownerDataDirectory: source.layout.root, environment: LOCAL_ENVIRONMENT });
  const clientDistDir = join(prepared.runRoot, "client");
  await mkdir(clientDistDir, { mode: 0o700 });
  await writeFile(join(clientDistDir, "index.html"), "<!doctype html><title>Managed upgrade control</title>", { mode: 0o600 });
  return { prepared, installed, shipped, database, before, clientDistDir };
}

test("owner admission records a production managed showcase upgrade without relabeling its new bundle as original", { tags: "slow" }, async () => {
  const parent = await mkdtemp(join(tmpdir(), "orb-surface-showcase-"));
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => rm(parent, { recursive: true, force: true }));
  const { prepared, installed, shipped, database, before, clientDistDir } = await prepareManagedUpgrade(parent, "none");
  ownership.use(prepared);
  const clock = createFrozenClock();
  using timers = createControlledTimers(clock);
  await using server = await openPreparedSurfaceRoot(prepared, {
    clientDistDir,
    time: { now: clock.now, monotonicNow: clock.now, timers },
    environment: LOCAL_ENVIRONMENT,
  });
  const upgraded = server.pluginPosture.find(({ id }) => id === installed.id);
  expect(upgraded).toMatchObject({ id: installed.id, version: shipped.version, grantedCapabilities: installed.grantedCapabilities, status: installed.status });
  const original = prepared.provenance.plugins.find(({ id }) => id === installed.id);
  assert(original !== undefined && upgraded !== undefined);
  expect(original.version).toBe("0.0.0");
  expect(server.subjects.assets).not.toContainEqual({ id: upgraded.bundleAssetId });
  expect(server.subjects.assets).not.toContainEqual({ id: original.bundleAssetId });
  expect(server.subjects.tags).toEqual(prepared.provenance.subjects.tags);
  expect(JSON.parse(await readFile(join(prepared.runRoot, "boot-provenance.json"), "utf8"))).toMatchObject({
    upgrades: [{ before: original, after: upgraded }],
    originals: server.subjects,
  });
  expect(await readFile(database)).toEqual(before);
});

test.for(["consent", "subjects"] as const)("owner admission refuses unrelated %s drift during a managed upgrade", { tags: "slow" }, async (fault) => {
  const parent = await mkdtemp(join(tmpdir(), "orb-surface-showcase-refusal-"));
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => rm(parent, { recursive: true, force: true }));
  const { prepared, database, before, clientDistDir } = await prepareManagedUpgrade(parent, fault);
  ownership.use(prepared);
  const clock = createFrozenClock();
  using timers = createControlledTimers(clock);
  await expect(
    openPreparedSurfaceRoot(prepared, { clientDistDir, time: { now: clock.now, monotonicNow: clock.now, timers }, environment: LOCAL_ENVIRONMENT }),
  ).rejects.toThrow(/^Surface preparation failed;/u);
  expect(JSON.parse(await readFile(join(prepared.runRoot, "initialization-failure.json"), "utf8"))).toMatchObject({
    afterNativeAdmission: true,
    changed: fault === "consent" ? { plugins: true } : { subjects: true },
  });
  expect(await readFile(database)).toEqual(before);
});

test("standalone owner startup owns its native listener while restoring enabled plugins and joins teardown", {
  tags: "slow",
  timeout: budget(STANDALONE_STARTUP_TIMEOUT_MS + 10_000),
}, async () => {
  const parent = await mkdtemp(join(tmpdir(), "orb-surface-standalone-"));
  await using ownership = new AsyncDisposableStack();
  let successful = false;
  // A standalone failure must leave its private child evidence available after the assertion unwinds.
  ownership.defer(() => (successful ? rm(parent, { recursive: true, force: true }) : Promise.resolve()));
  const source = await sourceDataset(parent);
  const privateRoot = join(parent, "private");
  await mkdir(privateRoot, { mode: 0o700 });
  const result = await spawnNicedTranscript(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import { mkdir, writeFile } from "node:fs/promises";
    import { join } from "node:path";
    import { openPreparedSurfaceRoot, prepareSurfaceData } from "@orb/testkit/node/helpers";
    import { createServerHarness } from "@orb/testkit/node/composed";
    import { systemTimers } from "@orb/server/infra/timers";
    const time = { now: () => Date.now(), monotonicNow: () => performance.now(), timers: systemTimers };
    const elapsed = (ms) => new Promise((resolve) => systemTimers.timeout(resolve, ms));
    {
      await using prepared = await prepareSurfaceData({ dataMode: "owner", ownerDataDirectory: process.argv[1], privateRoot: process.argv[2] });
      const clientDistDir = join(prepared.runRoot, "client");
      await mkdir(clientDistDir, { mode: 0o700 });
      await writeFile(join(clientDistDir, "index.html"), "<!doctype html><title>Native startup control</title>", { mode: 0o600 });
      await using server = await openPreparedSurfaceRoot(prepared, { clientDistDir, time });
      if (server.pluginPosture.filter((plugin) => plugin.status === "enabled").length !== 1) {
        throw new Error("The original enabled plugin was not restored");
      }
      if (Math.abs(server.root.clock.now() - time.now()) > 1000) {
        throw new Error("The native surface root did not adopt the entry wall clock");
      }
      const windowMs = 1000;
      const limited = await createServerHarness({
        ownerId: prepared.owner.userId, db: server.root.db, startJobs: false, time, idSource: server.root.idSource,
        temporaryParentDir: prepared.runRoot, casDir: prepared.layout.assets,
        rolePolicyConfig: { DEFAULT_USER_HANDLE: prepared.owner.handle, OWNER_HANDLES: prepared.owner.handle },
        env: { AUTH_MODE: "single-user", RATE_LIMIT_AUTHED: "1", RATE_LIMIT_WINDOW_MS: String(windowMs) },
      });
      let ticks = 0;
      try {
        const address = await limited.listen();
        const viewer = () => fetch("http://127.0.0.1:" + address.port + "/api/trpc/sessions.me");
        // Begin near the actual fixed-window start so two ordinary HTTP requests cannot straddle expiry.
        let windowStart = Math.floor(time.now() / windowMs) * windowMs + windowMs;
        if (windowStart % server.root.env.RATE_LIMIT_WINDOW_MS === 0) windowStart += windowMs;
        await elapsed(windowStart - time.now() + 20);
        for (const expected of [200, 429]) {
          const response = await viewer();
          await response.arrayBuffer();
          if (response.status !== expected) throw new Error("Native rate-limit enforcement did not match the declared window");
        }
        await elapsed(windowMs + 20);
        const reset = await viewer();
        await reset.arrayBuffer();
        if (reset.status !== 200) throw new Error("Native rate-limit window did not expire with real elapsed time");
        limited.timers.interval(() => { ticks++; }, 10);
        await elapsed(40);
        if (ticks === 0) throw new Error("Native scoped interval did not fire");
      } finally {
        await limited[Symbol.asyncDispose]();
      }
      const disposedTicks = ticks;
      await elapsed(40);
      if (ticks !== disposedTicks) throw new Error("Native scoped interval survived root disposal");
    }
    process.stdout.write("standalone surface startup and teardown joined\\n");
  `,
      source.layout.root,
      privateRoot,
    ],
    {
      cwd: process.cwd(),
      env: LOCAL_ENVIRONMENT,
      timeoutMs: STANDALONE_STARTUP_TIMEOUT_MS,
    },
  );
  expect(result.code, `Standalone surface artifacts retained privately: ${parent}\n${result.transcript}`).toBe(0);
  expect(result.transcript).toContain("standalone surface startup and teardown joined");
  const runs = await readdir(privateRoot);
  expect(runs).toHaveLength(1);
  await expect(lstat(join(privateRoot, runs[0] ?? "", "dataset"))).rejects.toThrow();
  successful = true;
});

test("an owner clone generates only through its disposable scripted connection and physically cancels held output", { tags: "slow" }, async () => {
  const parent = await mkdtemp(join(tmpdir(), "orb-surface-generation-"));
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => rm(parent, { recursive: true, force: true }));
  let originalRequests = 0;
  await using originalPeer = await servePhysicalPeer(() => {
    originalRequests += 1;
    return Promise.resolve(Response.json({ data: [] }));
  });
  expect((await fetch(`${originalPeer.origin}/v1/models`)).status).toBe(200);
  expect(originalRequests).toBe(1);
  const source = await sourceDataset(parent, true);
  const sourceDb = await createDb(source.layout.databaseUrl);
  let originalConnection: Awaited<ReturnType<ServerTestHarness["services"]["connection"]["get"]>>;
  let originalBindings: Awaited<ReturnType<ServerTestHarness["services"]["connection"]["listBindings"]>>;
  let originalAllowlist: Awaited<ReturnType<ServerTestHarness["services"]["settings"]["getAppSettings"]>>["privateEndpointAllowlist"];
  try {
    await using root = await createServerHarness({
      db: sourceDb,
      ownerId: source.ownerId,
      idSource: createIdSource(),
      startJobs: false,
      temporaryParentDir: parent,
    });
    const principal = await root.principalFor(source.ownerId);
    const candidate = (await root.services.connection.list({ principal })).find(({ model }) => model === CORPUS_TEXT_MODEL);
    assert(candidate !== undefined);
    originalConnection = await root.services.connection.update({ principal, connectionId: candidate.id, patch: { baseUrl: `${originalPeer.origin}/v1` } });
    originalBindings = await root.services.connection.listBindings({ principal });
    originalAllowlist = (await root.services.settings.getAppSettings({ principal })).privateEndpointAllowlist;
  } finally {
    await preCloseHousekeeping(sourceDb);
  }
  const database = localPath(source.layout.databaseUrl);
  assert(database !== undefined);
  const before = await readFile(database);
  const privateRoot = join(parent, "private");
  await mkdir(privateRoot, { mode: 0o700 });
  await using prepared = await prepareSurfaceData({ dataMode: "owner", privateRoot, ownerDataDirectory: source.layout.root, environment: LOCAL_ENVIRONMENT });
  const clientDistDir = join(prepared.runRoot, "client");
  await mkdir(clientDistDir, { mode: 0o700 });
  await writeFile(join(clientDistDir, "index.html"), "<!doctype html><title>Scripted generation control</title>", { mode: 0o600 });
  const clock = createFrozenClock();
  using timers = createControlledTimers(clock);
  await using server = await openPreparedSurfaceRoot(prepared, {
    clientDistDir,
    time: { now: clock.now, monotonicNow: clock.now, timers },
    environment: LOCAL_ENVIRONMENT,
  });
  const principal = await server.root.principalFor(prepared.owner.userId);
  const { connection, chat } = server.root.services;
  expect(await connection.listBindings({ principal })).toEqual(originalBindings);
  expect(await connection.get({ principal, connectionId: originalConnection.id })).toEqual(originalConnection);
  expect(await connection.catalogModels({ principal, connectionId: originalConnection.id })).toMatchObject({ listed: false });
  expect(originalRequests).toBe(1);
  const priorChat = originalBindings.find(({ task }) => task === "chat")?.binding?.connectionId ?? null;
  const room = await chat.startChat({ principal, characterIds: [source.cardId], opening: "none" });
  try {
    await connection.setBinding({ principal, task: "chat", connectionId: server.generation.connection.id });
    const completed = await chat.send({ principal, chatId: room.chat.id, content: "Complete the scripted surface turn.", timeZone: UTC_TIME_ZONE });
    expect(completed.aborted).toBe(false);
    expect(completed.messages.map(({ content }) => content)).toContain(server.generation.completionText);
    expect((await readRoomCanon(server.root, principal, room.chat.id)).filter(({ role }) => role === "assistant").map(({ content }) => content)).toContain(
      server.generation.completionText,
    );
    const cancelling = await chat.startChat({ principal, characterIds: [source.cardId], opening: "none" });
    const evidence = async (): Promise<ReturnType<typeof parseSurfaceProviderEvidence>> =>
      parseSurfaceProviderEvidence(await readFile(server.generation.requestEvidencePath, "utf8"));
    const cursor = Math.max(0, ...(await evidence()).map(({ requestId }) => requestId));
    const pending = chat.send({ principal, chatId: cancelling.chat.id, content: server.generation.cancelCue, timeZone: UTC_TIME_ZONE });
    try {
      await Promise.race([
        expect.poll(async () => (await evidence()).some(({ requestId, event }) => requestId > cursor && event === "held")).toBe(true),
        pending.then(() => {
          throw new Error("The actual turn completed before its held physical stream");
        }),
      ]);
      const current = (await evidence()).find(({ requestId, event }) => requestId > cursor && event === "held");
      assert(current !== undefined);
      await chat.abort({ principal, chatId: cancelling.chat.id });
      expect(await pending).toMatchObject({ aborted: true, abortReason: "user" });
      await expect
        .poll(async () => (await evidence()).some(({ requestId, event }) => requestId === current.requestId && (event === "aborted" || event === "cancelled")))
        .toBe(true);
    } finally {
      await chat.abort({ principal, chatId: cancelling.chat.id });
      await pending;
    }
    await using guard = await createSurfaceProvider(prepared.runRoot);
    expect(guard.canonicalSyntheticEmbedding).toBe(false);
    await expect(guard.transport.fetch(`${originalPeer.origin}/v1/models`)).rejects.toThrow("off-origin");
    await expect(guard.transport.fetch(`${guard.baseUrl}/embeddings`, { method: "POST", body: "{}" })).rejects.toThrow("unscripted");
    await expect(
      guard.transport.fetch(`${guard.baseUrl}/chat/completions`, { method: "POST", body: JSON.stringify({ model: "unlisted-surface-model", stream: true }) }),
    ).rejects.toThrow("unscripted");
    await expect(
      guard.transport.fetch(`${CORPUS_PROVIDER_ENDPOINT}/embeddings`, {
        method: "POST",
        body: JSON.stringify({ model: CORPUS_EMBED_MODEL, input: "Owner original embedding target" }),
      }),
    ).rejects.toThrow("off-origin");
    const held = await guard.transport.fetch(`${guard.baseUrl}/chat/completions`, {
      method: "POST",
      body: JSON.stringify({ model: server.generation.connection.model, stream: true, messages: [{ role: "user", content: guard.cancelCue }] }),
    });
    assert(held.body !== null);
    const reader = held.body.getReader();
    expect((await reader.read()).done).toBe(false);
    await guard[Symbol.asyncDispose]();
    await expect(reader.read()).rejects.toThrow();
    expect(parseSurfaceProviderEvidence(await readFile(guard.requestEvidencePath, "utf8")).some(({ event }) => event === "disposed")).toBe(true);
    expect(originalRequests).toBe(1);
  } finally {
    await connection.setBinding({ principal, task: "chat", connectionId: priorChat });
  }
  expect(await connection.listBindings({ principal })).toEqual(originalBindings);
  expect(await connection.get({ principal, connectionId: originalConnection.id })).toEqual(originalConnection);
  await server[Symbol.asyncDispose]();
  expect(JSON.parse(await readFile(join(server.generation.requestEvidencePath, "..", "admission.json"), "utf8"))).toMatchObject({
    before: { effective: originalAllowlist },
    restored: originalAllowlist,
  });
  expect(await readFile(database)).toEqual(before);
});

test("a prior physical cancellation cannot satisfy the next held provider request", async () => {
  const runRoot = await mkdtemp(join(tmpdir(), "orb-surface-request-identity-"));
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => rm(runRoot, { recursive: true, force: true }));
  await using provider = await createSurfaceProvider(runRoot);
  const events = async (): Promise<ReturnType<typeof parseSurfaceProviderEvidence>> =>
    parseSurfaceProviderEvidence(await readFile(provider.requestEvidencePath, "utf8"));
  const held = async (signal: AbortSignal): Promise<ReadableStreamDefaultReader<Uint8Array>> => {
    const response = await provider.transport.fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      signal,
      body: JSON.stringify({ model: CORPUS_TEXT_MODEL, stream: true, messages: [{ role: "user", content: provider.cancelCue }] }),
    });
    assert(response.body !== null);
    const reader = response.body.getReader();
    expect((await reader.read()).done).toBe(false);
    return reader;
  };
  const first = new AbortController();
  const firstReader = await held(first.signal);
  const firstId = (await events()).find(({ event }) => event === "held")?.requestId;
  assert(firstId !== undefined);
  first.abort();
  await expect(firstReader.read()).rejects.toThrow();
  await expect.poll(events).toContainEqual({ requestId: firstId, event: "aborted", request: "POST /v1/chat/completions" });
  const cursor = Math.max(0, ...(await events()).map(({ requestId }) => requestId));
  const second = new AbortController();
  const secondReader = await held(second.signal);
  try {
    const current = (await events()).find(({ event, requestId }) => event === "held" && requestId > cursor);
    assert(current !== undefined);
    expect((await events()).some(({ requestId, event }) => requestId === firstId && event === "aborted")).toBe(true);
    expect((await events()).filter(({ requestId, event }) => requestId === current.requestId && event !== "request" && event !== "held")).toEqual([]);
    second.abort();
    await expect(secondReader.read()).rejects.toThrow();
    await expect.poll(events).toContainEqual({ requestId: current.requestId, event: "aborted", request: "POST /v1/chat/completions" });
  } finally {
    second.abort();
    secondReader.releaseLock();
  }
});

test.skipIf(process.platform === "win32")("a symlinked owner database cannot make scrubbing edit its original target", { tags: "slow" }, async () => {
  const parent = await mkdtemp(join(tmpdir(), "orb-surface-symlink-source-"));
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => rm(parent, { recursive: true, force: true }));
  const source = await sourceDataset(parent);
  const database = localPath(source.layout.databaseUrl);
  assert(database !== undefined);
  const before = await readFile(database);
  const privateRoot = join(parent, "private");
  await mkdir(privateRoot, { mode: 0o700 });
  const linkedSource = resolveDataLayout({ ["DATA_DIR"]: join(parent, "linked-source") });
  await mkdir(linkedSource.dbDir, { recursive: true, mode: 0o700 });
  const linkedDatabase = localPath(linkedSource.databaseUrl);
  assert(linkedDatabase !== undefined);
  await symlink(database, linkedDatabase);
  await expect(prepareSurfaceData({ dataMode: "owner", privateRoot, ownerDataDirectory: linkedSource.root, environment: LOCAL_ENVIRONMENT })).rejects.toThrow(
    /^Surface preparation failed;/u,
  );
  expect(await readFile(database)).toEqual(before);
});

test("owner intake refuses lost completed vectors and retains exact private parity evidence without editing the source", { tags: "slow" }, async () => {
  const parent = await mkdtemp(join(tmpdir(), "orb-surface-embedding-refusal-"));
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => rm(parent, { recursive: true, force: true }));
  const source = await sourceDataset(parent, true);
  expect(source.embeddingCount).toBeGreaterThan(0);
  const db = await createDb(source.layout.databaseUrl);
  try {
    // A persisted source trigger fires only when the copied credential is scrubbed: this is a real SQLite mutation fault.
    await db.run(sql`CREATE TRIGGER surface_embedding_loss AFTER DELETE ON user_credentials BEGIN DELETE FROM character_embeddings; END`);
  } finally {
    await preCloseHousekeeping(db);
  }
  const database = localPath(source.layout.databaseUrl);
  assert(database !== undefined);
  const before = await readFile(database);
  const privateRoot = join(parent, "private");
  await mkdir(privateRoot, { mode: 0o700 });
  await expect(prepareSurfaceData({ dataMode: "owner", privateRoot, ownerDataDirectory: source.layout.root, environment: LOCAL_ENVIRONMENT })).rejects.toThrow(
    /^Surface preparation failed;/u,
  );
  const runs = await readdir(privateRoot);
  expect(runs).toHaveLength(1);
  const runRoot = join(privateRoot, runs[0] ?? "");
  await expect(lstat(join(runRoot, "dataset"))).rejects.toThrow();
  expect(JSON.parse(await readFile(join(runRoot, "provenance.json"), "utf8"))).toMatchObject({
    embeddings: { preserved: false, source: { counts: { characters: source.embeddingCount } }, prepared: { counts: { characters: 0 } } },
  });
  expect(await readFile(join(runRoot, "failure.txt"), "utf8")).toContain("changed completed embedding metadata");
  await expectPosixPrivateMode(join(runRoot, "provenance.json"), 0o600);
  expect(await readFile(database)).toEqual(before);
});

test("owner intake pauses copied schedules through production while preserving the reusable source", { tags: "slow" }, async () => {
  const parent = await mkdtemp(join(tmpdir(), "orb-surface-schedules-"));
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => rm(parent, { recursive: true, force: true }));
  const source = await sourceDataset(parent);
  const db = await createDb(source.layout.databaseUrl);
  let scheduleId: WorkloadScheduleId;
  try {
    await using root = await createServerHarness({ db, ownerId: source.ownerId, startJobs: false, temporaryParentDir: parent });
    const caller = await root.principalFor(source.ownerId);
    const schedule = await root.services.workloads.createSchedule({
      caller,
      ownerId: source.ownerId,
      mode: "singular",
      cadence: "daily",
      input: { kind: "reconcile-stats", params: {} },
    });
    scheduleId = schedule.id;
    expect((await root.services.workloads.listSchedules({ caller })).map(({ id, enabled }) => ({ id, enabled }))).toEqual([{ id: schedule.id, enabled: true }]);
  } finally {
    await preCloseHousekeeping(db);
  }
  const database = localPath(source.layout.databaseUrl);
  assert(database !== undefined);
  const before = await readFile(database);
  const privateRoot = join(parent, "private");
  await mkdir(privateRoot, { mode: 0o700 });
  await using prepared = await prepareSurfaceData({ dataMode: "owner", privateRoot, ownerDataDirectory: source.layout.root, environment: LOCAL_ENVIRONMENT });
  expect(prepared.provenance.pausedSchedules).toEqual([{ id: scheduleId, ownerId: source.ownerId, kind: "reconcile-stats" }]);
  const clone = await createDb(prepared.layout.databaseUrl);
  try {
    expect(await clone.select({ id: workloadSchedules.id, enabled: workloadSchedules.enabled }).from(workloadSchedules)).toEqual([
      { id: scheduleId, enabled: false },
    ]);
  } finally {
    await preCloseHousekeeping(clone);
  }
  expect(await readFile(database)).toEqual(before);
});

test("owner admission rejects resumable work and cleans copied data while retaining private failure evidence", { tags: "slow" }, async () => {
  const parent = await mkdtemp(join(tmpdir(), "orb-surface-refusal-"));
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => rm(parent, { recursive: true, force: true }));
  const source = await sourceDataset(parent);
  const db = await createDb(source.layout.databaseUrl);
  try {
    await using root = await createServerHarness({ db, ownerId: source.ownerId, startJobs: false, temporaryParentDir: parent });
    const caller = await root.principalFor(source.ownerId);
    await root.services.workloads.start({
      caller,
      ownerId: source.ownerId,
      mode: "singular",
      input: { kind: "reconcile-stats", params: {} },
    });
  } finally {
    await preCloseHousekeeping(db);
  }
  const database = localPath(source.layout.databaseUrl);
  assert(database !== undefined);
  const before = await readFile(database);
  const privateRoot = join(parent, "private");
  await mkdir(privateRoot, { mode: 0o700 });
  await expect(prepareSurfaceData({ dataMode: "owner", privateRoot, ownerDataDirectory: source.layout.root, environment: LOCAL_ENVIRONMENT })).rejects.toThrow(
    /^Surface preparation failed;/u,
  );
  const runs = await readdir(privateRoot);
  expect(runs).toHaveLength(1);
  const runRoot = join(privateRoot, runs[0] ?? "");
  await expect(lstat(join(runRoot, "dataset"))).rejects.toThrow();
  const failure = await readFile(join(runRoot, "failure.txt"), "utf8");
  expect(failure).toContain("refuses unfinished work and pending turns");
  await expectPosixPrivateMode(join(runRoot, "failure.txt"), 0o600);
  expect(await readFile(database)).toEqual(before);
});

test("both surface modes share local-only private output custody before dataset production", async () => {
  const parent = await mkdtemp(join(tmpdir(), "orb-surface-routing-"));
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => rm(parent, { recursive: true, force: true }));
  const runRoot = await createSurfaceArtifactRun(parent, LOCAL_ENVIRONMENT);
  await expect(assertSurfaceRunOutput(runRoot, join(runRoot, "report.json"), LOCAL_ENVIRONMENT)).resolves.toBeUndefined();
  await expect(assertSurfaceRunOutput(runRoot, join(parent, "escape.json"), LOCAL_ENVIRONMENT)).rejects.toThrow("private parent");
  await expect(createSurfaceArtifactRun(parent, { ...LOCAL_ENVIRONMENT, ["CI"]: "false" })).rejects.toThrow("local-only");
  await expect(createSurfaceArtifactRun(parent, { ...LOCAL_ENVIRONMENT, ["PLAYWRIGHT_JSON_OUTPUT_FILE"]: join(parent, "escape.json") })).rejects.toThrow(
    "output ownership",
  );
  const external = join(parent, "external");
  await mkdir(external, { mode: 0o700 });
  await mkdir(join(parent, ".git"));
  await expect(createSurfaceArtifactRun(parent, LOCAL_ENVIRONMENT)).rejects.toThrow("repository");
  await expect(prepareSurfaceData({ dataMode: "owner", privateRoot: parent, environment: LOCAL_ENVIRONMENT })).rejects.toThrow("matching source");
  await expect(
    prepareSurfaceData({ dataMode: "synthetic", privateRoot: parent, ownerDataDirectory: external, environment: LOCAL_ENVIRONMENT }),
  ).rejects.toThrow("matching source");
});

test.skipIf(process.platform === "win32")("POSIX output refuses symlink escapes and nonprivate modes", async () => {
  const parent = await mkdtemp(join(tmpdir(), "orb-surface-posix-"));
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => rm(parent, { recursive: true, force: true }));
  const runRoot = await createSurfaceArtifactRun(parent, LOCAL_ENVIRONMENT);
  await expect(assertSurfaceRunOutput(runRoot, join(runRoot, "allowed.json"), LOCAL_ENVIRONMENT)).resolves.toBeUndefined();
  const external = join(parent, "external");
  await mkdir(external, { mode: 0o700 });
  await symlink(external, join(runRoot, "symlink"));
  await expect(assertSurfaceRunOutput(runRoot, join(runRoot, "symlink", "escape.json"), LOCAL_ENVIRONMENT)).rejects.toThrow("escapes");
  await chmod(parent, 0o755);
  await expect(createSurfaceArtifactRun(parent, LOCAL_ENVIRONMENT)).rejects.toThrow("0700");
});

test("synthetic preparation generates its canonical graph privately and serves real owner admission without lifecycle augmentation", {
  tags: "slow",
  timeout: 180_000,
}, async () => {
  const privateRoot = await mkdtemp(join(tmpdir(), "orb-surface-synthetic-"));
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => rm(privateRoot, { recursive: true, force: true }));
  await using prepared = await prepareSurfaceData({ dataMode: "synthetic", privateRoot, environment: LOCAL_ENVIRONMENT });
  expect(prepared.dataMode).toBe("synthetic");
  expect(prepared.provenance.source).toBe(null);
  expect(prepared.provenance.subjects.characters.length).toBeGreaterThan(0);
  expect(prepared.provenance.subjects.documents.length).toBeGreaterThan(0);
  const clientDistDir = join(prepared.runRoot, "client");
  const clock = createFrozenClock();
  using timers = createControlledTimers(clock);
  const time = { now: clock.now, monotonicNow: clock.now, timers };
  await mkdir(clientDistDir, { mode: 0o700 });
  await writeFile(join(clientDistDir, "index.html"), "<!doctype html><title>Static server control</title>", { mode: 0o600 });
  await using server = await openPreparedSurfaceRoot(prepared, { clientDistDir, time, environment: LOCAL_ENVIRONMENT });
  expect(server.pluginPosture).toEqual(prepared.provenance.plugins);
  const response = await fetch(`${server.origin}/api/trpc/sessions.me`);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ result: { data: { ...prepared.owner, globalRole: "owner" } } });
  const relayed = await fetch(`${server.origin}/api/trpc/sessions.me`, { headers: { forwarded: "for=192.0.2.1" } });
  expect(relayed.status).toBe(401);
  const originalCaller = await server.root.internalCallerFor(prepared.owner.userId);
  const originals = await Promise.all(prepared.provenance.subjects.characters.map(({ id }) => originalCaller.character.get({ characterId: id })));
  await server[Symbol.asyncDispose]();
  await using local = await openPreparedSurfaceRoot(prepared, { clientDistDir, time, environment: LOCAL_ENVIRONMENT, authMode: "local" });
  await exerciseClonedCharacterCrud(local.root, originals);
  expect(local.authentication.capability).toEqual(AUTH_MODE_CAPABILITIES.local);
  expect(local.authentication.multiHumanCapable).toBe(true);
  expect(local.authentication.subjects).toHaveLength(2);
  const identities: UserId[] = [];
  for (const subject of local.authentication.subjects) {
    assert(subject.password !== null);
    const cookie = await signInWithPassword(local.root, subject.viewer.handle, subject.password);
    const who = await fetch(`${local.origin}/api/trpc/sessions.me`, { headers: { cookie, forwarded: "for=192.0.2.1" } });
    expect(who.status).toBe(200);
    expect(await who.json()).toEqual({ result: { data: subject.viewer } });
    identities.push(subject.viewer.userId);
    const privileged = await fetch(`${local.origin}/api/trpc/admin.listUsers`, { headers: { cookie } });
    expect(privileged.status).toBe(subject.viewer.userId === prepared.owner.userId ? 200 : 403);
  }
  expect(new Set(identities).size).toBe(2);
  const anonymous = await fetch(`${local.origin}/api/trpc/sessions.me`);
  expect(anonymous.status).toBe(401);
  const caller = await local.root.internalCallerFor(prepared.owner.userId);
  const character = prepared.provenance.subjects.characters[0];
  assert(character !== undefined);
  const room = await caller.chat.startChat({ characterIds: [character.id], opening: "none" });
  const content = "Generation-free surface commit control";
  expect(await caller.chat.commitMessage({ chatId: room.chat.id, content, timeZone: UTC_TIME_ZONE })).toMatchObject({
    messages: [{ content, role: "user" }],
    aborted: false,
  });
  expect((await caller.chat.listMessages({ chatId: room.chat.id })).messages).toContainEqual(expect.objectContaining({ content, role: "user" }));
  expect(local.generation.canonicalSyntheticEmbedding).toBe(true);
  expect(await local.root.db.select({ id: embedGenerations.id }).from(embedGenerations).orderBy(asc(embedGenerations.id))).toEqual(
    prepared.provenance.embeddings.prepared.generations.map(({ id }) => ({ id })),
  );
  expect(await local.root.db.select().from(embedGenerationTargets).orderBy(asc(embedGenerationTargets.ownerId), asc(embedGenerationTargets.task))).toEqual(
    prepared.provenance.embeddings.prepared.targets,
  );
  expect(await local.root.db.select().from(embedSpaceState).orderBy(asc(embedSpaceState.ownerId), asc(embedSpaceState.scope))).toEqual(
    prepared.provenance.embeddings.prepared.spaces,
  );
  await using guard = await createSurfaceProvider(prepared.runRoot, "synthetic");
  await expect(
    guard.transport.fetch(`${CORPUS_PROVIDER_ENDPOINT}/embeddings`, {
      method: "POST",
      body: JSON.stringify({ model: "unlisted-surface-model", input: content }),
    }),
  ).rejects.toThrow("unscripted canonical embedding");
  await expect(guard.transport.fetch(`${CORPUS_PROVIDER_ENDPOINT}/chat/completions`, { method: "POST", body: "{}" })).rejects.toThrow(
    "unscripted canonical embedding",
  );
});
