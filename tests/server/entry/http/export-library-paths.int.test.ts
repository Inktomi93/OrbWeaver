// @subject packages/server/src/entry/http/export.ts
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { createCharacterSchema } from "@orb/contracts/character";
import { importStartedSchema, TREE_FILE_FIELD } from "@orb/contracts/import";
import { PORTABLE_DIRECTORIES } from "@orb/contracts/portability";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, extractZip, prepareBackupFolder } from "@orb/testkit/node/composed";
import { CSRF_HEADERS } from "./_body-limit-inputs.ts";

const EXPORT_ROUTE = "/api/export/library";
const TREE_ROUTE = "/api/import/tree";
const WRAPPER = "backup";
const WORKLOAD_DEADLINE_MS = 60_000;

test("same-named library rows export to distinct archive paths and the whole backup restores as a folder", async () => {
  await using root = await createServerHarness({
    env: { ["AUTH_MODE"]: "single-user", ["AUTH_FALLBACK"]: "owner" },
    physicalPeer: () => "127.0.0.1",
    startJobs: false,
  });
  const runAdmittedWorkload = root.runAdmittedWorkload;
  if (runAdmittedWorkload === undefined) {
    throw new Error("the harness did not expose manual workload execution");
  }
  const caller = await root.internalCallerFor(root.ownerId);
  // Allocation is first-come in export order: a repeated name, a case variant a case-insensitive disk folds
  // together, and a real name an earlier collision already took as its suffixed variant are all moved on.
  for (const [handle, name] of [
    ["twin-one", "Twin"],
    ["twin-two", "Twin"],
    ["twin-three", "twin"],
    ["twin-suffixed", "Twin-2"],
  ] as const) {
    await caller.character.create({ input: createCharacterSchema.parse({ handle, name, description: "Same-name export witness" }) });
  }
  const download = await root.http.request(EXPORT_ROUTE);
  expect(download.status).toBe(200);
  const archiveBytes = new Uint8Array(await download.arrayBuffer());
  const staged = await extractZip(archiveBytes);
  const paths = staged.entries.map((entry) => entry.path);
  await staged.dispose();
  expect(paths.filter((path) => path.startsWith(PORTABLE_DIRECTORIES.character))).toEqual(
    ["Twin.png", "Twin-2.png", "twin-3.png", "Twin-2-2.png"].map((name) => `${PORTABLE_DIRECTORIES.character}${name}`),
  );
  expect(new Set(paths.map((path) => path.toLowerCase())).size).toBe(paths.length);

  const owner = await mkdtemp(join(tmpdir(), "orb-export-paths-"));
  try {
    const archive = join(owner, "backup.zip");
    await writeFile(archive, archiveBytes, { mode: 0o600 });
    await using folder = await prepareBackupFolder(archive, join(owner, "restore"));
    expect(folder.entries).toBe(paths.length);
    const form = new FormData();
    for (const entry of (await readdir(folder.directory, { recursive: true, withFileTypes: true })).filter((item) => item.isFile())) {
      const path = join(entry.parentPath, entry.name);
      const relPath = `${WRAPPER}/${relative(folder.directory, path)}`;
      form.append(TREE_FILE_FIELD, new File([new Uint8Array(await readFile(path))], relPath), relPath);
    }
    const response = await root.http.request(TREE_ROUTE, { method: "POST", headers: CSRF_HEADERS, body: form });
    expect(response.status).toBe(202);
    const { workloadId } = importStartedSchema.parse(await response.json());
    await runAdmittedWorkload(workloadId, AbortSignal.timeout(WORKLOAD_DEADLINE_MS));
    const workload = await root.services.workloads.get({ id: workloadId, caller: await root.principalFor(root.ownerId) });
    expect(workload).toMatchObject({ kind: "import-bundle", status: "succeeded", result: { imported: paths.length, skipped: 0, failed: 0 } });
  } finally {
    await rm(owner, { recursive: true, force: true });
  }
});
