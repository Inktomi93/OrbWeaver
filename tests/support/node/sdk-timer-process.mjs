// Native Query reads these external process bytes; this script owns no SDK session or decoder.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import process from "node:process";
import { createInterface } from "node:readline";
import { setImmediate } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { writeSdkControlReply } from "./sdk-process-control.mjs";

if (process.argv[2] === "late-diagnostic") {
  process.stderr.write("sdk-late-diagnostic: café complete\n", () => process.exit(0));
  await once(process, "exit");
}

if (process.argv[2] === "owned-descendant") {
  const work = setInterval(() => {
    // Simulate owned physical work until the controlling process releases this descendant.
  }, 1000);
  const release = once(process, "SIGUSR1");
  process.stderr.write(`sdk-owned:descendant:${process.pid}\n`);
  await release;
  clearInterval(work);
  process.exit(0);
}

let descendant;
let descendantClosed;
let observeNativeGrace = false;
process.on("SIGTERM", () => {
  if (descendant === undefined) {
    process.exit(0);
  } else if (observeNativeGrace) {
    process.stderr.write("sdk-owned:native-grace\n");
  }
});
// biome-ignore lint/style/noProcessEnv: this external executable consumes the actual prepared subprocess credential to prove split raw/JSON stderr scrubbing, not app configuration.
const token = process.env.CLAUDE_CODE_OAUTH_TOKEN;
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
  const content = message.message.content;
  const prompt = typeof content === "string" ? content : content.map((block) => block.text).join("\n");
  if (prompt.includes("SDK_PRIVATE_STDOUT_PREFIX_EOF")) {
    await new Promise((resolve) => process.stdout.write(`private-stdout-prefix-safe-context: ${token.slice(0, 64)}`, resolve));
    process.exit(7);
  }
  if (prompt.includes("SDK_PRIVATE_STDOUT")) {
    if (!prompt.includes(token)) {
      throw new Error("private diagnostic projection changed the raw SDK user input");
    }
    await new Promise((resolve) => process.stdout.write(`private-stdout-safe-context: ${token} ${JSON.stringify(token).slice(1, -1)}\n`, resolve));
    process.exit(7);
  }
  if (prompt.includes("SDK_PREFIX_EOF")) {
    await new Promise((resolve) => process.stderr.write(`sdk-prefix-eof: ${token.slice(0, 64)}`, resolve));
    process.exit(7);
  }
  if (prompt.includes("SDK_SHAPED_DIAGNOSTIC:")) {
    const split = prompt.endsWith(":split");
    if (split) {
      const release = once(process, "SIGUSR2");
      process.stderr.write(`sdk-shaped-diagnostic:split: ${token.slice(0, 32)}`);
      await release;
      await new Promise((resolve) => process.stderr.write(`${token.slice(32)} complete\n`, resolve));
    } else {
      await new Promise((resolve) => process.stderr.write(`sdk-shaped-diagnostic:intact: ${token} complete\n`, resolve));
    }
    process.exit(7);
  }
  if (prompt.includes("SDK_OVERLAP_DIAGNOSTIC")) {
    const release = once(process, "SIGUSR2");
    process.stderr.write(`sdk-overlap-diagnostic: ${token.repeat(63)}${token.slice(0, 8)}`);
    await release;
    await new Promise((resolve) => process.stderr.write(`${token.slice(8)} complete\n`, resolve));
    process.exit(7);
  }
  if (prompt.includes("SDK_LATE_DIAGNOSTIC")) {
    spawn(process.execPath, [fileURLToPath(import.meta.url), "late-diagnostic"], { stdio: ["ignore", "ignore", "inherit"] });
    process.exit(7);
  }
  observeNativeGrace = prompt.includes("SDK_DEFAULT_GRACE");
  if (prompt.includes("SDK_PRIVATE_GENERIC")) {
    await new Promise((resolve) => process.stderr.write(`sdk-diagnostic: café ${token} ${JSON.stringify(token).slice(1, -1)} complete\n`, resolve));
  }
  if (prompt.includes("SDK_OWNED_DESCENDANT")) {
    descendant = spawn(process.execPath, [fileURLToPath(import.meta.url), "owned-descendant"], { stdio: ["ignore", "ignore", "inherit"] });
    const owned = descendant;
    descendantClosed = new Promise((resolve) =>
      owned.once("close", () => {
        process.stderr.write(`sdk-owned:descendant-exit:${owned.pid}\n`);
        resolve();
      }),
    );
  }
  if (prompt.includes("SDK_DIAGNOSTIC_CRASH")) {
    const escaped = JSON.stringify(token).slice(1, -1);
    process.stderr.write("x".repeat(6000));
    const heading = Buffer.from("sdk-diagnostic: café ");
    const split = heading.indexOf(Buffer.from("é")) + 1;
    process.stderr.write(heading.subarray(0, split));
    await setImmediate();
    process.stderr.write(heading.subarray(split));
    process.stderr.write(token.slice(0, 12));
    await setImmediate();
    process.stderr.write(`${token.slice(12)} ${escaped.slice(0, 12)}`);
    await setImmediate();
    await new Promise((resolve) => process.stderr.write(`${escaped.slice(12)} complete\n`, resolve));
    process.exit(7);
  }
  if (prompt.includes("SDK_HOLD_UNTIL_CANCEL")) {
    process.stderr.write("sdk-owned:holding\n");
    continue;
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
  if (prompt.includes("SDK_CONCURRENT_CALLER_FAILURE")) {
    write({ ...common, type: "system", subtype: "status", status: "compacting" });
  }
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
    ["is_error"]: prompt.includes("SDK_PRIVATE_GENERIC"),
    ["num_turns"]: 1,
    result: prompt.includes("SDK_PRIVATE_GENERIC") ? `private-result-safe-context ${token}` : "settled native SDK reply",
    ["stop_reason"]: "end_turn",
    ["total_cost_usd"]: 0,
    usage: { ["input_tokens"]: 1, ["output_tokens"]: 1, ["cache_read_input_tokens"]: 0, ["cache_creation_input_tokens"]: 0 },
    modelUsage: {},
    ["permission_denials"]: [],
  });
  if (prompt.includes("SDK_CONCURRENT_CALLER_FAILURE") || prompt.includes("SDK_PRIVATE_GENERIC")) {
    await new Promise((resolve) => process.stdout.write("", resolve));
    process.exit(7);
  }
}

process.stderr.write("sdk-owned:stdin-eof\n");
await descendantClosed;
