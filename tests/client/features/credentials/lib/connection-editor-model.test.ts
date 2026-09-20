// The connection editor's pure model (inference program §5.3a, step 9). These pin the claims the RENDER
// cannot: the fold behind each source line, the completeness of the quirk leaf table, and the shape of the
// `declared` patch a per-field Override writes.
//
// The CT beside this file (`components/connection-editor.ct.tsx`) pins what a user SEES; this pins what the
// surface is allowed to SAY. The split matters because the whole block is a diagnostics surface: a source
// line that is merely plausible is the defect.

import type { Capability, DeclaredCapability, EndpointFeatures } from "@orb/contracts/inference";
import { describe } from "vitest";
import {
  beltKeyGloss,
  capabilityBadges,
  declaredOverrideCount,
  extrasFromRows,
  hostNamedInAllowlist,
  inferredKindOf,
  rowsFromExtras,
} from "../../../../../packages/client/src/features/credentials/lib/connection-editor-model.ts";
import type { FactRow } from "../../../../../packages/client/src/features/credentials/lib/connection-fact-model.ts";
import {
  capabilityFactRows,
  QUIRK_LEAF_PATH_LIST,
  QUIRK_ROW_PATHS,
  quirkFactRows,
  withDeclaredOverride,
  withoutDeclaredOverride,
} from "../../../../../packages/client/src/features/credentials/lib/connection-fact-model.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const VLLM_FEATURES = {
  prefill: "continue-final-message",
  strictJson: "default-on",
  effort: "reasoning_effort",
  sleep: { isSleepingPath: "/is_sleeping", wakePath: "/wake_up" },
  rerankPath: "/rerank",
  reasoningKeys: ["reasoning", "reasoning_content"],
  prefillSuppressesThinking: true,
} as const satisfies EndpointFeatures;

const GENERATION: Capability = {
  kind: "generation",
  generation: {
    reasoning: { mode: "effort", enabled: true },
    sampling: {},
    input: ["text"],
    output: { maxTokens: { min: 1, max: 8192 }, modalities: ["text"], structured: true },
    context: { window: 32_768 },
    tools: { parallel: true },
  },
};

function rowFor(rows: readonly FactRow[], path: string): FactRow {
  const row = rows.find((candidate) => candidate.path === path);
  if (row === undefined) {
    throw new Error(`no fact row at ${path} — rows: ${rows.map((candidate) => candidate.path).join(", ")}`);
  }
  return row;
}

// THE HALF `tsc` CANNOT DO. `QUIRK_LEAF_PATHS` is a `Record` over `EndpointFeatures`'s own keys, so a NEW
// feature key is a compile error there — but nothing makes the leaf ROWS agree with it, and a leaf with no
// row is a quirk that silently never renders while the map looks complete.
describe("the quirk leaf table is complete in both directions", () => {
  test("every declared leaf path has a row, and no row names a path the map does not declare", () => {
    expect([...QUIRK_ROW_PATHS].sort()).toStrictEqual([...QUIRK_LEAF_PATH_LIST].sort());
  });
});

