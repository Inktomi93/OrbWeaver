// The typed writer side of `settings.updateUserSettingsSection`. The router's `patch` is an opaque record and
// the verb's lenient re-parse drops a wrong key while answering success, so this type is the only wrong-key guard.

import type { UserSettings, UserSettingsSection } from "@orb/contracts/settings";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "./trpc.ts";

type DeepPartial<T> = T extends readonly unknown[] ? T : T extends object ? { readonly [K in keyof T]?: DeepPartial<T[K]> } : T;

type SectionWrite = inferInput<Trpc["settings"]["updateUserSettingsSection"]>;

/** One section's mutation variables. The verb deep-merges objects and replaces arrays.
 *  @remarks `patch` replaces the router's member: intersecting its `Record<string, unknown>` would re-admit every key. */
export type SectionPatchVars<S extends UserSettingsSection> = Omit<SectionWrite, "section" | "patch"> & {
  readonly section: S;
  readonly patch: DeepPartial<UserSettings[S]>;
};
