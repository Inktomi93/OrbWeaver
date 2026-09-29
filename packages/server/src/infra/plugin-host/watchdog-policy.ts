// infra/plugin-host/watchdog-policy — pure fail-closed broker heartbeat policy.

export const PLUGIN_BROKER_HEARTBEAT_INTERVAL_MS = 25;
export const PLUGIN_BROKER_HEARTBEAT_TIMEOUT_MS = 500;
export const PLUGIN_BROKER_STARTUP_TIMEOUT_MS = 10_000;

export interface BrokerHeartbeatState {
  readonly startedAt: number;
  readonly lastHeartbeatAt?: number;
  readonly rssBytes?: number;
}

export function brokerWatchdogFailure(now: number, memoryLimitBytes: number, state: BrokerHeartbeatState): string | null {
  if (state.rssBytes !== undefined && state.rssBytes > memoryLimitBytes) {
    return `plugin broker: RSS ${state.rssBytes} exceeded the configured ${memoryLimitBytes}-byte watchdog ceiling`;
  }
  const last = state.lastHeartbeatAt;
  if (last === undefined) {
    return now - state.startedAt > PLUGIN_BROKER_STARTUP_TIMEOUT_MS ? "plugin broker: no memory heartbeat arrived before the startup deadline" : null;
  }
  return now - last > PLUGIN_BROKER_HEARTBEAT_TIMEOUT_MS ? "plugin broker: memory heartbeat stopped; terminating the unresponsive broker" : null;
}
