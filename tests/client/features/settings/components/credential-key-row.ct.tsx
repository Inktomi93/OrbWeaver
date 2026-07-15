// CT: `<CredentialKeyRow>` — the Remove confirm (M5 migration onto ConfirmDialog). Proves the confirm
// gates the remove mutation (cancel fires nothing; confirm fires `credentials.remove` with the row's id).

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { CredentialKeyRowStory } from "../_ct-stories";

test("remove is confirm-gated: cancel fires nothing, confirm fires credentials.remove", async ({
  mount,
  page,
}) => {
  const trpc = await routeTrpc(page, {
    "credentials.remove": () => ({ ok: true }),
  });

  await mount(<CredentialKeyRowStory />);

  await page.getByRole("button", { name: "Remove the prod key key" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Remove "prod key"?');

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  expect(trpc.count("credentials.remove")).toBe(0);

  await page.getByRole("button", { name: "Remove the prod key key" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
  await expect
    .poll(() => trpc.count("credentials.remove"), { intervals: [20, 50, 100] })
    .toBeGreaterThanOrEqual(1);
  expect((trpc.lastInput("credentials.remove") as { credentialId: string }).credentialId).toBe(
    "user_credential_ctstory0001",
  );
});
