// The connection editor's pure model (inference program §5.3a, step 9). These pin the claims the RENDER
// cannot: the fold behind each source line, the completeness of the quirk leaf table, and the shape of the
// `declared` patch a per-field Override writes.
//
// The CT beside this file (`components/connection-editor.ct.tsx`) pins what a user SEES; this pins what the
// surface is allowed to SAY. The split matters because the whole block is a diagnostics surface: a source
// line that is merely plausible is the defect.

import type { Capability, DeclaredCapability, EndpointFeatures } from "@orb/contracts/inference";
import { declaredCapabilitySchema, EMBED_SPACE_DIMS, RERANK_MIN_WINDOW_TOKENS } from "@orb/contracts/inference";
import { describe } from "vitest";
import { capabilityFactRows } from "../../../../../packages/client/src/features/credentials/lib/connection-capability-fact-model.ts";
import {
  beltKeyGloss,
  capabilityBadges,
  declaredOverrideCount,
  endpointAuthorityOf,
  endpointNamedInAllowlist,
  extrasFromRows,
  includeBodyText,
  inferredKindOf,
  parseIncludeBody,
  purposeNotes,
  rowsFromExtras,
} from "../../../../../packages/client/src/features/credentials/lib/connection-editor-model.ts";
import type { FactRow } from "../../../../../packages/client/src/features/credentials/lib/connection-fact-model.ts";
import {
  minimumRefusal,
  parseFactValue,
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

  // `connection.capabilities` returns the fold without the row's declaration beside the folded descriptor.
  test("an overridden row restates the baseline value it replaced", () => {
    const baseline: Capability = { kind: "generation", generation: { ...GENERATION.generation, context: { window: 32_768 } } };
    const rows = capabilityFactRows(GENERATION, declared, baseline);
    expect(rowFor(rows, "generation.context.window").source).toBe("your override — it was 32,768 tokens");
  });

  // A declared reranker window below the resolver's floor is raised; the row must not present the raised value as
  // the number the user typed, nor restate the generic override line as if the typed value were in effect.
  test("a declared value the fold raised to its floor is shown as raised, never as the user's own number", () => {
    const baseline: Capability = { kind: "rerank", rerank: { maxInputTokens: 512, input: ["text"], instructionAware: false } };
    const folded: Capability = { kind: "rerank", rerank: { ...baseline.rerank, maxInputTokens: RERANK_MIN_WINDOW_TOKENS } };
    const row = rowFor(capabilityFactRows(folded, { rerank: { maxInputTokens: 2 } }, baseline), "rerank.maxInputTokens");
    expect(row.overridden).toBe(true);
    expect(row.value).toBe(rowFor(capabilityFactRows(folded, null, folded), "rerank.maxInputTokens").value);
    const plain = rowFor(capabilityFactRows(folded, { rerank: { maxInputTokens: RERANK_MIN_WINDOW_TOKENS } }, baseline), "rerank.maxInputTokens");
    expect(row.source).not.toBe(plain.source);
  });

  // The resolver raises a smaller window to its floor, so the override editor refuses one where it is typed.
  test("a reranker window under the floor is refused at entry; the floor itself and every other fact are not", () => {
    const rerank: Capability = { kind: "rerank", rerank: { maxInputTokens: 512, input: ["text"], instructionAware: false } };
    const window = rowFor(capabilityFactRows(rerank, null, rerank), "rerank.maxInputTokens");
    expect(minimumRefusal(window.edit, String(RERANK_MIN_WINDOW_TOKENS - 1))).not.toBeNull();
    expect(minimumRefusal(window.edit, String(RERANK_MIN_WINDOW_TOKENS))).toBeNull();
    const context = rowFor(capabilityFactRows(GENERATION, null, GENERATION), "generation.context.window");
    expect(minimumRefusal(context.edit, "1")).toBeNull();
  });

  test("a row nobody declared says where the value comes from without claiming a tier it cannot prove", () => {
    expect(rowFor(capabilityFactRows(GENERATION, null, GENERATION), "generation.tools").source).toBe("what this server and model report");
  });
});

// An own-server model the app knows nothing about: the kind floor, nothing stated about tools or structured
// output, and a window nobody reported.
const LOCAL_FLOOR: Capability = {
  kind: "generation",
  generation: {
    reasoning: { mode: "none", enabled: false },
    sampling: {},
    input: ["text"],
    output: { maxTokens: { min: 1, max: 4096 }, modalities: ["text"], maxTokensEstimated: true },
    context: { window: 8192, windowEstimated: true },
  },
};

