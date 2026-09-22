// CT: the OWNER-GATED admin section (SET-SEAMS stage 4) — Multi-user, mounted as the door renders it. The
// property under test is the one §4 constrains by PERMISSION rather than by reader: ONE owner predicate gates
// the D17 governance controls (a delegated admin sees them disabled instead of bouncing off `requireOwner`),
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
import type { TrpcRecorder, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { GovernanceSectionsStory } from "../_ct-stories.tsx";
import type { EffectiveAppSettings } from "../app-settings-fixtures.ts";
import { appSettingsView, effectiveAppSettings } from "../app-settings-fixtures.ts";

const UPDATE_PROC = "settings.updateAppSettings";

type AppSettingsOverrides = TrpcWireOutput<"settings.getAppSettingsWithOverrides">["overrides"];

const OWNER = { userId: "user_owner", handle: "owner", globalRole: "owner" } satisfies TrpcWireOutput<"sessions.me">;
const DELEGATED_ADMIN = { userId: "user_admin", handle: "admin", globalRole: "admin" } satisfies TrpcWireOutput<"sessions.me">;

const RESOLVED: Partial<EffectiveAppSettings> = {
  localMultiUser: false,
  discreetLogin: false,
  privateEndpointAllowlist: ["127.0.0.1", "::1"],
};

function stub(
  page: Page,
  viewer: TrpcWireOutput<"sessions.me">,
  overrides: Partial<AppSettingsOverrides> = {},
  resolved: typeof RESOLVED = RESOLVED,
): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "settings.getAppSettingsWithOverrides": () => appSettingsView(resolved, overrides),
    "sessions.me": () => viewer,
    [UPDATE_PROC]: () => effectiveAppSettings(RESOLVED),
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
test("a delegated admin sees both owner-gated controls disabled, while the admin-writable control stays live", async ({ mount, page }) => {
  await stub(page, DELEGATED_ADMIN);
  await mount(<GovernanceSectionsStory />);

  await expect(page.getByRole("switch", { name: "Allow multiple humans (local mode)" })).toBeDisabled();
  await expect(page.getByRole("textbox", { name: "Allowed private endpoints" })).toBeDisabled();
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

test("the owner saves the complete private-endpoint list as one sparse override", async ({ mount, page }) => {
  const trpc = await stub(page, OWNER);
  await mount(<GovernanceSectionsStory />);

  const allowlist = page.getByRole("textbox", { name: "Allowed private endpoints" });
  await expect(allowlist).toHaveValue("127.0.0.1\n::1");
  // Entry syntax belongs to the server belt. The client preserves a CIDR+port typo in the submitted list
  // so one bad line cannot make the `.catch(undefined)` contract drop the operator's whole override.
  await allowlist.fill("  ollama.lan:11434\n10.0.0.0/8\n10.0.0.0/8:443\n\n[::1]:8703  ");
  await page.getByRole("button", { name: "Save" }).click();
  await expect
    .poll(() => lastPartial(trpc), { intervals: [20, 50, 100] })
    .toStrictEqual({
      privateEndpointAllowlist: ["ollama.lan:11434", "10.0.0.0/8", "10.0.0.0/8:443", "[::1]:8703"],
    });
});

test("the owner can save an explicitly empty private-endpoint list without resetting the override", async ({ mount, page }) => {
  const trpc = await stub(page, OWNER);
  await mount(<GovernanceSectionsStory />);

  await page.getByRole("textbox", { name: "Allowed private endpoints" }).fill("");
  await page.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => lastPartial(trpc), { intervals: [20, 50, 100] }).toStrictEqual({ privateEndpointAllowlist: [] });
});

// Multi-user's Reset is viewer-shaped: an owner clears all three keys, a delegated admin only the one they may
// write — a blanket clear would name `localMultiUser` and bounce off `requireOwner` with nothing saved.
test("Multi-user's Reset clears only the keys the viewer may clear — owner", async ({ mount, page }) => {
  const trpc = await stub(
    page,
    OWNER,
    { localMultiUser: true, discreetLogin: true, privateEndpointAllowlist: ["ollama.lan:11434"] },
    { ...RESOLVED, privateEndpointAllowlist: ["ollama.lan:11434"] },
  );
  await mount(<GovernanceSectionsStory />);

  await page.locator("#config-anchor-admin-multi-user").getByRole("button", { name: "Reset to defaults" }).click();
  await expect
    .poll(() => lastPartial(trpc), { intervals: [20, 50, 100] })
    .toStrictEqual({
      localMultiUser: null,
      discreetLogin: null,
      privateEndpointAllowlist: null,
    });
  await expect(page.getByRole("textbox", { name: "Allowed private endpoints" })).toHaveValue("127.0.0.1\n::1");
});

test("Multi-user's Reset clears only the keys the viewer may clear — delegated admin", async ({ mount, page }) => {
  const trpc = await stub(page, DELEGATED_ADMIN, { localMultiUser: true, discreetLogin: true, privateEndpointAllowlist: ["ollama.lan:11434"] });
  await mount(<GovernanceSectionsStory />);

  await page.locator("#config-anchor-admin-multi-user").getByRole("button", { name: "Reset to defaults" }).click();
  await expect.poll(() => lastPartial(trpc), { intervals: [20, 50, 100] }).toStrictEqual({ discreetLogin: null });
});
