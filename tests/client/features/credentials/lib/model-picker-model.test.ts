// Unit: the ModelPicker's pure MODEL (features/credentials/lib/model-picker-model). No DOM — the node
// lane. Guards the load-bearing string-math the picker renders FROM (CONNECTIONS-BUILD-SPEC §3
// done-criteria): price is USD/token → $/M (×1e6), context compacts to K/M, the chip filter is AND across
// active chips, the render cap is the named constant, the provider grouping buckets/orders/caps honestly
// (MP-1), and the curated cold-cache fallback is detectable from the served pool (MP-2). The device-local Recent MRU (persistence) is
// tested against its store in tests/client/state/recent-models-store.test.ts (it moved off this pure lib
// into the createPersistedStore door).

import {
  filterByChips,
  footerSyncedLabel,
  formatContextLength,
  formatPromptPrice,
  groupModelEntries,
  isCuratedFallback,
  MODEL_PICKER_RENDER_CAP,
} from "../../../../../packages/client/src/features/credentials/lib/model-picker-model";
import { expect, test } from "../../../../support/fixtures";

const SYNCED_RE = /^synced /;

/** A catalog-shaped pool: `count` models per vendor, ids `<vendor>/m<i>`. */
function poolFor(vendors: readonly string[], count: number): readonly { id: string; label: string; origin: string }[] {
  return vendors.flatMap((vendor) => Array.from({ length: count }, (_, i) => ({ id: `${vendor}/m${i}`, label: `${vendor} model ${i}`, origin: "catalog" })));
}

test("formatPromptPrice: 1.5e-5/token renders $15/M", () => {
  expect(formatPromptPrice(0.000_015)).toBe("$15/M");
});
test("formatPromptPrice: trims trailing zeros (2.5e-6 → $2.5/M)", () => {
  expect(formatPromptPrice(0.000_002_5)).toBe("$2.5/M");
});
test("formatPromptPrice: absent / zero price is omitted", () => {
  expect(formatPromptPrice(undefined)).toBeNull();
  expect(formatPromptPrice(0)).toBeNull();
});

test("formatContextLength: 200000 → 200K", () => {
  expect(formatContextLength(200_000)).toBe("200K");
});
test("formatContextLength: 1_000_000 → 1M", () => {
  expect(formatContextLength(1_000_000)).toBe("1M");
});
test("formatContextLength: sub-1000 renders raw; zero/absent omitted", () => {
  expect(formatContextLength(512)).toBe("512");
  expect(formatContextLength(0)).toBeNull();
  expect(formatContextLength(undefined)).toBeNull();
});

test("filterByChips: no chips is a pass-through", () => {
  const entries = [
    { id: "a", label: "A", inputModalities: ["text", "image"], supportedParameters: ["tools"] },
    { id: "b", label: "B", inputModalities: ["text"], supportedParameters: ["tools"] },
    { id: "c", label: "C", inputModalities: ["text", "image"], supportedParameters: [] },
  ];
  expect(filterByChips(entries, [])).toHaveLength(3);
});
test("filterByChips: vision AND tools keeps only the entry with both", () => {
  const entries = [
    { id: "a", label: "A", inputModalities: ["text", "image"], supportedParameters: ["tools"] },
    { id: "b", label: "B", inputModalities: ["text"], supportedParameters: ["tools"] },
    { id: "c", label: "C", inputModalities: ["text", "image"], supportedParameters: [] },
  ];
  expect(filterByChips(entries, ["vision", "tools"]).map((e) => e.id)).toEqual(["a"]);
});
test("filterByChips: vision alone keeps image-input entries", () => {
  const entries = [
    { id: "a", label: "A", inputModalities: ["text", "image"], supportedParameters: ["tools"] },
    { id: "b", label: "B", inputModalities: ["text"], supportedParameters: ["tools"] },
    { id: "c", label: "C", inputModalities: ["text", "image"], supportedParameters: [] },
  ];
  expect(filterByChips(entries, ["vision"]).map((e) => e.id)).toEqual(["a", "c"]);
});

test("footerSyncedLabel: null fetchedAt → the static provenance note per source", () => {
  expect(footerSyncedLabel(null, true)).toBe("endpoint /models");
  expect(footerSyncedLabel(null, false)).toBe("from config");
});
test("footerSyncedLabel: a fetchedAt renders a synced relative line", ({ clock }) => {
  expect(footerSyncedLabel(clock.now(), false)).toMatch(SYNCED_RE);
});

test("MODEL_PICKER_RENDER_CAP is the named cap (no magic number leaked)", () => {
  expect(MODEL_PICKER_RENDER_CAP).toBe(50);
});

