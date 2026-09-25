// infra/relay/binary — nothing is returned for execution unless its bytes match the pin on that call. The fake fetch
// serves planted bytes, so no test touches the network; the tgz arm runs the real system tar on a planted archive.

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { CloudflaredPackaging, CloudflaredPin, ExtractTgz, RelayAssetFetch } from "@orb/server/infra/relay";
import { CLOUDFLARED_PIN, createCloudflaredBinary, extractTgzWithTar } from "@orb/server/infra/relay";
import { afterEach, describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const runFile = promisify(execFile);
const TARGET = "linux-x64";
const PINNED = Buffer.from("#!/bin/sh\necho pinned cloudflared\n");
// The same length as the pinned bytes, so only the sha256 comparison can refuse it.
const FOREIGN = Buffer.from("#!/bin/sh\necho PWNED! cloudflared\n");
const OWNER_ONLY = 0o700;
// The low nine bits of a mode are its permissions; a modulus reads them without a bitwise mask.
const PERMISSION_MODULUS = 0o1000;
const NOT_FOUND = 404;
const BYTE_VALUES = 256;

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "orb-relay-binary-"));
  dirs.push(dir);
  return dir;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

// The real pin with this box's target pointed at planted bytes; every other field is the shipped shape.
function pinFor(bytes: Uint8Array, packaging: CloudflaredPackaging = "binary"): CloudflaredPin {
  return {
    ...CLOUDFLARED_PIN,
    releaseBase: "https://relay.example.invalid/download",
    assets: { ...CLOUDFLARED_PIN.assets, [TARGET]: { file: "cloudflared-planted", packaging, bytes: bytes.byteLength, sha256: sha256(bytes) } },
  };
}

function serving(bytes: Uint8Array | null, status = 200): { readonly fetch: RelayAssetFetch; readonly urls: string[] } {
  const urls: string[] = [];
  return {
    urls,
    fetch: (url): Promise<Response> => {
      urls.push(url);
      return Promise.resolve(new Response(bytes === null ? null : new Uint8Array(bytes), { status }));
    },
  };
}

const neverExtract: ExtractTgz = () => Promise.reject(new Error("extract must not run for this asset"));

