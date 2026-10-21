import { readdir, readFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import process from "node:process";

export { readSdkProcessInput } from "./sdk-process.ts";

/** Inspect only the actual query-owned materialized resume; no fixture chooses a project key or seed identity. */
export async function readSdkResumeTranscript(runtime, sessionId) {
  if (typeof runtime !== "string") {
    throw new Error("native history inspection received no captured runtime");
  }
  const canonicalRuntime = await realpath(runtime);
  if (dirname(canonicalRuntime) !== (await realpath(tmpdir())) || !basename(canonicalRuntime).startsWith("claude-resume-")) {
    throw new Error("native history inspection refuses a runtime outside its query-owned resume temporary directory");
  }
  const projectsPath = join(canonicalRuntime, "projects");
  const projects = (await readdir(projectsPath, { withFileTypes: true })).filter((entry) => entry.isDirectory());
  if (projects.length !== 1) {
    throw new Error("the actual native seed import did not materialize exactly one project");
  }
  const projectPath = await realpath(join(projectsPath, projects[0].name));
  const transcriptPath = await realpath(join(projectPath, `${sessionId}.jsonl`));
  if (dirname(projectPath) !== projectsPath || dirname(transcriptPath) !== projectPath) {
    throw new Error("native history inspection refuses a transcript outside the imported project");
  }
  const frames = (await readFile(transcriptPath, "utf8"))
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
  return { file: transcriptPath, frames };
}

/** Answer only the native control requests used by controlled physical subprocess scripts. */
export function writeSdkControlReply(message) {
  if (message.type !== "control_request") {
    return false;
  }
  let response;
  switch (message.request.subtype) {
    case "initialize":
      response = { commands: [], agents: [], ["output_style"]: "default", ["available_output_styles"]: [], models: [], account: {}, ["hooks_applied"]: true };
      break;
    case "interrupt":
      response = {};
      break;
    case "get_context_usage":
      response = {
        categories: [],
        totalTokens: 2,
        maxTokens: 8192,
        rawMaxTokens: 8192,
        percentage: (2 / 8192) * 100,
        gridRows: [],
        model: "sdk-lifetime-model",
        memoryFiles: [],
        mcpTools: [],
        agents: [],
        isAutoCompactEnabled: false,
      };
      break;
    default:
      return false;
  }
  process.stdout.write(`${JSON.stringify({ type: "control_response", response: { subtype: "success", ["request_id"]: message.request_id, response } })}\n`);
  return true;
}