test("groupModelEntries: buckets by the id's vendor prefix and labels the known slugs", () => {
  const { groups } = groupModelEntries(poolFor(["anthropic", "openai", "meta-llama"], 2), { source: "openrouter", query: "", selectedId: "" });
  expect(groups.map((g) => g.heading)).toEqual(["Anthropic", "OpenAI", "Meta"]);
  expect(groups.map((g) => g.entries.map((e) => e.id))).toEqual([
    ["anthropic/m0", "anthropic/m1"],
    ["openai/m0", "openai/m1"],
    ["meta-llama/m0", "meta-llama/m1"],
  ]);
});

test("groupModelEntries: majors lead, then alphabetical; the selected model's vendor floats above both", () => {
  const pool = poolFor(["zebra-labs", "anthropic", "acme", "openai"], 1);
  expect(groupModelEntries(pool, { source: "openrouter", query: "", selectedId: "" }).groups.map((g) => g.key)).toEqual([
    "anthropic",
    "openai",
    "acme",
    "zebra-labs",
  ]);
  expect(groupModelEntries(pool, { source: "openrouter", query: "", selectedId: "acme/m0" }).groups.map((g) => g.key)).toEqual([
    "acme",
    "anthropic",
    "openai",
    "zebra-labs",
  ]);
});

test("groupModelEntries: slash-less ids take the source's own heading (max-pro-sub aliases → Anthropic)", () => {
  const { groups } = groupModelEntries([{ id: "sonnet", label: "Sonnet", origin: "curated" }], { source: "max-pro-sub", query: "", selectedId: "" });
  expect(groups).toHaveLength(1);
  expect(groups[0]?.heading).toBe("Anthropic");
});

test("groupModelEntries: the cap is a budget spent ACROSS groups — no single vendor eats it", () => {
  const pool = poolFor(["anthropic", "openai", "google", "qwen"], 40);
  const { groups, overflow } = groupModelEntries(pool, { source: "openrouter", query: "", selectedId: "" });
  const rendered = groups.reduce((sum, g) => sum + g.entries.length, 0);
  expect(rendered).toBeLessThanOrEqual(MODEL_PICKER_RENDER_CAP);
  expect(overflow).toBe(pool.length - rendered);
  // Four vendors share the 50-row budget evenly (12 each) instead of the first one taking all of it.
  expect(groups.map((g) => g.entries.length)).toEqual([12, 12, 12, 12]);
});

test("groupModelEntries: a many-vendor catalog drops whole unbudgeted groups into overflow (nothing double-counted)", () => {
  const vendors = Array.from({ length: 40 }, (_, i) => `vendor${String(i).padStart(2, "0")}`);
  const pool = poolFor(vendors, 5);
  const { groups, overflow } = groupModelEntries(pool, { source: "openrouter", query: "", selectedId: "" });
  const rendered = groups.reduce((sum, g) => sum + g.entries.length, 0);
  expect(rendered).toBe(MODEL_PICKER_RENDER_CAP);
  expect(groups.length).toBeLessThan(vendors.length);
  expect(overflow).toBe(pool.length - rendered);
});

test("groupModelEntries: an exact id match is hoisted — its group leads and the row survives the cap", () => {
  const vendors = Array.from({ length: 40 }, (_, i) => `vendor${String(i).padStart(2, "0")}`);
  const pool = poolFor(vendors, 5);
  const needle = "vendor39/m4"; // last vendor, last row — dropped whole without the hoist
  const { groups } = groupModelEntries(pool, { source: "openrouter", query: ` ${needle} `, selectedId: "" });
  expect(groups[0]?.key).toBe("vendor39");
  expect(groups[0]?.entries[0]?.id).toBe(needle);
});

test("groupModelEntries: an exact LABEL match is hoisted too (case-insensitive)", () => {
  const pool = poolFor(["anthropic", "zebra-labs"], 3);
  const { groups } = groupModelEntries(pool, { source: "openrouter", query: "ZEBRA-LABS MODEL 2", selectedId: "" });
  expect(groups[0]?.key).toBe("zebra-labs");
  expect(groups[0]?.entries[0]?.id).toBe("zebra-labs/m2");
});

test("groupModelEntries: an empty pool yields no groups and no overflow", () => {
  expect(groupModelEntries([], { source: "openrouter", query: "", selectedId: "" })).toEqual({ groups: [], overflow: 0 });
});

test("isCuratedFallback: true only when the WHOLE served pool is the curated shortlist", () => {
  expect(isCuratedFallback([{ id: "sonnet", label: "Sonnet", origin: "curated" }])).toBe(true);
  expect(isCuratedFallback([{ id: "sonnet", label: "Sonnet", origin: "catalog" }])).toBe(false);
  expect(
    isCuratedFallback([
      { id: "sonnet", label: "Sonnet", origin: "curated" },
      { id: "opus", label: "Opus", origin: "catalog" },
    ]),
  ).toBe(false);
  expect(isCuratedFallback([])).toBe(false);
});
