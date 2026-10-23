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

async function respond(message, policy, write, sessionId) {
  const content = message.message.content;
  const prompt = typeof content === "string" ? content : content.map((block) => block.text).join("\n");
  const marker = prompt.includes("Conversation to summarize:");
  const importedSeed = policy.inspectHistory === true && !marker ? await importedHistory(policy.materializedRuntime, sessionId) : undefined;
  const behavior = marker ? policy.marker : policy.foreground;
  const released = behavior === "hold" ? once(process, "SIGUSR2") : undefined;
  process.stderr.write(
    `${ENGINE_SDK_RECEIPT}${JSON.stringify({ marker, prompt, held: released !== undefined, argv: process.argv.slice(2), ...(importedSeed === undefined ? {} : { importedSeed }) })}\n`,
  );
  write({ type: "system", subtype: "init", apiKeySource: "none", model: ENGINE_SDK_MODEL });
  if (released !== undefined) {
    await released;
  }
  const failed = behavior === "fail";
  const reply = marker ? ENGINE_SDK_MARKER : ENGINE_SDK_REPLY;
  if (!failed) {
    write({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: reply }], ["stop_reason"]: "end_turn" } });
  }
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
    modelUsage: {},
    ["permission_denials"]: [],
  });
}

async function run() {
  const policyArg = process.argv.find((arg) => arg.startsWith(ENGINE_SDK_POLICY));
  if (policyArg === undefined) {
    throw new Error("the physical engine executable received no finite policy");
  }
  const policy = JSON.parse(policyArg.slice(ENGINE_SDK_POLICY.length));
  const { sdkSessionId, frameId, lines } = await readSdkProcessInput();
  const write = (value) => {
    process.stdout.write(`${JSON.stringify({ ...value, uuid: frameId(value.type === "system" ? "init" : value.type), ["session_id"]: sdkSessionId })}\n`);
  };
  for await (const line of lines) {
    const message = JSON.parse(line);
    if (writeSdkControlReply(message)) {
      continue;
    }
    if (message.type !== "user") {
      throw new Error(`unscripted physical engine SDK input ${message.type}`);
    }
    await respond(message, policy, write, sdkSessionId);
  }
}

if (import.meta.main) {
  await run();
}
