// CT: the Settings → Connections model picker's LIST surface — the two fidelity findings
// (docs/design/context-panel-fidelity-findings.md §3). MP-1: the catalog renders as per-provider
// CommandGroups (headings + honest membership), fuzzy search still reaches every group, and the render cap
// is spent across groups with a truthful "+N more" tail. MP-2: the curated cold-cache shortlist announces
// itself instead of silently swapping the menu contents. Selection is asserted on the committed value the
// story mirrors (`model-picker-value`) — the picker is controlled, so that IS the fired mutation.

import { expect, test } from "@playwright/experimental-ct-react";
import type { ComponentProps } from "react";
import type { ModelPicker } from "../../../../../packages/client/src/features/credentials/components/model-picker";
import { ModelPickerStory } from "../_ct-stories";

type PickerResult = ComponentProps<typeof ModelPicker>["result"];

const ITEM = '[data-slot="command-item"]';
const HEADING = '[data-slot="command-group-heading"]';

function catalogResult(models: readonly { id: string; label: string }[]): PickerResult {
  return {
    state: "ok",
    models: models.map((m) => ({ ...m, origin: "catalog" as const })),
    fetchedAt: 1_700_000_000_000,
    defaultModelId: "openrouter/auto",
    allowsFreeText: false,
  };
}

/** `count` models per vendor, ids `<vendor>/m<i>` — the OR catalog's `vendor/model` id shape. */
function vendorModels(vendors: readonly string[], count: number): readonly { id: string; label: string }[] {
  return vendors.flatMap((vendor) => Array.from({ length: count }, (_, i) => ({ id: `${vendor}/m${i}`, label: `${vendor} model ${i}` })));
}

test("groups the catalog by provider — a heading per vendor, majors first, rows under their own vendor", async ({ mount, page }) => {
  await mount(<ModelPickerStory source="openrouter" result={catalogResult(vendorModels(["zebra-labs", "openai", "anthropic"], 2))} />);
  await page.getByRole("button", { name: "Chat model" }).click();

  await expect(page.locator(HEADING)).toHaveText(["Anthropic", "OpenAI", "Zebra Labs"]);

  const groups = page.locator('[data-slot="command-group"]');
  await expect(groups.nth(0).locator(ITEM)).toContainText(["anthropic model 0", "anthropic model 1"]);
  await expect(groups.nth(2).locator(ITEM)).toContainText(["zebra-labs model 0", "zebra-labs model 1"]);
});

test("fuzzy search reaches every group, not just the first — and hoists the typed row to the top", async ({ mount, page }) => {
  await mount(<ModelPickerStory source="openrouter" result={catalogResult(vendorModels(["anthropic", "openai", "zebra-labs"], 3))} />);
  await page.getByRole("button", { name: "Chat model" }).click();

  await page.getByPlaceholder("Search models…").fill("zebra-labs/m2");

  await expect(page.locator(HEADING).first()).toHaveText("Zebra Labs");
  await expect(page.locator(ITEM).first()).toContainText("zebra-labs model 2");
});

test("the render cap is honest — 50 rows across groups plus a truthful +N more tail", async ({ mount, page }) => {
  const vendors = Array.from({ length: 40 }, (_, i) => `vendor${String(i).padStart(2, "0")}`);
  await mount(<ModelPickerStory source="openrouter" result={catalogResult(vendorModels(vendors, 5))} />);
  await page.getByRole("button", { name: "Chat model" }).click();

  await expect(page.locator(ITEM)).toHaveCount(50);
  // 200 served − 50 rendered: the tail counts what the cap hid, including whole unbudgeted groups.
  await expect(page.getByText("+150 more — keep typing to narrow")).toBeVisible();
});

test("selecting a grouped row commits that model id", async ({ mount, page }) => {
  await mount(<ModelPickerStory source="openrouter" result={catalogResult(vendorModels(["anthropic", "openai"], 2))} />);
  await page.getByRole("button", { name: "Chat model" }).click();

  await page.locator(ITEM).filter({ hasText: "openai model 1" }).click();

  await expect(page.getByTestId("model-picker-value")).toHaveText("openai/m1");
});

test("the curated cold-cache fallback announces itself", async ({ mount, page }) => {
  await mount(
    <ModelPickerStory
      source="max-pro-sub"
      result={{
        state: "ok",
        models: [
          { id: "opus", label: "Claude Opus", origin: "curated" },
          { id: "sonnet", label: "Claude Sonnet", origin: "curated" },
        ],
        fetchedAt: null,
        defaultModelId: "sonnet",
        allowsFreeText: false,
      }}
    />,
  );
  await page.getByRole("button", { name: "Chat model" }).click();

  await expect(page.getByTestId("model-picker-curated-notice")).toContainText("curated shortlist — full catalog not loaded");
  // The fallback is a NOTICE, not a behavior change — the rows still select.
  await expect(page.locator(HEADING)).toHaveText(["Anthropic"]);
  await page.locator(ITEM).filter({ hasText: "Claude Sonnet" }).click();
  await expect(page.getByTestId("model-picker-value")).toHaveText("sonnet");
});

test("a live catalog shows NO fallback notice", async ({ mount, page }) => {
  await mount(
    <ModelPickerStory
      source="max-pro-sub"
      result={{
        state: "ok",
        models: [
          { id: "opus", label: "Claude Opus", origin: "catalog" },
          { id: "sonnet", label: "Claude Sonnet", origin: "catalog" },
        ],
        fetchedAt: 1_700_000_000_000,
        defaultModelId: "sonnet",
        allowsFreeText: false,
      }}
    />,
  );
  await page.getByRole("button", { name: "Chat model" }).click();

  await expect(page.locator(ITEM)).toHaveCount(2);
  await expect(page.getByTestId("model-picker-curated-notice")).toHaveCount(0);
});
