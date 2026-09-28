// infra/plugin-host/worker-capacity — one parser for the app scheduler and broker physical Worker ceiling.

export const PLUGIN_BROKER_WORKER_MAX_ENV = "PLUGIN_BROKER_WORKER_MAX";

/** Shipped conservative default. A measured deployment may override the RSS/Worker pair together. */
export const PLUGIN_BROKER_DEFAULT_WORKER_MAX = 4;

export function resolvePluginBrokerWorkerMaximum(env: Readonly<Record<string, string | undefined>>): number {
  const raw = env[PLUGIN_BROKER_WORKER_MAX_ENV];
  if (raw === undefined) {
    return PLUGIN_BROKER_DEFAULT_WORKER_MAX;
  }
  if (!/^[1-9]\d*$/u.test(raw)) {
    throw new Error(`plugin broker: ${PLUGIN_BROKER_WORKER_MAX_ENV} must be a positive integer derived with the monitored RSS ceiling`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`plugin broker: ${PLUGIN_BROKER_WORKER_MAX_ENV} exceeds the safe integer range`);
  }
  return value;
}
