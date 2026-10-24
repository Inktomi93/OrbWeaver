// @subject packages/client/src/features/databank/hooks/use-databank-list-header.tsx
// @subject packages/client/src/features/databank/hooks/use-owner-sweep.tsx
import { DATABANK_LIST_DEFAULT_LIMIT } from "@orb/contracts/databank";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { TrpcWireOutput } from "@orb/testkit/ct";
import { routeTrpc, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createSeededIds } from "@orb/testkit/iso";
import type { Page } from "@playwright/test";
import type { DatabankListHeaderStory } from "./_list-header-stories.tsx";

const STORY = "tests/client/features/databank/hooks/_list-header-stories/DatabankListHeaderStory";
const MAINTENANCE = "Databank maintenance";
const REBUILD_ALL = "Rebuild all documents";
const REREAD_ALL = "Re-read all documents";
const CHECK_AGAIN = "Check the bank again";

type BankHealth = TrpcWireOutput<"databank.bankHealth">;

/** The corpus captures one inputless bank-health read; every case starts from that production-shaped view. */
function capturedHealth(reads: readonly { readonly output: BankHealth }[]): BankHealth {
  const [capture] = reads;
  if (capture === undefined || capture.output.total === 0) {
    throw new Error("The corpus must capture a stocked bank-health read");
  }
  return capture.output;
}

async function openMaintenance(page: Page): Promise<void> {
  await page.getByRole("button", { name: MAINTENANCE, exact: true }).click();
  await expect(page.getByRole("menu")).toBeVisible();
}

test("each owner-wide sweep waits for its confirm before sending its mode, and Add opens the ingest slot", async ({ corpus, mount, page }) => {
  const ids = createSeededIds();
  const health = capturedHealth(corpus.reads["databank.bankHealth"]);
  const trpc = await routeTrpc(page, {
    "databank.bankHealth": () => health,
    "databank.reindex": () => ({ workloadId: mintTypeId(ID_PREFIX.workload, ids.next) }),
  });
  const component = await mount<typeof DatabankListHeaderStory>(STORY, {});
  await expect(component.getByRole("heading", { level: 2 }).getByText(String(health.total), { exact: true })).toBeVisible();

  await openMaintenance(page);
  // A stocked bank labels no reason for closed sweeps.
  await expect(page.getByRole("menu").getByRole("group")).toHaveAccessibleName("");
  await page.getByRole("menuitem", { name: REBUILD_ALL, exact: true }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toBeVisible();
  expect(trpc.count("databank.reindex")).toBe(0);
  await confirm.getByRole("button", { name: "Rebuild", exact: true }).click();
  await expect.poll(() => trpc.lastInput("databank.reindex")).toEqual({ scope: { kind: "owner" }, mode: "chunk-embed" });
  await expect(confirm).toHaveCount(0);

  await openMaintenance(page);
  await page.getByRole("menuitem", { name: REREAD_ALL, exact: true }).click();
  await expect(confirm).toBeVisible();
  expect(trpc.count("databank.reindex")).toBe(1);
  await confirm.getByRole("button", { name: "Re-read", exact: true }).click();
  await expect.poll(() => trpc.lastInput("databank.reindex")).toEqual({ scope: { kind: "owner" }, mode: "re-extract" });

  await component.getByRole("button", { name: "Add", exact: true }).click();
  await expect(component.getByRole("status", { name: "Open modal slot" })).toHaveText("addDocument");
});

test("an empty bank closes both sweeps and names why, with no retry to offer", async ({ corpus, mount, page }) => {
  const health = capturedHealth(corpus.reads["databank.bankHealth"]);
  await routeTrpc(page, { "databank.bankHealth": () => ({ ...health, total: 0 }) });
  await mount<typeof DatabankListHeaderStory>(STORY, {});

  await openMaintenance(page);
  await expect(page.getByRole("menuitem", { name: REBUILD_ALL, exact: true })).toBeDisabled();
  await expect(page.getByRole("menuitem", { name: REREAD_ALL, exact: true })).toBeDisabled();
  await expect(page.getByRole("menu").getByRole("group")).toHaveAccessibleName(/\S/u);
  await expect(page.getByRole("menuitem", { name: CHECK_AGAIN, exact: true })).toHaveCount(0);
});

test("a failed census keeps the sweeps closed and recovers through its re-read", async ({ corpus, mount, page }) => {
  const health = capturedHealth(corpus.reads["databank.bankHealth"]);
  // Fails every automatic retry; only the band's own re-read reaches a healthy server.
  let healthy = false;
  await routeTrpc(page, {
    "databank.bankHealth": () => (healthy ? health : trpcError({ message: "bank health failed" })),
  });
  const component = await mount<typeof DatabankListHeaderStory>(STORY, {});

  await openMaintenance(page);
  const checkAgain = page.getByRole("menuitem", { name: CHECK_AGAIN, exact: true });
  await expect(checkAgain).toBeVisible();
  await expect(page.getByRole("menu").getByRole("group")).toHaveAccessibleName(/\S/u);
  await expect(page.getByRole("menuitem", { name: REBUILD_ALL, exact: true })).toBeDisabled();
  healthy = true;
  await checkAgain.click();

  await expect(component.getByRole("heading", { level: 2 }).getByText(String(health.total), { exact: true })).toBeVisible();
  await openMaintenance(page);
  await expect(page.getByRole("menuitem", { name: REBUILD_ALL, exact: true })).toBeEnabled();
  await expect(page.getByRole("menuitem", { name: CHECK_AGAIN, exact: true })).toHaveCount(0);
});

test("the band prints the server census of a bank deeper than one list page", async ({ corpus, mount, page }) => {
  const health = capturedHealth(corpus.reads["databank.bankHealth"]);
  const total = DATABANK_LIST_DEFAULT_LIMIT + 46;
  // routeTrpc refuses an unlisted databank.list, so the band cannot measure a page instead of the census.
  await routeTrpc(page, { "databank.bankHealth": () => ({ ...health, total }) });
  const component = await mount<typeof DatabankListHeaderStory>(STORY, {});
  await expect(component.getByRole("heading", { level: 2 }).getByText(String(total), { exact: true })).toBeVisible();
});
