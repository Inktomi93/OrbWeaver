// CT: `<CredentialKeyRow>` — the Remove confirm (M5 migration onto ConfirmDialog). Proves the confirm
// gates the remove mutation (cancel fires nothing; confirm fires `credentials.remove` with the row's id).

import { expect, test } from "@playwright/experimental-ct-react";
import { testId } from "../../../../../packages/client/src/lib/test-ids";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { CredentialKeyRowStory, RevokedCredentialKeyRowStory } from "../_ct-stories";

test("remove is confirm-gated: cancel fires nothing, confirm fires credentials.remove", async ({ mount, page }) => {
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
  await expect.poll(() => trpc.count("credentials.remove")).toBe(0);

  await page.getByRole("button", { name: "Remove the prod key key" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
  await expect.poll(() => trpc.count("credentials.remove"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  await expect.poll(() => (trpc.lastInput("credentials.remove") as { credentialId: string }).credentialId).toBe("user_credential_ctstory0001");
});

test("mark-revoked is confirm-gated: cancel fires nothing, confirm fires credentials.markRevokedByUser", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "credentials.markRevokedByUser": () => null,
  });

  await mount(<CredentialKeyRowStory />);

  await page.getByTestId(testId("credentialMarkRevoked")).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Mark "prod key" revoked?');

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  // ONESHOT-OK: the code path completed (the barrier asserted web-first above), so this 'never fired' count is settled.
  expect(trpc.count("credentials.markRevokedByUser")).toBe(0);

  await page.getByTestId(testId("credentialMarkRevoked")).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Mark revoked" }).click();
  await expect.poll(() => trpc.count("credentials.markRevokedByUser"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  // ONESHOT-OK: settled — the matching count was polled to its target above, so lastInput is the settled last call.
  expect((trpc.lastInput("credentials.markRevokedByUser") as { credentialId: string }).credentialId).toBe("user_credential_ctstory0001");
});

test("a revoked row's clear-revoked fires credentials.clearRevoked directly", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "credentials.clearRevoked": () => null,
  });

  await mount(<RevokedCredentialKeyRowStory />);

  await page.getByTestId(testId("credentialClearRevoked")).click();
  await expect.poll(() => trpc.count("credentials.clearRevoked"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  // ONESHOT-OK: settled — the matching count was polled to its target above, so lastInput is the settled last call.
  expect((trpc.lastInput("credentials.clearRevoked") as { credentialId: string }).credentialId).toBe("user_credential_ctstory0003");
});
