// verb: mintLocalLightCredential — the keyless in-process transformers.js/ONNX marker (PD-9 / D39 — the
// owner's-box local-light compute tier; mirror of `mint-vllm`, but in-process rather than a supervised
// subprocess). No user, no DB row, no key — constructed through the single brand home (`substrate/mint`).
// The boot binder injects it for the GPU-less, key-less embed/rerank/imageEmbed path. Takes no ctx.

import type { LocalLightCredential } from "@orb/contracts/credentials";
import type { CredentialsService } from "../contract/service";
import { mintLocalLight } from "../substrate/mint";

export function createMintLocalLight(): CredentialsService["mintLocalLightCredential"] {
  return (): LocalLightCredential => mintLocalLight();
}
