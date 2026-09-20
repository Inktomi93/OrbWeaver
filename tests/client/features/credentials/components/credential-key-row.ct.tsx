// CT: `<CredentialKeyRow>` — the Remove confirm (M5 migration onto ConfirmDialog). Proves the confirm
// gates the remove mutation (cancel fires nothing; confirm fires `credentials.remove` with the row's id).

import { expect, test } from "@playwright/experimental-ct-react";
import { testId } from "../../../../../packages/client/src/lib/test-ids.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import {
  CredentialKeyRowStory,
  CustomCredentialKeyRowStory,
  ReasonlessRevokedCredentialKeyRowStory,
  ReusedCredentialKeyRowStory,
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

// THE HEALTH PROBE LEFT THIS ROW (`@orb/inference` cut-over, 2026-09-20). "Saved keys" is the read-only
// REUSE view now (§5.3a): a key is minted inline from the connection form, and a health probe is a property
// of the CONNECTION that dials (`connection.probe`), never of the key alone — there is nothing on a bare
// credential to dial. So the two `credentials.testHealth` specs are DELETED (subject gone) rather than
// re-pointed, and what replaces them pins what the row BECAME: its reuse line, and the absence of the three
// affordances that left (no Test, no Set active, no Add).
test("the row names its provider and how many connections reuse the key", async ({ mount, page }) => {
  await mount(<CustomCredentialKeyRowStory />);

  await expect(page.getByText("custom-openai · used by 0 connections")).toBeVisible();
});

test("the reuse count reads as a SENTENCE at one — a key used by 1 connection never says '1 connections'", async ({ mount, page }) => {
  await mount(<ReusedCredentialKeyRowStory />);

  await expect(page.getByText("openrouter · used by 1 connection")).toBeVisible();
});

// Stated POSITIVELY so a re-add is caught: these three affordances are gone from the ROW on purpose, and a
// row that grew one back would otherwise only be noticed as a surprise in the pane.
test("the row offers no Test, no Set active and no Add — a key is minted from the connection form", async ({ mount, page }) => {
  await mount(<CredentialKeyRowStory />);

  await expect(page.getByRole("button", { name: "Test", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Set active", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add key", exact: true })).toHaveCount(0);
  // …and the affordances that STAYED are still there, so the assertions above are a claim about the row's
  // contents rather than about a row that failed to render at all.
  await expect(page.getByTestId(testId("credentialMarkRevoked"))).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove the prod key key" })).toBeVisible();
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
