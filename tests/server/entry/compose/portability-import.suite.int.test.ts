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
// @subject packages/server/src/infra/storage/staged-manifest.ts
// @subject packages/server/src/infra/storage/report.ts
// @subject packages/server/src/entry/compose/portability.ts
// @subject packages/server/src/entry/compose/portability-runner.ts
// @subject packages/server/src/entry/import/run-profile-dir-import.ts
import { mkdir, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createCharacterSchema } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY, CSRF_HEADER } from "@orb/contracts/identity";
import { importStartedSchema, ST_SETTINGS_FILE, TREE_DRY_RUN_FIELD, TREE_DRY_RUN_VALUE, TREE_FILE_FIELD } from "@orb/contracts/import";
import type { PortableFile } from "@orb/contracts/portability";
import { PORTABILITY_ROUTES } from "@orb/contracts/portability";
import type { WorkloadResultByKind } from "@orb/contracts/workloads";
import type { Handle, WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, WORKLOAD_DEADLINE_MS } from "@orb/testkit/node/composed";
import { failOnExportNote, principal } from "@orb/testkit/node/helpers";
import { strToU8, zipSync } from "fflate";
import { vi } from "vitest";
import { signedInMember } from "../_auth-roots.ts";

// fflate's DOS date reads local time and throws near the epoch, so a mid-year stamp stays valid in every zone.
const ZIP_MTIME = new Date("2025-07-01T12:00:00Z");
const STAGED_FILE_CHANGED = "a staged file changed after the server wrote it";

async function owners(harness: ServerTestHarness): Promise<readonly [Principal, Principal]> {
  const target = await harness.actor();
  return [await principal(harness, harness.ownerId), await principal(harness, target.id)];
}

/** A box whose target account uploads through the real routes, so a staged run reads what the routes recorded. */
interface UploadBox extends AsyncDisposable {
  readonly root: ServerTestHarness;
  readonly source: Principal;
  readonly target: Principal;
  /** The request headers of the target account's own session. */
  readonly headers: Readonly<Record<string, string>>;
}

async function uploadBox(): Promise<UploadBox> {
  await using construction = new AsyncDisposableStack();
  const root = construction.use(
    await createServerHarness({
      physicalPeer: () => "127.0.0.1",
      startJobs: false,
      env: { [AUTH_MODE_KEY]: "local", [AUTH_FALLBACK_KEY]: "owner" },
    }),
  );
  const member = await signedInMember(root, castId<Handle>("portability-target"));
  const headers = { [CSRF_HEADER]: "1", cookie: member.cookie };
  // Default content seeds in the background after each account's first request, so a case's spies start after it.
  await root.http.request(PORTABILITY_ROUTES.exportLibrary);
  await root.http.request(PORTABILITY_ROUTES.exportLibrary, { headers });
  await root.settleBackground();
  const source = await principal(root, root.ownerId);
  const target = await principal(root, member.id);
  const owned = construction.move();
  return { root, source, target, headers, [Symbol.asyncDispose]: () => owned.disposeAsync() };
}

async function uploadedWorkload(response: Response): Promise<WorkloadId> {
  expect(response.status).toBe(202);
  return importStartedSchema.parse(await response.json()).workloadId;
}

/** Post one SillyTavern folder as the target account, under the wrapper a browser's folder picker sends. */
async function uploadProfile(box: UploadBox, files: Readonly<Record<string, Uint8Array | string>>, dryRun = false): Promise<WorkloadId> {
  const form = new FormData();
  for (const [path, bytes] of Object.entries(files)) {
    const relPath = `default-user/${path}`;
    form.append(TREE_FILE_FIELD, new File([typeof bytes === "string" ? strToU8(bytes) : new Uint8Array(bytes)], relPath), relPath);
  }
  if (dryRun) {
    form.append(TREE_DRY_RUN_FIELD, TREE_DRY_RUN_VALUE);
  }
  return await uploadedWorkload(await box.root.http.request(PORTABILITY_ROUTES.importTree, { method: "POST", headers: box.headers, body: form }));
}

async function ranRow(box: UploadBox, id: WorkloadId): ReturnType<ServerTestHarness["services"]["workloads"]["get"]> {
  await box.root.runAdmittedWorkload?.(id, AbortSignal.timeout(WORKLOAD_DEADLINE_MS));
  return await box.root.services.workloads.get({ caller: box.target, id });
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
  const files = await exportedFiles(descriptor.exportAll(source.userId, failOnExportNote));
  expect(files).toHaveLength(1);
  expect(await exportedFiles(descriptor.exportAll(target.userId, failOnExportNote))).toEqual([]);
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
  const targetFiles = await exportedFiles(descriptor.exportAll(target.userId, failOnExportNote));
  expect(targetFiles).toHaveLength(1);
  expect(await app.exportService.exportCharacter({ principal: target, characterId: character.id, note: failOnExportNote })).toBeNull();
});

