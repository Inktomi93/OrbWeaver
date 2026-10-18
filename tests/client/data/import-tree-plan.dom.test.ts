// @subject packages/client/src/data/import-tree-plan.ts
import "@orb/testkit/node/composed-real.ts";
import { planTreeImport } from "@orb/client/data";
import { DEFAULT_UPLOAD_CAPS } from "@orb/contracts/uploads";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

function pickedFile(path: string): File {
  const file = new File(["native fixture"], path.split("/").at(-1) ?? path);
  Object.defineProperty(file, "webkitRelativePath", { value: path });
  return file;
}

test("a native backup retains every actual portability plane beside characters and chats", async ({ harness }) => {
  const files = harness.app.portability.map((entity) => pickedFile(`backup/${entity.dir}fixture${entity.ext}`));
  const plan = await planTreeImport(files, {
    totalBytes: DEFAULT_UPLOAD_CAPS.importTreeTotal,
    fileBytes: DEFAULT_UPLOAD_CAPS.importTreeFile,
    files: DEFAULT_UPLOAD_CAPS.importTreeFiles,
  });
  expect(plan.skipped).toEqual([]);
  expect(plan.files).toBe(files.length);
  expect(new Set(plan.batches.flat())).toEqual(new Set(files));
});
