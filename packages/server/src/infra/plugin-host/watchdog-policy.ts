// infra/plugin-host/watchdog-policy — pure fail-closed broker heartbeat policy.
//
// A BEAT CARRIES ITS BROKER'S KEY. A guest Worker's stderr reaches the broker's stderr through the broker's main thread,
// so code that escaped QuickJS could write a line shaped like a beat, and one naming a small RSS hides the Worker's real
// memory from the ceiling. The broker's main thread mints a key and sends it on the IPC channel with its readiness,
// before it starts any Worker. No Worker can read that thread's heap, the channel's outbound side or the pipe, so a line
// without the key is no beat.

import { timingSafeEqual } from "node:crypto";
import { PLUGIN_BROKER_HEARTBEAT_MISSES_MAX, PLUGIN_BROKER_LIVENESS_BOUND_MS } from "./budgets.ts";
import { PLUGIN_BROKER_BEAT_MAX_BYTES } from "./process-protocol.ts";

const PLUGIN_BROKER_STARTUP_TIMEOUT_MS = 10_000;

/** One beat the broker's main thread wrote on its stderr. */
export interface BrokerHeartbeat {
  /** The broker's own monotonic clock at send; compared only with that broker's earlier heartbeats. */
  readonly sentAtMs: number;
  readonly rssBytes: number;
  readonly peakPhysicalWorkers: number;
  readonly execArgv: readonly string[];
  readonly nodeOptions: null;
}

/** What one line of the broker's stderr is to its watchdog: a beat; a line with this broker's key that is no beat, a
 *  host defect; a line shaped like a beat without the key, which no host code writes once the key is known; or text. */
export type BrokerStderrLine =
  | { readonly kind: "beat"; readonly heartbeat: BrokerHeartbeat }
  | { readonly kind: "malformed" }
  | { readonly kind: "unkeyed" }
  | { readonly kind: "text" };

const HEARTBEAT_KIND = "plugin-broker-memory";

// A stderr line's JSON, or null for a line that is not JSON or is too long to be a beat. `JSON.parse` throws only
// `SyntaxError`; any other fault is a defect and stays loud.
function parseBeatLine(line: string): unknown {
  if (Buffer.byteLength(line, "utf8") > PLUGIN_BROKER_BEAT_MAX_BYTES) {
    return null;
  }
  try {
    return JSON.parse(line);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return null;
    }
    throw error;
  }
}

function claimsHeartbeat(message: unknown): message is object {
  return typeof message === "object" && message !== null && Reflect.get(message, "kind") === HEARTBEAT_KIND;
}

function carriesKey(message: object, beatKey: string): boolean {
  const key: unknown = Reflect.get(message, "key");
  return typeof key === "string" && key.length === beatKey.length && timingSafeEqual(Buffer.from(key), Buffer.from(beatKey));
}

function parseHeartbeat(message: object): BrokerHeartbeat | null {
  const sentAtMs: unknown = Reflect.get(message, "sentAtMs");
  const rssBytes: unknown = Reflect.get(message, "rssBytes");
  const peakPhysicalWorkers: unknown = Reflect.get(message, "peakPhysicalWorkers");
  const execArgv: unknown = Reflect.get(message, "execArgv");
  const nodeOptions: unknown = Reflect.get(message, "nodeOptions");
  return typeof sentAtMs === "number" &&
    Number.isFinite(sentAtMs) &&
    typeof rssBytes === "number" &&
    Number.isSafeInteger(rssBytes) &&
    rssBytes >= 0 &&
    typeof peakPhysicalWorkers === "number" &&
    Number.isSafeInteger(peakPhysicalWorkers) &&
    peakPhysicalWorkers >= 0 &&
    Array.isArray(execArgv) &&
    execArgv.every((value) => typeof value === "string") &&
    nodeOptions === null
    ? { sentAtMs, rssBytes, peakPhysicalWorkers, execArgv, nodeOptions }
    : null;
}

/** Read one line of the broker's stderr against the key the broker sent with its readiness. Before that arrives, no
 *  line is a beat. */
export function readBrokerStderrLine(line: string, beatKey: string | undefined): BrokerStderrLine {
  const claimed = parseBeatLine(line);
  if (!claimsHeartbeat(claimed)) {
    return { kind: "text" };
  }
  if (beatKey === undefined || !carriesKey(claimed, beatKey)) {
    return { kind: "unkeyed" };
  }
  const heartbeat = parseHeartbeat(claimed);
  return heartbeat === null ? { kind: "malformed" } : { kind: "beat", heartbeat };
}

/** What the watchdog knows at one judgement, made after it has read every message already waiting in its pipe. */
export interface BrokerLiveness {
  readonly startedAt: number;
  /** Whether the broker has sent its first heartbeat; until then only the startup deadline applies. */
  readonly heard: boolean;
  /** Consecutive judgements that found nothing new from the broker. */
  readonly misses: number;
  readonly rssBytes?: number;
  /** When the watchdog was told to stop, on the same clock as `now`. */
  readonly stoppedAt?: number;
}

export function brokerWatchdogFailure(now: number, memoryLimitBytes: number, state: BrokerLiveness): string | null {
  if (state.rssBytes !== undefined && state.rssBytes > memoryLimitBytes) {
    return `plugin broker: RSS ${state.rssBytes} exceeded the configured ${memoryLimitBytes}-byte watchdog ceiling`;
  }
  // A stopping broker is ended by wall time, not only by judged intervals: a lagging watchdog judges late, and the app
  // ends the watchdog a second after this bound, which would leave a hung broker with no supervisor. A false end does
  // no harm at stop.
  if (state.stoppedAt !== undefined && now - state.stoppedAt >= PLUGIN_BROKER_LIVENESS_BOUND_MS) {
    return `plugin broker: still running ${PLUGIN_BROKER_LIVENESS_BOUND_MS}ms after its stop; terminating it`;
  }
  if (!state.heard) {
    return now - state.startedAt > PLUGIN_BROKER_STARTUP_TIMEOUT_MS ? "plugin broker: no memory heartbeat arrived before the startup deadline" : null;
  }
  return state.misses >= PLUGIN_BROKER_HEARTBEAT_MISSES_MAX
    ? `plugin broker: no heartbeat for ${PLUGIN_BROKER_HEARTBEAT_MISSES_MAX} consecutive intervals (${PLUGIN_BROKER_LIVENESS_BOUND_MS}ms); terminating the unresponsive broker`
    : null;
}
