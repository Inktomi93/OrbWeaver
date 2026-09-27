// Secret files that are replaced over their life, such as the IP certificate and its keys (D269): owner-only, written
// whole through a private temp file renamed over the target, so a reader sees the old bytes or the new, never half.
// SECURITY: nothing here follows a symlink or waits on a special file. A rename replaces a planted link instead of
// writing through it, and a read opens with O_NOFOLLOW and O_NONBLOCK and refuses anything that is not a regular file.

import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

// Owner-only read and write; group and world get nothing.
const SECRET_FILE_MODE = 0o600;
const SECRET_DIR_MODE = 0o700;
const GROUP_OR_WORLD_BITS = 0o077;
const TEMP_NAME_BYTES = 8;
// O_NONBLOCK: a planted FIFO would block the open until a writer came; it opens at once and fails the regular-file check.
// biome-ignore lint/suspicious/noBitwiseOperators: open(2) flags combine with a bitwise OR.
const READ_NO_FOLLOW = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;

function errorCode(err: unknown): string | undefined {
  return err instanceof Error && "code" in err && typeof err.code === "string" ? err.code : undefined;
}

/** Replace `path` with `content` at mode 0600, creating its directory at 0700 when absent. The bytes are fsynced
 *  before the rename, so a crash leaves the old file or the new one. */
export async function writeSecretFile(path: string, content: string): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true, mode: SECRET_DIR_MODE });
  const temp = join(dir, `${basename(path)}.${randomBytes(TEMP_NAME_BYTES).toString("hex")}.tmp`);
  const handle = await open(temp, "wx", SECRET_FILE_MODE);
  try {
    try {
      await handle.writeFile(content);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, path);
  } catch (err) {
    await rm(temp, { force: true });
    throw err;
  }
}

/** The file's text, or null when nothing is at `path`. A file that group or world can read is narrowed to 0600 first.
 *  @throws when `path` is a symlink, a directory or any other non-regular entry, or cannot be read. */
export async function readSecretFile(path: string): Promise<string | null> {
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(path, READ_NO_FOLLOW);
  } catch (err) {
    if (errorCode(err) === "ENOENT") {
      return null;
    }
    throw err;
  }
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) {
      throw new Error(`${path} is not a regular file`);
    }
    // biome-ignore lint/suspicious/noBitwiseOperators: a permission mask is a bitwise AND.
    if ((stat.mode & GROUP_OR_WORLD_BITS) !== 0) {
      await handle.chmod(SECRET_FILE_MODE);
    }
    return await handle.readFile("utf-8");
  } finally {
    await handle.close();
  }
}

/** Delete the file at `path`; nothing there is not an error. */
export async function removeSecretFile(path: string): Promise<void> {
  await rm(path, { force: true });
}
