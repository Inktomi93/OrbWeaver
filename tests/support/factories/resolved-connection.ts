// support/factories/resolved-connection — typed builders for the provider-turn value objects tests
// fabricated ~200 times via `as unknown as X` (test-support-dry-punchlist §5, W1h). The point of these
// factories is the TYPED RETURN: a new required field on `ModelCapability`/`ResolvedConnection` becomes a
// compile error HERE (one place) instead of silently passing every fabricated literal.
//
//   • makeModelCapability — parsed through the real `modelCapabilitySchema`, so a new required schema key
//     errors at the default literal below (not silently absent in 30 test files).
//   • makeResolvedCredential — `ResolvedCredential` is BRAND-PROTECTED (contracts/credentials §128: the only
//     legit producer is the domain mint factory), so it is UN-buildable without a cast. The cast is
//     encapsulated here ONCE; the typed input keeps the shape honest for the keyless routing markers
//     (vllm/local-light/max-pro-sub) that ~150 sites fabricate. Keyed variants (openrouter/custom_openai)
//     keep bespoke construction — they carry secrets a blanket default shouldn't invent.
//   • makeResolvedConnection — composes the three; `api`/`model` default to the vLLM chat routing marker.

import type { ChatApi, ModelCapability, ResolvedConnection } from "@orb/contracts/connection";
import { modelCapabilitySchema } from "@orb/contracts/connection";
import type { AnthropicCredential, CustomOpenAiCredential, OpenRouterCredential, ResolvedCredential, VeniceCredential } from "@orb/contracts/credentials";
import type { ModelId, UserCredentialId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";

/** The keyless routing-marker sources — the credential arms carrying no secret, so a blanket default is
 *  safe (vllm/local-light/max-pro-sub all reduce to `{ source, credentialId: null }`). Tuple-declared (not
 *  an inline union) per §7.5 no-inline-union-redecl. */
const KEYLESS_SOURCES = ["vllm", "local-light", "max-pro-sub", "comfyui"] as const;
type KeylessSource = (typeof KEYLESS_SOURCES)[number];

/** FABRICATION-OK brand cast — the ONE sanctioned place outside the domain mint (contracts/credentials
 *  §128); `ResolvedCredential` is brand-protected and unforgeable, so every `make*` builder below routes
 *  its fully-typed input through this single cast. The builders' typed parameters keep each shape honest;
 *  a missing/renamed public field breaks the object literal HERE, not silently in 150 test files. */
function brand<C extends ResolvedCredential>(value: Omit<C, keyof CredentialBrandMarker>): C {
  // FABRICATION-OK: the ONE sanctioned brand cast (see the JSDoc above) — ResolvedCredential is unforgeable.
  return value as unknown as C;
}
// The contracts brand is a phantom `unique symbol` we can't name here; this local mirror lets `Omit` drop
// it from the builder's input shape so callers pass ONLY the real public fields. (No runtime effect.)
interface CredentialBrandMarker {
  readonly [brandKey: symbol]: unknown;
}

/** A brand-protected keyless `ResolvedCredential` (default `vllm`). The keyless W1h fix so ~150 call sites
 *  drop their own `as unknown as` and import this. */
export function makeResolvedCredential(source: KeylessSource = "vllm"): ResolvedCredential {
  return brand<ResolvedCredential>({ source, credentialId: null });
}

/** A brand-protected KEYED `openrouter` credential (W1h). Carries a real `apiKey`; `credentialId` defaults
 *  to null (env-seeded) — override with `{ credentialId }` for a stored-row credential. */
export function makeOpenRouterCredential(overrides: Partial<Omit<OpenRouterCredential, "source" | keyof CredentialBrandMarker>> = {}): OpenRouterCredential {
  return brand<OpenRouterCredential>({
    source: "openrouter",
    apiKey: overrides.apiKey ?? "sk-or-test",
    credentialId: overrides.credentialId ?? null,
  });
}

/** A brand-protected KEYED first-party `anthropic` credential (W11). Carries a real `apiKey` (an Anthropic
 *  `x-api-key`); `credentialId` is always a stored row (no env seed for this source), defaulting to a test id. */
export function makeAnthropicCredential(overrides: Partial<Omit<AnthropicCredential, "source" | keyof CredentialBrandMarker>> = {}): AnthropicCredential {
  return brand<AnthropicCredential>({
    source: "anthropic",
    apiKey: overrides.apiKey ?? "sk-ant-test",
    credentialId: overrides.credentialId ?? castId<UserCredentialId>("ucred_anthropic_test"),
  });
}

/** A brand-protected KEYED `custom_openai` (BYO OpenAI-compatible endpoint) credential (W1h). The active
 *  row IS the endpoint, so `credentialId` is non-null; `baseUrl` is required. `apiKey`/`headers` are null
 *  for a no-auth local server; `contextWindow` is the user-declared BYO ceiling (undefined until set). */
export function makeCustomOpenAiCredential(
  overrides: Partial<Omit<CustomOpenAiCredential, "source" | keyof CredentialBrandMarker>> = {},
): CustomOpenAiCredential {
  return brand<CustomOpenAiCredential>({
    source: "custom_openai",
    baseUrl: overrides.baseUrl ?? "https://byo.test/v1",
    apiKey: overrides.apiKey ?? null,
    headers: overrides.headers ?? null,
    credentialId: overrides.credentialId ?? castId<UserCredentialId>("ucred_test"),
    contextWindow: overrides.contextWindow,
    model: overrides.model,
    includeBody: overrides.includeBody ?? null,
    excludeBody: overrides.excludeBody ?? null,
    responseMap: overrides.responseMap ?? null,
  });
}

/** A brand-protected KEYED hosted `venice` image-generation credential (MA-1). Carries a real `apiKey`;
 *  `credentialId` is always a stored row (no env seed for this source), defaulting to a test id. */
export function makeVeniceCredential(overrides: Partial<Omit<VeniceCredential, "source" | keyof CredentialBrandMarker>> = {}): VeniceCredential {
  return brand<VeniceCredential>({
    source: "venice",
    apiKey: overrides.apiKey ?? "venice-test-key",
    credentialId: overrides.credentialId ?? castId<UserCredentialId>("ucred_venice_test"),
  });
}

const DEFAULT_CAPABILITY: ModelCapability = {
  reasoning: { mode: "none", enabled: false },
  sampling: {},
  output: { maxTokens: { min: 1, max: 8192 } },
  context: { window: 200_000 },
};

/** A fully-valid `ModelCapability`, parsed through the real schema so the return is provably in-shape and a
 *  new required schema field breaks the default literal above (the one-place error W1h buys). */
export function makeModelCapability(overrides: Partial<ModelCapability> = {}): ModelCapability {
  return modelCapabilitySchema.parse({ ...DEFAULT_CAPABILITY, ...overrides });
}

/** A `ResolvedConnection` over the keyless vLLM chat marker; override any axis (a different capability, a
 *  keyed credential built elsewhere, a specific model id). */
export function makeResolvedConnection(overrides: Partial<ResolvedConnection> = {}): ResolvedConnection {
  return {
    api: "chat-completions" as ChatApi,
    model: castId<ModelId>("test-model"),
    credential: makeResolvedCredential(),
    capability: makeModelCapability(),
    ...overrides,
  };
}
