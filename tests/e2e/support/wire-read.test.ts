// A wire read is disabled, or enabled with at least one capture. Enabled and empty is a failure with its diagnostics.
import type { WireCapture } from "@orb/contracts/debug";
import { wireCaptureSchema } from "@orb/contracts/debug";
import { ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { wireCaptureRead } from "./wire-read.ts";

const capture = (model: string): WireCapture =>
  wireCaptureSchema.parse({ api: "chat-completions", wire: "openai", providerId: "vllm", model, at: 1, body: {} });

test("disabled capture is a skip with its reason, never an empty success", ({ ids }) => {
  const read = wireCaptureRead({ enabled: false, count: 0, captures: [] }, ids.typeId(ID_PREFIX.chat));
  expect(read).toEqual({ enabled: false, skipReason: expect.stringContaining("WIRE_CAPTURE is off") });
});

test("an enabled read with no capture fails naming the chat and the provider", ({ ids }) => {
  const chatId = ids.typeId(ID_PREFIX.chat);
  expect(() => wireCaptureRead({ enabled: true, count: 0, captures: [] }, chatId, "vllm")).toThrow(`chat ${chatId} has no capture for vllm`);
  expect(() => wireCaptureRead({ enabled: true, count: 0, captures: [] }, chatId)).toThrow("any provider");
});

test("an enabled match hands the caller the turn's own request first, ahead of a later round", ({ ids }) => {
  const read = wireCaptureRead({ enabled: true, count: 2, captures: [capture("state-round"), capture("turn")] }, ids.typeId(ID_PREFIX.chat), "vllm");
  expect(read).toMatchObject({ enabled: true, captures: [{ model: "turn" }, { model: "state-round" }] });
});
