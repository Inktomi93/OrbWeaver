// A trusted physical SDK executable: native Query still owns decoding, sessions and cancellation.

import process from "node:process";
import type { SdkOutputFrame, SdkStdinMessage, SdkUserInput } from "./sdk-process-control.ts";
import { parseSdkStdinMessage, readSdkProcessInput, writeSdkControlReply } from "./sdk-process-control.ts";

const { sdkSessionId: sessionId, frameId, lines } = await readSdkProcessInput();

const MODEL = "funding-model";
const PRE_MARKER = "pre-compaction";
const POST_MARKER = "post-compaction";
const COMPACTION_PROMPT = "Conversation to summarize:";
const NORMAL_REPLY = "native funding reply";
const REJECTION = "the physical compaction credential was rejected";

function write(frame: SdkOutputFrame, identity: string = frame.type === "system" ? "init" : frame.type): void {
  process.stdout.write(`${JSON.stringify({ ...frame, uuid: frameId(identity) })}\n`);
}

function textOf(message: SdkUserInput): string {
  const content = message.message.content;
  if (typeof content === "string") {
    return content;
  }
  const texts = content.flatMap((block) => (block.type === "text" ? [block.text] : []));
  if (texts.length === content.length) {
    return texts.join("\n");
  }
  throw new Error("the physical SDK control received an unscripted user prompt");
}

function answer(message: SdkStdinMessage): void {
  if (writeSdkControlReply(message)) {
    return;
  }
  if (message.type !== "user") {
    throw new Error(`the physical SDK control received an unscripted message: ${message.type}`);
  }
  const prompt = textOf(message);
  const pre = prompt.includes(PRE_MARKER);
  const streaming = prompt.includes("streamed-funding");
  if (!(pre || streaming || prompt.includes(POST_MARKER) || prompt.includes("native-auth-rejection"))) {
    throw new Error("the physical SDK control received no funding scenario");
  }
  const compaction = prompt.includes(COMPACTION_PROMPT);
  const rejected = compaction || prompt.includes("native-auth-rejection");
  const common = { ["session_id"]: sessionId };
  write({
    ...common,
    type: "system",
    subtype: "init",
    apiKeySource: "none",
    ["claude_code_version"]: "controlled-physical-edge",
    cwd: process.cwd(),
    tools: [],
    ["mcp_servers"]: [],
    model: MODEL,
    permissionMode: "default",
    ["slash_commands"]: [],
    ["output_style"]: "default",
    skills: [],
    plugins: [],
  });
  if (streaming) {
    const deadline = setTimeout(() => {
      throw new Error("the physical native stream was never released");
    }, 10_000);
    process.once("SIGUSR2", () => {
      clearTimeout(deadline);
      writeTerminal(common, true, 0);
    });
    write({ ...common, type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "partial funding response" }] } }, "partial");
    write(
      {
        ...common,
        type: "stream_event",
        ["parent_tool_use_id"]: null,
        event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "partial funding response" } },
      },
      "stream",
    );
    return;
  }
  writeTerminal(common, rejected, pre ? 1 : 10_000);
}

function writeTerminal(common: Readonly<Record<string, unknown>>, failed: boolean, inputTokens: number): void {
  write({
    ...common,
    type: "assistant",
    ...(failed ? { error: "authentication_failed" } : {}),
    message: { role: "assistant", content: [{ type: "text", text: failed ? REJECTION : NORMAL_REPLY }], ["stop_reason"]: "end_turn" },
  });

  write({
    ...common,
    type: "result",
    subtype: "success",
    ["duration_ms"]: 1,
    ["duration_api_ms"]: 1,
    ["is_error"]: failed,
    ...(failed ? { ["api_error_status"]: 401 } : {}),
    ["num_turns"]: 1,
    result: failed ? REJECTION : NORMAL_REPLY,
    ["stop_reason"]: "end_turn",
    ["total_cost_usd"]: 0,
    usage: {
      ["input_tokens"]: failed ? 0 : inputTokens,
      ["output_tokens"]: failed ? 0 : 1,
      ["cache_read_input_tokens"]: 0,
      ["cache_creation_input_tokens"]: 0,
    },
    modelUsage: {},
    ["permission_denials"]: [],
  });
}

for await (const line of lines) {
  if (line.length > 0) {
    answer(parseSdkStdinMessage(line));
  }
}
