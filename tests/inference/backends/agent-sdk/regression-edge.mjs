// Controlled executable bytes only; native Query owns the SDK protocol and process lifecycle.
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { readSdkProcessInput, writeSdkControlReply } from "../../../support/node/sdk-process-control.mjs";

const scenario = JSON.parse(process.argv[2]);
const { sdkSessionId, frameId, lines } = await readSdkProcessInput();
const streamUuid = frameId("stream");
let streamIndex = 0;

function write(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

for await (const line of lines) {
  const message = JSON.parse(line);
  if (message.type === "control_request" && message.request.subtype === "initialize") {
    write({
      type: "control_response",
      response:
        scenario.catalogError === undefined
          ? {
              subtype: "success",
              ["request_id"]: message.request_id,
              response: { commands: [], agents: [], models: scenario.models ?? [], account: {}, ["hooks_applied"]: true },
            }
          : { subtype: "error", ["request_id"]: message.request_id, error: scenario.catalogError },
    });
    continue;
  }
  if (writeSdkControlReply(message)) {
    continue;
  }
  if (message.type !== "user") {
    throw new Error("unscripted physical regression input");
  }
  await sleep(scenario.delayMs ?? 0);
  for (const frame of scenario.frames ?? []) {
    const identity = frame.type === "system" ? "init" : frame.type;
    write({
      ...(frame.type === "result" ? { ["duration_ms"]: 1, result: "controlled reply" } : {}),
      ...frame,
      ["session_id"]: sdkSessionId,
      uuid: frame.type === "stream_event" ? `${streamUuid.slice(0, -12)}${streamIndex.toString(16).padStart(12, "0")}` : frameId(identity),
    });
    streamIndex += 1;
  }
  if (scenario.hang !== true) {
    process.stdout.end();
    process.stdin.destroy();
    break;
  }
}
