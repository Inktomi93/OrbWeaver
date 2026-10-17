/** Playwright serializes this function; imported runtime closures would disappear in the browser. */
export async function prepareGoldenTools(input: unknown): Promise<void> {
  interface Tool {
    readonly name: string;
    readonly description: string;
    readonly parameters: object;
  }
  interface Model {
    readonly id: string;
  }
  interface Registration extends Tool {
    readonly displayName: string;
    readonly action: () => string;
    readonly shouldRegister: () => boolean;
  }
  interface ToolManager {
    readonly registerFunctionTool: (registration: Registration) => unknown;
  }
  const isObject = (value: unknown): value is object => typeof value === "object" && value !== null && !Array.isArray(value);
  const isTool = (value: unknown): value is Tool =>
    isObject(value) &&
    "name" in value &&
    typeof value.name === "string" &&
    "description" in value &&
    typeof value.description === "string" &&
    "parameters" in value &&
    isObject(value.parameters);
  const isModel = (value: unknown): value is Model => isObject(value) && "id" in value && typeof value.id === "string";
  const isManager = (value: unknown): value is ToolManager =>
    (typeof value === "function" || isObject(value)) && "registerFunctionTool" in value && typeof value.registerFunctionTool === "function";
  if (
    !(isObject(input) && "origin" in input) ||
    typeof input.origin !== "string" ||
    !("tools" in input) ||
    !Array.isArray(input.tools) ||
    !input.tools.every(isTool)
  ) {
    throw new Error("Invalid golden tool input");
  }
  const selectedModel = "model" in input ? input.model : undefined;
  if (selectedModel !== undefined && typeof selectedModel !== "string") {
    throw new Error("Invalid golden model input");
  }
  const origin = new URL(input.origin);
  const openai: unknown = await import(new URL("/scripts/openai.js", origin).href);
  const extensions: unknown = await import(new URL("/scripts/extensions.js", origin).href);
  const toolModule: unknown = await import(new URL("/scripts/tool-calling.js", origin).href);
  if (!(isObject(openai) && "model_list" in openai && Array.isArray(openai.model_list) && openai.model_list.every(isModel))) {
    throw new Error("Invalid golden model list");
  }
  if (!(isObject(extensions) && "extension_settings" in extensions && isObject(extensions.extension_settings))) {
    throw new Error("Invalid golden extension settings");
  }
  const settings = extensions.extension_settings;
  const toolSettings = "tool_calling" in settings ? settings.tool_calling : undefined;
  if (toolSettings !== undefined && !isObject(toolSettings)) {
    throw new Error("Invalid golden tool settings");
  }
  if (!(isObject(toolModule) && "ToolManager" in toolModule)) {
    throw new Error("Invalid golden tool manager");
  }
  const manager = toolModule.ToolManager;
  if (!isManager(manager)) {
    throw new Error("Invalid golden tool manager");
  }
  const modelId = selectedModel ?? "claude-3-5-sonnet-20240620";
  const capability = { tools: true, supports_tools: true, max_context_length: 200_000 };
  const existing = openai.model_list.find((model) => model.id === modelId);
  if (existing === undefined) {
    const model = { id: modelId, ...capability };
    openai.model_list.push(model);
  } else {
    Object.assign(existing, capability);
  }
  Object.assign(settings, { tool_calling: Object.assign(toolSettings ?? {}, { function_calling: true }) });
  for (const tool of input.tools) {
    manager.registerFunctionTool({
      name: tool.name,
      displayName: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      action: () => "mock_tool_result",
      shouldRegister: () => true,
    });
  }
}
