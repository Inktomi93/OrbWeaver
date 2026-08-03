// The PROMPT view's CONTEXT readout (preset-surface-redesign.md §7): the zone BUDGET, per-section token
// BARS with the selected section highlighted, the PIVOT health, and the assembled PREVIEW on demand.
//
// Each element names the decision it informs: what to trim or disable when the system block bloats (the
// bars) · where a section actually lands (the preview) · the structural fix when the pivot is missing or
// duplicated (health). The bar click is a sanctioned SELECTION echo (§16 row 19) — it writes through the
// ONE `selectPresetSection` store action, exactly as the rack row does.
//
// TWO ARMS, one panel (D121-G — the §7.1 binding's Prompt half, the residue this file used to name as
// pending):
//
//   BOUND: with a chat bound (the auto-bind chip above the panel), every bar is priced by the BOUND CHAT's
//   own assembly — the ONE `chat.previewAssembly` read with the editor's preset as `presetOverride`
//   (assemble that room as if THIS preset were active). A CARRIER stops reading `~—` and reports what the
//   conversation, the active world-info set and the merged cards ACTUALLY cost, and the selected section
//   drills into its MATERIALIZED ROWS — ST's inspect panel (`chatHistory-1 / assistant / 944`) with honest
//   data, because a real chat resolved them (Ruling B: the chat resolves, the editor displays).
//
//   UNBOUND: the chat-free floor. MATERIALIZATION HONESTY (§7, the owner ST-screenshot ruling): a CARRIER's
//   bar reads `~—`, never `~0`. Its real cost is the conversation or the active world-info set — chat-side
//   facts this editor cannot know, and a zero with a bar under it is a lie with a number on it. This is a
//   first-class arm, not a degradation ([[empty-states-are-load-bearing]]).
//
// SAVED TRUTH ONLY (§7 mechanics): the panel projects the `preset.get` row, never a live form bridge.
// Autosave means saved lags a typed edit by one debounce, and the `AutosaveStatus` chip already narrates
// settle — "settle-live" is stated, not faked keystroke-live. The bound read inherits the SAME settle: it
// rides `presetsChanged` through `promptPreviewReads`, so the real costs move with the edit you just made.

import type { AssemblySectionCost, AssemblySectionRow } from "@orb/contracts/chat";
import type { PromptSection } from "@orb/contracts/preset";
import type { ChatId, PresetId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Row, Section, Stack } from "@orb/ui/layout";
import { TrackBar } from "@orb/ui/meter";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { useTRPC } from "#data";
import { selectPresetSection } from "#state";
import { isTemplatedMarker } from "../../lib/assembly-model";
import { CARRIER_COST_GLYPH, formatEstimate, spokenEstimate } from "../../lib/format-count";
import { AssemblyPreview } from "../prompt-assembly/assembly-preview";
import { deriveZones } from "../prompt-assembly/derive-zones";
import { estimateSectionTokens } from "../prompt-assembly/estimate-tokens";
import { CARRIER_ATTRIBUTION, MARKER_COPY } from "../prompt-assembly/marker-copy";
import { assemblePreview } from "../prompt-assembly/preview-model";
import { DatumRow } from "./readout-parts";

export interface PromptReadoutProps {
  readonly sections: readonly PromptSection[];
  readonly selectedSectionId: string | null;
  /** The preset being inspected — the `presetOverride` half of the bound read (price the bound chat as if
   *  THIS preset were active), so the bars describe what you are editing, not what the room adopted. */
  readonly presetId: PresetId;
  /** The bound chat, or `null` for the unbound/dismissed arm. Resolved once by the readout and threaded down:
   *  the binding is ONE state with ONE home, never re-derived per panel. */
  readonly boundChatId: ChatId | null;
}

/** The bound chat's real cost per rack row, keyed by `PromptSection.id` — `null` is the UNBOUND floor (and the
 *  not-yet-landed read), which is what makes the carrier glyph honest. File-local: it is one panel's
 *  projection of a contracts shape, not a new vocabulary. */
type MaterializedCosts = ReadonlyMap<string, AssemblySectionCost>;

/** A section's bar value. BOUND: the chat's own number, and an ABSENT section costs `0` — it rendered nothing
 *  this turn, which is a fact. UNBOUND: the author-text estimate, and a CARRIER has no estimate at all
 *  (`null` ⇒ the `~—` glyph — see the file header). */
