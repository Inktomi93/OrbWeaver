// The Presets section's `useSelectionTitle` — the mobile pushed frame's topbar names the open PRESET, not
// the section (side-eye P2). Cache-first + gated, sharing the `preset.get` read the editor already made;
// `null` until it lands ⇒ the shell prints the section label rather than a blank bar.

import { useGatedQuery, useTRPC } from "#data";
import { useSelectedPresetId } from "#state";

export function usePresetSelectionTitle(): string | null {
  const trpc = useTRPC();
  const { data } = useGatedQuery(useSelectedPresetId(), (id) => trpc.preset.get.queryOptions({ id }));
  const name = data?.name ?? "";
  return name.length === 0 ? null : name;
}