describe("a quirk row's source line names the layer it actually came from", () => {
  test("a provider-row field says so, by the provider's user-facing label", () => {
    const rows = quirkFactRows(VLLM_FEATURES, undefined, "vLLM");
    expect(rowFor(rows, "features.prefill")).toMatchObject({
      name: "prefill",
      value: "continue-final-message",
      source: "from the vLLM provider row",
      overridden: false,
    });
  });

  // The wire's own defaults (`WIRE_DEFAULT_FEATURES`) reach the fold too, and a row that attributed them to
  // the provider would be a false citation in a block whose whole job is citation.
  test("a field only the WIRE default sets is not attributed to the provider", () => {
    const rows = quirkFactRows(VLLM_FEATURES, undefined, "vLLM");
    expect(rowFor(rows, "features.concurrency.embed").source).toBe("the default for this kind of server");
  });

  // §5.3a's honesty guarantee: the thing you overrode is never hidden by the override.
  test("an overridden field RESTATES the value it replaced", () => {
    const rows = quirkFactRows(VLLM_FEATURES, { strictJson: "declared-only" }, "vLLM");
    expect(rowFor(rows, "features.strictJson")).toMatchObject({
      value: "declared-only",
      source: "your override — the vLLM provider row says default-on",
      overridden: true,
    });
  });

  // §5.3a's KEY rule: raw only where the string IS the wire's. `prefill` is the one case; the rest are our
  // own TypeScript property names, which no server's documentation contains.
  test("writes our own schema property names in plain words and keeps the wire's string in the value", () => {
    const rows = quirkFactRows(VLLM_FEATURES, undefined, "vLLM");
    expect(rowFor(rows, "features.reasoningKeys")).toMatchObject({ name: "reasoning fields", value: "reasoning, reasoning_content" });
    expect(rows.map((row) => row.name)).not.toContain("reasoningKeys");
    expect(rows.map((row) => row.name)).not.toContain("prefillSuppressesThinking");
  });
});

describe("the capability block is honest about what it cannot know", () => {
  const declared: DeclaredCapability = { generation: { context: { window: 65_536 } } };

  // #2478: `connection.capabilities` returns the FOLDED descriptor only, so there is no prior value to
  // restate. The row says "your override" and invents nothing.
  test("without a baseline, an overridden row states the override and no replaced value", () => {
    const rows = capabilityFactRows(GENERATION, declared);
    expect(rowFor(rows, "generation.context.window")).toMatchObject({ source: "your override", overridden: true });
  });

  // THE #2478 SEAM. Wiring `CapabilityRead.baseline` is this parameter and nothing else.
  test("with a baseline, the same row restates what it replaced", () => {
    const baseline: Capability = { kind: "generation", generation: { ...GENERATION.generation, context: { window: 32_768 } } };
    const rows = capabilityFactRows(GENERATION, declared, baseline);
    expect(rowFor(rows, "generation.context.window").source).toBe("your override — it was 32,768 tokens");
  });

  test("a row nobody declared says where the value comes from without claiming a tier it cannot prove", () => {
    expect(rowFor(capabilityFactRows(GENERATION, null), "generation.tools.parallel").source).toBe("what this server and model report");
  });
});

describe("a per-field Override writes exactly one leaf", () => {
  test("mints the intermediate objects the path needs and leaves the siblings alone", () => {
    const rows = quirkFactRows(VLLM_FEATURES, { strictJson: "declared-only" }, "vLLM");
    const next = withDeclaredOverride({ features: { strictJson: "declared-only" } }, rowFor(rows, "features.sleep.wakePath"), "/resume");
    expect(next).toStrictEqual({ features: { strictJson: "declared-only", sleep: { wakePath: "/resume" } } });
  });

  // `rangeSchema` needs `min` beside `max`, so a bare `max` write would not parse at the verb.
  test("carries the required sibling on the one leaf that has one", () => {
    const rows = capabilityFactRows(GENERATION, null);
    const next = withDeclaredOverride(null, rowFor(rows, "generation.output.maxTokens.max"), 16_384);
    expect(next).toStrictEqual({ generation: { output: { maxTokens: { min: 1, max: 16_384 } } } });
  });

  // An override that leaves `{ generation: { context: {} } }` behind still counts as a stated field to the
  // badge and to the server, which is the whole reason Reset prunes.
  test("Reset prunes every ancestor it empties, and the last reset returns the column's null", () => {
    const rows = capabilityFactRows(GENERATION, { generation: { context: { window: 65_536 } } });
    expect(withoutDeclaredOverride({ generation: { context: { window: 65_536 } } }, rowFor(rows, "generation.context.window"))).toBeNull();
  });
});

describe("the tier count badges count what they claim to", () => {
  test("counts LEAVES, not top-level blocks", () => {
    expect(declaredOverrideCount({ features: { strictJson: "declared-only", prefill: "deliver" }, kind: "embedding" })).toBe(3);
    expect(declaredOverrideCount(null)).toBe(0);
  });
});

