// The ACTIONS view (preset-surface-redesign.md §3/§6) — the guided templates + the nudges + the format
// slots, as ONE instrument list. They are not prompt STRUCTURE; they are per-action steering prose, and
// burying them two disclosures deep inside the Prompt tab is why the owner experienced "templates and
// fields" as absent (F6). Mock: `mocks/preset-redesign/actions-and-sections.html`.
//
// EVERY CELL IS REGISTRY-DERIVED (§6.6): groups, row copy, kind badges and the drill-in's fields all come
// from `TEMPLATE_DEFS` in `@orb/contracts/preset`. The client's old `GUIDED_ACTION_COPY` map is gone; a new
// template is one enum member + one def row, and nothing in this file enumerates templates.
//
// THIS LIST IS A FIXED PRODUCT ENUM, NOT A MANAGEABLE COLLECTION (§5.0, and §16 row 31 pins the ABSENCE):
// no toggles, no drag handles, no Add. An action always resolves SOME template — empty means the default
// rides, and the fixed enum cannot be "off", so turning Impersonate's template off would leave a button
// firing nothing. The manageable list is the RACK, in the Prompt view. A manage affordance appearing here
// is the §5.0 conflation rebuilt as a defect.
//
// FIRES-ON IS DESCRIPTIVE (owner, verbatim: "the triggers and fires-on for a template is just
// informational — we wouldn't want to disable something we shouldn't; the actual trigger thingy is in
// prompts"). The editable trigger vocabulary exists EXCLUSIVELY in the section drill-in.
//
// The row grammar is the rack's, spoken identically (§5.0 one-list-grammar): the row body SELECTS and the
// trailing chevron DRILLS. The two acts were conflated here while the readout had no echo half to select
// toward; D8's resolved preview (§7.1) IS that half, so §6.1's rule lands as written — "NAME click = SELECT
// (the Actions readout echoes the selected template — resolved preview + delivery path, §7); CHEVRON/Enter =
// DRILL". Selection writes through the ONE `selectPresetTemplate` store action; nothing here reads it back
// (the readout is the reader), which is the same one-writer posture the rack's section selection takes.

import type { PromptConfig } from "@orb/contracts/preset";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { ChevronRight, ExternalLink, Icon } from "@orb/ui/icons";
import { Row, Section, Stack, Surface } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import type { AppFormInstance } from "#forms";
import { selectPresetTemplate, useSelectedPresetTemplateId } from "#state";
import { GUIDED_INPUT_TOKEN } from "../lib/assembly-model";
import type { TemplateRow } from "../lib/template-rows";
import { isCustomized, TEMPLATE_KIND_LABEL, templateGroups, templatePreview, templateRowById } from "../lib/template-rows";
import { TemplateDrillIn } from "./template-drill-in";

type PresetForm = AppFormInstance<PromptConfig>;

/** The three cross-link states for the `guided_instruction` marker's health. */
const MARKER_HEALTHS = ["healthy", "off", "absent"] as const;
type MarkerHealth = (typeof MARKER_HEALTHS)[number];

const MARKER_HEALTH_LABEL: Record<MarkerHealth, string> = {
  healthy: "Delivers via Guided instruction",
  off: "Guided instruction is off",
  absent: "No Guided instruction marker",
};

function markerHealth(sections: PromptConfig["sections"]): MarkerHealth {
  const marker = sections.find((s) => s.type === "marker" && s.marker === "guided_instruction");
  if (marker === undefined) {
    return "absent";
  }
  return marker.enabled ? "healthy" : "off";
}

export interface ActionsViewProps {
  readonly form: PresetForm;
  /** Reveal + select a rack section — the `guided_instruction` cross-link's target (§16 row 19: one
   *  selection writer, the same one the rack uses). */
  readonly onSelectSection: (sectionId: string) => void;
}

export function ActionsView({ form, onSelectSection }: ActionsViewProps): ReactElement {
  // WHICH body the view paints — local, exactly like the Prompt view's drill (one region, one writer).
  const [drilledId, setDrilledId] = useState<string | null>(null);
  // READ-ONLY here: the row highlight mirrors the same selection the READOUT projects, so the two panes can
  // never disagree about which template is being inspected.
  const selectedId = useSelectedPresetTemplateId();
  const drilled = drilledId === null ? undefined : templateRowById(drilledId);
  if (drilled !== undefined) {
    return <TemplateDrillIn form={form} onBack={(): void => setDrilledId(null)} row={drilled} />;
  }
  return (
    <Surface tier="instrument">
      <Stack gap="section">
        <Row align="start" gap="row" justify="between">
          <Text voice="gloss">When you steer a generation, the matching template wraps your text — {GUIDED_INPUT_TOKEN} is where your steer lands.</Text>
          <form.Subscribe selector={(state): MarkerHealth => markerHealth(state.values.sections)}>
            {(health): ReactElement => <MarkerCrossLink form={form} health={health} onSelectSection={onSelectSection} />}
          </form.Subscribe>
        </Row>

        {/* HUMAN group labels (side-eye F-30 / ARIA rec 10): the kicker rendered the registry's raw enum
            member (`steer`, `voice`, `studio`), which is a code identifier standing in for a heading. */}
        {templateGroups().map((group) => (
          <Section key={group.kind} kicker={TEMPLATE_KIND_LABEL[group.kind]}>
            <Stack gap="tight">
              {group.rows.map((row) => (
                <TemplateListRow form={form} key={row.def.id} onDrill={setDrilledId} row={row} selected={row.def.id === selectedId} />
              ))}
            </Stack>
          </Section>
        ))}
      </Stack>
    </Surface>
  );
}

