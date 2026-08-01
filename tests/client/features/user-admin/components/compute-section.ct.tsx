// CT: the Compute admin SECTION (SET-SEAMS stage 4) — the vLLM runner fan-out. The interesting property
// here is the NESTED key: the section owns `vllmConcurrency` WHOLE, so a save must carry the moved leaf
// merged over the stored override (never a bare leaf that drops its sibling), and Reset is the merge-safe
// top-level `null`.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { clearNumber, setNumber } from "../../../../support/ct/set-number";
import { ComputeSectionStory } from "../_ct-stories";

const UPDATE_PROC = "settings.updateAppSettings";
const RESOLVED = { vllmConcurrency: { embed: 4, summarize: 2 } };

function stub(page: Page, overrides: Record<string, unknown> = {}): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "settings.getAppSettingsWithOverrides": () => ({ resolved: RESOLVED, overrides }),
    [UPDATE_PROC]: () => RESOLVED,
  });
}

function lastPartial(trpc: TrpcRecorder): Record<string, unknown> | undefined {
  return (trpc.lastInput(UPDATE_PROC) as { partial?: Record<string, unknown> } | undefined)?.partial;
}

test("mounts on the resolved leaves and stamps its own admin anchor", async ({ mount, page }) => {
  await stub(page);
  await mount(<ComputeSectionStory />);

  await expect(page.getByRole("textbox", { name: "Embedding concurrency" })).toHaveValue("4");
  await expect(page.getByRole("textbox", { name: "Summarize concurrency" })).toHaveValue("2");
  await expect(page.locator("#settings-anchor-admin-compute")).toBeVisible();
});

// P1 — key-minimality at the LEAF level: only the moved leaf is written, and no key outside
// `vllmConcurrency` appears at all.
test("editing one leaf + Save patches only vllmConcurrency, only that leaf", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<ComputeSectionStory />);

  await setNumber(page.getByRole("textbox", { name: "Embedding concurrency" }), "8");
  await page.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => lastPartial(trpc), { intervals: [20, 50, 100] }).toStrictEqual({ vllmConcurrency: { embed: 8 } });
});

// The stored override survives a save that moves its SIBLING leaf — the delta merges over `overrides`, so a
// separately-tuned summarize concurrency isn't dropped by an embed edit.
test("a save merges over the stored override instead of replacing it", async ({ mount, page }) => {
  const trpc = await stub(page, { vllmConcurrency: { summarize: 6 } });
  await mount(<ComputeSectionStory />);

  await setNumber(page.getByRole("textbox", { name: "Embedding concurrency" }), "8");
  await page.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => lastPartial(trpc), { intervals: [20, 50, 100] }).toStrictEqual({ vllmConcurrency: { summarize: 6, embed: 8 } });
});

test("an overridden leaf shows Reset, which clears the whole nested key", async ({ mount, page }) => {
  const trpc = await stub(page, { vllmConcurrency: { embed: 9 } });
  await mount(<ComputeSectionStory />);

  await page.getByRole("button", { name: "Reset to defaults" }).click();
  await expect.poll(() => lastPartial(trpc), { intervals: [20, 50, 100] }).toStrictEqual({ vllmConcurrency: null });
});

// A below-floor value never reaches the write path — the schema would drop it and trip
// `vllmConcurrency`'s `.catch(undefined)`, silently wiping BOTH leaves. The NumberField clamps to `min` on
// blur (`f88954f8`) and the section's own guard re-checks, so what ships is the floor, never the raw 0.
test("a below-floor entry is CLAMPED to the floor, never sent raw (no silent-wipe)", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<ComputeSectionStory />);

  const embed = page.getByRole("textbox", { name: "Embedding concurrency" });
  await setNumber(embed, "0");
  await expect(embed).toHaveValue("1");
  await page.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => lastPartial(trpc), { intervals: [20, 50, 100] }).toStrictEqual({ vllmConcurrency: { embed: 1 } });
});

// A BLANK draft is "nothing typed", not 0 — the section's guard keeps Save disabled rather than letting an
// empty field mean a value.
test("a blank draft leaves Save disabled", async ({ mount, page }) => {
  await stub(page);
  await mount(<ComputeSectionStory />);

  await clearNumber(page.getByRole("textbox", { name: "Embedding concurrency" }));
  await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
});
