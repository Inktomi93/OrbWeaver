import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { SourceMap } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "../fixtures.ts";
import { retainNativeSources } from "./select-native-sources.ts";

const PAGE_URL = "http://localhost:3100/";
const SCRIPT_URL = `${PAGE_URL}assets/index-cold.js`;
const SCRIPT = 'const title = "café";\r\n//# sourceMappingURL=index-cold.js.map\r\n';
const MAP = {
  version: 3,
  file: "index-cold.js",
  sourceRoot: "",
  sources: ["../../src/cold.ts"],
  sourcesContent: ['const title: string = "café";'],
  names: [],
  mappings: "AAAA",
};
const MAP_BYTES = `${JSON.stringify(MAP)}\n`;

const sourceTest = test.extend<{ retentionRoot: string }>({
  retentionRoot: async ({}, use) => {
    const root = await mkdtemp(join(tmpdir(), "orb-select-native-source-"));
    try {
      await mkdir(join(root, "lease", "assets"), { recursive: true });
      await mkdir(join(root, "retained"));
      await use(root);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
});

function copyingAttachment(root: string): Parameters<typeof retainNativeSources>[0]["attach"] {
  return async (name, options): Promise<void> => {
    await copyFile(options.path, join(root, "retained", name));
  };
}

sourceTest("retains the current lease's exact bytes and source mapping after lease deletion", async ({ retentionRoot }) => {
  const lease = join(retentionRoot, "lease");
  await writeFile(join(lease, "assets", "index-cold.js"), SCRIPT);
  await writeFile(join(lease, "assets", "index-cold.js.map"), MAP_BYTES);
  await mkdir(join(retentionRoot, "other-lease", "assets"), { recursive: true });
  await writeFile(join(retentionRoot, "other-lease", "assets", "index-cold.js"), "wrong build");
  const foreignUrl = "https://elsewhere.example/assets/index-cold.js";
  const receipt = await retainNativeSources({
    cacheDir: lease,
    pageUrl: PAGE_URL,
    scriptUrls: [SCRIPT_URL, SCRIPT_URL, foreignUrl, "__playwright_evaluation_script__"],
    attach: copyingAttachment(retentionRoot),
  });
  await rm(lease, { recursive: true });
  expect(receipt.complete).toBe(true);
  expect(receipt.error).toBeNull();
  expect(receipt.ignoredUrls).toEqual([foreignUrl, "__playwright_evaluation_script__"]);
  expect(receipt.assets).toHaveLength(1);
  const asset = receipt.assets[0];
  assert(asset !== undefined && asset.source.attachmentName !== null && asset.map.attachmentName !== null);
  expect(asset.url).toBe(SCRIPT_URL);
  expect(asset.source.relativePath).toBe("assets/index-cold.js");
  expect(asset.map.relativePath).toBe("assets/index-cold.js.map");
  expect(await readFile(join(retentionRoot, "retained", asset.source.attachmentName))).toEqual(Buffer.from(SCRIPT));
  expect(await readFile(join(retentionRoot, "retained", asset.map.attachmentName))).toEqual(Buffer.from(MAP_BYTES));
  expect(new SourceMap(MAP).findEntry(0, 0)).toMatchObject({ originalSource: MAP.sources[0], originalLine: 0, originalColumn: 0 });
});

sourceTest("reports a missing map, keeps the source, and does not replace a primary failure", async ({ retentionRoot }) => {
  const lease = join(retentionRoot, "lease");
  await writeFile(join(lease, "assets", "index-cold.js"), SCRIPT);
  const primaryFailure = new Error("the original native budget failed");
  const finish = async (): Promise<void> => {
    try {
      throw primaryFailure;
    } finally {
      const receipt = await retainNativeSources({ cacheDir: lease, pageUrl: PAGE_URL, scriptUrls: [SCRIPT_URL], attach: copyingAttachment(retentionRoot) });
      expect(receipt.complete).toBe(false);
      const asset = receipt.assets[0];
      assert(asset !== undefined && asset.source.attachmentName !== null);
      expect(asset.source.error).toBeNull();
      expect(asset.map.attachmentName).toBeNull();
      expect(asset.map.error).toContain("ENOENT");
      await rm(lease, { recursive: true });
      expect(await readFile(join(retentionRoot, "retained", asset.source.attachmentName))).toEqual(Buffer.from(SCRIPT));
    }
  };
  await expect(finish()).rejects.toBe(primaryFailure);
});

sourceTest("reports an unreadable source independently of its readable map", async ({ retentionRoot }) => {
  const lease = join(retentionRoot, "lease");
  await mkdir(join(lease, "assets", "index-cold.js"));
  await writeFile(join(lease, "assets", "index-cold.js.map"), MAP_BYTES);
  const receipt = await retainNativeSources({ cacheDir: lease, pageUrl: PAGE_URL, scriptUrls: [SCRIPT_URL], attach: copyingAttachment(retentionRoot) });
  expect(receipt.complete).toBe(false);
  const asset = receipt.assets[0];
  assert(asset !== undefined && asset.map.attachmentName !== null);
  expect(asset.source.attachmentName).toBeNull();
  expect(asset.source.error).toContain("EISDIR");
  expect(asset.map.error).toBeNull();
  expect(await readFile(join(retentionRoot, "retained", asset.map.attachmentName))).toEqual(Buffer.from(MAP_BYTES));
});

sourceTest("reports absent lease and empty source selection instead of a vacuous complete capture", async ({ retentionRoot }) => {
  const attach = copyingAttachment(retentionRoot);
  const missingLease = await retainNativeSources({ cacheDir: undefined, pageUrl: PAGE_URL, scriptUrls: [SCRIPT_URL], attach });
  expect(missingLease).toMatchObject({ complete: false, assets: [], error: "The native capture has no CT lease cache directory" });
  const empty = await retainNativeSources({ cacheDir: join(retentionRoot, "lease"), pageUrl: PAGE_URL, scriptUrls: [], attach });
  expect(empty).toMatchObject({ complete: false, assets: [], error: "The native capture referenced no emitted CT JavaScript assets" });
});
