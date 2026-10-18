// @subject packages/client/src/data/import-tree-plan.ts
import "@orb/testkit/node/composed-real.ts";
import type { TreeImportCaps } from "@orb/client/data";
import { planTreeImport, relativePathOf } from "@orb/client/data";
import { admitTreeBatch } from "@orb/contracts/import";
import type { PortableKind } from "@orb/contracts/portability";
import { DEFAULT_UPLOAD_CAPS } from "@orb/contracts/uploads";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import type { ServerTestHarness } from "@orb/testkit/node/server.ts";

const WRAPPER = "backup";
const UNIT = 400;
// Each upload holds two units, so the native tree below splits into one upload per plane group.
const SPLIT_CAPS: TreeImportCaps = { totalBytes: UNIT * 2, fileBytes: UNIT * 2, files: DEFAULT_UPLOAD_CAPS.importTreeFiles };

function pickedFile(path: string, bytes = "native fixture"): File {
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

/** One upload per lone-sniff shape: assets only, characters with chats, a native-only plane, themes only. */
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
  expect(batches.map((paths) => [...new Set(paths.map((path) => path.split("/")[0]))])).toEqual([["assets"], ["characters", "chats"], ["regex"], ["themes"]]);
  // Alone, three of these uploads would be refused or routed to the SillyTavern importer.
  expect(batches.map((paths) => admitTreeBatch(paths, null).kind)).toEqual(["reject", "st", "orb", "reject"]);
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
  expect(plan.batches).toEqual([files]);
});
