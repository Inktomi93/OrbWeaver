// @subject packages/client/src/features/databank/surfaces/databank-library-surface.tsx
// A Databank row's Delete confirm holds until the delete lands: a refused delete keeps the dialog and the open
// document, Cancel returns focus to the row's own menu trigger, and a landed delete hands focus to a neighbour row once the row
// has left the list. The real server's own `databankChanged` event is what removes the row.

import { ROW_DELETE_NAME, rowActionsName } from "@orb/client/lib";
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { DATABANK_LIST_NAME } from "#client/features/databank/lib/databank-names.ts";
import { forwardUserEvent } from "../../../components/_forward-user-event.ts";
import type { AppShellBusStory } from "../../app-shell/surfaces/_app-shell-stories.tsx";

const STORY = "tests/client/features/app-shell/surfaces/_app-shell-stories/AppShellBusStory";
const READS = [...SECTION_PROCEDURES, "databank.bankHealth", "databank.listGlobal", "databank.listAttachments", "databank.get"] as const;
const DOCUMENTS = ["Lantern notes", "Harbour notes", "Orchard notes"] as const;
const SEVEN_DOCUMENTS = ["Atlas notes", "Beacon notes", "Cinder notes", "Delta notes", "Ember notes", "Fjord notes", "Grove notes"] as const;
const ROW = '[data-slot="list-row-root"]';
const ACTIONS_BUTTON = /^Actions for /u;

test.use({ hasTouch: false, isMobile: false, viewport: { width: 1440, height: 900 } });

function listOf(page: Page): Locator {
  return page.getByRole("list", { name: DATABANK_LIST_NAME, exact: true });
}

/** The documents' names in the order the list shows them, read from the rows' actions buttons. */
function listedNames(list: Locator): Promise<readonly string[]> {
  return list
    .getByRole("button", { name: ACTIONS_BUTTON })
    .evaluateAll((buttons) => buttons.map((button) => (button.getAttribute("aria-label") ?? "").replace(/^Actions for /u, "")));
}

function rowBody(list: Locator, name: string): Locator {
  return list.getByRole("button", { name: new RegExp(`^${RegExp.escape(name)}`, "u") }).first();
}

async function openDelete(page: Page, name: string): Promise<void> {
  const row = page.locator(ROW).filter({ has: page.getByRole("button", { name: new RegExp(name, "u") }) });
  await row.hover();
  await row.locator('button[aria-haspopup="menu"]').click();
  await page.getByRole("menu").getByRole("menuitem", { name: ROW_DELETE_NAME, exact: true }).click();
}

test("a refused Databank delete keeps its confirm and its trigger, and a landed one hands focus to the next row once the row has left", async ({
  mount,
  page,
  corpus,
}) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  await using cleanup = new AsyncDisposableStack();
  const caller = await root.internalCallerFor(root.ownerId);
  for (const name of DOCUMENTS) {
    await caller.databank.createFromText({ name, text: `${name} body.` });
  }
  let refusing = true;
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, READS),
    ...serveCorpusProcedures(caller, ["databank.remove"], () => (refusing ? trpcError({ code: "INTERNAL_SERVER_ERROR" }) : undefined)),
    "stream.attach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
    "stream.detach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
  });
  await forwardUserEvent(page, root, "databankChanged", cleanup);
  await seedShellState(page, { activeSection: "databank" });
  await mount<typeof AppShellBusStory>(STORY, {});

  const list = listOf(page);
  await expect(rowBody(list, "Harbour notes")).toBeVisible();
  const names = await listedNames(list);
  const next = names[names.indexOf("Harbour notes") + 1];
  if (next === undefined) {
    throw new Error("Harbour notes is the last listed document");
  }

  await openDelete(page, "Harbour notes");
  const confirm = page.getByRole("alertdialog");
  await confirm.getByRole("button", { name: ROW_DELETE_NAME, exact: true }).click();
  await expect(confirm.getByRole("alert")).toBeVisible();
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await expect(
    page
      .locator(ROW)
      .filter({ has: page.getByRole("button", { name: /Harbour notes/u }) })
      .locator('button[aria-haspopup="menu"]'),
  ).toBeFocused();

  refusing = false;
  await openDelete(page, "Harbour notes");
  await confirm.getByRole("button", { name: ROW_DELETE_NAME, exact: true }).click();
  await expect(confirm).toHaveCount(0);

  await expect(list.getByRole("button", { name: rowActionsName("Harbour notes"), exact: true })).toHaveCount(0);
  await expect(rowBody(list, next)).toBeFocused();
});

test("deleting the last listed Databank document by keyboard hands focus to the row before it, not the list, once the row has left", async ({
  mount,
  page,
  corpus,
}) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  await using cleanup = new AsyncDisposableStack();
  const caller = await root.internalCallerFor(root.ownerId);
  for (const name of SEVEN_DOCUMENTS) {
    await caller.databank.createFromText({ name, text: `${name} body.` });
  }
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [...READS, "databank.remove"]),
    "stream.attach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
    "stream.detach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
  });
  await forwardUserEvent(page, root, "databankChanged", cleanup);
  await seedShellState(page, { activeSection: "databank" });
  await mount<typeof AppShellBusStory>(STORY, {});

  const list = listOf(page);
  await expect(list.getByRole("button", { name: rowActionsName(SEVEN_DOCUMENTS[0]), exact: true })).toBeVisible();
  const names = await listedNames(list);
  const last = names.at(-1);
  const before = names.at(-2);
  if (last === undefined || before === undefined) {
    throw new Error("The list shows fewer than two documents");
  }

  await list.getByRole("button", { name: rowActionsName(last), exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: ROW_DELETE_NAME, exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("alertdialog").getByRole("button", { name: ROW_DELETE_NAME, exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);

  await expect(list.getByRole("button", { name: rowActionsName(last), exact: true })).toHaveCount(0);
  await expect(rowBody(list, before)).toBeFocused();
});
