import type { TrpcWireOutput } from "../../../support/node/route-trpc.ts";

export type EffectiveAppSettings = TrpcWireOutput<"settings.getAppSettingsWithOverrides">["resolved"];
export type AppSettingsOverrides = TrpcWireOutput<"settings.getAppSettingsWithOverrides">["overrides"];

export const EFFECTIVE_APP_SETTINGS: EffectiveAppSettings = {
  corpusAutoindex: false,
  importSkipCharacters: [],
  logLevel: "info",
  forbidExternalMedia: true,
  trustHtml: false,
  allowInteractiveCards: false,
  memoryDefaults: {},
  memorySummarizer: {},
  rateLimits: { login: 10, aiTurn: 10, publicIp: 50, authed: 200 },
  agentSdkConcurrency: { summarize: 4 },
  privateEndpointAllowlist: [],
  localMultiUser: false,
  discreetLogin: false,
  ipCertificate: null,
  maxImageBytes: 5_000_000,
  maxDatabankBytes: 20_971_520,
  promptTransformDeadlineMs: 250,
  catalogRefreshIntervalMs: 86_400_000,
  imageVariantQuality: 80,
  structuredOutputShape: "as-projected",
  structuredOutputVehicle: "auto",
  promptCacheMinDepth: 0,
};

export function effectiveAppSettings(resolved: Partial<EffectiveAppSettings>): EffectiveAppSettings {
  return { ...EFFECTIVE_APP_SETTINGS, ...resolved };
}

export function appSettingsView(
  resolved: Partial<EffectiveAppSettings>,
  overrides: Partial<AppSettingsOverrides> = {},
): TrpcWireOutput<"settings.getAppSettingsWithOverrides"> {
  return { resolved: effectiveAppSettings(resolved), overrides };
}
