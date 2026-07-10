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
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";

/** The keyless routing-marker sources — the credential arms carrying no secret, so a blanket default is
 *  safe (vllm/local-light/max-pro-sub all reduce to `{ source, credentialId: null }`). Tuple-declared (not
 *  an inline union) per §7.5 no-inline-union-redecl. */
const KEYLESS_SOURCES = ["vllm", "local-light", "max-pro-sub"] as const;
type KeylessSource = (typeof KEYLESS_SOURCES)[number];

/** A brand-protected keyless `ResolvedCredential` (default `vllm`). The brand cast is encapsulated here —
 *  the one sanctioned place outside the domain mint (contracts/credentials §128); it is the test-side
 *  analogue of that mint, and the W1h fix so ~150 call sites drop their own `as unknown as` and import this. */
export function makeResolvedCredential(source: KeylessSource = "vllm"): ResolvedCredential {
  // FABRICATION-OK: the ONE sanctioned brand cast — ResolvedCredential is unforgeable by design (§128).
  return { source, credentialId: null } as unknown as ResolvedCredential;
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
export function makeResolvedConnection(
  overrides: Partial<ResolvedConnection> = {},
): ResolvedConnection {
  return {
    api: "chat-completions" as ChatApi,
    model: castId<ModelId>("test-model"),
    credential: makeResolvedCredential(),
    capability: makeModelCapability(),
    ...overrides,
  };
}
