// The per-type inspector CONTROLS (BUILD-SPEC §3.5) — the placement, triggers, and override-lock
// clusters, split out of `preset-section-inspector` to keep both under the 450-line cap. All bind the
// live bridge form at `sections[i].*`. Placement / triggers toggles map to setting/unsetting an OPTIONAL
// field via `form.setFieldValue` (unset = the schema default): placement In-flow (inject undefined) /
// Spliced (inject object). The section BODY moved to the CENTER `SectionBodyEditor` (the CONTENT drill-in).

import type { PromptConfig, PromptSection } from "@orb/contracts/preset";
import { MAX_INJECTION_DEPTH } from "@orb/kit/injection";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import type { ReactElement } from "react";
import type { AppFormInstance } from "#forms";
import { GENERATION_TYPE_ITEMS, OVERRIDABLE_MARKERS } from "../../lib/assembly-model";

type AssemblyForm = AppFormInstance<PromptConfig>;

/** Seed values for a fresh splice (BUILD-SPEC §3.5): depth 4, order 100 (the assembler default). */
const SEED_DEPTH = 4;
const SEED_ORDER = 100;

interface ControlProps {
  readonly form: AssemblyForm;
  readonly section: PromptSection;
  readonly index: number;
}

// ── PLACEMENT (literal + templated only) ──────────────────────────────────────────────────────────────

/** In-flow / Spliced → `inject` unset / set. Spliced reveals depth + order NumberFields + POSITIONAL
 *  order copy (no priority/wins language — ST-parity post-P1). */
export function SectionPlacementControl({ form, section, index }: ControlProps): ReactElement {
  const inject = "inject" in section ? section.inject : undefined;
  const spliced = inject !== undefined;
  const name = `sections[${index}].inject` as const;

  const setPlacement = (next: string): void => {
    if (next === "spliced") {
      form.setFieldValue(name, { depth: SEED_DEPTH, order: SEED_ORDER });
    } else {
      form.setFieldValue(name, undefined);
    }
  };

  return (
    <Section heading="Placement">
      <ToggleGroup
        aria-label="Placement"
        value={[spliced ? "spliced" : "inflow"]}
        onValueChange={(picked): void => setPlacement(picked[0] ?? "inflow")}
      >
        <Toggle value="inflow" aria-label="In flow">
          In flow
        </Toggle>
        <Toggle value="spliced" aria-label="Spliced into chat">
          Spliced into chat
        </Toggle>
      </ToggleGroup>
      {spliced ? (
        <Stack gap="field">
          <form.AppField name={`sections[${index}].inject.depth`}>
            {(field): ReactElement => (
              <field.NumberField
                label="Depth"
                description="0 = the tail; N = N turns back from your latest message."
                min={0}
                max={MAX_INJECTION_DEPTH}
              />
            )}
          </form.AppField>
          <form.AppField name={`sections[${index}].inject.order`}>
            {(field): ReactElement => (
              <field.NumberField
                label="Order"
                description="Within a depth: lower sits higher; higher lands closer to your latest message."
              />
            )}
          </form.AppField>
        </Stack>
      ) : null}
    </Section>
  );
}

// ── TRIGGERS ──────────────────────────────────────────────────────────────────────────────────────────

/** Every-generation Switch → `trigger` unset; OFF reveals the six GENERATION_TYPES multi-toggle. */
export function SectionTriggersControl({ form, section, index }: ControlProps): ReactElement {
  const trigger = "trigger" in section ? section.trigger : undefined;
  const everyGeneration = trigger === undefined || trigger.length === 0;
  const name = `sections[${index}].trigger` as const;

  return (
    <Section heading="Triggers">
      <Text size="micro" tone="muted">
        Filter to specific generation types.
      </Text>
      <Row gap="row" align="center" justify="between">
        <Text size="body">Every generation</Text>
        <Switch
          aria-label="Fires on every generation"
          checked={everyGeneration}
          onCheckedChange={(on): void => {
            form.setFieldValue(name, on ? undefined : ["normal"]);
          }}
        />
      </Row>
      {everyGeneration ? null : (
        <form.AppField name={name}>
          {(field): ReactElement => (
            <field.MultiToggleField label="Only on" items={GENERATION_TYPE_ITEMS} />
          )}
        </form.AppField>
      )}
    </Section>
  );
}

// ── OVERRIDE LOCKS ────────────────────────────────────────────────────────────────────────────────────

/** The card/room override locks — ALWAYS for main_prompt/post_history; for other templated markers only
 *  when a flag is already set. */
export function SectionLocksControl({ form, section, index }: ControlProps): ReactElement | null {
  // `"forbidCharacterOverride" in section` narrows the union to the templated-marker branch (the only
  // one carrying the two forbid flags) — a marker-VALUE guard would not narrow the object type.
  if (!("forbidCharacterOverride" in section)) {
    return null;
  }
  const always = OVERRIDABLE_MARKERS.includes(section.marker);
  const anySet = section.forbidCharacterOverride === true || section.forbidRoomOverride === true;
  if (!(always || anySet)) {
    return null;
  }
  return (
    <Section heading="Override locks">
      <Text size="micro" tone="muted">
        Only affects the main / post-history framing.
      </Text>
      <form.AppField name={`sections[${index}].forbidCharacterOverride`}>
        {(field): ReactElement => (
          <field.SwitchField
            label="Block character-card override"
            description="Always use yours, ignoring the character card's replacement."
          />
        )}
      </form.AppField>
      <form.AppField name={`sections[${index}].forbidRoomOverride`}>
        {(field): ReactElement => (
          <field.SwitchField
            label="Block room override"
            description="Independent of the card lock."
          />
        )}
      </form.AppField>
    </Section>
  );
}
