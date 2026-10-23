// Name the registry subset and its isolation reason for review; construction uses the production registry factory.
import type { ContributorRegistry } from "@orb/client/lib";
import { createContributorRegistry } from "@orb/client/lib";

/**
 * A deliberate subset of the door registry `name`, for a story whose subject is the subset itself.
 * The isolation reason explains which behavior the story excludes; reviewers check that scope against its assertions.
 */
export function isolationRegistry<Def extends { readonly id: string }>(
  name: string,
  _isolates: string,
  contributions: readonly Def[],
): ContributorRegistry<Def> {
  return createContributorRegistry<Def>(name, contributions);
}
