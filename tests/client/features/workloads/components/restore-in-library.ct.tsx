// A whole-library backup restored onto the library that wrote it reports every file as already in the library and none imported.
// The section is the production backup-import body; the archive goes to a real server's bundle route and its import workload runs
// to the end on that server, so the summary line is the one a reader sees for a self-restore (D290).
// @subject packages/client/src/features/workloads/lib/portability-model.ts
import { testId } from "@orb/client/lib";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { importStartedSchema } from "@orb/contracts/import";
import { PORTABILITY_ROUTES } from "@orb/contracts/portability";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { routeAuthConfig, routeOrbSocket, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness, exportLibrary, readLibraryExport, WORKLOAD_DEADLINE_MS } from "@orb/testkit/node/composed";
import { IMPORT_CONFIRM_NAMES, summarizeBundleCounts, summaryCaption } from "#client/features/workloads/lib/portability-model.ts";
import type { ImportPreviewStory } from "./_import-preview-stories.tsx";

const STORY = "tests/client/features/workloads/components/_import-preview-stories/ImportPreviewStory";
const ROOT_OPTIONS = {
  env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
  physicalPeer: () => "127.0.0.1",
  startJobs: false,
} as const;

test("a backup restored onto its own library says every file is already in your library and none imported", async ({ corpus, mount, page }) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  const run = root.runAdmittedWorkload;
  if (run === undefined) {
    throw new Error("the harness owns workload execution only with startJobs: false");
  }
  // The first request seeds the owner's starter content in the background, so the backup is taken after it lands.
  await exportLibrary(root);
  await root.settleBackground();
  const bundle = await exportLibrary(root);
  const { files } = await readLibraryExport(root);
  await routeAuthConfig(page, corpus.auth.signedInConfig);
  await routeTrpc(page, {
    ...serveCorpusProcedures(await root.internalCallerFor(root.ownerId), ["settings.getUserSettings", "sessions.me", "workloads.list", "workloads.get"]),
    "stream.attach": ({ ref }) => (ref.channel === "user" || ref.channel === "workloads" ? null : trpcError({ code: "NOT_FOUND" })),
    "stream.detach": ({ ref }) => (ref.channel === "user" || ref.channel === "workloads" ? null : trpcError({ code: "NOT_FOUND" })),
  });
  // Every connection ends at once, so the page re-reads the finished run through `workloads.get`, the tracker's gap heal.
  await routeOrbSocket(page, { dropConnectionCount: Number.MAX_SAFE_INTEGER, frames: () => Promise.resolve([]) });
  // The upload goes to the real route, and its workload runs to the end before the page hears the answer, so the page's read of
  // the run finds it finished.
  await page.route(`**${PORTABILITY_ROUTES.importBundle}`, async (route) => {
    const incoming = route.request();
    const upload = incoming.postDataBuffer();
    const answer = await root.http.request(
      new Request(`http://127.0.0.1${PORTABILITY_ROUTES.importBundle}`, {
        method: "POST",
        headers: incoming.headers(),
        body: upload === null ? null : new Uint8Array(upload),
      }),
    );
    const body = Buffer.from(await answer.arrayBuffer());
    await run(importStartedSchema.parse(JSON.parse(body.toString("utf8"))).workloadId, AbortSignal.timeout(WORKLOAD_DEADLINE_MS));
    await route.fulfill({ status: answer.status, headers: Object.fromEntries(answer.headers), body });
  });
  await mount<typeof ImportPreviewStory>(STORY, { width: 960, appearance: appearanceSettingsSchema.parse({}) });

  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({ name: "backup.zip", mimeType: "application/zip", buffer: Buffer.from(bundle) });
  await page.getByRole("button", { name: IMPORT_CONFIRM_NAMES.file, exact: true }).click();

  const held = summarizeBundleCounts({ imported: 0, inLibrary: files.size, skipped: 0, mergedKeys: [], failed: 0, notes: [], memoryScope: null });
  await expect(page.getByTestId(testId("importReport")).getByText(summaryCaption(held), { exact: true })).toBeVisible();
});
