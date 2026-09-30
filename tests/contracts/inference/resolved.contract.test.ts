// contracts/inference/resolved — the credential-free resolved view. Its strict schema is the output parser of
// every procedure that hands a resolved connection to the client, so the secret-bearing `Resolved<Task>` fields
// (credential, base URL, extras, transport) must be refused, never stripped or shipped.

import { BUILTIN_PROVIDERS, GENERATION_FLOOR, providerAvailabilitySchema, resolvedConnectionViewSchema } from "@orb/contracts/inference";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const VIEW = {
  task: "chat",
  connectionId: mintTypeId(ID_PREFIX.userConnection),
  providerId: "openrouter",
  wire: "openai-compat",
  api: "chat-completions",
  model: "vendor/model",
  capability: { kind: "generation", generation: GENERATION_FLOOR },
  requirement: { ok: false, missing: ["input:image"] },
} as const;

describe("resolvedConnectionViewSchema", () => {
  test("control: a credential-free view parses", () => {
    expect(resolvedConnectionViewSchema.safeParse(VIEW).success).toBe(true);
  });

  test.each(["credential", "baseUrl", "extras", "transport"])("refuses the secret-bearing resolved field %s", (field) => {
    expect(resolvedConnectionViewSchema.safeParse({ ...VIEW, [field]: "planted" }).success).toBe(false);
  });

  test("refuses an unmet requirement verdict that carries a stray key", () => {
    expect(resolvedConnectionViewSchema.safeParse({ ...VIEW, requirement: { ok: true, missing: [] } }).success).toBe(false);
  });
});

describe("providerAvailabilitySchema", () => {
  test("admits only the two causes the picker renders", () => {
    const base = { provider: BUILTIN_PROVIDERS[0], available: false };
    expect(providerAvailabilitySchema.safeParse({ ...base, cause: "runtime-missing" }).success).toBe(true);
    expect(providerAvailabilitySchema.safeParse({ ...base, cause: "endpoint-unreachable" }).success).toBe(false);
  });
});
