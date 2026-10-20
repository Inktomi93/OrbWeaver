// Physical SDK bytes only; native Query owns session admission, decoding and process lifetime.
import { once } from "node:events";
import process from "node:process";
import { readSdkProcessInput, writeSdkControlReply } from "@orb/testkit/node/sdk-process-control.mjs";

export const STATS_SDK_MODEL = "claude-opus-5";
export const STATS_SDK_THINKING = "The subscription keeper weighs this reply.";
export const STATS_SDK_REPLY = "The native subscription reply retains its receipt.";
export const STATS_SDK_CACHE_1H = 4096;

function write(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

async function run() {
  const { sdkSessionId, frameId, lines } = await readSdkProcessInput();
  const common = { ["session_id"]: sdkSessionId };
  let answered = false;
  for await (const line of lines) {
    const message = JSON.parse(line);
    if (writeSdkControlReply(message)) {
      continue;
    }
    if (message.type !== "user" || answered) {
      throw new Error("unscripted physical stats SDK input");
    }
    answered = true;
    write({ ...common, uuid: frameId("init"), type: "system", subtype: "init", apiKeySource: "none", model: STATS_SDK_MODEL });
    const released = once(process, "SIGUSR2");
    write({
      ...common,
      uuid: frameId("stream"),
      type: "stream_event",
      event: { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: STATS_SDK_THINKING } },
    });
    await released;
    write({
      ...common,
      uuid: frameId("partial"),
      type: "stream_event",
      event: { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: STATS_SDK_REPLY } },
    });
    write({
      ...common,
      uuid: frameId("assistant"),
      type: "assistant",
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking: STATS_SDK_THINKING, signature: "controlled-stats-signature" },
          { type: "text", text: STATS_SDK_REPLY },
        ],
        ["stop_reason"]: "end_turn",
      },
    });
    write({
      ...common,
      uuid: frameId("result"),
      type: "result",
      subtype: "success",
      ["duration_ms"]: 400,
      ["duration_api_ms"]: 400,
      ["is_error"]: false,
      ["num_turns"]: 1,
      result: STATS_SDK_REPLY,
      ["stop_reason"]: "end_turn",
      ["total_cost_usd"]: 0,
      ["warm_spare_claimed"]: true,
      usage: {
        ["input_tokens"]: 10,
        ["output_tokens"]: 20,
        ["cache_read_input_tokens"]: 0,
        ["cache_creation_input_tokens"]: STATS_SDK_CACHE_1H,
        ["cache_creation"]: { ["ephemeral_5m_input_tokens"]: 0, ["ephemeral_1h_input_tokens"]: STATS_SDK_CACHE_1H },
      },
      modelUsage: {},
      ["permission_denials"]: [],
    });
  }
}

if (import.meta.main) {
  await run();
}
