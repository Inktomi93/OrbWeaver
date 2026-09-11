// CT: `<CredentialKeyRow>` — the Remove confirm (M5 migration onto ConfirmDialog). Proves the confirm
// gates the remove mutation (cancel fires nothing; confirm fires `credentials.remove` with the row's id).

import { expect, test } from "@playwright/experimental-ct-react";
import { testId } from "../../../../../packages/client/src/lib/test-ids.ts";
import { routeTrpc, trpcError } from "../../../../support/node/route-trpc.ts";
import {
  CredentialKeyRowStory,
  CustomCredentialKeyRowStory,
  ReasonlessRevokedCredentialKeyRowStory,
  RevokedCredentialKeyRowStory,
  UnreachableRevokedCredentialKeyRowStory,
  UserRevokedCredentialKeyRowStory,
} from "../_ct-stories.tsx";

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
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the code path completed (the barrier asserted web-first above), so this 'never fired' count is settled.
  expect(trpc.count("credentials.markRevokedByUser")).toBe(0);

  await page.getByTestId(testId("credentialMarkRevoked")).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Mark revoked" }).click();
  await expect.poll(() => trpc.count("credentials.markRevokedByUser"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): settled — the matching count was polled to its target above, so lastInput is the settled last call.
  expect((trpc.lastInput("credentials.markRevokedByUser") as { credentialId: string }).credentialId).toBe("user_credential_ctstory0001");
});

test("a custom_openai row's Test button fires the honest credentials.testHealth probe, never fetchModels", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "credentials.testHealth": () => ({ status: "ok", checkedAt: 0 }),
  });

  await mount(<CustomCredentialKeyRowStory />);

  await page.getByRole("button", { name: "Test", exact: true }).click();
  await expect.poll(() => trpc.lastInput("credentials.testHealth"), { intervals: [20, 50, 100] }).toEqual({ credentialId: "user_credential_ctstory0002" });
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the code path completed (testHealth's input was polled to arrival above), so this 'never fired' fetchModels count is settled (#SID-01/#9 — the reachability shortcut is retired).
  expect(trpc.count("credentials.fetchModels")).toBe(0);
  await expect(page.getByText("ok", { exact: true })).toBeVisible();
});

test("a rejected health probe keeps an explicit error and retry affordance", async ({ mount, page }) => {
  let attempts = 0;
  const trpc = await routeTrpc(page, {
    "credentials.testHealth": () => {
      attempts += 1;
      return trpcError({ message: "provider unavailable" });
    },
  });

  await mount(<CredentialKeyRowStory />);
  await page.getByRole("button", { name: "Test", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Test failed");
  await page.getByRole("button", { name: "Retry" }).click();
  await expect.poll(() => trpc.count("credentials.testHealth"), { intervals: [20, 50, 100] }).toBe(2);
  expect(attempts).toBe(2);
});

// #1373 — WHY the key is revoked, not just THAT it is. The bare Revoked chip could not tell a key the
// provider rejected from one the owner revoked, and the two want opposite actions: paste a new key, versus
// press Clear revoked. The copy is derived from the closed `CRED_REVOKED_REASONS` member — it never echoes
// anything the provider or the user's own endpoint said, so it cannot become a key-disclosure surface the
// way a reflected response body can.
// One arm per test, deliberately: a second `mount()` in the same test APPENDS to the CT root rather than
// replacing it, so a shared-test version of this would have the previous arm's copy still on the page and
// every "must not say" assertion would be measuring the wrong row.
test("the AUTO-revoked row names the provider's rejection (the strike-out's user-visible half)", async ({ mount, page }) => {
  await mount(<RevokedCredentialKeyRowStory />);
  await expect(page.getByText("Revoked — the provider rejected this key")).toBeVisible();
});

test("the USER-revoked row says so, and does NOT blame the provider", async ({ mount, page }) => {
  // Claiming a rejection here would send someone to rotate a key that is fine.
  await mount(<UserRevokedCredentialKeyRowStory />);
  await expect(page.getByText("Revoked by you")).toBeVisible();
  await expect(page.getByText("the provider rejected this key")).toBeHidden();
});

test("the UNREACHABLE row says the endpoint went quiet — nothing judged the key", async ({ mount, page }) => {
  // Saying "rejected" when nothing ever answered is the same lie the honest `unchecked` health status exists
  // to prevent, and it would cost the user a working key.
  await mount(<UnreachableRevokedCredentialKeyRowStory />);
  await expect(page.getByText("Revoked — the endpoint stopped responding")).toBeVisible();
  await expect(page.getByText("the provider rejected this key")).toBeHidden();
});

test("a revoked row with NO recorded reason shows the chip and guesses no cause", async ({ mount, page }) => {
  await mount(<ReasonlessRevokedCredentialKeyRowStory />);
  await expect(page.getByText("Revoked", { exact: true })).toBeVisible();
  await expect(page.getByText("Revoked —")).toBeHidden();
  await expect(page.getByText("Revoked by you")).toBeHidden();
});

test("a revoked row's clear-revoked fires credentials.clearRevoked directly", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "credentials.clearRevoked": () => null,
  });

  await mount(<RevokedCredentialKeyRowStory />);

  await page.getByTestId(testId("credentialClearRevoked")).click();
  await expect.poll(() => trpc.count("credentials.clearRevoked"), { intervals: [20, 50, 100] }).toBeGreaterThanOrEqual(1);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): settled — the matching count was polled to its target above, so lastInput is the settled last call.
  expect((trpc.lastInput("credentials.clearRevoked") as { credentialId: string }).credentialId).toBe("user_credential_ctstory0003");
});
