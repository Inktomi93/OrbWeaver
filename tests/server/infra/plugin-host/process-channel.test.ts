// @subject packages/server/src/infra/plugin-host/process-channel.ts
// A full IPC queue refuses one frame, never the channel (D348). Each hop's sender refuses a plugin-sized frame past its
// runtime's share or past the queue short of its control headroom and stays open; the watchdog's relay sends that
// frame's refusal in its place. The scripted edge is the IPC channel, which holds every write until it is acknowledged.
import { expect, test } from "@orb/testkit/node";
import {
  HOST_FN_RESULT_CAP_BYTES,
  PLUGIN_IPC_CONTROL_HEADROOM_BYTES,
  PLUGIN_IPC_QUEUE_MAX_BYTES,
  pluginIpcShareBytes,
} from "#server/infra/plugin-host/budgets.ts";
import type { RoutedIpcFrame } from "#server/infra/plugin-host/process-channel.ts";
import { PluginIpcSender, relayFrame } from "#server/infra/plugin-host/process-channel.ts";
import { channelFullBridgeResult, channelFullResponse, serializeMessage } from "#server/infra/plugin-host/process-protocol.ts";

type PluginIpcSend = ConstructorParameters<typeof PluginIpcSender>[0];
type PluginIpcMessage = Parameters<PluginIpcSender["send"]>[0];

const GENERATION = "generation-0123456789abcdef";
const WORKER_MAXIMUM = 4;
// The largest result a host function may return: the frame a flooding plugin sends most of.
const PLUGIN_FRAME = "x".repeat(HOST_FN_RESULT_CAP_BYTES);

interface HeldChannel {
  readonly sender: PluginIpcSender;
  readonly written: PluginIpcMessage[];
  readonly failures: Error[];
  /** Acknowledge every write the channel holds, as a drained peer does. */
  readonly drain: () => void;
}

function heldChannel(shareBytes = pluginIpcShareBytes(WORKER_MAXIMUM)): HeldChannel {
  const written: PluginIpcMessage[] = [];
  const failures: Error[] = [];
  const held: (() => void)[] = [];
  const deliver: PluginIpcSend = (message, callback) => {
    written.push(message);
    held.push(() => callback(null));
  };
  const sender = new PluginIpcSender(deliver, (error) => failures.push(error), shareBytes);
  const drain = (): void => {
    for (const ack of held.splice(0)) {
      ack();
    }
  };
  return { sender, written, failures, drain };
}

function routed(runtimeId: string, refusal?: { readonly frame: string; readonly back: boolean }): RoutedIpcFrame {
  return { kind: "frame", generation: GENERATION, frame: PLUGIN_FRAME, route: refusal === undefined ? { runtimeId } : { runtimeId, refusal } };
}

function envelopeBytes(message: PluginIpcMessage): number {
  return Buffer.byteLength(JSON.stringify(message), "utf8");
}

// Offer one runtime's frames until the sender refuses one; the count it took.
function fillShare(sender: PluginIpcSender, runtimeId: string): number {
  let accepted = 0;
  while (sender.offer(routed(runtimeId))) {
    accepted += 1;
  }
  return accepted;
}

test("a runtime past its share has its next frame refused alone, and the channel stays open for other runtimes and control", () => {
  const channel = heldChannel();
  const share = pluginIpcShareBytes(WORKER_MAXIMUM);
  const accepted = fillShare(channel.sender, "runtime-a");

  // The share bounds what one runtime holds in the queue: what it took fits, one frame more would not.
  const frameBytes = envelopeBytes(routed("runtime-a"));
  expect(accepted).toBeGreaterThan(0);
  expect(accepted * frameBytes).toBeLessThanOrEqual(share);
  expect((accepted + 1) * frameBytes).toBeGreaterThan(share);
  expect(channel.written).toHaveLength(accepted);

  // Positive controls: another runtime's frame and a control frame still go, and nothing failed the channel.
  expect(channel.sender.offer(routed("runtime-b"))).toBe(true);
  channel.sender.send({ kind: "frame", generation: GENERATION, frame: serializeMessage(channelFullResponse("command-1")) });
  expect(channel.failures).toEqual([]);

  // Acknowledged writes return their bytes to the share.
  channel.drain();
  expect(channel.sender.offer(routed("runtime-a"))).toBe(true);
});

test("plugin frames stop short of the control headroom, so a refusal still fits a queue they filled", () => {
  // Shares at their floor, so the queue bound is reached across runtimes before any one runtime's share.
  const channel = heldChannel(pluginIpcShareBytes(Number.MAX_SAFE_INTEGER));
  let runtime = 0;
  while (fillShare(channel.sender, `runtime-${String(runtime)}`) > 0) {
    runtime += 1;
  }
  const queued = channel.written.reduce((bytes, message) => bytes + envelopeBytes(message), 0);
  expect(queued).toBeLessThanOrEqual(PLUGIN_IPC_QUEUE_MAX_BYTES - PLUGIN_IPC_CONTROL_HEADROOM_BYTES);

  const refusal = { kind: "frame", generation: GENERATION, frame: serializeMessage(channelFullBridgeResult("bridge-1")) } as const;
  channel.sender.send(refusal);
  expect(channel.written.at(-1)).toEqual(refusal);
  expect(channel.failures).toEqual([]);
});

test("the relay sends a refused request's refusal back to its producer and nothing on", () => {
  const target = heldChannel();
  const back = heldChannel();
  fillShare(target.sender, "runtime-a");
  const before = target.written.length;
  const refusal = serializeMessage(channelFullBridgeResult("bridge-1"));

  relayFrame(routed("runtime-a", { frame: refusal, back: true }), target.sender, back.sender);

  expect(target.written).toHaveLength(before);
  expect(back.written).toEqual([{ kind: "frame", generation: GENERATION, frame: refusal }]);
  expect([...target.failures, ...back.failures]).toEqual([]);
});

test("the relay sends a refused reply's refusal on to its consumer in the reply's place", () => {
  const target = heldChannel();
  const back = heldChannel();
  fillShare(target.sender, "runtime-a");
  const before = target.written.length;
  const refusal = serializeMessage(channelFullResponse("command-1"));

  relayFrame(routed("runtime-a", { frame: refusal, back: false }), target.sender, back.sender);

  expect(target.written.slice(before)).toEqual([{ kind: "frame", generation: GENERATION, frame: refusal }]);
  expect(back.written).toEqual([]);
  expect([...target.failures, ...back.failures]).toEqual([]);
});

test("the relay drops a refused frame that carries no refusal, and relays one that fits as it is", () => {
  const target = heldChannel();
  const back = heldChannel();
  fillShare(target.sender, "runtime-a");
  const before = target.written.length;

  relayFrame(routed("runtime-a"), target.sender, back.sender);
  expect(target.written).toHaveLength(before);
  expect(back.written).toEqual([]);

  // Positive control: the same frame for a runtime with room crosses unchanged.
  const fits = routed("runtime-b", { frame: serializeMessage(channelFullResponse("command-2")), back: false });
  relayFrame(fits, target.sender, back.sender);
  expect(target.written.slice(before)).toEqual([fits]);
  expect([...target.failures, ...back.failures]).toEqual([]);
});
