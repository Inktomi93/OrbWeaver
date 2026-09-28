import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createServer } from "node:http";

const EXPECTED_MODEL = "rpg-0078-scripted";
const MAX_REQUEST_BYTES = 4_194_304;
const SCRIPTED_PROMPT_TOKENS = 10;
const SCRIPTED_COMPLETION_TOKENS = 12;
const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE = 422;
const SSE_HEADERS = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache",
  connection: "keep-alive",
} as const;

interface OpenAiTool {
  readonly type?: string;
  readonly function?: { readonly name?: string };
}

interface OpenAiRequest {
  readonly model?: string;
  readonly stream?: boolean;
  readonly messages?: readonly { readonly role?: string; readonly content?: unknown }[];
  readonly tools?: readonly OpenAiTool[];
}

export interface ProviderRequestReceipt {
  readonly ordinal: number;
  readonly method: string;
  readonly path: string;
  readonly model: string;
  readonly stream: true;
  readonly messageCount: number;
  readonly finalMessageRole: string;
  readonly toolNames: readonly string[];
  readonly responseKind: "ford-tool" | "quiet" | "keep-tool";
}

export interface ScriptedProvider {
  readonly baseUrl: string;
  readonly requests: () => readonly ProviderRequestReceipt[];
  readonly close: () => Promise<void>;
}

interface ScriptedResponse {
  readonly kind: ProviderRequestReceipt["responseKind"];
  readonly prose: string;
  readonly toolCall: { readonly id: string; readonly name: "update_scene" | "no_changes"; readonly args: string };
}

const RESPONSES: readonly ScriptedResponse[] = [
  {
    kind: "ford-tool",
    prose: "The current catches at their knees as they cross.",
    toolCall: { id: "call_ford", name: "update_scene", args: JSON.stringify({ location: "the ford" }) },
  },
  { kind: "quiet", prose: "She says nothing of the keep.", toolCall: { id: "call_quiet", name: "no_changes", args: "{}" } },
  {
    kind: "keep-tool",
    prose: "The keep rises through the river mist.",
    toolCall: { id: "call_keep", name: "update_scene", args: JSON.stringify({ location: "the keep" }) },
  },
] as const;

function jsonError(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: { message } }));
}

async function readJson(req: IncomingMessage): Promise<OpenAiRequest> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const part of req) {
    const buffer = Buffer.isBuffer(part) ? part : Buffer.from(part);
    bytes += buffer.byteLength;
    if (bytes > MAX_REQUEST_BYTES) {
      throw new Error(`request body exceeded ${String(MAX_REQUEST_BYTES)} bytes`);
    }
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as OpenAiRequest;
}

function chunk(id: string, delta: Record<string, unknown>, finishReason: string | null = null): string {
  return `data: ${JSON.stringify({ id, object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason: finishReason }] })}\n\n`;
}

function terminalChunk(id: string, finishReason: "stop" | "tool_calls"): string {
  return `data: ${JSON.stringify({
    id,
    object: "chat.completion.chunk",
    choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
    usage: { prompt_tokens: SCRIPTED_PROMPT_TOKENS, completion_tokens: SCRIPTED_COMPLETION_TOKENS },
  })}\n\n`;
}

function writeResponse(res: ServerResponse, ordinal: number, scripted: ScriptedResponse): void {
  const id = `rpg-0078-${String(ordinal)}`;
  res.writeHead(HTTP_OK, SSE_HEADERS);
  res.write(chunk(id, { role: "assistant" }));
  res.write(chunk(id, { content: scripted.prose }));
  res.write(
    chunk(id, {
      tool_calls: [
        {
          index: 0,
          id: scripted.toolCall.id,
          type: "function",
          function: { name: scripted.toolCall.name, arguments: scripted.toolCall.args },
        },
      ],
    }),
  );
  res.write(terminalChunk(id, "tool_calls"));
  res.end("data: [DONE]\n\n");
}

function validateRequest(body: OpenAiRequest): { readonly messageCount: number; readonly finalMessageRole: string; readonly toolNames: readonly string[] } {
  if (body.model !== EXPECTED_MODEL) {
    throw new Error(`expected model ${EXPECTED_MODEL}, got ${String(body.model)}`);
  }
  if (body.stream !== true) {
    throw new Error("expected stream:true");
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    throw new Error("expected a non-empty messages array");
  }
  const finalMessageRole = body.messages.at(-1)?.role;
  if (finalMessageRole !== "user") {
    throw new Error(`expected the assembled turn to end on a user row, got ${String(finalMessageRole)}`);
  }
  if (!Array.isArray(body.tools)) {
    throw new Error("expected folded RPG tools on every request");
  }
  const toolNames = body.tools.map((tool) => tool.function?.name).filter((name): name is string => name !== undefined);
  if (!toolNames.includes("update_scene")) {
    throw new Error(`expected update_scene in tools, got ${JSON.stringify(toolNames)}`);
  }
  return { messageCount: body.messages.length, finalMessageRole, toolNames };
}

interface ClaimedResponse {
  readonly ordinal: number;
  readonly scripted: ScriptedResponse;
}

async function serveRequest(
  req: IncomingMessage,
  res: ServerResponse,
  receipts: ProviderRequestReceipt[],
  claimResponse: () => ClaimedResponse | null,
): Promise<void> {
  if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
    jsonError(res, HTTP_NOT_FOUND, "only POST /v1/chat/completions is served");
    return;
  }
  const body = await readJson(req);
  const validated = validateRequest(body);
  const claimed = claimResponse();
  if (claimed === null) {
    jsonError(res, HTTP_CONFLICT, "rpg-0078 scripted provider refuses request 4; the proof expects exactly three model calls");
    return;
  }
  receipts.push({
    ordinal: claimed.ordinal,
    method: req.method,
    path: req.url,
    model: EXPECTED_MODEL,
    stream: true,
    ...validated,
    responseKind: claimed.scripted.kind,
  });
  writeResponse(res, claimed.ordinal, claimed.scripted);
}

export function startScriptedProvider(port: number): Promise<ScriptedProvider> {
  const receipts: ProviderRequestReceipt[] = [];
  let acceptedRequests = 0;
  const claimResponse = (): ClaimedResponse | null => {
    const scripted = RESPONSES[acceptedRequests];
    if (scripted === undefined) {
      return null;
    }
    acceptedRequests += 1;
    return { ordinal: acceptedRequests, scripted };
  };
  const server: Server = createServer((req, res): void => {
    serveRequest(req, res, receipts, claimResponse).catch((error: unknown) => {
      jsonError(res, HTTP_UNPROCESSABLE, error instanceof Error ? error.message : String(error));
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve({
        baseUrl: `http://127.0.0.1:${String(port)}/v1`,
        requests: () => receipts.map((receipt) => ({ ...receipt, toolNames: [...receipt.toolNames] })),
        close: () =>
          new Promise<void>((done) => {
            server.closeAllConnections();
            server.close(() => done());
          }),
      });
    });
  });
}
