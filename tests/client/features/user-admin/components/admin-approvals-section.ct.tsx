// A2 CT: the Approvals SECTION (Settings → Admin → Approvals — the OIDC_REQUIRE_APPROVAL account queue).
// Drives the PRODUCTION path: the section owns its own `admin.listUsers` read, filters it client-side to the
// pending set (disabled, non-owner), renders each with an Approve button, and the Approve fires the real
// `admin.setEnabled({enabled:true})` mutation. The empty state renders when nothing is pending.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder, TrpcRoutes, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcError, trpcHold } from "../../../../support/node/route-trpc.ts";
import { AdminApprovalsSectionStory } from "../_ct-stories.tsx";

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

// A mixed table: the owner (enabled), an enabled user, and TWO disabled accounts (the pending queue).
const USERS = [
  row({ id: "user_owner", handle: "root", role: "owner", enabled: true }),
  row({ id: "user_kes", handle: "kes", role: "user", enabled: true }),
  row({ id: "user_pend1", handle: "newbie", role: "user", enabled: false, externalId: "authentik|newbie" }),
  row({ id: "user_pend2", handle: "pending-admin", role: "admin", enabled: false, externalId: "authentik|pa" }),
];

function stub(page: Page, users: readonly AdminUser[], extra: Partial<TrpcRoutes<"admin.setEnabled">> = {}): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "admin.listUsers": () => users,
    ...extra,
  });
}

test("lists ONLY the pending set (disabled, non-owner) — enabled + owner rows are excluded", async ({ mount, page }) => {
  await stub(page, USERS);
  const component = await mount(<AdminApprovalsSectionStory />);

  await expect(component.getByText("newbie", { exact: true })).toBeVisible();
  await expect(component.getByText("pending-admin", { exact: true })).toBeVisible();
  // The enabled user and the owner are NOT in the approval queue.
  await expect(component.getByText("kes", { exact: true })).toHaveCount(0);
  await expect(component.getByText("root", { exact: true })).toHaveCount(0);
});

test("Approve fires admin.setEnabled({enabled:true}) for that row", async ({ mount, page }) => {
  const trpc = await stub(page, USERS, {
    "admin.setEnabled": () => row({ id: "user_pend1", handle: "newbie", enabled: true, externalId: "authentik|newbie" }),
  });
  const component = await mount(<AdminApprovalsSectionStory />);

  // The first pending row (newbie) — click its Approve.
  await component.getByTestId("admin-approve").first().click();
  await expect.poll(() => trpc.lastInput("admin.setEnabled"), { intervals: [20, 50, 100] }).toEqual({ userId: "user_pend1", enabled: true });
});

test("a same-task repeat admits one approval, owns only its account row, and rejection releases retry", async ({ mount, page }) => {
  const held = trpcHold();
  const trpc = await stub(page, USERS, { "admin.setEnabled": held });
  const component = await mount(<AdminApprovalsSectionStory />);

  const approvals = component.getByTestId("admin-approve");
  const first = approvals.nth(0);
  const sibling = approvals.nth(1);
  await first.evaluate((element) => {
    (element as HTMLElement).click();
    (element as HTMLElement).click();
  });
  await held.requested;

  await expect(first).toBeDisabled();
  await expect(sibling).toBeEnabled();
  await expect.poll(() => trpc.count("admin.setEnabled")).toBe(1);

  held.release(trpcError());
  await expect(first).toBeEnabled();
  await first.click();
  await expect.poll(() => trpc.count("admin.setEnabled")).toBe(2);
});

test("the empty state renders when no account is pending", async ({ mount, page }) => {
  await stub(page, [row({ id: "user_owner", handle: "root", role: "owner", enabled: true }), row({ id: "user_kes", handle: "kes", enabled: true })]);
  const component = await mount(<AdminApprovalsSectionStory />);

  await expect(component.getByTestId("admin-approvals-empty")).toBeVisible();
  await expect(component.getByTestId("admin-approve")).toHaveCount(0);
});
