// @subject packages/server/src/domain/export/verbs/portable-exports.ts
// @subject packages/server/src/domain/import/verbs/portable-imports.ts
// @subject packages/server/src/domain/import/loader/import-bundle.ts
// @subject packages/server/src/domain/import/loader/profile-directory.ts
// @subject packages/server/src/domain/import/loader/workload-drivers.ts
// @subject packages/server/src/domain/import/substrate/bundle-report.ts
// @subject packages/server/src/domain/import/substrate/report.ts
// @subject packages/server/src/domain/import/verbs/enqueue-import-index.ts
// @subject packages/server/src/domain/import/verbs/settle-import-memory.ts
// @subject packages/server/src/domain/import/verbs/import-library-emitter.ts
// @subject packages/server/src/infra/storage/profile-fs.ts
// @subject packages/server/src/infra/storage/report.ts
// @subject packages/server/src/entry/compose/portability.ts
// @subject packages/server/src/entry/compose/portability-runner.ts
// @subject packages/server/src/entry/import/run-profile-dir-import.ts
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createCharacterSchema } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import { ST_SETTINGS_FILE } from "@orb/contracts/import";
import type { PortableFile } from "@orb/contracts/portability";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { principal } from "@orb/testkit/node/helpers";
import { vi } from "vitest";

async function owners(harness: ServerTestHarness): Promise<readonly [Principal, Principal]> {
  const target = await harness.actor();
  return [await principal(harness, harness.ownerId), await principal(harness, target.id)];
}

async function exportedFiles(stream: AsyncIterable<PortableFile>): Promise<PortableFile[]> {
  const files: PortableFile[] = [];
  for await (const file of stream) {
    files.push(file);
  }
  return files;
}

test("portable owner binding refuses malformed cards before effects and content-dedups only within each owner", async ({ harness, app }) => {
  const [source, target] = await owners(harness);
  const character = await app.services.character.create({
    principal: source,
    input: createCharacterSchema.parse({ handle: "portable-authority", name: "Portable authority", description: "Owned export marker" }),
  });
  const descriptor = app.portability.find((entity) => entity.kind === "character");
  if (descriptor === undefined) {
    throw new Error("the production graph omitted the character descriptor");
  }
  const files = await exportedFiles(descriptor.exportAll(source.userId));
  expect(files).toHaveLength(1);
  expect(await exportedFiles(descriptor.exportAll(target.userId))).toEqual([]);
  const file = files[0];
  if (file === undefined) {
    throw new Error("the real exporter produced no card");
  }
  const create = vi.spyOn(app.services.character, "create");
  const store = vi.spyOn(app.services.assets, "store");
  const tag = vi.spyOn(app.services.tag, "attachCardTagByName");
  expect(await descriptor.importFile(target.userId, { filename: "malformed.png", bytes: new TextEncoder().encode("not a card") })).toMatchObject({ ok: false });
  expect(create).not.toHaveBeenCalled();
  expect(store).not.toHaveBeenCalled();
  expect(tag).not.toHaveBeenCalled();
  expect(await descriptor.importFile(target.userId, file)).toMatchObject({ ok: true, created: true });
  expect(await descriptor.importFile(target.userId, file)).toEqual({ ok: true, created: false });
  expect(create.mock.calls[0]?.[0].principal.userId).toBe(target.userId);
  expect(await app.services.character.count({ principal: source })).toBe(1);
  expect(await app.services.character.count({ principal: target })).toBe(1);
  const targetFiles = await exportedFiles(descriptor.exportAll(target.userId));
  expect(targetFiles).toHaveLength(1);
  expect(await app.exportService.exportCharacter({ principal: target, characterId: character.id })).toBeNull();
});

test("the actual staged bundle isolates malformed cards, counts unsupported files and preserves per-owner idempotency", async ({
  harness,
  app,
  importStagingDir,
  clock,
}) => {
  const [source, target] = await owners(harness);
  const character = await app.services.character.create({
    principal: source,
    input: createCharacterSchema.parse({ handle: "bundle-control", name: "Bundle control", description: "Bundle marker" }),
  });
  const file = await app.exportService.exportCharacter({ principal: source, characterId: character.id });
  if (file === null) {
    throw new Error("the real owner export was refused");
  }
  const token = "bundle-production-control";
  const stage = async (): Promise<void> => {
    const root = join(importStagingDir, target.userId, token);
    await mkdir(join(root, "characters"), { recursive: true });
    await writeFile(join(root, "characters", file.filename), file.bytes);
    await writeFile(join(root, "characters", "malformed.png"), "not a card");
    await writeFile(join(root, "unsupported.json"), "{}");
  };
  const run = async (): Promise<Awaited<ReturnType<(typeof app.workloadContributions)["import-bundle"]["run"]>>> => {
    await stage();
    return app.workloadContributions["import-bundle"].run(
      { ownerId: target.userId, userId: target.userId, funderUserId: null, now: () => clock.now() },
      { token, source: "dir" },
      () => undefined,
      new AbortController().signal,
    );
  };
  expect(await run()).toMatchObject({ imported: 1, failed: 1, skipped: 1, notes: [], memoryScope: null });
  expect(await run()).toMatchObject({ imported: 1, failed: 1, skipped: 1, notes: [], memoryScope: null });
  expect(await app.services.character.count({ principal: source })).toBe(1);
  expect(await app.services.character.count({ principal: target })).toBe(1);
});

