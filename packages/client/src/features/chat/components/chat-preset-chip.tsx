// The topbar's preset chip: the viewer's ACTIVE-for-generation preset by name. A chat carries NO preset binding
// (D58 rules that impossible and a gate enforces it), so this names the preset that governs generation for the
// viewer in this room — `settings.config.seeds.defaultPresetId` (null = the built-in) resolved against
// `preset.list`. Plain `useQuery`: it never suspends, so it has THREE states and says which one it is in
// (`PresetChipState`) — a name, "still reading", or "could not name it" — and never renders nothing, because
// absence read the same as a header with no preset chip at all.

import { Badge } from "@orb/ui/badge";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";

/** What the chip says while the built-in preset governs generation (the seed stores "no explicit preset" as
 *  `null`, never the built-in row's own id). */
const BUILT_IN_PRESET_LABEL = "Built-in preset";

/** What the chip says when the reads have SETTLED and still cannot name the preset — the list read failed, or
 *  the seed points at a preset that is no longer there. */
const UNNAMEABLE_PRESET_LABEL = "Preset unavailable";

/** What the chip says while the two reads are still on their way. */
const PENDING_PRESET_LABEL = "Preset…";

type PresetChipState = { readonly kind: "pending" } | { readonly kind: "unnameable" } | { readonly kind: "named"; readonly name: string };

/** What the chip's `title` explains, per arm — a mapped Record over the union, so a fourth arm fails tsc here
 *  rather than shipping a chip with no explanation. */
const PRESET_CHIP_TITLES: Record<PresetChipState["kind"], string> = {
  named: "The preset that governs generation for you in this room",
  pending: "Reading which preset governs generation for you in this room…",
  unnameable: "Couldn't name the preset that governs generation for you here — the preset list didn't load, or the one you had is gone",
};

function presetChipLabel(state: PresetChipState): string {
  if (state.kind === "named") {
    return state.name;
  }
  return state.kind === "pending" ? PENDING_PRESET_LABEL : UNNAMEABLE_PRESET_LABEL;
}

/** The viewer's active preset, cache-first. `pending` only while a read is genuinely in flight — a SETTLED
 *  read that cannot produce a name is `unnameable`, never pending forever. */
function useActivePresetChip(): PresetChipState {
  const trpc = useTRPC();
  const settingsQuery = useQuery(trpc.settings.getUserSettings.queryOptions());
  const presetsQuery = useQuery(trpc.preset.list.queryOptions());
  const settings = settingsQuery.data;
  if (settings === undefined) {
    return settingsQuery.isError ? { kind: "unnameable" } : { kind: "pending" };
  }
  const activeId = settings.config.seeds.defaultPresetId;
  if (activeId === null) {
    return { kind: "named", name: BUILT_IN_PRESET_LABEL };
  }
  const name = presetsQuery.data?.find((preset) => preset.id === activeId)?.name;
  if (name !== undefined) {
    return { kind: "named", name };
  }
  return presetsQuery.data === undefined && !presetsQuery.isError ? { kind: "pending" } : { kind: "unnameable" };
}

export function ChatPresetChip(): ReactElement {
  const preset = useActivePresetChip();
  return (
    <Badge
      tone="soft"
      size="sm"
      intent="neutral"
      className="shell-chat-preset-chip min-w-0 max-w-cq-sm truncate"
      data-slot="chat-preset-chip"
      data-preset-state={preset.kind}
      title={PRESET_CHIP_TITLES[preset.kind]}
    >
      {presetChipLabel(preset)}
    </Badge>
  );
}
