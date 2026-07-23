// Shared test runner for the FIVE embed-shaped role dispatchers (embed/rerank/summarize/generateImage/
// imageEmbed — W2a). Their SOURCE modules are structurally identical 3-liners (assertCredentialAllowed →
// backendForSource → requireBackend → requireRoleImpl), so their tests were byte-near-identical. This
// hoists the skeleton; each role's mirror test file (kept 1:1 for the test-presence gate) is a thin call
// to `runEmbedShapedRoleTests(spec)`.
//
// THE SECURITY POINT (why a verifier gates this): these are the source-allowlist firewall tests. The
// matrix sweeps the FULL `CRED_SOURCES` enum PER role — every source is either an ALLOWED row (must route
// to the real `backendForSource` target) or a DENIED row (must fail-closed with NO backend call). The
// denied set is DERIVED (`CRED_SOURCES` minus the spec's allowed set), never hand-listed, so a new
// credential source auto-lands as a denied row for every role that doesn't opt it in — a typo'd/missing
// row cannot pass silently. chat + agent are EXCLUDED (real (api,source) branching / hard-pinned backend).
//
// W1h: the request credential is built through the keyed `resolved-connection` factory (keyless sources via
// makeResolvedCredential; the keyed openrouter/custom_openai via their typed builders) — no local
// `as unknown as ResolvedCredential` fabrication.

import type { CredentialSource } from "@orb/contracts/credentials";
import { CRED_SOURCES } from "@orb/contracts/credentials";
import type { BackendKey, ProviderBackend, ResolvedCredential } from "@orb/server/infra/providers";
import { backendForSource, ProviderError } from "@orb/server/infra/providers";
import { describe } from "vitest";
import {
  makeAnthropicCredential,
  makeCustomOpenAiCredential,
  makeOpenRouterCredential,
  makeResolvedCredential,
  makeVeniceCredential,
} from "../../../../support/factories/resolved-connection";
import { expect, test } from "../../../../support/fixtures";

/** The five roles this runner covers; the method name is BOTH the ProviderBackend impl key and the spy
 *  tag. Single-home tuple + derived union (no inline re-decl, Spine-TypeScript §7.5). */
const EMBED_SHAPED_METHODS = ["embed", "rerank", "summarize", "generateImage", "imageEmbed"] as const;
type EmbedShapedMethod = (typeof EMBED_SHAPED_METHODS)[number];

export interface EmbedShapedRoleSpec {
  readonly method: EmbedShapedMethod;
  /** The dispatcher factory (e.g. `createEmbedRole`). Typed loosely because each role has its own
   *  request/result pair; the runner only drives `create(deps)(req)` and observes the spy tag. */
  readonly create: (deps: { backends: ReadonlyMap<BackendKey, ProviderBackend> }) => (req: never) => Promise<unknown>;
  /** The sources the firewall permits for this role — the ONLY per-role policy input. Denied = the rest. */
  readonly allowedSources: readonly CredentialSource[];
  /** Build a minimal in-shape role request carrying the given credential. */
  readonly makeReq: (credential: ResolvedCredential) => unknown;
}

/** Build a brand-correct ResolvedCredential for any source (keyed builders for openrouter/custom_openai). */
function credFor(source: CredentialSource): ResolvedCredential {
  switch (source) {
    case "openrouter":
      return makeOpenRouterCredential();
    case "anthropic":
      return makeAnthropicCredential();
    case "custom_openai":
      return makeCustomOpenAiCredential();
    case "venice":
      return makeVeniceCredential();
    case "vllm":
    case "local-light":
    case "max-pro-sub":
    case "comfyui":
      return makeResolvedCredential(source);
    default: {
      const never: never = source;
      throw new Error(`unhandled source ${String(never)}`);
    }
  }
}

/** A backend whose `method` impl records `${key}:${method}` so the routed selection is observable. Every
 *  backend key is present so a mis-route to the wrong backend still records (and fails the assertion). */
function allBackends(method: EmbedShapedMethod, calls: string[]): Map<BackendKey, ProviderBackend> {
  const impl = (key: BackendKey): ProviderBackend =>
    // FABRICATION-OK: a spy backend — the dynamic `[method]` key can't be proven against the optional-impl
    // union, so the cast is inherent to a one-method test double (same shape the per-role tests used).
    ({
      key,
      [method]: (): Promise<unknown> => {
        calls.push(`${key}:${method}`);
        return Promise.resolve({});
      },
    }) as ProviderBackend;
  return new Map<BackendKey, ProviderBackend>([
    ["openrouter", impl("openrouter")],
    ["vllm", impl("vllm")],
    ["local-light", impl("local-light")],
    ["agent-sdk", impl("agent-sdk")],
    ["custom-openai", impl("custom-openai")],
    ["venice", impl("venice")],
    ["comfyui", impl("comfyui")],
  ]);
}

export function runEmbedShapedRoleTests(spec: EmbedShapedRoleSpec): void {
  const allowed = new Set(spec.allowedSources);
  const deniedSources = CRED_SOURCES.filter((s) => !allowed.has(s));
  const req = (source: CredentialSource): never => spec.makeReq(credFor(source)) as never;

  describe(`create${spec.method} role — source → the sealed ${spec.method} backend (allowed rows)`, () => {
    test.each(spec.allowedSources)(`%s routes to its derived backend's ${spec.method} impl`, async (source) => {
      const calls: string[] = [];
      await spec.create({ backends: allBackends(spec.method, calls) })(req(source));
      // The routed backend is the REAL dispatch derivation, not a hand-mapped expectation.
      expect(calls).toEqual([`${backendForSource(source)}:${spec.method}`]);
    });
  });

  describe(`create${spec.method} role — fail-closed (firewall denies every non-allowed source)`, () => {
    // The DERIVED denied set: every enum member the spec didn't allow. A source can appear in exactly one
    // of the two describes — the union is the whole CRED_SOURCES enum (asserted below), so nothing is
    // silently unswept.
    test.each(deniedSources)("%s is firewall-denied before any backend runs", async (source) => {
      const calls: string[] = [];
      const role = spec.create({ backends: allBackends(spec.method, calls) });
      await expect(role(req(source))).rejects.toBeInstanceOf(ProviderError);
      expect(calls).toEqual([]);
    });

    test("the allowed ∪ denied rows cover the FULL CredentialSource enum (no source unswept)", () => {
      expect(new Set([...spec.allowedSources, ...deniedSources])).toEqual(new Set(CRED_SOURCES));
      // allowed and denied are disjoint — a source can't be both.
      expect(spec.allowedSources.some((s) => deniedSources.includes(s))).toBe(false);
    });

    test("an UNWIRED backend fail-closes (a missing composition-root wire)", async () => {
      const role = spec.create({ backends: new Map<BackendKey, ProviderBackend>() });
      await expect(role(req(spec.allowedSources[0] as CredentialSource))).rejects.toBeInstanceOf(ProviderError);
    });

    test(`a backend that doesn't implement ${spec.method} fail-closes (not a call on undefined)`, async () => {
      const source = spec.allowedSources[0] as CredentialSource;
      const key = backendForSource(source);
      // A DELIBERATELY under-shaped backend (no method impl) is the negative-space probe for
      // requireRoleImpl's fail-close; a factory would defeat the "missing impl" the test asserts.
      // FABRICATION-OK: intentional under-shaped backend (see above).
      const role = spec.create({ backends: new Map([[key, { key } as ProviderBackend]]) });
      await expect(role(req(source))).rejects.toBeInstanceOf(ProviderError);
    });
  });
}
