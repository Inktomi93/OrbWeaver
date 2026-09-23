// Unit: the ModelPicker's pure model (inference program §5.3a Essential tier, §7.4). No DOM — the node lane.
// Ported with the picker: price is USD/token → $/M (×1e6), context compacts to K/M, the chip filter is AND
// across active chips, the render cap is the named constant, and the provider grouping buckets, orders and caps
// honestly. Added with the connection-era input: the typed-id option follows the provider's catalog strategy
// and never duplicates a listed row, `modelListed` is true only for an id the list carried, a list read's
// `listed: false` answer keeps its reason, and Enter's floor admits only a result containing what was typed.

import type { ModelCatalogEntry } from "@orb/contracts/inference";
import {
  clauseOf,
  filterByChips,
  formatContextLength,
  formatPromptPrice,
  groupModelEntries,
  isListedModel,
  isStrongMatch,
  MODEL_PICKER_RENDER_CAP,
  modelEntryLabel,
  modelListSource,
  modelPickerView,
  offersCapabilityChips,
  resolveRecentEntries,
  typedModelAllowed,
  typedOption,
} from "../../../../../packages/client/src/features/credentials/lib/model-picker-model.ts";
import { expect, test } from "../../../../support/fixtures.ts";

function entry(id: string, name = id): ModelCatalogEntry {
  return {
    id,
    name,
    contextLength: null,
    promptPrice: null,
    completionPrice: null,
    cacheReadPrice: null,
    cacheWritePrice: null,
    inputModalities: [],
    supportedParameters: [],
  };
}

const OPUS = entry("anthropic/claude-opus-5", "Claude Opus 5");
const QWEN = entry("qwen/qwen3-32b");
const MODELS = [OPUS, QWEN];
// The source shape is derived, as every reader derives it: a feature `lib/` exports no type aliases.
const LISTED: Parameters<typeof isListedModel>[0] = { status: "listed", models: MODELS };

test("a url catalog permits a typed id; a builtin catalog is the closed set the runtime can load", () => {
  expect(typedModelAllowed({ catalog: "url" })).toBe(true);
  expect(typedModelAllowed({ catalog: "builtin" })).toBe(false);
});

test("the typed option is offered for an unlisted id and withheld for a listed one, a blank term, or a closed catalog", () => {
  expect(typedOption({ term: "  openai/gpt-6  ", models: MODELS, allowed: true })).toBe("openai/gpt-6");
  // Typing a listed id exactly: the list row is the honest pick, so no second "as typed" row.
  expect(typedOption({ term: "qwen/qwen3-32b", models: MODELS, allowed: true })).toBeNull();
  expect(typedOption({ term: "   ", models: MODELS, allowed: true })).toBeNull();
  expect(typedOption({ term: "openai/gpt-6", models: MODELS, allowed: false })).toBeNull();
});

test("modelListed is true only for an id the list carried, and never before a list has arrived", () => {
  expect(isListedModel(LISTED, " qwen/qwen3-32b ")).toBe(true);
  expect(isListedModel(LISTED, "openai/gpt-6")).toBe(false);
  expect(isListedModel(LISTED, "")).toBe(false);
  expect(isListedModel({ status: "loading" }, "qwen/qwen3-32b")).toBe(false);
  expect(isListedModel({ status: "unlisted", reason: "type it" }, "qwen/qwen3-32b")).toBe(false);
});

test("a row's label is its name, or its id when the list carries no name", () => {
  expect(modelEntryLabel(OPUS)).toBe("Claude Opus 5");
  expect(modelEntryLabel(QWEN)).toBe("qwen/qwen3-32b");
  // A blank name is a kindless `/v1/models` row: the id is the label.
  expect(modelEntryLabel(entry("gpt-oss-20b", " "))).toBe("gpt-oss-20b");
});

test("a list read's listed:false answer is the failed arm carrying the server's reason and the retry", () => {
  const retry = (): void => undefined;
  expect(modelListSource({ listed: true, models: MODELS, reason: null }, retry)).toEqual(LISTED);
  expect(modelListSource({ listed: false, models: [], reason: "connect ECONNREFUSED" }, retry)).toEqual({
    status: "failed",
    reason: "connect ECONNREFUSED",
    retry,
  });
});

test("a reason sits mid-sentence without a doubled period", () => {
  expect(clauseOf("the provider refused the model id.")).toBe("the provider refused the model id");
  expect(clauseOf("  connect ECONNREFUSED  ")).toBe("connect ECONNREFUSED");
});

