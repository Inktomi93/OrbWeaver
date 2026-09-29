import { unzipSync } from "fflate";
import { PluginBundlePreviewError, packPluginFolder } from "../../../../../packages/client/src/features/plugin/lib/plugin-bundle.ts";
import { expect, test } from "../../../../support/fixtures.ts";

function folderFile(path: string, contents = path): File {
  const file = new File([contents], path.split("/").at(-1) ?? "entry");
  Object.defineProperty(file, "webkitRelativePath", { value: path });
  return file;
}

test("folder packing emits only admitted root entries from one selected directory", async () => {
  const bundle = await packPluginFolder([
    folderFile("plugin/manifest.json", "{}"),
    folderFile("plugin/main.js"),
    folderFile("plugin/ui.js"),
    folderFile("plugin/ui/assets/icon.png"),
    folderFile("plugin/README.md"),
    folderFile("plugin/nested/main.js"),
    folderFile("plugin/ui/assets/nested/icon.png"),
    folderFile("plugin/../manifest.json"),
    folderFile("plugin\\main.js"),
  ]);

  expect(Object.keys(unzipSync(bundle)).sort()).toEqual(["main.js", "manifest.json", "ui.js", "ui/assets/icon.png"]);
});

test("folder packing refuses admitted entries mixed from different roots", async () => {
  await expect(packPluginFolder([folderFile("first/manifest.json", "{}"), folderFile("second/main.js")])).rejects.toBeInstanceOf(PluginBundlePreviewError);
});
