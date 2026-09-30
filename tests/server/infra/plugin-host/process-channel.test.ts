import { PluginIpcSender, parsePluginIpcMessage } from "../../../../packages/server/src/infra/plugin-host/process-channel.ts";
import { PLUGIN_BROKER_MESSAGE_MAX_BYTES } from "../../../../packages/server/src/infra/plugin-host/process-protocol.ts";
import { expect, test } from "../../../support/fixtures.ts";

const GENERATION = "generation-for-channel";

test("inherited envelopes refuse malformed routing and oversized frames", () => {
  expect(parsePluginIpcMessage({ kind: "frame", generation: GENERATION, frame: "{}" })).toEqual({ kind: "frame", generation: GENERATION, frame: "{}" });
  expect(parsePluginIpcMessage({ kind: "frame", generation: GENERATION, frame: "x".repeat(PLUGIN_BROKER_MESSAGE_MAX_BYTES + 1) })).toBeNull();
  expect(parsePluginIpcMessage({ kind: "frame", generation: GENERATION, frame: {} })).toBeNull();
  expect(parsePluginIpcMessage({ kind: "ready", generation: "" })).toBeNull();
  expect(parsePluginIpcMessage({ kind: "stopped", generation: GENERATION, error: {} })).toBeNull();
});

test("IPC backpressure is bounded by bytes and successful writes release their reservation", () => {
  const pending: ((error: Error | null) => void)[] = [];
  const failures: Error[] = [];
  const sender = new PluginIpcSender(
    (_message, callback) => {
      pending.push(callback);
    },
    (error) => {
      failures.push(error);
    },
  );
  const frame = "x".repeat(PLUGIN_BROKER_MESSAGE_MAX_BYTES);
  const message = { kind: "frame", generation: GENERATION, frame } as const;
  sender.send(message);
  const complete = pending.shift();
  if (complete === undefined) {
    throw new Error("test: send did not reach the channel");
  }
  complete(null);
  sender.send(message);
  sender.send(message);
  sender.send(message);
  expect(() => sender.send(message)).toThrow(/write queue exceeds/u);
  expect(failures).toHaveLength(1);
  expect(failures[0]).toBeInstanceOf(RangeError);
  expect(() => sender.send({ kind: "ready", generation: GENERATION })).toThrow(/closed/u);
});

test("an asynchronous channel write error fails the sender once", () => {
  let completed: ((error: Error | null) => void) | undefined;
  const failures: Error[] = [];
  const sender = new PluginIpcSender(
    (_message, callback) => {
      completed = callback;
    },
    (error) => {
      failures.push(error);
    },
  );
  sender.send({ kind: "ready", generation: GENERATION });
  const failure = new Error("channel gone");
  if (completed === undefined) {
    throw new Error("test: send did not reach the channel");
  }
  completed(failure);
  expect(failures).toEqual([failure]);
  expect(() => sender.send({ kind: "ready", generation: GENERATION })).toThrow(/closed/u);
});
