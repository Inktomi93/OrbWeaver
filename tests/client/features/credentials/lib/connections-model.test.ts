// The Connections pane's pure model (inference program §5.3a) — the Model-roles rows are keyed on the contract's
// routable tasks (a new task is a compile error AND a pin here), the provider picker groups by the row's `auth`
// and never HIDES an unavailable provider (it disables it with its reason), and the readouts speak in the
// persisted read's words. Labels come from the registry rows, never a hand table.

import type { ProviderAvailability } from "@orb/contracts/inference";
import { BUILTIN_PROVIDERS, builtinProvider, CHAT_APIS, ROUTABLE_TASKS } from "@orb/contracts/inference";
import type { ModelId, UserConnectionId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import {
  bindRefusal,
  CHAT_API_LABELS,
  connectionSummary,
  persistedRoleLabel,
  providerPickerItems,
  ROLE_ROWS_ORDERED,
  showsApiControl,
} from "../../../../../packages/client/src/features/credentials/lib/connections-model.ts";
import { expect, test } from "../../../../support/fixtures.ts";

function available(id: string, isAvailable = true, cause?: ProviderAvailability["cause"]): ProviderAvailability {
  const provider = builtinProvider(id);
  if (provider === undefined) {
    throw new Error(`no built-in provider ${id}`);
  }
  return { provider, available: isAvailable, ...(cause === undefined ? {} : { cause }) };
}

test("every routable task has exactly ONE Model-roles row, in the client's render order (a new task is caught here)", () => {
  const tasks = ROLE_ROWS_ORDERED.map((row) => row.task);
  expect(new Set(tasks).size).toBe(tasks.length);
  expect([...tasks].sort()).toEqual([...ROUTABLE_TASKS].sort());
  // Chat first, the utility row second — the two a fresh user must set before anything works.
  expect(tasks.slice(0, 2)).toEqual(["chat", "summarize"]);
});

test("the Utility row names all three consumers and every row carries a description", () => {
  const utility = ROLE_ROWS_ORDERED.find((row) => row.task === "summarize");
  expect(utility?.label).toBe("Utility model");
  expect(utility?.description).toMatch(/summar/iu);
  expect(utility?.description).toMatch(/caption/iu);
  for (const row of ROLE_ROWS_ORDERED) {
    expect(row.description.length).toBeGreaterThan(0);
  }
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

test("bindRefusal: a background task on a row with allowBackground OFF is refused inline; a foreground task never is", () => {
  expect(bindRefusal({ allowBackground: false }, "summarize")).toMatch(/background/u);
  expect(bindRefusal({ allowBackground: true }, "summarize")).toBeNull();
  expect(bindRefusal({ allowBackground: false }, "chat")).toBeNull();
});

test("persistedRoleLabel speaks the PERSISTED resolve: provider · model, else the honest nothing with its cause", () => {
  const resolved = { model: castId<ModelId>("anthropic/claude-opus-5"), providerId: "openrouter", connectionId: castId<UserConnectionId>("user_connection_x") };
  expect(persistedRoleLabel({ resolved, unavailableCause: null })).toBe("openrouter · anthropic/claude-opus-5");
  expect(persistedRoleLabel({ resolved: null, unavailableCause: null })).toBe("nothing — no connection is set");
  expect(persistedRoleLabel({ resolved: null, unavailableCause: "endpoint-unreachable" })).toBe("nothing — endpoint-unreachable");
});

test("connectionSummary avoids repeating the model when the auto-minted label already carries it", () => {
  expect(connectionSummary({ label: "OpenRouter · gpt-5", model: "gpt-5" })).toBe("OpenRouter · gpt-5");
  expect(connectionSummary({ label: "work key", model: "gpt-5" })).toBe("work key · gpt-5");
});
