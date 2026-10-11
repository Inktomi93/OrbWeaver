// The durable observer runs outside provider retry and receives no credential-bearing resolved object.
import type { ChatRequest, ChatResult } from "../../contract/chat.ts";

/** Preserve a normalized completed result before callers can refuse or reshape it. */
export async function observeChatResult(req: ChatRequest, result: ChatResult): Promise<void> {
  const { ownerId, connectionId, providerId, model, wire } = req.connection;
  await req.onObservedResult?.(result, { ownerId, connectionId, providerId, model, wire });
}
