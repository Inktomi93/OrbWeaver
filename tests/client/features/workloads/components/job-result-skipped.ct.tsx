// @subject packages/client/src/features/workloads/components/workload-row.tsx
// @subject packages/client/src/features/workloads/lib/workloads-result-copy.ts
// A finished index or databank job names how many rows it left alone. An index pass skips a row for several reasons, so its line claims none of
// them; a databank pass skips a document only when its owner's account is disabled, so its line says that. Both runs are real: the server
// produced each result and the jobs list shows what it stored.

import { createCharacterSchema } from "@orb/contracts/character";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { StartWorkloadInput } from "@orb/contracts/workloads";
import type { WorkloadId } from "@orb/kit/ids";
import { routeOrbSocket, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  seedCorpusConnections,
} from "@orb/testkit/node/composed";
import { z } from "zod";
import { INDEX_SKIPPED_LABEL, INGEST_SKIPPED_LABEL } from "#client/features/workloads/lib/workloads-result-copy.ts";
import type { WorkloadActionGroupsStory } from "./_action-groups-stories.tsx";

const STORY = "tests/client/features/workloads/components/_action-groups-stories/WorkloadActionGroupsStory";
const WORKLOAD_DEADLINE_MS = 30_000;
const CARD_INDEX = { kind: "index", params: { source: "text" } } satisfies StartWorkloadInput;
const DOCUMENT_REINDEX = { kind: "databank-reindex", params: { scope: { kind: "owner" }, mode: "chunk-embed" } } satisfies StartWorkloadInput;
const ROOT_OPTIONS = {
  env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
  physicalPeer: () => "127.0.0.1",
  startJobs: false,
} as const;
const skippedCountSchema = z.object({ skipped: z.number() });
const READS = [
  "settings.getUserSettings",
  "sessions.me",
  "workloads.list",
  "workloads.get",
  "admin.listUsers",
  "connection.listBindings",
  "connection.list",
  "stream.attach",
  "stream.detach",
] as const;

/** Runs an admitted workload to its end and returns the result the server stored. */
async function runToEnd(root: ServerTestHarness, id: WorkloadId): Promise<unknown> {
  const run = root.runAdmittedWorkload;
  if (run === undefined) {
    throw new Error("the harness owns its workload execution only with startJobs: false");
  }
  await run(id, AbortSignal.timeout(WORKLOAD_DEADLINE_MS));
  const finished = await root.services.workloads.get({ caller: null, id });
  expect(finished).toMatchObject({ status: "succeeded" });
  return finished.result;
}

test("a finished index run counts the cards it left alone without calling them up to date", async ({ mount, page }) => {
  const wire = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using root = await createServerHarness({ ...ROOT_OPTIONS, providerFetch: wire.execute });
  const owner = await root.principalFor(root.ownerId);
  await root.services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({ name: "Lamplighter", handle: "lamplighter", description: "A keeper who tends the ledger room's lamps." }),
  });
  await root.settleBackground();
  await seedCorpusConnections(root, owner);
  // The pass embeds nothing and leaves the card alone; the stored result counts it.
  const result = await runToEnd(root, (await root.services.workloads.start({ caller: owner, ownerId: owner.userId, mode: "singular", input: CARD_INDEX })).id);
  expect(result).toMatchObject({ embedded: 0, skipped: expect.any(Number) });

  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, serveCorpusProcedures(caller, READS));
  await routeOrbSocket(page, { awaitAttaches: 0 });
  await mount<typeof WorkloadActionGroupsStory>(STORY, { sectionId: "workloads-jobs", width: 960, appearance: appearanceSettingsSchema.parse({}) });

  const { skipped } = skippedCountSchema.parse(result);
  expect(skipped).toBeGreaterThan(0);
  await expect(page.locator('[data-slot="workload-row"]').filter({ hasText: INDEX_SKIPPED_LABEL })).toContainText(`${String(skipped)} ${INDEX_SKIPPED_LABEL}`);
});

test("a finished databank reindex counts the documents it skipped for a disabled account and says why", async ({ mount, page }) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const admin = await root.principalFor(root.ownerId);
  const gone = await root.principalFor((await root.actor()).id);
  await root.services.databank.createFromText({ principal: gone, name: "lamps.txt", text: "The ledger room keeps its lamps lit through the long watch." });
  await root.services.admin.setEnabled({ principal: admin, userId: gone.userId, enabled: false });
  const started = await root.services.workloads.start({ caller: admin, ownerId: admin.userId, mode: "bulk", input: DOCUMENT_REINDEX });
  expect(await runToEnd(root, started.id)).toMatchObject({ documents: 0, skipped: 1 });

  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, serveCorpusProcedures(caller, READS));
  await routeOrbSocket(page, { awaitAttaches: 0 });
  await mount<typeof WorkloadActionGroupsStory>(STORY, { sectionId: "workloads-jobs", width: 960, appearance: appearanceSettingsSchema.parse({}) });

  await expect(page.locator('[data-slot="workload-row"]').filter({ hasText: INGEST_SKIPPED_LABEL })).toContainText(`1 ${INGEST_SKIPPED_LABEL}`);
});
