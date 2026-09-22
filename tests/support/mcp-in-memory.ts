// support/mcp-in-memory — drive an in-process MCP server the way the Agent SDK does, over JSON-RPC, with no
// subprocess and no extra dependency. `@orb/inference` mounts a chat turn's tools as the SDK's own
// `McpSdkServerConfigWithInstance` (`{ type: "sdk", name, instance }`); the SDK runtime talks to `instance` over
// a transport, so a test that calls a handler directly would skip exactly the layer that matters — the server's
// own argument validation and its conversion of a handler throw into an `isError` result. This connects a
// minimal in-memory transport to `instance` and speaks `initialize` → `notifications/initialized` →
// `tools/call`, which is the SDK's own sequence.
//
// LOUD on a shape miss: a mount that is not an SDK server config, or a server that never answers, throws — a
// silently-absent handler would make every assertion built on it vacuous.

/** The JSON-RPC message the transport carries — only the fields this driver reads or writes. */
interface RpcMessage {
  readonly jsonrpc: "2.0";
  readonly id?: number;
  readonly method?: string;
  readonly params?: Record<string, unknown>;
  readonly result?: Record<string, unknown>;
  readonly error?: { readonly code: number; readonly message: string };
}

/** The transport contract the MCP server's `connect` drives (the MCP SDK's `Transport`, structurally). */
interface InMemoryTransport {
  onmessage?: (message: RpcMessage) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  start: () => Promise<void>;
  send: (message: RpcMessage) => Promise<void>;
  close: () => Promise<void>;
}

interface ConnectableServer {
  readonly connect: (transport: InMemoryTransport) => Promise<void>;
}

/** One `tools/call` result as the SDK runtime receives it. */
export interface McpCallResult {
  readonly content: readonly { readonly type: string; readonly text: string }[];
  readonly isError?: boolean;
}

export interface McpToolClient {
  readonly callTool: (name: string, args: Record<string, unknown>) => Promise<McpCallResult>;
}

function isConnectable(value: unknown): value is ConnectableServer {
  return typeof value === "object" && value !== null && "connect" in value && typeof value.connect === "function";
}

/** The mounted server out of an Agent SDK tool-server config. */
function serverOf(toolServer: unknown): ConnectableServer {
  const instance = typeof toolServer === "object" && toolServer !== null && "instance" in toolServer ? toolServer.instance : undefined;
  if (!isConnectable(instance)) {
    throw new Error("the mounted tool server is not an Agent SDK server config ({ type: 'sdk', instance }) — the SDK mount shape moved");
  }
  return instance;
}

/** A `tools/call` result, checked rather than cast: every block must be text (the only kind the mount emits). */
function callResultOf(name: string, result: Record<string, unknown> | undefined): McpCallResult {
  const content = result?.["content"];
  if (!Array.isArray(content)) {
    throw new Error(`tools/call ${name} answered without a content array`);
  }
  const blocks = content.map((block: unknown) => {
    if (typeof block !== "object" || block === null || !("type" in block) || !("text" in block) || typeof block.text !== "string") {
      throw new Error(`tools/call ${name} answered a non-text block`);
    }
    return { type: String(block.type), text: block.text };
  });
  return result?.["isError"] === true ? { content: blocks, isError: true } : { content: blocks };
}

/** Connect to the in-process server behind an Agent SDK tool-server config and hand back a `tools/call` client. */
export async function connectMcpInMemory(toolServer: unknown): Promise<McpToolClient> {
  const pending = new Map<number, (message: RpcMessage) => void>();
  const transport: InMemoryTransport = {
    start: () => Promise.resolve(),
    close: () => Promise.resolve(),
    send: (message) => {
      if (message.id !== undefined && (message.result !== undefined || message.error !== undefined)) {
        pending.get(message.id)?.(message);
        pending.delete(message.id);
      }
      return Promise.resolve();
    },
  };
  await serverOf(toolServer).connect(transport);
  let nextId = 0;
  const request = (method: string, params: Record<string, unknown>): Promise<RpcMessage> => {
    nextId += 1;
    const id = nextId;
    const answered = new Promise<RpcMessage>((resolve) => {
      pending.set(id, resolve);
    });
    const deliver = transport.onmessage;
    if (deliver === undefined) {
      throw new Error("the MCP server connected without taking the transport's message channel");
    }
    deliver({ jsonrpc: "2.0", id, method, params });
    return answered;
  };
  await request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "orb-test", version: "1" } });
  transport.onmessage?.({ jsonrpc: "2.0", method: "notifications/initialized" });
  return {
    callTool: async (name, args): Promise<McpCallResult> => {
      const response = await request("tools/call", { name, arguments: args });
      if (response.error !== undefined) {
        throw new Error(`tools/call ${name} answered a protocol error: ${response.error.message}`);
      }
      return callResultOf(name, response.result);
    },
  };
}
