// CT: the Users SECTION (Settings → Admin → Users — the account table over the built admin verbs). Drives
// the PRODUCTION path: the section owns its own `admin.listUsers` + `sessions.me` read (SET-SEAMS stage 3 —
// it used to ride the retired pane surface's batch) behind its own QueryBoundary; the row controls fire the
// real mutations (recorded via routeTrpc); the owner-only role gate (`setRole` is `requireOwner`) renders
// DISABLED for a delegated admin; the self/owner affordances mirror the server guards; the create /
// reset-password / sessions dialogs submit the real wire inputs.

import { revokeSessionName, userActionsName, userEnabledFieldName, userRoleFieldName } from "@orb/client/features/user-admin";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcInput, TrpcRecorder, TrpcRoutes, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcHold } from "../../../../support/node/route-trpc.ts";
import { AdminUsersSectionStory } from "../_ct-stories.tsx";

const OWNER_VIEWER = { userId: "user_owner", handle: "root", globalRole: "owner" } satisfies TrpcWireOutput<"sessions.me">;
const ADMIN_VIEWER = { userId: "user_mira", handle: "mira", globalRole: "admin" } satisfies TrpcWireOutput<"sessions.me">;
/** The row-name builders take the canonical `Handle` brand (the column they name is `users.handle`), so a
 *  spec subject is MINTED rather than spelled as a bare string. */
const handle = (raw: string): Handle => castId<Handle>(raw);

const USER_OPTION_RE = /^User$/u;

type AdminUser = TrpcWireOutput<"admin.listUsers">[number];
type Viewer = TrpcWireOutput<"sessions.me">;

const OWNER_USER: AdminUser = {
  id: "user_owner",
  handle: "root",
  externalId: null,
  role: "owner",
  enabled: true,
  kind: "human",
  ownerHandle: null,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
};
const ADMIN_USER: AdminUser = {
  id: "user_mira",
  handle: "mira",
  externalId: null,
  role: "admin",
  enabled: true,
  kind: "human",
  ownerHandle: null,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
};
const MEMBER_USER: AdminUser = {
  id: "user_kes",
  handle: "kes",
  externalId: null,
  role: "user",
  enabled: true,
  kind: "human",
  ownerHandle: null,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
};
const USERS: TrpcWireOutput<"admin.listUsers"> = [OWNER_USER, ADMIN_USER, MEMBER_USER];

const SESSIONS = [
  {
    id: "sess_live",
    userId: "user_kes",
    expiresAt: 1_700_009_000_000,
    lastSeenAt: 1_700_000_500_000,
    revokedAt: null,
    userAgent: "Firefox on Linux",
    createdAt: 1_700_000_000_000,
  },
  {
    id: "sess_dead",
    userId: "user_kes",
    expiresAt: 1_700_009_000_000,
    lastSeenAt: 1_700_000_400_000,
    revokedAt: 1_700_000_450_000,
    userAgent: "Safari on iOS",
    createdAt: 1_700_000_000_000,
  },
];

/** Serve the `AdminUserView` a write verb answers with: the ROW the input names, carrying the field the
 *  input asked to change. Falls back to the first row only when the id matches nothing — a shape the surface
 *  cannot produce, kept non-throwing so a wrong-target write reds on the assertion rather than on the stub.
 *
 *  The decoded input uses the procedure's plain JSON wire fields; branded ids have already crossed the
 *  transport boundary and are strings here. */
function applyToUser(input: Pick<TrpcInput<"admin.setRole">, "userId">, change: Partial<AdminUser>): AdminUser {
  const row = USERS.find((user) => user.id === input.userId) ?? OWNER_USER;
  return { ...row, ...change };
}

const ADMIN_EXTRA_PATHS = [
  "admin.createUser",
  "admin.listSessions",
  "admin.resetPassword",
  "admin.revokeSession",
  "admin.revokeUserSessions",
  "admin.setEnabled",
  "admin.setRole",
] as const;
type AdminExtraPath = (typeof ADMIN_EXTRA_PATHS)[number];

