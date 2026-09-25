// The pinned cloudflared on disk. `ensure` hashes the bytes on every call and returns a path only when they match the
// pin; a mismatch deletes the file and refuses, so nothing unverified is ever executed and the next share downloads again.

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { RelayBinaryRefusal } from "@orb/contracts/identity";
import { DomainOperationError } from "@orb/kit/errors";
import type { CloudflaredAsset, CloudflaredBinary, CloudflaredBinaryDeps, CloudflaredPackaging, CloudflaredTarget, ExtractTgz } from "./contract.ts";
import { CLOUDFLARED_TARGETS } from "./contract.ts";

const DOWNLOAD_TIMEOUT_MS = 300_000;
const READ_CHUNK_BYTES = 1_048_576;
const PRIVATE_DIR_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const OWNER_EXECUTABLE_MODE = 0o700;
const TGZ_ENTRY = "cloudflared";
// Windows has no O_NOFOLLOW (node's typing says it always exists); the lstat before every open is the refusal there.
const NO_FOLLOW = "O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0;

const runFile = promisify(execFile);

function refuse(code: RelayBinaryRefusal, message: string): DomainOperationError {
  return new DomainOperationError(code, message);
}

function isTarget(target: string): target is CloudflaredTarget {
  return (CLOUDFLARED_TARGETS as readonly string[]).includes(target);
}

function isMissing(err: unknown): boolean {
  return err instanceof Error && "code" in err && err.code === "ENOENT";
}

// True for a regular file, false when nothing is there. Anything else at the path (a symlink, a directory) is removed
// without following it and refused, because the pin names bytes, not a pointer to them.
async function regularFileAt(path: string): Promise<boolean> {
  try {
    const stat = await lstat(path);
    if (stat.isFile()) {
      return true;
    }
    await rm(path, { recursive: true, force: true });
    throw refuse("relay_binary_checksum_mismatch", `${path} was not a regular file, so it was removed; start sharing again to download cloudflared.`);
  } catch (err) {
    if (isMissing(err)) {
      return false;
    }
    throw err;
  }
}

async function sha256OfFile(path: string): Promise<string> {
  // biome-ignore lint/suspicious/noBitwiseOperators: OR-ing POSIX open() flag bits is the intended API (the zip and staged-file readers carry the same exemption).
  const handle = await open(path, constants.O_RDONLY | NO_FOLLOW);
  try {
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(READ_CHUNK_BYTES);
    let position = 0;
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
      if (bytesRead === 0) {
        return hash.digest("hex");
      }
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
  } finally {
    await handle.close();
  }
}

function mismatch(asset: CloudflaredAsset, version: string): DomainOperationError {
  return refuse(
    "relay_binary_checksum_mismatch",
    `The downloaded ${asset.file} is not cloudflared ${version} as published (its sha256 or size differs from the pin), so it was deleted and never run.`,
  );
}

async function fetchAsset(deps: CloudflaredBinaryDeps, asset: CloudflaredAsset, url: string): Promise<ReadableStream<Uint8Array>> {
  let response: Response;
  try {
    response = await deps.fetch(url, { maxBytes: asset.bytes, deadlineMs: DOWNLOAD_TIMEOUT_MS });
  } catch (err) {
    throw refuse("relay_binary_download_failed", `Could not download ${url}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!response.ok || response.body === null) {
    throw refuse("relay_binary_download_failed", `Could not download ${url}: HTTP ${response.status}.`);
  }
  return response.body;
}

// Streams the asset into `dest` (created exclusively, owner-only) while hashing it. The pinned size caps the stream, so a
// hostile or wrong answer cannot fill the disk before the hash is compared.
async function download(deps: CloudflaredBinaryDeps, asset: CloudflaredAsset, dest: string): Promise<void> {
  const url = `${deps.pin.releaseBase}/${deps.pin.version}/${asset.file}`;
  const body = await fetchAsset(deps, asset, url);
  const handle = await open(dest, "wx", PRIVATE_FILE_MODE);
  const hash = createHash("sha256");
  let received = 0;
  try {
    for await (const chunk of body) {
      received += chunk.byteLength;
      if (received > asset.bytes) {
        throw mismatch(asset, deps.pin.version);
      }
      hash.update(chunk);
      await handle.write(chunk);
    }
  } catch (err) {
    throw err instanceof DomainOperationError
      ? err
      : refuse("relay_binary_download_failed", `Download of ${url} broke off: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await handle.close();
  }
  if (received !== asset.bytes || hash.digest("hex") !== asset.sha256) {
    throw mismatch(asset, deps.pin.version);
  }
}

// From a verified asset to the path that runs. A tgz is unpacked afresh on every call, from the archive just verified.
const EXECUTABLE_FROM: Record<CloudflaredPackaging, (deps: CloudflaredBinaryDeps, assetPath: string, target: CloudflaredTarget) => Promise<string>> = {
  binary: async (_deps, assetPath) => {
    await chmod(assetPath, OWNER_EXECUTABLE_MODE);
    return assetPath;
  },
  tgz: async (deps, assetPath, target) => {
    const unpackDir = join(deps.dir, `${deps.pin.version}-${target}`);
    await rm(unpackDir, { recursive: true, force: true });
    await mkdir(unpackDir, { mode: PRIVATE_DIR_MODE });
    await deps.extractTgz(assetPath, unpackDir);
    const executable = join(unpackDir, TGZ_ENTRY);
    if (!(await regularFileAt(executable))) {
      throw mismatch(deps.pin.assets[target], deps.pin.version);
    }
    await chmod(executable, OWNER_EXECUTABLE_MODE);
    return executable;
  },
};

/** The verifier over the pin. The directory is private to this process's user and holds only pinned assets. */
export function createCloudflaredBinary(deps: CloudflaredBinaryDeps): CloudflaredBinary {
  return {
    ensure: async (): Promise<string> => {
      const target = deps.target;
      if (!isTarget(target)) {
        throw refuse("relay_platform_unsupported", `cloudflared publishes no build for ${target}, so this machine cannot start a quick tunnel.`);
      }
      const asset = deps.pin.assets[target];
      await mkdir(deps.dir, { recursive: true, mode: PRIVATE_DIR_MODE });
      const assetPath = join(deps.dir, `${deps.pin.version}-${asset.file}`);
      if (await regularFileAt(assetPath)) {
        if ((await sha256OfFile(assetPath)) !== asset.sha256) {
          await rm(assetPath, { force: true });
          throw mismatch(asset, deps.pin.version);
        }
      } else {
        const partial = `${assetPath}.${randomUUID()}.partial`;
        try {
          await download(deps, asset, partial);
        } catch (err) {
          await rm(partial, { force: true });
          throw err;
        }
        await rename(partial, assetPath);
      }
      return EXECUTABLE_FROM[asset.packaging](deps, assetPath, target);
    },
  };
}

/** Unpacks only the `cloudflared` entry with the system tar, argument by argument, never through a shell. */
export const extractTgzWithTar: ExtractTgz = async (archive, intoDir) => {
  await runFile("tar", ["-xzf", archive, "-C", intoDir, TGZ_ENTRY]);
};
