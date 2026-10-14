import process from "node:process";

/** Answer only the two native control requests used by controlled physical subprocess scripts. */
export function writeSdkControlReply(message) {
  if (message.type !== "control_request") {
    return false;
  }
  let response;
  switch (message.request.subtype) {
    case "initialize":
      response = { commands: [], agents: [], ["output_style"]: "default", ["available_output_styles"]: [], models: [], account: {}, ["hooks_applied"]: true };
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
