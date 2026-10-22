import "@orb/testkit/node/composed-real.ts";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { BroadcastChannel } from "node:worker_threads";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { sql } from "drizzle-orm";
import { vi } from "vitest";
import { createFrozenClock } from "../iso/clock.ts";
import { createControlledTimers } from "../iso/timers.ts";
import { KERNEL_HOLD } from "./reference-head-kernel.ts";

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
    expect(recorded).toContain('"device":"cpu"');
    expect(recorded).toContain('"nativeTensor":true');
    expect(recorded).not.toContain('"hub-fetch"');
  }
  await first[Symbol.asyncDispose]();
  await expect(access(first.modelCacheDir)).rejects.toMatchObject({ code: "ENOENT" });
  const again = await secondModel.clients.rerank("query", DOCUMENTS);
  expect(again.hits[0]?.score).toBeCloseTo(2.719_510_879, 5);
  expect((await readFile(join(second.modelCacheDir, "kernel-execution.jsonl"), "utf8")).match(/"model-forward"/g)).toHaveLength(2);
});

test("root disposal joins a synchronous native kernel after its close deadline before removing the database and cache", async () => {
  await using resources = new AsyncDisposableStack();
  const parent = await mkdtemp(join(tmpdir(), "orb-kernel-hold-"));
  resources.defer(() => rm(parent, { recursive: true, force: true }));
  const channel = new BroadcastChannel(parent);
  resources.defer(() => channel.close());
  const shared = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const state = new Int32Array(shared);
  const blocked = Promise.withResolvers<void>();
  channel.onmessage = ({ data }): void => {
    if (data === KERNEL_HOLD.ready) {
      channel.postMessage(shared);
    } else if (data === KERNEL_HOLD.blocked) {
      blocked.resolve();
    }
  };
  const kernel = new URL(KERNEL);
  kernel.searchParams.set(KERNEL_HOLD.parameter, parent);
  const clock = createFrozenClock();
  // biome-ignore lint/nursery/useDisposables: the root adopts this scheduler; the case observes its actual shutdown deadline.
  const timers = createControlledTimers(clock);
  await using first = await createServerHarness({ modelKernelModule: kernel.href, temporaryParentDir: parent, clock, timers });
  await using second = await createServerHarness({ modelKernelModule: KERNEL.href });
  const firstModel = await bindReranker(first);
  const secondModel = await bindReranker(second);
  for (const model of [firstModel, secondModel]) {
    await stageTokenizer(model.directory, model.metadataDirectory);
    await stageHead(model.directory);
  }
  const bounded = Promise.withResolvers<number>();
  const joining = Promise.withResolvers<void>();
  const originalTimeout = timers.timeout;
  let closing = false;
  const timerObserver = vi.spyOn(timers, "timeout").mockImplementation((callback, ms) => {
    const cancel = originalTimeout(callback, ms);
    if (closing) {
      bounded.resolve(ms);
    }
    return cancel;
  });
  const settle = first.app.runtime.localLight.settle;
  let physicallySettled = false;
  const settleObserver = vi.spyOn(first.app.runtime.localLight, "settle").mockImplementation(() => {
    const completion = settle().then(() => {
      physicallySettled = true;
    });
    joining.resolve();
    return completion;
  });
  const result = firstModel.clients.rerank("query", DOCUMENTS).catch((error: Error) => error);
  let disposed = false;
  let disposal: Promise<void> | undefined;
  {
    await using release = new AsyncDisposableStack();
    release.defer(() => timerObserver.mockRestore());
    release.defer(() => settleObserver.mockRestore());
    release.defer(() => settle());
    release.defer(() => disposal ?? first[Symbol.asyncDispose]());
    release.defer(() => {
      Atomics.store(state, 0, 1);
      Atomics.notify(state, 0);
    });
    await blocked.promise;
    closing = true;
    disposal = Promise.resolve(first[Symbol.asyncDispose]()).then(() => {
      disposed = true;
    });
    timers.advance(await bounded.promise);
    expect(await Promise.race([joining.promise.then(() => "joining"), disposal.then(() => "disposed")])).toBe("joining");
    expect((await secondModel.clients.rerank("query", DOCUMENTS)).hits[0]?.score).toBeCloseTo(2.719_510_879, 5);
    expect(disposed).toBe(false);
    expect(physicallySettled).toBe(false);
    expect(await first.db.all(sql`select 1 as live`)).toEqual([{ live: 1 }]);
    await access(first.modelCacheDir);
  }
  expect(await result).toMatchObject({ kind: "server", retryable: true });
  expect(disposed).toBe(true);
  expect(physicallySettled).toBe(true);
  await expect(first.db.all(sql`select 1`)).rejects.toThrow();
  await expect(access(first.modelCacheDir)).rejects.toMatchObject({ code: "ENOENT" });
  expect(first.timers.pending()).toBe(0);
  expect((await secondModel.clients.rerank("query", DOCUMENTS)).hits[0]?.score).toBeCloseTo(2.719_510_879, 5);
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

test.each([
  { file: "1_Pooling/config.json", body: null, label: "pooling config", refusal: "1_Pooling/config.json is malformed" },
  {
    file: "2_Dense/config.json",
    body: { ["in_features"]: 3, ["out_features"]: 3, ["activation_function"]: ["torch.nn.modules.activation.GELU"] },
    label: "dense config",
    refusal: "2_Dense/config.json is malformed",
  },
  {
    file: "2_Dense/config.json",
    body: { ["in_features"]: 3, ["out_features"]: 3, ["activation_function"]: "constructor" },
    label: "inherited activation",
    refusal: "unsupported activation constructor",
  },
])("the real reranker refuses malformed $label before a model forward", async ({ file, body, refusal }) => {
  await using root = await createServerHarness({ modelKernelModule: KERNEL.href });
  const { clients, directory, metadataDirectory } = await bindReranker(root);
  await stageTokenizer(directory, metadataDirectory);
  await stageHead(directory);
  await writeFile(join(directory, file), JSON.stringify(body));
  await expect(clients.rerank("query", DOCUMENTS)).rejects.toThrow(refusal);
  const events = await readFile(join(root.modelCacheDir, "kernel-execution.jsonl"), "utf8");
  expect(events).not.toContain('"model-forward"');
  expect(events).not.toContain('"hub-fetch"');
});

test("fractional safetensors offsets cannot be truncated into a valid-looking scoring tensor", async () => {
  await using root = await createServerHarness({ modelKernelModule: KERNEL.href });
  const { clients, directory, metadataDirectory } = await bindReranker(root);
  await stageTokenizer(directory, metadataDirectory);
  await stageHead(directory);
  const tensor = safetensors({ "linear.weight": [0.5, -1, 0.25, 1.5, 0, -0.5, -0.75, 2, 1] });
  const length = Number(new DataView(tensor.buffer).getBigUint64(0, true));
  const header = new TextEncoder().encode(
    JSON.stringify({
      "linear.weight": { dtype: "F32", shape: [9], ["data_offsets"]: [0.5, 36.5] },
    }),
  );
  const malformed = new Uint8Array(8 + header.length + 36);
  new DataView(malformed.buffer).setBigUint64(0, BigInt(header.length), true);
  malformed.set(header, 8);
  malformed.set(tensor.subarray(8 + length), 8 + header.length);
  await writeFile(join(directory, "2_Dense/model.safetensors"), malformed);
  await expect(clients.rerank("query", DOCUMENTS)).rejects.toThrow("malformed metadata");
  expect(await readFile(join(root.modelCacheDir, "kernel-execution.jsonl"), "utf8")).not.toContain('"model-forward"');
});
