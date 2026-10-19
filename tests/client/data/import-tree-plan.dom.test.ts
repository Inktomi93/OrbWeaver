// @subject packages/client/src/data/import-tree-plan.ts
import "@orb/testkit/node/composed-real.ts";
import type { TreeImportCaps } from "@orb/client/data";
import { importTree, planTreeImport, relativePathOf } from "@orb/client/data";
import { createCharacterSchema } from "@orb/contracts/character";
import { admitTreeBatch } from "@orb/contracts/import";
import type { PortableKind } from "@orb/contracts/portability";
import { PORTABLE_DIRECTORIES, PORTABLE_IMPORT_ORDER } from "@orb/contracts/portability";
import { DEFAULT_UPLOAD_CAPS } from "@orb/contracts/uploads";
import { authConfigFromEnv } from "@orb/server/entry/auth";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import type { ServerTestHarness } from "@orb/testkit/node/server.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { vi } from "vitest";

const WRAPPER = "backup";
const WORKLOAD_DEADLINE_MS = 60_000;
const UNIT = 400;
// Each upload holds two units, so the native tree below splits into one upload per plane group.
const SPLIT_CAPS: TreeImportCaps = { totalBytes: UNIT * 2, fileBytes: UNIT * 2, files: DEFAULT_UPLOAD_CAPS.importTreeFiles };

function pickedFile(path: string, bytes: BlobPart = "native fixture"): File {
  const file = new File([bytes], path.split("/").at(-1) ?? path);
  Object.defineProperty(file, "webkitRelativePath", { value: path });
  return file;
}

function nativeFile(harness: ServerTestHarness, kind: PortableKind, stem: string, size: number): File {
  const entity = harness.app.portability.find((row) => row.kind === kind);
  if (entity === undefined) {
    throw new Error(`the production registry omitted ${kind}`);
  }
  return pickedFile(`${WRAPPER}/${entity.dir}${stem}${entity.ext}`, "x".repeat(size));
}

/** One upload per lone-sniff shape in dependency order: assets, a native-only plane, characters, themes, chats. */
function splitNativeTree(harness: ServerTestHarness): File[] {
  return [
    nativeFile(harness, "assets", "blob", UNIT * 2),
    nativeFile(harness, "character", "aria", UNIT),
    nativeFile(harness, "chat", "aria", UNIT),
    nativeFile(harness, "regex", "tidy", UNIT * 2),
    nativeFile(harness, "theme", "night", UNIT * 2),
  ];
}

function uploadedPaths(batches: readonly (readonly File[])[]): string[][] {
  return batches.map((batch) => batch.map((file) => relativePathOf(file).slice(WRAPPER.length + 1)));
}

test("a native backup retains every actual portability plane beside characters and chats", async ({ harness }) => {
  const files = harness.app.portability.map((entity) => pickedFile(`${WRAPPER}/${entity.dir}fixture${entity.ext}`));
  const plan = await planTreeImport(files, {
    totalBytes: DEFAULT_UPLOAD_CAPS.importTreeTotal,
    fileBytes: DEFAULT_UPLOAD_CAPS.importTreeFile,
    files: DEFAULT_UPLOAD_CAPS.importTreeFiles,
  });
  expect(plan.skipped).toEqual([]);
  expect(plan.files).toBe(files.length);
  expect(new Set(plan.batches.flat())).toEqual(new Set(files));
  expect(plan.layout).toBeNull();
});

test("a split native backup declares its layout so every upload is admitted as native", async ({ harness }) => {
  const files = splitNativeTree(harness);
  const plan = await planTreeImport(files, SPLIT_CAPS);
  const batches = uploadedPaths(plan.batches);
  expect(batches.map((paths) => [...new Set(paths.map((path) => path.split("/")[0]))])).toEqual([["assets"], ["regex"], ["characters"], ["themes"], ["chats"]]);
  // Alone, four of these uploads would be refused or routed to the SillyTavern importer.
  expect(batches.map((paths) => admitTreeBatch(paths, null).kind)).toEqual(["reject", "orb", "st", "reject", "st"]);
  expect(plan.layout).toBe("orb");
  for (const paths of batches) {
    expect(admitTreeBatch(paths, plan.layout)).toEqual({ kind: "orb", stagePrefix: "" });
  }
  expect(plan.skipped).toEqual([]);
  expect(new Set(plan.batches.flat())).toEqual(new Set(files));
});

