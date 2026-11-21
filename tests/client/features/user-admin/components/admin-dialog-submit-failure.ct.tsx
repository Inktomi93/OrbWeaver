// A refused submit in an admin account dialog is said once, inline, and the dialog keeps every value the admin typed.
// @subject packages/client/src/components/form-dialog.tsx

import { MIN_PASSWORD_LENGTH } from "@orb/contracts/identity";
import { brandedId } from "@orb/kit/ids";
import { ALERTS_REGION_NAME, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { userActionsName } from "#client/features/user-admin/lib/admin-model.ts";
import { ADMIN_CREATE_USER_NAME } from "#client/features/user-admin/lib/user-admin-names.ts";
import { ACCOUNT_HANDLE_FIELD_NAME, ACCOUNT_PASSWORD_FIELD_NAME } from "#client/lib/account-field-names.ts";
import type { AdminLinkSsoStory } from "./_admin-link-sso-stories.tsx";
import type { AdminUsersStory } from "./_admin-users-stories.tsx";

const USERS_STORY = "tests/client/features/user-admin/components/_admin-users-stories/AdminUsersStory";
const LINK_STORY = "tests/client/features/user-admin/components/_admin-link-sso-stories/AdminLinkSsoStory";
const MEMBER_HANDLE = brandedId("Handle").parse("refused-member");
const MEMBER_PASSWORD = "member-password-long-enough";
const NEW_PASSWORD = "x".repeat(MIN_PASSWORD_LENGTH + 4);
const SUBJECT = "idp-subject-1234";
const READS = ["sessions.me", "settings.getUserSettings", "admin.listUsers"] as const;

type Harness = Awaited<ReturnType<typeof createServerHarness>>;

async function seedMember(root: Harness): Promise<void> {
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.admin.createUser({ handle: MEMBER_HANDLE, password: MEMBER_PASSWORD });
}

/** The line is the dialog's own alert; the refusal's toast stays off because the dialog declares it shows the failure itself. */
async function expectRefusedInline(page: Page, dialog: Locator): Promise<void> {
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("region", { name: ALERTS_REGION_NAME, exact: true }).getByRole("alert")).toHaveCount(0);
}

test("a refused Create user keeps the handle and the password in the open dialog", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, READS),
    ...serveCorpusProcedures(caller, ["admin.createUser"], () => trpcError()),
  });
  await mount<typeof AdminUsersStory>(USERS_STORY, {});

  await page.getByRole("button", { name: ADMIN_CREATE_USER_NAME, exact: true }).click();
  const dialog = page.getByRole("dialog");
  const handle = dialog.getByRole("textbox", { name: ACCOUNT_HANDLE_FIELD_NAME, exact: true });
  const password = dialog.getByLabel(ACCOUNT_PASSWORD_FIELD_NAME, { exact: true });
  await handle.fill("typed-handle");
  await password.fill(MEMBER_PASSWORD);
  await dialog.getByRole("button", { name: ADMIN_CREATE_USER_NAME, exact: true }).click();

  await expectRefusedInline(page, dialog);
  await expect(handle).toHaveValue("typed-handle");
  await expect(password).toHaveValue(MEMBER_PASSWORD);
});

test("a refused Reset password keeps the new password in the open dialog", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false });
  await seedMember(root);
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, READS),
    ...serveCorpusProcedures(caller, ["admin.resetPassword"], () => trpcError()),
  });
  await mount<typeof AdminUsersStory>(USERS_STORY, {});

  await page.getByRole("button", { name: userActionsName(MEMBER_HANDLE), exact: true }).click();
  await page
    .getByRole("menu")
    .getByRole("menuitem", { name: /^Reset password/u })
    .click();
  const dialog = page.getByRole("dialog");
  const password = dialog.getByLabel("New password", { exact: true });
  await password.fill(NEW_PASSWORD);
  await dialog.getByRole("button", { name: "Reset password", exact: true }).click();

  await expectRefusedInline(page, dialog);
  await expect(password).toHaveValue(NEW_PASSWORD);
});

test("a refused Link identity keeps the typed SSO subject in the open dialog", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false });
  await seedMember(root);
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, READS),
    ...serveCorpusProcedures(caller, ["admin.linkSsoIdentity"], () => trpcError()),
  });
  await mount<typeof AdminLinkSsoStory>(LINK_STORY, {});

  await page.getByRole("button", { name: `Link ${MEMBER_HANDLE}`, exact: true }).click();
  const dialog = page.getByRole("dialog");
  const subject = dialog.getByLabel("Stable SSO subject", { exact: true });
  await subject.fill(SUBJECT);
  await dialog.getByRole("button", { name: "Link identity", exact: true }).click();

  await expectRefusedInline(page, dialog);
  await expect(subject).toHaveValue(SUBJECT);
});
