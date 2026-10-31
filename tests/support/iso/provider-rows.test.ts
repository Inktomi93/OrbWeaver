// @subject tests/support/iso/provider-rows.ts

import { isPluginProviderId, pluginNameOfProviderId } from "@orb/contracts/inference";
import { expect, test } from "vitest";
import { ZodError } from "zod";
import { makePluginProviderRow, makeProviderRow, pluginProviderId } from "./provider-rows.ts";

test("the row's id is the plugin namespace the production parser reads back, and an override replaces a field", () => {
  const row = makePluginProviderRow("acme", "text", { label: "Acme text" });
  expect(row.id).toBe(pluginProviderId("acme", "text"));
  expect(pluginNameOfProviderId(row.id)).toBe("acme");
  expect(row.label).toBe("Acme text");
  expect(makePluginProviderRow("acme", "hosted", { auth: "apiKey", baseUrl: "https://api.acme.example/v1" }).baseUrl).toBe("https://api.acme.example/v1");
});

test("makeProviderRow keeps a bare admin id outside the plugin namespace and lets a field override its defaults", () => {
  const row = makeProviderRow("acme-endpoint", { label: "Acme" });
  expect(row.id).toBe("acme-endpoint");
  expect(isPluginProviderId(row.id)).toBe(false);
  expect(row.label).toBe("Acme");
  expect(makeProviderRow("acme-endpoint").label).toBe("acme-endpoint");
});

test("a row the production schema refuses throws instead of building", () => {
  expect(() => makePluginProviderRow("acme", "text", { auth: "apiKey" })).toThrow(ZodError);
});
