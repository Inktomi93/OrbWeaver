// The PROMPT view's CONTEXT readout (preset-surface-redesign.md §7): the zone BUDGET, per-section token
// BARS with the selected section highlighted, the PIVOT health, and the assembled PREVIEW on demand.
//
// Each element names the decision it informs: what to trim or disable when the system block bloats (the
// bars) · where a section actually lands (the preview) · the structural fix when the pivot is missing or
// duplicated (health). The bar click is a sanctioned SELECTION echo (§16 row 19) — it writes through the
// ONE `selectPresetSection` store action, exactly as the rack row does.
//
// MATERIALIZATION HONESTY (§7, the owner ST-screenshot ruling): a CARRIER's bar reads `~—`, never `~0`.
// Its real cost is the conversation or the active world-info set — chat-side facts this editor cannot
// know, and a zero with a bar under it is a lie with a number on it. The ruled §7.1 last-open-chat
// binding is what makes those rows REAL; until it lands, this is the honest unbound floor.
//
// SAVED TRUTH ONLY (§7 mechanics): the panel projects the `preset.get` row, never a live form bridge.
// Autosave means saved lags a typed edit by one debounce, and the `AutosaveStatus` chip already narrates
// settle — "settle-live" is stated, not faked keystroke-live.

import type { PromptSection } from "@orb/contracts/preset";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Row, Section, Stack } from "@orb/ui/layout";
import { TrackBar } from "@orb/ui/meter";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useEffect, useId, useRef, useState } from "react";
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
}

/** A carrier contributes no author text, so it has no estimate — `null` is the honest reading. */
function barTokens(section: PromptSection): number | null {
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

export function PromptReadout({ sections, selectedSectionId }: PromptReadoutProps): ReactElement {
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
  const zones = deriveZones(sections);
  // EVERY section gets a bar, disabled included (side-eye F-26): a disabled row vanished from the budget
  // while staying in the rack, so the readout answered "what am I spending" with a list that silently
  // omitted the rows you had just turned off — exactly the rows you are deciding about. An off row renders
  // ZEROED and struck (the rack row's own `line-through` grammar): present, and visibly not spent.
  const largest = sections.reduce((max, section) => Math.max(max, section.enabled ? (barTokens(section) ?? 0) : 0), 0);
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
              key={section.id}
              max={largest === 0 ? 1 : largest}
              section={section}
              selected={section.id === selectedSectionId}
            />
          ))}
        </Stack>
        <Text voice="gloss">
          A bar click selects its section. A struck row is switched off and costs nothing; carriers read ~— because their cost is the conversation's, not the
          preset's.
        </Text>
      </Section>

      {selected === undefined ? null : <SelectedSectionAttribution section={selected} />}

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
}: {
  readonly section: PromptSection;
  readonly accent: "info" | "warning";
  readonly max: number;
  readonly selected: boolean;
}): ReactElement {
  const tokens = barTokens(section);
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
