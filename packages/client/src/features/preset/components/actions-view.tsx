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
// The row grammar is the rack's, spoken identically (§5.0 one-list-grammar): the row body and the chevron
// both open the template's ONE editing home — a template has no readout-echo half to select toward yet, so
// (unlike a rack row) the two acts have not diverged here.

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
import { GUIDED_INPUT_TOKEN } from "../lib/assembly-model";
import type { TemplateRow } from "../lib/template-rows";
import { isCustomized, templateGroups, templatePreview, templateRowById } from "../lib/template-rows";
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

        {templateGroups().map((group) => (
          <Section key={group.kind} kicker={group.kind}>
            <Stack gap="tight">
              {group.rows.map((row) => (
                <TemplateListRow form={form} key={row.def.id} onDrill={setDrilledId} row={row} />
              ))}
            </Stack>
          </Section>
        ))}
      </Stack>
    </Surface>
  );
}

/** One template row: label · fires gloss · KIND chip · Default/Customized state · mono preview · chevron.
 *  The kind chip's INFO hue is deliberately a different family from the state chips (neutral/success) so
 *  the two vocabularies can never blur. */
function TemplateListRow({
  form,
  row,
  onDrill,
}: {
  readonly form: PresetForm;
  readonly row: TemplateRow;
  readonly onDrill: (id: string) => void;
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
                <Badge intent="info" size="sm">
                  {def.kind}
                </Badge>
                <Badge intent={customized ? "success" : "neutral"} size="sm">
                  {customized ? "Customized" : "Default"}
                </Badge>
                <Button aria-label={`Edit ${def.label}`} intent="ghost" onClick={(): void => onDrill(def.id)} size="icon" type="button">
                  <Icon icon={ChevronRight} size="sm" />
                </Button>
              </Row>
            }
            clickable={true}
            meta={def.fires}
            onClick={(): void => onDrill(def.id)}
            subtitle={templatePreview(value, factoryDefault)}
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
  return (
    <Button disabled={health === "absent"} intent="ghost" onClick={onClick} size="sm">
      <Badge intent={health === "healthy" ? "info" : "warning"} size="sm">
        {MARKER_HEALTH_LABEL[health]}
      </Badge>
      <Icon icon={ExternalLink} size="sm" />
    </Button>
  );
}