function stub(page: Page, viewer: Viewer, extra: Partial<TrpcRoutes<AdminExtraPath>> = {}): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "admin.listUsers": () => USERS,
    "sessions.me": () => viewer,
    // #649 — the row's two WRITE verbs. Both answer an `AdminUserView` (domain/admin/contract/results.ts:8-9),
    // and both were unfed here: every click of a role picker or an enable toggle rode `routeTrpc`'s null, so
    // the mutation's settle/invalidate path ran INERT. INPUT-AWARE rather than a fixed row, so the answer is
    // the user the caller actually named carrying the change they actually asked for — a fixed row would let
    // a wrong-target write pass. A test scripting a refusal lists the key in `extra` and wins.
    "admin.setRole": (input) => applyToUser(input, { role: input.role }),
    "admin.setEnabled": (input) => applyToUser(input, { enabled: input.enabled }),
    ...extra,
  });
}

test.describe("the row actions on a touch screen at 360px", () => {
  test.use({ hasTouch: true, viewport: { width: 360, height: 800 } });

  test("every row's actions trigger is at least 44px on both sides", async ({ mount, page }) => {
    const companion: AdminUser = { ...MEMBER_USER, id: "user_companion", handle: "companion" };
    await routeTrpc(page, {
      "admin.listUsers": () => [...USERS, companion],
      "sessions.me": () => OWNER_VIEWER,
    });
    const component = await mount(<AdminUsersSectionStory />);
    for (const subject of ["root", "mira", "kes", "companion"]) {
      const trigger = component.getByRole("button", { name: userActionsName(handle(subject)), exact: true });
      await expect
        .poll(async () => {
          const box = await trigger.boundingBox();
          return box === null ? 0 : Math.min(box.width, box.height);
        })
        .toBeGreaterThanOrEqual(44);
    }
  });
});

test("renders the user table off its OWN read, anchored at the admin pane's users anchor", async ({ mount, page }) => {
  await stub(page, OWNER_VIEWER);
  const component = await mount(<AdminUsersSectionStory />);

  await expect(component.getByText("3 accounts")).toBeVisible();
  await expect(component.getByText("root", { exact: true })).toBeVisible();
  await expect(component.getByText("kes", { exact: true })).toBeVisible();
  // The section stamps its own anchor now (§7.1 — the id is byte-identical across the move).
  await expect(page.locator("#config-anchor-admin-users")).toBeVisible();
});

test("as the owner, changing a member's role fires setRole", async ({ mount, page }) => {
  const trpc = await stub(page, OWNER_VIEWER);
  const component = await mount(<AdminUsersSectionStory />);

  const roleSelect = component.getByRole("combobox", { name: userRoleFieldName(handle("kes")) });
  await expect(roleSelect).toBeEnabled();
  await roleSelect.click();
  await page.getByRole("option", { name: "Admin" }).click();

  await expect.poll(() => trpc.lastInput("admin.setRole"), { intervals: [20, 50, 100] }).toEqual({ userId: "user_kes", role: "admin" });
});

test("role writes lock only their target row while a sibling remains actionable", async ({ mount, page }) => {
  const held = trpcHold();
  const trpc = await stub(page, OWNER_VIEWER, {
    "admin.setRole": (input) => (input.userId === "user_kes" ? held : applyToUser(input, { role: input.role })),
  });
  const component = await mount(<AdminUsersSectionStory />);
  const kes = component.getByRole("combobox", { name: userRoleFieldName(handle("kes")) });
  const mira = component.getByRole("combobox", { name: userRoleFieldName(handle("mira")) });

  await kes.click();
  await page.getByRole("option", { name: "Admin" }).click();
  await held.requested;
  await expect(kes).toBeDisabled();
  await expect(mira).toBeEnabled();

  await mira.click();
  const userOption = page.locator('[role="listbox"] [role="option"][aria-selected="false"]:not([aria-disabled="true"])').filter({ hasText: USER_OPTION_RE });
  await expect(userOption).toHaveCount(1);
  await userOption.focus();
  await userOption.press("Enter");
  await expect.poll(() => trpc.count("admin.setRole")).toBe(2);
  held.release(applyToUser({ userId: "user_kes" }, { role: "admin" }));
});

test("as a delegated admin, the role controls are DISABLED (requireOwner honesty)", async ({ mount, page }) => {
  await stub(page, ADMIN_VIEWER);
  const component = await mount(<AdminUsersSectionStory />);

  await expect(component.getByRole("combobox", { name: userRoleFieldName(handle("kes")) })).toBeDisabled();
  // The owner row exposes NO role control at all (owner-immutability).
  await expect(component.getByRole("combobox", { name: userRoleFieldName(handle("root")) })).toHaveCount(0);
  // Non-role controls stay live for the delegated admin.
  await expect(component.getByRole("switch", { name: userEnabledFieldName(handle("kes")) })).toBeEnabled();
});

