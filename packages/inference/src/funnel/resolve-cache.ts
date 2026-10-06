// Cache policy is pure; adapters spell controls and the shared placer owns conversational boundaries.
import type { CachePolicy, CachePolicyContext, GenerationCapability, PromptCacheSettings } from "@orb/contracts/inference";
import { clampRoleHandling, PROMPT_CACHE_TTLS, turnsLevelFor } from "@orb/contracts/inference";
import { responseCacheControlSchema, responseCacheSettingsSchema } from "@orb/contracts/preset";
import { detectModelFamily } from "../capability/families.ts";
import { ProviderError } from "../contract/errors.ts";
import type { ResolveCachePolicyInput, ResolvedCachePolicy, ResolvedWarning } from "../contract/resolve.ts";

function warn(warnings: ResolvedWarning[], message: string): void {
  warnings.push({ code: "cache_control_adjusted", message });
}

function prefixPlan(args: ResolveCachePolicyInput, warnings: ResolvedWarning[]): CachePolicy["prefix"] {
  const { context, generation, requestedDepth: depth } = args;
  const settings = context.promptSettings;
  const facts = generation?.turns;
  const format = prefixFormat(context, generation);
  const preservesBlockEnds =
    generation !== undefined &&
    clampRoleHandling(turnsLevelFor(generation, args.requestedRoleHandling).roleHandlingFloor, args.requestedRoleHandling) !== "none";
  const none: CachePolicy["prefix"] = { action: "none", format, ttl: null, cacheSystem: false, historyDepth: null, preservesBlockEnds: false };
  if (!settings.enabled) {
    return none;
  }
  if (settings.requestAutomatic === true) {
    if (facts?.requestAutomaticPromptCache !== true) {
      warn(warnings, "Request-wide automatic prefix caching is unsupported on this route; no automatic request control was applied");
      return none;
    }
    if (settings.cacheSystem || settings.historyDepth !== null) {
      warn(warnings, "Request-wide automatic prefix caching replaces manual system/history breakpoints; their saved settings are not applied");
    }
    return { ...none, action: "automatic-request", ttl: prefixTtl(settings, generation, warnings), preservesBlockEnds };
  }
  if (facts?.explicitPromptCache !== true || format === null) {
    warn(warnings, "App-authored prefix markers are unsupported on this route; provider implicit caching, if available, is unchanged");
    return none;
  }
  return {
    action: "markers",
    format,
    ttl: prefixTtl(settings, generation, warnings),
    cacheSystem: settings.cacheSystem,
    historyDepth: depth === undefined ? null : Math.max(depth, settings.historyDepth ?? 0),
    preservesBlockEnds,
  };
}

function prefixFormat(context: CachePolicyContext, generation: GenerationCapability | undefined): CachePolicy["prefix"]["format"] {
  const stated = generation?.turns?.promptCacheFormat;
  if (stated !== undefined) {
    return stated;
  }
  if (context.wire === "anthropic-messages") {
    return "cache-control";
  }
  if (context.dialect === "openrouter" && (detectModelFamily(context.factsModel) === "anthropic" || generation?.turns?.fixedCacheTtl !== undefined)) {
    return "cache-control";
  }
  return null;
}

function prefixTtl(settings: PromptCacheSettings, generation: GenerationCapability | undefined, warnings: ResolvedWarning[]): CachePolicy["prefix"]["ttl"] {
  if (generation?.turns?.promptCacheFormat === "openai-breakpoint") {
    return null;
  }
  const fixed = generation?.turns?.fixedCacheTtl;
  if (fixed !== undefined) {
    if (settings.ttl !== fixed) {
      warn(warnings, `This route applies ${fixed} prefix retention; the saved ${settings.ttl} setting was not applied`);
    }
    return fixed;
  }
  const ttl = PROMPT_CACHE_TTLS.find((value) => value === settings.ttl);
  if (ttl === undefined) {
    warn(warnings, "Invalid prefix retention was not sent; the provider's five-minute default applies");
  }
  return ttl ?? null;
}

