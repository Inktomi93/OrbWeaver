// Child process for the model-loader-belt survival test (spawned by model-loader-belt.int.test.ts). It runs
// the EXACT production crash scenario with NO safety-net listeners: a local-light embed against a partial
// model cache (config.json present, no ONNX weights) in offline mode. transformers.js 4.2.0's getSession
// orphans an un-awaited model-file promise here; without our lib-boundary belt (model-cache.ts) that orphan
// is a FATAL unhandled rejection and this process exits non-zero. With the belt it degrades to a caught
// embed failure and the process survives → prints SURVIVED and exits 0. Deliberately registers no
// unhandledRejection/uncaughtException listener — the whole point is exit-code truth under production's
// no-listener reality (a test-harness listener would mask the escape).

import process from "node:process";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { ModelId } from "@orb/kit/ids";
import type { EmbedResult } from "@orb/server/infra/providers";
import { createLocalLightBackend } from "@orb/server/infra/providers/backends/local-light";

const cacheDir = process.argv[2];
if (cacheDir === undefined) {
  process.stdout.write("NO_CACHE_DIR\n");
  process.exit(2);
}

const backend = createLocalLightBackend({ cacheDir, allowRemoteModels: false });
const embed = backend.embed;
if (embed === undefined) {
  process.stdout.write("NO_EMBED\n");
  process.exit(2);
}

const pending: Promise<EmbedResult> = embed({
  credential: { source: "local-light", credentialId: null } as unknown as ResolvedCredential,
  model: "jinaai/jina-clip-v2" as ModelId,
  input: "a character card to index",
});
try {
  await pending;
  process.stdout.write("EMBED_RESOLVED\n");
} catch {
  // The model files are absent — a caught, degraded failure is the CORRECT outcome (the belt converted the
  // lib's detached orphan into an ordinary rejection). What matters is that we reach here at all.
  process.stdout.write("EMBED_FAILED_CLEANLY\n");
}

// Hold the loop open so any DETACHED straggler orphan (the lib emits several, at later ticks) gets a chance
// to fire and crash an unbelted process before we declare survival.
await new Promise((resolve) => setTimeout(resolve, 4000));
process.stdout.write("SURVIVED\n");
process.exit(0);
