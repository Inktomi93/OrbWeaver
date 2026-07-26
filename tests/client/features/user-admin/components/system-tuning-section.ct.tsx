// CT: the System tuning admin SECTION (Phase B ⑩ — system-tuning-section.tsx). Drives the production admin
// path: getAppSettingsWithOverrides seeds the fields (resolved floor + which are overridden), editing + Save
// fires updateAppSettings with the only-moved-fields delta (including the NESTED agentSdkConcurrency +
// engineLaunch paths), and Reset clears every ⑩ override. Asserts the mutation fired with the right patch
// shape (route recorder) — assert-the-mutation-fired, not a UI reaction.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { SystemTuningSectionStory } from "../_ct-stories";

// The resolved slice the section reads (getAppSettingsWithOverrides.resolved) — only the ⑩ fields matter; the
// handler returns are untyped stubs so a partial suffices (the rate-limits CT precedent — no fabricated shape).
const RESOLVED = {
  agentSdkConcurrency: { summarize: 4 },
  promptTransformDeadlineMs: 250,
  nonOwnerLocalComputeBudgetWindowMs: 86_400_000,
  catalogRefreshIntervalMs: 86_400_000,
  imageVariantQuality: 80,
  maxDatabankBytes: 20_971_520,
  engineLaunch: { genPresencePenalty: 1.5 },
};

const UPDATE_PROC = "settings.updateAppSettings";

function stub(page: Page, overrides: Record<string, unknown> = {}): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "settings.getAppSettingsWithOverrides": () => ({ resolved: RESOLVED, overrides }),
    [UPDATE_PROC]: () => RESOLVED,
  });
}

function lastPartial(trpc: TrpcRecorder): Record<string, unknown> | undefined {
  const input = trpc.lastInput(UPDATE_PROC) as { partial?: Record<string, unknown> } | undefined;
  return input?.partial;
}

test("mounts with the resolved floors and shows the default beneath each field", async ({ mount, page }) => {
  await stub(page);
  await mount(<SystemTuningSectionStory />);
  await expect(page.getByRole("spinbutton", { name: "Agent-SDK summarize concurrency" })).toHaveValue("4");
  await expect(page.getByRole("spinbutton", { name: "Image-variant quality (1–100)" })).toHaveValue("80");
  await expect(page.getByRole("spinbutton", { name: "vLLM presence-penalty default" })).toHaveValue("1.5");
});

test("editing a flat field + Save fires updateAppSettings with ONLY the moved nested key", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<SystemTuningSectionStory />);
  await page.getByRole("spinbutton", { name: "Agent-SDK summarize concurrency" }).fill("8");
  await page.getByRole("button", { name: "Save" }).click();
  await expect
    .poll(() => (lastPartial(trpc)?.["agentSdkConcurrency"] as Record<string, unknown> | undefined)?.["summarize"], { intervals: [20, 50, 100] })
    .toBe(8);
  // Untouched knobs are NOT pinned into the override.
  expect(lastPartial(trpc)?.["imageVariantQuality"]).toBeUndefined();
});

test("editing the nested engineLaunch presence penalty + Save patches engineLaunch.genPresencePenalty", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<SystemTuningSectionStory />);
  await page.getByRole("spinbutton", { name: "vLLM presence-penalty default" }).fill("0.3");
  await page.getByRole("button", { name: "Save" }).click();
  await expect
    .poll(() => (lastPartial(trpc)?.["engineLaunch"] as Record<string, unknown> | undefined)?.["genPresencePenalty"], { intervals: [20, 50, 100] })
    .toBe(0.3);
});

test("an active override shows 'Overridden' and Reset clears every ⑩ override to the floor", async ({ mount, page }) => {
  // The stub keeps `resolved` at the floor while `overrides` carries an active value (the rate-limits CT
  // precedent — the section flags the field as overridden off `overrides`, shows the floor off `resolved`).
  const trpc = await stub(page, { imageVariantQuality: 60 });
  await mount(<SystemTuningSectionStory />);
  // Overridden ⇒ the "Overridden. Default: <floor>." copy (floor = the resolved floor, 80 in the stub).
  await expect(page.getByText("Overridden. Default: 80.")).toBeVisible();
  await page.getByRole("button", { name: "Reset to defaults" }).click();
  // The reset clears each ⑩ key: flat keys via top-level null, and the NESTED genPresencePenalty via a LEAF
  // null (a nested `undefined` would be stripped by tRPC's plain-JSON wire → the override would survive its
  // own reset). Assert the ACTUAL fired patch shape (the merge-clear transition-test law).
  await expect.poll(() => lastPartial(trpc)?.["imageVariantQuality"], { intervals: [20, 50, 100] }).toBeNull();
  const patch = lastPartial(trpc);
  expect(patch?.["engineLaunch"]).toEqual({ genPresencePenalty: null }); // leaf-null survives the wire, clears via the recursion
  expect((patch?.["engineLaunch"] as Record<string, unknown>)["genPresencePenalty"]).toBeNull();
});
