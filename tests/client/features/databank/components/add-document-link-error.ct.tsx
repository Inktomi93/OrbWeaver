// @subject packages/client/src/features/databank/components/add-document-body.tsx
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { AddDocumentStory } from "./_add-document-stories.tsx";

const STORY = "tests/client/features/databank/components/_add-document-stories/AddDocumentStory";
const TOAST = '[data-slot="toast-root"]';
// The server's egress guard refuses a private IP literal before any request: a real refusal, not a scripted one.
const REFUSED_LINK = "https://192.168.1.50/page";

test("a failed link fetch reports once: the form's own line, with no toast beside it", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  await routeTrpc(page, serveCorpusProcedures(await root.internalCallerFor(root.ownerId), ["databank.scrapeWeb"]));
  await mount<typeof AddDocumentStory>(STORY, {});
  await page.getByRole("button", { name: "From a link", exact: true }).click();
  await page.getByRole("textbox", { name: "Link", exact: true }).fill(REFUSED_LINK);
  await page.getByRole("button", { name: "Fetch and add", exact: true }).click();

  await expect(page.getByText("Couldn't fetch that link. Check the address, then try again.", { exact: true })).toBeVisible();
  // Let every other surface that would speak settle before counting them.
  await expect(page.getByRole("button", { name: "Fetch and add", exact: true })).toBeEnabled();
  await expect(page.locator(TOAST)).toHaveCount(0);
});