function barTokens(section: PromptSection, costs: MaterializedCosts | null): number | null {
  if (costs !== null) {
    return costs.get(section.id)?.tokens ?? 0;
  }
  if (section.type === "marker" && !isTemplatedMarker(section.marker)) {
    return null;
  }
  return estimateSectionTokens(section);
}

function sectionName(section: PromptSection): string {
  if (section.name.trim() !== "") {
    return section.name;
  }
  return section.type === "marker" ? MARKER_COPY[section.marker].label : "Literal text";
}

/** The panel, with the binding resolved to its arm. The bound arm is its own component so the read's hook is
 *  unconditional and the unbound arm fires NO round trip at all (there is nothing to resolve against). */
export function PromptReadout({ sections, selectedSectionId, presetId, boundChatId }: PromptReadoutProps): ReactElement {
  if (boundChatId === null) {
    return <PromptReadoutBody costs={null} sections={sections} selectedSectionId={selectedSectionId} status={null} />;
  }
  return <BoundPromptReadout chatId={boundChatId} presetId={presetId} sections={sections} selectedSectionId={selectedSectionId} />;
}

/** The BOUND arm — the ONE `chat.previewAssembly` read with `presetOverride`, projected onto the rack. The
 *  read answers for the WHOLE assembly in one round trip, so selecting a different row re-projects a cached
 *  answer instead of refetching (the `previewActionTemplates` posture). */
function BoundPromptReadout({
  chatId,
  presetId,
  sections,
  selectedSectionId,
}: {
  readonly chatId: ChatId;
  readonly presetId: PresetId;
  readonly sections: readonly PromptSection[];
  readonly selectedSectionId: string | null;
}): ReactElement {
  const trpc = useTRPC();
  const preview = useQuery(trpc.chat.previewAssembly.queryOptions({ chatId, presetOverride: presetId }));
  const budget = preview.data?.budget;
  const costs = budget === undefined ? null : new Map(budget.sections.map((cost) => [cost.sectionId, cost]));
  return <PromptReadoutBody costs={costs} sections={sections} selectedSectionId={selectedSectionId} status={pendingStatus(costs, preview.isError)} />;
}

/** WHY the bound arm is still showing estimates — stated, never silent. The refusal sentence is the Actions
 *  panel's, in this panel's vocabulary: `previewAssembly` is host-gated, so a member inspecting a room they do
 *  not host gets a real, nameable "no", not a spinner that never ends. */
function pendingStatus(costs: MaterializedCosts | null, isError: boolean): string | null {
  if (costs !== null) {
    return null;
  }
  return isError ? "This chat cannot be priced — its host resolves the prompt, and you are not it." : "Pricing these rows against the bound chat…";
}

/** WHICH budget the bars are showing, said in one line under them. The three arms are the three honest
 *  readings — never one sentence that describes two of them. */
function budgetGloss(costs: MaterializedCosts | null): string {
  if (costs !== null) {
    return "A bar click selects its section. These are the REAL costs in the bound chat — carriers included; a struck row is switched off and costs nothing.";
  }
  return "A bar click selects its section. A struck row is switched off and costs nothing; carriers read ~— because their cost is the conversation's, not the preset's.";
}

