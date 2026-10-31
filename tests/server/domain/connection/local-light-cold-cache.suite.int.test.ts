// The first rerank call on an empty model cache downloads the seeded model through the shipped local-light loader and
// serves it. Opt-in: the `local-model-cache` tag runs only with ORB_LOCAL_LIGHT_E2E=1 and needs the network.
// @subject packages/server/src/entry/boot/seed-local-light.ts

import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { LOCAL_LIGHT_SEED_ROWS } from "@orb/contracts/inference";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";

const SEEDED_RERANKER = LOCAL_LIGHT_SEED_ROWS[1].model;
const SANITY_QUERY = "Which planet is known as the Red Planet?";
const SANITY_DOCUMENTS = [
  { id: "venus", text: "Venus is often called Earth's twin because of its similar size and proximity." },
  { id: "mars", text: "Mars, known for its reddish appearance, is often referred to as the Red Planet." },
];
/** A first load fetches the weights, so it owns the whole download rather than the usual case budget. */
const COLD_LOAD_TIMEOUT_MS = 600_000;

// The harness refuses model loads by default. This kernel delegates both hooks to the library and the network, so the
// shipped loader runs unscripted.
const NATIVE_KERNEL_SOURCE = `export const loadTransformers = (nativeLoad) => nativeLoad();
export const fetch = (input, init) => globalThis.fetch(input, init);
`;

async function cachedBytes(directory: string): Promise<number> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const sizes = await Promise.all(entries.filter((entry) => entry.isFile()).map(async (entry) => (await stat(join(entry.parentPath, entry.name))).size));
  return sizes.reduce((sum, size) => sum + size, 0);
}

test("the first rerank on an empty model cache downloads the seeded model and serves it", {
  tags: ["local-model-cache"],
  timeout: COLD_LOAD_TIMEOUT_MS,
}, async () => {
  const kernelDirectory = await mkdtemp(join(tmpdir(), "orb-native-kernel-"));
  try {
    const kernelPath = join(kernelDirectory, "native-kernel.mjs");
    await writeFile(kernelPath, NATIVE_KERNEL_SOURCE);
    await using harness = await createServerHarness({ allowRemoteModels: true, modelKernelModule: pathToFileURL(kernelPath).href });
    await harness.app.seedUserConnections(harness.ownerId);
    expect(await cachedBytes(harness.modelCacheDir)).toBe(0);

    const clients = await harness.app.roleClientsFor(harness.ownerId);
    const resolved = await clients.resolved("rerank");
    expect(resolved?.model).toBe(SEEDED_RERANKER);

    const first = await clients.rerank(SANITY_QUERY, SANITY_DOCUMENTS);
    expect(first.model).toBe(SEEDED_RERANKER);
    expect(await cachedBytes(harness.modelCacheDir)).toBeGreaterThan(0);
    // The served model is correct, not only present: it ranks the document that answers the query first.
    expect(first.hits.toSorted((a, b) => b.score - a.score)[0]?.id).toBe("mars");

    const downloaded = await cachedBytes(harness.modelCacheDir);
    await clients.rerank(SANITY_QUERY, SANITY_DOCUMENTS);
    expect(await cachedBytes(harness.modelCacheDir)).toBe(downloaded);
  } finally {
    await rm(kernelDirectory, { recursive: true, force: true });
  }
});
