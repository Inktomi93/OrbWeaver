import type { ChatId } from "@orb/kit/ids";
import type { RandomSource } from "@orb/kit/macro";
import type { Clock, ScheduleOp } from "@orb/kit/time";
import type { AddSpanEvent, Resolved, WireCaptureSink } from "#contract";
import type { InferenceDeps, InferenceLog } from "./runtime.ts";

export interface AnthropicChatDeps {
  readonly scheduleTimeout: ScheduleOp;
  readonly now: Clock;
  readonly random: RandomSource;
  readonly log: InferenceLog;
  readonly addSpanEvent?: AddSpanEvent | undefined;
  readonly transport: AnthropicTransportDeps;
}

export interface AnthropicBackendDeps {
  readonly now: Clock;
  readonly random: RandomSource;
  readonly scheduleTimeout: InferenceDeps["scheduleTimeout"];
  readonly log: InferenceDeps["log"];
  readonly addSpanEvent?: AddSpanEvent | undefined;
  readonly fetch: typeof fetch;
  readonly captureWire?: InferenceDeps["captureWire"];
  readonly captureWireReply?: InferenceDeps["captureWireReply"];
  readonly imageToPng?: InferenceDeps["imageToPng"];
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