test("a split native backup skips entries outside native directories instead of refusing their uploads", async ({ harness }) => {
  const outside = [pickedFile(`${WRAPPER}/README.txt`), pickedFile(`${WRAPPER}/notes/plan.txt`)];
  const files = [...splitNativeTree(harness), ...outside];
  const plan = await planTreeImport(files, SPLIT_CAPS);
  expect(plan.layout).toBe("orb");
  expect(plan.skipped.map((entry) => entry.path).toSorted()).toEqual(["README.txt", "notes/plan.txt"]);
  expect(plan.batches.flat().some((file) => outside.includes(file))).toBe(false);
  for (const paths of uploadedPaths(plan.batches)) {
    expect(admitTreeBatch(paths, plan.layout).kind).toBe("orb");
  }
});

test("a native backup that fits one upload keeps its undeclared whole-folder behavior", async ({ harness }) => {
  const outside = [pickedFile(`${WRAPPER}/README.txt`), pickedFile(`${WRAPPER}/notes/plan.txt`)];
  const files = [...splitNativeTree(harness), ...outside];
  const plan = await planTreeImport(files, { ...SPLIT_CAPS, totalBytes: UNIT * 20 });
  expect(plan.layout).toBeNull();
  expect(plan.skipped).toEqual([]);
  expect(plan.batches).toHaveLength(1);
  expect(new Set(plan.batches.flat())).toEqual(new Set(files));
});

test("a split native backup sends its planes in import dependency order, whatever order they were picked in", async ({ harness }) => {
  const dependentsFirst = PORTABLE_IMPORT_ORDER.toReversed().map((kind) => nativeFile(harness, kind, `${kind}-fixture`, UNIT));
  const plan = await planTreeImport(dependentsFirst, { ...SPLIT_CAPS, files: 1 });
  const dirOrder = PORTABLE_IMPORT_ORDER.map((kind) => PORTABLE_DIRECTORIES[kind].slice(0, -1));
  expect(uploadedPaths(plan.batches).map((paths) => paths.map((path) => path.split("/")[0]))).toEqual(dirOrder.map((dir) => [dir]));
});

test("a restore whose chat is picked before its character still links the chat once every upload has run", async () => {
  const single = { authConfig: { ...authConfigFromEnv(), mode: "single-user", fallback: "owner" }, physicalPeer: () => "127.0.0.1", startJobs: false } as const;
  await using exporter = await createServerHarness(single);
  const author = await exporter.internalCallerFor(exporter.ownerId);
  const card = await author.character.create({
    input: createCharacterSchema.parse({ handle: "split-aria", name: "Split Aria", description: "Split restore witness" }),
  });
  await author.chat.startChat({ characterIds: [card.id] });
  const picked: File[] = [];
  for (const entity of exporter.app.portability) {
    for await (const file of entity.exportAll(exporter.ownerId)) {
      picked.push(pickedFile(`${WRAPPER}/${entity.dir}${file.filename}`, new Uint8Array(file.bytes)));
    }
  }
  const isChat = (file: File): boolean => relativePathOf(file).startsWith(`${WRAPPER}/${PORTABLE_DIRECTORIES.chat}`);
  const dependentsFirst = [...picked.filter(isChat), ...picked.filter((file) => !isChat(file))];
  expect(dependentsFirst.filter(isChat)).toHaveLength(1);
  // One file per upload, so the chat and its character can only meet across two separate import workloads.
  const plan = await planTreeImport(dependentsFirst, {
    totalBytes: DEFAULT_UPLOAD_CAPS.importTreeTotal,
    fileBytes: DEFAULT_UPLOAD_CAPS.importTreeFile,
    files: 1,
  });
  expect(plan.batches.length).toBeGreaterThan(1);

  await using restorer = await createServerHarness(single);
  const runAdmittedWorkload = restorer.runAdmittedWorkload;
  if (runAdmittedWorkload === undefined) {
    throw new Error("the harness did not expose manual workload execution");
  }
  const principal = await restorer.principalFor(restorer.ownerId);
  vi.stubGlobal("fetch", (input: string, init?: RequestInit) => restorer.http.request(input, init));
  let failed = 0;
  try {
    for (const batch of plan.batches) {
      const { workloadId } = await importTree(batch, {}, plan.layout);
      await runAdmittedWorkload(workloadId, AbortSignal.timeout(WORKLOAD_DEADLINE_MS));
      const workload = await restorer.services.workloads.get({ id: workloadId, caller: principal });
      if (workload.kind !== "import-bundle" || workload.poison || workload.result === null) {
        throw new Error("a declared native upload has no canonical bundle result");
      }
      failed += workload.result.failed;
    }
  } finally {
    vi.unstubAllGlobals();
  }
  expect(failed).toBe(0);
  const restored = await restorer.internalCallerFor(restorer.ownerId);
  expect((await restored.chat.listChats({})).items).toHaveLength(1);
});
