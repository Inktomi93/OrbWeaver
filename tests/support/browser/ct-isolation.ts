// The named isolation exception to Spine-Testing §10: a story that keeps ONE contribution of a door registry
// apart from the production roster says so here. `ct-config-mirror-parity` reads every call to this function.
import type { ContributorRegistry } from "@orb/client/lib";
import { createContributorRegistry } from "@orb/client/lib";

export { CtIsolation } from "./ct-isolated-subject.tsx";

/**
 * A deliberate subset of the door registry `name`, for a story whose subject is the subset itself.
 * `isolates` states in words what the story keeps apart from the production roster. The gate refuses an
 * absent or one-word reason, and a `name` that is not a door registry.
 */
export function isolationRegistry<Def extends { readonly id: string }>(
  name: string,
  _isolates: string,
  contributions: readonly Def[],
): ContributorRegistry<Def> {
  return createContributorRegistry<Def>(name, contributions);
}
