// A Worker's synchronous channel posts the same pair of buffers on every call however many it makes, so a guest that
// loops seam calls allocates nothing per call; an answer is read to its own length, so a shorter answer after a
// longer one carries none of the older bytes; and a call the broker never answers gives the channel a fresh pair,
// since a late answer to it may still land in the old one. The scripted `post` answers as the broker does, in the
// posted buffers, before the channel waits.
// @subject packages/server/src/infra/plugin-host/sync-channel.ts

import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { PLUGIN_BROKER_SYNC_TIMEOUT_MS } from "#server/infra/plugin-host/process-protocol.ts";
import type { SyncCallBuffers } from "#server/infra/plugin-host/sync-channel.ts";
import { createSyncChannel } from "#server/infra/plugin-host/sync-channel.ts";

// A guest loop's worth of seam calls: more than a CPU window held when every call took a fresh pair.
const SEAM_CALLS = 5000;
const encoder = new TextEncoder();

// Answers in the posted buffers the way the broker's `settleSync` does: the bytes, then the length, then the flag.
function answerWith(text: string, seen: SyncCallBuffers[]): (buffers: SyncCallBuffers) => void {
  return (buffers) => {
    seen.push(buffers);
    const bytes = encoder.encode(text);
    new Uint8Array(buffers.result).set(bytes);
    const control = new Int32Array(buffers.control);
    Atomics.store(control, 1, bytes.byteLength);
    Atomics.store(control, 0, 1);
  };
}

test("every call on one channel posts the same pair of buffers, and each answer reads only its own bytes", () => {
  const channel = createSyncChannel();
  const seen: SyncCallBuffers[] = [];

  expect(channel.call(answerWith('{"ok":true,"value":"a longer first answer"}', seen))).toEqual({
    kind: "answered",
    text: '{"ok":true,"value":"a longer first answer"}',
  });
  expect(channel.call(answerWith('{"ok":true,"value":1}', seen))).toEqual({ kind: "answered", text: '{"ok":true,"value":1}' });
  for (let call = 0; call < SEAM_CALLS; call += 1) {
    channel.call(answerWith('{"ok":true,"value":0.5}', seen));
  }

  expect(seen).toHaveLength(SEAM_CALLS + 2);
  expect(new Set(seen.map(({ control }) => control)).size).toBe(1);
  expect(new Set(seen.map(({ result }) => result)).size).toBe(1);
});

test("a call the broker never answers times out, and the next call posts a fresh pair", { tags: ["slow"], timeout: 2 * PLUGIN_BROKER_SYNC_TIMEOUT_MS }, () => {
  const channel = createSyncChannel();
  const seen: SyncCallBuffers[] = [];
  channel.call(answerWith('{"ok":true,"value":1}', seen));

  expect(channel.call((buffers) => seen.push(buffers))).toEqual({ kind: "timed-out" });
  channel.call(answerWith('{"ok":true,"value":2}', seen));
  channel.call(answerWith('{"ok":true,"value":3}', seen));

  expect(seen).toHaveLength(4);
  const [first, abandoned, renewed, reused] = [present(seen[0]), present(seen[1]), present(seen[2]), present(seen[3])];
  expect(abandoned.result).toBe(first.result);
  expect(renewed.result).not.toBe(abandoned.result);
  expect(renewed.control).not.toBe(abandoned.control);
  expect(reused.result).toBe(renewed.result);
});
