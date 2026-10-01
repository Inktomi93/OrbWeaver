import type * as FsPromises from "node:fs/promises";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { PLUGIN_SCRIPT_ENTRY_MAX_BYTES } from "@orb/contracts/plugin";
import { packPluginDir, packPreparedPluginDir } from "@orb/server/infra/plugin-source";
import { unzipSync } from "fflate";
import { vi } from "vitest";
import { expect, test as houseTest } from "../../../support/fixtures.ts";

const pathnameSwap = vi.hoisted(() => ({ armed: false, target: "", backup: "", replacement: "" }));

// Swap after the real open, so pathname rereads diverge from the descriptor's original bytes.
vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal<typeof FsPromises>();
  return {
    ...real,
    open: async (...args: Parameters<typeof real.open>) => {
      const handle = await real.open(...args);
      const observed = String(args[0]);
      if (pathnameSwap.armed && (observed === pathnameSwap.target || observed.endsWith(`/${basename(pathnameSwap.target)}`))) {
        pathnameSwap.armed = false;
        try {
          await real.rename(pathnameSwap.target, pathnameSwap.backup);
          await real.symlink(pathnameSwap.replacement, pathnameSwap.target);
        } catch (error) {
          await handle.close();
          throw error;
        }
      }
      return handle;
    },
  };
});

const test = houseTest.extend<{ sourceSwap: typeof pathnameSwap }>({
  sourceSwap: async ({}, use): Promise<void> => {
    try {
      await use(pathnameSwap);
    } finally {
      pathnameSwap.armed = false;
      pathnameSwap.target = "";
      pathnameSwap.backup = "";
      pathnameSwap.replacement = "";
    }
  },
});

async function withSource(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "orb-plugin-source-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("both install doors package only admitted built files and assets", async () => {
  await withSource(async (root) => {
    await mkdir(join(root, "ui", "assets"), { recursive: true });
    await writeFile(join(root, "manifest.json"), '{"id":"example"}');
    await writeFile(join(root, "main.js"), "export default {};");
    await writeFile(join(root, "ui.js"), "export default {};");
    await writeFile(join(root, "ui", "assets", "icon.png"), new Uint8Array([137, 80, 78, 71]));
    await writeFile(join(root, "main.ts"), "throw new Error('source must not ship')");
    await writeFile(join(root, "package.json"), '{"scripts":{"postinstall":"exit 1"}}');

    const local = await packPluginDir(root);
    const prepared = await packPreparedPluginDir(root);
    expect(prepared).toEqual(local);
    const entries = unzipSync(local);
    expect(Object.keys(entries).sort()).toEqual(["main.js", "manifest.json", "ui.js", "ui/assets/icon.png"]);
    expect(entries["ui/assets/icon.png"]).toEqual(new Uint8Array([137, 80, 78, 71]));
  });
});

test("the caller-selected directory door refuses a symlinked built entry", async () => {
  await withSource(async (root) => {
    await writeFile(join(root, "manifest.json"), '{"id":"example"}');
    await writeFile(join(root, "outside.js"), "export default {};");
    await symlink(join(root, "outside.js"), join(root, "main.js"));
    await expect(packPluginDir(root)).rejects.toThrow("must be a regular file");
  });
});

test("the local source reads its opened file descriptor after the pathname is replaced", async ({ sourceSwap }) => {
  await withSource(async (root) => {
    await withSource(async (outside) => {
      const original = "export const value = 'original';";
      const replacement = "export const value = 'replacement';";
      const main = join(root, "main.js");
      const secret = join(outside, "replacement.js");
      await writeFile(join(root, "manifest.json"), '{"id":"example"}');
      await writeFile(main, original);
      await writeFile(secret, replacement);
      sourceSwap.target = main;
      sourceSwap.backup = join(root, ".main-before-swap");
      sourceSwap.replacement = secret;
      sourceSwap.armed = true;

      const entries = unzipSync(await packPluginDir(root));

      expect(sourceSwap.armed).toBe(false);
      expect(entries["main.js"]).toEqual(new TextEncoder().encode(original));
      expect(entries["main.js"]).not.toEqual(new TextEncoder().encode(replacement));
    });
  });
});

test("the local source keeps asset reads rooted in the opened ui directory after its pathname is replaced", async ({ sourceSwap }) => {
  await withSource(async (root) => {
    await withSource(async (outside) => {
      const original = new Uint8Array([1, 2, 3]);
      const replacement = new Uint8Array([9, 9, 9]);
      await writeFile(join(root, "manifest.json"), '{"id":"example"}');
      await writeFile(join(root, "main.js"), "export default {};");
      await mkdir(join(root, "ui", "assets"), { recursive: true });
      await writeFile(join(root, "ui", "assets", "icon.png"), original);
      await mkdir(join(outside, "assets"));
      await writeFile(join(outside, "assets", "icon.png"), replacement);
      sourceSwap.target = join(root, "ui");
      sourceSwap.backup = join(root, ".ui-before-swap");
      sourceSwap.replacement = outside;
      sourceSwap.armed = true;

      const entries = unzipSync(await packPluginDir(root));

      expect(sourceSwap.armed).toBe(false);
      expect(entries["ui/assets/icon.png"]).toEqual(original);
      expect(entries["ui/assets/icon.png"]).not.toEqual(replacement);
    });
  });
});

test("the caller-selected directory door refuses a symlinked ui parent", async () => {
  await withSource(async (root) => {
    await withSource(async (outside) => {
      await writeFile(join(root, "manifest.json"), '{"id":"example"}');
      await writeFile(join(root, "main.js"), "export default {};");
      await mkdir(join(outside, "assets"));
      await writeFile(join(outside, "assets", "icon.png"), new Uint8Array([1, 2, 3]));
      await symlink(outside, join(root, "ui"));

      await expect(packPluginDir(root)).rejects.toThrow("must be a real directory");
    });
  });
});

test("the caller-selected directory door refuses an already oversized script source", async () => {
  await withSource(async (root) => {
    await writeFile(join(root, "manifest.json"), '{"id":"example"}');
    await writeFile(join(root, "main.js"), new Uint8Array(PLUGIN_SCRIPT_ENTRY_MAX_BYTES + 1));

    await expect(packPluginDir(root)).rejects.toThrow("exceeds");
  });
});
