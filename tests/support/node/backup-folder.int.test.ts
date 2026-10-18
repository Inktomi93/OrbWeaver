import { mkdir, open, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PORTABLE_DIRECTORIES } from "@orb/contracts/portability";
import { packZip } from "@orb/server/infra/storage/zip";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { prepareBackupFolder } from "./backup-folder.ts";

async function archiveAt(path: string, paths: readonly string[]): Promise<void> {
  async function* entries(): Parameters<typeof packZip>[0] {
    for (const [index, entry] of paths.entries()) {
      const source = join(dirname(path), `source-${String(index)}`);
      await writeFile(source, Buffer.from(entry), { mode: 0o600 });
      yield { path: entry, bytes: await readFile(source) };
    }
  }
  await using file = await open(path, "wx", 0o600);
  for await (const chunk of packZip(entries())) {
    await file.write(chunk);
  }
}

test("the native codec preserves every directory and byte in a private disposable folder", async ({ scratch }) => {
  const archive = join(scratch, "backup.zip");
  const paths = Object.values(PORTABLE_DIRECTORIES).map((dir) => `${dir}fixture`);
  await archiveAt(archive, paths);
  const original = await readFile(archive);
  const output = join(scratch, "restore");
  {
    await using folder = await prepareBackupFolder(archive, output);
    expect(folder.entries).toBe(paths.length);
    expect((await stat(output)).mode % 0o1000).toBe(0o700);
    for (const path of paths) {
      const restored = join(folder.directory, path);
      expect(await readFile(restored)).toEqual(Buffer.from(path));
      expect((await stat(restored)).mode % 0o1000).toBe(0o600);
    }
  }
  await expect(stat(output)).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(archive)).toEqual(original);
});

test("duplicate native paths refuse materialization and retire only the new output owner", async ({ scratch }) => {
  const archive = join(scratch, "duplicate.zip");
  const entry = `${PORTABLE_DIRECTORIES.regex}duplicate.json`;
  await archiveAt(archive, [entry, entry]);
  const original = await readFile(archive);
  const output = join(scratch, "restore");
  await expect(prepareBackupFolder(archive, output)).rejects.toMatchObject({ code: "EEXIST" });
  await expect(stat(output)).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(archive)).toEqual(original);

  await mkdir(output);
  await expect(prepareBackupFolder(archive, output)).rejects.toMatchObject({ code: "EEXIST" });
  expect((await stat(output)).isDirectory()).toBe(true);
});
