// infra/relay/pin — the pin's shape: every target has the release asset cloudflared publishes for it, a full sha256 and
// a size, so a transcription slip (a short hash, a swapped asset) fails here instead of refusing every share.

import { CLOUDFLARED_PIN, CLOUDFLARED_TARGETS } from "@orb/server/infra/relay";
import { expect, test } from "../../../support/fixtures.ts";

const SHA256_HEX = /^[0-9a-f]{64}$/u;
const RELEASE_VERSION = /^\d{4}\.\d{1,2}\.\d+$/u;

// cloudflared's release asset per node platform-arch, as its releases name them.
const PUBLISHED_ASSET: Record<(typeof CLOUDFLARED_TARGETS)[number], string> = {
  "linux-x64": "cloudflared-linux-amd64",
  "linux-arm64": "cloudflared-linux-arm64",
  "linux-arm": "cloudflared-linux-arm",
  "linux-ia32": "cloudflared-linux-386",
  "darwin-x64": "cloudflared-darwin-amd64.tgz",
  "darwin-arm64": "cloudflared-darwin-arm64.tgz",
  "win32-x64": "cloudflared-windows-amd64.exe",
  "win32-ia32": "cloudflared-windows-386.exe",
};

test("the pin names one cloudflared release on Cloudflare's own release downloads", () => {
  expect(CLOUDFLARED_PIN.version).toMatch(RELEASE_VERSION);
  expect(CLOUDFLARED_PIN.releaseBase).toBe("https://github.com/cloudflare/cloudflared/releases/download");
});

test("every target pins its published asset with a full sha256, a size, and the packaging its file name implies", () => {
  expect(Object.keys(CLOUDFLARED_PIN.assets).toSorted()).toEqual(CLOUDFLARED_TARGETS.toSorted());
  for (const target of CLOUDFLARED_TARGETS) {
    const asset = CLOUDFLARED_PIN.assets[target];
    expect(asset.file, target).toBe(PUBLISHED_ASSET[target]);
    expect(asset.sha256, target).toMatch(SHA256_HEX);
    expect(Number.isSafeInteger(asset.bytes) && asset.bytes > 0, target).toBe(true);
    expect(asset.packaging, target).toBe(asset.file.endsWith(".tgz") ? "tgz" : "binary");
  }
});

test("no two targets share a hash, so no asset was pasted into another's row", () => {
  const hashes = CLOUDFLARED_TARGETS.map((target) => CLOUDFLARED_PIN.assets[target].sha256);
  expect(new Set(hashes).size).toBe(hashes.length);
});