describe("createCloudflaredBinary", () => {
  test("a download whose bytes differ from the pin is refused, deleted, and never returned", async () => {
    const dir = await tempDir();
    const net = serving(FOREIGN);
    const binary = createCloudflaredBinary({ pin: pinFor(PINNED), target: TARGET, dir, fetch: net.fetch, extractTgz: neverExtract });
    await expect(binary.ensure()).rejects.toMatchObject({ code: "relay_binary_checksum_mismatch" });
    expect(await readdir(dir)).toEqual([]);
    expect(net.urls).toEqual([`https://relay.example.invalid/download/${CLOUDFLARED_PIN.version}/cloudflared-planted`]);
  });

  test("control: the pinned bytes come back as an owner-only executable", async () => {
    const dir = await tempDir();
    const binary = createCloudflaredBinary({ pin: pinFor(PINNED), target: TARGET, dir, fetch: serving(PINNED).fetch, extractTgz: neverExtract });
    const path = await binary.ensure();
    expect(await readFile(path)).toEqual(PINNED);
    expect((await stat(path)).mode % PERMISSION_MODULUS).toBe(OWNER_ONLY);
  });

  test("a cached binary that stops matching the pin is deleted and refused, and nothing downloads in its place", async () => {
    const dir = await tempDir();
    const net = serving(PINNED);
    const binary = createCloudflaredBinary({ pin: pinFor(PINNED), target: TARGET, dir, fetch: net.fetch, extractTgz: neverExtract });
    const path = await binary.ensure();
    await writeFile(path, FOREIGN);
    await expect(binary.ensure()).rejects.toMatchObject({ code: "relay_binary_checksum_mismatch" });
    expect(await readdir(dir)).toEqual([]);
    expect(net.urls).toHaveLength(1);
  });

  test("an answer longer than the pinned size is cut off and refused", async () => {
    const dir = await tempDir();
    const binary = createCloudflaredBinary({
      pin: pinFor(PINNED),
      target: TARGET,
      dir,
      fetch: serving(Buffer.concat([PINNED, FOREIGN])).fetch,
      extractTgz: neverExtract,
    });
    await expect(binary.ensure()).rejects.toMatchObject({ code: "relay_binary_checksum_mismatch" });
    expect(await readdir(dir)).toEqual([]);
  });

  test("a platform cloudflared publishes no build for refuses before any download", async () => {
    const dir = await tempDir();
    const net = serving(PINNED);
    const binary = createCloudflaredBinary({ pin: pinFor(PINNED), target: "freebsd-x64", dir, fetch: net.fetch, extractTgz: neverExtract });
    await expect(binary.ensure()).rejects.toMatchObject({ code: "relay_platform_unsupported" });
    expect(net.urls).toEqual([]);
  });

  test("a non-2xx answer refuses as a failed download and leaves nothing behind", async () => {
    const dir = await tempDir();
    const binary = createCloudflaredBinary({ pin: pinFor(PINNED), target: TARGET, dir, fetch: serving(null, NOT_FOUND).fetch, extractTgz: neverExtract });
    await expect(binary.ensure()).rejects.toMatchObject({ code: "relay_binary_download_failed" });
    expect(await readdir(dir)).toEqual([]);
  });

  test("a symlink planted at the asset path is removed without being followed, and refused", async () => {
    const dir = await tempDir();
    const elsewhere = await tempDir();
    const decoy = join(elsewhere, "decoy");
    await writeFile(decoy, PINNED);
    const pin = pinFor(PINNED);
    await symlink(decoy, join(dir, `${pin.version}-cloudflared-planted`));
    const binary = createCloudflaredBinary({ pin, target: TARGET, dir, fetch: serving(PINNED).fetch, extractTgz: neverExtract });
    await expect(binary.ensure()).rejects.toMatchObject({ code: "relay_binary_checksum_mismatch" });
    expect(await readdir(dir)).toEqual([]);
    expect(await readFile(decoy)).toEqual(PINNED);
  });

  describe("a tgz asset", () => {
    async function plantedTgz(): Promise<Buffer> {
      const staging = await tempDir();
      await writeFile(join(staging, "cloudflared"), PINNED);
      const archive = join(staging, "cloudflared.tgz");
      await runFile("tar", ["-czf", archive, "-C", staging, "cloudflared"]);
      return readFile(archive);
    }

    // One byte in the middle of the archive changed; same length, so only the hash can tell.
    function tampered(bytes: Buffer): Buffer {
      const copy = Buffer.from(bytes);
      const middle = Math.floor(copy.byteLength / 2);
      copy[middle] = ((copy[middle] ?? 0) + 1) % BYTE_VALUES;
      return copy;
    }

    test("is unpacked only after the archive matched the pin, and the unpacked file is what runs", async () => {
      const tgz = await plantedTgz();
      const dir = await tempDir();
      const binary = createCloudflaredBinary({ pin: pinFor(tgz, "tgz"), target: TARGET, dir, fetch: serving(tgz).fetch, extractTgz: extractTgzWithTar });
      const path = await binary.ensure();
      expect(path).toBe(join(dir, `${CLOUDFLARED_PIN.version}-${TARGET}`, "cloudflared"));
      expect(await readFile(path)).toEqual(PINNED);
      expect((await stat(path)).mode % PERMISSION_MODULUS).toBe(OWNER_ONLY);
    });

    test("whose bytes differ from the pin is never unpacked", async () => {
      const tgz = await plantedTgz();
      const dir = await tempDir();
      const unpacked: string[] = [];
      const binary = createCloudflaredBinary({
        pin: pinFor(tgz, "tgz"),
        target: TARGET,
        dir,
        fetch: serving(tampered(tgz)).fetch,
        extractTgz: async (archive, intoDir) => {
          unpacked.push(archive);
          await mkdir(intoDir, { recursive: true });
        },
      });
      await expect(binary.ensure()).rejects.toMatchObject({ code: "relay_binary_checksum_mismatch" });
      expect(unpacked).toEqual([]);
    });
  });
});
