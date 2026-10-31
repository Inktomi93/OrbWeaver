// @subject tests/support/iso/provider-rows.ts

import { pluginNameOfProviderId } from "@orb/contracts/inference";
import { expect, test } from "vitest";
import { makePluginProviderRow, pluginProviderId } from "./provider-rows.ts";

test("the row's id is the plugin namespace the production parser reads back, and an override replaces a field", () => {
  const row = makePluginProviderRow("acme", "text", { label: "Acme text" });
  expect(row.id).toBe(pluginProviderId("acme", "text"));
  expect(pluginNameOfProviderId(row.id)).toBe("acme");
  expect(row.label).toBe("Acme text");
  expect(makePluginProviderRow("acme", "hosted", { auth: "apiKey", baseUrl: "https://api.acme.example/v1" }).baseUrl).toBe("https://api.acme.example/v1");
});

test("a row the production schema refuses throws instead of building", () => {
  expect(() => makePluginProviderRow("acme", "text", { auth: "apiKey" })).toThrow();
});
