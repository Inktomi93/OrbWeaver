import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PLUGIN_SCRIPT_ENTRY_MAX_BYTES } from "@orb/contracts/plugin";
import { packPreparedPluginDir } from "@orb/server/infra/plugin-source";
import { unzipSync } from "fflate";
import { expect, test } from "../../../support/fixtures.ts";

async function withSource(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "orb-plugin-source-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("the Git packer packages only admitted built files and assets", async () => {
  await withSource(async (root) => {
    await mkdir(join(root, "ui", "assets"), { recursive: true });
    await writeFile(join(root, "manifest.json"), '{"id":"example"}');
    await writeFile(join(root, "main.js"), "export default {};");
    await writeFile(join(root, "ui.js"), "export default {};");
    await writeFile(join(root, "ui", "assets", "icon.png"), new Uint8Array([137, 80, 78, 71]));
    await writeFile(join(root, "main.ts"), "throw new Error('source must not ship')");
    await writeFile(join(root, "package.json"), '{"scripts":{"postinstall":"exit 1"}}');

    const entries = unzipSync(await packPreparedPluginDir(root));
    expect(Object.keys(entries).sort()).toEqual(["main.js", "manifest.json", "ui.js", "ui/assets/icon.png"]);
    expect(entries["ui/assets/icon.png"]).toEqual(new Uint8Array([137, 80, 78, 71]));
  });
});

test("the Git packer refuses a symlinked built entry", async () => {
  await withSource(async (root) => {
    await writeFile(join(root, "manifest.json"), '{"id":"example"}');
    await writeFile(join(root, "outside.js"), "export default {};");
    await symlink(join(root, "outside.js"), join(root, "main.js"));
    await expect(packPreparedPluginDir(root)).rejects.toThrow("must be a regular file");
  });
});

test("the Git packer refuses an already oversized script source", async () => {
  await withSource(async (root) => {
    await writeFile(join(root, "manifest.json"), '{"id":"example"}');
    await writeFile(join(root, "main.js"), new Uint8Array(PLUGIN_SCRIPT_ENTRY_MAX_BYTES + 1));

    await expect(packPreparedPluginDir(root)).rejects.toThrow("exceeds");
  });
});
