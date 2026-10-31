// A manifest's provider rows are a trust edge: the id stays inside the plugin's own namespace, a row cannot name a wire
// the host does not implement, and a fixed baseUrl is egress the manifest must declare and the owner must consent to.
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { makePluginProviderRow, pluginProviderId } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";

const HOST = "api.vendor.example";
const PLUGIN = "vendor";

const provider = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...makePluginProviderRow(PLUGIN, "hosted", { label: "Vendor", auth: "apiKey", baseUrl: `https://${HOST}/v1` }),
  ...over,
});

const manifest = (over: Record<string, unknown>): unknown => ({
  id: PLUGIN,
  name: "Vendor",
  version: "1.0.0",
  hostVersion: PLUGIN_HOST_VERSIONS[0],
  entry: PLUGIN_MAIN_ENTRY,
  description: "Contributes a provider.",
  capabilities: ["net.fetch"],
  netHosts: [HOST],
  providers: [provider()],
  ...over,
});

const issuePaths = (input: unknown): string[] => {
  const result = pluginManifestSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
};

test("a manifest whose providers stay in their namespace and declare their host parses", () => {
  expect(pluginManifestSchema.safeParse(manifest({})).success).toBe(true);
});

test("a provider id outside the plugin's own namespace, or declared twice, is refused", () => {
  expect(issuePaths(manifest({ providers: [provider({ id: pluginProviderId("other", "hosted") })] }))).toContain("providers.0.id");
  expect(issuePaths(manifest({ providers: [provider({ id: "openrouter" })] }))).toContain("providers.0.id");
  expect(issuePaths(manifest({ providers: [provider(), provider()] }))).toContain("providers.1.id");
});

test("a fixed baseUrl needs an egress capability and a declared host", () => {
  expect(issuePaths(manifest({ providers: [provider({ baseUrl: "https://undeclared.example/v1" })] }))).toContain("providers.0.baseUrl");
  expect(issuePaths(manifest({ capabilities: [], netHosts: undefined }))).toContain("capabilities");
  // A mixed-case declaration names the same host.
  expect(pluginManifestSchema.safeParse(manifest({ netHosts: [HOST.toUpperCase()] })).success).toBe(true);
});

test("a provider row naming a wire the host does not implement is refused", () => {
  expect(pluginManifestSchema.safeParse(manifest({ providers: [provider({ wire: "guest-backend" })] })).success).toBe(false);
});
