// CT: the host-only "Add from your bank" PICKER (add-chat-document-dialog.tsx) — the one way a document
// that is not already reaching a room gets attached to it. It landed with no CT at all, which is what the
// #18 presence ratchet caught; the arms below are the rulings its own header states, driven for real.
//
//   · IT IS A PICKER, NOT A SECOND LIST — the offer set is the bank MINUS everything already feeding the
//     room, derived client-side from `activeIds`. Legacy's permanent second list is the defect this
//     subtraction exists to prevent, so a CT that never passes `activeIds` would not test the component.
//   · IT COSTS ONE READ — exactly `databank.list`, never legacy's `listAttachments` PER OWNED DOCUMENT.
//     Asserted as a request COUNT (node-side, polled), which is the only place that ruling is observable.
//   · IT CLOSES ON THE FIRST PICK — attach is idempotent and instant, and a stay-open picker would have to
//     re-derive its offer set mid-flight. Asserted through the dialog's own close REQUEST, not a repaint.
//   · TWO DIFFERENT NOTHINGS — an empty BANK is "go make one"; a bank that already reaches this room in
//     full is a success state. Both must be reachable and must say different things (empty states are
//     load-bearing), and BOTH must offer the only action a modal can offer: leaving it. That last clause
//     is the class of defect the sibling databank dialog shipped (an arm with no button at all), and it is
//     why the exit is asserted here as a real enabled control rather than assumed.

import type { DocumentId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { AddChatDocumentDialogStory } from "../_ct-stories";

const CHAT_ID = "chat_ct_keystone";

const TREATISE = {
  id: castId<DocumentId>("document_00000000000000000011"),
  name: "A Treatise on Salt",
  mime: "text/markdown",
  origin: "text",
  sourceUrl: null,
  byteSize: 25_088,
  charCount: 4200,
  chunkCount: 12,
  embeddedCount: 12,
  createdAt: 1_750_000_000_000,
  updatedAt: 1_750_000_000_000,
};

const LEDGER = { ...TREATISE, id: castId<DocumentId>("document_00000000000000000012"), name: "The Ashfen Ledger", byteSize: 93_901 };

/** The picker's ONE read, plus the attach it fires. `bank` scripts `databank.list` per case. */
function stubPicker(page: Page, bank: readonly unknown[]): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "databank.list": () => bank,
    "databank.attachToChat": () => null,
  });
}

test("offers the bank MINUS what already reaches the room (the subtraction, not a second list)", async ({ mount, page }) => {
  const trpc = await stubPicker(page, [TREATISE, LEDGER]);
  // The Treatise already feeds this chat — through the room, a character in it, or Everywhere.
  const dialog = await mount(<AddChatDocumentDialogStory activeIds={[TREATISE.id]} />);

  await expect(page.getByText("The Ashfen Ledger")).toBeVisible();
  await expect(page.getByText("A Treatise on Salt")).toHaveCount(0);

  // ONE read paints the whole picker — never a per-row attachment lookup (40 documents = 40 fetches).
  await expect.poll(() => trpc.count("databank.list"), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => trpc.count("databank.listAttachments"), { intervals: [20, 50, 100] }).toBe(0);
  expect(dialog).toBeTruthy();
});

test("Add fires attachToChat with THAT row's id, and the picker closes on the first pick", async ({ mount, page }) => {
  const trpc = await stubPicker(page, [TREATISE, LEDGER]);
  const dialog = await mount(<AddChatDocumentDialogStory />);
  await expect(page.getByText("The Ashfen Ledger")).toBeVisible();

  // Each row's action names its own document, so a mis-wired handler cannot hide behind a generic "Add".
  await page.getByRole("button", { name: "Add The Ashfen Ledger to this chat" }).click();

  await expect
    .poll(() => trpc.lastInput("databank.attachToChat"), { intervals: [20, 50, 100] })
    .toEqual({
      chatId: CHAT_ID,
      documentId: LEDGER.id,
    });
  // The close is the component's own RULING — asserted as the request it made, not as a disappearing node.
  await expect(dialog.getByTestId("picker-closes")).toHaveText("1");
});

test("an EMPTY bank says go make one — and offers the only action a modal can (leaving it)", async ({ mount, page }) => {
  await stubPicker(page, []);
  await mount(<AddChatDocumentDialogStory />);

  await expect(page.getByText("Your bank is empty")).toBeVisible();
  await expect(page.getByText("Add one in Databank", { exact: false })).toBeVisible();
  // The arm must not be a dead end: a real, enabled control, not just Esc and the backdrop.
  await expect(page.getByRole("button", { name: "Close" })).toBeEnabled();
});

test("a bank that ALREADY reaches this room in full is a success state, said differently", async ({ mount, page }) => {
  await stubPicker(page, [TREATISE, LEDGER]);
  await mount(<AddChatDocumentDialogStory activeIds={[TREATISE.id, LEDGER.id]} />);

  // The two nothings must not collapse into one sentence — this one is not a gap to go fix.
  await expect(page.getByText("Nothing left to add")).toBeVisible();
  await expect(page.getByText("Your bank is empty")).toHaveCount(0);
  await expect(page.getByText("Every document you own already reaches this chat", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close" })).toBeEnabled();
});

test("the candidate list loads through a shape-matched SKELETON — never a spinner or a void", async ({ mount, page }) => {
  // The PENDING arm, pinned at a settled state by a request that never answers. The hang must be held at
  // the ROUTE, not in a responder: `routeTrpc` does not await a responder's return value, so a promise
  // there serializes as `{}` and the query RESOLVES with a non-array — which crashes the list into the
  // error boundary and would have read as "no skeleton" for entirely the wrong reason. Playwright resolves
  // routes LIFO, so this one (registered last) wins over the stub beneath it.
  await stubPicker(page, []);
  await page.route("**/api/trpc/**", () => new Promise(() => undefined));
  await mount(<AddChatDocumentDialogStory />);

  // The dialog frame paints AT ONCE (house loading law — opening the picker never blanks the panel behind
  // it through a shared suspense boundary), with shape-matched rows where the bank will land.
  await expect(page.getByText("Add a document to this chat")).toBeVisible();
  await expect(page.locator('[data-slot="skeleton"]').first()).toBeVisible();
  // Not a spinner and not a void: the pending arm is real rows, and it is announced as busy.
  await expect(page.locator('[aria-busy="true"]').first()).toBeVisible();
});
