// stageDirectory — adapt an ALREADY-STAGED, already-validated directory tree on disk into the same
// `StagedArchive` contract `extractZip` yields, so the entity-agnostic bundle importer (`importStagedArchive`)
// can consume a folder upload exactly as it consumes an extracted zip. The folder-import HTTP route sanitizes
// every relative path and writes the files itself. The entries come from its manifest, never from a listing.

import { rm } from "node:fs/promises";
import type { StagedArchive } from "./contract.ts";
import type { StagedManifest } from "./staged-manifest.ts";
import { readVerified } from "./staged-manifest.ts";

/**
 * Present every file `manifest` records as a {@link StagedEntry} whose `path` is the forward-slash relative path within
 * `dir` (the bundle importer's routing key) and whose `read` lazily loads and verifies the bytes. `dispose()` removes
 * `dir` (the workload owns cleanup, mirroring the zip staging path).
 */
export function stageDirectory(dir: string, manifest: StagedManifest): StagedArchive {
  return {
    entries: manifest.map((file) => ({ path: file.path, read: () => readVerified(dir, file) })),
    dispose: () => rm(dir, { recursive: true, force: true }),
  };
}
