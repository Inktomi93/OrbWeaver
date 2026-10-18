// Materialize a downloaded native backup for the real folder chooser, inside its test-owned output.
// The production codec bounds compressed input and each inflated entry; only one entry is copied at a time.
import { constants } from "node:fs";
import { mkdir, open, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { IMPORT_MAX_DECOMPRESSED_BYTES, IMPORT_TREE_MAX_FILE_BYTES, IMPORT_TREE_MAX_FILES, IMPORT_TREE_MAX_TOTAL_BYTES } from "@orb/contracts/uploads";
import { extractZip } from "@orb/server/infra/storage/zip";

export interface PreparedBackupFolder extends AsyncDisposable {
  readonly directory: string;
  readonly entries: number;
}

/** Preserve every codec-validated archive entry until the browser's folder import has finished. */
export async function prepareBackupFolder(archivePath: string, outputRoot: string): Promise<PreparedBackupFolder> {
  await mkdir(outputRoot, { mode: 0o700 });
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => rm(outputRoot, { recursive: true, force: true }));
  const directory = resolve(outputRoot, "library");
  await mkdir(directory, { mode: 0o700 });
  // Exclusive output creation and no-follow input keep the helper from redirecting private bytes.
  // biome-ignore lint/suspicious/noBitwiseOperators: the file-open flags require an OS bit mask.
  await using source = await open(archivePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  const staged = await extractZip(source.createReadStream({ autoClose: false }), {
    maxTotalBytes: IMPORT_TREE_MAX_TOTAL_BYTES,
    maxTotalDecompressedBytes: IMPORT_MAX_DECOMPRESSED_BYTES,
    maxEntryBytes: IMPORT_TREE_MAX_FILE_BYTES,
    maxEntries: IMPORT_TREE_MAX_FILES,
    stagingRoot: outputRoot,
  });
  const entries = staged.entries.length;
  try {
    for (const entry of staged.entries) {
      const target = resolve(directory, entry.path);
      if (!target.startsWith(`${directory}${sep}`)) {
        throw new Error("The backup entry escapes its owned folder");
      }
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      await writeFile(target, await entry.read(), { flag: "wx", mode: 0o600 });
    }
  } finally {
    await staged.dispose();
  }
  const lifetime = ownership.move();
  return { directory, entries, [Symbol.asyncDispose]: (): Promise<void> => lifetime.disposeAsync() };
}
