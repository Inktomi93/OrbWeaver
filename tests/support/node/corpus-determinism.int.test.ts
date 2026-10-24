// @subject tests/support/node/corpus.ts
// Two publishes from one tree must be byte-identical: every id comes from the injected source in a fixed order.
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCorpusCapsule, publishCorpusFixture } from "./corpus.ts";
import { createCorpusRecipe } from "./corpus-recipe.ts";
import { expect, test } from "./fixtures.ts";

const PUBLISH_BUDGET_MS = 300_000;

async function publishOnce(parent: string, name: string): Promise<string> {
  await using ownership = new AsyncDisposableStack();
  const scratch = await mkdtemp(join(parent, `${name}-scratch-`));
  const { options } = await createCorpusRecipe(scratch);
  const capsule = ownership.use(await createCorpusCapsule({ ...options, directory: join(scratch, "source") }));
  const published = join(parent, name);
  await publishCorpusFixture(capsule, published);
  return published;
}

async function filesUnder(root: string): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) {
      const path = join(entry.parentPath, entry.name);
      files.set(path.slice(root.length), await readFile(path));
    }
  }
  return files;
}

test("two corpus publishes from one tree are byte-identical", { tags: ["slow"], timeout: PUBLISH_BUDGET_MS }, async () => {
  const parent = await mkdtemp(join(tmpdir(), "orb-corpus-determinism-"));
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => rm(parent, { recursive: true, force: true }));
  const first = await filesUnder(await publishOnce(parent, "first"));
  const second = await filesUnder(await publishOnce(parent, "second"));
  expect([...second.keys()].sort()).toEqual([...first.keys()].sort());
  const differing = [...first].filter(([path, bytes]) => !bytes.equals(second.get(path) ?? Buffer.alloc(0))).map(([path]) => path);
  expect(differing).toEqual([]);
});
