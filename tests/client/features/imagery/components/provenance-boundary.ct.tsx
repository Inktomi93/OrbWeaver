// @subject packages/client/src/features/imagery/components/provenance-strip.tsx
// The lightbox's provenance strip reads through the shared boundary beside the painted image: a held read shows the loading skeleton, a
// failed one the shared error block, and Retry shows the strip's settled answer.

import type { ImageSubject } from "@orb/client/state";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { holdServed, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createSeededIds } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { ImageDetailShellStory } from "./_provenance-stories.tsx";

const EXTRA_READS = [
  "persona.list",
  "notifications.list",
  "plugin.listCommands",
  "databank.bankHealth",
  "rosterPreset.count",
  "connection.list",
  "connection.listBindings",
] as const;
const STORY = "tests/client/features/imagery/components/_provenance-stories/ImageDetailShellStory";

test("a held provenance read shows the loading skeleton, a failed one the error block, and Retry shows the no-details line", async ({
  corpus,
  mount,
  page,
}) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const chatId = corpus.reads["chat.listChats"][0]?.output.items[0]?.id;
  if (chatId === undefined) {
    throw new Error("The corpus has no room to open an image modal in");
  }
  const hold = holdServed();
  let held = false;
  let failing = true;
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES, ...EXTRA_READS]),
    ...serveCorpusProcedures(caller, ["imagery.readProvenance"], () => {
      if (!held) {
        held = true;
        return hold;
      }
      return failing ? trpcError() : undefined;
    }),
  });
  const subject: ImageSubject = {
    assetId: mintTypeId(ID_PREFIX.asset, createSeededIds().next),
    chatId,
    url: "/census-image.png",
    alt: "Census image",
    dims: { w: 64, h: 64 },
  };
  await mount<typeof ImageDetailShellStory>(STORY, { subject });
  const dialog = page.getByRole("dialog");
  await hold.requested;
  await expect(dialog.locator('[aria-busy="true"]')).toBeVisible();
  hold.fail();
  await expect(dialog.getByText("Couldn't load this image's details.", { exact: true })).toBeVisible();
  failing = false;
  await dialog.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(dialog.getByText("No generation details recorded for this image.", { exact: true })).toBeVisible();
});
