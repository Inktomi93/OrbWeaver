// CT: the Memory tuning admin SECTION (Phase B ③ — memory-tuning-section.tsx). Drives the production admin
// path: getAppSettingsWithOverrides seeds the knobs (floor ⊕ override), the mode enum writes immediately,
// numeric knobs batch a Save (memoryDefaults MERGE), the summarizer maxTokens saves separately
// (memorySummarizer), and Reset clears a whole nested override. Asserts the write fired with the right
// section/patch shape (route recorder).

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { setNumber } from "../../../../support/node/set-number.ts";
import { MemoryTuningSectionNarrowStory, MemoryTuningSectionStory } from "../_ct-stories.tsx";
import type { EffectiveAppSettings } from "../app-settings-fixtures.ts";
import { appSettingsView, effectiveAppSettings } from "../app-settings-fixtures.ts";

// The section reads its knob VALUES from `overrides` (⊕ the contract floors), not `resolved` — so a plain
// partial resolved slice suffices (routeTrpc stubs are untyped; the admin-surface CT's APP_SETTINGS
// precedent — no cast, no fabricated whole-shape).
const RESOLVED: Partial<EffectiveAppSettings> = { memoryDefaults: {}, memorySummarizer: {} };

const UPDATE_PROC = "settings.updateAppSettings";

type AppSettingsOverrides = TrpcWireOutput<"settings.getAppSettingsWithOverrides">["overrides"];

const RAW_MODE_LABEL = /\b(?:mixA|mixB|mixC|tiered)\b/u;
const SEARCH_CANDIDATES_GUIDANCE =
  "Matches kept after vector search. Higher values give Sharper semantic recall more choices but make reranking compare more memories; when reranking succeeds, Reranked memories still caps what reaches the prompt. If reranking is unavailable—or Semantic recall is selected—more candidates can use more prompt space. Embedding and vector-search work stay the same.";

function stub(page: Page, overrides: Partial<AppSettingsOverrides> = {}): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "settings.getAppSettingsWithOverrides": () => appSettingsView(RESOLVED, overrides),
    [UPDATE_PROC]: () => effectiveAppSettings(RESOLVED),
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

// docs/work/0122: the "Recency bias" control was REMOVED (owner ruling — his probe measured no recall
// gain), so the test that pinned its experimental-copy honesty went with it. The fence that replaces it is
// negative: the retired control must not come back without its ruling.
test("the retired Recency bias control is absent from the section (#321)", async ({ mount, page }) => {
  await stub(page);
  await mount(<MemoryTuningSectionStory />);

  // Positive control FIRST — prove the section actually rendered its knobs, so the absence below is a
  // measurement rather than a blank mount reading as a pass.
  await expect(page.getByRole("textbox", { name: "Minimum match" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Recency bias" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "More info about Recency bias" })).toHaveCount(0);
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

const COARSE_VIEWPORT_WIDTHS = [430, 390, 320] as const;

test.describe("coarse pointer containment", () => {
  test.use({ hasTouch: true, viewport: { width: 430, height: 900 } });

  for (const width of COARSE_VIEWPORT_WIDTHS) {
    test(`the narrow picker and its glossed popup stay inside a ${width}px viewport with a touch-size trigger`, async ({ mount, page }) => {
      await page.setViewportSize({ width, height: 900 });
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
      await expect
        .poll(
          async () =>
            (
              await popup.evaluate((element) => {
                const rect = element.getBoundingClientRect();
                return { left: rect.left, right: rect.right, viewport: window.innerWidth, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
              })
            ).left,
        )
        .toBeGreaterThanOrEqual(0);
      await expect
        .poll(
          async () =>
            (
              await popup.evaluate((element) => {
                const rect = element.getBoundingClientRect();
                return { left: rect.left, right: rect.right, viewport: window.innerWidth, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
              })
            ).right,
        )
        .toBeLessThanOrEqual(bounds.viewport);
      await expect
        .poll(
          async () =>
            (
              await popup.evaluate((element) => {
                const rect = element.getBoundingClientRect();
                return { left: rect.left, right: rect.right, viewport: window.innerWidth, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
              })
            ).scrollWidth,
        )
        .toBeLessThanOrEqual(bounds.clientWidth);
    });

    test(`the mode and keyword hint buttons plus keyword switch are separate touch-size controls at ${width}px`, async ({ mount, page }) => {
      await page.setViewportSize({ width, height: 900 });
      await stub(page);
      await mount(<MemoryTuningSectionNarrowStory />);
      expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches), "the coarse-only geometry arm must be active").toBe(true);

      const controls = [
        page.getByRole("button", { name: "More info about Retrieval mode" }),
        page.getByRole("button", { name: "More info about Keyword match" }),
        page.getByRole("switch", { name: "Keyword match" }),
      ];
      const boxes = await Promise.all(
        controls.map(async (control) => {
          await expect(control).toBeVisible();
          const box = await control.boundingBox();
          expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
          expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
          expect(
            await control.evaluate((element) => {
              const rect = element.getBoundingClientRect();
              const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
              return hit === element || (hit !== null && element.contains(hit));
            }),
            "the centre of each visible box belongs to that control",
          ).toBe(true);
          return box;
        }),
      );
      const overlaps = boxes.flatMap((a, left) =>
        boxes
          .slice(left + 1)
          .filter((b) => a !== null && b !== null && a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y),
      );
      expect(overlaps, "coarse targets do not overlap each other").toEqual([]);
    });
  }
});
