// CT: the real Admin settings pane (Settings → Admin — the Users + Engines sections over the built
// admin verbs). Drives the PRODUCTION path: `admin.listUsers` + `sessions.me` seed the pane
// (QueryBoundary + suspense); the row controls fire the real mutations (recorded via routeTrpc); the
// owner-only role gate (`setRole` is `requireOwner`) renders DISABLED for a delegated admin; the
// self/owner affordances mirror the server guards; the create / reset-password / sessions
// dialogs submit the real wire inputs.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder, TrpcRoutes } from "../../../../support/ct/route-trpc";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { AdminSettingsStory } from "../_ct-stories";

const OWNER_VIEWER = { userId: "user_owner", handle: "root", globalRole: "owner" };
const ADMIN_VIEWER = { userId: "user_mira", handle: "mira", globalRole: "admin" };

const USERS = [
  {
    id: "user_owner",
    handle: "root",
    externalId: null,
    role: "owner",
    enabled: true,
    kind: "human",
    ownerHandle: null,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  },
  {
    id: "user_mira",
    handle: "mira",
    externalId: null,
    role: "admin",
    enabled: true,
    kind: "human",
    ownerHandle: null,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  },
  {
    id: "user_kes",
    handle: "kes",
    externalId: null,
    role: "user",
    enabled: true,
    kind: "human",
    ownerHandle: null,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  },
];

const ENGINES = {
  embed: { status: "owned", detail: "ok", updatedAt: 1_700_000_000_000, port: 8701, storePath: "/srv/orb/store/models" },
  rerank: { status: "failed", detail: "exited 137", updatedAt: 1_700_000_000_000, port: 8702, storePath: "/srv/orb/store/models" },
};

const ENGINE_DETAIL_RE = /exited 137/u;
// The read-only DEPLOYMENT facts folded into each engine's status subtitle (#14: displayed, never edited).
const ENGINE_PORT_RE = /port 8702/u;
const ENGINE_STORE_PATH_RE = /\/srv\/orb\/store\/models/u;

// The resolved EffectiveAppConfig the engine-launch config editor reads (settings.getAppSettings). Only the
// engineLaunch slice is asserted here; the rest satisfies the shape the surface consumes.
const APP_SETTINGS = {
  engineLaunch: {
    embedModel: "Qwen/Qwen3-VL-Embedding-2B",
    rerankModel: "Qwen/Qwen3-VL-Reranker-2B",
    genModel: "Qwen/Qwen3-VL-8B-Instruct",
    embedMaxModelLen: 8192,
    rerankMaxModelLen: 8192,
    genMaxModelLen: 32_768,
    embedGpuUtil: 0.14,
    rerankGpuUtilMulti: 0.16,
    rerankGpuUtilSingle: 0.22,
    genGpuUtilMulti: 0.28,
    genGpuUtilSingle: 0.5,
    poolingMaxPixels: 1_843_200,
    genMaxPixels: 4_194_304,
  },
};

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

function stub(page: Page, viewer: typeof OWNER_VIEWER, extra: TrpcRoutes = {}): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "admin.listUsers": () => USERS,
    "sessions.me": () => viewer,
    "admin.vllmEngines": () => ENGINES,
    // The engine-launch config editor (rendered inside the Engines section) always fires getAppSettings —
    // it needs a valid stub in the shared bundle or the unlisted-proc default crashes the whole pane.
    "settings.getAppSettings": () => APP_SETTINGS,
    ...extra,
  });
}

test("renders the user table + the engines list", async ({ mount, page }) => {
  await stub(page, OWNER_VIEWER);
  const component = await mount(<AdminSettingsStory />);

  await expect(component.getByText("3 accounts")).toBeVisible();
  await expect(component.getByText("root", { exact: true })).toBeVisible();
  await expect(component.getByText("kes", { exact: true })).toBeVisible();
  // Engines: name + status badge + detail line.
  await expect(component.getByText("embed", { exact: true })).toBeVisible();
  await expect(component.getByText("failed", { exact: true })).toBeVisible();
  await expect(component.getByText(ENGINE_DETAIL_RE)).toBeVisible();
  // The read-only DEPLOYMENT facts (port + store path) render in the status subtitle (#14: displayed, not
  // edited). Assert the actual stubbed values, not mere presence.
  await expect(component.getByText(ENGINE_PORT_RE)).toBeVisible();
  await expect(component.getByText(ENGINE_STORE_PATH_RE).first()).toBeVisible();
});

