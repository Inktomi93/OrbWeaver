// backends/local-light/st-head — the sentence-transformers CrossEncoder head over in-memory module files. The
// expected scores come from an independent float64 reference (math.erf GELU, torch's LayerNorm eps), so the pin is
// the arithmetic and the safetensors parse, not this implementation agreeing with itself.

import { loadStHead, scoreHiddenStates } from "../../../../packages/inference/src/backends/local-light/st-head.ts";
import { expect, test } from "../../../support/fixtures.ts";

const GELU = "torch.nn.modules.activation.GELU";
const IDENTITY = "torch.nn.modules.linear.Identity";

function safetensors(tensors: Record<string, readonly number[]>): Uint8Array {
  let offset = 0;
  const header: Record<string, { dtype: string; shape: number[]; data_offsets: [number, number] }> = {};
  for (const [name, values] of Object.entries(tensors)) {
    header[name] = { dtype: "F32", shape: [values.length], data_offsets: [offset, offset + values.length * 4] };
    offset += values.length * 4;
  }
  const json = new TextEncoder().encode(JSON.stringify(header));
  const out = new Uint8Array(8 + json.length + offset);
  new DataView(out.buffer).setBigUint64(0, BigInt(json.length), true);
  out.set(json, 8);
  const floats = new Float32Array(Object.values(tensors).flat());
  out.set(new Uint8Array(floats.buffer), 8 + json.length);
  return out;
}

const json = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));

function repo(overrides: Record<string, Uint8Array> = {}): (file: string) => Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {
    "1_Pooling/config.json": json({ pooling_mode: "cls" }),
    "2_Dense/config.json": json({ in_features: 3, out_features: 3, activation_function: GELU }),
    "2_Dense/model.safetensors": safetensors({ "linear.weight": [0.5, -1.0, 0.25, 1.5, 0.0, -0.5, -0.75, 2.0, 1.0] }),
    "3_LayerNorm/model.safetensors": safetensors({ "norm.weight": [1.0, 0.5, 2.0], "norm.bias": [0.1, -0.2, 0.0] }),
    "4_Dense/config.json": json({ in_features: 3, out_features: 1, activation_function: IDENTITY }),
    "4_Dense/model.safetensors": safetensors({ "linear.weight": [0.3, -0.6, 0.9], "linear.bias": [0.05] }),
    ...overrides,
  };
  return (file) => {
    const bytes = files[file];
    // As `fs.readFile` returns it: a Buffer, whose `slice` is a view into a shared pool, not a copy.
    return bytes === undefined ? Promise.reject(new Error(`no ${file}`)) : Promise.resolve(Buffer.from(bytes));
  };
}

test("scores each row from its CLS token through Dense+GELU, LayerNorm and the scoring Dense", async () => {
  const head = await loadStHead(repo());
  // [2 rows, 2 tokens, 3 dims]; the second token of each row must not move the score.
  const hidden = new Float32Array([0.2, -0.4, 1.0, 9, 9, 9, -1.0, 0.5, 0.3, -9, 9, -9]);
  const scores = scoreHiddenStates(head, hidden, [2, 2, 3]);
  expect(scores[0]).toBeCloseTo(-0.030_789_157, 5);
  expect(scores[1]).toBeCloseTo(2.719_510_879, 5);
});

test("a head it cannot reproduce exactly is refused at load, not approximated", async () => {
  await expect(loadStHead(repo({ "1_Pooling/config.json": json({ pooling_mode: "mean" }) }))).rejects.toThrow("pooling mode mean");
  await expect(
    loadStHead(repo({ "2_Dense/config.json": json({ in_features: 3, out_features: 3, activation_function: "torch.nn.modules.activation.Tanh" }) })),
  ).rejects.toThrow("unsupported activation");
});

// A head that loads with the wrong shapes would index past its weights and score silently with zeros.
test("a head whose shapes disagree, with its config or with the encoder, is refused loudly", async () => {
  await expect(loadStHead(repo({ "2_Dense/config.json": json({ in_features: 4, out_features: 3, activation_function: GELU }) }))).rejects.toThrow(
    "2_Dense weights do not match",
  );
  await expect(loadStHead(repo({ "3_LayerNorm/model.safetensors": safetensors({ "norm.weight": [1, 1], "norm.bias": [0, 0] }) }))).rejects.toThrow(
    "3_LayerNorm",
  );
  await expect(loadStHead(repo({ "4_Dense/config.json": json({ in_features: 3, out_features: 2, activation_function: IDENTITY }) }))).rejects.toThrow(
    "4_Dense",
  );
  await expect(loadStHead(repo({ "2_Dense/config.json": json({ activation_function: GELU }) }))).rejects.toThrow("in_features and out_features");
  const head = await loadStHead(repo());
  expect(() => scoreHiddenStates(head, new Float32Array(8), [1, 2, 4])).toThrow("do not feed a 3-wide head");
});
