// substrate/routing-coherence — the write-boundary guard for routing.roleDefaults. Pins the two rules: (1)
// HEAL — naming source without model clears the stale model to null; (2) REJECT — naming a non-empty model
// against a config-derived source (vllm/local-light) throws incoherent_role_model. Untouched roles and a
// patch with no roleDefaults pass through unchanged.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { DomainOperationError } from "@orb/kit/errors";
import { describe } from "vitest";
import { coherentRoutingPatch } from "../../../../../packages/server/src/domain/settings/substrate/routing-coherence.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const CURRENT = DEFAULT_USER_SETTINGS.routing;

describe("coherentRoutingPatch", () => {
  test("a patch with no roleDefaults passes through untouched", () => {
    const patch = { someOtherKey: 1 };
    expect(coherentRoutingPatch(CURRENT, patch)).toBe(patch);
  });

  test("HEAL: naming source without model clears the stale model to null", () => {
    const patch = { roleDefaults: { chat: { source: "vllm" } } };
    const result = coherentRoutingPatch(CURRENT, patch);
    expect(result).toEqual({ roleDefaults: { chat: { source: "vllm", model: null } } });
  });

  test("REJECT: a non-empty model pinned against a config-derived source throws incoherent_role_model", () => {
    const patch = { roleDefaults: { chat: { source: "vllm", model: "some-model" } } };
    let thrown: unknown;
    try {
      coherentRoutingPatch(CURRENT, patch);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(DomainOperationError);
    expect((thrown as DomainOperationError).code).toBe("incoherent_role_model");
  });

  test("naming BOTH source and model against a non-config-derived source (openrouter) passes through unmodified", () => {
    const patch = { roleDefaults: { chat: { source: "openrouter", model: "anthropic/claude-sonnet-5" } } };
    expect(coherentRoutingPatch(CURRENT, patch)).toEqual({ roleDefaults: { chat: { source: "openrouter", model: "anthropic/claude-sonnet-5" } } });
  });

  test("a role NOT named in the patch is left alone — the guard only inspects what the patch asserts", () => {
    const patch = { roleDefaults: { embed: { source: "vllm" } } };
    const result = coherentRoutingPatch(CURRENT, patch);
    // Only the named role appears in the healed roleDefaults; stale data on other roles is untouched (not even present).
    expect(Object.keys((result["roleDefaults"] as Record<string, unknown>) ?? {})).toEqual(["embed"]);
  });
});
