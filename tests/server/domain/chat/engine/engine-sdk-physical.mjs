// Physical executable bytes only; native Query owns sessions, controls, classification and cancellation.
import { once } from "node:events";
import process from "node:process";
import { readSdkProcessInput, readSdkResumeTranscript, writeSdkControlReply } from "@orb/testkit/sdk";

export const ENGINE_SDK_MODEL = "claude-opus-5";
export const ENGINE_SDK_REPLY = "Hi there";
export const ENGINE_SDK_MARKER = "MANAGED MARKER";
export const ENGINE_SDK_RECEIPT = "orb-engine-physical:";
export const ENGINE_SDK_POLICY = "--orb-engine-policy=";

function frameText(frame) {
  const content = frame.message.content;
  return typeof content === "string"
    ? content
    : content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");
}

async function importedHistory(runtime, sessionId) {
  const imported = await readSdkResumeTranscript(runtime, sessionId);
  const rows = imported.frames.filter((entry) => entry.type === "user" || entry.type === "assistant");
  const first = rows.at(0);
  const last = rows.at(-1);
  return { sessionId, rowCount: rows.length, firstText: first === undefined ? "" : frameText(first), lastText: last === undefined ? "" : frameText(last) };
}

async function respond(message, policy, { write, writeAs, frameId }, sessionId) {
  const content = message.message.content;
  const prompt = typeof content === "string" ? content : content.map((block) => block.text).join("\n");
  const marker = prompt.includes("Conversation to summarize:");
  const importedSeed = policy.inspectHistory === true && !marker ? await importedHistory(policy.materializedRuntime, sessionId) : undefined;
  const behavior = marker ? policy.marker : policy.foreground;
  const released = behavior === "hold" ? once(process, "SIGUSR2") : undefined;
  const protocol = await turnProtocol(policy, marker, sessionId);
  process.stderr.write(
    `${ENGINE_SDK_RECEIPT}${JSON.stringify({ marker, prompt, held: released !== undefined, argv: process.argv.slice(2), ...(importedSeed === undefined ? {} : { importedSeed }), ...protocol.receipt })}\n`,
  );
  write({ type: "system", subtype: "init", apiKeySource: "none", model: ENGINE_SDK_MODEL });
  if (released !== undefined) {
    await released;
  }
  const failed = behavior === "fail";
  const reply = marker ? ENGINE_SDK_MARKER : ENGINE_SDK_REPLY;
  writeFrames(writeAs, protocol.frames);
  const assistant = failed
    ? undefined
    : write({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: reply }], ["stop_reason"]: "end_turn" } });
  protocol.mirror(message, assistant, frameId);
  write({
    type: "result",
    subtype: "success",
    ["duration_ms"]: 1,
    ["duration_api_ms"]: 1,
    ["is_error"]: failed,
    ["terminal_reason"]: failed ? "api_error" : "end_turn",
    ["num_turns"]: 1,
    result: failed ? "controlled native engine API refusal" : reply,
    ["stop_reason"]: "end_turn",
    ["total_cost_usd"]: 0,
    usage: { ["input_tokens"]: marker ? 1 : policy.inputTokens, ["output_tokens"]: 1, ["cache_read_input_tokens"]: 0, ["cache_creation_input_tokens"]: 0 },
    modelUsage: protocol.modelUsage,
    ["permission_denials"]: protocol.permissionDenials,
  });
}

const NO_PROTOCOL = { frames: [], modelUsage: {}, permissionDenials: [], receipt: {}, mirror: () => undefined };

// The policy's protocol frames and result accounting ride the foreground turn only; each frame names its own parent
// frame identity. Under `carryUsage` the executable keeps a session the way the runtime does: it saves a `cost-state`
// entry into the transcript after the turn, and a resumed turn's `modelUsage` continues from the latest one.
async function turnProtocol(policy, marker, sessionId) {
  if (marker) {
    return NO_PROTOCOL;
  }
  const own = { frames: policy.frames ?? [], modelUsage: policy.modelUsage ?? {}, permissionDenials: policy.permissionDenials ?? [] };
  if (policy.carryUsage !== true) {
    return { ...own, receipt: {}, mirror: () => undefined };
  }
  const transcript = await readSdkResumeTranscript(policy.materializedRuntime, sessionId);
  const saved = transcript.frames.filter((entry) => entry.type === "cost-state" && entry.sessionId === sessionId).at(-1)?.modelUsage ?? {};
  const modelUsage = continuedUsage(saved, own.modelUsage);
  return {
    ...own,
    modelUsage,
    receipt: { savedModels: Object.keys(saved).toSorted() },
    mirror: (message, assistant, frameId) => {
      const user = { ...message, uuid: frameId("user"), sessionId };
      const entries = [user, ...(assistant === undefined ? [] : [assistant]), { type: "cost-state", sessionId, modelUsage }];
      process.stdout.write(`${JSON.stringify({ type: "transcript_mirror", filePath: transcript.file, entries })}\n`);
    },
  };
}

// Every counter continues from the saved totals; the per-call ceilings are this turn's own.
const CONTINUED_COUNTERS = ["inputTokens", "outputTokens", "cacheReadInputTokens", "cacheCreationInputTokens", "costUSD", "webSearchRequests"];

function continuedUsage(saved, own) {
  const models = new Set([...Object.keys(saved), ...Object.keys(own)]);
  return Object.fromEntries(
    [...models].map((model) => {
      const before = saved[model] ?? {};
      const turn = own[model] ?? {};
      const counters = Object.fromEntries(CONTINUED_COUNTERS.map((key) => [key, (before[key] ?? 0) + (turn[key] ?? 0)]));
      return [model, { ...before, ...turn, ...counters }];
    }),
  );
}

function writeFrames(writeAs, frames) {
  for (const { slot, frame } of frames) {
    writeAs(slot, frame);
  }
}

async function run() {
  const policyArg = process.argv.find((arg) => arg.startsWith(ENGINE_SDK_POLICY));
  if (policyArg === undefined) {
    throw new Error("the physical engine executable received no finite policy");
  }
  const policy = JSON.parse(policyArg.slice(ENGINE_SDK_POLICY.length));
  const { sdkSessionId, frameId, lines } = await readSdkProcessInput();
  const writeAs = (slot, value) => {
    const frame = { ...value, uuid: frameId(slot), ["session_id"]: sdkSessionId };
    process.stdout.write(`${JSON.stringify(frame)}\n`);
    return frame;
  };
  const write = (value) => writeAs(value.type === "system" ? "init" : value.type, value);
  for await (const line of lines) {
    const message = JSON.parse(line);
    if (writeSdkControlReply(message)) {
      continue;
    }
    if (message.type !== "user") {
      throw new Error(`unscripted physical engine SDK input ${message.type}`);
    }
    await respond(message, policy, { write, writeAs, frameId }, sdkSessionId);
  }
}

if (import.meta.main) {
  await run();
}
