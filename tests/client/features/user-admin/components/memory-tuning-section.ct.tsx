// CT: the Memory tuning admin SECTION (Phase B ③ — memory-tuning-section.tsx). Drives the production admin
// path: getAppSettingsWithOverrides seeds the knobs (floor ⊕ override), the mode enum writes immediately,
// numeric knobs batch a Save (memoryDefaults MERGE), the summarizer maxTokens saves separately
// (memorySummarizer), and Reset clears a whole nested override. Asserts the write fired with the right
// section/patch shape (route recorder).

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { setNumber } from "../../../../support/ct/set-number.ts";
import { MemoryTuningSectionNarrowStory, MemoryTuningSectionStory } from "../_ct-stories.tsx";

// The section reads its knob VALUES from `overrides` (⊕ the contract floors), not `resolved` — so a plain
// partial resolved slice suffices (routeTrpc stubs are untyped; the admin-surface CT's APP_SETTINGS
// precedent — no cast, no fabricated whole-shape).
const RESOLVED = { memoryDefaults: {}, memorySummarizer: {} };

const UPDATE_PROC = "settings.updateAppSettings";
const RAW_MODE_LABEL = /\b(?:mixA|mixB|mixC|tiered)\b/u;
const SEARCH_CANDIDATES_GUIDANCE =
  "Matches kept after vector search. Higher values give Sharper semantic recall more choices but make reranking compare more memories; when reranking succeeds, Reranked memories still caps what reaches the prompt. If reranking is unavailable—or Semantic recall is selected—more candidates can use more prompt space. Embedding and vector-search work stay the same.";

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

const MODE_GUIDANCE = [
  ["Off", "Recalls no long-term memory. Fastest and uses no memory-model calls."],
  ["Chronological recall", "Recalls stored scenes in time order. No search-model calls, but it is less selective."],
  ["Semantic recall", "Finds stored scenes related to the current conversation. Costs one embedding search per recall."],
  [
    "Sharper semantic recall",
    "Re-sorts related scenes with the rerank model for sharper recall. Costs an extra model call; if reranking is unavailable, vector order is used.",
  ],
  ["Story arcs", "Recalls older scenes as consolidated story arcs. Covers more history with less scene-level detail."],
] as const;

test("mounts on the grounded floor with a human mode label (blockSize 8, sharper semantic recall, summarize max tokens 1024)", async ({ mount, page }) => {
  await stub(page);
  await mount(<MemoryTuningSectionStory />);
  await expect(page.getByRole("textbox", { name: "Block size" })).toHaveValue("8");
  await expect(page.getByRole("textbox", { name: "Summarize max tokens" })).toHaveValue("1,024");
  await expect(page.getByRole("combobox", { name: "Retrieval mode" })).toContainText("Sharper semantic recall");
  await expect(page.getByText("Using the deployment default: Sharper semantic recall.")).toBeVisible();
});

test("all five modes teach benefit + cost in the open picker, with clean accessible names and no raw enum leak", async ({ mount, page }) => {
  await stub(page);
  await mount(<MemoryTuningSectionStory />);
  const combo = page.getByRole("combobox", { name: "Retrieval mode" });
  await combo.click();

  await Promise.all(
    MODE_GUIDANCE.map(async ([label, description]) => {
      const option = page.getByRole("option", { name: label, exact: true });
      await expect(option).toBeVisible();
      const gloss = option.locator('[data-slot="select-item-description"]');
      await expect(gloss).toHaveText(description);
      const glossId = await gloss.getAttribute("id");
      await expect(option).toHaveAttribute("aria-describedby", glossId ?? "");
    }),
  );
  await expect(page.getByText(RAW_MODE_LABEL)).toHaveCount(0);
});

test("the recency control states its experimental order-only behavior and zero default truth", async ({ mount, page }) => {
  await stub(page);
  await mount(<MemoryTuningSectionStory />);

  const info = page.getByRole("button", { name: "More info about Recency bias" });
  await info.hover();
  const copy = "Experimental: changes only candidate order before the recall limit. 0 leaves semantic ordering unchanged.";
  await expect(page.getByText(copy)).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Recency bias" })).toHaveValue("0");
});

test("search candidates states the mode-dependent rerank and prompt costs without claiming extra vector-search work", async ({ mount, page }) => {
  await stub(page);
  await mount(<MemoryTuningSectionStory />);

  await page.getByRole("button", { name: "More info about Search candidates" }).hover();
  await expect(page.getByText(SEARCH_CANDIDATES_GUIDANCE)).toBeVisible();
});

