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

const NO_PHASES: BankHealth["byPhase"] = { empty: 0, indexing: 0, embedding: 0, ready: 0, stalled: 0 };

/** A bank whose every field agrees: all documents ready, one passage per chunk, nothing stale. */
function bankOf(total: number): BankHealth {
  return { total, passages: total, chunks: total, byPhase: { ...NO_PHASES, ready: total }, staleExtraction: 0 };
}

/** The corpus captures one inputless bank-health read; every case starts from that production-shaped view. */
function capturedHealth(reads: readonly { readonly output: BankHealth }[]): BankHealth {
  const [capture] = reads;
  if (capture === undefined || capture.output.total === 0) {
    throw new Error("The corpus must capture a stocked bank-health read");
  }
  return capture.output;
}

/** The menu group's accessible name as the browser computes it; the reason copy stays production's. */
async function groupName(page: Page): Promise<string> {
  const group = page.getByRole("menu").getByRole("group");
  // The group names itself through a label that registers after the menu opens.
  await expect(group).toHaveAccessibleName(/\S/u);
  const snapshot = await group.ariaSnapshot();
  const name = /^- group "(.*)"/u.exec(snapshot)?.[1];
  if (name === undefined) {
    throw new Error(`The menu group carries no accessible name:\n${snapshot}`);
  }
  return name;
}

/** The group is named by exactly one label, and the browser's computed name is that label's visible text. */
async function expectNamedByItsOneLabel(page: Page): Promise<void> {
  const group = page.getByRole("menu").getByRole("group");
  const name = await groupName(page);
  await expect(group.locator('[data-slot="menu-group-label"]')).toHaveCount(1);
  const labelId = await group.getAttribute("aria-labelledby");
  expect(labelId).not.toBeNull();
  const label = page.locator(`[id="${labelId ?? ""}"]`);
  await expect(label).toHaveCount(1);
  await expect(label).toHaveText(name);
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

test("an empty bank closes both sweeps and names why, with no retry to offer", async ({ mount, page }) => {
  await routeTrpc(page, { "databank.bankHealth": () => bankOf(0) });
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

test("a failed census names the failure, never the empty-bank reason", async ({ mount, page }) => {
  let failing = false;
  await routeTrpc(page, {
    "databank.bankHealth": () => (failing ? trpcError({ message: "bank health failed" }) : bankOf(0)),
  });

  // A genuinely empty bank is where production states its empty-bank reason.
  const empty = await mount<typeof DatabankListHeaderStory>(STORY, {});
  await openMaintenance(page);
  const emptyReason = await groupName(page);
  await empty.unmount();

  failing = true;
  await mount<typeof DatabankListHeaderStory>(STORY, {});
  await openMaintenance(page);
  // The read is still retrying until the re-read item exists; only then is the census failed.
  await expect(page.getByRole("menuitem", { name: CHECK_AGAIN, exact: true })).toBeVisible();
  const failedReason = await groupName(page);

  expect(failedReason).not.toBe(emptyReason);
  // The group's name is one label; the empty-bank reason must also be absent as rendered text.
  const menu = page.getByRole("menu");
  await expect(menu.getByText(emptyReason, { exact: true })).toHaveCount(0);
  await expect(menu.getByText(failedReason, { exact: true })).toHaveCount(1);
});

// One mount, one query cache: the census changes under a live band, the way a recovered read or a landed
// document changes it, and the group must carry a name for the reason that holds NOW.
test("the maintenance group is named after every census transition", async ({ mount, page }) => {
  const stocked = bankOf(3);
  let answer: "failed" | "empty" | "stocked" = "failed";
  await routeTrpc(page, {
    "databank.bankHealth": () => {
      if (answer === "failed") {
        return trpcError({ message: "bank health failed" });
      }
      return answer === "empty" ? bankOf(0) : stocked;
    },
  });
  const component = await mount<typeof DatabankListHeaderStory>(STORY, {});
  const checkAgain = page.getByRole("menuitem", { name: CHECK_AGAIN, exact: true });

  // failed
  await openMaintenance(page);
  await expect(checkAgain).toBeVisible();
  await expectNamedByItsOneLabel(page);

  // failed -> empty
  answer = "empty";
  await checkAgain.click();
  await openMaintenance(page);
  await expect(checkAgain).toHaveCount(0);
  await expectNamedByItsOneLabel(page);
  await page.keyboard.press("Escape");

  // empty -> stocked
  answer = "stocked";
  await component.getByRole("button", { name: "Re-read census", exact: true }).click();
  await expect(component.getByRole("heading", { level: 2 }).getByText(String(stocked.total), { exact: true })).toBeVisible();
  await openMaintenance(page);
  await expect(page.getByRole("menu").getByRole("group")).toHaveAccessibleName("");
  await page.keyboard.press("Escape");

  // stocked -> failed: the re-read fails while the last census is still held, so the failed reason must still show
  answer = "failed";
  await component.getByRole("button", { name: "Re-read census", exact: true }).click();
  await openMaintenance(page);
  await expect(checkAgain).toBeVisible();
  await expectNamedByItsOneLabel(page);
  // failed -> stocked
  answer = "stocked";
  await checkAgain.click();
  await openMaintenance(page);
  await expect(checkAgain).toHaveCount(0);
  await expect(page.getByRole("menu").getByRole("group")).toHaveAccessibleName("");
  await page.keyboard.press("Escape");

  // stocked -> empty
  answer = "empty";
  await component.getByRole("button", { name: "Re-read census", exact: true }).click();
  await openMaintenance(page);
  await expectNamedByItsOneLabel(page);
  await page.keyboard.press("Escape");

  // empty -> failed -> empty: the failed read keeps the last census (0), so BOTH reasons hold at once;
  // when the read recovers the group must still be named by the empty-bank reason.
  answer = "failed";
  await component.getByRole("button", { name: "Re-read census", exact: true }).click();
  await openMaintenance(page);
  await expect(checkAgain).toBeVisible();
  answer = "empty";
  await checkAgain.click();
  await openMaintenance(page);
  await expect(checkAgain).toHaveCount(0);
  await expectNamedByItsOneLabel(page);
});

test("the band prints the server census of a bank deeper than one list page", async ({ mount, page }) => {
  const total = DATABANK_LIST_DEFAULT_LIMIT + 46;
  // routeTrpc refuses an unlisted databank.list, so the band cannot measure a page instead of the census.
  await routeTrpc(page, { "databank.bankHealth": () => bankOf(total) });
  const component = await mount<typeof DatabankListHeaderStory>(STORY, {});
  await expect(component.getByRole("heading", { level: 2 }).getByText(String(total), { exact: true })).toBeVisible();
});
