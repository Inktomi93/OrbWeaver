// B5 CT: the Link-SSO SECTION (Settings → Admin → Link SSO identity — the db-surgery-free mode-switch
// migration). Drives the PRODUCTION path: the section owns its own `admin.listUsers` read, filters it
// client-side to the LINKABLE set (unbound = externalId null, non-owner, human), renders each with a Link
// button, and the dialog's submit fires the real `admin.linkSsoIdentity` mutation with the entered subject.
// The empty state renders when nothing is linkable.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder, TrpcRoutes, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { AdminLinkSsoSectionStory } from "../_ct-stories.tsx";

const T = 1_700_000_000_000;
type AdminUser = TrpcWireOutput<"admin.listUsers">[number];

const row = (over: Partial<AdminUser>): AdminUser => ({
  id: "user_x",
  handle: "x",
  externalId: null,
  role: "user",
  enabled: true,
  kind: "human",
  ownerHandle: null,
  createdAt: T,
  updatedAt: T,
  ...over,
});

// A mixed table: the owner (unbound but owner → excluded), a bound user (has externalId → excluded), and
// TWO unbound non-owner accounts (the linkable set).
const USERS = [
  row({ id: "user_owner", handle: "root", role: "owner" }),
  row({ id: "user_bound", handle: "bound", role: "user", externalId: "authentik|bound" }),
  row({ id: "user_local1", handle: "alice", role: "user" }),
  row({ id: "user_local2", handle: "bob", role: "admin" }),
];

function stub(page: Page, users: readonly AdminUser[], extra: Partial<TrpcRoutes<"admin.linkSsoIdentity">> = {}): Promise<TrpcRecorder> {
  return routeTrpc(page, { "admin.listUsers": () => users, ...extra });
}

test("lists ONLY the linkable set (unbound, non-owner) — the owner + already-bound rows are excluded", async ({ mount, page }) => {
  await stub(page, USERS);
  const component = await mount(<AdminLinkSsoSectionStory />);

  await expect(component.getByText("alice", { exact: true })).toBeVisible();
  await expect(component.getByText("bob", { exact: true })).toBeVisible();
  await expect(component.getByText("root", { exact: true })).toHaveCount(0);
  await expect(component.getByText("bound", { exact: true })).toHaveCount(0);
});

test("Link opens the dialog and submitting fires admin.linkSsoIdentity with the entered subject", async ({ mount, page }) => {
  const trpc = await stub(page, USERS, { "admin.linkSsoIdentity": () => row({ id: "user_local1", handle: "alice", externalId: "authentik|alice" }) });
  const component = await mount(<AdminLinkSsoSectionStory />);

  await component.getByTestId("admin-link-sso").first().click();
  await expect(page.getByTestId("admin-link-sso-dialog")).toBeVisible();
  await page.getByTestId("admin-link-sso-subject").fill("authentik|alice");
  await page.getByTestId("admin-link-sso-submit").click();
  await expect
    .poll(() => trpc.lastInput("admin.linkSsoIdentity"), { intervals: [20, 50, 100] })
    .toEqual({ userId: "user_local1", externalId: "authentik|alice" });
});

test("the empty state renders when nothing is linkable (every non-owner account already bound)", async ({ mount, page }) => {
  await stub(page, [row({ id: "user_owner", handle: "root", role: "owner" }), row({ id: "user_bound", handle: "bound", externalId: "authentik|bound" })]);
  const component = await mount(<AdminLinkSsoSectionStory />);

  await expect(component.getByTestId("admin-link-sso-empty")).toBeVisible();
  await expect(component.getByTestId("admin-link-sso")).toHaveCount(0);
});
