// useConfigLeaf — the per-leaf value/defaults seam (config-revamp-design.md §3.4/§7.7, #866 row-chrome
// leg): resolves a focused/rendered leaf's DECLARED `key` binding through the config-section registry
// into `{current, default, modified, reset}`. The ONE derivation both chrome surfaces read — the row's
// modified stripe + revealed Reset AND the teacher's About default-vs-current block — over the SAME
// `#lib` compare the `@modified` search axis uses, so no two surfaces can disagree about "modified".
//
// HOMED IN `#components`, not `#data` (§7.7): the resolution needs the config-section registry — a
// `#state` context `#data` may not import — and its consumers are the tier-2 `SettingRow` and the config
// feature's teacher, so this is the highest common floor. NULL-TOLERANT BY DESIGN: the registry is read
// via `use(Context)` (the sanctioned nullable read — `useRegistry()` throws), so a `SettingRow` mounted
// outside config (or a CT without the provider) stays inert instead of crashing.
//
// RESET IS ONE DIRECT WRITE (`updateUserSettingsSection({section, patch: {[key]: default}})`) — the §7.7
// deviation from the original "the frame gets onReset from the section": the About door (the COARSE
// path) cannot reach a section's form session, and two reset paths would be the two-writer drift trap.
// The autosave boundary's clean server-echo reseed adopts the round-tripped value into the live control;
// a dirty form keeps the in-flight edit (last-writer-wins — Reset stays available).

import type { UserSettingsSection } from "@orb/contracts/settings";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { useQuery } from "@tanstack/react-query";
import { use } from "react";
import type { Trpc } from "#data";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";
import { settingsValueAtPath, settingsValueDiffers } from "#lib";
import type { ConfigGroupId } from "#state";
import { configSectionRegistryContext } from "#state";

/** The row/teacher address of one leaf — the `configFocus` vocabulary, structurally. */
export interface ConfigLeafAddress {
  readonly group: ConfigGroupId;
  readonly sub: string;
  readonly setting: string;
}

/** A bound leaf's value seam. `current`/`defaultValue` are the RAW stored values (`unknown` — the
 *  consumer formats); `modified` is the `@modified` compare at leaf grain. */
export interface ConfigLeafValue {
  readonly current: unknown;
  readonly defaultValue: unknown;
  readonly modified: boolean;
  /** Write the default back through the section's own wire (one undoable write, never a destructive act). */
  readonly reset: () => void;
  readonly resetPending: boolean;
}

interface ResetLeafVars {
  readonly section: UserSettingsSection;
  readonly patch: Record<string, unknown>;
}
const useResetLeaf = createEntityMutation<ResetLeafVars, unknown>({
  options: (trpc: Trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true, // updateUserSettingsSection emits settingsChanged → USER_BUS covers getUserSettings.
  errorToast: "Couldn't reset the setting.",
});

/**
 * Resolve one leaf's value seam, or `null` when the address is null, the registry is absent, the leaf
 * declares no `key`, or the owning contribution's claim is not user-tier — every null is "this row has
 * no value chrome", never an error (the partition assert owns the only illegal shape: a declared key
 * outside its section's claim).
 */
export function useConfigLeaf(address: ConfigLeafAddress | null): ConfigLeafValue | null {
  const registry = use(configSectionRegistryContext.Context);
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  // Non-suspense (the use-modified-sections posture): chrome must never block a row from painting — an
  // unresolved read simply reports no chrome yet.
  const { data: user } = useQuery(trpc.settings.getUserSettings.queryOptions());
  const resetMutation = useResetLeaf({ trpc, invalidation });

  if (address === null || registry === null || user === undefined) {
    return null;
  }
  const contribution = registry.list().find((c) => c.anchor === address.group && c.nav.id === address.sub);
  const leaf = (contribution?.nav.settings ?? []).find((s) => s.id === address.setting);
  const claim = contribution?.owns;
  if (leaf?.key === undefined || claim === undefined || claim.tier !== "user") {
    return null;
  }
  const key = leaf.key;
  const path = `${claim.section}.${key}`;
  const current = settingsValueAtPath(user.config, path);
  const defaultValue = settingsValueAtPath(DEFAULT_USER_SETTINGS, path);
  return {
    current,
    defaultValue,
    modified: settingsValueDiffers(current, defaultValue),
    reset: (): void => {
      resetMutation.mutate({ section: claim.section, patch: { [key]: defaultValue } });
    },
    resetPending: resetMutation.isPending,
  };
}
