import "@orb/testkit/node/composed-real.ts";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";

const MODEL = "cross-encoder/ettin-reranker-17m-v1";
const KERNEL = new URL("./reference-head-kernel.ts", import.meta.url);
const DOCUMENTS = [
  { id: "negative", text: "negative" },
  { id: "positive", text: "positive" },
];

// Independent F32 inputs and float64 reference scores; no production arithmetic is copied into this proof.
function safetensors(tensors: Record<string, readonly number[]>): Uint8Array {
  let offset = 0;
  const header: Record<string, { dtype: string; shape: number[]; ["data_offsets"]: [number, number] }> = {};
  for (const [name, values] of Object.entries(tensors)) {
    header[name] = { dtype: "F32", shape: [values.length], ["data_offsets"]: [offset, offset + values.length * 4] };
    offset += values.length * 4;
  }
  const json = new TextEncoder().encode(JSON.stringify(header));
  const bytes = new Uint8Array(8 + json.length + offset);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(json.length), true);
  bytes.set(json, 8);
  bytes.set(new Uint8Array(new Float32Array(Object.values(tensors).flat()).buffer), 8 + json.length);
  return bytes;
}

async function stageTokenizer(directory: string, metadataDirectory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "tokenizer_config.json"),
    JSON.stringify({
      ["tokenizer_class"]: "BertTokenizer",
      ["model_max_length"]: 2048,
      ["unk_token"]: "[UNK]",
      ["sep_token"]: "[SEP]",
      ["pad_token"]: "[PAD]",
      ["cls_token"]: "[CLS]",
      ["mask_token"]: "[MASK]",
    }),
  );
  // Native tokenizer discovery reads main metadata before loading the caller's pinned revision.
  await mkdir(metadataDirectory, { recursive: true });
  await writeFile(join(metadataDirectory, "tokenizer_config.json"), await readFile(join(directory, "tokenizer_config.json")));
  await writeFile(
    join(directory, "tokenizer.json"),
    JSON.stringify({
      version: "1.0",
      truncation: null,
      padding: null,
      ["added_tokens"]: ["[PAD]", "[UNK]", "[CLS]", "[SEP]", "[MASK]"].map((content, id) => ({
        id,
        content,
        ["single_word"]: false,
        lstrip: false,
        rstrip: false,
        normalized: false,
        special: true,
      })),
      normalizer: { type: "BertNormalizer", ["clean_text"]: true, ["handle_chinese_chars"]: true, ["strip_accents"]: null, lowercase: true },
      ["pre_tokenizer"]: { type: "BertPreTokenizer" },
      ["post_processor"]: { type: "BertProcessing", sep: ["[SEP]", 3], cls: ["[CLS]", 2] },
      decoder: { type: "WordPiece", prefix: "##", cleanup: true },
      model: {
        type: "WordPiece",
        ["unk_token"]: "[UNK]",
        ["continuing_subword_prefix"]: "##",
        ["max_input_chars_per_word"]: 100,
        vocab: { "[PAD]": 0, "[UNK]": 1, "[CLS]": 2, "[SEP]": 3, "[MASK]": 4, negative: 5, positive: 6, query: 7 },
      },
    }),
  );
}

