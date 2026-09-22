// The model display-name derivation (#115). The cases are the THREE identifier shapes a backend actually
// hands us plus the degenerate ones, because the whole point of the primitive is that a call site cannot
// know which shape it got: a hosted route, a HuggingFace org/repo ref, and a local weights path all arrive
// through the same `string`.
import { modelDisplayName } from "@orb/kit/model-name";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

// The identifier that motivated the primitive — 106 characters, rendered twice in one panel.
const LOCAL_QUANT_PATH = "/mnt/models/storage/vllm-models/quantized/Huihui-ThinkingCap-Qwen3.6-27B-abliterated-W8A8-Dynamic-Per-Token";

describe("modelDisplayName", () => {
  test("reduces a local weights path to its basename and folds the quant modifiers into one tag", () => {
    expect(modelDisplayName(LOCAL_QUANT_PATH)).toBe("Huihui-ThinkingCap-Qwen3.6-27B-abliterated · W8A8");
  });

  test("shortens the motivating path by more than half — the defect was its LENGTH", () => {
    expect(LOCAL_QUANT_PATH.length).toBeGreaterThan(100);
    expect(modelDisplayName(LOCAL_QUANT_PATH).length).toBeLessThan(LOCAL_QUANT_PATH.length / 2);
  });

  test("drops the org prefix of a hosted route and of a HuggingFace ref", () => {
    expect(modelDisplayName("anthropic/claude-sonnet-5")).toBe("claude-sonnet-5");
    expect(modelDisplayName("Qwen/Qwen3-30B-A3B-Instruct-2507")).toBe("Qwen3-30B-A3B-Instruct-2507");
  });

  test("leaves a bare id untouched", () => {
    expect(modelDisplayName("gpt-5-mini")).toBe("gpt-5-mini");
  });

  // A3B is Qwen's ACTIVE-parameter count and 30B its size — both are identity, not build detail. A
  // derivation that ate either would rename the model.
  test("keeps architecture sizes — only a quant SCHEME ends the name", () => {
    expect(modelDisplayName("Qwen/Qwen3-30B-A3B-Instruct-2507-W8A8")).toBe("Qwen3-30B-A3B-Instruct-2507 · W8A8");
    expect(modelDisplayName("meta-llama/Llama-3.1-8B-Instruct")).toBe("Llama-3.1-8B-Instruct");
  });

  test.each([
    ["Mistral-7B-Instruct-v0.2-AWQ", "Mistral-7B-Instruct-v0.2 · AWQ"],
    ["TheBloke/Llama-2-13B-GPTQ", "Llama-2-13B · GPTQ"],
    ["Qwen3-8B-FP8", "Qwen3-8B · FP8"],
    ["some-model-INT4", "some-model · INT4"],
    ["some-model-4bit", "some-model · 4bit"],
    ["Meta-Llama-3-8B-Instruct-Q4_K_M", "Meta-Llama-3-8B-Instruct · Q4"],
    ["deepseek-r1-W4A16-channelwise", "deepseek-r1 · W4A16"],
  ])("splits the quant scheme off %s", (input, expected) => {
    expect(modelDisplayName(input)).toBe(expected);
  });

  test("underscore-separated names keep their own separators (no split/re-join)", () => {
    expect(modelDisplayName("my_local_model_Q8_0")).toBe("my_local_model · Q8");
  });

  test("strips a weights-file extension before reading the name", () => {
    expect(modelDisplayName("/models/llama-3-8b-Q4_K_M.gguf")).toBe("llama-3-8b · Q4");
    expect(modelDisplayName("/models/mixtral-8x7b.safetensors")).toBe("mixtral-8x7b");
  });

  // A trailing slash on a directory-style path must not read as "no name" — `.at(-1)` on an unfiltered
  // split would hand back the empty segment.
  test("tolerates a trailing slash", () => {
    expect(modelDisplayName("/media/models/Qwen3-8B-FP8/")).toBe("Qwen3-8B · FP8");
  });

  test.each(["", "   ", "/", "///"])("falls back for the unusable identifier %o", (input) => {
    expect(modelDisplayName(input)).toBe("unknown model");
  });

  test("falls back when the weights-extension strip eats the whole basename", () => {
    expect(modelDisplayName(".gguf")).toBe("unknown model");
    expect(modelDisplayName("/models/.safetensors")).toBe("unknown model");
    expect(modelDisplayName("/.bin")).toBe("unknown model");
  });

  // A basename that is nothing BUT a quant tag has no identity to split off — printing " · W8A8" with an
  // empty head would be worse than printing the tag.
  test("prints a quant-only basename whole", () => {
    expect(modelDisplayName("/models/W8A8")).toBe("W8A8");
    expect(modelDisplayName("-W8A8")).toBe("-W8A8");
  });

  test("is idempotent on its own output for the simple arm", () => {
    expect(modelDisplayName(modelDisplayName("anthropic/claude-sonnet-5"))).toBe("claude-sonnet-5");
  });
});