function PromptReadoutBody({
  sections,
  selectedSectionId,
  costs,
  status,
}: {
  readonly sections: readonly PromptSection[];
  readonly selectedSectionId: string | null;
  readonly costs: MaterializedCosts | null;
  readonly status: string | null;
}): ReactElement {
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const previewId = useId();
  // F-13: reveal the thing that was revealed. Runs on OPEN only — the effect keys on `previewOpen`, and the
  // ref is null while closed, so closing scrolls nothing.
  useEffect(() => {
    if (previewOpen) {
      previewRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [previewOpen]);
  // The zone strip is priced by the SAME lookup the bars are (F-29: one column, one producer).
  const zones = deriveZones(sections, (section) => barTokens(section, costs) ?? 0);
  // EVERY section gets a bar, disabled included (side-eye F-26): a disabled row vanished from the budget
  // while staying in the rack, so the readout answered "what am I spending" with a list that silently
  // omitted the rows you had just turned off — exactly the rows you are deciding about. An off row renders
  // ZEROED and struck (the rack row's own `line-through` grammar): present, and visibly not spent.
  const largest = sections.reduce((max, section) => Math.max(max, section.enabled ? (barTokens(section, costs) ?? 0) : 0), 0);
  const selected = sections.find((section) => section.id === selectedSectionId);

  return (
    <Stack gap="section">
      <Section kicker="Budget">
        <Stack gap="tight">
          <Row align="center" gap="field">
            <Badge intent="info" size="sm" tone="soft">
              SETUP
            </Badge>
            <Text voice="gloss">
              {zones.summaries.setup.enabledCount} on · {formatEstimate(zones.summaries.setup.tokenEstimate)}
            </Text>
          </Row>
          <Row align="center" gap="field">
            <Badge intent="warning" size="sm" tone="soft">
              POST
            </Badge>
            <Text voice="gloss">
              {zones.summaries.post.enabledCount} on · {formatEstimate(zones.summaries.post.tokenEstimate)}
            </Text>
          </Row>
        </Stack>
        <Stack gap="tight">
          {sections.map((section, at) => (
            <BudgetBar
              accent={zones.zoneOf(at) === "post" ? "warning" : "info"}
              costs={costs}
              key={section.id}
              max={largest === 0 ? 1 : largest}
              section={section}
              selected={section.id === selectedSectionId}
            />
          ))}
        </Stack>
        <Text voice="gloss">{budgetGloss(costs)}</Text>
        {status === null ? null : <Text voice="gloss">{status}</Text>}
      </Section>

      {selected === undefined ? null : <SelectedSectionAttribution section={selected} />}
      {selected === undefined ? null : <SelectedSectionMaterialization cost={costs?.get(selected.id)} section={selected} />}

      <Section kicker="Pivot">
        {zones.missingPivot ? (
          <DatumRow label="chat history" suffix="add one on the rack" value="missing" />
        ) : (
          <DatumRow
            label="chat history"
            suffix={zones.duplicatePivotIndexes.length === 0 ? null : `${zones.duplicatePivotIndexes.length} duplicate — only the first splits`}
            value={`placed · ${String(zones.pivotIndex + 1)} of ${String(sections.length)}`}
          />
        )}
      </Section>

      <Section kicker="Preview">
        <Button
          aria-controls={previewId}
          aria-expanded={previewOpen}
          className="self-start"
          intent="secondary"
          onClick={(): void => setPreviewOpen(!previewOpen)}
          size="sm"
          type="button"
        >
          {previewOpen ? "Hide assembled preview" : "Show assembled preview"}
        </Button>
        {/* THE DISCLOSURE SCROLLS ITSELF INTO VIEW (side-eye F-13). At 1280×800 the trigger sits at y≈780,
            so opening it rendered the entire preview below the fold and the ONLY feedback was the label
            flipping to "Hide" — Nielsen #1, on the affordance whose whole job is to show you something.
            `block: "nearest"` scrolls the minimum needed (an already-visible preview does not jump). */}
        {previewOpen ? (
          <div id={previewId} ref={previewRef}>
            <AssemblyPreview onSelectBlock={selectPresetSection} preview={assemblePreview(sections)} />
          </div>
        ) : null}
      </Section>
    </Stack>
  );
}

/** One section's budget bar — the row's name, its zone-hued track, and its cost cell. A component rather
 *  than a map body so the row's five derived facts (its estimate, its off state, its accent, its selected
 *  skin, its spoken cost) each read once. */
function BudgetBar({
  section,
  accent,
  max,
  selected,
  costs,
}: {
  readonly section: PromptSection;
  readonly accent: "info" | "warning";
  readonly max: number;
  readonly selected: boolean;
  readonly costs: MaterializedCosts | null;
}): ReactElement {
  const tokens = barTokens(section, costs);
  const off = !section.enabled;
  return (
    <Button intent="ghost" onClick={(): void => selectPresetSection(section.id)} size="sm" {...(selected ? { className: "bg-primary/10" } : {})}>
      <Text className={off ? "min-w-0 flex-1 truncate text-left line-through" : "min-w-0 flex-1 truncate text-left"} voice="label">
        {sectionName(section)}
      </Text>
      {/* ZONE-HUED, never the categorical ramp's step 1 (side-eye, the mock-vs-rendered table): the ramp's
          first step is vitality GREEN, a hue this surface's language does not contain. Steel-blue setup /
          warm-amber post is the rack's own zone accent, echoed. */}
      <TrackBar accent={accent} className="min-w-0 flex-1" max={max} value={off ? 0 : (tokens ?? 0)} />
      {/* The GLYPH is decoration for the eye and the SENTENCE is the datum (side-eye F-27): `~—`
          announces as "tilde em dash", which is not a cost. */}
      <Text aria-hidden={true} className={off ? "line-through" : ""} voice="datum">
        {tokens === null ? CARRIER_COST_GLYPH : formatEstimate(tokens)}
      </Text>
      <Text as="span" className="sr-only">
        {spokenEstimate(off ? 0 : tokens)}
      </Text>
    </Button>
  );
}

/** A selected CARRIER's SOURCE ATTRIBUTION — the readout twin of the drill-in's body panel (§16 row 30:
 *  one target, one pair). Chat-free facts only; a templated section's substance is its own template, which
 *  the bar above already priced. */
function SelectedSectionAttribution({ section }: { readonly section: PromptSection }): ReactElement | null {
  if (section.type !== "marker" || isTemplatedMarker(section.marker)) {
    return null;
  }
  return (
    <Section kicker="Selected — source">
      <Text voice="label">{sectionName(section)}</Text>
      <Text voice="gloss">{CARRIER_ATTRIBUTION[section.marker].sentence}</Text>
    </Section>
  );
}

/** One materialized row, ready to render: its DISPLAY ordinal (ST's `chatHistory-1` — with twenty `assistant`
 *  turns the position is the only thing that tells two of them apart) and its React key. */
interface KeyedSectionRow {
  readonly key: string;
  readonly ordinal: number;
  readonly label: string;
  readonly tokens: number;
}

/** Key an APPEND-ONLY display list suppression-free: content + OCCURRENCE ORDINAL, stable because a
 *  materialization never reorders or mutates (the sanctioned `noArrayIndexKey` pattern — an index laundered
 *  into a key is not a fix). The DISPLAY ordinal is a separate datum: it is the row's position in the
 *  materialization, which is what the reader is looking at. */
function keyRows(rows: readonly AssemblySectionRow[]): readonly KeyedSectionRow[] {
  const seen = new Map<string, number>();
  const out: KeyedSectionRow[] = [];
  for (const row of rows) {
    const occurrence = (seen.get(row.label) ?? 0) + 1;
    seen.set(row.label, occurrence);
    out.push({ key: `${row.label}#${String(occurrence)}`, ordinal: out.length + 1, label: row.label, tokens: row.tokens });
  }
  return out;
}

/** THE MATERIALIZED ROWS (D121-G) — ST's inspect panel, with honest data: what the selected section ACTUALLY
 *  expanded into in the bound chat, and what each of those rows costs. The conversation splits per turn, a
 *  merged card section splits per roster member, and everything else is its own single row.
 *
 *  Renders only when a chat is bound AND that section contributed something — the unbound arm has no rows to
 *  show (that is exactly what `~—` says), and a bound section absent from the costs contributed nothing, which
 *  the bar already reports as `~0`. Rows are ORDINALLED (ST's `chatHistory-1`): with twenty `assistant` rows
 *  the position is the only thing that tells two of them apart. */
function SelectedSectionMaterialization({
  section,
  cost,
}: {
  readonly section: PromptSection;
  readonly cost: AssemblySectionCost | undefined;
}): ReactElement | null {
  if (cost === undefined || cost.rows.length === 0) {
    return null;
  }
  return (
    <Section kicker="Selected — materialized">
      <Text voice="label">{sectionName(section)}</Text>
      <Stack gap="tight">
        {keyRows(cost.rows).map((row) => (
          <DatumRow key={row.key} label={`${String(row.ordinal)}. ${row.label}`} value={formatEstimate(row.tokens)} />
        ))}
      </Stack>
      <Text voice="gloss">
        {cost.rows.length} row{cost.rows.length === 1 ? "" : "s"} in the bound chat · {formatEstimate(cost.tokens)} total
      </Text>
    </Section>
  );
}
