// @subject packages/server/src/domain/chat/engine/provider-bridge.ts
// @subject packages/server/src/domain/chat/engine/engine.ts
// @subject packages/server/src/foundation/observability/debug/wire-capture.ts
// What a turn's runner events reach: the native SDK executable writes each protocol frame, the real agent-sdk runner,
// bridge and engine carry it, and each case reads the room's durable warnings and the debug door's outcome record.
import type { ChatWarningCode } from "@orb/contracts/chat";
import type { JsonValue } from "@orb/kit/json";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { ENGINE_SDK_CREDENTIAL, readDebugOutcomes, sdkEngineRoom } from "./engine-physical.ts";
import { ENGINE_SDK_MODEL } from "./engine-sdk-physical.mjs";

const DEBUG_TOKEN = "controlled-runner-event-debug-token";
const server = { ids: createSeededIds(), wireCapture: true, debugToken: DEBUG_TOKEN } as const;
const OTHER_MODEL = "claude-sonnet-5";
// The executable's empty model list keeps the catalog cold, so this alias reaches the runner unresolved.
const UNRESOLVED_ALIAS = "opus";

// One billed model's SDK accounting record, as the result frame's `modelUsage` carries it.
const billed = (model: string): Record<string, JsonValue> => ({
  [model]: {
    inputTokens: 4,
    outputTokens: 1,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    costUSD: 0,
    webSearchRequests: 0,
    contextWindow: 32_000,
    maxOutputTokens: 1024,
  },
});

const REFUSAL_DETAIL = { ["api_refusal_category"]: "cyber", ["api_refusal_explanation"]: "The request asked for a working exploit." };
const FALLBACK_FRAME = {
  slot: "bad-meta-fallback",
  frame: {
    type: "system",
    subtype: "model_refusal_fallback",
    trigger: "refusal",
    direction: "retry",
    ["original_model"]: ENGINE_SDK_MODEL,
    ["fallback_model"]: OTHER_MODEL,
    ["request_id"]: null,
    ...REFUSAL_DETAIL,
  },
};
const NO_FALLBACK_FRAME = {
  slot: "bad-meta-refusal",
  frame: { type: "system", subtype: "model_refusal_no_fallback", ["original_model"]: ENGINE_SDK_MODEL, ["request_id"]: null, content: "", ...REFUSAL_DETAIL },
};
const AUTH_ERROR_TAIL = "was rejected by the account service";
const DIAGNOSTIC_FRAMES = [
  {
    slot: "bad-meta-compact",
    frame: {
      type: "system",
      subtype: "compact_boundary",
      ["compact_metadata"]: { trigger: "auto", ["pre_tokens"]: 30, ["post_tokens"]: 20, ["duration_ms"]: 5 },
    },
  },
  {
    slot: "bad-meta-retry",
    frame: { type: "system", subtype: "api_retry", error: "overloaded", attempt: 1, ["max_retries"]: 3, ["retry_delay_ms"]: 250, ["error_status"]: 529 },
  },
  { slot: "bad-meta-status", frame: { type: "system", subtype: "status", status: "compacting", ["compact_result"]: "success" } },
  {
    slot: "bad-meta-limit",
    frame: { type: "rate_limit_event", ["rate_limit_info"]: { status: "allowed_warning", utilization: 0.9, isUsingOverage: false, resetsAt: 1_900_000_000 } },
  },
  { slot: "bad-meta-auth", frame: { type: "auth_status", isAuthenticating: false, output: [], error: `token ${ENGINE_SDK_CREDENTIAL} ${AUTH_ERROR_TAIL}` } },
];

type Room = Awaited<ReturnType<typeof sdkEngineRoom>>;

async function warningCodes(fixture: Room): Promise<ChatWarningCode[]> {
  return (await fixture.warnings()).map((warning) => warning.code);
}

async function outcomeEvents(fixture: Room): Promise<JsonValue> {
  const [outcome, ...older] = await readDebugOutcomes(fixture.h, DEBUG_TOKEN);
  expect(older).toEqual([]);
  expect(outcome).toMatchObject({ disposition: "completed" });
  if (outcome === undefined || outcome === null || typeof outcome !== "object" || Array.isArray(outcome)) {
    throw new Error("the debug door served no outcome object");
  }
  return outcome["events"] ?? null;
}

test("a refusal the provider retried on a fallback model tells the room so once, and the outcome keeps the provider's detail", async () => {
  await using fixture = await sdkEngineRoom({ server, policy: { frames: [FALLBACK_FRAME], modelUsage: billed(OTHER_MODEL) } });
  expect((await fixture.turn()).aborted).toBe(false);
  // The fallback is why another model billed, so the room hears one notice for it rather than two.
  expect(await warningCodes(fixture)).toEqual(["provider_refused_fallback"]);
  expect(await outcomeEvents(fixture)).toEqual([
    expect.objectContaining({
      kind: "refusal",
      model: ENGINE_SDK_MODEL,
      retried: true,
      fallbackModel: OTHER_MODEL,
      category: REFUSAL_DETAIL.api_refusal_category,
      explanation: REFUSAL_DETAIL.api_refusal_explanation,
    }),
    expect.objectContaining({ kind: "model_downgrade", requested: ENGINE_SDK_MODEL, billed: [OTHER_MODEL] }),
  ]);
});

