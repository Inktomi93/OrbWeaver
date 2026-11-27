// @subject packages/client/src/features/workloads/components/workload-failed-documents.tsx
// A finished databank run names each document it could not index with the error it hit, and the row opens that document.
// The run is real: an owner with no embedding model fails every document at the embed, and the list shows what the server stored.

import { ingestRunResultSchema } from "@orb/contracts/databank";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import type { StartWorkloadInput } from "@orb/contracts/workloads";
import { routeOrbSocket, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { nonEmpty } from "@orb/testkit/iso";
import { createServerHarness } from "@orb/testkit/node/composed";
import { openFailedDocumentName } from "#client/features/workloads/lib/workloads-names.ts";
import type { FailedDocumentsStory } from "./_failed-documents-stories.tsx";

const STORY = "tests/client/features/workloads/components/_failed-documents-stories/FailedDocumentsStory";
const WORKLOAD_DEADLINE_MS = 30_000;
const DOCUMENT_NAME = "lamps.txt";
const DOCUMENT_REINDEX = { kind: "databank-reindex", params: { scope: { kind: "owner" }, mode: "chunk-embed" } } satisfies StartWorkloadInput;
const READS = [
  "settings.getUserSettings",
  "sessions.me",
  "workloads.list",
  "workloads.get",
  "admin.listUsers",
  "databank.get",
  "connection.listBindings",
  "connection.list",
  "stream.attach",
  "stream.detach",
] as const;

test("a finished databank run names the document it could not index, says why, and opens it", async ({ mount, page }) => {
  await using root = await createServerHarness({
    env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
    physicalPeer: () => "127.0.0.1",
    startJobs: false,
  });
  const runAdmittedWorkload = root.runAdmittedWorkload;
  if (runAdmittedWorkload === undefined) {
    throw new Error("the harness owns its workload execution only with startJobs: false");
  }
  const owner = await root.principalFor(root.ownerId);
  const { document } = await root.services.databank.createFromText({
    principal: owner,
    name: DOCUMENT_NAME,
    text: "The ledger room keeps its lamps lit through the long watch.",
    signal: new AbortController().signal,
  });
  const started = await root.services.workloads.start({ caller: owner, ownerId: owner.userId, mode: "singular", input: DOCUMENT_REINDEX });
  await runAdmittedWorkload(started.id, AbortSignal.timeout(WORKLOAD_DEADLINE_MS));
  const finished = await root.services.workloads.get({ caller: null, id: started.id });
  expect(finished).toMatchObject({ status: "succeeded" });
  const failure = nonEmpty(ingestRunResultSchema.parse(finished.result).failed)[0];
  expect(failure.documentId).toBe(document.id);
  expect(failure.error).not.toBe("");

  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, serveCorpusProcedures(caller, READS));
  await routeOrbSocket(page, { awaitAttaches: 0 });
  await mount<typeof FailedDocumentsStory>(STORY, {});

  const failedRow = page.locator('[data-slot="workload-failed-document"]');
  await expect(failedRow).toHaveCount(1);
  await expect(failedRow).toContainText(DOCUMENT_NAME);
  await expect(failedRow).toContainText(failure.error);
  await page.getByRole("button", { name: openFailedDocumentName(DOCUMENT_NAME), exact: true }).click();
  await expect(page.locator('[data-slot="navigation-probe"]')).toHaveText(`databank ${document.id}`);
});