test("as the owner, changing a member's role fires setRole", async ({ mount, page }) => {
  const trpc = await stub(page, OWNER_VIEWER);
  const component = await mount(<AdminSettingsStory />);

  const roleSelect = component.getByRole("combobox", { name: "Role — kes" });
  await expect(roleSelect).toBeEnabled();
  await roleSelect.click();
  await page.getByRole("option", { name: "Admin" }).click();

  await expect.poll(() => trpc.lastInput("admin.setRole"), { intervals: [20, 50, 100] }).toEqual({ userId: "user_kes", role: "admin" });
});

test("as a delegated admin, the role controls are DISABLED (requireOwner honesty)", async ({ mount, page }) => {
  await stub(page, ADMIN_VIEWER);
  const component = await mount(<AdminSettingsStory />);

  await expect(component.getByRole("combobox", { name: "Role — kes" })).toBeDisabled();
  // The owner row exposes NO role control at all (owner-immutability).
  await expect(component.getByRole("combobox", { name: "Role — root" })).toHaveCount(0);
  // Non-role controls stay live for the delegated admin.
  await expect(component.getByRole("switch", { name: "Enabled — kes" })).toBeEnabled();
});

test("disabling an account is confirm-gated and fires setEnabled(false)", async ({ mount, page }) => {
  const trpc = await stub(page, OWNER_VIEWER);
  const component = await mount(<AdminSettingsStory />);

  await component.getByRole("switch", { name: "Enabled — kes" }).click();
  // Nothing fires until the destructive confirm.
  await expect.poll(() => trpc.count("admin.setEnabled")).toBe(0);
  await page.getByRole("button", { name: "Disable", exact: true }).click();

  await expect.poll(() => trpc.lastInput("admin.setEnabled"), { intervals: [20, 50, 100] }).toEqual({ userId: "user_kes", enabled: false });
});

test("the self + owner guards: no enabled switch on the owner row, own switch disabled", async ({ mount, page }) => {
  await stub(page, ADMIN_VIEWER);
  const component = await mount(<AdminSettingsStory />);

  // The owner row renders no enabled switch (the owner is immutable).
  await expect(component.getByRole("switch", { name: "Enabled — root" })).toHaveCount(0);
  // The acting admin's own row is disabled (cannot_disable_self).
  await expect(component.getByRole("switch", { name: "Enabled — mira" })).toBeDisabled();
});

test("the create-user dialog submits handle + password (+ admin role when picked)", async ({ mount, page }) => {
  const trpc = await stub(page, OWNER_VIEWER, { "admin.createUser": () => USERS[2] });
  const component = await mount(<AdminSettingsStory />);

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
  const trpc = await stub(page, ADMIN_VIEWER, { "admin.createUser": () => USERS[2] });
  const component = await mount(<AdminSettingsStory />);

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
  const component = await mount(<AdminSettingsStory />);

  await component.getByTestId("admin-create-user").click();
  const dialog = page.getByTestId("admin-create-user-dialog");
  await expect(dialog).toBeVisible();

  await dialog.getByRole("combobox", { name: "Role" }).click();
  await expect(page.getByRole("option", { name: "Admin" })).toBeVisible();
});

