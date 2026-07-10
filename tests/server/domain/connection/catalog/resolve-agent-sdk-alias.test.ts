// resolveAgentSdkAlias — the family→version fix. A bare family alias (`sonnet`) or an already-resolved
// version id maps via the daemon's live map to the CURRENT wire id + a capability from the daemon's flags.
// PURE (cache passed in). The headline: `sonnet` → `claude-sonnet-5` with effort capability, so an agent
// never pins a stale version; a cold/unknown cache resolves to undefined (caller falls back).

import type { AgentSdkModel } from "@orb/contracts/connection";
import { describe } from "vitest";
import { resolveAgentSdkAlias } from "../../../../../packages/server/src/domain/connection/catalog/resolve-agent-sdk-alias.ts";
import { expect, test } from "../../../../support/fixtures";

const SONNET: AgentSdkModel = {
  alias: "sonnet",
  resolvedModel: "claude-sonnet-5",
  displayName: "Sonnet",
  description: "Sonnet 5",
  supportsEffort: true,
  effortLevels: ["low", "medium", "high", "xhigh", "max"],
  supportsAdaptiveThinking: false,
};
const OPUS: AgentSdkModel = {
  alias: "opus",
  resolvedModel: "claude-opus-4-8",
  displayName: "Opus",
  description: "Opus 4.8",
  supportsEffort: true,
  effortLevels: ["low", "medium", "high", "xhigh", "max"],
  supportsAdaptiveThinking: true,
};
const HAIKU: AgentSdkModel = {
  alias: "haiku",
  resolvedModel: "claude-haiku-5",
  displayName: "Haiku",
  description: "Haiku 5",
  supportsEffort: false,
  effortLevels: [],
  supportsAdaptiveThinking: false,
};
const CACHE = [SONNET, OPUS, HAIKU];

/** Resolve + assert the row was found (narrows away the `| undefined` for the member reads below). */
function resolved(model: string): NonNullable<ReturnType<typeof resolveAgentSdkAlias>> {
  const r = resolveAgentSdkAlias(model, CACHE);
  expect(r).toBeDefined();
  if (r === undefined) {
    throw new Error("unreachable — asserted defined above");
  }
  return r;
}

describe("agent-sdk alias resolution", () => {
  test("a bare `sonnet` alias resolves to the daemon's current version + effort capability", () => {
    const r = resolved("sonnet");
    expect(r.resolvedModel).toBe("claude-sonnet-5");
    expect(r.capability.reasoning.mode).toBe("effort");
    expect(r.capability.reasoning.effortLevels).toEqual(["low", "medium", "high", "xhigh", "max"]);
  });

  test("an already-resolved version id resolves via its row too", () => {
    expect(resolved("claude-sonnet-5").resolvedModel).toBe("claude-sonnet-5");
  });

  test("adaptive thinking (opus) wins the reasoning mode", () => {
    const r = resolved("opus");
    expect(r.resolvedModel).toBe("claude-opus-4-8");
    expect(r.capability.reasoning.mode).toBe("adaptive");
  });

  test("a no-effort model (haiku) resolves to no reasoning", () => {
    const r = resolved("haiku");
    expect(r.capability.reasoning.mode).toBe("none");
    expect(r.capability.reasoning.enabled).toBe(false);
  });

  test("uses the curated shortlist bounds for a curated resolved id (opus-4-8 window/output)", () => {
    const r = resolved("opus");
    // opus-4-8 is curated → the curated 64k output / 200k window, not a synthesized default.
    expect(r.capability.output.maxTokens.max).toBe(64_000);
    expect(r.capability.context.window).toBe(200_000);
  });

  test("a cold cache (null) resolves to undefined — the caller falls back", () => {
    expect(resolveAgentSdkAlias("sonnet", null)).toBeUndefined();
  });

  test("an unknown alias not in the cache resolves to undefined", () => {
    expect(resolveAgentSdkAlias("gpt-5", CACHE)).toBeUndefined();
  });
});