/** One template row: label · fires gloss · KIND chip · Default/Customized state · mono preview · chevron —
 *  the mock's own column order. The kind chip's INFO hue is deliberately a different family from the state
 *  chips (neutral/success) so the two vocabularies can never blur.
 *
 *  THE ROW'S LAYOUT CONTRACT (side-eye F-01, the P0): the NAME is the identifier and may never be squeezed
 *  out — it takes the `inline` subtitle arm's `min-w-24` floor, and the FIRES gloss is what shortens. */
function TemplateListRow({
  form,
  row,
  onDrill,
  selected,
}: {
  readonly form: PresetForm;
  readonly row: TemplateRow;
  readonly onDrill: (id: string) => void;
  /** This row is the SELECTED template — the readout echoes it (ListRow paints the ember bar + tint). */
  readonly selected: boolean;
}): ReactElement {
  const { def, guidedKind, factoryDefault } = row;
  return (
    <form.Subscribe
      selector={(state): string | undefined =>
        guidedKind === undefined ? state.values.formatStrings?.[def.id as "continueNudge"] : state.values.guidedActions?.[guidedKind].prompt
      }
    >
      {(value): ReactElement => {
        const customized = isCustomized(value, factoryDefault);
        return (
          <ListRow
            actions={
              <Row align="center" gap="field">
                {/* THE KIND CHIP IS OUTLINED NEUTRAL (crunch items 7 + 14): a `format` chip rendering
                    FILLED BLUE beside outlined steer/voice/studio/nudge chips was one vocabulary drawn two
                    ways, and the blue itself is a family the mocks never paint. The kind is a CLASSIFIER —
                    the quietest thing on the row — so it joins the outlined neutral family and the STATE
                    chip beside it keeps the only colour (success = you changed this one), which is the
                    distinction a reader actually scans for. */}
                <Badge intent="neutral" size="sm" tone="ghost">
                  {def.kind}
                </Badge>
                <Badge intent={customized ? "success" : "neutral"} size="sm" tone="soft">
                  {customized ? "Customized" : "Default"}
                </Badge>
                {/* The mono PREVIEW is a trailing cell in the mock's grid (`150px`, right-aligned,
                    truncating) — not the row's second line. Moving it here is what frees the title line
                    for name + fires, and `aria-hidden` keeps a 600-character template body out of the
                    row's spoken description (side-eye F-20). */}
                <Text aria-hidden={true} as="span" className="hidden max-w-(--width-label-col) truncate @sm/list-row:block" voice="gloss">
                  {templatePreview(value, factoryDefault)}
                </Text>
                <Button aria-label={`Edit ${def.label}`} intent="ghost" onClick={(): void => onDrill(def.id)} size="icon" type="button">
                  <Icon icon={ChevronRight} size="sm" />
                </Button>
              </Row>
            }
            clickable={true}
            // SELECT ≠ DRILL (§16 row 23, the rack's own grammar): the body click SELECTS, so the readout's
            // resolved preview echoes THIS template; the chevron above is the way into the editor.
            onClick={(): void => selectPresetTemplate(def.id)}
            selected={selected}
            // THE P0 (side-eye F-01): the fires gloss is the row's SUBTITLE on the title line, so the
            // NAME keeps the `inline` arm's width floor and the GLOSS is what truncates. It rode `meta`
            // — a `shrink-0` slot — which starved three rows' names to 0px and clipped a fourth.
            subtitle={def.fires}
            subtitlePlacement="inline"
            title={def.label}
          />
        );
      }}
    </form.Subscribe>
  );
}

/** The cross-link to the `guided_instruction` marker — clicking selects its rack row (§16 row 19). Without
 *  that marker every template below resolves and is then dropped, which is exactly the fact this chip
 *  exists to make visible. */
function MarkerCrossLink({
  health,
  form,
  onSelectSection,
}: {
  readonly health: MarkerHealth;
  readonly form: PresetForm;
  readonly onSelectSection: (sectionId: string) => void;
}): ReactElement {
  const onClick = (): void => {
    const marker = form.state.values.sections.find((s) => s.type === "marker" && s.marker === "guided_instruction");
    if (marker !== undefined) {
      onSelectSection(marker.id);
    }
  };
  // The ↗ lives INSIDE the pill (side-eye F-34): the mock draws one chip, and a glyph parked outside the
  // badge reads as a second, unlabelled control sitting next to it. `size="inline"` keeps the button a
  // text-height wrapper so the pill IS the visible box, rather than a pill floating in a control box.
  return (
    <Button
      className="self-start"
      disabled={health === "absent"}
      intent="ghost"
      onClick={onClick}
      size="inline"
      title={health === "absent" ? MARKER_HEALTH_LABEL.absent : undefined}
      type="button"
    >
      <Badge intent={health === "healthy" ? "info" : "warning"} size="sm" tone="soft">
        {MARKER_HEALTH_LABEL[health]}
        <Icon icon={ExternalLink} size="xs" />
      </Badge>
    </Button>
  );
}
