// CT: the two OWNER-GATED admin SECTIONS (SET-SEAMS stage 4) — Shared access + Multi-user, mounted together
// as the door renders them. The property under test is the one §4 constrains by PERMISSION rather than by
// reader: ONE owner predicate gates every D17 governance control across BOTH sections (a delegated admin
// sees them disabled instead of bouncing off `requireOwner`), while the admin-writable neighbour
// (`discreetLogin`) stays live — and the Reset each section offers names only the keys that viewer may
// actually clear. Plus P1 patch key-minimality on the writes themselves.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { clearNumber, setNumber } from "../../../../support/node/set-number.ts";
import { GovernanceSectionsStory } from "../_ct-stories.tsx";

const UPDATE_PROC = "settings.updateAppSettings";
const OWNER = { userId: "user_owner", handle: "owner", globalRole: "owner" };
const DELEGATED_ADMIN = { userId: "user_admin", handle: "admin", globalRole: "admin" };

const RESOLVED = {
  allowNonOwnerLocalCompute: true,
  nonOwnerLocalComputeBudget: null,
  allowNonOwnerMaxProSub: false,
  localMultiUser: false,
  discreetLogin: false,
};

function stub(page: Page, viewer: typeof OWNER, overrides: Record<string, unknown> = {}): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "settings.getAppSettingsWithOverrides": () => ({ resolved: RESOLVED, overrides }),
    "sessions.me": () => viewer,
    [UPDATE_PROC]: () => RESOLVED,
  });
}

function lastPartial(trpc: TrpcRecorder): Record<string, unknown> | undefined {
  return (trpc.lastInput(UPDATE_PROC) as { partial?: Record<string, unknown> } | undefined)?.partial;
}

test("both sections stamp their own admin anchors", async ({ mount, page }) => {
  await stub(page, OWNER);
  await mount(<GovernanceSectionsStory />);

  await expect(page.locator("#config-anchor-admin-shared-access")).toBeVisible();
  await expect(page.locator("#config-anchor-admin-multi-user")).toBeVisible();
});

// The ONE predicate, across TWO sections: a delegated admin sees every D17 control disabled — including the
// budget field in one section and the seating switch in the OTHER, which is exactly what a second copy of
// the gate would eventually get wrong.
test("a delegated admin sees every owner-gated control disabled, in BOTH sections", async ({ mount, page }) => {
  await stub(page, DELEGATED_ADMIN);
  await mount(<GovernanceSectionsStory />);

  await expect(page.getByRole("switch", { name: "Members may use shared local compute" })).toBeDisabled();
  await expect(page.getByRole("switch", { name: "Members may use the hosted subscription" })).toBeDisabled();
  await expect(page.getByRole("textbox", { name: "Per-member local-compute budget" })).toBeDisabled();
  await expect(page.getByRole("switch", { name: "Allow multiple humans (local mode)" })).toBeDisabled();
  // The admin-writable neighbour is NOT gated — the predicate is per-KEY, not per-section.
  await expect(page.getByRole("switch", { name: "Discreet login" })).toBeEnabled();
});

test("the owner may drive them, and a toggle patches EXACTLY its own key", async ({ mount, page }) => {
  const trpc = await stub(page, OWNER);
  await mount(<GovernanceSectionsStory />);

  const localCompute = page.getByRole("switch", { name: "Members may use shared local compute" });
  await expect(localCompute).toBeEnabled();
  await localCompute.click();
  await expect.poll(() => lastPartial(trpc), { intervals: [20, 50, 100] }).toStrictEqual({ allowNonOwnerLocalCompute: false });
});

test("the per-member budget saves alone; a blank draft with an override CLEARS it", async ({ mount, page }) => {
  const trpc = await stub(page, OWNER, { nonOwnerLocalComputeBudget: 50 });
  await mount(<GovernanceSectionsStory />);

  await setNumber(page.getByRole("textbox", { name: "Per-member local-compute budget" }), "25");
  await page.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => lastPartial(trpc), { intervals: [20, 50, 100] }).toStrictEqual({ nonOwnerLocalComputeBudget: 25 });

  // Blanking the field is the one per-field clear this section has (its whole-section Reset would also drop
  // the two switches) — an explicit `null` back to the unbounded domain floor.
  await clearNumber(page.getByRole("textbox", { name: "Per-member local-compute budget" }));
  await page.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => lastPartial(trpc), { intervals: [20, 50, 100] }).toStrictEqual({ nonOwnerLocalComputeBudget: null });
});

// Multi-user's Reset is viewer-shaped: an owner clears both keys, a delegated admin only the one they may
// write — a blanket clear would name `localMultiUser` and bounce off `requireOwner` with nothing saved.
test("Multi-user's Reset clears only the keys the viewer may clear — owner", async ({ mount, page }) => {
  const trpc = await stub(page, OWNER, { localMultiUser: true, discreetLogin: true });
  await mount(<GovernanceSectionsStory />);

  await page.locator("#config-anchor-admin-multi-user").getByRole("button", { name: "Reset to defaults" }).click();
  await expect.poll(() => lastPartial(trpc), { intervals: [20, 50, 100] }).toStrictEqual({ localMultiUser: null, discreetLogin: null });
});

test("Multi-user's Reset clears only the keys the viewer may clear — delegated admin", async ({ mount, page }) => {
  const trpc = await stub(page, DELEGATED_ADMIN, { localMultiUser: true, discreetLogin: true });
  await mount(<GovernanceSectionsStory />);

  await page.locator("#config-anchor-admin-multi-user").getByRole("button", { name: "Reset to defaults" }).click();
  await expect.poll(() => lastPartial(trpc), { intervals: [20, 50, 100] }).toStrictEqual({ discreetLogin: null });
});

// A delegated admin can clear NOTHING in Shared access (every key there is owner-gated), so the affordance
// is absent rather than a button that 403s.
test("Shared access offers a delegated admin no Reset at all", async ({ mount, page }) => {
  await stub(page, DELEGATED_ADMIN, { allowNonOwnerMaxProSub: true });
  await mount(<GovernanceSectionsStory />);

  await expect(page.locator("#config-anchor-admin-shared-access").getByRole("button", { name: "Reset to defaults" })).toHaveCount(0);
});
