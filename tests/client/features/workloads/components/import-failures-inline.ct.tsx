// A backup or card upload the server refuses shows its failure as one inline line where the person is looking, and no toast says it
// again. The section is the production backup-import body over a corpus root; the upload really leaves the page for its route and only
// the answer is the test's, because a server refusal is the external edge.
// @subject packages/client/src/features/workloads/hooks/use-library-import.ts
import { CHARA_CARD_V2_SPEC } from "@orb/contracts/character";
import { PORTABILITY_ROUTES } from "@orb/contracts/portability";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { absenceWindow, routeAuthConfig, routeOrbSocket, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { ImportPreviewStory } from "./_import-preview-stories.tsx";

const STORY = "tests/client/features/workloads/components/_import-preview-stories/ImportPreviewStory";
const TOAST_WINDOW_MS = 300;
// Counted by slot, not role: a modal marks the toaster aria-hidden, so a role query would miss a toast behind it.
const TOAST_ROOT = '[data-slot="toast-root"]';
const REFUSAL = "The server could not take that upload.";
const CARD = JSON.stringify({
  spec: CHARA_CARD_V2_SPEC,
  ["spec_version"]: "2.0",
  data: { name: "Harbor Keeper", description: "Keeps the light.", ["first_mes"]: "Lamp lit." },
});
const UPLOADS = [
  { name: "a character card", route: PORTABILITY_ROUTES.importCards, file: { name: "keeper.json", mimeType: "application/json", buffer: Buffer.from(CARD) } },
  {
    name: "a backup archive",
    route: PORTABILITY_ROUTES.importBundle,
    file: { name: "backup.zip", mimeType: "application/zip", buffer: Buffer.from("not a real archive") },
  },
] as const;

for (const upload of UPLOADS) {
  test(`${upload.name} the server refuses is one inline line, with no toast`, async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness(undefined, { startJobs: false });
    const caller = await root.internalCallerFor(root.ownerId);
    await routeAuthConfig(page, corpus.auth.signedInConfig);
    await routeTrpc(page, {
      ...serveCorpusProcedures(caller, ["settings.getUserSettings", "sessions.me", "workloads.list"]),
      "stream.attach": ({ ref }) => (ref.channel === "user" || ref.channel === "workloads" ? null : trpcError({ code: "NOT_FOUND" })),
      "stream.detach": ({ ref }) => (ref.channel === "user" || ref.channel === "workloads" ? null : trpcError({ code: "NOT_FOUND" })),
    });
    await routeOrbSocket(page);
    let sent = 0;
    await page.route(`**${upload.route}`, async (route) => {
      sent += 1;
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: REFUSAL }) });
    });
    await mount<typeof ImportPreviewStory>(STORY, { width: 960, appearance: appearanceSettingsSchema.parse({}) });

    await page.locator('input[type="file"]').first().setInputFiles(upload.file);
    await page.getByRole("button", { name: /^Import(?! a (folder|backup))/u }).click();

    await expect(page.getByRole("alert")).toHaveCount(1);
    expect(sent).toBe(1);
    await absenceWindow(page, TOAST_WINDOW_MS);
    await expect(page.locator(TOAST_ROOT)).toHaveCount(0);
  });
}
