// @subject packages/server/src/infra/plugin-host/process-runtime.ts
import { ChildProcess } from "node:child_process";
import { once } from "node:events";
import { HOST_FUNCTION_CAPABILITY, PLUGIN_QUIET_IMAGES_MAX, PLUGIN_SEARCH_RESULTS_MAX } from "@orb/contracts/plugin";
import type { JsonValue } from "@orb/kit/json";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { PLUGIN_QUIET_PROMPT_MAX_CHARS } from "#server/infra/plugin-host/budgets.ts";
import {
  bridgeRequest,
  createPluginProcessEdge,
  firstChild,
  frameField,
  hasOperation,
  installGuest,
  NATIVE_TIMEOUT_MS,
  PLUGIN_PROCESS_OPERATIONS as OP,
  responseResult,
} from "./process-runtime.fixtures.ts";

test.for([
  { name: "RPC refusal without its error", result: { ok: false }, message: "malformed broker response" },
  { name: "RPC success carrying a refusal", result: { ok: true, error: { name: "Error", message: "refusal" } }, message: "malformed broker response" },
  {
    name: "snippet classification without its error",
    result: { ok: true, value: { logLines: [], errorKind: "parse" } },
    message: "malformed snippet response",
  },
])("native process rejects $name after a successful native snippet", { timeout: NATIVE_TIMEOUT_MS }, async ({ result, message }) => {
  const edge = createPluginProcessEdge();
  await using root = await createServerHarness({ pluginSpawn: edge.spawn });
  const caller = await root.internalCallerFor(root.ownerId);
  const room = (await caller.chat.startChat({ characterIds: [] })).chat;
  const code = 'orb.host(1).log.info("native result control");';
  expect(await caller.plugin.runSnippet({ chatId: room.id, code })).toEqual({ logLines: ["[info] native result control"] });
  using delivery = edge.holdNext((value) => frameField(value, "kind") === "response");
  const running = caller.plugin.runSnippet({ chatId: room.id, code });
  const settled = Promise.allSettled([running]);
  const frame = await delivery.reached;
  delivery.release(responseResult(frame, result));
  expect(await settled).toMatchObject([{ status: "rejected", reason: { message: expect.stringContaining(message) } }]);
});

const QUIET_OPERATION = "llm.quiet";
const QUIET_COMMAND = "quiet";
const QUIET_GUEST = `const h=orb.host(1);
  h.ui.registerCommand({name:${JSON.stringify(QUIET_COMMAND)},describe:"Native quiet call",onRun:async()=>{
    try{await h.llm.quiet("Report.");}catch(e){h.log.warn("refused="+e.name);}
  }});`;
const MALFORMED_REFUSAL = `refused=${TypeError.name}`;
const assetIds = (count: number): string[] => Array.from({ length: count }, (_, index) => `asset-${String(index)}`);

/** Run the quiet command with its broker frame replaced, and return what the guest was told. */
async function forgedQuietOutcome(opts: JsonValue, prompt = "Report."): Promise<readonly string[]> {
  const edge = createPluginProcessEdge();
  await using root = await createServerHarness({ pluginSpawn: edge.spawn });
  const guest = await installGuest(root, "quiet-frame", QUIET_GUEST, ["ui.surface", "llm.quiet"]);
  await guest.enable();
  using delivery = edge.holdNext((value) => hasOperation(value, QUIET_OPERATION));
  const running = guest.invoke(QUIET_COMMAND);
  delivery.release(bridgeRequest(await delivery.reached, QUIET_OPERATION, [prompt, opts]));
  await running;
  return (await guest.log()).map(({ message }) => message);
}

test.for<{ name: string; opts: JsonValue }>([
  { name: "more images than the cap", opts: { imageAssetIds: assetIds(PLUGIN_QUIET_IMAGES_MAX + 1) } },
  { name: "images that are not a list", opts: { imageAssetIds: "asset-0" } },
  { name: "an image id that is not text", opts: { imageAssetIds: [7] } },
  { name: "a schema that is not an object", opts: { schema: 7 } },
  { name: "a schema with no name", opts: { schema: { schema: {} } } },
  { name: "a schema body that is a list", opts: { schema: { name: "shape", schema: [] } } },
])("the app process refuses a broker's quiet options with $name", { timeout: NATIVE_TIMEOUT_MS }, async ({ opts }) => {
  expect(await forgedQuietOutcome(opts)).toContainEqual(expect.stringContaining(MALFORMED_REFUSAL));
});

// The control: a frame at the cap passes the boundary and fails later, so the refusal above is the parse's own.
test("the app process admits quiet options at the image cap", { timeout: NATIVE_TIMEOUT_MS }, async () => {
  const outcome = await forgedQuietOutcome({ imageAssetIds: assetIds(PLUGIN_QUIET_IMAGES_MAX) });
  expect(outcome).toContainEqual(expect.stringContaining("refused="));
  expect(outcome).not.toContainEqual(expect.stringContaining(MALFORMED_REFUSAL));
});

