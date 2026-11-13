// @subject tests/support/node/showcase-guest.ts
// A showcase build that fails is forgotten: the next case that asks for the same plugin builds it again.
import { copyFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { expect, test } from "./fixtures.ts";
import { mainSourceOf } from "./showcase-guest.ts";
import { ownedTempDir } from "./temp-dir.ts";

const SHOWCASE_BUNDLES = join(import.meta.dirname, "..", "..", "..", "packages", "showcase-plugins", "bundles");
const AUTHORED = "draft-polish";

test("a showcase build that failed is built again by the next ask, and that build succeeds", async () => {
  await using owner = new AsyncDisposableStack();
  // The helper has no build seam, so the failure is a real one: a plugin directory that holds no source yet. The slug
  // resolves below the showcase bundles, so this one walks out of them to a folder the case owns.
  const directory = await ownedTempDir(owner, "showcase-guest-retry-");
  const slug = relative(SHOWCASE_BUNDLES, directory);

  await expect(mainSourceOf(slug)).rejects.toThrow(slug);

  for (const file of ["main.ts", "manifest.json"]) {
    await copyFile(join(SHOWCASE_BUNDLES, AUTHORED, file), join(directory, file));
  }
  // The same author source builds to the same guest wherever it sits, so the retry is a real build, not a stale answer.
  expect(await mainSourceOf(slug)).toBe(await mainSourceOf(AUTHORED));
});
