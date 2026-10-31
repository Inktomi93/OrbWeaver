import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Make a temp folder that `owner` removes when it is disposed, whether the body returned or threw. */
export async function ownedTempDir(owner: AsyncDisposableStack, prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  owner.defer(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
