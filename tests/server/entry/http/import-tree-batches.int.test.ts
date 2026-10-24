// @subject packages/server/src/entry/http/import-tree.ts
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import { storedAssetSchema } from "@orb/contracts/assets";
import { createCharacterSchema } from "@orb/contracts/character";
import { importStartedSchema, ST_SECRETS_FILE, ST_SETTINGS_FILE, TREE_FILE_FIELD, TREE_LAYOUT_FIELD } from "@orb/contracts/import";
import type { PortableKind } from "@orb/contracts/portability";
import { PORTABLE_DIRECTORIES } from "@orb/contracts/portability";
import { createRegexScriptSchema } from "@orb/contracts/regex";
import { createThemeInputSchema } from "@orb/contracts/theme";
import { ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, makeAssetBytes, prepareBackupFolder } from "@orb/testkit/node/composed";
import { CSRF_HEADERS } from "./_body-limit-inputs.ts";

const TREE_ROUTE = "/api/import/tree";
const EXPORT_ROUTE = "/api/export/library";
const ASSET_UPLOAD_ROUTE = "/api/assets/upload";
const ASSET_FILE_FIELD = "file";
const WRAPPER = "backup";
const WORKLOAD_DEADLINE_MS = 60_000;

/** One exported backup entry: its archive path and exact bytes. */
interface BackupEntry {
  readonly path: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
}

function harness(): Promise<ServerTestHarness> {
  return createServerHarness({
    authConfig: { mode: "single-user", fallback: "owner" },
    physicalPeer: () => "127.0.0.1",
    startJobs: false,
  });
}

/** Author one real row per lone-sniff shape through the tRPC doors, then download the native backup. */
async function exportedBackup(root: ServerTestHarness): Promise<readonly BackupEntry[]> {
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.createTheme(createThemeInputSchema.parse({ name: "Batch night", override: {} }));
  await caller.regex.createScript({
    input: createRegexScriptSchema.parse({ name: "Batch tidy", findRegex: "a", replaceString: "b", placement: ["AI_OUTPUT"] }),
  });
  const art = new FormData();
  art.set(ASSET_FILE_FIELD, new File([new Uint8Array(makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)))], "aria.png", { type: "image/png" }));
  art.set("kind", "avatar");
  const upload = await root.http.request(ASSET_UPLOAD_ROUTE, { method: "POST", headers: CSRF_HEADERS, body: art });
  expect(upload.status).toBe(200);
  const avatar = storedAssetSchema.parse(await upload.json());
  const card = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "batch-aria", name: "Batch Aria", description: "Split restore witness", avatarAssetId: avatar.assetId }),
  });
  await caller.chat.startChat({ characterIds: [card.id] });
  const download = await root.http.request(EXPORT_ROUTE);
  expect(download.status).toBe(200);
  const owner = await mkdtemp(join(tmpdir(), "orb-tree-batches-"));
  try {
    const archive = join(owner, "backup.zip");
    await writeFile(archive, new Uint8Array(await download.arrayBuffer()), { mode: 0o600 });
    await using folder = await prepareBackupFolder(archive, join(owner, "restore"));
    const files = (await readdir(folder.directory, { recursive: true, withFileTypes: true })).filter((entry) => entry.isFile());
    const entries = await Promise.all(
      files.map(async (entry) => {
        const path = join(entry.parentPath, entry.name);
        return { path: relative(folder.directory, path), bytes: new Uint8Array(await readFile(path)) };
      }),
    );
    // Every lone-sniff shape needs real entries, or a refusal would only prove an empty upload.
    const planes = (["assets", "character", "chat", "theme", "regex"] as const).map((kind) => PORTABLE_DIRECTORIES[kind]);
    expect(planes.filter((dir) => !entries.some((entry) => entry.path.startsWith(dir)))).toEqual([]);
    return entries;
  } finally {
    await rm(owner, { recursive: true, force: true });
  }
}

function inDir(entries: readonly BackupEntry[], kinds: readonly PortableKind[]): BackupEntry[] {
  return entries.filter((entry) => kinds.some((kind) => entry.path.startsWith(PORTABLE_DIRECTORIES[kind])));
}

async function postBatch(root: ServerTestHarness, entries: readonly BackupEntry[], declarations: readonly (string | File)[]): Promise<Response> {
  const form = new FormData();
  for (const entry of entries) {
    const relPath = `${WRAPPER}/${entry.path}`;
    form.append(TREE_FILE_FIELD, new File([entry.bytes], relPath), relPath);
  }
  for (const declaration of declarations) {
    form.append(TREE_LAYOUT_FIELD, declaration);
  }
  return await root.http.request(TREE_ROUTE, { method: "POST", headers: CSRF_HEADERS, body: form });
}

/** The answer to one upload and every effect a refusal must not leave behind. */
async function uploadEffects(
  root: ServerTestHarness,
  response: Response,
): Promise<{ readonly status: number; readonly staged: readonly string[]; readonly workloads: number }> {
  await response.arrayBuffer();
  const principal = await root.principalFor(root.ownerId);
  const bundles = await root.services.workloads.list({ caller: principal, kind: "import-bundle" });
  const profiles = await root.services.workloads.list({ caller: principal, kind: "import-st" });
  return { status: response.status, staged: await readdir(root.importStagingDir, { recursive: true }), workloads: bundles.length + profiles.length };
}

