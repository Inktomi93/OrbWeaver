// The preset EDITOR's tab registry + the static generation-select vocabularies (W10 Panel A — UI-Arch
// §4.2 Presets row). north-star §6.2: the ten leaf tabs regroup into FOUR primary groups (Generation ·
// Prompt · Context · Transforms), the leaves becoming sub-navigation inside each group — the leaf CONTENT
// is unchanged (a regroup, not a rewrite). Registry-as-data: the group strip renders from
// `PRESET_EDITOR_GROUPS`, so re-homing a leaf is a data edit and the leaf-id union is derived from the
// group tuple (§11.1 derive-don't-respell). The select vocabularies here are the STATIC enum→label maps
// (thinking-display, names-behavior, continue-postfix, compaction-mode) — the message-role map is the
// shared `#lib/message-role-labels` (the ONE map; features import it, they don't re-spell it) — and the
// DESCRIPTOR-driven sampling/reasoning/verbosity vocab is NOT here (it lives in capability-panel-model.ts,
// iterated from `ModelCapabilityView` — the panel GATE).

import type { CompactionMode, ContinuePostfix, NamesBehavior, ThinkingDisplay } from "@orb/contracts/preset";
import { COMPACTION_MODES, CONTINUE_POSTFIX_TYPES, NAMES_BEHAVIOR, THINKING_DISPLAYS } from "@orb/contracts/preset";
import type { SelectItems } from "@orb/ui/select";

/** The four primary groups + their sub-tabs, in strip order (north-star §6.2). Each leaf `id` still drives
 *  exactly one content panel (unchanged) — the grouping is the ONLY new structure. Keyed off `as const` so
 *  the leaf-id union derives from the tuple and a new leaf is a `tsc` error until it has a label + a home. */
const PRESET_EDITOR_GROUP_TUPLE = [
  {
    id: "generation",
    label: "Generation",
    tabs: [
      { id: "quality", label: "Quality" },
      { id: "sampling", label: "Sampling" },
      { id: "reasoning", label: "Reasoning" },
      { id: "output", label: "Output" },
    ],
  },
  {
    id: "prompt",
    label: "Prompt",
    tabs: [
      { id: "prompt", label: "Prompt" },
      { id: "templates", label: "Templates" },
    ],
  },
  {
    id: "context",
    label: "Context",
    tabs: [
      { id: "compaction", label: "Compaction" },
      { id: "variables", label: "Variables" },
      { id: "macros", label: "Macros" },
    ],
  },
  {
    id: "transforms",
    label: "Transforms",
    tabs: [
      { id: "postProcess", label: "Post-process" },
      { id: "regex", label: "Regex" },
    ],
  },
] as const;

/** The leaf-tab-id union (file-local — §7.4 forbids an exported bare `type` alias in a feature lib;
 *  consumers read it via the `PresetEditorTab.id` interface field). Derived from the group tuple's leaves. */
type PresetEditorTabId = (typeof PRESET_EDITOR_GROUP_TUPLE)[number]["tabs"][number]["id"];

/** The primary-group id union (file-local, same §7.4 rule). */
type PresetEditorGroupId = (typeof PRESET_EDITOR_GROUP_TUPLE)[number]["id"];

/** One leaf editor tab (label + the content id it drives). */
export interface PresetEditorTab {
  readonly id: PresetEditorTabId;
  readonly label: string;
}

/** One primary group (its own id/label + the leaf tabs it homes as sub-navigation). */
export interface PresetEditorGroup {
  readonly id: PresetEditorGroupId;
  readonly label: string;
  readonly tabs: readonly PresetEditorTab[];
}

/** The primary group strip, in render order — the four top-level tabs; each renders its `tabs` as sub-nav. */
export const PRESET_EDITOR_GROUPS: readonly PresetEditorGroup[] = PRESET_EDITOR_GROUP_TUPLE;

// ── The static enum→label select vocabularies (the non-descriptor knobs) ────────────────────────────

const THINKING_DISPLAY_LABELS: Record<ThinkingDisplay, string> = {
  summarized: "Summarized",
  omitted: "Omitted",
};
export const THINKING_DISPLAY_ITEMS: SelectItems<string> = THINKING_DISPLAYS.map((value) => ({
  value,
  label: THINKING_DISPLAY_LABELS[value],
}));

const NAMES_BEHAVIOR_LABELS: Record<NamesBehavior, string> = {
  none: "None — never include speaker names",
  default: "Default — prefix on persona switch",
  content: "Content — always prefix “Name: ”",
  completion: "Completion — the API `name` field",
};
export const NAMES_BEHAVIOR_ITEMS: SelectItems<string> = NAMES_BEHAVIOR.map((value) => ({
  value,
  label: NAMES_BEHAVIOR_LABELS[value],
}));

const CONTINUE_POSTFIX_LABELS: Record<ContinuePostfix, string> = {
  none: "None",
  space: "Space",
  newline: "Newline",
  "double-newline": "Double newline",
};
export const CONTINUE_POSTFIX_ITEMS: SelectItems<string> = CONTINUE_POSTFIX_TYPES.map((value) => ({
  value,
  label: CONTINUE_POSTFIX_LABELS[value],
}));

const COMPACTION_MODE_LABELS: Record<CompactionMode, string> = {
  auto: "Auto — the SDK's own compaction",
  managed: "Managed — summarize into a memory marker at a threshold",
};
export const COMPACTION_MODE_ITEMS: SelectItems<string> = COMPACTION_MODES.map((value) => ({
  value,
  label: COMPACTION_MODE_LABELS[value],
}));
/** The label for a compaction mode (the preset UI derives its unset-placeholder from `DEFAULT_COMPACTION_MODE`). */
export const compactionModeLabel = (mode: CompactionMode): string => COMPACTION_MODE_LABELS[mode];
