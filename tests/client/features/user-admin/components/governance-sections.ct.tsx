// CT: the OWNER-GATED admin section (SET-SEAMS stage 4) — Multi-user, mounted as the door renders it. The
// property under test is the one §4 constrains by PERMISSION rather than by reader: ONE owner predicate gates
// the D17 governance control (a delegated admin sees it disabled instead of bouncing off `requireOwner`),
// while the admin-writable neighbour (`discreetLogin`) stays live — and the Reset the section offers names
// only the keys that viewer may actually clear. Plus P1 patch key-minimality on the writes themselves.
//
// SHARED ACCESS IS GONE (`@orb/inference` cut-over, 2026-09-20). Its three keys —
// `allowNonOwnerLocalCompute`, `nonOwnerLocalComputeBudget`, `allowNonOwnerMaxProSub` — left `AppSettings`
// with the in-server vLLM fleet and the owner-compute premise (there is no box-owned compute to share any
// more; a connection is the member's own). The specs that drove that section are DELETED rather than
// re-pointed: their subject does not exist. What survives is the claim this module was written for — ONE
// module-private `useIsBoxOwner()` predicate, per-KEY rather than per-section.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { GovernanceSectionsStory } from "../_ct-stories.tsx";

const UPDATE_PROC = "settings.updateAppSettings";
const OWNER = { userId: "user_owner", handle: "owner", globalRole: "owner" };
const DELEGATED_ADMIN = { userId: "user_admin", handle: "admin", globalRole: "admin" };

const RESOLVED = {
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

test("the section stamps its own admin anchor", async ({ mount, page }) => {
  await stub(page, OWNER);
  await mount(<GovernanceSectionsStory />);

  await expect(page.locator("#config-anchor-admin-multi-user")).toBeVisible();
});

// The ONE predicate, per KEY: a delegated admin sees the D17 seating switch disabled while the
// admin-writable login posture beside it stays live — which is exactly what a section-wide gate would get
// wrong, and what a gate copied per control would eventually drift on.
test("a delegated admin sees the owner-gated control disabled, and only that one", async ({ mount, page }) => {
  await stub(page, DELEGATED_ADMIN);
  await mount(<GovernanceSectionsStory />);

  await expect(page.getByRole("switch", { name: "Allow multiple humans (local mode)" })).toBeDisabled();
  // The admin-writable neighbour is NOT gated — the predicate is per-KEY, not per-section.
  await expect(page.getByRole("switch", { name: "Discreet login" })).toBeEnabled();
});

test("the owner may drive it, and a toggle patches EXACTLY its own key", async ({ mount, page }) => {
  const trpc = await stub(page, OWNER);
  await mount(<GovernanceSectionsStory />);

  const seating = page.getByRole("switch", { name: "Allow multiple humans (local mode)" });
  await expect(seating).toBeEnabled();
  await seating.click();
  await expect.poll(() => lastPartial(trpc), { intervals: [20, 50, 100] }).toStrictEqual({ localMultiUser: true });
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