const REFUSED = { status: 400, staged: [], workloads: 0 };

test("every upload of a split native backup restores through the native importer", async () => {
  await using root = await harness();
  const runAdmittedWorkload = root.runAdmittedWorkload;
  if (runAdmittedWorkload === undefined) {
    throw new Error("the harness did not expose manual workload execution");
  }
  const principal = await root.principalFor(root.ownerId);
  const backup = await exportedBackup(root);
  const nativeOnly = backup.filter((entry) => inDir([entry], ["assets", "character", "chat", "theme"]).length === 0);
  // One upload per lone-sniff shape: assets alone, characters with chats, themes alone, and the native-only rest.
  const uploads = [inDir(backup, ["assets"]), inDir(backup, ["character", "chat"]), inDir(backup, ["theme"]), nativeOnly];
  for (const upload of uploads) {
    expect(upload.length).toBeGreaterThan(0);
  }
  expect(uploads.flat()).toHaveLength(backup.length);
  for (const upload of uploads) {
    const response = await postBatch(root, upload, ["orb"]);
    expect(response.status).toBe(202);
    const { workloadId } = importStartedSchema.parse(await response.json());
    await runAdmittedWorkload(workloadId, AbortSignal.timeout(WORKLOAD_DEADLINE_MS));
    const workload = await root.services.workloads.get({ id: workloadId, caller: principal });
    expect(workload).toMatchObject({ kind: "import-bundle", ownerId: root.ownerId, status: "succeeded", params: { source: "dir" } });
    if (workload.kind !== "import-bundle" || workload.poison || workload.result === null) {
      throw new Error("a declared native upload has no canonical bundle result");
    }
    // Native dedupe counts as imported, so a restore of the exporter's own library imports every entry.
    expect(workload.result).toMatchObject({ imported: upload.length, skipped: 0, failed: 0 });
  }
  expect(await root.services.workloads.list({ caller: principal, kind: "import-st" })).toEqual([]);
});

test("an undeclared upload keeps the lone sniff: native shapes without a native-only plane refuse or route to SillyTavern", async () => {
  await using root = await harness();
  const principal = await root.principalFor(root.ownerId);
  const backup = await exportedBackup(root);
  expect(await uploadEffects(root, await postBatch(root, inDir(backup, ["assets"]), []))).toEqual(REFUSED);
  expect(await uploadEffects(root, await postBatch(root, inDir(backup, ["theme"]), []))).toEqual(REFUSED);
  const response = await postBatch(root, inDir(backup, ["character", "chat"]), []);
  expect(response.status).toBe(202);
  const { workloadId } = importStartedSchema.parse(await response.json());
  expect(await root.services.workloads.get({ id: workloadId, caller: principal })).toMatchObject({ kind: "import-st", ownerId: root.ownerId });
});

test("a declared native upload that is not wholly native, or a malformed declaration, refuses with nothing staged", async () => {
  await using root = await harness();
  const backup = await exportedBackup(root);
  const cards = inDir(backup, ["character"]);
  expect(cards.length).toBeGreaterThan(0);
  const stray = (path: string): BackupEntry => ({ path, bytes: new TextEncoder().encode("{}") });
  const refusals = [
    { entries: [...cards, stray(ST_SETTINGS_FILE)], declarations: ["orb"] },
    { entries: [...cards, stray("User Avatars/me.png")], declarations: ["orb"] },
    { entries: [...cards, stray("notes/plan.txt")], declarations: ["orb"] },
    { entries: [...cards, stray("README.txt")], declarations: ["orb"] },
    { entries: cards, declarations: ["st"] },
    { entries: cards, declarations: ["orb", "orb"] },
    { entries: cards, declarations: [new File(["orb"], "layout")] },
  ];
  for (const { entries, declarations } of refusals) {
    expect(await uploadEffects(root, await postBatch(root, entries, declarations))).toEqual(REFUSED);
  }
});

test("credential files in a declared native upload are dropped before admission and never staged", async () => {
  await using root = await harness();
  const backup = await exportedBackup(root);
  const cards = inDir(backup, ["character"]);
  expect(cards.length).toBeGreaterThan(0);
  const secret = (path: string): BackupEntry => ({ path, bytes: new TextEncoder().encode('{"api_key_openai":"planted"}') });
  // A top-level file would refuse the declaration and a card-plane file would be staged, if either survived.
  const response = await postBatch(root, [...cards, secret(ST_SECRETS_FILE), secret(`${PORTABLE_DIRECTORIES.character}${ST_SECRETS_FILE}`)], ["orb"]);
  expect(response.status).toBe(202);
  const { workloadId } = importStartedSchema.parse(await response.json());
  const workload = await root.services.workloads.get({ id: workloadId, caller: await root.principalFor(root.ownerId) });
  expect(workload).toMatchObject({ kind: "import-bundle", params: { source: "dir" } });
  const staged = await readdir(root.importStagingDir, { recursive: true, withFileTypes: true });
  const files = staged.filter((entry) => entry.isFile()).map((entry) => entry.name);
  const byName = (a: string, b: string): number => a.localeCompare(b);
  expect(files.toSorted(byName)).toEqual(cards.map((card) => basename(card.path)).toSorted(byName));
});
