// Native Query reads these external process bytes; this script owns no SDK session or decoder.
import { randomUUID } from "node:crypto";
import process from "node:process";
import { createInterface } from "node:readline";
import { writeSdkControlReply } from "./sdk-process-control.mjs";

const sessionId = randomUUID();
const lines = createInterface({ input: process.stdin });
function write(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

for await (const line of lines) {
  const message = JSON.parse(line);
  if (writeSdkControlReply(message)) {
    continue;
  }
  if (message.type === "control_request") {
    throw new Error(`unscripted SDK control ${message.request.subtype}`);
  }
  if (message.type !== "user") {
    throw new Error(`unscripted SDK input ${message.type}`);
  }
  const common = { ["session_id"]: sessionId, uuid: randomUUID() };
  write({
    ...common,
    type: "system",
    subtype: "init",
    apiKeySource: "none",
    ["claude_code_version"]: "controlled-physical-edge",
    cwd: process.cwd(),
    tools: [],
    ["mcp_servers"]: [],
    model: "sdk-lifetime-model",
    permissionMode: "default",
    ["slash_commands"]: [],
    ["output_style"]: "default",
    skills: [],
    plugins: [],
  });
  write({
    ...common,
    type: "assistant",
    message: { role: "assistant", content: [{ type: "text", text: "settled native SDK reply" }], ["stop_reason"]: "end_turn" },
  });
  write({
    ...common,
    type: "result",
    subtype: "success",
    ["duration_ms"]: 1,
    ["duration_api_ms"]: 1,
    ["is_error"]: false,
    ["num_turns"]: 1,
    result: "settled native SDK reply",
    ["stop_reason"]: "end_turn",
    ["total_cost_usd"]: 0,
    usage: { ["input_tokens"]: 1, ["output_tokens"]: 1, ["cache_read_input_tokens"]: 0, ["cache_creation_input_tokens"]: 0 },
    modelUsage: {},
    ["permission_denials"]: [],
  });
}
