// CT: the bulk-message SELECTION bar (ux-flow-revamp J6). Behavior, not chrome: the bar renders ONLY while
// the real `message-selection` store's mode is active (null otherwise); the count tracks the live selected
// set; Delete opens a hard-cascade confirm (AlertDialog, never an undo toast); confirming fires ONE
// `chat.deleteMessages` with the WHOLE selected id set and, on success, leaves select mode (the bar
// disappears). The store is exercised through the harness's in-page controls (it lives in the browser),
// so this drives the real enter/toggle path, not a test double.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError } from "../../../../support/node/route-trpc.ts";
import { MessageSelectionBarStory } from "../_ct-stories.tsx";

const DELETE_PROC = "chat.deleteMessages";
const BAR = '[data-slot="selection-bar-root"]';
const COUNT = '[data-slot="selection-bar-count"]';

test("renders nothing while select mode is off (render-when-active contract)", async ({ mount }) => {
  const component = await mount(<MessageSelectionBarStory />);
  await expect(component.locator(BAR)).toHaveCount(0);
});

test("entering select mode shows the bar; toggling ids tracks the live count", async ({ mount }) => {
  const component = await mount(<MessageSelectionBarStory />);
  await component.getByTestId("ctl-enter").click();

  await expect(component.locator(BAR)).toBeVisible();
  await expect(component.locator(COUNT)).toHaveText("0 selected");

  await component.getByTestId("ctl-toggle-a").click();
  await expect(component.locator(COUNT)).toHaveText("1 selected");
  await component.getByTestId("ctl-toggle-b").click();
  await expect(component.locator(COUNT)).toHaveText("2 selected");

  // Toggling A off decrements — presence IS selection.
  await component.getByTestId("ctl-toggle-a").click();
  await expect(component.locator(COUNT)).toHaveText("1 selected");
});

test("Delete is disabled with an empty selection", async ({ mount }) => {
  const component = await mount(<MessageSelectionBarStory />);
  await component.getByTestId("ctl-enter").click();
  await expect(component.getByRole("button", { name: "Delete" })).toBeDisabled();
});

test("Delete → confirm fires ONE chat.deleteMessages with the whole selected set, then leaves select mode", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { [DELETE_PROC]: () => ({ ok: true }) });
  const component = await mount(<MessageSelectionBarStory />);

  await component.getByTestId("ctl-enter").click();
  await component.getByTestId("ctl-toggle-a").click();
  await component.getByTestId("ctl-toggle-b").click();
  await expect(component.locator(COUNT)).toHaveText("2 selected");

  await component.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Delete 2 selected");
  await dialog.getByRole("button", { name: "Delete" }).click();

  await expect.poll(() => trpc.count(DELETE_PROC), { intervals: [20, 50, 100] }).toBe(1);
  await expect
    .poll(() => trpc.lastInput(DELETE_PROC))
    .toMatchObject({
      chatId: "chat_ct_keystone",
      messageIds: ["msg_ct_sel_a", "msg_ct_sel_b"],
    });
  // Success leaves select mode → the bar unmounts.
  await expect(component.locator(BAR)).toHaveCount(0);
});

test("a failed delete stays in select mode for retry (the bar survives, selection intact)", async ({ mount, page }) => {
  await routeTrpc(page, { [DELETE_PROC]: () => trpcError({ code: "INTERNAL_SERVER_ERROR" }) });
  const component = await mount(<MessageSelectionBarStory />);

  await component.getByTestId("ctl-enter").click();
  await component.getByTestId("ctl-toggle-a").click();
  await component.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();

  // The mutation rejected — the catch keeps select mode: the bar is still up with the selection held.
  await expect(component.locator(BAR)).toBeVisible();
  await expect(component.locator(COUNT)).toHaveText("1 selected");
});

test("the bar's own clear (X) cancels select mode", async ({ mount }) => {
  const component = await mount(<MessageSelectionBarStory />);
  await component.getByTestId("ctl-enter").click();
  await component.getByTestId("ctl-toggle-a").click();
  await expect(component.locator(BAR)).toBeVisible();

  await component.getByRole("button", { name: "Clear selection" }).click();
  await expect(component.locator(BAR)).toHaveCount(0);
});
