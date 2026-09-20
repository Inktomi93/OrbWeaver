// contracts/inference/provider-schema — the provider-row schema and the id brand. This is the parse a
// PLUGIN's and an ADMIN's row go through, so every refinement here is a boundary a third party is on the
// other side of. Each is pinned: the id shape (bare for built-ins, `plugin:<name>/<id>` for runtime rows —
// the id is half the credential AAD, so a plugin row that could spell a bare id would inherit the
// built-in's sealed credentials); `apis`/`serves` ⊆ the wire's ceiling (a row may narrow, never widen);
// `dialect` present exactly on the openai-compat wire; and the base-URL rule per auth kind.

import { isPluginProviderId, pluginNameOfProviderId, providerDefSchema, providerIdSchema } from "@orb/contracts/inference";
import { expect, test } from "../../support/fixtures.ts";

const ENDPOINT_ROW = {
  id: "acme-endpoint",
  label: "Acme",
  wire: "openai-compat",
  dialect: "openai-compatible",
  auth: "endpoint",
  apis: ["chat-completions"],
  catalog: "url",
  metered: false,
};

test("an id is bare or plugin-namespaced, and nothing else", () => {
  expect(providerIdSchema.parse("openrouter")).toBe("openrouter");
  expect(providerIdSchema.parse("plugin:acme/endpoint")).toBe("plugin:acme/endpoint");
  for (const bad of ["Acme", "acme endpoint", "plugin:acme", "plugin:/x", "acme/endpoint", ""]) {
    expect(providerIdSchema.safeParse(bad).success, `"${bad}" must not parse as a provider id`).toBe(false);
  }
});

test("the namespace helpers agree with the id shape", () => {
  expect(isPluginProviderId("plugin:acme/endpoint")).toBe(true);
  expect(isPluginProviderId("openrouter")).toBe(false);
  expect(pluginNameOfProviderId("plugin:acme/endpoint")).toBe("acme");
  expect(pluginNameOfProviderId("openrouter")).toBeUndefined();
});

test("a row may NARROW its wire's tasks, never widen them", () => {
  expect(providerDefSchema.safeParse({ ...ENDPOINT_ROW, serves: ["chat", "embed"] }).success).toBe(true);
  const widened = providerDefSchema.safeParse({ ...ENDPOINT_ROW, serves: ["chat", "agent"] });
  expect(widened.success, "`agent` is served only by the agent-sdk wire").toBe(false);
});

test("a row may not claim an api its wire does not speak", () => {
  expect(providerDefSchema.safeParse({ ...ENDPOINT_ROW, apis: ["anthropic-messages"] }).success).toBe(false);
  expect(providerDefSchema.safeParse({ ...ENDPOINT_ROW, apis: ["chat-completions"] }).success).toBe(true);
  // `responses` was RETIRED from `CHAT_APIS` (owner ruling 2026-09-20 — the OpenRouter Responses runner was
  // demolished with `@openrouter/sdk` and never replaced). A stored row still naming it must not parse.
  expect(providerDefSchema.safeParse({ ...ENDPOINT_ROW, apis: ["chat-completions", "responses"] }).success).toBe(false);
});

test("`dialect` names the openai-compat transport package and exists nowhere else", () => {
  const { dialect: _dialect, ...noDialect } = ENDPOINT_ROW;
  expect(providerDefSchema.safeParse(noDialect).success, "an openai-compat row must name its transport").toBe(false);
  const anthropic = {
    id: "anthropic",
    label: "Anthropic",
    wire: "anthropic-messages",
    auth: "apiKey",
    baseUrl: "https://api.anthropic.com",
    apis: ["anthropic-messages"],
    catalog: "url",
    metered: true,
  };
  expect(providerDefSchema.safeParse(anthropic).success).toBe(true);
  expect(providerDefSchema.safeParse({ ...anthropic, dialect: "openai-compatible" }).success, "a non-openai-compat wire has one converter").toBe(false);
});

test("the base-URL rule is per AUTH kind, with the agent-sdk subprocess carved out", () => {
  expect(
    providerDefSchema.safeParse({ ...ENDPOINT_ROW, baseUrl: "https://acme.example/v1" }).success,
    "an endpoint row takes its URL from the connection",
  ).toBe(false);
  const hosted = {
    id: "hosted",
    label: "Hosted",
    wire: "openai-compat",
    dialect: "openai-compatible",
    auth: "apiKey",
    apis: ["chat-completions"],
    catalog: "url",
    metered: true,
  };
  expect(providerDefSchema.safeParse(hosted).success, "a hosted row carries its fixed URL").toBe(false);
  expect(providerDefSchema.safeParse({ ...hosted, baseUrl: "https://hosted.example/v1" }).success).toBe(true);
  const subscription = {
    id: "claude-sub",
    label: "Claude subscription",
    wire: "agent-sdk",
    auth: "oauthToken",
    apis: ["agent-sdk"],
    catalog: "url",
    metered: false,
  };
  expect(providerDefSchema.safeParse(subscription).success, "the agent-sdk wire is a subprocess, not an HTTP host").toBe(true);
  expect(providerDefSchema.safeParse({ ...subscription, baseUrl: "https://api.anthropic.com" }).success).toBe(false);
});

test("`baseUrl` and `docsUrl` must be URLs, and a blank label is refused", () => {
  expect(providerDefSchema.safeParse({ ...ENDPOINT_ROW, label: "" }).success).toBe(false);
  expect(providerDefSchema.safeParse({ ...ENDPOINT_ROW, docsUrl: "not-a-url" }).success).toBe(false);
});