test("disabling an account is confirm-gated and fires setEnabled(false)", async ({ mount, page }) => {
  const trpc = await stub(page, OWNER_VIEWER);
  const component = await mount(<AdminUsersSectionStory />);

  await component.getByRole("switch", { name: userEnabledFieldName(handle("kes")) }).click();
  // Nothing fires until the destructive confirm.
  await expect.poll(() => trpc.count("admin.setEnabled")).toBe(0);
  await page.getByRole("button", { name: "Disable", exact: true }).click();

  await expect.poll(() => trpc.lastInput("admin.setEnabled"), { intervals: [20, 50, 100] }).toEqual({ userId: "user_kes", enabled: false });
});

test("the self + owner guards: no enabled switch on the owner row, own switch disabled", async ({ mount, page }) => {
  await stub(page, ADMIN_VIEWER);
  const component = await mount(<AdminUsersSectionStory />);

  // The owner row renders no enabled switch (the owner is immutable).
  await expect(component.getByRole("switch", { name: userEnabledFieldName(handle("root")) })).toHaveCount(0);
  // The acting admin's own row is disabled (cannot_disable_self) — the viewer identity comes from the
  // section's own sessions.me read now.
  await expect(component.getByRole("switch", { name: userEnabledFieldName(handle("mira")) })).toBeDisabled();
});

test("the create-user dialog submits handle + password (+ admin role when picked)", async ({ mount, page }) => {
  const trpc = await stub(page, OWNER_VIEWER, { "admin.createUser": () => MEMBER_USER });
  const component = await mount(<AdminUsersSectionStory />);

  await component.getByTestId("admin-create-user").click();
  const dialog = page.getByTestId("admin-create-user-dialog");
  await expect(dialog).toBeVisible();

  await dialog.getByRole("textbox", { name: "Handle" }).fill("nova");
  await dialog.getByLabel("Password").fill("hunter2hunter2");
  await dialog.getByRole("combobox", { name: "Role" }).click();
  await page.getByRole("option", { name: "Admin" }).click();
  await page.getByTestId("admin-create-user-submit").click();

  await expect
    .poll(() => trpc.lastInput("admin.createUser"), { intervals: [20, 50, 100] })
    .toEqual({ handle: "nova", password: "hunter2hunter2", role: "admin" });
  // Success closes the dialog.
  await expect(dialog).toHaveCount(0);
});

test("as a delegated admin, the create-user dialog offers NO Admin role (owner-only mint honesty)", async ({ mount, page }) => {
  const trpc = await stub(page, ADMIN_VIEWER, { "admin.createUser": () => MEMBER_USER });
  const component = await mount(<AdminUsersSectionStory />);

  await component.getByTestId("admin-create-user").click();
  const dialog = page.getByTestId("admin-create-user-dialog");
  await expect(dialog).toBeVisible();

  // No Role picker at all — `createUser` gates role:"admin" on requireOwner, so a delegated admin can
  // only mint regular users. The affordance that would 403 is never offered.
  await expect(dialog.getByRole("combobox", { name: "Role" })).toHaveCount(0);

  // The plain-user create still works, and never sends role:"admin".
  await dialog.getByRole("textbox", { name: "Handle" }).fill("nova");
  await dialog.getByLabel("Password").fill("hunter2hunter2");
  await page.getByTestId("admin-create-user-submit").click();

  await expect.poll(() => trpc.lastInput("admin.createUser"), { intervals: [20, 50, 100] }).toEqual({ handle: "nova", password: "hunter2hunter2" });
});

test("as the owner, the create-user dialog DOES offer the Admin role", async ({ mount, page }) => {
  await stub(page, OWNER_VIEWER);
  const component = await mount(<AdminUsersSectionStory />);

  await component.getByTestId("admin-create-user").click();
  const dialog = page.getByTestId("admin-create-user-dialog");
  await expect(dialog).toBeVisible();

  await dialog.getByRole("combobox", { name: "Role" }).click();
  await expect(page.getByRole("option", { name: "Admin" })).toBeVisible();
});

test("the create-user dialog teaches the password floor instead of submitting", async ({ mount, page }) => {
  const trpc = await stub(page, OWNER_VIEWER);
  const component = await mount(<AdminUsersSectionStory />);

  await component.getByTestId("admin-create-user").click();
  const dialog = page.getByTestId("admin-create-user-dialog");
  await dialog.getByRole("textbox", { name: "Handle" }).fill("nova");
  await dialog.getByLabel("Password").fill("short");
  await page.getByTestId("admin-create-user-submit").click();

  // `exact` — the password field's DESCRIPTION also starts with this copy; the exact match is the
  // field-error slot the failed validator populated.
  await expect(dialog.getByText("At least 8 characters.", { exact: true })).toBeVisible();
  await expect.poll(() => trpc.count("admin.createUser")).toBe(0);
});

