// @subject tests/support/node/corpus.ts
// Intrinsic wall time: private intake runs every corpus producer against a copied, migrated database, the same capture a publish
// performs (about 80 s on a loaded box), so this one case cannot be split below it. Output admission lives in corpus-private-admission.
import { spawn } from "node:child_process";
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { createCharacterSchema } from "@orb/contracts/character";
import { THEME_CHAT_STYLES } from "@orb/contracts/theme";
import { createDb, localPath, preCloseHousekeeping, runMigrations, users } from "@orb/db";

import { brandedId, createIdSource, ID_PREFIX } from "@orb/kit/ids";
import { resolveDataLayout } from "@orb/server/foundation/data-layout";
import { createCas } from "@orb/server/infra/storage/cas";
import { budget } from "@orb/tooling/floor/host/load-budget";
import { spawnNicedTranscript } from "@orb/tooling/floor/process/proc";
import { inheritedProcessEnv } from "@orb/tooling/floor/process/process-env";
import { LONG_TEST_TIMEOUT_BASE_MS } from "@orb/tooling/floor/testing/test-tags";
import { z } from "zod";
import { createSeededIds } from "../iso/ids.ts";
import { cloneCorpusFixture, createCorpusCapsule, loadCorpusFixture, prepareCorpusFixture, publishCorpusFixture } from "./corpus.ts";
import { CORPUS_PLUGIN_MANIFEST } from "./corpus-plugin.ts";
import { createCorpusRecipe } from "./corpus-recipe.ts";
import { SHIPPED_MIGRATIONS } from "./db.ts";
import { makeAssetBytes } from "./factories/asset.ts";
import { capturePluginRows, makePluginBundle } from "./factories/plugin.ts";
import { seedUser } from "./factories/rows.ts";
import { expect, test } from "./fixtures.ts";
import { createServerHarness } from "./server.ts";

// Private admission refuses a CI environment; these tests run in CI, so they hand it an environment without those flags.
const LOCAL_ENVIRONMENT = inheritedProcessEnv({ ["CI"]: undefined, ["GITHUB_ACTIONS"]: undefined });

