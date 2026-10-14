// Trusted external process bytes; installed Query owns sessions, decoding and cancellation.
import { randomUUID } from "node:crypto";
import process from "node:process";
import { createInterface } from "node:readline";
import { writeSdkControlReply } from "./sdk-process-control.mjs";

const sessionId = randomUUID();
const COMPACTION_PROMPT = "Conversation to summarize:";
const lines = createInterface({ input: process.stdin });
function write(value) {
  process.stdout.write(`${JSON.stringify({ ...value, uuid: randomUUID(), ["session_id"]: sessionId })}\n`);
}

for await (const line of lines) {
  const message = JSON.parse(line);
  if (writeSdkControlReply(message)) {
    continue;
  }
  if (message.type !== "user") {
    throw new Error(`unscripted compaction-isolation SDK input ${message.type}`);
  }
  const content = message.message.content;
  const prompt = typeof content === "string" ? content : content.map((block) => block.text).join("\n");
  const compaction = prompt.includes(COMPACTION_PROMPT);
  write({
    type: "system",
    subtype: "init",
    apiKeySource: "none",
    ["claude_code_version"]: "controlled-physical-edge",
    cwd: process.cwd(),
    tools: [],
    ["mcp_servers"]: [],
    model: "compaction-isolation-model",
    permissionMode: "default",
    ["slash_commands"]: [],
    ["output_style"]: "default",
    skills: [],
    plugins: [],
  });
  if (compaction) {
    await new Promise((resolve) => {
      process.once("SIGUSR1", resolve);
      process.stderr.write("compaction-isolation:held\n");
    });
  }
  const reply = compaction ? "An actual compacted scene marker." : "An actual isolated SDK reply.";
  write({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: reply }], ["stop_reason"]: "end_turn" } });
  write({
    type: "result",
    subtype: "success",
    ["duration_ms"]: 1,
    ["duration_api_ms"]: 1,
    ["is_error"]: false,
    ["num_turns"]: 1,
    result: reply,
    ["stop_reason"]: "end_turn",
    ["total_cost_usd"]: 0,
    usage: { ["input_tokens"]: compaction ? 1 : 10_000, ["output_tokens"]: 1, ["cache_read_input_tokens"]: 0, ["cache_creation_input_tokens"]: 0 },
    modelUsage: {},
    ["permission_denials"]: [],
  });
}