test("the mode picker is fully keyboard-selectable and writes the underlying enum", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<MemoryTuningSectionStory />);
  const combo = page.getByRole("combobox", { name: "Retrieval mode" });

  await combo.focus();
  await combo.press("Enter");
  const current = page.getByRole("option", { name: "Sharper semantic recall", exact: true });
  await expect(current).toBeFocused();
  await current.press("ArrowDown");
  const storyArcs = page.getByRole("option", { name: "Story arcs", exact: true });
  await expect(storyArcs).toBeFocused();
  await storyArcs.press("Enter");

  await expect(combo).toHaveAttribute("aria-expanded", "false");
  await expect
    .poll(() => (lastPartial(trpc)?.["memoryDefaults"] as Record<string, unknown> | undefined)?.["mode"], { intervals: [20, 50, 100] })
    .toBe("tiered");
});

test("editing a numeric knob + Save fires updateAppSettings with the memoryDefaults delta", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<MemoryTuningSectionStory />);
  await setNumber(page.getByRole("textbox", { name: "Block size" }), "12");
  // The first Save button is the memoryDefaults section's.
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect.poll(() => (lastPartial(trpc)?.["memoryDefaults"] as Record<string, unknown> | undefined)?.["blockSize"], { intervals: [20, 50, 100] }).toBe(12);
});

test("an out-of-range knob is CLAMPED to a schema-valid value, never sent raw (no silent-wipe)", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<MemoryTuningSectionStory />);
  // minScore is bounded 0..1; typing 5 must clamp to 1 (a raw 5 would fail the inner schema → the whole
  // memoryDefaults `.catch(undefined)` would silently wipe every override).
  await setNumber(page.getByRole("textbox", { name: "Minimum match" }), "5");
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect.poll(() => (lastPartial(trpc)?.["memoryDefaults"] as Record<string, unknown> | undefined)?.["minScore"], { intervals: [20, 50, 100] }).toBe(1);
});

test("a non-integer count knob is rounded to an integer before send (no silent-wipe)", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<MemoryTuningSectionStory />);
  // blockSize is integer-only; 8.7 must round to 9 (a raw 8.7 would fail `.int()` → wipe).
  await setNumber(page.getByRole("textbox", { name: "Block size" }), "8.7");
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect.poll(() => (lastPartial(trpc)?.["memoryDefaults"] as Record<string, unknown> | undefined)?.["blockSize"], { intervals: [20, 50, 100] }).toBe(9);
});

test("summarize max tokens saves as a memorySummarizer override", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<MemoryTuningSectionStory />);
  await setNumber(page.getByRole("textbox", { name: "Summarize max tokens" }), "2048");
  await page.getByRole("button", { name: "Save" }).last().click();
  await expect
    .poll(() => (lastPartial(trpc)?.["memorySummarizer"] as Record<string, unknown> | undefined)?.["maxTokens"], { intervals: [20, 50, 100] })
    .toBe(2048);
});

test("a memoryDefaults override shows 'Overridden' and Reset clears the whole memoryDefaults override", async ({ mount, page }) => {
  const trpc = await stub(page, { memoryDefaults: { blockSize: 12 } });
  await mount(<MemoryTuningSectionStory />);
  await expect(page.getByRole("textbox", { name: "Block size" })).toHaveValue("12");
  await expect(page.getByText("Overridden. Default: 8.")).toBeVisible();
  // The first Reset button belongs to the memoryDefaults section.
  await page.getByRole("button", { name: "Reset to defaults" }).first().click();
  await expect.poll(() => lastPartial(trpc)?.["memoryDefaults"], { intervals: [20, 50, 100] }).toBeNull();
});

test.describe("coarse pointer containment", () => {
  test.use({ hasTouch: true, viewport: { width: 430, height: 900 } });

  test("the narrow picker and its glossed popup stay inside the viewport with a touch-size trigger", async ({ mount, page }) => {
    await stub(page);
    await mount(<MemoryTuningSectionNarrowStory />);
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches), "the coarse-only geometry arm must be active").toBe(true);

    const combo = page.getByRole("combobox", { name: "Retrieval mode" });
    const triggerBox = await combo.boundingBox();
    expect(triggerBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    await combo.click();

    const popup = page.locator('[data-slot="select-popup"]');
    await expect(popup).toBeVisible();
    const bounds = await popup.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, viewport: window.innerWidth, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
    });
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(bounds.viewport);
    expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth);
  });
});