test("a read list that gave nothing is the typed arm with its consequence, and a closed catalog offers no typing", () => {
  const retry = (): void => undefined;
  expect(modelPickerView({ status: "listed", models: [] }, { listOwner: "OpenRouter", typedAllowed: true })).toEqual({
    models: null,
    notice: "OpenRouter listed no models. Type the id; it'll be sent as-is.",
    warns: true,
    typingOffered: true,
    retry: null,
  });
  expect(modelPickerView({ status: "failed", reason: "503", retry }, { listOwner: "Built-in", typedAllowed: false })).toEqual({
    models: null,
    notice: "Couldn't list Built-in's models — 503. This provider only runs models from its list, so there is nothing to type instead.",
    warns: true,
    typingOffered: false,
    retry,
  });
});

test("with no list read, the policy still decides typing; a list and its loading frame are the searchable arm", () => {
  expect(modelPickerView({ status: "unlisted", reason: "Pick it." }, { listOwner: "Built-in", typedAllowed: false })).toMatchObject({
    notice: "Pick it.",
    warns: true,
    typingOffered: false,
  });
  expect(modelPickerView({ status: "unlisted", reason: "Type it." }, { listOwner: "OpenRouter", typedAllowed: true })).toMatchObject({
    notice: "Type it.",
    warns: false,
    typingOffered: true,
  });
  expect(modelPickerView({ status: "loading" }, { listOwner: "x", typedAllowed: true })).toMatchObject({ models: null, notice: null });
  expect(modelPickerView(LISTED, { listOwner: "x", typedAllowed: true })).toMatchObject({ models: MODELS, notice: null });
});

// ── ported from the deleted picker's unit suite ──────────────────────────────────────────────────────

interface PoolRow {
  readonly id: string;
  readonly label: string;
  readonly contextLength: number | null;
  readonly promptPrice: number | null;
  readonly inputModalities: readonly string[];
  readonly supportedParameters: readonly string[];
}

function row(id: string, label = id, over: Partial<PoolRow> = {}): PoolRow {
  return { id, label, contextLength: null, promptPrice: null, inputModalities: [], supportedParameters: [], ...over };
}

/** A catalog-shaped pool: `count` models per vendor, ids `<vendor>/m<i>`. */
function poolFor(vendors: readonly string[], count: number): readonly PoolRow[] {
  return vendors.flatMap((vendor) => Array.from({ length: count }, (_, i) => row(`${vendor}/m${i}`, `${vendor} model ${i}`)));
}

const GROUPING = { unprefixedHeading: "OpenRouter", query: "", selectedId: "" } as const;

test("formatPromptPrice: USD per token renders as $/M with trailing zeros trimmed; absent or zero is omitted", () => {
  expect(formatPromptPrice(0.000_015)).toBe("$15/M");
  expect(formatPromptPrice(0.000_002_5)).toBe("$2.5/M");
  expect(formatPromptPrice(null)).toBeNull();
  expect(formatPromptPrice(0)).toBeNull();
});

test("formatContextLength: compacts to K and M; sub-1000 renders raw; zero or absent is omitted", () => {
  expect(formatContextLength(200_000)).toBe("200K");
  expect(formatContextLength(1_000_000)).toBe("1M");
  expect(formatContextLength(512)).toBe("512");
  expect(formatContextLength(0)).toBeNull();
  expect(formatContextLength(null)).toBeNull();
});

test("filterByChips: no chips passes through; chips AND together", () => {
  const entries = [
    row("a", "A", { inputModalities: ["text", "image"], supportedParameters: ["tools"] }),
    row("b", "B", { inputModalities: ["text"], supportedParameters: ["tools"] }),
    row("c", "C", { inputModalities: ["text", "image"] }),
  ];
  expect(filterByChips(entries, [])).toHaveLength(3);
  expect(filterByChips(entries, ["vision", "tools"]).map((e) => e.id)).toEqual(["a"]);
  expect(filterByChips(entries, ["vision"]).map((e) => e.id)).toEqual(["a", "c"]);
});

test("the chips are offered only for a catalog that states capabilities", () => {
  expect(offersCapabilityChips([row("a", "A", { supportedParameters: ["tools"] })])).toBe(true);
  expect(offersCapabilityChips([row("qwen3"), row("llama3")])).toBe(false);
});

test("MODEL_PICKER_RENDER_CAP is the named cap (no magic number leaked)", () => {
  expect(MODEL_PICKER_RENDER_CAP).toBe(50);
});