test("reset password: the row menu opens the dialog and submits the new password", async ({ mount, page }) => {
  const trpc = await stub(page, OWNER_VIEWER, { "admin.resetPassword": () => ({ ok: true }) });
  const component = await mount(<AdminUsersSectionStory />);

  await component.getByRole("button", { name: userActionsName(handle("kes")) }).click();
  await page.getByRole("menuitem", { name: "Reset password…" }).click();
  const dialog = page.getByTestId("admin-reset-password-dialog");
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("New password").fill("correct-horse-9");
  await page.getByTestId("admin-reset-password-submit").click();

  await expect.poll(() => trpc.lastInput("admin.resetPassword"), { intervals: [20, 50, 100] }).toEqual({ userId: "user_kes", password: "correct-horse-9" });
  await expect(dialog).toHaveCount(0);
});

test("reset password: submit is clickable, and a too-short password shows an inline error", async ({ mount, page }) => {
  const trpc = await stub(page, OWNER_VIEWER, { "admin.resetPassword": () => ({ ok: true }) });
  const component = await mount(<AdminUsersSectionStory />);

  await component.getByRole("button", { name: userActionsName(handle("kes")) }).click();
  await page.getByRole("menuitem", { name: "Reset password…" }).click();
  const dialog = page.getByTestId("admin-reset-password-dialog");
  const submit = page.getByTestId("admin-reset-password-submit");
  await expect(submit).toBeEnabled();

  await dialog.getByLabel("New password").fill("short");
  await submit.click();

  await expect(dialog.getByText("Password must be at least 8 characters.")).toBeVisible();
  await expect.poll(() => trpc.count("admin.resetPassword")).toBe(0);
});

test("sessions: the dialog lists sessions and revokes one / all", async ({ mount, page }) => {
  const trpc = await stub(page, OWNER_VIEWER, {
    "admin.listSessions": () => SESSIONS,
    "admin.revokeSession": () => ({ ok: true }),
    "admin.revokeUserSessions": () => ({ revoked: 1 }),
  });
  const component = await mount(<AdminUsersSectionStory />);

  await component.getByRole("button", { name: userActionsName(handle("kes")) }).click();
  await page.getByRole("menuitem", { name: "Sessions…" }).click();
  const dialog = page.getByTestId("admin-sessions-dialog");
  await expect(dialog).toBeVisible();
  await expect.poll(() => trpc.lastInput("admin.listSessions"), { intervals: [20, 50, 100] }).toEqual({ userId: "user_kes" });

  await expect(dialog.getByText("Firefox on Linux")).toBeVisible();
  await expect(dialog.getByText("1 active / 2 total")).toBeVisible();
  // The revoked row has no Revoke affordance; the live one revokes.
  await dialog.getByRole("button", { name: revokeSessionName("Firefox on Linux") }).click();
  await expect.poll(() => trpc.lastInput("admin.revokeSession"), { intervals: [20, 50, 100] }).toEqual({ sessionId: "sess_live" });

  // Revoke-all is confirm-gated: the nested ConfirmDialog (forceRender, since it opens on top of the
  // already-open sessions Dialog) renders OVER the parent — both the parent `dialog` and the nested
  // `alertdialog` are visible at once.
  await dialog.getByRole("button", { name: "Revoke all" }).click();
  await expect.poll(() => trpc.count("admin.revokeUserSessions")).toBe(0);
  const confirm = page.getByRole("alertdialog");
  await expect(confirm.getByText("Revoke all sessions?")).toBeVisible();
  await expect(dialog).toBeVisible();

  // Cancel is a no-op — the mutation never fires and the parent dialog is unaffected.
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toHaveCount(0);
  await expect.poll(() => trpc.count("admin.revokeUserSessions")).toBe(0);
  await expect(dialog).toBeVisible();

  // Confirming fires the real revoke-all mutation for this user.
  await dialog.getByRole("button", { name: "Revoke all" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Revoke all" }).click();
  await expect.poll(() => trpc.lastInput("admin.revokeUserSessions"), { intervals: [20, 50, 100] }).toEqual({ userId: "user_kes" });
});
