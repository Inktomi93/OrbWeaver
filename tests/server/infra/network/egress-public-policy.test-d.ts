// @subject packages/server/src/infra/network/contract/egress.ts
import type { SafeFetchOptions, ScopedEgress } from "@orb/server/infra/network";
import { expectTypeOf, test } from "vitest";

test("public URL options cannot select configured-endpoint authority", () => {
  expectTypeOf<SafeFetchOptions>().not.toHaveProperty("ownerConfiguredEndpoint");
  expectTypeOf<Parameters<ScopedEgress["safeFetch"]>[1]>().not.toHaveProperty("ownerConfiguredEndpoint");
});