describe("the capability rail", () => {
  // §5.3a: where the rail truncates it truncates GREENS LAST, so the rail's ORDER is the truncation order.
  test("puts every servable role before every refusal", () => {
    const badges = capabilityBadges(GENERATION, ["chat", "summarize", "structured"]);
    const firstRefusal = badges.findIndex((badge) => !badge.ok);
    expect(firstRefusal).toBeGreaterThan(0);
    expect(badges.slice(firstRefusal).every((badge) => !badge.ok)).toBe(true);
  });

  // TWO true reasons, one useful one: the provider's `serves` does not list `generateImage` AND the model
  // declares no image output. Only the second is actionable.
  test("prefers the capability reason over the provider reason", () => {
    const badges = capabilityBadges(GENERATION, ["chat"]);
    expect(badges.find((badge) => badge.task === "generateImage")?.reason).toBe("no image output");
    expect(badges.find((badge) => badge.task === "embed")?.reason).toBe("wrong kind");
  });
});

describe("the extras rows", () => {
  test("holds a keyless row in the editor and drops it on the way to the column", () => {
    const rows = [
      { id: "a", key: "top_k", value: "40" },
      { id: "b", key: "", value: "" },
    ];
    expect(extrasFromRows(rows)).toStrictEqual({ ["top_k"]: 40 });
    expect(extrasFromRows([{ id: "b", key: "", value: "" }])).toBeNull();
  });

  test("keeps a non-JSON value as the string the user typed", () => {
    expect(extrasFromRows([{ id: "a", key: "tenant", value: "research" }])).toStrictEqual({ tenant: "research" });
  });

  test("always offers one empty row to type into", () => {
    expect(rowsFromExtras({ ["top_k"]: 40 }, (index) => `id-${String(index)}`)).toStrictEqual([
      { id: "id-0", key: "top_k", value: "40" },
      { id: "id-1", key: "", value: "" },
    ]);
  });

  // One gloss per FAILURE CLASS — the eight belt keys fail in exactly three ways, and a key we do not own
  // gets none at all.
  test("glosses a belt key by its failure class and says nothing about a key we do not own", () => {
    expect(beltKeyGloss("stream")).toContain("how the reply is read back");
    expect(beltKeyGloss("model")).toContain("the connection and the room already decide it");
    expect(beltKeyGloss("truncate_prompt_tokens")).toContain("hangs or 400s the turn");
    expect(beltKeyGloss("top_k")).toBeNull();
  });
});

describe("the admission affordance's deliberately narrow predicate", () => {
  // It is narrower than `infra/network/egress.ts` ON PURPOSE (a client copy of the CIDR + port-precedence
  // rule would be a second truth that drifts). It answers only "is this exact name written down?", so a
  // CIDR-covered host reads as unlisted — additive and harmless — and a listed host is never offered.
  test("matches an exact host and a host:port entry, and does not try to read a CIDR", () => {
    expect(hostNamedInAllowlist("127.0.0.1", ["127.0.0.1"])).toBe(true);
    expect(hostNamedInAllowlist("127.0.0.1", ["127.0.0.1:8000"])).toBe(true);
    expect(hostNamedInAllowlist("ollama.lan", ["OLLAMA.LAN"])).toBe(true);
    expect(hostNamedInAllowlist("192.168.1.7", ["192.168.1.0/24"])).toBe(false);
    expect(hostNamedInAllowlist("127.0.0.1", [])).toBe(false);
  });
});

describe("the inferred kind reads the SERVER's verdict rather than re-spelling the heuristic", () => {
  test("partitions the three kinds off the tasks the domain already folded", () => {
    expect(inferredKindOf(["chat", "summarize"])).toBe("generation");
    expect(inferredKindOf(["embed", "imageEmbed"])).toBe("embedding");
    expect(inferredKindOf(["rerank"])).toBe("rerank");
  });
});
