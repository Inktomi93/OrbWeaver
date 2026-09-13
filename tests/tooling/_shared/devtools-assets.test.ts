import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { DevToolsClosureFile, DevToolsClosureInput } from "@orb/tooling/_shared/devtools-assets";
import { adjudicateDevToolsClosure, readChromiumBrowserVersion, startDevToolsAssetServer, verifyDevToolsAssets } from "@orb/tooling/_shared/devtools-assets";
import { afterEach } from "vitest";
import { expect, test } from "../../support/tool-fixtures.ts";

const REAL_PIN = fileURLToPath(new URL("../../../tooling/src/snap/lib/devtools-frontend/pin.json", import.meta.url));
const REAL_ROOT = fileURLToPath(new URL("../../../tooling/src/snap/lib/devtools-frontend", import.meta.url));
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

test("the formatter worker cannot disappear from the generated closure", async () => {
  const root = await mkdtemp(join(tmpdir(), "orb-devtools-worker-test-"));
  roots.push(root);
  await cp(REAL_ROOT, root, { recursive: true });
  await unlink(join(root, "assets/serve_rev/@33c2f401a9c8ddad2159eb0ab83aa244a5247361/entrypoints/formatter_worker/formatter_worker-entrypoint.js"));
  expect(() => verifyDevToolsAssets(root)).toThrow();
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

  const formatterWorker = `${ASSET_ROOT}/assets/serve_rev/@33c2f401a9c8ddad2159eb0ab83aa244a5247361/entrypoints/formatter_worker/formatter_worker-entrypoint.js`;
  expect(manifest.resources.map(({ file }) => `${ASSET_ROOT}/${file}`)).toContain(formatterWorker);
  expect(untrackedManifestResources(manifest.resources, plantedMissing)).toContain(ignoredCoverageResource);
  expect(untrackedManifestResources(manifest.resources, tracked)).toEqual([]);
});

// THE SPLIT'S OWN PIN (#1584, the `devtools-frontend-assets` conversion). `verifyDevToolsAssetsSync` and the
// final gate policy now reach the SAME verdict through the SAME code — the runtime loads the adjudicator's
// input off disk, the policy takes it from the `devtools-closure` + `installed-package` ResourceHost doors.
// Nothing else holds that equivalence: the gate's own conformance rows never touch the runtime path, and this
// suite never touched the policy path, so a future edit could quietly make one caller stricter than the other.
// This row drives the adjudicator DIRECTLY over a census assembled the way the resource door assembles one —
// hashing every regular member from a plain directory walk — and asserts both the clean verdict and the same
// refusal the runtime raises on the same mutation.
function walkCensus(root: string, directory = root, into: DevToolsClosureFile[] = []): DevToolsClosureFile[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      walkCensus(root, path, into);
    } else {
      const body = readFileSync(path);
      into.push({ file: relative(root, path), bytes: body.byteLength, sha256: sha256(body) });
    }
  }
  return into;
}

function adjudicationInput(root: string): DevToolsClosureInput {
  return {
    pinText: readFileSync(join(root, "pin.json"), "utf8"),
    manifestText: readFileSync(join(root, "manifest.json"), "utf8"),
    licensesText: readFileSync(join(root, "licenses.json"), "utf8"),
    files: walkCensus(root),
  };
}

test("the pure adjudicator and the filesystem entry point cannot drift apart", async () => {
  const { root, asset } = await syntheticRoot();
  const pin = JSON.parse(await readFile(join(root, "pin.json"), "utf8")) as Record<string, unknown>;
  const installed = { version: String(pin["playwrightVersion"]), browserVersion: String(pin["browserVersion"]) };

  // Clean: both callers agree, and the adjudicator returns the same parsed pin the runtime publishes.
  const viaRuntime = verifyDevToolsAssets(root);
  const viaDoors = adjudicateDevToolsClosure(adjudicationInput(root), installed);
  expect(viaDoors.pin).toEqual(viaRuntime.pin);
  expect(viaDoors.manifest).toEqual(viaRuntime.manifest);

  // Broken: the SAME mutation raises the SAME refusal on both sides. Without this half the row would pass
  // for a split that had made the pure path silently permissive.
  await writeFile(join(root, asset), "mutated bytes");
  expect(() => verifyDevToolsAssets(root)).toThrow("hash/size mismatch");
  expect(() => adjudicateDevToolsClosure(adjudicationInput(root), installed)).toThrow("hash/size mismatch");

  // And the tuple half, which only the policy's doors can get wrong: a drifting installed version refuses
  // through the adjudicator exactly as it does through `installedPlaywrightTuple()`.
  const clean = await syntheticRoot();
  expect(() => adjudicateDevToolsClosure(adjudicationInput(clean.root), { ...installed, version: "0.0.0-planted-drift" })).toThrow(
    "Playwright/Chromium tuple drift",
  );
  expect(readChromiumBrowserVersion('{"browsers":[{"name":"chromium","browserVersion":"1.2.3"}]}')).toBe("1.2.3");
  expect(() => readChromiumBrowserVersion('{"browsers":[{"name":"firefox","browserVersion":"1.2.3"}]}')).toThrow("no chromium pin");
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
