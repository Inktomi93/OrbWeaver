// @subject tests/support/node/corpus.ts
import "./composed-real.ts";
import { spawn } from "node:child_process";
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCharacterSchema } from "@orb/contracts/character";
import { THEME_CHAT_STYLES } from "@orb/contracts/theme";
import { createDb, localPath, preCloseHousekeeping, runMigrations, users } from "@orb/db";

import { brandedId, createIdSource, ID_PREFIX } from "@orb/kit/ids";
import { authConfigFromEnv } from "@orb/server/entry/auth";
import { resolveDataLayout } from "@orb/server/foundation/data-layout";
import { createCas } from "@orb/server/infra/storage/cas";
import { budget } from "@orb/tooling/floor/host/load-budget";
import { runNicedSync } from "@orb/tooling/floor/process/proc";
import { inheritedProcessEnv } from "@orb/tooling/floor/process/process-env";
import { afterEach, vi } from "vitest";
import { z } from "zod";
import { createSeededIds } from "../iso/ids.ts";
import { cloneCorpusFixture, createCorpusCapsule, loadCorpusFixture, prepareCorpusFixture, publishCorpusFixture } from "./corpus.ts";
import { CORPUS_PLUGIN_MANIFEST } from "./corpus-plugin.ts";
import { createCorpusRecipe } from "./corpus-recipe.ts";
import { SHIPPED_MIGRATIONS } from "./db.ts";
import { makeAssetBytes } from "./factories/asset.ts";
import { capturePluginRows, makePluginBundle } from "./factories/plugin.ts";
import { seedUser } from "./factories/user.ts";
import { expect, test } from "./fixtures.ts";
import { createServerHarness } from "./server.ts";

afterEach(() => vi.unstubAllEnvs());

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
      authConfig: { ...authConfigFromEnv(), mode: "local", fallback: "deny", defaultHandle: original.handle },
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
  vi.stubEnv("CI", undefined);
  vi.stubEnv("GITHUB_ACTIONS", undefined);
  vi.stubEnv("TMPDIR", parent);
  vi.stubEnv("TMP", parent);
  vi.stubEnv("TEMP", parent);
  const { options } = await createCorpusRecipe(parent);
  const intake = { ...options, directory: join(intakeParent, "working"), privateSourceDirectory: layout.root };
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
  const fixture = ownership.use(await prepareCorpusFixture(capsule, join(intakeParent, "prepared")));
  expect(loadCorpusFixture(fixture.layout.root).privateParent).toBe(intakeParent);
  const clone = ownership.use(await cloneCorpusFixture(loadCorpusFixture(fixture.layout.root), join(intakeParent, "consumer")));
  expect(clone.privateParent).toBe(intakeParent);
  expect(clone.wire).toEqual(capsule.wire);
  await expect(
    Reflect.apply(publishCorpusFixture, undefined, [loadCorpusFixture(clone.layout.root), join(parent, "portable-reloaded-refused")]),
  ).rejects.toThrow("Private corpus cannot enter portable publication");
  await expect(cloneCorpusFixture(clone, join(tmpdir(), "private-corpus-escaped"))).rejects.toThrow("private parent");
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
  const unsafeNetwork = runNicedSync("pnpm", command, { env });
  expect(unsafeNetwork.status, unsafeNetwork.stdout + unsafeNetwork.stderr).not.toBe(0);
  expect(unsafeNetwork.stdout + unsafeNetwork.stderr).toContain("isolated loopback-only network namespace");
  vi.stubEnv("CI", "true");
  await expect(cloneCorpusFixture(clone, join(intakeParent, "ci-refused"))).rejects.toThrow("local-only");
  vi.stubEnv("CI", undefined);
  await writeFile(join(clone.layout.root, "corpus.json"), '{"synthetic-private-field":"not-public-diagnostics"}');
  expect(() => loadCorpusFixture(clone.layout.root)).toThrow(/^Private corpus wire is malformed$/u);
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
      authConfig: { ...authConfigFromEnv(), mode: "local", fallback: "deny", defaultHandle: original.handle },
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
      authConfig: { ...authConfigFromEnv(), mode: "local", fallback: "deny", defaultHandle: original.handle },
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

// Each of the 32 refusal routes starts the actual CLI; the whole family exceeded the default 30s deadline.
test("private corpus rejects native output and reporter overrides before reading captured content", { tags: "slow", timeout: budget(96_000) }, async () => {
  const parent = await mkdtemp(join(tmpdir(), "orb-private-output-admission-"));
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => rm(parent, { recursive: true, force: true }));
  const directory = join(parent, "classified-input");
  await mkdir(directory, { mode: 0o700 });
  // Only the existing routing metadata is present: refusal must precede any capture, DB or reporter load.
  await writeFile(join(directory, ".private-corpus.json"), JSON.stringify({ parent }));
  const escaped = join(parent, "outside-owned");
  const command = ["--config.verify-deps-before-run=false", "exec", "node", "scripts/corpus-fixture.ts", "e2e", directory, "--list"];
  const clean = inheritedProcessEnv({ ["CI"]: undefined, ["GITHUB_ACTIONS"]: undefined, ["CORPUS_PRIVATE_RUN_ROOT"]: undefined });
  const variables = [
    ...["JSON", "JUNIT", "BLOB"].flatMap((reporter) => ["FILE", "DIR", "NAME"].map((output) => `PLAYWRIGHT_${reporter}_OUTPUT_${output}`)),
    "PLAYWRIGHT_HTML_OUTPUT_DIR",
    "PLAYWRIGHT_HTML_REPORT",
    "PLAYWRIGHT_HTML_OPEN",
    "PLAYWRIGHT_HTML_ATTACHMENTS_BASE_URL",
    "PLAYWRIGHT_HTML_HOST",
    "PLAYWRIGHT_HTML_PORT",
    "PLAYWRIGHT_LAST_RUN_OUTPUT_FILE",
    "PW_TEST_REPORTER",
    "PW_TEST_HTML_REPORT_OPEN",
    "PWTEST_CACHE_DIR",
  ];
  for (const name of variables) {
    const result = runNicedSync("pnpm", command, { env: { ...clean, [name]: escaped } });
    expect(result.status, name).not.toBe(0);
    expect(result.stdout + result.stderr, name).toContain("Private corpus artifacts cannot override native output ownership");
  }
  for (const flag of ["--output", "--reporter", "--config", "--last-failed-file"]) {
    for (const args of [[`${flag}=${escaped}`], [flag, escaped]]) {
      const result = runNicedSync("pnpm", [...command, ...args], { env: clean });
      expect(result.status, JSON.stringify(args)).not.toBe(0);
      expect(result.stdout + result.stderr, JSON.stringify(args)).toContain("Private corpus artifacts cannot override native output ownership");
    }
  }
  for (const args of [
    ["--update-snapshots=all"],
    ["--update-snapshots", "all"],
    ["-u"],
    ["--update-source-method=overwrite"],
    ["--update-source-method", "overwrite"],
  ]) {
    const result = runNicedSync("pnpm", [...command, ...args], { env: clean });
    expect(result.status, JSON.stringify(args)).not.toBe(0);
    expect(result.stdout + result.stderr, JSON.stringify(args)).toContain("Private corpus artifacts cannot override native output ownership");
  }
  await expect(access(escaped)).rejects.toThrow();
});
