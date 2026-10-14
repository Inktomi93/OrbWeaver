// Only physical model execution is scripted. Tokenization, Hub reads, cache leases and head scoring stay native.

import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { BroadcastChannel } from "node:worker_threads";
import type { LoadTransformersKernel, LocalLightKernelModule } from "@orb/inference";

let nativeKernel: Awaited<ReturnType<LoadTransformersKernel>> | undefined;
const HUB_REFUSAL = new URL(import.meta.url).searchParams.has("hub-refusal");

export const KERNEL_HOLD = { parameter: "hold-channel", ready: "ready", blocked: "blocked" } as const;
const HOLD_CHANNEL = new URL(import.meta.url).searchParams.get(KERNEL_HOLD.parameter);

async function holdSynchronousExecution(): Promise<void> {
  if (HOLD_CHANNEL === null) {
    return;
  }
  const channel = new BroadcastChannel(HOLD_CHANNEL);
  try {
    const shared = await new Promise<SharedArrayBuffer>((resolve, reject) => {
      channel.onmessage = ({ data }): void => {
        if (data instanceof SharedArrayBuffer) {
          resolve(data);
        } else {
          reject(new Error("kernel hold requires shared native memory"));
        }
      };
      channel.onmessageerror = (): void => reject(new Error("kernel hold could not receive shared native memory"));
      channel.postMessage(KERNEL_HOLD.ready);
    });
    channel.postMessage(KERNEL_HOLD.blocked);
    // A native model call blocks this thread; an async promise would let the queued close run early.
    Atomics.wait(new Int32Array(shared), 0, 0);
  } finally {
    channel.close();
  }
}

async function record(event: object): Promise<void> {
  const directory = nativeKernel?.env.cacheDir;
  if (typeof directory !== "string") {
    throw new Error("reference kernel has no owned model cache directory");
  }
  await appendFile(join(directory, "kernel-execution.jsonl"), `${JSON.stringify(event)}\n`);
}

/** Refuse the actual native Hub execution hook, retaining its request before rejection. */
export const fetch: LocalLightKernelModule["fetch"] = async (input): Promise<never> => {
  const url = input instanceof Request ? input.url : String(input);
  await record({ edge: "hub-fetch", url });
  throw new Error("reference kernel: unscripted Hub execution refused");
};

/** Bind a physical encoder to the library's real model and tensor constructors without ONNX sessions. */
export const loadTransformers: LocalLightKernelModule["loadTransformers"] = async (nativeLoad) => {
  const kernel = await nativeLoad();
  nativeKernel = kernel;
  class ReferenceEncoder extends kernel.PreTrainedModel {
    override async forward(
      inputs: Record<string, InstanceType<typeof kernel.Tensor>>,
    ): Promise<Record<"last_hidden_state", InstanceType<typeof kernel.Tensor>>> {
      const ids = inputs["input_ids"];
      if (ids === undefined || ids.dims.length !== 2) {
        throw new Error("reference encoder requires real tokenized input IDs");
      }
      await holdSynchronousExecution();
      const rows = ids.dims[0] ?? 0;
      const width = ids.dims[1] ?? 0;
      const values = new Float32Array(rows * width * 3).fill(9);
      for (let row = 0; row < rows; row += 1) {
        let positive = false;
        for (let column = 0; column < width; column += 1) {
          positive ||= ids.data[row * width + column] === 6n;
        }
        values.set(positive ? [-1, 0.5, 0.3] : [0.2, -0.4, 1], row * width * 3);
      }
      const hidden = new kernel.Tensor("float32", values, [rows, width, 3]);
      await record({ edge: "model-forward", rows, width, nativeTensor: hidden instanceof kernel.Tensor });
      return { ["last_hidden_state"]: hidden };
    }
  }
  class PhysicalAutoModel extends kernel.AutoModel {
    static override async from_pretrained(
      ...args: Parameters<typeof kernel.AutoModel.from_pretrained>
    ): Promise<Awaited<ReturnType<typeof kernel.AutoModel.from_pretrained>>> {
      const [modelId, options] = args;
      if (HUB_REFUSAL) {
        await kernel.AutoConfig.from_pretrained(modelId, options);
        throw new Error("reference Hub refusal unexpectedly returned a config");
      }
      const model = new ReferenceEncoder(new kernel.PretrainedConfig({ ["model_type"]: "custom", ["hidden_size"]: 3 }), {}, {});
      await record({ edge: "model-load", modelId, sessions: Object.keys(model.sessions).length, nativeModel: model instanceof kernel.PreTrainedModel });
      return model;
    }
  }
  return { ...kernel, ["AutoModel"]: PhysicalAutoModel };
};
