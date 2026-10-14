import type { ChatId } from "@orb/kit/ids";
import type { AddSpanEvent, ProviderScrubSet, Resolved, ScheduleTimeout, WireCaptureSink } from "#contract";
import type { InferenceDeps, InferenceLog } from "./runtime.ts";

export interface AnthropicChatDeps {
  readonly scheduleTimeout?: ScheduleTimeout | undefined;
  readonly now: () => number;
  readonly random?: (() => number) | undefined;
  readonly log: InferenceLog;
  readonly addSpanEvent?: AddSpanEvent | undefined;
  readonly transport: AnthropicTransportDeps;
}

export interface AnthropicBackendDeps {
  readonly now: () => number;
  readonly random?: (() => number) | undefined;
  readonly scheduleTimeout?: InferenceDeps["scheduleTimeout"];
  readonly log: InferenceDeps["log"];
  readonly addSpanEvent?: AddSpanEvent | undefined;
  readonly fetch: typeof fetch;
  readonly captureWire?: InferenceDeps["captureWire"];
  readonly captureWireReply?: InferenceDeps["captureWireReply"];
  readonly imageToPng?: InferenceDeps["imageToPng"];
}

/** One `GET /v1/models` dial. The key is a plain string: a saved connection's decrypted key, or a key typed into
 *  a draft that has nothing saved yet. `secrets` is what the dial's error text is scrubbed of. */
export interface AnthropicModelsDial {
  readonly baseUrl: string | null;
  readonly secret: string | null;
  readonly secrets: ProviderScrubSet;
  readonly label: string;
  readonly signal?: AbortSignal | undefined;
}

export interface AnthropicTransportDeps {
  readonly fetch: typeof fetch;
  readonly captureWire?: WireCaptureSink | undefined;
  /** Tap the reply bytes onto the capture entry too (§D2) — the process-tier opt-in, off by default. */
  readonly captureWireReply?: boolean | undefined;
}

export interface AnthropicCall {
  readonly connection: Resolved;
  readonly deps: AnthropicTransportDeps;
  readonly label: string;
  readonly api: string;
  readonly chatId?: ChatId | undefined;
  /** The planned `output_config.format` schema. The SDK re-sanitizes that schema on its own (it drops `minItems` and
   *  `pattern`, which Anthropic takes, and turns `oneOf` into `anyOf`), so the planned one is put back after it. */
  readonly plannedSchema?: Record<string, unknown> | undefined;
}
