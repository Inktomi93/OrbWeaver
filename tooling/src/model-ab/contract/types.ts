// model-ab's shapes: the reboot-axis variant spec, one probe and its result, and the CLI options.

export interface Variant {
  readonly name: string;
  readonly model: string;
  readonly chatTemplate: string;
  readonly defaultChatTemplateKwargs: Record<string, unknown>;
  readonly extraArgs: readonly string[];
}

export interface ProbeResult {
  readonly probe: string;
  readonly ok: boolean;
  readonly status: number;
  readonly ms: number;
  readonly finishReason?: string | undefined;
  readonly reasoningChars?: number | undefined;
  readonly contentChars?: number | undefined;
  readonly completionTokens?: number | undefined;
  readonly error?: string | undefined;
  readonly contentHead?: string | undefined;
  readonly reasoningHead?: string | undefined;
}

export interface Probe {
  readonly name: string;
  readonly body: () => Record<string, unknown>;
  /** Returns a defect description, or null when the response satisfies the probe. */
  readonly verify?: (r: ChatResponse) => string | null;
}

// The OpenAI-compatible response shape, spelled in its OWN wire vocabulary (snake_case) — the same way
// the server's vLLM surfaces declare it (`infra/providers/vllm/surfaces/chat.ts` RawChoice/RawDelta).
interface RawToolCall {
  readonly function: { readonly arguments: string };
}
interface RawMessage {
  readonly content?: string;
  readonly reasoning_content?: string;
  readonly reasoning?: string;
  readonly tool_calls?: readonly RawToolCall[];
}
interface RawChoice {
  readonly finish_reason?: string;
  readonly message?: RawMessage;
}
interface RawUsage {
  readonly completion_tokens?: number;
}

export interface ChatResponse {
  readonly choices?: readonly RawChoice[];
  readonly usage?: RawUsage;
  readonly message?: string;
  readonly error?: { readonly message?: string };
}

export interface CliOptions {
  readonly list: boolean;
  readonly keepUp: boolean;
  readonly variants?: string | undefined;
  readonly baseUrl?: string | undefined;
  readonly model?: string | undefined;
  readonly port: number;
  readonly vllmBin: string;
  readonly hfHome: string;
}

export interface VariantRun {
  readonly name: string;
  readonly results: readonly ProbeResult[];
}
