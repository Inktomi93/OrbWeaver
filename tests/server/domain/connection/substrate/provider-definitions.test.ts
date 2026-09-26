import type { ProviderDef, ProviderId } from "@orb/contracts/inference";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { conflictingProviderDefinition, providerDefinitionHash } from "../../../../../packages/server/src/domain/connection/substrate/provider-definitions.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const PROVIDER_ID = castId<ProviderId>("plugin:test/acme");
const SECOND_ID = castId<ProviderId>("plugin:test/second");
const PROVIDER: ProviderDef = {
  id: PROVIDER_ID,
  label: "Acme",
  wire: "openai-compat",
  dialect: "openai-compatible",
  auth: "endpoint",
  apis: ["chat-completions"],
  catalog: "url",
  metered: false,
};

describe("provider definition identity", () => {
  test("an owner's claim accepts the same definition and refuses a changed one", () => {
    const hash = providerDefinitionHash(PROVIDER);
    const desired = [{ row: PROVIDER, hash }];

    expect(conflictingProviderDefinition(desired, [{ id: PROVIDER_ID, definitionHash: hash }])).toBeUndefined();
    expect(conflictingProviderDefinition(desired, [{ id: PROVIDER_ID, definitionHash: "different" }])).toBe(PROVIDER_ID);
    // A claim on another id never conflicts: the comparison is per provider id.
    expect(conflictingProviderDefinition(desired, [{ id: SECOND_ID, definitionHash: "different" }])).toBeUndefined();
  });
});
