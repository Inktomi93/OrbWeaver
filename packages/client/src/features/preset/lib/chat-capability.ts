// The chat-role capability READ, narrowed: `connection.resolveChatCapability` returns the credential-free
// `ResolvedConnectionView`, whose `capability` is the kind union (inference program §6.1). The params deck
// renders the GENERATION descriptor; a chat binding that resolved an embedding-kind row is `undefined` here
// (the server's requirement check refuses it upstream — this is the read seam's honest narrowing).

import type { GenerationCapability, ResolvedConnectionView } from "@orb/contracts/inference";

export function chatCapabilityOf(view: ResolvedConnectionView | undefined): GenerationCapability | undefined {
  return view?.capability.kind === "generation" ? view.capability.generation : undefined;
}
