import type { ProviderId } from "@orb/contracts/inference";
import type { UserIntent } from "@orb/contracts/preset";
import { castId } from "@orb/kit/ids";
import type { JsonValue } from "@orb/kit/json";
import { runOpenAiCompatChatTurn } from "#inference/backends/openai-compat/chat.ts";
import { curatedRows } from "#inference/capability/sources/curated/loader.ts";
import { synthesizeCapability } from "#inference/capability/synthesize.ts";
import type { ChatDeltaSubscription, ChatResult, OpenAiCompatChatRequest } from "#inference/contract/chat.ts";
import { fakeApiKeySecret, fakeResolved, memoryTokenLexicon } from "../../_support.ts";
import type { RecordedRequest } from "../_hosted-support.ts";
import { generationCapability, openAiTextStream, scriptedSseFetch } from "../_hosted-support.ts";

export { runOpenAiCompatChatTurn } from "#inference/backends/openai-compat/chat.ts";
export { curatedRows } from "#inference/capability/sources/curated/loader.ts";
export { synthesizeCapability } from "#inference/capability/synthesize.ts";
export type { ChatResult, OpenAiCompatChatRequest } from "#inference/contract/chat.ts";
export { ProviderError } from "#inference/contract/errors.ts";

export const NOW = 1_700_000_000_000;
export const REASONING = "Paris weather needs the tool.";

const APP = { name: "orbweaver-test", url: "http://localhost:0" };

function silentLog(): Parameters<typeof runOpenAiCompatChatTurn>[1]["log"] {
  const noop = (): void => undefined;
  return { debug: noop, info: noop, warn: noop, error: noop };
}

export function turnDeps(fetchImpl: typeof fetch): Parameters<typeof runOpenAiCompatChatTurn>[1] {
  return { now: () => NOW, log: silentLog(), transport: { fetch: fetchImpl, app: APP }, tokens: memoryTokenLexicon() };
}

type OpenAiCompatRequestOverrides = Partial<Omit<OpenAiCompatChatRequest, "chatId" | "onDelta">> & ChatDeltaSubscription;

export function orRequest(overrides: OpenAiCompatRequestOverrides = {}): OpenAiCompatChatRequest {
  const connection = fakeResolved({
    task: "chat",
    providerId: "openrouter",
    model: "anthropic/claude-opus-4-5",
    capability: generationCapability(),
    secret: fakeApiKeySecret("sk-or-not-a-real-key"),
  });
  const base = {
    api: "chat-completions",
    connection,
    params: { effort: "high" } satisfies UserIntent,
    systemPrompt: { static: "You are a helpful assistant.", dynamic: "" },
    history: [{ role: "user", content: [{ type: "text", text: "What is the weather in Paris?" }] }],
    tools: [{ name: "get_weather", description: "Weather for a city.", parameters: { type: "object", properties: { city: { type: "string" } } } }],
  } satisfies OpenAiCompatChatRequest;
  return { ...base, ...overrides };
}

export function warningCodes(turn: ChatResult): string[] {
  return turn.events.flatMap((event) => (event.kind === "warning" ? [event.code] : []));
}

/** A connection whose `extras` the belt has to judge — minted through the real factory's own `extras`
 *  axis, so a change to the resolved shape breaks HERE rather than being hidden by a cast. */
export const extrasConnection = (extras: Readonly<Record<string, JsonValue>>): OpenAiCompatChatRequest["connection"] =>
  fakeResolved({
    task: "chat",
    providerId: "openrouter",
    model: "anthropic/claude-opus-4-5",
    capability: generationCapability(),
    secret: fakeApiKeySecret("sk-or-not-a-real-key"),
    extras,
  });

export async function sentBody(req: OpenAiCompatChatRequest): Promise<Record<string, unknown>> {
  const recorded: RecordedRequest[] = [];
  await runOpenAiCompatChatTurn(req, turnDeps(scriptedSseFetch([openAiTextStream("ok")], recorded)));
  return recorded[0]?.body ?? {};
}

/** An OpenRouter connection whose capability is the REAL curated fold for `model` on this route. */
export function orCuratedConnection(model: string): OpenAiCompatChatRequest["connection"] {
  const { capability } = synthesizeCapability("generation", "anthropic", {
    curated: curatedRows({ model, providerId: castId<ProviderId>("openrouter"), wire: "openai-compat", api: "chat-completions" }),
  });
  return fakeResolved({ task: "chat", providerId: "openrouter", model, capability, secret: fakeApiKeySecret("sk-or-not-a-real-key") });
}
