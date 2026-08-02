// The preset EDITOR's view registry + the static generation-select vocabularies (W10 Panel A — UI-Arch
// §4.2 Presets row). preset-surface-redesign.md §3 (owner decision D3): the two-level tree (4 groups × 10
// leaves) COLLAPSES to FIVE FLAT VIEWS — Params · Prompt · Actions · Data · Transforms — one `Tabs` level,
// each view one scrolling column. §6.2's regroup fixed leaf-sprawl by grouping; this fixes what grouping
// could not (the leaves themselves were too small to be tabs — a tab per radio group). Registry-as-data:
// the ONE strip renders from `PRESET_EDITOR_VIEWS` and the view-id union derives from the tuple
// (§11.1 derive-don't-respell). The ACTIVE view is section state (`presetEditorView`, #state) so CONTEXT
// can project per-view; this tuple owns the vocabulary + the default (the strip resolves an unset store
// read to `PRESET_EDITOR_VIEWS[0]`). The select vocabularies here are the STATIC enum→label maps
// (thinking-display, names-behavior, continue-postfix, compaction-mode) — the message-role map is the
// shared `#lib/message-role-labels` (the ONE map; features import it, they don't re-spell it) — and the
// DESCRIPTOR-driven sampling/reasoning/verbosity vocab is NOT here (it lives in capability-panel-model.ts,
// iterated from `ModelCapabilityView` — the panel GATE).

import type { CompactionMode, ContinuePostfix, NamesBehavior, ThinkingDisplay } from "@orb/contracts/preset";
import { COMPACTION_MODES, CONTINUE_POSTFIX_TYPES, NAMES_BEHAVIOR, THINKING_DISPLAYS } from "@orb/contracts/preset";
import type { SelectItems } from "@orb/ui/select";
import { selectPresetSection, setPresetEditorView } from "#state";

/** THE CROSS-VIEW SECTION DOOR (crunch-list O-13). A rack section is only reachable in the PROMPT view, so
 *  every "go to that section" affordance elsewhere on the surface — the Actions header's Guided-instruction
 *  cross-link, the Actions readout's marker name — has to do BOTH halves: switch the view AND write the
 *  selection. Selecting alone is what made the Actions button read as dead (the row it selected was in a
 *  view the click never opened), and it is the navigation the readout's own note promises verbatim
 *  ("Clicking the name selects that row in Prompt").
 *
 *  It writes through the SAME two store actions the tab strip and the rack use (§16 row 10 / row 19) — one
 *  writer each, no second navigation surface. */
export function openSectionInPrompt(sectionId: string): void {
  setPresetEditorView(PROMPT_VIEW);
  selectPresetSection(sectionId);
}

/** The five flat views, in strip order (redesign §3). Each `id` drives exactly one content body; the
 *  §3 schema→home map decides which fields live under which view. Keyed off `as const` so the view-id
 *  union derives from the tuple and a new view is a `tsc` error until it has a label AND a body. */
const PRESET_EDITOR_VIEW_TUPLE = [
  { id: "params", label: "Params" },
  { id: "prompt", label: "Prompt" },
  { id: "actions", label: "Actions" },
  { id: "data", label: "Data" },
  { id: "transforms", label: "Transforms" },
] as const;

/** The view-id union (file-local — §7.4 forbids an exported bare `type` alias in a feature lib; consumers
 *  read it via the `PresetEditorView.id` interface field). Derived from the tuple. */
type PresetEditorViewId = (typeof PRESET_EDITOR_VIEW_TUPLE)[number]["id"];

/** One flat editor view (label + the content id it drives). */
export interface PresetEditorView {
  readonly id: PresetEditorViewId;
  readonly label: string;
}

/** The ONE tab strip's views, in render order. `[0]` is the default the strip resolves an unset store
 *  read to — the default lives WITH the vocabulary, never re-spelled in the state store. */
export const PRESET_EDITOR_VIEWS: readonly PresetEditorView[] = PRESET_EDITOR_VIEW_TUPLE;

/** The view that owns the rack — read from the tuple, never re-spelled, so `openSectionInPrompt` cannot
 *  drift from the strip's own vocabulary. */
const PROMPT_VIEW: PresetEditorViewId = "prompt";

// ── The static enum→label select vocabularies (the non-descriptor knobs) ────────────────────────────

const THINKING_DISPLAY_LABELS: Record<ThinkingDisplay, string> = {
  summarized: "Summarized",
  omitted: "Omitted",
};
export const THINKING_DISPLAY_ITEMS: SelectItems<string> = THINKING_DISPLAYS.map((value) => ({
  value,
  label: THINKING_DISPLAY_LABELS[value],
}));
/** The label an UNSET Reasoning-display select GHOSTS (side-eye F-05). The VALUE comes from the effective
 *  read (the model's own resolved display mode), so a reading this build does not know prints ITSELF rather
 *  than a fabricated label — the read stays the authority on its own vocabulary. */
export const thinkingDisplayLabel = (value: string): string => (value in THINKING_DISPLAY_LABELS ? THINKING_DISPLAY_LABELS[value as ThinkingDisplay] : value);

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
/** The label an UNSET Speaker-names select GHOSTS (side-eye F-05) — the same map the options read. */
export const namesBehaviorLabel = (value: NamesBehavior): string => NAMES_BEHAVIOR_LABELS[value];

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
/** The label an UNSET Continue-delimiter select GHOSTS (side-eye F-05). */
export const continuePostfixLabel = (value: ContinuePostfix): string => CONTINUE_POSTFIX_LABELS[value];

// SHORT LABELS (owner ruling O-4). These are SELECT OPTION labels — the trigger renders the picked one
// inline, and "Default — Managed — summarize into a memory marker at a threshold" ran past the control
// column and truncated mid-sentence. The mode NAME is the label; what each mode DOES rides the row's hover
// hint (§4.1's rule: the datum is visible, the teaching costs no width).
//
// The old label also carried the O-5 VOCAB LIE: compaction writes `chats.compactSummary`/`compactedAtSeq`
// — its own chained COMPACTION marker spliced into the top history slot — and never feeds the Memory plane
// (remembered past events, a different system). The domain's own noun is "compaction marker"
// (`domain/chat/verbs/compaction.ts`), and that is what every preset-side copy site now says.
const COMPACTION_MODE_LABELS: Record<CompactionMode, string> = {
  auto: "Auto",
  managed: "Managed",
};
export const COMPACTION_MODE_ITEMS: SelectItems<string> = COMPACTION_MODES.map((value) => ({
  value,
  label: COMPACTION_MODE_LABELS[value],
}));
/** The label for a compaction mode (the preset UI derives its unset-placeholder from `DEFAULT_COMPACTION_MODE`). */
export const compactionModeLabel = (mode: CompactionMode): string => COMPACTION_MODE_LABELS[mode];
