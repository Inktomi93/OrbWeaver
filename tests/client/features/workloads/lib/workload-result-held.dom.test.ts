// A finished restore's row names the files the library already held beside the files it wrote. The backup is the owner's own
// library exported unchanged and posted to a real server's bundle route, whose import workload runs to the end, so the row's
// result is the one the server stores for a self-restore (D290): every file held, none written.
// @subject packages/client/src/features/workloads/lib/workloads-result-copy.ts

import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY, CSRF_HEADER } from "@orb/contracts/identity";
import { importStartedSchema } from "@orb/contracts/import";
import { PORTABILITY_ROUTES } from "@orb/contracts/portability";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, exportLibrary, readLibraryExport, WORKLOAD_DEADLINE_MS } from "@orb/testkit/node/composed";
import { workloadResultSummary } from "#client/features/workloads/lib/workloads-result-copy.ts";
import { inLibraryClause } from "#client/lib/in-library-copy.ts";

test("a backup restored onto its own library reports its files held on the workload row, not imported", async () => {
  await using root = await createServerHarness({
    env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
    physicalPeer: () => "127.0.0.1",
    startJobs: false,
  });
  const run = root.runAdmittedWorkload;
  if (run === undefined) {
    throw new Error("the harness owns workload execution only with startJobs: false");
  }
  // The first request seeds the owner's starter content in the background, so the backup is taken after it lands.
  await exportLibrary(root);
  await root.settleBackground();
  const bundle = await exportLibrary(root);
  const { files } = await readLibraryExport(root);

  const response = await root.http.request(PORTABILITY_ROUTES.importBundle, {
    method: "POST",
    headers: { [CSRF_HEADER]: "1" },
    body: Uint8Array.from(bundle),
  });
  expect(response.status).toBe(202);
  const { workloadId } = importStartedSchema.parse(await response.json());
  await run(workloadId, AbortSignal.timeout(WORKLOAD_DEADLINE_MS));
  const row = await root.services.workloads.get({ caller: await root.principalFor(root.ownerId), id: workloadId });
  if (row.kind !== "import-bundle" || row.poison || row.result === null) {
    throw new Error("the restore left no typed import-bundle result");
  }

  // The server counts every file held and none written.
  expect(row.result).toMatchObject({ imported: 0, inLibrary: files.size, skipped: 0, failed: 0 });
  expect(workloadResultSummary(row.kind, row.result)).toContain(inLibraryClause(files.size));
});
