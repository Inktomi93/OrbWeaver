// domain/settings/effective-config/layer — the floor-merge resolver: each field is "stored override ?? floor".
// Two floor origins: env-mirrored fields read foundation/env, born-in-DB fields read a code floor only an
// admin override moves. Pure (no I/O, no cache) — cache + reload live in cache.ts.

import type {
  AgentSdkConcurrency,
  AppSettings,
  EffectiveAppConfig,
  RateLimits,
  ResolvedAgentSdkConcurrency,
  ResolvedRateLimits,
} from "@orb/contracts/settings";
import {
  DEFAULT_DISCREET_LOGIN,
  DEFAULT_LOCAL_MULTI_USER,
  DEFAULT_MAX_IMAGE_BYTES,
  DEFAULT_STRUCTURED_OUTPUT_SHAPE,
  DEFAULT_STRUCTURED_OUTPUT_VEHICLE,
  PROMPT_CACHE_MIN_DEPTH_FLOOR,
} from "@orb/contracts/settings";
import { DATABANK_UPLOAD_MAX_BYTES } from "@orb/contracts/uploads";
import { env } from "#foundation/env";

// Born-in-DB floors (no env var; only an admin override moves them).
const FORBID_EXTERNAL_MEDIA_FLOOR = true;
const TRUST_HTML_FLOOR = false;
// The html-trust ladder's TOP rung, deployment half (#111 leg 3 security pass). OFF, and the floor is the
// ruling rather than a convention: the grant runs model-authored scripts in a viewer's browser, and it
// opens a WebRTC/STUN beacon no CSP directive can close (`@orb/kit/card-frame` residual R1), so an admin
// has to turn it on deliberately. Leg 1 also shipped an editor saying the rung was inert, so per-character
// opt-ins already stored were given under a different representation — default-ON would activate them.
const ALLOW_INTERACTIVE_CARDS_FLOOR = false;
const MS_PER_HOUR = 3_600_000;
const HOURS_PER_DAY = 24;
const MS_PER_DAY = MS_PER_HOUR * HOURS_PER_DAY;
// The per-transform prompt-transform deadline (item 2) — was the PROMPT_TRANSFORM_DEADLINE_MS const.
const PROMPT_TRANSFORM_DEADLINE_MS_FLOOR = 250;
// The model-catalog success-refresh cadence (item 5) — was REFRESH_EVERY_MS in the catalog scheduler.
const CATALOG_REFRESH_INTERVAL_MS_FLOOR = MS_PER_DAY;
// The image-variant lossy-encoder quality (item 6) — byte-identical to infra/image DEFAULT_QUALITY.
const IMAGE_VARIANT_QUALITY_FLOOR = 80;
// The databank single-document upload cap (item 3) — the route belt; an override may only TIGHTEN below it.
const MAX_DATABANK_BYTES_FLOOR = DATABANK_UPLOAD_MAX_BYTES;

function resolveAgentSdkConcurrency(o: AgentSdkConcurrency | null | undefined): ResolvedAgentSdkConcurrency {
  return { summarize: o?.summarize ?? env.AGENT_SDK_SUMMARIZE_CONCURRENCY };
}

/** The databank-upload cap: an admin override may only ever TIGHTEN below the route belt (the schema max IS
 *  the belt, so an over-belt value is impossible here; the `min` is belt-and-suspenders + documents intent). */
function resolveMaxDatabankBytes(o: number | null | undefined): number {
  return Math.min(MAX_DATABANK_BYTES_FLOOR, o ?? MAX_DATABANK_BYTES_FLOOR);
}

/** The born-in-DB scalar floors (ms cadences + image quality) — grouped so `layer()` stays under the
 *  cognitive-complexity ceiling; each is a plain `override ?? floor`. */
function resolveBornInDbScalars(o: AppSettings): {
  promptTransformDeadlineMs: number;
  catalogRefreshIntervalMs: number;
  imageVariantQuality: number;
} {
  return {
    promptTransformDeadlineMs: o.promptTransformDeadlineMs ?? PROMPT_TRANSFORM_DEADLINE_MS_FLOOR,
    catalogRefreshIntervalMs: o.catalogRefreshIntervalMs ?? CATALOG_REFRESH_INTERVAL_MS_FLOOR,
    imageVariantQuality: o.imageVariantQuality ?? IMAGE_VARIANT_QUALITY_FLOOR,
  };
}

