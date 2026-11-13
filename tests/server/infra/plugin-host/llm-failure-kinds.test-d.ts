// The kinds a server guest reads for a failed model call are exactly the provider failure kinds: contracts sit below
// inference, so the guest-facing tuple is a mirror, and this pin fails `tsc` the moment the two differ.
// @subject packages/contracts/src/plugin/errors.ts
import type { PluginLlmFailureKind } from "@orb/contracts/plugin";
import type { ProviderErrorKind } from "@orb/inference";
import { expectTypeOf, test } from "vitest";

test("the guest's model failure kinds are the provider failure kinds", () => {
  expectTypeOf<PluginLlmFailureKind>().toEqualTypeOf<ProviderErrorKind>();
});
