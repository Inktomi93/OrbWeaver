// Type-level pins for the #1599 scrub-set brand at the OpenRouter credential PROBE (#1820). THE CLAIM: the
// one boundary in `probe.ts` whose whole job is to handle a credential cannot reach the unscrubbed path by
// FORGETTING an argument or by handing over a bare `[]` — the two ways its old
// `secrets: readonly string[] = []` default was silently defeated. That matters because the probe's
// `reason` is display-bound (the Connections "test credential" surface renders it) and rides the
// `CredentialHealth` row, and the thing it is built from is an UPSTREAM error message: an OpenRouter error
// that reflects the submitted key would have travelled straight through an omitted set.
//
// These are `@ts-expect-error` pins on purpose, not `toBeCallableWith` assertions: an UNUSED
// `@ts-expect-error` is itself a tsc error (TS2578), so if the default parameter ever comes back — or the
// brand is widened back to a plain `readonly string[]` — these lines go RED rather than quietly passing.
// `types:graph` (`node scripts/ts7.cjs --noEmit -p tsconfig.json`) is the program that sees `tests/**`.
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { ProviderScrubSet } from "@orb/server/infra/providers";
import { providerCredentialSecretValues } from "@orb/server/infra/providers/backends/kit";
import { probeOpenRouterCredential } from "@orb/server/infra/providers/backends/openrouter";
import { expectTypeOf, test } from "vitest";

type ProbeClient = Parameters<typeof probeOpenRouterCredential>[0];

// @orb-waive no-test-fabrication(unknown): hand-built fake vendor SDK client — the probe only calls `credits.getCredits`, and Ends when this deliberate test boundary can be expressed without a fabricated typed value.
// nothing below executes (these are type-position assertions).
const client = { credits: { getCredits: (): Promise<never> => Promise.reject(new Error("never runs")) } } as unknown as ProbeClient;
const clock = (): number => 0;

test("the probe's scrub set is REQUIRED and BRANDED — a two-argument call does not compile", async () => {
  expectTypeOf(probeOpenRouterCredential).parameter(2).toEqualTypeOf<ProviderScrubSet>();
  // NONE OF THESE EXECUTE: vitest TYPE-CHECKS a `.test-d.ts` and never runs its body, which is exactly what
  // lets them spell argument lists that do not compile. The `allSettled` frame is only there to keep the
  // calls non-floating for `@typescript-eslint/no-floating-promises` — awaiting them individually would be
  // the same non-event.
  await Promise.allSettled([
    // @ts-expect-error — the two-argument call is exactly what the `= []` default used to admit, on the one
    // boundary in this backend that is defined by holding a credential.
    probeOpenRouterCredential(client, clock),
    // @ts-expect-error — `[]` lacks the brand; an empty literal is not a second way to say "no scrub".
    probeOpenRouterCredential(client, clock, []),
    // @ts-expect-error — nor is a populated list: a keyed boundary's set is DERIVED from its credential.
    probeOpenRouterCredential(client, clock, ["sk-test-hand-built-000000"]),
  ]);
});

test("the credential mint is the admissible producer", () => {
  // @orb-waive no-test-fabrication(unknown): server-can't-mint — ResolvedCredential is brand-sealed; only domain Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  // credentials/substrate/mint constructs one, and infra must not import a domain.
  const credential = { source: "openrouter", apiKey: "sk-test-not-a-real-key", credentialId: null } as unknown as ResolvedCredential;
  expectTypeOf(providerCredentialSecretValues(credential)).toEqualTypeOf<ProviderScrubSet>();
});
