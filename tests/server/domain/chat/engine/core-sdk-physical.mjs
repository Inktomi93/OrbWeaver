// Raw native SDK frames only; Query and the production root own every application result and session.
import { readFile } from "node:fs/promises";
import process from "node:process";
import { readSdkProcessInput, readSdkResumeTranscript, writeSdkControlReply } from "@orb/testkit/node/sdk-process-control.mjs";
import { ENGINE_SDK_MODEL } from "./engine-sdk-physical.mjs";

export const CORE_SDK_SCRIPT_ARG = "--orb-core-sdk-script=";
export const CORE_SDK_RECEIPT = "orb-core-sdk-physical:";
export const CORE_SDK_RUNTIME_ARG = "--orb-core-sdk-runtime=";
export const CORE_SDK_IMPORT_RECEIPT = "orb-core-sdk-import:";

function assistantContent(script) {
  return [
    ...(script.thinking === undefined ? [] : [{ type: "thinking", thinking: script.thinking, signature: "controlled-core-thinking-signature" }]),
    { type: "text", text: script.text },
  ];
}

function writePartialThinking(script, write) {
  if (script.deltaThinking === undefined) {
    return;
  }
  write(
    { type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: script.deltaThinking } } },
    "stream",
  );
}

async function run() {
  const scriptArg = process.argv.find((arg) => arg.startsWith(CORE_SDK_SCRIPT_ARG));
  if (scriptArg === undefined) {
    throw new Error("the core SDK executable received no owned script path");
  }
  const scriptPath = scriptArg.slice(CORE_SDK_SCRIPT_ARG.length);
  const runtimeArg = process.argv.find((arg) => arg.startsWith(CORE_SDK_RUNTIME_ARG));
  if (runtimeArg === undefined) {
    throw new Error("the core SDK executable received no native materialized runtime");
  }
  const { sdkSessionId, frameId, lines } = await readSdkProcessInput();
  const resume = process.argv.find((arg) => arg.startsWith("--resume="))?.slice("--resume=".length);
  if (resume !== sdkSessionId) {
    throw new Error("the actual native SDK seed and physical session identity disagree");
  }
  const imported = await readSdkResumeTranscript(runtimeArg.slice(CORE_SDK_RUNTIME_ARG.length), sdkSessionId);
  process.stderr.write(`${CORE_SDK_IMPORT_RECEIPT}${JSON.stringify({ sessionId: sdkSessionId, resume, frames: imported.frames })}\n`);
  const write = (value, identity = value.type === "system" ? "init" : value.type) => {
    const frame = { ...value, uuid: frameId(identity), ["session_id"]: sdkSessionId };
    process.stdout.write(`${JSON.stringify(frame)}\n`);
    return frame;
  };
  for await (const line of lines) {
    const message = JSON.parse(line);
    if (writeSdkControlReply(message)) {
      continue;
    }
    if (message.type !== "user") {
      throw new Error(`unscripted core SDK input ${message.type}`);
    }
    const script = JSON.parse(await readFile(scriptPath, "utf8"));
    process.stderr.write(`${CORE_SDK_RECEIPT}${JSON.stringify({ text: script.text, failed: script.failed, cost: script.cost })}\n`);
    write({ type: "system", subtype: "init", apiKeySource: "none", model: ENGINE_SDK_MODEL });
    const usage = {
      ["input_tokens"]: 10,
      ["output_tokens"]: 20,
      ["cache_creation_input_tokens"]: 3,
      ["cache_read_input_tokens"]: 2,
      ["output_tokens_details"]: { ["thinking_tokens"]: 4 },
    };
    writePartialThinking(script, write);
    const assistant = write({
      type: "assistant",
      ...(script.failed ? { error: "invalid_request" } : {}),
      message: {
        id: "msg_core_paid",
        type: "message",
        role: "assistant",
        model: ENGINE_SDK_MODEL,
        content: assistantContent(script),
        ["stop_reason"]: "end_turn",
        usage,
      },
    });
    const modelUsage = {
      [ENGINE_SDK_MODEL]: {
        inputTokens: 10,
        outputTokens: 20,
        thinkingTokens: 4,
        cacheReadInputTokens: 2,
        cacheCreationInputTokens: 3,
        webSearchRequests: 0,
        costUSD: script.cost,
        contextWindow: 200_000,
        maxOutputTokens: 8192,
      },
    };
    process.stdout.write(
      `${JSON.stringify({
        type: "transcript_mirror",
        filePath: imported.file,
        entries: [
          { ...message, uuid: frameId("user"), ["sessionId"]: sdkSessionId },
          assistant,
          { type: "cost-state", ["sessionId"]: sdkSessionId, modelUsage },
        ],
      })}\n`,
    );
    write({
      type: "result",
      subtype: "success",
      ["is_error"]: script.failed,
      ...(script.failed ? { ["api_error_status"]: 400 } : {}),
      ["duration_ms"]: 10,
      ["duration_api_ms"]: 5,
      ["num_turns"]: 3,
      result: script.text,
      ["stop_reason"]: "end_turn",
      ["total_cost_usd"]: script.cost,
      usage,
      modelUsage,
      ["permission_denials"]: [],
      ["terminal_reason"]: script.failed ? "api_error" : "completed",
    });
  }
}

if (import.meta.main) {
  await run();
}