// The membrane refuses a prompt past the cap, so only a broker that is not the membrane sends one; the app's own
// check is what keeps that spend bounded. The control at the cap crosses the boundary and fails later.
test.for([
  { name: "one past the prompt cap", length: PLUGIN_QUIET_PROMPT_MAX_CHARS + 1, refused: true },
  { name: "exactly the prompt cap", length: PLUGIN_QUIET_PROMPT_MAX_CHARS, refused: false },
])("the app process judges a broker's quiet prompt $name", { timeout: NATIVE_TIMEOUT_MS }, async ({ length, refused }) => {
  const outcome = await forgedQuietOutcome({}, "x".repeat(length));
  expect(outcome).toContainEqual(expect.stringContaining("refused="));
  expect(outcome.some((line) => line.includes(MALFORMED_REFUSAL))).toBe(refused);
});

const SEARCH_OPERATION = "search.documents";
const SEARCH_COMMAND = "search";
const SEARCH_ANSWERED = "search answered";
const SEARCH_GUEST = `const h=orb.host(1);
  h.ui.registerCommand({name:${JSON.stringify(SEARCH_COMMAND)},describe:"Native search call",onRun:async()=>{
    try{await h.search.documents("lanterns",{limit:1});h.log.info(${JSON.stringify(SEARCH_ANSWERED)});}catch(e){h.log.warn("refused="+e.name);}
  }});`;

// The membrane clamps a guest's search limit to the page cap, so an out-of-range limit reaches the app only from a
// broker that is not the membrane; the app refuses it rather than paging the installer's corpus without bound.
test.for([
  { name: "a limit past the page cap", limit: PLUGIN_SEARCH_RESULTS_MAX + 1, refused: true },
  { name: "a zero limit", limit: 0, refused: true },
  { name: "a fractional limit", limit: 1.5, refused: true },
  { name: "a limit at the page cap", limit: PLUGIN_SEARCH_RESULTS_MAX, refused: false },
])("the app process judges a broker's search limit: $name", { timeout: NATIVE_TIMEOUT_MS }, async ({ limit, refused }) => {
  const edge = createPluginProcessEdge();
  await using root = await createServerHarness({ pluginSpawn: edge.spawn });
  const guest = await installGuest(root, "search-frame", SEARCH_GUEST, ["ui.surface", HOST_FUNCTION_CAPABILITY[SEARCH_OPERATION]]);
  await guest.enable();
  using delivery = edge.holdNext((value) => hasOperation(value, SEARCH_OPERATION));
  const running = guest.invoke(SEARCH_COMMAND);
  delivery.release(bridgeRequest(await delivery.reached, SEARCH_OPERATION, ["lanterns", limit]));
  await running;
  const outcome = (await guest.log()).map(({ message }) => message);
  expect(outcome.some((line) => line.includes(MALFORMED_REFUSAL))).toBe(refused);
  // Every case ends in a reported outcome, so an absent refusal is a call that crossed, never a silent one.
  expect(outcome.some((line) => line.includes("refused=") || line.includes(SEARCH_ANSWERED))).toBe(true);
});

test("holding an actual synchronous IPC message preserves its identity, result and live child ownership", { timeout: NATIVE_TIMEOUT_MS }, async () => {
  const edge = createPluginProcessEdge();
  await using root = await createServerHarness({ pluginSpawn: edge.spawn });
  const caller = await root.internalCallerFor(root.ownerId);
  const room = (await caller.chat.startChat({ characterIds: [] })).chat;
  using delivery = edge.holdNext((value) => hasOperation(value, OP.mint));
  const running = caller.plugin.runSnippet({ chatId: room.id, code: 'const h=orb.host(1);h.log.info("native-id="+h.ids.mint());' });
  const settled = Promise.allSettled([running]);
  const captured = await delivery.reached;
  const child = firstChild(edge);
  expect(child).toBeInstanceOf(ChildProcess);
  expect(edge.delivered).not.toContain(captured);
  const observed: unknown[] = [];
  child.on("message", (value: unknown) => observed.push(value));
  delivery.release();
  expect(await settled).toMatchObject([{ status: "fulfilled", value: { logLines: [expect.stringContaining("native-id=")] } }]);
  expect((await running).error).toBeUndefined();
  expect(observed).toContain(captured);
  expect(edge.delivered).toContain(captured);
  expect((await caller.plugin.runSnippet({ chatId: room.id, code: 'orb.host(1).log.info("still live");' })).logLines).toEqual(["[info] still live"]);
  expect(edge.children).toHaveLength(1);
  const closed = once(child, "exit");
  await root[Symbol.asyncDispose]();
  await closed;
  expect(child.exitCode).toBe(0);
});
