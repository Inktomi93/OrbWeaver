// CT: the host-only world book picker owns its attach until the durable mutation settles. A held response
// makes pending stable; same-tick repeat dispatch proves the handler guard, and a held rejection proves
// the dialog remains visible with a retry path instead of closing on an uncommitted intent.

import type { WorldBookId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcError, trpcHold } from "../../../../support/node/route-trpc.ts";
import { AddChatBookDialogStory } from "../_ct-stories.tsx";

const BOOK = {
  id: castId<WorldBookId>("worldbook_ct_0000000000001"),
  name: "Ashfall Almanac",
  description: "Lore for the eastern wastes",
  createdAt: 1_750_000_000_000,
} satisfies TrpcWireOutput<"worldInfo.listBooks">[number];

test("the picker owns a held attach, ignores a same-tick repeat, and closes only after success", async ({ mount, page }) => {
  const hold = trpcHold();
  const trpc = await routeTrpc(page, {
    "worldInfo.listBooks": () => [BOOK],
    "worldInfo.attachToChat": hold,
  });
  const dialog = await mount(<AddChatBookDialogStory />);
  const attach = page.getByRole("button", { name: "Attach Ashfall Almanac to this chat" });

  await attach.evaluate((button) => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await hold.requested;

  await expect(attach).toBeDisabled();
  await expect(dialog.getByTestId("book-picker-closes")).toHaveText("0");
  await expect.poll(() => trpc.count("worldInfo.attachToChat")).toBe(1);

  hold.release(null);
  await expect(dialog.getByTestId("book-picker-closes")).toHaveText("1");
});

test("a rejected attach stays visible and retryable, then closes after the retry succeeds", async ({ mount, page }) => {
  const rejected = trpcHold();
  const retry = trpcHold();
  let attempts = 0;
  await routeTrpc(page, {
    "worldInfo.listBooks": () => [BOOK],
    "worldInfo.attachToChat": () => (attempts++ === 0 ? rejected : retry),
  });
  const dialog = await mount(<AddChatBookDialogStory />);
  const attach = page.getByRole("button", { name: "Attach Ashfall Almanac to this chat" });

  await attach.click();
  await rejected.requested;
  rejected.release(trpcError());

  await expect(page.getByRole("alert")).toContainText("Couldn't attach the world book to this chat.");
  await expect(attach).toBeEnabled();
  await expect(dialog.getByTestId("book-picker-closes")).toHaveText("0");

  await attach.click();
  await retry.requested;
  retry.release(null);
  await expect(dialog.getByTestId("book-picker-closes")).toHaveText("1");
});