test("the create-user dialog teaches the password floor instead of submitting", async ({ mount, page }) => {
  const trpc = await stub(page, OWNER_VIEWER);
  const component = await mount(<AdminSettingsStory />);

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
  const component = await mount(<AdminSettingsStory />);

  await component.getByRole("button", { name: "kes actions" }).click();
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
  const component = await mount(<AdminSettingsStory />);

  await component.getByRole("button", { name: "kes actions" }).click();
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
  const component = await mount(<AdminSettingsStory />);

  await component.getByRole("button", { name: "kes actions" }).click();
  await page.getByRole("menuitem", { name: "Sessions…" }).click();
  const dialog = page.getByTestId("admin-sessions-dialog");
  await expect(dialog).toBeVisible();
  await expect.poll(() => trpc.lastInput("admin.listSessions"), { intervals: [20, 50, 100] }).toEqual({ userId: "user_kes" });

  await expect(dialog.getByText("Firefox on Linux")).toBeVisible();
  await expect(dialog.getByText("1 active / 2 total")).toBeVisible();
  // The revoked row has no Revoke affordance; the live one revokes.
  await dialog.getByRole("button", { name: "Revoke session — Firefox on Linux" }).click();
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

test("engines: restart fires restartVllmEngine for THAT engine", async ({ mount, page }) => {
  const trpc = await stub(page, ADMIN_VIEWER, {
    "admin.restartVllmEngine": () => "restart 1/3",
  });
  const component = await mount(<AdminSettingsStory />);

  await component.getByRole("button", { name: "Restart engine — rerank" }).click();
  await expect.poll(() => trpc.lastInput("admin.restartVllmEngine"), { intervals: [20, 50, 100] }).toEqual({ engine: "rerank" });
});

test("launch config: renders the resolved per-engine flags off getAppSettings", async ({ mount, page }) => {
  await stub(page, ADMIN_VIEWER);
  const component = await mount(<AdminSettingsStory />);

  const config = component.getByTestId("engine-launch-config");
  await expect(config).toBeVisible();
  // The gen window + a gpu-util fraction render as the current values (not a bare literal — the resolved config).
  await expect(config.getByTestId("engine-launch-genMaxModelLen")).toHaveValue("32768");
  await expect(config.getByTestId("engine-launch-genGpuUtilMulti")).toHaveValue("0.28");
  await expect(config.getByTestId("engine-launch-genModel")).toHaveValue("Qwen/Qwen3-VL-8B-Instruct");
});

test("launch config: Save fires updateAppSettings with ONLY the moved field, then arms restart-to-apply", async ({ mount, page }) => {
  const trpc = await stub(page, ADMIN_VIEWER, {
    "settings.updateAppSettings": () => APP_SETTINGS,
  });
  const component = await mount(<AdminSettingsStory />);

  const config = component.getByTestId("engine-launch-config");
  const save = config.getByTestId("engine-launch-save");
  // Save is disabled until a field actually moves (no accidental empty override).
  await expect(save).toBeDisabled();

  await config.getByTestId("engine-launch-genMaxModelLen").fill("65536");
  await expect(save).toBeEnabled();
  await save.click();

  // Only the diffed field becomes an override — the untouched fields never leak into the patch.
  await expect
    .poll(() => trpc.lastInput("settings.updateAppSettings"), { intervals: [20, 50, 100] })
    .toEqual({ partial: { engineLaunch: { genMaxModelLen: 65_536 } } });

  // A successful save arms the "restart to apply" banner (the running engines still serve the old flags).
  await expect(config.getByTestId("engine-launch-pending-restart")).toBeVisible();
});

test("launch config: a delegated admin can view + save (admin-gated, not owner-gated)", async ({ mount, page }) => {
  const trpc = await stub(page, ADMIN_VIEWER, { "settings.updateAppSettings": () => APP_SETTINGS });
  const component = await mount(<AdminSettingsStory />);

  const config = component.getByTestId("engine-launch-config");
  await config.getByTestId("engine-launch-embedGpuUtil").fill("0.2");
  await config.getByTestId("engine-launch-save").click();
  await expect
    .poll(() => trpc.lastInput("settings.updateAppSettings"), { intervals: [20, 50, 100] })
    .toEqual({ partial: { engineLaunch: { embedGpuUtil: 0.2 } } });
});
