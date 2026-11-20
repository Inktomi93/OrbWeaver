// @subject packages/client/src/features/databank/hooks/use-add-document-commit.tsx
import { fontSizeAgainstStep, watchToastMounts } from "@orb/testkit/browser/spec";
import { holdServed, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import {
  DATABANK_FETCH_ADD_NAME,
  DATABANK_FROM_LINK_NAME,
  DATABANK_LINK_FIELD_NAME,
  DATABANK_PASTE_TEXT_NAME,
} from "#client/features/databank/lib/databank-names.ts";
import type { AddDocumentStory } from "./_add-document-stories.tsx";

const STORY = "tests/client/features/databank/components/_add-document-stories/AddDocumentStory";
const TOAST = '[data-slot="toast-root"]';
// The server's egress guard refuses a private IP literal before any request: a real refusal, not a scripted one.
const REFUSED_LINK = "https://192.168.1.50/page";

test("a failed link fetch is said by the form's own line, and no toast repeats it", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  await routeTrpc(page, serveCorpusProcedures(await root.internalCallerFor(root.ownerId), ["databank.scrapeWeb"]));
  const toastMounts = await watchToastMounts(page);
  await mount<typeof AddDocumentStory>(STORY, {});
  await page.getByRole("button", { name: DATABANK_FROM_LINK_NAME, exact: true }).click();
  await page.getByRole("textbox", { name: DATABANK_LINK_FIELD_NAME, exact: true }).fill(REFUSED_LINK);
  await page.getByRole("button", { name: DATABANK_FETCH_ADD_NAME, exact: true }).click();

  const failure = page.getByRole("alert").filter({ hasText: "Couldn't fetch that link. Check the address, then try again." });
  await expect(failure).toBeVisible();
  // The failure line reads at the body step, the dialog description's own.
  const lineSize = await fontSizeAgainstStep(failure, TOKENS["text.body"].cssVar);
  expect(lineSize.step).toBeGreaterThan(0);
  expect(lineSize.own).toBe(lineSize.step);
  // The line is announced, and the Link field points at it and reads as invalid.
  const link = page.getByRole("textbox", { name: DATABANK_LINK_FIELD_NAME, exact: true });
  await expect(link).toHaveAttribute("aria-invalid", "true");
  await expect(link).toHaveAccessibleDescription("Couldn't fetch that link. Check the address, then try again.");
  // The mutation handler raises a toast before the failed state reaches the form, so a toast would have mounted by now.
  expect(await toastMounts()).toBe(0);
});

test("a link fetch that fails after the source was switched is still said, by the toast", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const hold = holdServed();
  await routeTrpc(
    page,
    serveCorpusProcedures(await root.internalCallerFor(root.ownerId), ["databank.scrapeWeb"], (input) => (input.url === REFUSED_LINK ? hold : undefined)),
  );
  await mount<typeof AddDocumentStory>(STORY, {});
  await page.getByRole("button", { name: DATABANK_FROM_LINK_NAME, exact: true }).click();
  await page.getByRole("textbox", { name: DATABANK_LINK_FIELD_NAME, exact: true }).fill(REFUSED_LINK);
  await page.getByRole("button", { name: DATABANK_FETCH_ADD_NAME, exact: true }).click();
  await hold.requested;

  await page.getByRole("button", { name: DATABANK_PASTE_TEXT_NAME, exact: true }).click();
  hold.fail();
  await expect(page.locator(TOAST)).toBeVisible();
});
