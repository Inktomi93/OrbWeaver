// @subject packages/client/src/features/imagery/components/image-edit-body.tsx
// The image edit dialog's Back control returns to the detail dialog on the same image.

import type { ImageSubject } from "@orb/client/state";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createSeededIds } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { IMAGE_DETAIL_TITLE, IMAGE_EDIT_BACK_NAME, IMAGE_EDIT_NAME } from "#client/features/imagery/lib/imagine-names.ts";
import type { ImageEditShellStory } from "./_image-edit-stories.tsx";

const READS = [
  "persona.list",
  "notifications.list",
  "plugin.listCommands",
  "databank.bankHealth",
  "rosterPreset.count",
  "connection.list",
  "connection.listBindings",
  "imagery.readProvenance",
] as const;
const STORY = "tests/client/features/imagery/components/_image-edit-stories/ImageEditShellStory";

test("the edit dialog's Back control returns to the image's detail", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const chatId = corpus.reads["chat.listChats"][0]?.output.items[0]?.id;
  if (chatId === undefined) {
    throw new Error("The corpus has no room to open an image modal in");
  }
  await routeTrpc(page, serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES, ...READS]));
  const subject: ImageSubject = {
    assetId: mintTypeId(ID_PREFIX.asset, createSeededIds().next),
    chatId,
    url: "/census-image.png",
    alt: "Census image",
    dims: { w: 64, h: 64 },
  };
  await mount<typeof ImageEditShellStory>(STORY, { subject });
  const edit = page.getByRole("dialog", { name: IMAGE_EDIT_NAME, exact: true });
  const back = edit.getByRole("button", { name: IMAGE_EDIT_BACK_NAME, exact: true });
  await expect(back).toBeEnabled();
  await back.click();
  await expect(page.getByRole("dialog", { name: IMAGE_DETAIL_TITLE, exact: true })).toBeVisible();
  await expect(edit).toHaveCount(0);
});
