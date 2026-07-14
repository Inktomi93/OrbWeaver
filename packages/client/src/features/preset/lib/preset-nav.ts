// The preset EDITOR's tab registry + the static generation-select vocabularies (W10 Panel A — UI-Arch
// §4.2 Presets row: "tabbed editor (Sampling · Output · Quality · Reasoning · Templates · Post-process ·
// Compaction · Prompt)"). Registry-as-data: the tab strip renders from `PRESET_EDITOR_TABS`, so a new tab
// is a data edit and the id union is derived from the tuple (§11.1 derive-don't-respell). The select
// vocabularies here are the STATIC enum→label maps (thinking-display, names-behavior, continue-postfix,
// compaction-mode) — the message-role map is the shared `#lib/message-role-labels` (the ONE map; features
// import it, they don't re-spell it) — and the DESCRIPTOR-driven sampling/reasoning/verbosity vocab is NOT here
// (it lives in capability-panel-model.ts, iterated from `ModelCapabilityView` — the panel GATE).

import type {
  CompactionMode,
  ContinuePostfix,
  NamesBehavior,
  ThinkingDisplay,
} from "@orb/contracts/preset";
import {
  COMPACTION_MODES,
  CONTINUE_POSTFIX_TYPES,
  NAMES_BEHAVIOR,
  THINKING_DISPLAYS,
} from "@orb/contracts/preset";
import type { SelectItems } from "@orb/ui/select";

/** The editor's tab ids, in strip order (UI-Arch §4.2 Presets tabbed editor). Params-related tabs
 *  (Quality/Sampling/Reasoning/Output) render the descriptor-driven panel; the rest edit `PromptConfig`
 *  structure directly. */
const PRESET_EDITOR_TAB_IDS = [
  "quality",
  "sampling",
  "reasoning",
  "output",
  "prompt",
  "templates",
  "postProcess",
  "compaction",
  "variables",
  "regex",
] as const;

/** The tab-id union (file-local — §7.4 forbids an exported bare `type` alias in a feature lib; consumers
 *  read it via the `PresetEditorTab.id` interface field, or derive from `PRESET_EDITOR_TAB_IDS`). */
type PresetEditorTabId = (typeof PRESET_EDITOR_TAB_IDS)[number];

/** One editor tab (label + the section id it drives). */
export interface PresetEditorTab {
  readonly id: PresetEditorTabId;
  readonly label: string;
}

/** The tab strip, in render order. Keyed off the tuple so a new tab id is a `tsc` error until it has a label. */
export const PRESET_EDITOR_TABS: readonly PresetEditorTab[] = [
  { id: "quality", label: "Quality" },
  { id: "sampling", label: "Sampling" },
  { id: "reasoning", label: "Reasoning" },
  { id: "output", label: "Output" },
  { id: "prompt", label: "Prompt" },
  { id: "templates", label: "Templates" },
  { id: "postProcess", label: "Post-process" },
  { id: "compaction", label: "Compaction" },
  { id: "variables", label: "Variables" },
  { id: "regex", label: "Regex" },
];

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
  auto: "Auto — the SDK decides",
  managed: "Managed — summarize at a threshold",
  off: "Off — never compact",
};
export const COMPACTION_MODE_ITEMS: SelectItems<string> = COMPACTION_MODES.map((value) => ({
  value,
  label: COMPACTION_MODE_LABELS[value],
}));