describe("an own-server model can declare what the app has no value for", () => {
  // The Game-mode trap: a row skipped for want of a value is a fact the user can never state.
  test("unstated tool calls and structured output still render, each with an Override", () => {
    const rows = capabilityFactRows(LOCAL_FLOOR, null, LOCAL_FLOOR);
    for (const path of ["generation.tools", "generation.output.structured"]) {
      expect(rowFor(rows, path)).toMatchObject({ value: "not stated", overridden: false });
    }
  });

  // `tools` present IS "accepts tools[]"; `parallel` is its one required field, so this one write declares it.
  test("declaring tool calls writes the whole tools block the schema requires", () => {
    const row = rowFor(capabilityFactRows(LOCAL_FLOOR, null, LOCAL_FLOOR), "generation.tools");
    const declared = withDeclaredOverride(null, row, parseFactValue(row.edit, row.draft));
    expect(declared).toStrictEqual({ generation: { tools: { parallel: false } } });
    expect(declaredCapabilitySchema.safeParse(declared).success).toBe(true);
  });

  test("an overridden row restates the baseline it replaced, including a value nobody stated", () => {
    const declared: DeclaredCapability = { generation: { tools: { parallel: true } } };
    const capability: Capability = { kind: "generation", generation: { ...LOCAL_FLOOR.generation, tools: { parallel: true } } };
    expect(rowFor(capabilityFactRows(capability, declared, LOCAL_FLOOR), "generation.tools")).toMatchObject({
      overridden: true,
      source: "your override — it was not stated",
    });
  });
});

