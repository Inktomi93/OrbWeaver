// contracts/inference — the provider REGISTRY table test (§5.2, §12): every built-in row parses under the
// one schema, its id is bare and matches `PROVIDER_ID`, its `apis` ⊆ its wire's, its `serves` narrows (never
// widens) its wire's ceiling, and the derived policy reproduces the hand rows it replaced without being
// wider than the belt (`generateImage` on hosted rows = openrouter + openai; `agent` = the agent-sdk wire).

import {
  BUILTIN_PROVIDERS,
  builtinProvider,
  coherentApis,
  isPluginProviderId,
  PROVIDER_ID,
  pluginNameOfProviderId,
  providerDefSchema,
  providerTasks,
  taskProviders,
  WIRE_DEFS,
} from "@orb/contracts/inference";
import { expect, test } from "../../support/fixtures.ts";

test("every built-in row parses under providerDefSchema, is bare, and matches PROVIDER_ID", () => {
  expect(BUILTIN_PROVIDERS.length).toBeGreaterThan(0);
  for (const row of BUILTIN_PROVIDERS) {
    expect(providerDefSchema.safeParse(row).success).toBe(true);
    expect(PROVIDER_ID.test(row.id)).toBe(true);
    expect(isPluginProviderId(row.id)).toBe(false);
  }
  // Ids are unique — a duplicate would let one row shadow another's AAD slot.
  expect(new Set(BUILTIN_PROVIDERS.map((row) => row.id)).size).toBe(BUILTIN_PROVIDERS.length);
});

test("apis ⊆ WIRE_DEFS[wire].apis and serves ⊆ WIRE_DEFS[wire].serves for every row", () => {
  for (const row of BUILTIN_PROVIDERS) {
    const wire = WIRE_DEFS[row.wire];
    for (const api of row.apis) {
      expect(wire.apis, `${row.id}.apis carries ${api}`).toContain(api);
    }
    for (const task of row.serves ?? []) {
      expect(wire.serves, `${row.id}.serves carries ${task}`).toContain(task);
    }
    // The derivation never exceeds the wire ceiling.
    for (const task of providerTasks(row)) {
      expect(wire.serves).toContain(task);
    }
    expect(coherentApis(row)).toEqual(row.apis);
  }
});

test("a dialect exists exactly on the openai-compat wire; auth/catalog agree with the wire", () => {
  // Computed violation sets, asserted empty — each row's id names the offender when one appears.
  const dialectMismatch = BUILTIN_PROVIDERS.filter((row) => (row.wire === "openai-compat") !== (row.dialect !== undefined)).map((row) => row.id);
  expect(dialectMismatch).toEqual([]);
  const endpointWithFixedUrl = BUILTIN_PROVIDERS.filter((row) => row.auth === "endpoint" && row.baseUrl !== undefined).map((row) => row.id);
  expect(endpointWithFixedUrl).toEqual([]);
  const builtinOffWire = BUILTIN_PROVIDERS.filter((row) => row.catalog === "builtin" && row.wire !== "local-light").map((row) => row.id);
  expect(builtinOffWire).toEqual([]);
  // local-light has no chat api and is keyless.
  const localLight = builtinProvider("local-light");
  expect(localLight?.apis).toEqual([]);
  expect(localLight?.auth).toBe("none");
});

test("derived policy is not wider than the hand rows it replaced", () => {
  // generateImage: openrouter (whole wire set) + openai (names it) among hosted rows — nothing else metered.
  const imageProviders = taskProviders("generateImage")
    .map((row) => row.id)
    .toSorted();
  expect(imageProviders.filter((id) => builtinProvider(id)?.metered === true)).toEqual(["openai", "openrouter"]);
  // agent: the agent-sdk wire's rows and only those, by construction.
  for (const row of taskProviders("agent")) {
    expect(row.wire).toBe("agent-sdk");
  }
  expect(taskProviders("agent").map((row) => row.id)).toEqual(["claude-sub"]);
  // rerank: every HOSTED row that serves it on the openai-compat wire names its POST path (the wire has no
  // SDK rerank model); an endpoint row leaves the path to the connection's `declared.features`, and resolve
  // reads `requirement-unmet` when neither names one.
  const rerankWithoutPath = taskProviders("rerank")
    .filter((row) => row.wire === "openai-compat" && row.baseUrl !== undefined && row.features?.rerankPath === undefined)
    .map((row) => row.id);
  expect(rerankWithoutPath).toEqual([]);
  expect(taskProviders("rerank").map((row) => row.id)).toContain("openrouter");
  expect(taskProviders("rerank").map((row) => row.id)).not.toContain("openai");
});

test("plugin provider ids are namespaced and the namespace is readable", () => {
  expect(isPluginProviderId("plugin:acme/relay")).toBe(true);
  expect(pluginNameOfProviderId("plugin:acme/relay")).toBe("acme");
  expect(pluginNameOfProviderId("openrouter")).toBeUndefined();
  expect(PROVIDER_ID.test("Custom_OpenAI")).toBe(false);
  const parsed = providerDefSchema.safeParse({
    id: "plugin:acme/relay",
    label: "Relay",
    wire: "openai-compat",
    dialect: "openai-compatible",
    auth: "apiKey",
    baseUrl: "https://relay.example",
    apis: ["chat-completions"],
    catalog: "url",
    metered: true,
  });
  expect(parsed.success).toBe(true);
  // A wire a plugin cannot add.
  const badWire = providerDefSchema.safeParse({ id: "plugin:acme/x", label: "X", wire: "grpc", auth: "apiKey", apis: [], catalog: "url", metered: true });
  expect(badWire.success).toBe(false);
});
