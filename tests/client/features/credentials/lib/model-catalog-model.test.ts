// The model picker's pure policy (inference program §5.3a Essential tier, §7.4). The claims: the typed-id
// option follows the provider's catalog strategy and never duplicates a listed row, `modelListed` is true only
// for an id the list actually carried, and an endpoint's `listed: false` answer keeps its reason.

import type { ModelCatalogEntry } from "@orb/contracts/inference";
import {
  endpointListSource,
  isListedModel,
  modelEntryLabel,
  modelPickerView,
  showsModelId,
  typedModelAllowed,
  typedOption,
} from "../../../../../packages/client/src/features/credentials/lib/model-catalog-model.ts";
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

test("a row shows its id beside its name only when the name is not the id", () => {
  expect(modelEntryLabel(OPUS)).toBe("Claude Opus 5");
  expect(showsModelId(OPUS)).toBe(true);
  expect(showsModelId(QWEN)).toBe(false);
  // A blank name is a kindless `/v1/models` row: the id is the label.
  expect(modelEntryLabel(entry("gpt-oss-20b", " "))).toBe("gpt-oss-20b");
});

test("an endpoint's listed:false answer is the failed arm carrying the server's reason, never an empty list", () => {
  expect(endpointListSource({ listed: true, models: MODELS, reason: null })).toEqual(LISTED);
  expect(endpointListSource({ listed: false, models: [], reason: "connect ECONNREFUSED" })).toEqual({
    status: "failed",
    reason: "connect ECONNREFUSED",
    retry: null,
  });
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

test("with no list read, typing is offered whatever the policy; a list and its loading frame are the searchable arm", () => {
  expect(modelPickerView({ status: "unlisted", reason: "Type it." }, { listOwner: "Built-in", typedAllowed: false })).toMatchObject({
    notice: "Type it.",
    typingOffered: true,
  });
  expect(modelPickerView({ status: "loading" }, { listOwner: "x", typedAllowed: true })).toMatchObject({ models: null, notice: null });
  expect(modelPickerView(LISTED, { listOwner: "x", typedAllowed: true })).toMatchObject({ models: MODELS, notice: null });
});
