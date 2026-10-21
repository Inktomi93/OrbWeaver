// Physical CLI protocol only; native Query imports seed bytes and owns transcript mirroring.
import { once } from "node:events";
import { join } from "node:path";
import process from "node:process";
import {
  CORPUS_SDK_DEFER_EXIT,
  CORPUS_SDK_EMPTY,
  CORPUS_SDK_EOF,
  CORPUS_SDK_HOLD,
  CORPUS_SDK_MODEL,
  CORPUS_SDK_QUERY,
  CORPUS_SDK_RECEIPT,
  CORPUS_SDK_REPLY,
  CORPUS_SDK_REUSE,
} from "./corpus-sdk-protocol.ts";
import { readSdkProcessInput, readSdkResumeTranscript, writeSdkControlReply } from "./sdk-process-control.mjs";

function write(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

async function importedSeed(config, resume, sessionId) {
  if (resume === null) {
    return { file: join(config, "projects", "physical-corpus", `${sessionId}.jsonl`), frames: [] };
  }
  return await readSdkResumeTranscript(config, resume);
}

function promptOf(input) {
  const prompt = typeof input.message.content === "string" ? input.message.content : input.message.content.map((part) => part.text ?? "").join("\n");
  if (![CORPUS_SDK_HOLD, CORPUS_SDK_EMPTY, CORPUS_SDK_QUERY, CORPUS_SDK_REUSE].includes(prompt)) {
    throw new Error("unscripted physical SDK corpus prompt");
  }
  return prompt;
}

async function holdPhysicalExit(enabled) {
  if (!enabled) {
    return;
  }
  const physicalWork = setInterval(() => {
    // Keep the external edge alive until its owner releases the physical EOF hold.
  }, 1000);
  const released = once(process, "SIGUSR1");
  process.stderr.write(`${CORPUS_SDK_EOF}\n`);
  try {
    await released;
  } finally {
    clearInterval(physicalWork);
  }
}

async function run() {
  const { sdkSessionId: sessionId, frameId, lines } = await readSdkProcessInput();
  const resume = process.argv.find((argument) => argument.startsWith("--resume="))?.slice("--resume=".length) ?? null;
  // biome-ignore lint/style/noProcessEnv: the physical CLI consumes the SDK-prepared protocol environment, not application configuration.
  const config = process.env.CLAUDE_CONFIG_DIR;
  if (config === undefined) {
    throw new Error("native SDK provided no owned configuration directory");
  }
  const imported = await importedSeed(config, resume, sessionId);
  let answered = false;
  let held = false;
  process.on("SIGTERM", () => process.exit(0));
  for await (const line of lines) {
    const input = JSON.parse(line);
    if (writeSdkControlReply(input)) {
      continue;
    }
    if (input.type !== "user" || answered) {
      throw new Error("unscripted native SDK corpus input");
    }
    answered = true;
    const prompt = promptOf(input);
    process.stderr.write(`${CORPUS_SDK_RECEIPT}${JSON.stringify({ sessionId, resume, frames: imported.frames, prompt })}\n`);
    if (prompt === CORPUS_SDK_HOLD) {
      held = true;
      continue;
    }
    const common = { ["session_id"]: sessionId };
    write({ ...common, uuid: frameId("init"), type: "system", subtype: "init", apiKeySource: "none", model: CORPUS_SDK_MODEL });
    const assistant = {
      ...common,
      uuid: frameId("assistant"),
      type: "assistant",
      message: { role: "assistant", content: [{ type: "text", text: CORPUS_SDK_REPLY }], ["stop_reason"]: "end_turn" },
    };
    write(assistant);
    write({ type: "transcript_mirror", filePath: imported.file, entries: [{ ...input, uuid: frameId("user"), ["sessionId"]: sessionId }, assistant] });
    write({
      ...common,
      uuid: frameId("result"),
      type: "result",
      subtype: "success",
      ["duration_ms"]: 1,
      ["duration_api_ms"]: 1,
      ["is_error"]: false,
      ["num_turns"]: 1,
      result: CORPUS_SDK_REPLY,
      ["stop_reason"]: "end_turn",
      ["total_cost_usd"]: 0,
      usage: { ["input_tokens"]: 1, ["output_tokens"]: 1, ["cache_read_input_tokens"]: 0, ["cache_creation_input_tokens"]: 0 },
      modelUsage: {},
      ["permission_denials"]: [],
    });
  }
  await holdPhysicalExit(held && process.argv.includes(CORPUS_SDK_DEFER_EXIT));
}

if (import.meta.main) {
  await run();
}