// A server can report tool calls it then refuses (llama.cpp without `--jinja`) or a model can use them badly;
// the no is the declared absence the resolver folds over a reported yes.
describe("tool calls can be declared off over a reported yes", () => {
  const reported: Capability = { kind: "generation", generation: { ...LOCAL_FLOOR.generation, tools: { parallel: false, silencesProse: true } } };

  test("the no writes the declared absence, which parses and counts as one override", () => {
    const row = rowFor(capabilityFactRows(reported, null, reported), "generation.tools");
    expect(row).toMatchObject({ value: "yes, one at a time", overridden: false });
    const declared = withDeclaredOverride(null, row, parseFactValue(row.edit, "no"));
    expect(declared).toStrictEqual({ generation: { tools: null } });
    expect(declaredCapabilitySchema.safeParse(declared).success).toBe(true);
    expect(declaredOverrideCount(declared)).toBe(1);
  });

  test("the overridden row reads no, restates the reported yes, and Reset returns to it", () => {
    const declared: DeclaredCapability = { generation: { tools: null } };
    const { tools: _dropped, ...folded } = reported.generation;
    const row = rowFor(capabilityFactRows({ kind: "generation", generation: folded }, declared, reported), "generation.tools");
    expect(row).toMatchObject({ value: "no", overridden: true, draft: "no", source: "your override — it was yes, one at a time" });
    expect(withoutDeclaredOverride(declared, row)).toBeNull();
  });

  test("a floor-guessed window and output cap read as assumed; a stated one does not", () => {
    const rows = capabilityFactRows(LOCAL_FLOOR, null, LOCAL_FLOOR);
    expect(rowFor(rows, "generation.context.window").value).toBe("8,192 tokens (assumed)");
    expect(rowFor(rows, "generation.output.maxTokens.max").value).toBe("4,096 tokens (assumed)");
    expect(rowFor(capabilityFactRows(GENERATION, null, GENERATION), "generation.context.window").value).toBe("32,768 tokens");
  });

  // Ollama, LM Studio and Custom rows set no rerank path or image arm, so those quirks had no row at all.
  test("an own-server row lists the declarable quirks nothing sets; a hosted row does not", () => {
    const own = quirkFactRows({ prefill: "none" }, undefined, "Ollama", true);
    expect(rowFor(own, "features.rerankPath")).toMatchObject({ overridden: false, draft: "" });
    expect(rowFor(own, "features.images")).toMatchObject({ overridden: false, draft: "images-api" });
    expect(own.map((row) => row.path)).not.toContain("features.sleep.wakePath"); // a lone half would not parse
    expect(quirkFactRows({ prefill: "none" }, undefined, "Ollama").map((row) => row.path)).not.toContain("features.rerankPath");
    expect(withDeclaredOverride(null, rowFor(own, "features.rerankPath"), "/v1/rerank")).toStrictEqual({ features: { rerankPath: "/v1/rerank" } });
  });

  test("the Purpose tier notes the unstated and guessed facts, the tool and structured ones on own-server rows only", () => {
    expect(purposeNotes(LOCAL_FLOOR, true)).toHaveLength(3);
    expect(purposeNotes(LOCAL_FLOOR, false)).toHaveLength(1);
    expect(purposeNotes(GENERATION, true)).toHaveLength(0);
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
    const rows = capabilityFactRows(GENERATION, null, GENERATION);
    const next = withDeclaredOverride(null, rowFor(rows, "generation.output.maxTokens.max"), 16_384);
    expect(next).toStrictEqual({ generation: { output: { maxTokens: { min: 1, max: 16_384 } } } });
  });

  // An override that leaves `{ generation: { context: {} } }` behind still counts as a stated field to the
  // badge and to the server, which is the whole reason Reset prunes.
  test("Reset prunes every ancestor it empties, and the last reset returns the column's null", () => {
    const rows = capabilityFactRows(GENERATION, { generation: { context: { window: 65_536 } } }, GENERATION);
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

  // "wrong vector width" alone does not say which way; a 768-wide local embedder must read as too narrow.
  test("a vector-width refusal names both widths", () => {
    const narrow: Capability = {
      kind: "embedding",
      embedding: { dims: 768, mrl: true, maxInputTokens: 8192, input: ["text"], output: ["vector"], instructionAware: false },
    };
    const reason = capabilityBadges(narrow, ["embed", "imageEmbed"]).find((badge) => badge.task === "embed")?.reason ?? "";
    expect(reason).toContain("768");
    expect(reason).toContain(String(EMBED_SPACE_DIMS));
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
    expect(endpointNamedInAllowlist("127.0.0.1", ["127.0.0.1"])).toBe(true);
    expect(endpointNamedInAllowlist("127.0.0.1", ["127.0.0.1:8000"])).toBe(false);
    expect(endpointNamedInAllowlist("ollama.lan", ["OLLAMA.LAN"])).toBe(true);
    expect(endpointNamedInAllowlist("192.168.1.7", ["192.168.1.0/24"])).toBe(false);
    expect(endpointNamedInAllowlist("127.0.0.1", [])).toBe(false);
  });
});

describe("the inferred kind reads the SERVER's verdict rather than re-spelling the heuristic", () => {
  test("partitions the three kinds off the tasks the domain already folded", () => {
    expect(inferredKindOf(["chat", "summarize"])).toBe("generation");
    expect(inferredKindOf(["embed", "imageEmbed"])).toBe("embedding");
    expect(inferredKindOf(["rerank"])).toBe("rerank");
  });
});

test.each([
  ["http://HOST.lan/v1", "host.lan:80"],
  ["https://host.lan:443/v1", "host.lan:443"],
  ["http://127.0.0.1:8000/v1", "127.0.0.1:8000"],
  ["http://[::1]:8000/v1", "[::1]:8000"],
  ["https://[fd00::1]/v1", "[fd00::1]:443"],
  ["file:///tmp/service", null],
  ["ftp://host.lan:8000", null],
  ["not a URL", null],
  [null, null],
])("admission derives the exact authority of %s", (url, expected) => {
  expect(endpointAuthorityOf(url)).toBe(expected);
});
test("another port on the same host does not hide admission of this endpoint", () => {
  expect(endpointNamedInAllowlist("127.0.0.1:8000", ["127.0.0.1:8001"])).toBe(false);
  expect(endpointNamedInAllowlist("127.0.0.1:8000", ["127.0.0.1:8000"])).toBe(true);
});

// A local server that states its modalities (D292) reads as reported; a row the posture widened reads as the
// guess it is. Without the mark, the permissive image + video guess read as "what this server and model report".
describe("the takes row is honest about a guessed modality list", () => {
  test("a widened list reads assumed and names the override; a stated list reads reported", () => {
    const widened: Capability = {
      kind: "generation",
      generation: { ...LOCAL_FLOOR.generation, input: ["text", "image", "video"], modalitiesEstimated: true },
    };
    const guessed = rowFor(capabilityFactRows(widened, null, widened), "generation.input");
    expect(guessed.value).toBe("text, image, video (assumed)");
    expect(guessed.source).not.toBe("what this server and model report");
    const stated: Capability = { kind: "generation", generation: { ...LOCAL_FLOOR.generation, input: ["text", "image"], tools: { parallel: false } } };
    const rows = capabilityFactRows(stated, null, stated);
    expect(rowFor(rows, "generation.input")).toMatchObject({ value: "text, image", source: "what this server and model report" });
    expect(rowFor(rows, "generation.tools")).toMatchObject({ value: "yes, one at a time", source: "what this server and model report" });
  });
});

// "Fields to add or replace" validates with the canonical transport schema: what it refuses never reaches a save.
describe("the request-body overrides field saves only what the transport schema accepts", () => {
  test("a JSON object saves as written; empty text and an empty object clear it", () => {
    expect(parseIncludeBody('{ "top_k": 40, "options": { "num_ctx": 8192 } }')).toEqual({
      ok: true,
      includeBody: { ["top_k"]: 40, options: { ["num_ctx"]: 8192 } },
    });
    expect(parseIncludeBody("   ")).toEqual({ ok: true, includeBody: undefined });
    expect(parseIncludeBody("{}")).toEqual({ ok: true, includeBody: undefined });
  });

  test("text that is not one JSON object is refused with a reason", () => {
    for (const raw of ['{ "top_k": 40', "[1, 2]", "40", '"top_k"', "null"]) {
      expect(parseIncludeBody(raw).ok, raw).toBe(false);
    }
  });

  test("the saved object reads back as the text it parses from", () => {
    const includeBody = { ["top_k"]: 40, stop: ["</s>"] };
    expect(parseIncludeBody(includeBodyText(includeBody))).toEqual({ ok: true, includeBody });
    expect(includeBodyText(undefined)).toBe("");
  });
});
