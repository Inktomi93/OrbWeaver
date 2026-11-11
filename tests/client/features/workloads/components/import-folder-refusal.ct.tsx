// A folder that is not a SillyTavern user folder is refused in one inline sentence that says what to pick instead, and no toast repeats it:
// the refusal is on screen where the person is looking. The section is the production backup-import body over a corpus root; the
// plan refuses before any upload, so no request leaves the page.
// @subject packages/client/src/features/workloads/hooks/use-library-import.ts
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { absenceWindow, routeAuthConfig, routeOrbSocket, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { IMPORT_FOLDER_WRONG_FOLDER } from "#client/features/workloads/lib/import-folder-copy.ts";
import { IMPORT_FOLDER_NAME } from "#client/features/workloads/lib/import-library-names.ts";
import type { ImportPreviewStory } from "./_import-preview-stories.tsx";

const STORY = "tests/client/features/workloads/components/_import-preview-stories/ImportPreviewStory";
const TOAST_WINDOW_MS = 300;
// Counted by slot, not role: a modal marks the toaster aria-hidden, so a role query would miss a toast behind it.
const TOAST_ROOT = '[data-slot="toast-root"]';

test("a folder with no SillyTavern library in it says what to pick instead, once, with no toast", async ({ corpus, mount, page }, testInfo) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  // Holiday photos and a shopping list: nothing the importer admits.
  const folder = testInfo.outputPath("holiday");
  await mkdir(join(folder, "photos"), { recursive: true });
  await writeFile(join(folder, "shopping.txt"), "bread");
  await writeFile(join(folder, "photos", "beach.jpg"), "not a library");
  await routeAuthConfig(page, corpus.auth.signedInConfig);
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, ["settings.getUserSettings", "sessions.me", "workloads.list"]),
    "stream.attach": ({ ref }) => (ref.channel === "user" || ref.channel === "workloads" ? null : trpcError({ code: "NOT_FOUND" })),
    "stream.detach": ({ ref }) => (ref.channel === "user" || ref.channel === "workloads" ? null : trpcError({ code: "NOT_FOUND" })),
  });
  await routeOrbSocket(page);
  await mount<typeof ImportPreviewStory>(STORY, { width: 960, appearance: appearanceSettingsSchema.parse({}) });

  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: IMPORT_FOLDER_NAME, exact: true }).click();
  await (await chooserPromise).setFiles(folder);

  await expect(page.getByRole("alert")).toHaveCount(1);
  await expect(page.getByRole("alert").getByText(IMPORT_FOLDER_WRONG_FOLDER, { exact: true })).toBeVisible();
  await absenceWindow(page, TOAST_WINDOW_MS);
  await expect(page.locator(TOAST_ROOT)).toHaveCount(0);
});
