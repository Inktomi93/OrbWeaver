import type { Principal } from "@orb/contracts/identity";
import type { InferenceRuntime, Resolved } from "@orb/inference";
import type { UserId } from "@orb/kit/ids";
import type { RefineryContext } from "./service.ts";

/** Cached editor facts may name a bound connection that background work cannot fund. */
export type ResolveStructuredBinding = (ownerId: UserId) => Promise<Resolved | null>;

/** Resolution consumes an honest, row-derived Principal; refinery never constructs authority. */
export interface StructuredBindingDeps {
  readonly resolve: InferenceRuntime["resolve"];
  readonly principalOf: (userId: UserId) => Promise<Principal>;
}

/** Draft planning uses the owner's live binding and Utility preset, never a default account. */
export interface SchemaPlanDeps {
  readonly resolveStructuredBinding: ResolveStructuredBinding;
  readonly resolveUtilityPresetParams: RefineryContext["resolveUtilityPresetParams"];
}
