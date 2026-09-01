import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startDevToolsAssetServer, verifyDevToolsAssets } from "@orb/tooling/_shared/devtools-assets";
import { afterEach } from "vitest";
import { expect, test } from "../../support/tool-fixtures.ts";

const REAL_PIN = fileURLToPath(new URL("../../../tooling/src/snap/lib/devtools-frontend/pin.json", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const ASSET_ROOT = "tooling/src/snap/lib/devtools-frontend";
const roots: string[] = [];

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function untrackedManifestResources(resources: readonly { readonly file: string }[], tracked: ReadonlySet<string>): string[] {
  return resources.map(({ file }) => `${ASSET_ROOT}/${file}`).filter((file) => !tracked.has(file));
}

async function syntheticRoot(): Promise<{ readonly root: string; readonly asset: string; readonly notice: string }> {
  const realPin = JSON.parse(await readFile(REAL_PIN, "utf8")) as Record<string, unknown>;
  const root = await mkdtemp(join(tmpdir(), "orb-devtools-assets-test-"));
  roots.push(root);
  const asset = "assets/serve_rev/@33c2f401a9c8ddad2159eb0ab83aa244a5247361/inspector.html";
  const notice = "licenses/devtools-frontend/LICENSE";
  const assetBody = Buffer.from("official fixture asset");
  const noticeBody = Buffer.from("BSD fixture notice");
  await Promise.all([
    mkdir(join(root, "assets/serve_rev/@33c2f401a9c8ddad2159eb0ab83aa244a5247361"), { recursive: true }),
    mkdir(join(root, "licenses/devtools-frontend"), { recursive: true }),
  ]);
  await Promise.all([writeFile(join(root, asset), assetBody), writeFile(join(root, notice), noticeBody)]);
  const manifest = {
    schemaVersion: 1,
    resources: [
      {
        url: "/serve_rev/@33c2f401a9c8ddad2159eb0ab83aa244a5247361/inspector.html",
        file: asset,
        bytes: assetBody.byteLength,
        sha256: sha256(assetBody),
        mimeType: "text/html",
        licenseFamily: "devtools-frontend",
      },
    ],
  };
  const manifestText = canonical(manifest);
  const licenses = {
    schemaVersion: 1,
    families: [
      {
        family: "devtools-frontend",
        assetPrefix: "",
        notices: [
          {
            file: notice,
            source: "https://chromium.googlesource.com/devtools/devtools-frontend/+/33c2f401a9c8ddad2159eb0ab83aa244a5247361/LICENSE",
            bytes: noticeBody.byteLength,
            sha256: sha256(noticeBody),
          },
        ],
      },
    ],
  };
  const pin = {
    schemaVersion: 1,
    playwrightVersion: realPin["playwrightVersion"],
    browserVersion: realPin["browserVersion"],
    chromiumRevision: "3188f8a607ae7e067593be8aab7f02d2451fec07",
    devtoolsFrontendRevision: "33c2f401a9c8ddad2159eb0ab83aa244a5247361",
    protocolVersion: "1.3",
    resourceCount: 1,
    decodedBytes: assetBody.byteLength,
    manifestSha256: sha256(manifestText),
  };
  await Promise.all([
    writeFile(join(root, "manifest.json"), manifestText),
    writeFile(join(root, "licenses.json"), canonical(licenses)),
    writeFile(join(root, "pin.json"), canonical(pin)),
  ]);
  return { root, asset, notice };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("the verified asset server binds loopback and serves only exact GET/HEAD members", async () => {
  const { root } = await syntheticRoot();
  const server = await startDevToolsAssetServer(verifyDevToolsAssets(root));
  const path = "/serve_rev/@33c2f401a9c8ddad2159eb0ab83aa244a5247361/inspector.html";
  try {
    const [get, head, post, absent] = await Promise.all([
      fetch(`${server.origin}${path}`),
      fetch(`${server.origin}${path}`, { method: "HEAD" }),
      fetch(`${server.origin}${path}`, { method: "POST" }),
      fetch(`${server.origin}/serve_rev/@33c2f401a9c8ddad2159eb0ab83aa244a5247361/absent.js`),
    ]);
    expect([get.status, head.status, post.status, absent.status]).toEqual([200, 200, 403, 404]);
    expect(await get.text()).toBe("official fixture asset");
    expect(server.unexpectedRequests).toHaveLength(2);
  } finally {
    await server.close();
  }
  await expect(fetch(`${server.origin}${path}`)).rejects.toThrow();
});

test("hash drift fails before the asset server opens", async () => {
  const { root, asset } = await syntheticRoot();
  await writeFile(join(root, asset), "mutated bytes");
  expect(() => verifyDevToolsAssets(root)).toThrow("hash/size mismatch");
});

test("the installed Playwright and Chromium versions must match the tuple pin", async () => {
  const { root } = await syntheticRoot();
  const pinPath = join(root, "pin.json");
  const pin = JSON.parse(await readFile(pinPath, "utf8")) as Record<string, unknown>;
  pin["playwrightVersion"] = "0.0.0-planted-drift";
  await writeFile(pinPath, canonical(pin));
  expect(() => verifyDevToolsAssets(root)).toThrow("Playwright/Chromium tuple drift");
});

test("missing notices and unexpected members fail the exact inventory", async () => {
  const missing = await syntheticRoot();
  await unlink(join(missing.root, missing.notice));
  expect(() => verifyDevToolsAssets(missing.root)).toThrow();

  const extra = await syntheticRoot();
  await writeFile(join(extra.root, "unexpected.txt"), "not in the manifest");
  expect(() => verifyDevToolsAssets(extra.root)).toThrow("missing or unexpected resources");
});

test("symlinks are forbidden even when their target is an ordinary file", async () => {
  const fixture = await syntheticRoot();
  await symlink(fixture.asset, join(fixture.root, "unexpected-link"));
  expect(() => verifyDevToolsAssets(fixture.root)).toThrow("symlink forbidden");
});

test("every real manifest resource is Git-tracked, including resources beneath ignored directory names", async () => {
  const manifest = JSON.parse(
    await readFile(fileURLToPath(new URL("../../../tooling/src/snap/lib/devtools-frontend/manifest.json", import.meta.url)), "utf8"),
  ) as {
    readonly resources: readonly { readonly file: string }[];
  };
  const tracked = new Set(execFileSync("git", ["ls-files", "--", ASSET_ROOT], { cwd: REPO_ROOT, encoding: "utf8" }).split("\n").filter(Boolean));
  const ignoredCoverageResource = `${ASSET_ROOT}/assets/serve_rev/@33c2f401a9c8ddad2159eb0ab83aa244a5247361/panels/coverage/coverage.js`;
  const plantedMissing = new Set(tracked);
  plantedMissing.delete(ignoredCoverageResource);

  expect(manifest.resources).toHaveLength(477);
  expect(untrackedManifestResources(manifest.resources, plantedMissing)).toContain(ignoredCoverageResource);
  expect(untrackedManifestResources(manifest.resources, tracked)).toEqual([]);
});

test("the generated closure is excluded exactly from first-party source analyzers", async () => {
  const biome = JSON.parse(await readFile(join(REPO_ROOT, "biome.json"), "utf8")) as { readonly files: { readonly includes: readonly string[] } };
  const dependencyCruiser = createRequire(import.meta.url)("../../../.dependency-cruiser.cjs") as {
    readonly options: { readonly exclude: { readonly path: readonly string[] } };
  };
  const biomeRows = biome.files.includes.filter((row) => row.includes("devtools-frontend"));
  const depcruiseRows = dependencyCruiser.options.exclude.path.filter((row) => row.includes("devtools-frontend"));

  expect(biomeRows).toEqual([`!${ASSET_ROOT}`]);
  expect(depcruiseRows).toEqual([`^${ASSET_ROOT}/`]);
  const depcruisePattern = depcruiseRows[0];
  if (depcruisePattern === undefined) {
    throw new Error("the DevTools frontend depcruise exclusion is absent");
  }
  expect(new RegExp(depcruisePattern, "u").test("tooling/src/snap/lib/cascade-source.ts")).toBe(false);
});
