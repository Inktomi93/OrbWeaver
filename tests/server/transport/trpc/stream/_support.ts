// Socket lifecycle metadata precedes every room frame, including sockets with no rooms attached.
import type { StreamFrame } from "@orb/contracts/stream";
import { expect } from "../../../../support/fixtures.ts";

export async function consumeServerReady(iterator: AsyncIterator<unknown>): Promise<string> {
  const result = await iterator.next();
  const frame = (Array.isArray(result.value) ? result.value[1] : result.value) as StreamFrame;
  if (frame.channel !== "control" || frame.type !== "serverReady") {
    throw new Error("expected server process identity before room frames");
  }
  expect(frame.serverInstanceId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  return frame.serverInstanceId;
}