test("a refusal with no fallback tells the room the provider declined, and the outcome keeps its category", async () => {
  await using fixture = await sdkEngineRoom({ server, policy: { frames: [NO_FALLBACK_FRAME] } });
  expect((await fixture.turn()).aborted).toBe(false);
  expect(await warningCodes(fixture)).toEqual(["provider_refused"]);
  expect(await outcomeEvents(fixture)).toEqual([
    expect.objectContaining({ kind: "refusal", retried: false, fallbackModel: null, category: REFUSAL_DETAIL.api_refusal_category }),
  ]);
});

test("a reply billed to a model other than the one asked for tells the room, and the outcome names both models", async () => {
  await using fixture = await sdkEngineRoom({ server, policy: { modelUsage: billed(OTHER_MODEL) } });
  expect((await fixture.turn()).aborted).toBe(false);
  expect(await warningCodes(fixture)).toEqual(["model_downgraded"]);
  expect(await outcomeEvents(fixture)).toEqual([expect.objectContaining({ kind: "model_downgrade", requested: ENGINE_SDK_MODEL, billed: [OTHER_MODEL] })]);
});

// The runtime continues a resumed session's `modelUsage` from the totals its transcript saved, so the fallback model
// the first turn billed is still a key on the second turn's result. Only the models this turn billed say anything.
test("a resumed turn after a fallback turn, written by the chosen model, raises no downgrade", async () => {
  // A room with history, so each turn's session is materialized from a transcript the executable can save into.
  await using fixture = await sdkEngineRoom({
    server,
    history: 2,
    policy: { carryUsage: true, frames: [FALLBACK_FRAME], modelUsage: billed(OTHER_MODEL) },
  });
  const send = (content: string): ReturnType<typeof fixture.h.root.services.chat.send> =>
    fixture.h.root.services.chat.send({ principal: fixture.h.owner, chatId: fixture.h.chatId, content });
  expect((await send("Ask the question the chosen model declines.")).aborted).toBe(false);
  fixture.setPolicy({ frames: [], modelUsage: billed(ENGINE_SDK_MODEL) });
  expect((await send("Ask an ordinary follow-up.")).aborted).toBe(false);
  // The second turn resumed the first one's session: its saved usage already named the fallback model.
  expect(fixture.receipts.filter(({ marker }) => !marker).map(({ savedModels }) => savedModels)).toEqual([[], [OTHER_MODEL]]);
  expect(await warningCodes(fixture)).toEqual(["provider_refused_fallback"]);
  const [second, first] = await readDebugOutcomes(fixture.h, DEBUG_TOKEN);
  expect(first).toMatchObject({
    events: [expect.objectContaining({ kind: "refusal" }), expect.objectContaining({ kind: "model_downgrade", billed: [OTHER_MODEL] })],
  });
  expect(second).toMatchObject({ events: [] });
});

// A cold model catalog leaves the connection's alias unresolved; the runtime resolves it and bills the resolved id.
test("a turn on an unresolved model alias, billed to the model the runtime resolved it to, raises no downgrade", async () => {
  await using fixture = await sdkEngineRoom({ server, model: UNRESOLVED_ALIAS, policy: { modelUsage: billed(ENGINE_SDK_MODEL) } });
  expect((await fixture.turn()).aborted).toBe(false);
  expect(await warningCodes(fixture)).toEqual([]);
  expect(await outcomeEvents(fixture)).toEqual([]);
});

test("a tool the runtime denied on a tool-less turn tells the room, and the outcome names the tool", async () => {
  await using fixture = await sdkEngineRoom({
    server,
    policy: { permissionDenials: [{ ["tool_name"]: "Bash", ["tool_use_id"]: "toolu_controlled_denial", ["tool_input"]: {} }] },
  });
  expect((await fixture.turn()).aborted).toBe(false);
  expect(await warningCodes(fixture)).toEqual(["tool_permission_denied"]);
  expect(await outcomeEvents(fixture)).toEqual([expect.objectContaining({ kind: "permission_leak", toolNames: ["Bash"] })]);
});

// The cases above are the positive control: the same room's warnings carry the user-relevant kinds, so an empty list
// here means these five reached the outcome record and were kept out of the room.
test("compaction, retries, activity, rate limits and auth state land on the outcome record and never in the room", async () => {
  await using fixture = await sdkEngineRoom({ server, policy: { frames: DIAGNOSTIC_FRAMES } });
  expect((await fixture.turn()).aborted).toBe(false);
  expect(await warningCodes(fixture)).toEqual([]);
  const events = await outcomeEvents(fixture);
  expect(events).toEqual([
    expect.objectContaining({ kind: "compaction", trigger: "auto", preTokens: 30, postTokens: 20, durationMs: 5 }),
    expect.objectContaining({ kind: "api_retry", attempt: 1, maxRetries: 3, retryDelayMs: 250, errorStatus: 529 }),
    expect.objectContaining({ kind: "status", status: "compacting", compactResult: "success" }),
    expect.objectContaining({ kind: "rate_limit", status: "allowed_warning", utilization: 0.9, isUsingOverage: false, resetsAt: 1_900_000_000_000 }),
    expect.objectContaining({ kind: "auth_status", isAuthenticating: false, error: expect.stringContaining(AUTH_ERROR_TAIL) }),
  ]);
  // The record is spilled to disk, so the connection's own secret never rides it.
  expect(JSON.stringify(events)).not.toContain(ENGINE_SDK_CREDENTIAL);
});
