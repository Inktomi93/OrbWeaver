import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ManifestInvalidError, parseBundle } from "@orb/server/domain/plugin";
import { createShowcaseBundleReader, SHOWCASE_PLUGIN_SLUGS } from "@orb/showcase-plugins";
import { writeShowcaseArtifacts } from "@orb/tooling/plugin-author-showcase";
import { zipSync } from "fflate";
import { expect, test } from "../support/tool-fixtures.ts";

const REPO_ROOT = join(import.meta.dirname, "..", "..");

async function materializedReader(scratch: string): Promise<ReturnType<typeof createShowcaseBundleReader>> {
  const output = join(scratch, "showcase-runtime");
  const result = await writeShowcaseArtifacts(REPO_ROOT, output);
  expect(result.diagnostics).toEqual([]);
  return createShowcaseBundleReader(output);
}

test("the runtime package has no author-toolchain dependency or source-tree fallback", async () => {
  const packageRoot = join(REPO_ROOT, "packages", "showcase-plugins");
  const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")) as { readonly dependencies?: Readonly<Record<string, string>> };
  const source = await readFile(join(packageRoot, "src", "index.ts"), "utf8");
  expect(manifest.dependencies?.["@orb/plugin-toolchain"]).toBeUndefined();
  expect(source).toContain('"dist", "bundles"');
  expect(source).not.toContain('"bundles", slug');
});

test("a clean build materializes every indexed slug as deterministic installable bytes", { tags: "source-freshness" }, async ({ scratch }) => {
  const reader = await materializedReader(scratch);
  for (const slug of SHOWCASE_PLUGIN_SLUGS) {
    const first = await reader.packBundle(slug);
    const second = await reader.packBundle(slug);
    expect(first, `${slug} ships no release artifact`).not.toBeNull();
    expect(second).toEqual(first);
    const parsed = parseBundle(first as Uint8Array);
    expect(parsed.manifest.id).toBe(slug);
    expect(parsed.uiJs !== undefined, `${slug}'s ui.js presence disagrees with its uiEntry declaration`).toBe(parsed.manifest.uiEntry !== undefined);
  }
});

test("the runtime manifest reader reads versions from the generated zip", async ({ scratch }) => {
  const reader = await materializedReader(scratch);
  for (const slug of SHOWCASE_PLUGIN_SLUGS) {
    const manifest = await reader.readManifest(slug);
    expect(manifest, `${slug} ships no valid manifest`).not.toBeNull();
    expect(manifest?.id).toBe(slug);
    expect(manifest?.version).toMatch(/^\d+\.\d+\.\d+/u);
  }
});

test("an unknown runtime slug is an absence, never a throw", async ({ scratch }) => {
  const reader = await materializedReader(scratch);
  expect(await reader.packBundle("no-such-showcase-plugin")).toBeNull();
  expect(await reader.readManifest("no-such-showcase-plugin")).toBeNull();
});

test("a present but corrupt release artifact fails loudly instead of hiding an upgrade", async () => {
  const root = await mkdtemp(join(tmpdir(), "orb-corrupt-showcase-"));
  try {
    await writeFile(join(root, "corrupt.zip"), "not a zip");
    await writeFile(join(root, "missing-manifest.zip"), zipSync({ "main.js": new TextEncoder().encode("export default {};") }));
    const reader = createShowcaseBundleReader(root);
    await expect(reader.readManifest("corrupt")).rejects.toThrow();
    await expect(reader.readManifest("missing-manifest")).rejects.toThrow("has no manifest");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the install funnel refuses undeclared ui.js, declared-but-absent ui.js, and stray entries", async ({ scratch }) => {
  const reader = await materializedReader(scratch);
  const packed = await reader.packBundle(SHOWCASE_PLUGIN_SLUGS[0]);
  const original = parseBundle(packed as Uint8Array);
  const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
  const manifestOf = (overrides: Record<string, string | undefined>): Uint8Array => encode(JSON.stringify({ ...original.manifest, ...overrides }));

  expect(() =>
    parseBundle(zipSync({ "manifest.json": manifestOf({ uiEntry: undefined }), "main.js": encode("const x = 1;"), "ui.js": encode("const ui = 1;") })),
  ).toThrow(ManifestInvalidError);
  expect(() => parseBundle(zipSync({ "manifest.json": manifestOf({ uiEntry: "ui.js" }), "main.js": encode("const x = 1;") }))).toThrow(ManifestInvalidError);
  expect(() =>
    parseBundle(zipSync({ "manifest.json": manifestOf({ uiEntry: undefined }), "main.js": encode("const x = 1;"), "steal.js": encode("exfil()") })),
  ).toThrow(ManifestInvalidError);
});