async function stageHead(directory: string): Promise<void> {
  for (const [file, bytes] of [
    ["1_Pooling/config.json", JSON.stringify({ ["pooling_mode"]: "cls" })],
    ["2_Dense/config.json", JSON.stringify({ ["in_features"]: 3, ["out_features"]: 3, ["activation_function"]: "torch.nn.modules.activation.GELU" })],
    ["2_Dense/model.safetensors", safetensors({ "linear.weight": [0.5, -1, 0.25, 1.5, 0, -0.5, -0.75, 2, 1] })],
    ["3_LayerNorm/model.safetensors", safetensors({ "norm.weight": [1, 0.5, 2], "norm.bias": [0.1, -0.2, 0] })],
    ["4_Dense/config.json", JSON.stringify({ ["in_features"]: 3, ["out_features"]: 1, ["activation_function"]: "torch.nn.modules.linear.Identity" })],
    ["4_Dense/model.safetensors", safetensors({ "linear.weight": [0.3, -0.6, 0.9], "linear.bias": [0.05] })],
  ] as const) {
    const path = join(directory, file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  }
}

async function bindReranker(harness: Awaited<ReturnType<typeof createServerHarness>>): Promise<{
  clients: Awaited<ReturnType<typeof harness.app.roleClientsFor>>;
  directory: string;
  metadataDirectory: string;
}> {
  const principal = await harness.principalFor(harness.ownerId);
  const connection = await harness.services.connection.create({
    principal,
    providerId: "local-light",
    credentialId: null,
    baseUrl: null,
    model: MODEL,
    allowBackground: true,
  });
  const binding = await harness.services.connection.setBinding({ principal, task: "rerank", connectionId: connection.id });
  expect(binding.connectionId).toBe(connection.id);
  const clients = await harness.app.roleClientsFor(principal.userId);
  const resolved = await clients.resolved("rerank");
  expect(resolved?.connectionId).toBe(connection.id);
  if (resolved?.capability.kind !== "rerank" || resolved.capability.rerank.onnx?.head !== "sentence-transformers") {
    throw new Error("the persisted model did not resolve its native sentence-transformers serving");
  }
  const revision = resolved.capability.rerank.onnx.revision;
  if (revision === undefined) {
    throw new Error("the curated model did not pin its actual head revision");
  }
  return { clients, directory: join(harness.modelCacheDir, resolved.model, revision), metadataDirectory: join(harness.modelCacheDir, resolved.model) };
}

test("independent roots run native tokenizer/cache/head scoring without sessions or downloads and survive out-of-order disposal", async () => {
  await using first = await createServerHarness({ modelKernelModule: KERNEL.href });
  await using second = await createServerHarness({ modelKernelModule: KERNEL.href });
  expect(first.ownerId).toBe(second.ownerId);
  const firstModel = await bindReranker(first);
  const secondModel = await bindReranker(second);
  await Promise.all(
    [firstModel, secondModel].map(async ({ directory, metadataDirectory }) => {
      await stageTokenizer(directory, metadataDirectory);
      await stageHead(directory);
    }),
  );
  for (const { clients } of [firstModel, secondModel]) {
    const result = await clients.rerank("query", DOCUMENTS);
    expect(result.hits.map((hit) => hit.id)).toEqual(["positive", "negative"]);
    expect(result.hits[0]?.score).toBeCloseTo(2.719_510_879, 5);
    expect(result.hits[1]?.score).toBeCloseTo(-0.030_789_157, 5);
  }
  for (const root of [first, second]) {
    const recorded = await readFile(join(root.modelCacheDir, "kernel-execution.jsonl"), "utf8");
    expect(recorded).toContain('"sessions":0,"nativeModel":true');
    expect(recorded).toContain('"nativeTensor":true');
    expect(recorded).not.toContain('"hub-fetch"');
  }
  await first[Symbol.asyncDispose]();
  await expect(access(first.modelCacheDir)).rejects.toMatchObject({ code: "ENOENT" });
  const again = await secondModel.clients.rerank("query", DOCUMENTS);
  expect(again.hits[0]?.score).toBeCloseTo(2.719_510_879, 5);
  expect((await readFile(join(second.modelCacheDir, "kernel-execution.jsonl"), "utf8")).match(/"model-forward"/g)).toHaveLength(2);
});

test("the actual native Hub and missing head-file reads hit the worker-owned refusal hook before external execution", async () => {
  const hubKernel = new URL(KERNEL);
  hubKernel.searchParams.set("hub-refusal", "1");
  for (const kernel of [hubKernel, KERNEL]) {
    await using harness = await createServerHarness({ modelKernelModule: kernel.href, allowRemoteModels: true });
    const { clients, directory, metadataDirectory } = await bindReranker(harness);
    await stageTokenizer(directory, metadataDirectory);
    if (kernel === hubKernel) {
      await stageHead(directory);
    }
    await expect(clients.rerank("query", DOCUMENTS)).rejects.toThrow("reference kernel: unscripted Hub execution refused");
    const recorded = await readFile(join(harness.modelCacheDir, "kernel-execution.jsonl"), "utf8");
    expect(recorded).toContain('"edge":"hub-fetch"');
    expect(recorded).toContain(kernel === hubKernel ? "config.json" : "1_Pooling/config.json");
    expect(recorded).not.toContain(".onnx");
    expect(recorded).not.toContain('"model-forward"');
  }
});

test("an unscripted root refuses model execution before loading its native module", async () => {
  await using harness = await createServerHarness();
  const { clients } = await bindReranker(harness);
  await expect(clients.rerank("query", DOCUMENTS)).rejects.toThrow("server harness: unscripted external model execution");
});
