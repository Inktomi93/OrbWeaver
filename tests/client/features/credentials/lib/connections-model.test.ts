// The Connections pane's pure model (inference program §5.3a): the provider picker groups by the row's `auth`
// and never HIDES an unavailable provider (it disables it with its reason), and the connection row's role
// readouts fold tasks into Model-role names. Labels come from the registry rows, never a hand table.

import type { ProviderAvailability } from "@orb/contracts/inference";
import { BUILTIN_PROVIDERS, builtinProvider, CHAT_APIS, providerDefSchema } from "@orb/contracts/inference";
import {
  boundRoleLabels,
  CHAT_API_LABELS,
  connectionRoleLabels,
  joinRoleLabels,
  providerPickerItems,
  showsApiControl,
  sweepRoleLabels,
} from "../../../../../packages/client/src/features/credentials/lib/connections-model.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const OPENROUTER = "user_connection_model0000001";
const LOCAL = "user_connection_model0000002";

function boundTo(connectionId: string | null): { readonly connectionId: string | null } {
  return { connectionId };
}

function available(id: string, isAvailable = true, cause?: ProviderAvailability["cause"]): ProviderAvailability {
  const provider = builtinProvider(id);
  if (provider === undefined) {
    throw new Error(`no built-in provider ${id}`);
  }
  return { provider, available: isAvailable, ...(cause === undefined ? {} : { cause }) };
}

test("connection tasks fold to their six user-facing Model roles without leaking non-routable task names", () => {
  expect(connectionRoleLabels(["chat", "agent", "summarize", "structured", "generateImage", "embed", "imageEmbed", "rerank"])).toEqual([
    "Chat",
    "Utility model",
    "Image generation",
    "Text embedding",
    "Image embedding",
    "Rerank",
  ]);
});

test("the picker groups by the row's auth — Hosted (key) · Your own server (URL) · Subscription · Built-in — in that order", () => {
  const items = providerPickerItems(BUILTIN_PROVIDERS.map((provider) => ({ provider, available: true })));
  const labels = items.map((group) => ("items" in group ? group.label : ""));
  expect(labels).toEqual(["Hosted (key)", "Your own server (URL)", "Subscription", "Built-in"]);
  const hosted = items[0];
  if (hosted === undefined || !("items" in hosted)) {
    throw new Error("expected a grouped picker");
  }
  expect(hosted.items.map((item) => item.value)).toContain("openrouter");
  expect(hosted.items.map((item) => item.value)).not.toContain("vllm");
});

test("an unavailable provider is DISABLED with its reason, never hidden (runtime-missing is a cause, the gloss is the sentence)", () => {
  const items = providerPickerItems([available("openrouter"), available("claude-sub", false, "runtime-missing")]);
  const subscription = items.find((group) => "items" in group && group.label === "Subscription");
  if (subscription === undefined || !("items" in subscription)) {
    throw new Error("expected the Subscription group");
  }
  const claude = subscription.items.find((item) => item.value === "claude-sub");
  expect(claude?.disabled).toBe(true);
  expect(claude?.description).toMatch(/Claude runtime/u);
});

test("a plugin row names its plugin in the picker, so a manifest label cannot pass as the built-in of that name", () => {
  const relay = providerDefSchema.parse({
    id: "plugin:relay/anthropic",
    label: "Anthropic",
    wire: "anthropic-messages",
    auth: "apiKey",
    baseUrl: "https://relay.plugin-author.example/v1",
    apis: ["anthropic-messages"],
    catalog: "url",
    metered: true,
  });
  const items = providerPickerItems([available("anthropic"), { provider: relay, available: true }]);
  const hosted = items.find((group) => "items" in group && group.label === "Hosted (key)");
  if (hosted === undefined || !("items" in hosted)) {
    throw new Error("expected the Hosted (key) group");
  }
  expect(hosted.items.map((item) => [item.value, item.label])).toEqual([
    ["anthropic", "Anthropic"],
    ["plugin:relay/anthropic", "Anthropic · plugin relay"],
  ]);
});

test("an empty group is omitted (never a heading over nothing)", () => {
  const items = providerPickerItems([available("openrouter")]);
  expect(items).toHaveLength(1);
});

test("the api control renders only when the provider lists more than one protocol", () => {
  // NO SHIPPED ROW lists two apis any more: `openrouter` was the last one, and `responses` was retired from
  // `CHAT_APIS` on 2026-09-20 (the OpenRouter Responses runner was demolished with `@openrouter/sdk` in
  // 146f71cd5 and never replaced). So the control renders for nothing built in — that is the pin. The >1 arm
  // stays proven on a synthetic row, which is the shape a plugin/admin row listing two would have.
  for (const row of BUILTIN_PROVIDERS) {
    expect(showsApiControl(row), `"${row.id}" must not raise a one-option protocol combobox`).toBe(false);
  }
  const openrouter = builtinProvider("openrouter");
  if (openrouter === undefined) {
    throw new Error("no built-in provider openrouter");
  }
  expect(showsApiControl({ ...openrouter, apis: ["chat-completions", "agent-sdk"] })).toBe(true);
  expect(showsApiControl(undefined)).toBe(false);
});

test("CHAT_API_LABELS is total over the protocol axis", () => {
  for (const api of CHAT_APIS) {
    expect(CHAT_API_LABELS[api]).toBeTruthy();
  }
});

test("the sweep's gloss names the roles it will write — and drops the ones it cannot fund", () => {
  expect(sweepRoleLabels({ allowBackground: true, tasks: ["chat", "summarize", "structured", "embed"] })).toEqual(["Chat", "Utility model", "Text embedding"]);
  // `useForEverything` SKIPS a background task on a row with the flag off ("everything it can serve"), so
  // the gloss must skip it too or the sentence promises bindings the verb will not write.
  expect(sweepRoleLabels({ allowBackground: false, tasks: ["chat", "summarize", "embed"] })).toEqual(["Chat"]);
});

test("the remove confirm counts the roles the connection is actually BOUND to, in render order", () => {
  const views = [
    { task: "chat", binding: boundTo(OPENROUTER) },
    { task: "summarize", binding: boundTo(LOCAL) },
    { task: "generateImage", binding: boundTo(OPENROUTER) },
    { task: "embed", binding: null },
  ] as const;
  expect(boundRoleLabels(OPENROUTER, views)).toEqual(["Chat", "Image generation"]);
  expect(boundRoleLabels(LOCAL, views)).toEqual(["Utility model"]);
  expect(boundRoleLabels("user_connection_nobody00001", views)).toEqual([]);
  expect(joinRoleLabels(["Chat", "Utility model", "Image generation"])).toBe("Chat, Utility model and Image generation");
  expect(joinRoleLabels(["Chat"])).toBe("Chat");
  expect(joinRoleLabels([])).toBe("");
});