test("the actual staged bundle isolates malformed cards, counts unsupported files and preserves per-owner idempotency", async () => {
  await using box = await uploadBox();
  const { root, source, target } = box;
  const character = await root.app.services.character.create({
    principal: source,
    input: createCharacterSchema.parse({ handle: "bundle-control", name: "Bundle control", description: "Bundle marker" }),
  });
  const file = await root.app.exportService.exportCharacter({ principal: source, characterId: character.id, note: failOnExportNote });
  if (file === null) {
    throw new Error("the real owner export was refused");
  }
  const bundle = zipSync(
    { [`characters/${file.filename}`]: file.bytes, "characters/malformed.png": strToU8("not a card"), "unsupported.json": strToU8("{}") },
    { mtime: ZIP_MTIME },
  );
  const run = async (): Promise<Awaited<ReturnType<typeof ranRow>>> =>
    await ranRow(
      box,
      await uploadedWorkload(await root.http.request(PORTABILITY_ROUTES.importBundle, { method: "POST", headers: box.headers, body: Uint8Array.from(bundle) })),
    );
  const outcome = { status: "succeeded", result: { imported: 1, failed: 1, skipped: 1, notes: [], memoryScope: null } };
  const sourceCards = await root.app.services.character.count({ principal: source });
  const targetCards = await root.app.services.character.count({ principal: target });
  expect(await run()).toMatchObject(outcome);
  expect(await run()).toMatchObject(outcome);
  expect(await root.app.services.character.count({ principal: source })).toBe(sourceCards);
  expect(await root.app.services.character.count({ principal: target })).toBe(targetCards + 1);
});

test("the real profile driver performs no dry-run writes and a real run writes one clock-consistent honest report", async () => {
  await using box = await uploadBox();
  const { root, source, target } = box;
  const { app, clock } = root;
  const character = await app.services.character.create({
    principal: source,
    input: createCharacterSchema.parse({ handle: "profile-control", name: "Profile control", description: "Profile marker" }),
  });
  const file = await app.exportService.exportCharacter({ principal: source, characterId: character.id, note: failOnExportNote });
  if (file === null) {
    throw new Error("the real owner export was refused");
  }
  const tree = { [ST_SETTINGS_FILE]: "{}", [`characters/${file.filename}`]: file.bytes };
  const run = async (dryRun: boolean): Promise<WorkloadResultByKind["import-st"]> => {
    const row = await ranRow(box, await uploadProfile(box, tree, dryRun));
    if (row.kind !== "import-st" || row.poison || row.result === null) {
      throw new Error("the import has no canonical result");
    }
    return row.result;
  };
  const create = vi.spyOn(app.services.character, "create");
  const store = vi.spyOn(app.services.assets, "store");
  const seeded = await app.services.character.count({ principal: target });
  const dry = await run(true);
  expect(dry).toMatchObject({ dryRun: true, changed: 1 });
  expect(dry).not.toHaveProperty("reportPath");
  expect(create).not.toHaveBeenCalled();
  expect(store).not.toHaveBeenCalled();
  expect(await app.services.character.count({ principal: target })).toBe(seeded);
  const imported = await run(false);
  expect(imported).toMatchObject({ dryRun: false, changed: 1, failed: 0 });
  expect(await app.services.character.count({ principal: target })).toBe(seeded + 1);
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

test("the composed profile reader admits an ordinary settings leaf but refuses another owner's settings symlink before parsing or writes", async () => {
  await using box = await uploadBox();
  const { root, source, target } = box;
  const stagedRootOf = root.stagedImportsOf(target.userId);
  const external = join(root.stagedImportsOf(source.userId), "external-settings.json");
  const privateSettings = '{"power_user":{"personas":{"private.png":"External private persona"}}}';
  const tree = { [ST_SETTINGS_FILE]: '{"power_user":{"personas":{"allowed.png":"Allowed persona"}}}' };
  await mkdir(root.stagedImportsOf(source.userId), { recursive: true });
  await writeFile(external, privateSettings);
  expect(await ranRow(box, await uploadProfile(box, tree))).toMatchObject({ status: "succeeded", result: { changed: 1, failed: 0 } });
  expect((await root.app.services.persona.list({ principal: target })).map((persona) => persona.name)).toEqual(["Allowed persona"]);

  const id = await uploadProfile(box, tree);
  const [token = ""] = await readdir(stagedRootOf);
  const settings = join(stagedRootOf, token, "profile", ST_SETTINGS_FILE);
  await rm(settings);
  await symlink(external, settings);

  const refused = await ranRow(box, id);
  expect(refused.status).toBe("failed");
  expect(refused.error).toContain(STAGED_FILE_CHANGED);
  expect((await root.app.services.persona.list({ principal: target })).map((persona) => persona.name)).toEqual(["Allowed persona"]);
  expect(await readFile(external, "utf8")).toBe(privateSettings);
});

async function importProfilePersonas(box: UploadBox): Promise<void> {
  const settings = { ["power_user"]: { personas: { "alpha.png": "Alpha", "beta.png": "Beta" }, ["default_persona"]: "beta.png" } };
  expect(await ranRow(box, await uploadProfile(box, { [ST_SETTINGS_FILE]: JSON.stringify(settings) }))).toMatchObject({ status: "succeeded" });
}

test("a profile import crowns its ST default persona when the owner has no default", async () => {
  await using box = await uploadBox();
  const { app } = box.root;
  await importProfilePersonas(box);
  const personas = await app.services.persona.list({ principal: box.target });
  const beta = personas.find((persona) => persona.name === "Beta");
  const seeds = (await app.services.settings.getUserSettings({ principal: box.target })).config.seeds;
  expect(beta).toBeDefined();
  expect(seeds.defaultPersonaId).toBe(beta?.id);
});

test("a profile import never overrides a default persona the owner already chose", async () => {
  await using box = await uploadBox();
  const { app } = box.root;
  const chosen = await app.services.persona.create({ principal: box.target, input: { name: "Chosen", description: "The owner's own crown." } });
  await app.services.settings.updateUserSettingsSection({ principal: box.target, input: { section: "seeds", patch: { defaultPersonaId: chosen.id } } });
  await importProfilePersonas(box);
  expect((await app.services.settings.getUserSettings({ principal: box.target })).config.seeds.defaultPersonaId).toBe(chosen.id);
});