test("the real profile driver performs no dry-run writes and a real run writes one clock-consistent honest report", async ({
  harness,
  app,
  importStagingDir,
  clock,
}) => {
  const [source, target] = await owners(harness);
  const character = await app.services.character.create({
    principal: source,
    input: createCharacterSchema.parse({ handle: "profile-control", name: "Profile control", description: "Profile marker" }),
  });
  const file = await app.exportService.exportCharacter({ principal: source, characterId: character.id });
  if (file === null) {
    throw new Error("the real owner export was refused");
  }
  const token = "profile-production-control";
  const stage = async (): Promise<void> => {
    const root = join(importStagingDir, target.userId, token, "profile");
    await mkdir(join(root, "characters"), { recursive: true });
    await writeFile(join(root, ST_SETTINGS_FILE), "{}");
    await writeFile(join(root, "characters", file.filename), file.bytes);
  };
  const progress = vi.fn();
  const run = async (dryRun: boolean): Promise<Awaited<ReturnType<(typeof app.workloadContributions)["import-st"]["run"]>>> => {
    await stage();
    return app.workloadContributions["import-st"].run(
      { ownerId: target.userId, userId: target.userId, funderUserId: null, now: () => clock.now() },
      { stagedDir: token, dryRun },
      progress,
      new AbortController().signal,
    );
  };
  const create = vi.spyOn(app.services.character, "create");
  const store = vi.spyOn(app.services.assets, "store");
  const dry = await run(true);
  expect(dry).toMatchObject({ dryRun: true, changed: 1 });
  expect(dry).not.toHaveProperty("reportPath");
  expect(create).not.toHaveBeenCalled();
  expect(store).not.toHaveBeenCalled();
  expect(await app.services.character.count({ principal: target })).toBe(0);
  const imported = await run(false);
  expect(imported).toMatchObject({ dryRun: false, changed: 1, failed: 0 });
  expect(await app.services.character.count({ principal: target })).toBe(1);
  expect(await run(false)).toMatchObject({ dryRun: false, changed: 0, failed: 0 });
  if (imported.reportPath === undefined) {
    throw new Error("the real run did not expose its written report");
  }
  const markdown = await readFile(imported.reportPath, "utf8");
  expect(markdown).toContain(`Generated: ${new Date(clock.now()).toISOString()}`);
  expect(markdown).toContain("World books imported: 0");
  expect(markdown).toContain("Data Bank files");
  expect(markdown).not.toContain("DRY RUN");
});

test("the composed profile reader admits an ordinary settings leaf but refuses another owner's settings symlink before parsing or writes", async ({
  harness,
  app,
  importStagingDir,
  clock,
}) => {
  const [source, target] = await owners(harness);
  const token = "profile-settings-nofollow";
  const root = join(importStagingDir, target.userId, token, "profile");
  const settings = join(root, ST_SETTINGS_FILE);
  const external = join(importStagingDir, source.userId, "external-settings.json");
  const privateSettings = '{"power_user":{"personas":{"private.png":"External private persona"}}}';
  await mkdir(root, { recursive: true });
  await mkdir(join(importStagingDir, source.userId), { recursive: true });
  await writeFile(external, privateSettings);
  await writeFile(settings, '{"power_user":{"personas":{"allowed.png":"Allowed persona"}}}');
  const run = (): ReturnType<(typeof app.workloadContributions)["import-st"]["run"]> =>
    app.workloadContributions["import-st"].run(
      { ownerId: target.userId, userId: target.userId, funderUserId: null, now: () => clock.now() },
      { stagedDir: token },
      () => undefined,
      new AbortController().signal,
    );
  expect(await run()).toMatchObject({ changed: 1, failed: 0 });
  expect((await app.services.persona.list({ principal: target })).map((persona) => persona.name)).toEqual(["Allowed persona"]);
  await mkdir(root, { recursive: true });
  await symlink(external, settings);
  const [outcome] = await Promise.allSettled([run()]);
  expect((await app.services.persona.list({ principal: target })).map((persona) => persona.name)).toEqual(["Allowed persona"]);
  expect(outcome).toMatchObject({ status: "rejected", reason: { code: "import_infra_failure", operation: "readFile", cause: { code: "ELOOP" } } });
  expect(await readFile(external, "utf8")).toBe(privateSettings);
});
