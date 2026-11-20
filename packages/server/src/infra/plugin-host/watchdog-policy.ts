// infra/plugin-host/watchdog-policy — pure fail-closed broker heartbeat policy.

import { PLUGIN_BROKER_HEARTBEAT_MISSES_MAX, PLUGIN_BROKER_LIVENESS_BOUND_MS } from "./budgets.ts";

const PLUGIN_BROKER_STARTUP_TIMEOUT_MS = 10_000;

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
