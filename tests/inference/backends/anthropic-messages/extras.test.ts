// backends/anthropic-messages/extras — the audit C2 allowlist. The direct wire used to drop EVERY `extras`
// key wholesale; six are real modelled options and three more are deliberately refused. What is pinned here
// is the BELT, not the plumbing: an allowlist whose refusals are silent is the open-bag it replaced.

import { anthropicExtras, anthropicUserIdDigest } from "../../../../packages/inference/src/backends/anthropic-messages/extras.ts";
import type { ResolvedWarning } from "../../../../packages/inference/src/contract/resolve.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { fakeApiKeySecret, fakeResolved } from "../../_support.ts";
import { generationCapability } from "../_hosted-support.ts";

function connectionWith(extras: Record<string, unknown> | null): Parameters<typeof anthropicExtras>[0] {
  return {
    ...fakeResolved({
      task: "chat",
      providerId: "anthropic",
      model: "claude-opus-4-5-20251101",
      capability: generationCapability(),
      baseUrl: "https://api.anthropic.com",
      secret: fakeApiKeySecret("sk-ant-not-a-real-key"),
    }),
    extras: extras as never,
  };
}

const keysOf = (warnings: readonly ResolvedWarning[]): readonly (string | undefined)[] => warnings.map((w) => w.key);

test("every turn carries an abuse-attribution id, and it is a DIGEST — never the raw user id", () => {
  const warnings: ResolvedWarning[] = [];
  const connection = connectionWith(null);
  const out = anthropicExtras(connection, warnings);

  expect(out["metadata"]).toEqual({ userId: anthropicUserIdDigest(connection.ownerId) });
  // The whole point of the digest: the owner's own id must not appear anywhere in what we send.
  expect(JSON.stringify(out)).not.toContain(connection.ownerId);
  expect(anthropicUserIdDigest(connection.ownerId)).toMatch(/^[0-9a-f]{64}$/u);
  // Stable per user — Anthropic correlates a repeat offender, which is what the field is for.
  expect(anthropicUserIdDigest(connection.ownerId)).toBe(anthropicUserIdDigest(connection.ownerId));
  expect(warnings).toEqual([]);
});

test("the six allowlisted keys ride through, validated", () => {
  const warnings: ResolvedWarning[] = [];
  const out = anthropicExtras(
    connectionWith({
      speed: "fast",
      inferenceGeo: "us",
      taskBudget: { type: "tokens", total: 100_000 },
      fallbacks: [{ model: "claude-opus-4-5-20251101", speed: "standard" }],
      contextManagement: { edits: [{ type: "clear_thinking_20251015", keep: { type: "thinking_turns", value: 2 } }] },
    }),
    warnings,
  );

  expect(out["speed"]).toBe("fast");
  expect(out["inferenceGeo"]).toBe("us");
  expect(out["taskBudget"]).toMatchObject({ type: "tokens", total: 100_000 });
  expect(out["fallbacks"]).toMatchObject([{ model: "claude-opus-4-5-20251101" }]);
  expect(out["contextManagement"]).toMatchObject({ edits: [{ type: "clear_thinking_20251015" }] });
  expect(warnings).toEqual([]);
});

test("the three AGENT-SHAPED keys the SDK models are REFUSED, loudly — they make the provider act", () => {
  // `mcpServers` is an egress decision plus a second credential store; `container` is provider-side tool
  // execution (ours runs under the host principal, D152); `toolStreaming` streams input parts the reducer
  // has no kind for. All three are refusals, not gaps, and a silent one would look like support.
  const warnings: ResolvedWarning[] = [];
  const out = anthropicExtras(
    connectionWith({ mcpServers: [{ type: "url", name: "x", url: "https://x" }], container: { id: "c" }, toolStreaming: true }),
    warnings,
  );

  expect(out["mcpServers"]).toBeUndefined();
  expect(out["container"]).toBeUndefined();
  expect(out["toolStreaming"]).toBeUndefined();
  expect(keysOf(warnings).toSorted()).toEqual(["container", "mcpServers", "toolStreaming"]);
  expect(warnings.every((w) => w.code === "custom_parameters_ignored")).toBe(true);
});

test("a MODELLED knob cannot be taken from the turn through extras (D143(b)/D156 — modelled wins)", () => {
  // `thinking` is the funnel's decision. It is not in the allowlist, so it drops like any unknown key —
  // which is the belt, expressed as an absence rather than as a special case.
  const warnings: ResolvedWarning[] = [];
  const out = anthropicExtras(connectionWith({ thinking: { type: "disabled" }, cacheControl: { type: "ephemeral" } }), warnings);

  expect(out["thinking"]).toBeUndefined();
  expect(out["cacheControl"]).toBeUndefined();
  expect(keysOf(warnings).toSorted()).toEqual(["cacheControl", "thinking"]);
});

test("an allowlisted key with a MALFORMED value drops loudly rather than riding as-is", () => {
  const warnings: ResolvedWarning[] = [];
  const out = anthropicExtras(connectionWith({ speed: "blazing", taskBudget: { type: "tokens" } }), warnings);

  expect(out["speed"]).toBeUndefined();
  expect(out["taskBudget"]).toBeUndefined();
  expect(keysOf(warnings).toSorted()).toEqual(["speed", "taskBudget"]);
});