test("groupModelEntries: buckets by the id's vendor prefix and labels the known slugs", () => {
  const { groups } = groupModelEntries(poolFor(["anthropic", "openai", "meta-llama"], 2), GROUPING);
  expect(groups.map((g) => g.heading)).toEqual(["Anthropic", "OpenAI", "Meta"]);
  expect(groups.map((g) => g.entries.map((e) => e.id))).toEqual([
    ["anthropic/m0", "anthropic/m1"],
    ["openai/m0", "openai/m1"],
    ["meta-llama/m0", "meta-llama/m1"],
  ]);
});

test("groupModelEntries: majors lead, then alphabetical; the selected model's vendor floats above both", () => {
  const pool = poolFor(["zebra-labs", "anthropic", "acme", "openai"], 1);
  expect(groupModelEntries(pool, GROUPING).groups.map((g) => g.key)).toEqual(["anthropic", "openai", "acme", "zebra-labs"]);
  expect(groupModelEntries(pool, { ...GROUPING, selectedId: "acme/m0" }).groups.map((g) => g.key)).toEqual(["acme", "anthropic", "openai", "zebra-labs"]);
});

test("groupModelEntries: slash-less ids take the list owner as their heading", () => {
  const { groups } = groupModelEntries([row("sonnet", "Sonnet")], { ...GROUPING, unprefixedHeading: "Claude subscription" });
  expect(groups.map((g) => g.heading)).toEqual(["Claude subscription"]);
});

test("groupModelEntries: the cap is a budget spent ACROSS groups — no single vendor eats it", () => {
  const pool = poolFor(["anthropic", "openai", "google", "qwen"], 40);
  const { groups, overflow } = groupModelEntries(pool, GROUPING);
  const rendered = groups.reduce((sum, g) => sum + g.entries.length, 0);
  expect(rendered).toBeLessThanOrEqual(MODEL_PICKER_RENDER_CAP);
  expect(overflow).toBe(pool.length - rendered);
  expect(groups.map((g) => g.entries.length)).toEqual([12, 12, 12, 12]);
});

test("groupModelEntries: a many-vendor catalog drops whole unbudgeted groups into overflow", () => {
  const vendors = Array.from({ length: 40 }, (_, i) => `vendor${String(i).padStart(2, "0")}`);
  const pool = poolFor(vendors, 5);
  const { groups, overflow } = groupModelEntries(pool, GROUPING);
  const rendered = groups.reduce((sum, g) => sum + g.entries.length, 0);
  expect(rendered).toBe(MODEL_PICKER_RENDER_CAP);
  expect(groups.length).toBeLessThan(vendors.length);
  expect(overflow).toBe(pool.length - rendered);
});

test("groupModelEntries: an exact id or label match is hoisted — its group leads and the row survives the cap", () => {
  const vendors = Array.from({ length: 40 }, (_, i) => `vendor${String(i).padStart(2, "0")}`);
  const pool = poolFor(vendors, 5);
  const hoisted = groupModelEntries(pool, { ...GROUPING, query: " vendor39/m4 " });
  expect(hoisted.groups[0]?.entries[0]?.id).toBe("vendor39/m4");
  const byLabel = groupModelEntries(poolFor(["anthropic", "zebra-labs"], 3), { ...GROUPING, query: "ZEBRA-LABS MODEL 2" });
  expect(byLabel.groups[0]?.entries[0]?.id).toBe("zebra-labs/m2");
});

test("groupModelEntries: an empty pool yields no groups and no overflow", () => {
  expect(groupModelEntries([], GROUPING)).toEqual({ groups: [], overflow: 0 });
});

test("the Recent group resolves MRU ids against the live pool, only with an empty query", () => {
  const pool = poolFor(["anthropic"], 3);
  const byId = new Map(pool.map((model) => [model.id, model] as const));
  expect(resolveRecentEntries(["anthropic/m2", "gone/model", "anthropic/m0"], byId, true).map((e) => e.id)).toEqual(["anthropic/m2", "anthropic/m0"]);
  expect(resolveRecentEntries(["anthropic/m2"], byId, false)).toEqual([]);
});

test("Enter's floor: a result is strong only when its id or name CONTAINS what was typed", () => {
  const gptq = row("meta-llama/llama-3-70b-gptq-4bit-v0.6", "Llama 3 70B GPTQ v0.6");
  expect(isStrongMatch(gptq, "gpt-6")).toBe(false);
  expect(isStrongMatch(gptq, "GPTQ")).toBe(true);
  expect(isStrongMatch(row("anthropic/claude-opus-5", "Claude Opus 5"), "opus 5")).toBe(true);
  expect(isStrongMatch(gptq, "  ")).toBe(false);
});
