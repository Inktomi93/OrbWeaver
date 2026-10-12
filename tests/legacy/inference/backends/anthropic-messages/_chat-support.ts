import type { ProviderId } from "@orb/contracts/inference";
import type { UserIntent } from "@orb/contracts/preset";
import { castId } from "@orb/kit/ids";
import { runAnthropicChatTurn } from "#inference/backends/anthropic-messages/chat.ts";
import { curatedRows } from "#inference/capability/sources/curated/loader.ts";
import { synthesizeCapability } from "#inference/capability/synthesize.ts";
import type { AnthropicChatRequest, ChatDeltaSubscription, ChatResult } from "#inference/contract/chat.ts";
import type { InferenceLog } from "#inference/deps.ts";
import { fakeApiKeySecret, fakeResolved } from "../../_support.ts";
import type { RecordedRequest, SseEvent } from "../_hosted-support.ts";
import { generationCapability, scriptedSseFetch } from "../_hosted-support.ts";

export { runAnthropicChatTurn } from "#inference/backends/anthropic-messages/chat.ts";
export type { AnthropicChatRequest, ChatResult } from "#inference/contract/chat.ts";
export { ProviderError } from "#inference/contract/errors.ts";

const NOW = 1_700_000_000_000;
export const THINKING = "The user wants Paris weather; call the tool.";
export const SIGNATURE = "ErcDCpkBCBIYAipASIGNATURE";

export interface LogLine {
  readonly level: string;
  readonly fields: Record<string, unknown>;
}

function recordingLog(lines: LogLine[]): InferenceLog {
  const push =
    (level: string): InferenceLog["info"] =>
    (fields): void => {
      lines.push({ level, fields: { ...fields } });
    };
  return { debug: push("debug"), info: push("info"), warn: push("warn"), error: push("error") };
}

type AnthropicRequestOverrides = Partial<Omit<AnthropicChatRequest, "chatId" | "onDelta">> & ChatDeltaSubscription;

export function turnRequest(overrides: AnthropicRequestOverrides = {}): AnthropicChatRequest {
  const connection = fakeResolved({
    task: "chat",
    providerId: "anthropic",
    model: "claude-opus-4-5-20251101",
    capability: generationCapability(),
    baseUrl: "https://api.anthropic.com",
    secret: fakeApiKeySecret("sk-ant-probe-not-a-real-key"),
  });
  const params: UserIntent = { effort: "high" };
  const base = {
    api: "anthropic-messages",
    connection,
    params,
    systemPrompt: { static: "You are a helpful assistant.", dynamic: "" },
    history: [{ role: "user", content: [{ type: "text", text: "What is the weather in Paris?" }] }],
    tools: [{ name: "get_weather", description: "Weather for a city.", parameters: { type: "object", properties: { city: { type: "string" } } } }],
  } satisfies AnthropicChatRequest;
  return { ...base, ...overrides };
}

export function deps(fetchImpl: typeof fetch, lines: LogLine[] = []): Parameters<typeof runAnthropicChatTurn>[1] {
  return { now: () => NOW, log: recordingLog(lines), transport: { fetch: fetchImpl } };
}

export async function recordedTurn(
  req: AnthropicChatRequest,
  stream: SseEvent[],
  headers: Readonly<Record<string, string>> = {},
): Promise<{ turn: ChatResult; body: RecordedRequest | undefined }> {
  const recorded: RecordedRequest[] = [];
  const turn = await runAnthropicChatTurn(req, deps(scriptedSseFetch([stream], recorded, headers)));
  return { turn, body: recorded[0] };
}

/** A direct-wire connection whose capability is the REAL curated fold for `model` (the rows `resolve-task.ts`
 *  folds for an `anthropic` connection), so the pin exercises the data the wire reads in production. */
export function curatedConnection(model: string): AnthropicChatRequest["connection"] {
  const { capability } = synthesizeCapability("generation", "anthropic", {
    curated: curatedRows({ model, providerId: castId<ProviderId>("anthropic"), wire: "anthropic-messages", api: "anthropic-messages" }),
  });
  return fakeResolved({
    task: "chat",
    providerId: "anthropic",
    model,
    capability,
    baseUrl: "https://api.anthropic.com",
    secret: fakeApiKeySecret("sk-ant-probe-not-a-real-key"),
  });
}

export const BUDGET = { type: "enabled", budget_tokens: 15_959 } as const;
