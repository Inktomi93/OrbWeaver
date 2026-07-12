// Unit: the ModelPicker's pure MODEL (features/settings/lib/model-picker-model). No DOM — the node lane.
// Guards the load-bearing string-math the picker renders FROM (CONNECTIONS-BUILD-SPEC §3 done-criteria):
// price is USD/token → $/M (×1e6), context compacts to K/M, the chip filter is AND across active chips, and
// the render cap is the named constant. The device-local Recent MRU (persistence) is tested against its
// store in tests/client/state/recent-models-store.test.ts (it moved off this pure lib into the
// createPersistedStore door).

import {
  filterByChips,
  footerSyncedLabel,
  formatContextLength,
  formatPromptPrice,
  MODEL_PICKER_RENDER_CAP,
} from "../../../../../packages/client/src/features/settings/lib/model-picker-model";
import { expect, test } from "../../../../support/fixtures";

const SYNCED_RE = /^synced /;

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
