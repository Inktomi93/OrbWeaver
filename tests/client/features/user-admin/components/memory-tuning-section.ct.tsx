// CT: the Memory tuning admin SECTION (Phase B ③ — memory-tuning-section.tsx). Drives the production admin
// path: getAppSettingsWithOverrides seeds the knobs (floor ⊕ override), the mode enum writes immediately,
// numeric knobs batch a Save (memoryDefaults MERGE), the summarizer maxTokens saves separately
// (memorySummarizer), and Reset clears a whole nested override. Asserts the write fired with the right
// section/patch shape (route recorder).

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { MemoryTuningSectionStory } from "../_ct-stories";

// The section reads its knob VALUES from `overrides` (⊕ the contract floors), not `resolved` — so a plain
// partial resolved slice suffices (routeTrpc stubs are untyped; the admin-surface CT's APP_SETTINGS
// precedent — no cast, no fabricated whole-shape).
const RESOLVED = { memoryDefaults: {}, memorySummarizer: {} };

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

test("mounts on the grounded floor (blockSize 8, retrieval mode mixC, summarize max tokens 1024)", async ({ mount, page }) => {
  await stub(page);
  await mount(<MemoryTuningSectionStory />);
  await expect(page.getByRole("spinbutton", { name: "Block size" })).toHaveValue("8");
  await expect(page.getByRole("spinbutton", { name: "Summarize max tokens" })).toHaveValue("1024");
  await expect(page.getByRole("combobox", { name: "Retrieval mode" })).toContainText("mixC");
});

test("editing a numeric knob + Save fires updateAppSettings with the memoryDefaults delta", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<MemoryTuningSectionStory />);
  await page.getByRole("spinbutton", { name: "Block size" }).fill("12");
  // The first Save button is the memoryDefaults section's.
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect.poll(() => (lastPartial(trpc)?.["memoryDefaults"] as Record<string, unknown> | undefined)?.["blockSize"], { intervals: [20, 50, 100] }).toBe(12);
});

test("an out-of-range knob is CLAMPED to a schema-valid value, never sent raw (no silent-wipe)", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<MemoryTuningSectionStory />);
  // minScore is bounded 0..1; typing 5 must clamp to 1 (a raw 5 would fail the inner schema → the whole
  // memoryDefaults `.catch(undefined)` would silently wipe every override).
  await page.getByRole("spinbutton", { name: "Min score" }).fill("5");
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect.poll(() => (lastPartial(trpc)?.["memoryDefaults"] as Record<string, unknown> | undefined)?.["minScore"], { intervals: [20, 50, 100] }).toBe(1);
});

test("a non-integer count knob is rounded to an integer before send (no silent-wipe)", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<MemoryTuningSectionStory />);
  // blockSize is integer-only; 8.7 must round to 9 (a raw 8.7 would fail `.int()` → wipe).
  await page.getByRole("spinbutton", { name: "Block size" }).fill("8.7");
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect.poll(() => (lastPartial(trpc)?.["memoryDefaults"] as Record<string, unknown> | undefined)?.["blockSize"], { intervals: [20, 50, 100] }).toBe(9);
});

test("summarize max tokens saves as a memorySummarizer override", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<MemoryTuningSectionStory />);
  await page.getByRole("spinbutton", { name: "Summarize max tokens" }).fill("2048");
  await page.getByRole("button", { name: "Save" }).last().click();
  await expect
    .poll(() => (lastPartial(trpc)?.["memorySummarizer"] as Record<string, unknown> | undefined)?.["maxTokens"], { intervals: [20, 50, 100] })
    .toBe(2048);
});

test("a memoryDefaults override shows 'Overridden' and Reset clears the whole memoryDefaults override", async ({ mount, page }) => {
  const trpc = await stub(page, { memoryDefaults: { blockSize: 12 } });
  await mount(<MemoryTuningSectionStory />);
  await expect(page.getByRole("spinbutton", { name: "Block size" })).toHaveValue("12");
  await expect(page.getByText("Overridden. Default: 8.")).toBeVisible();
  // The first Reset button belongs to the memoryDefaults section.
  await page.getByRole("button", { name: "Reset to defaults" }).first().click();
  await expect.poll(() => lastPartial(trpc)?.["memoryDefaults"], { intervals: [20, 50, 100] }).toBeNull();
});
