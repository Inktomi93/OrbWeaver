// @subject packages/client/src/features/databank/components/add-document-body.tsx
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import {
  DATABANK_ADD_NAME,
  DATABANK_ADD_NAME_FIELD_NAME,
  DATABANK_ADD_TEXT_FIELD_NAME,
  DATABANK_FETCH_ADD_NAME,
  DATABANK_FROM_LINK_NAME,
  DATABANK_LINK_FIELD_NAME,
  DATABANK_PASTE_TEXT_NAME,
  DATABANK_UPLOAD_FILE_NAME,
} from "#client/features/databank/lib/databank-names.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import type { AddDocumentStory } from "./_add-document-stories.tsx";

const STORY = "tests/client/features/databank/components/_add-document-stories/AddDocumentStory";
// The server's egress guard refuses a private IP literal before any request: a real refusal, not a scripted one.
const REFUSED_LINK = "https://192.168.1.50/page";
const DOCUMENT_NAME = "House Valeroth";

test("Enter in the paste arm's name field adds the document", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, serveCorpusProcedures(caller, ["databank.createFromText"]));
  await mount<typeof AddDocumentStory>(STORY, {});
  await page.getByRole("button", { name: DATABANK_PASTE_TEXT_NAME, exact: true }).click();
  await page.getByRole("textbox", { name: DATABANK_ADD_TEXT_FIELD_NAME, exact: true }).fill("The bloodlines of the house.");
  const name = page.getByRole("textbox", { name: DATABANK_ADD_NAME_FIELD_NAME, exact: true });
  await name.fill(DOCUMENT_NAME);
  await name.press("Enter");

  await expect.poll(async () => (await caller.databank.list({})).items.map((item) => item.name)).toContain(DOCUMENT_NAME);
});

test("clicking Add in the paste arm adds the document", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, serveCorpusProcedures(caller, ["databank.createFromText"]));
  await mount<typeof AddDocumentStory>(STORY, {});
  await page.getByRole("button", { name: DATABANK_PASTE_TEXT_NAME, exact: true }).click();
  await page.getByRole("textbox", { name: DATABANK_ADD_NAME_FIELD_NAME, exact: true }).fill(DOCUMENT_NAME);
  await page.getByRole("textbox", { name: DATABANK_ADD_TEXT_FIELD_NAME, exact: true }).fill("The bloodlines of the house.");
  await page.getByRole("button", { name: DATABANK_ADD_NAME, exact: true }).click();

  await expect.poll(async () => (await caller.databank.list({})).items.map((item) => item.name)).toContain(DOCUMENT_NAME);
});

test("Enter in the link field fetches, and a refused fetch leaves focus on the field its line describes", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  await routeTrpc(page, serveCorpusProcedures(await root.internalCallerFor(root.ownerId), ["databank.scrapeWeb"]));
  await mount<typeof AddDocumentStory>(STORY, {});
  await page.getByRole("button", { name: DATABANK_FROM_LINK_NAME, exact: true }).click();
  const link = page.getByRole("textbox", { name: DATABANK_LINK_FIELD_NAME, exact: true });
  await link.fill(REFUSED_LINK);
  await link.press("Enter");

  const failure = page.getByRole("alert").filter({ hasText: "Couldn't fetch that link. Check the address, then try again." });
  await expect(failure).toBeVisible();
  await expect(link).toBeFocused();
  await expect(link).toHaveAccessibleDescription("Couldn't fetch that link. Check the address, then try again.");
});

test("a failed fetch started by the button hands focus to the field too", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  await routeTrpc(page, serveCorpusProcedures(await root.internalCallerFor(root.ownerId), ["databank.scrapeWeb"]));
  await mount<typeof AddDocumentStory>(STORY, {});
  await page.getByRole("button", { name: DATABANK_FROM_LINK_NAME, exact: true }).click();
  const link = page.getByRole("textbox", { name: DATABANK_LINK_FIELD_NAME, exact: true });
  await link.fill(REFUSED_LINK);
  await page.getByRole("button", { name: DATABANK_FETCH_ADD_NAME, exact: true }).click();

  await expect(page.getByRole("alert").filter({ hasText: "Couldn't fetch that link. Check the address, then try again." })).toBeVisible();
  await expect(link).toBeFocused();
});

test("each arm spends the same reserved height, so the footer holds one line while the mode changes", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  await routeTrpc(page, serveCorpusProcedures(await root.internalCallerFor(root.ownerId), ["databank.scrapeWeb"]));
  await mount<typeof AddDocumentStory>(STORY, {});
  const cancel = page.getByRole("button", { name: DIALOG_VERBS.cancel, exact: true });
  const tops: number[] = [];
  for (const mode of [DATABANK_UPLOAD_FILE_NAME, DATABANK_PASTE_TEXT_NAME, DATABANK_FROM_LINK_NAME]) {
    await page.getByRole("button", { name: mode, exact: true }).click();
    tops.push((await cancel.boundingBox())?.y ?? Number.NaN);
  }
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(0.5);
});