/** The F12 allowlist's env floor: the operator's `PRIVATE_ENDPOINT_ALLOWLIST` when set; else BORN loopback
 *  under `AUTH_MODE=single-user` (one human, one box — the threat the allowlist exists for does not exist)
 *  and EMPTY on every multi-user mode (hosted providers only until an admin admits a host). */
function privateEndpointAllowlistFloor(): string[] {
  if (env.PRIVATE_ENDPOINT_ALLOWLIST !== undefined) {
    return splitCsv(env.PRIVATE_ENDPOINT_ALLOWLIST);
  }
  return env.AUTH_MODE === "single-user" ? [...SINGLE_USER_LOOPBACK_ALLOWLIST] : [];
}

const SINGLE_USER_LOOPBACK_ALLOWLIST = ["127.0.0.1", "::1"] as const;

function splitCsv(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function resolveRateLimits(o: RateLimits | null | undefined): ResolvedRateLimits {
  return {
    aiTurn: o?.aiTurn ?? env.RATE_LIMIT_AI_TURN,
    publicIp: o?.publicIp ?? env.RATE_LIMIT_PUBLIC_IP,
    authed: o?.authed ?? env.RATE_LIMIT_AUTHED,
    login: o?.login ?? env.RATE_LIMIT_LOGIN,
  };
}

/**
 * Resolve the stored override blob against the floor → the fully-present `EffectiveAppConfig`. Each field
 * is `override ?? floor`: `undefined` (absent) AND a stored `null` (the CLEAR sentinel) both fall through
 * to the floor — so an admin PATCH `{ field: null }` wipes the override and the floor reads back.
 */
export function layer(overrides: AppSettings): EffectiveAppConfig {
  return {
    corpusAutoindex: overrides.corpusAutoindex ?? env.CORPUS_AUTOINDEX,
    importSkipCharacters: overrides.importSkipCharacters ?? splitCsv(env.IMPORT_SKIP_CHARACTERS),
    logLevel: overrides.logLevel ?? env.LOG_LEVEL,
    forbidExternalMedia: overrides.forbidExternalMedia ?? FORBID_EXTERNAL_MEDIA_FLOOR,
    trustHtml: overrides.trustHtml ?? TRUST_HTML_FLOOR,
    allowInteractiveCards: overrides.allowInteractiveCards ?? ALLOW_INTERACTIVE_CARDS_FLOOR,
    memoryDefaults: overrides.memoryDefaults ?? {},
    memorySummarizer: overrides.memorySummarizer ?? {},
    rateLimits: resolveRateLimits(overrides.rateLimits),
    agentSdkConcurrency: resolveAgentSdkConcurrency(overrides.agentSdkConcurrency),
    privateEndpointAllowlist: overrides.privateEndpointAllowlist ?? privateEndpointAllowlistFloor(),
    maxImageBytes: overrides.maxImageBytes ?? DEFAULT_MAX_IMAGE_BYTES,
    maxDatabankBytes: resolveMaxDatabankBytes(overrides.maxDatabankBytes),
    ...resolveBornInDbScalars(overrides),
    localMultiUser: overrides.localMultiUser ?? DEFAULT_LOCAL_MULTI_USER,
    discreetLogin: overrides.discreetLogin ?? DEFAULT_DISCREET_LOGIN,
    ipCertificate: overrides.ipCertificate ?? null,
    ...resolveStructuredOutput(overrides),
    promptCacheMinDepth: overrides.promptCacheMinDepth ?? PROMPT_CACHE_MIN_DEPTH_FLOOR,
  };
}

// The two structured-output axes, resolved together because they COMPOSE (shape = how we spell an optional
// field; vehicle = which endpoint feature carries the schema) and a reader who finds one should find the
// other beside it. Extracted rather than inlined for the same reason `resolveBornInDbScalars` is: `layer`
// sits at the cognitive-complexity ceiling, and the honest fix for one more `??` is decomposition.
function resolveStructuredOutput(overrides: AppSettings): Pick<EffectiveAppConfig, "structuredOutputShape" | "structuredOutputVehicle"> {
  return {
    structuredOutputShape: overrides.structuredOutputShape ?? DEFAULT_STRUCTURED_OUTPUT_SHAPE,
    structuredOutputVehicle: overrides.structuredOutputVehicle ?? DEFAULT_STRUCTURED_OUTPUT_VEHICLE,
  };
}
