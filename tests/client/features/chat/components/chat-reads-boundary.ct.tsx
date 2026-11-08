// @subject packages/client/src/features/chat/components/variant-wire-viewer.tsx
// The wire viewer and the faces strip read through the shared boundary: a held read shows the loading skeleton, a failed
// one the shared error block, and Retry shows the settled answer. A deleted variant is the typed gone state, not the error block.

import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { heldThenFailing, holdServed, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createSeededIds } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { queryFailedLabel } from "#client/data/query-state-copy.ts";
import { VARIANT_WIRE_GONE_TITLE, VARIANT_WIRE_READ } from "#client/features/chat/lib/message-action-names.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import type { ChatListFacesStripStory, VariantWireViewerStory } from "./_chat-reads-boundary-stories.tsx";

const STORIES = "tests/client/features/chat/components/_chat-reads-boundary-stories";
const SHELL_READS = ["sessions.me", "settings.getUserSettings", "connection.list", "connection.listBindings"] as const;

test("a held wire read shows the loading skeleton, a failed one the error block, and Retry shows the gone state for a deleted variant", async ({
  corpus,
  mount,
  page,
}) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const chatId = corpus.reads["chat.getChat"][0]?.output.id;
  if (chatId === undefined) {
    throw new Error("Committed corpus omitted a chat");
  }
  const read = heldThenFailing();
  await routeTrpc(page, { ...serveCorpusProcedures(caller, SHELL_READS), ...serveCorpusProcedures(caller, ["chat.getVariantWire"], read.intercept) });
  await mount<typeof VariantWireViewerStory>(`${STORIES}/VariantWireViewerStory`, {
    chatId,
    variantId: mintTypeId(ID_PREFIX.messageVariant, createSeededIds().next),
  });
  const dialog = page.getByRole("dialog");
  await read.hold.requested;
  await expect(dialog.locator('[aria-busy="true"]')).toBeVisible();
  read.hold.fail();
  await expect(dialog.getByText(queryFailedLabel(VARIANT_WIRE_READ), { exact: true })).toBeVisible();
  read.recover();
  await dialog.getByRole("button", { name: DIALOG_VERBS.retry, exact: true }).click();
  await expect(dialog.getByText(VARIANT_WIRE_GONE_TITLE, { exact: true })).toBeVisible();
});

test("a held recent-chats read shows the strip's reserved skeleton, a failed one the error block, and Retry shows the strip", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const read = heldThenFailing();
  await routeTrpc(page, { ...serveCorpusProcedures(caller, SHELL_READS), ...serveCorpusProcedures(caller, ["chat.listChats"], read.intercept) });
  await mount<typeof ChatListFacesStripStory>(`${STORIES}/ChatListFacesStripStory`, {});
  await read.hold.requested;
  await expect(page.locator("[data-face-pending]")).toBeVisible();
  read.hold.fail();
  await expect(page.getByText("Couldn't load your recent characters.", { exact: true })).toBeVisible();
  read.recover();
  await page.getByRole("button", { name: DIALOG_VERBS.retry, exact: true }).click();
  await expect(page.getByText("Couldn't load your recent characters.", { exact: true })).toHaveCount(0);
  await expect(page.locator("[data-face-pending]")).toHaveCount(0);
});

test("a scoped face focused while the recent-chats read is held keeps focus when the read lands", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const hold = holdServed();
  await routeTrpc(page, { ...serveCorpusProcedures(caller, SHELL_READS), ...serveCorpusProcedures(caller, ["chat.listChats"], () => hold) });
  await mount<typeof ChatListFacesStripStory>(`${STORIES}/ChatListFacesStripStory`, {
    characterFilter: { id: mintTypeId(ID_PREFIX.character, createSeededIds().next), name: "Scoped Witness", avatarHash: null },
  });
  await hold.requested;
  const face = page.getByRole("button", { name: /Scoped Witness/u });
  await face.focus();
  hold.release();
  // The corpus's recent chats bring their own faces once the read lands.
  await expect(page.getByRole("button", { name: /^Show chats with (?!Scoped Witness)/u }).first()).toBeVisible();
  await expect(face).toBeFocused();
});
