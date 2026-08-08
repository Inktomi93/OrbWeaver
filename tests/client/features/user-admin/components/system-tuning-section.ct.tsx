// CT: the System tuning admin SECTION (Phase B ⑩ — system-tuning-section.tsx). Drives the production admin
// path: getAppSettingsWithOverrides seeds the fields (resolved floor + which are overridden), editing + Save
// fires updateAppSettings with the only-moved-fields delta (including the NESTED agentSdkConcurrency +
// engineLaunch paths), and Reset clears every ⑩ override. Asserts the mutation fired with the right patch
// shape (route recorder) — assert-the-mutation-fired, not a UI reaction.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { setNumber } from "../../../../support/ct/set-number.ts";
import { SystemTuningSectionStory } from "../_ct-stories.tsx";

// The resolved slice the section reads (getAppSettingsWithOverrides.resolved) — only the ⑩ fields matter; the
// handler returns are untyped stubs so a partial suffices (the rate-limits CT precedent — no fabricated shape).
const RESOLVED = {
  agentSdkConcurrency: { summarize: 4 },
  promptTransformDeadlineMs: 250,
  nonOwnerLocalComputeBudgetWindowMs: 86_400_000,
  catalogRefreshIntervalMs: 86_400_000,
  imageVariantQuality: 80,
  maxDatabankBytes: 20_971_520,
  promptCacheMinDepth: 0,
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
  await expect(page.getByRole("textbox", { name: "Agent-SDK summarize concurrency" })).toHaveValue("4");
  await expect(page.getByRole("textbox", { name: "Image-variant quality (1–100)" })).toHaveValue("80");
  await expect(page.getByRole("textbox", { name: "vLLM presence-penalty default" })).toHaveValue("1.5");
  // The prompt-cache depth floor (findings §5). Its shipped floor 0 is the identity of the `Math.max` the
  // server applies, so a virgin deployment renders "0" and every wire body is byte-identical to pre-knob.
  await expect(page.getByRole("textbox", { name: "Prompt-cache depth floor (0–20)" })).toHaveValue("0");
});

// The D126 teaching-copy rider: the clamp is the ONE thing about this knob that surprises a reader (the
// number they type is not necessarily the depth in use), and a hover-only `hint` cannot carry it.
test("the prompt-cache clamp is ALWAYS-VISIBLE copy, not a hover-only hint", async ({ mount, page }) => {
  await stub(page);
  await mount(<SystemTuningSectionStory />);
  await expect(page.getByText(/only ever moves the cache breakpoint DEEPER/)).toBeVisible();
});

test("editing the prompt-cache depth floor + Save patches promptCacheMinDepth alone", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<SystemTuningSectionStory />);
  await setNumber(page.getByRole("textbox", { name: "Prompt-cache depth floor (0–20)" }), "2");
  await page.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => lastPartial(trpc)?.["promptCacheMinDepth"], { intervals: [20, 50, 100] }).toBe(2);
  expect(lastPartial(trpc)?.["imageVariantQuality"]).toBeUndefined();
});

test("editing a flat field + Save fires updateAppSettings with ONLY the moved nested key", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<SystemTuningSectionStory />);
  await setNumber(page.getByRole("textbox", { name: "Agent-SDK summarize concurrency" }), "8");
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
  await setNumber(page.getByRole("textbox", { name: "vLLM presence-penalty default" }), "0.3");
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
  // Overridden ⇒ the row stops naming a default: `resolved` is floor ⊕ override on the real read, so the
  // stub's floor-shaped 80 is exactly the number a live pane could NOT recover (SET-SEAMS §4). It points at
  // Reset, the affordance that puts the knob back on the floor.
  await expect(page.getByText("Overridden. Reset to fall back to this deployment's default.")).toBeVisible();
  await page.getByRole("button", { name: "Reset to defaults" }).click();
  // The reset clears each ⑩ key: flat keys via top-level null, and the NESTED genPresencePenalty via a LEAF
  // null (a nested `undefined` would be stripped by tRPC's plain-JSON wire → the override would survive its
  // own reset). Assert the ACTUAL fired patch shape (the merge-clear transition-test law).
  await expect.poll(() => lastPartial(trpc)?.["imageVariantQuality"], { intervals: [20, 50, 100] }).toBeNull();
  // The new ⑩ key must ride the SAME reset — an owned key missing from `onReset` is an override with no way
  // back to the floor (SET-SEAMS stage 4).
  expect(lastPartial(trpc)?.["promptCacheMinDepth"]).toBeNull();
  const patch = lastPartial(trpc);
  expect(patch?.["engineLaunch"]).toEqual({ genPresencePenalty: null }); // leaf-null survives the wire, clears via the recursion
  expect((patch?.["engineLaunch"] as Record<string, unknown>)["genPresencePenalty"]).toBeNull();
});
