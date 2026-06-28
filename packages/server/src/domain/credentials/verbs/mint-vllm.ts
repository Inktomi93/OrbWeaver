// verb: mintVllmCredential — the boot-time supervised-vLLM loopback marker (credentials.md §"Verbs"; the
// boot binder injects it into the vLLM role-clients builder). No user, no DB row, no key — a pure routing
// marker constructed through the single brand home (`substrate/mint`). Takes no ctx (no db/crypto needed).

import type { VllmCredential } from "@orb/contracts/credentials";
import type { CredentialsService } from "../contract/service";
import { mintVllm } from "../substrate/mint";

export function createMintVllm(): CredentialsService["mintVllmCredential"] {
  return (): VllmCredential => mintVllm();
}
