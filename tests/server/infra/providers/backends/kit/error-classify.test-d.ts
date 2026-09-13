// Type-level pins for the #1599 scrub-set brand. THE CLAIM: a credential-bearing runner cannot reach the
// unscrubbed path by FORGETTING an argument or by handing over a bare `[]` — the two ways the old
// `secrets: readonly string[] = []` default was silently defeated. That matters because
// `providerErrorFromHttp`'s message reaches a DURABLE sink: the #1373 post-generation strike-out logs it as
// `securityEvent("credential_revoked", { reason })` beside the credential audit trail.
//
// These are `@ts-expect-error` pins on purpose, not `toBeCallableWith` assertions: an UNUSED
// `@ts-expect-error` is itself a tsc error (TS2578), so if the default parameter ever comes back — or the
// brand is widened back to a plain `readonly string[]` — these lines go RED rather than quietly passing.
// `types:graph` (`node scripts/ts7.cjs --noEmit -p tsconfig.json`) is the program that sees `tests/**`.
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { ProviderScrubSet } from "@orb/server/infra/providers";
import {
  extractHttpErrorDiagnostic,
  NO_PROVIDER_SECRETS,
  providerCredentialSecretValues,
  providerErrorFromHttp,
} from "@orb/server/infra/providers/backends/kit";
import { expectTypeOf, test } from "vitest";

const upstreamFailure: unknown = new Error("upstream rejected");

test("the scrub set is REQUIRED — a runner that forgets it does not compile", () => {
  expectTypeOf(providerErrorFromHttp).parameter(2).toEqualTypeOf<ProviderScrubSet>();
  expectTypeOf(extractHttpErrorDiagnostic).parameter(1).toEqualTypeOf<ProviderScrubSet>();
  // @ts-expect-error — a two-argument call is exactly the future runner this pin exists to stop, and it
  // compiled fine against the old `= []` default.
  providerErrorFromHttp(upstreamFailure, "some-future-backend chat");
  // @ts-expect-error — same requirement on the diagnostic peel, whose `body` is the REFLECTED upstream body.
  extractHttpErrorDiagnostic(upstreamFailure);
});

test("a hand-built array cannot stand in for a scrub set (no silent un-scrub)", () => {
  // Un-scrubbing has exactly ONE spelling, and it is a named constant that greps in one line.
  expectTypeOf(NO_PROVIDER_SECRETS).toEqualTypeOf<ProviderScrubSet>();
  // @ts-expect-error — `[]` lacks the brand; an empty literal is not a second way to say "no scrub".
  providerErrorFromHttp(upstreamFailure, "some-future-backend chat", []);
  // @ts-expect-error — nor is a populated list: a keyed boundary's set is DERIVED from its credential.
  providerErrorFromHttp(upstreamFailure, "some-future-backend chat", ["sk-test-hand-built-000000"]);
});

test("the credential mint is the other producer, and the brand still flows into plain-array consumers", () => {
  // @orb-waive no-test-fabrication(unknown): server-can't-mint — ResolvedCredential is brand-sealed; only domain Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  // credentials/substrate/mint constructs one, and infra must not import a domain.
  const credential = { source: "openrouter", apiKey: "sk-test-not-a-real-key", credentialId: null } as unknown as ResolvedCredential;
  expectTypeOf(providerCredentialSecretValues(credential)).toEqualTypeOf<ProviderScrubSet>();
  // The brand is a ONE-WAY gate: it must not force a cast at `redactSecretsFromText` and friends.
  expectTypeOf<ProviderScrubSet>().toExtend<readonly string[]>();
});