function replayPlan(args: ResolveCachePolicyInput, warnings: ResolvedWarning[]): CachePolicy["replay"] {
  const { context, request, preset } = args;
  const configured = context.configuredReplay;
  const enabled = args.fresh === true ? false : (request?.enabled ?? preset?.enabled ?? configured.enabled ?? false);
  const provenance = replayProvenance(args);
  const ttlSeconds = request?.ttlSeconds ?? preset?.ttlSeconds ?? configured.ttlSeconds ?? null;
  const refresh = args.fresh !== true && enabled && (request?.refresh ?? configured.refresh ?? false);
  if (!context.responseReplaySupported && (enabled || request?.ttlSeconds !== undefined || request?.refresh === true || preset?.ttlSeconds !== undefined)) {
    warn(warnings, "Complete response replay controls are unsupported on this endpoint; no replay control was applied");
  }
  return {
    supported: context.responseReplaySupported,
    enabled: context.responseReplaySupported && enabled,
    ttlSeconds,
    refresh: context.responseReplaySupported && refresh,
    provenance,
  };
}

function replayProvenance(args: ResolveCachePolicyInput): CachePolicy["replay"]["provenance"] {
  if (args.fresh === true) {
    return "fresh";
  }
  if (args.request?.enabled !== undefined) {
    return "request";
  }
  if (args.preset?.enabled !== undefined) {
    return "preset";
  }
  return args.context.configuredReplay.enabled === undefined ? "default" : "connection";
}

function implicitRetention(args: ResolveCachePolicyInput, warnings: ResolvedWarning[]): CachePolicy["implicit"]["retention"] {
  const requested = args.context.promptSettings.retention;
  const configured = args.context.configuredRetention;
  if (configured.owned) {
    if (configured.value !== null && args.generation?.turns?.promptCacheRetentions?.includes(configured.value) !== true) {
      warn(warnings, "The connection's custom body sets prompt cache retention without documented support on this route; provider acceptance is unknown");
    }
    if (requested !== undefined && requested !== configured.value) {
      warn(warnings, "The connection's custom body owns prompt cache retention; the saved retention setting was not applied");
    }
    return configured.value;
  }
  if (requested === undefined) {
    return null;
  }
  if (args.generation?.turns?.promptCacheRetentions?.includes(requested) !== true) {
    warn(warnings, "This route does not document the requested prompt cache retention; no retention control was applied");
    return null;
  }
  return requested;
}

/** Resolve separate prefix, provider-implicit and complete-response controls for execution and editor readback. */
export function resolveCachePolicy(args: ResolveCachePolicyInput): ResolvedCachePolicy {
  if (
    (args.request !== undefined && !responseCacheControlSchema.safeParse(args.request).success) ||
    (args.preset !== undefined && !responseCacheSettingsSchema.safeParse(args.preset).success)
  ) {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: "Invalid response-cache control: retention must be whole seconds within the supported range",
    });
  }
  const warnings: ResolvedWarning[] = [];
  const settings = args.context.promptSettings;
  const facts = args.generation?.turns;
  const disableApplied = settings.disableImplicit === true && facts?.disablesImplicitPromptCache === true;
  if (settings.disableImplicit === true && !disableApplied) {
    warn(warnings, "This route cannot disable provider implicit caching; no implicit-disable control was applied");
  }
  return {
    plan: {
      prefix: prefixPlan(args, warnings),
      implicit: {
        supported: facts?.providerImplicitPromptCache ?? null,
        disableApplied,
        minimumRetentionSeconds: facts?.providerImplicitPromptCache === true ? (facts.cacheRetentionSeconds ?? null) : null,
        refreshOnHit: facts?.providerImplicitPromptCache === true ? (facts.cacheRetentionRefresh ?? null) : null,
        retention: implicitRetention(args, warnings),
      },
      replay: replayPlan(args, warnings),
    },
    warnings,
  };
}