test("private intake retains the existing singleton owner and nonempty content instead of capturing a fresh replacement graph", {
  tags: "slow",
  timeout: 180_000,
}, async () => {
  const parent = await mkdtemp(join(tmpdir(), "orb-private-corpus-control-"));
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => rm(parent, { recursive: true, force: true }));
  const layout = resolveDataLayout({ ["DATA_DIR"]: join(parent, "source") });
  const ids = createSeededIds(100_000);
  const db = await createDb(layout.databaseUrl);
  const source = createIdSource(ids.next);
  let original: Awaited<ReturnType<typeof seedUser>>;
  let retainedPlugin: Awaited<ReturnType<typeof capturePluginRows>>;
  let companion: Awaited<ReturnType<typeof createServerHarness>>["ownerId"];
  let cardId: Awaited<ReturnType<Awaited<ReturnType<typeof createServerHarness>>["services"]["character"]["create"]>>["id"];
  let assetHash: string;
  let assetBytes: Uint8Array;
  try {
    const olderMigrations = join(parent, "older-migrations");
    await cp(SHIPPED_MIGRATIONS, olderMigrations, { recursive: true });
    const journalPath = join(olderMigrations, "meta/_journal.json");
    const journal = z
      .object({ entries: z.array(z.json()) })
      .loose()
      .parse(JSON.parse(await readFile(journalPath, "utf8")));
    await writeFile(journalPath, JSON.stringify({ ...journal, entries: journal.entries.slice(0, -1) }));
    await runMigrations(db, olderMigrations);
    original = await seedUser(
      db,
      {
        handle: brandedId("Handle").parse("retained-owner"),
        externalId: brandedId("ExternalId").parse("synthetic-retained-subject"),
        role: "owner",
      },
      source,
    );
    await using root = await createServerHarness({
      db,
      startJobs: false,
      pluginSpawn: spawn,
      ownerId: original.id,
      ids,
      authConfig: { mode: "local", fallback: "deny", defaultHandle: original.handle },
      casDir: layout.assets,
      variantDir: layout.variants,
      importStagingDir: layout.importStaging,
      temporaryParentDir: parent,
    });
    companion = (await seedUser(db, { handle: brandedId("Handle").parse("companion"), role: "user" }, source)).id;
    const principal = await root.principalFor(original.id);
    const installed = await root.services.plugin.install({
      caller: principal,
      bundle: makePluginBundle(
        { ...CORPUS_PLUGIN_MANIFEST, id: "retained-plugin" },
        'orb.host(1).storage.set("retained", "original synthetic state");',
        root.clock.now(),
      ),
      grant: ["storage.kv"],
    });
    await root.services.plugin.setEnabled({ caller: principal, pluginId: installed.id, enabled: true });
    retainedPlugin = await capturePluginRows(db, original.id, installed.id);

    const card = await root.services.character.create({
      principal,
      input: createCharacterSchema.parse({ handle: "retained-private-card", name: "Retained fixture", description: "Original synthetic content" }),
    });
    cardId = card.id;
    assetBytes = makeAssetBytes(source.typeId(ID_PREFIX.asset));
    const asset = await root.app.assets.store({ principal, bytes: assetBytes, mime: "image/png", kind: "gallery" });
    assetHash = asset.hash;
  } finally {
    await preCloseHousekeeping(db);
  }
  const database = localPath(layout.databaseUrl);
  if (database === undefined) {
    throw new Error("private fixture source must be local");
  }
  const originalBytes = await readFile(database);
  const intakeParent = join(parent, "intake");
  await mkdir(intakeParent, { mode: 0o700 });
  const { options } = await createCorpusRecipe(parent);
  const intake = {
    ...options,
    directory: join(intakeParent, "working"),
    privateSourceDirectory: layout.root,
    environment: LOCAL_ENVIRONMENT,
    temporaryDirectory: parent,
  };
  const capsule = ownership.use(await createCorpusCapsule(intake));
  expect(capsule.wire.reads["sessions.me"][0]?.output).toEqual({ userId: original.id, handle: original.handle, globalRole: "owner" });
  expect(capsule.wire.reads["character.list"][0]?.output.items.map(({ id }) => id)).toContain(cardId);
  expect(capsule.wire.reads["chat.getChat"]).toHaveLength(2);
  expect(Buffer.from(await createCas(capsule.layout.assets).read(original.id, assetHash)).equals(Buffer.from(assetBytes))).toBe(true);
  const capturedDb = await createDb(capsule.layout.databaseUrl);
  try {
    const copiedPlugin = await capturePluginRows(capturedDb, original.id, retainedPlugin.plugin.id);
    expect(copiedPlugin.plugin).toEqual({ ...retainedPlugin.plugin, status: "disabled", lastError: null, updatedAt: copiedPlugin.plugin.updatedAt });
    expect(copiedPlugin.assets).toEqual(retainedPlugin.assets);
    expect(copiedPlugin.kv).toEqual(retainedPlugin.kv);
    const accounts = await capturedDb.select({ id: users.id, handle: users.handle, role: users.role, externalId: users.externalId }).from(users);
    expect(accounts.find(({ id }) => id === original.id)).toEqual({
      id: original.id,
      handle: original.handle,
      role: original.role,
      externalId: original.externalId,
    });
    expect(accounts.find(({ id }) => id === companion)).toMatchObject({ id: companion, handle: "companion", role: "user", externalId: null });
    expect(capsule.wire.memberIdentities?.sharedMember.viewer.userId).not.toBe(companion);
  } finally {
    await preCloseHousekeeping(capturedDb);
  }
  await expect(publishCorpusFixture(capsule, join(parent, "portable-refused"))).rejects.toThrow("Private corpus cannot enter portable publication");
  const fixture = ownership.use(await prepareCorpusFixture(capsule, join(intakeParent, "prepared"), LOCAL_ENVIRONMENT));
  expect(loadCorpusFixture(fixture.layout.root, LOCAL_ENVIRONMENT).privateParent).toBe(intakeParent);
  const clone = ownership.use(
    await cloneCorpusFixture(loadCorpusFixture(fixture.layout.root, LOCAL_ENVIRONMENT), join(intakeParent, "consumer"), LOCAL_ENVIRONMENT),
  );
  expect(clone.privateParent).toBe(intakeParent);
  expect(clone.wire).toEqual(capsule.wire);
  await expect(
    Reflect.apply(publishCorpusFixture, undefined, [loadCorpusFixture(clone.layout.root, LOCAL_ENVIRONMENT), join(parent, "portable-reloaded-refused")]),
  ).rejects.toThrow("Private corpus cannot enter portable publication");
  await expect(cloneCorpusFixture(clone, join(tmpdir(), "private-corpus-escaped"), LOCAL_ENVIRONMENT)).rejects.toThrow("private parent");
  const command = [
    "--config.verify-deps-before-run=false",
    "exec",
    "node",
    "scripts/corpus-fixture.ts",
    "matrix",
    fixture.layout.root,
    "--list",
    `--project=corpus-local-desktop-${THEME_CHAT_STYLES[0]}`,
  ];
  const env = inheritedProcessEnv({
    ["npm_config_verify_deps_before_run"]: "false",
    ["PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN"]: "false",
    ["CORPUS_PRIVATE_RUN_ROOT"]: undefined,
    ["CI"]: undefined,
    ["GITHUB_ACTIONS"]: undefined,
  });
  const unsafeNetwork = await spawnNicedTranscript("pnpm", command, { cwd: process.cwd(), env, timeoutMs: budget(LONG_TEST_TIMEOUT_BASE_MS) });
  expect(unsafeNetwork.code, unsafeNetwork.transcript).not.toBe(0);
  expect(unsafeNetwork.transcript).toContain("isolated loopback-only network namespace");
  await expect(cloneCorpusFixture(clone, join(intakeParent, "ci-refused"), { ...LOCAL_ENVIRONMENT, ["CI"]: "true" })).rejects.toThrow("local-only");
  await writeFile(join(clone.layout.root, "corpus.json"), '{"synthetic-private-field":"not-public-diagnostics"}');
  expect(() => loadCorpusFixture(clone.layout.root, LOCAL_ENVIRONMENT)).toThrow(/^Private corpus wire is malformed$/u);
  expect((await readFile(database)).equals(originalBytes)).toBe(true);
  const queuedSource = await createDb(layout.databaseUrl);
  let unfinished: Awaited<ReturnType<Awaited<ReturnType<typeof createServerHarness>>["services"]["workloads"]["start"]>>;
  try {
    await runMigrations(queuedSource, SHIPPED_MIGRATIONS);
    await using root = await createServerHarness({
      db: queuedSource,
      startJobs: false,
      ownerId: original.id,
      ids,
      authConfig: { mode: "local", fallback: "deny", defaultHandle: original.handle },
      casDir: layout.assets,
      variantDir: layout.variants,
      importStagingDir: layout.importStaging,
      temporaryParentDir: parent,
    });
    unfinished = await root.services.workloads.start({
      caller: await root.principalFor(original.id),
      ownerId: original.id,
      mode: "bulk",
      input: { kind: "compute-cooccurrence", params: {} },
    });
  } finally {
    await preCloseHousekeeping(queuedSource);
  }
  const beforeQueuedRefusal = await readFile(database);
  const queuedDirectory = join(intakeParent, "refused-queued-source");
  await expect(createCorpusCapsule({ ...intake, directory: queuedDirectory })).rejects.toThrow('"activeWorkloads":1');
  await expect(access(queuedDirectory)).rejects.toThrow();
  expect((await readFile(database)).equals(beforeQueuedRefusal)).toBe(true);
  const futureSource = await createDb(layout.databaseUrl);
  try {
    await using root = await createServerHarness({
      db: futureSource,
      startJobs: false,
      ownerId: original.id,
      ids,
      authConfig: { mode: "local", fallback: "deny", defaultHandle: original.handle },
      casDir: layout.assets,
      variantDir: layout.variants,
      importStagingDir: layout.importStaging,
      temporaryParentDir: parent,
    });
    const principal = await root.principalFor(original.id);
    await root.services.workloads.cancel({ caller: principal, id: unfinished.id });
    await root.services.workloads.createSchedule({
      caller: principal,
      ownerId: original.id,
      mode: "singular",
      cadence: "daily",
      input: { kind: "reconcile-stats", params: {} },
    });
  } finally {
    await preCloseHousekeeping(futureSource);
  }
  const beforeRefusal = await readFile(database);
  const failedDirectory = join(intakeParent, "refused-scheduled-source");
  await expect(createCorpusCapsule({ ...intake, directory: failedDirectory })).rejects.toThrow("copied enabled schedules");
  await expect(access(failedDirectory)).rejects.toThrow();
  expect((await readFile(database)).equals(beforeRefusal)).toBe(true);
});
