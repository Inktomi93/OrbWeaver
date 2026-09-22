import type { ProviderDef, ProviderId } from "@orb/contracts/inference";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import {
  conflictingProviderDefinition,
  indexProviderDefinitions,
  providerDefinitionHash,
} from "../../../../../packages/server/src/domain/connection/substrate/provider-definitions.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const PROVIDER_ID = castId<ProviderId>("plugin:test/acme");
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
  test("indexes definitions by their branded provider id", () => {
    expect(indexProviderDefinitions([PROVIDER]).get(PROVIDER_ID)).toBe(PROVIDER);
  });

  test("accepts an identical plugin definition and refuses replacement or admin ownership", () => {
    const hash = providerDefinitionHash(PROVIDER);
    const desired = [{ row: PROVIDER, hash }];

    expect(conflictingProviderDefinition(desired, [{ id: PROVIDER_ID, definitionHash: hash, originKind: "plugin" }])).toBeUndefined();
    expect(conflictingProviderDefinition(desired, [{ id: PROVIDER_ID, definitionHash: "different", originKind: "plugin" }])).toBe(PROVIDER_ID);
    expect(conflictingProviderDefinition(desired, [{ id: PROVIDER_ID, definitionHash: hash, originKind: "admin" }])).toBe(PROVIDER_ID);
  });
});
