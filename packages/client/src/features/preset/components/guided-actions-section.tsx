// Guided actions — a collapsed Section in the Prompt tab. When you steer a generation, the matching
// template wraps your text — `{{input}}` is where the steer lands. Header: framing copy + a cross-link
// chip to the `guided_instruction` marker (healthy/off/absent), clicking selects the marker row. A grid
// of all six cards (`GUIDED_ACTION_KINDS`) — role Select · template MacroField (ghosting the default) ·
// Default/Customized state · a missing-`{{input}}` lint.

import type { GuidedActionKind, PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_GUIDED_ACTIONS, GUIDED_ACTION_KINDS, GUIDED_IMPERSONATE_PERSONS, TEMPLATE_DEF_BY_ID } from "@orb/contracts/preset";
import type { MessageRole } from "@orb/kit/message-role";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { ExternalLink, Icon } from "@orb/ui/icons";
import { Grid, Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { AppFormInstance } from "#forms";
import { MESSAGE_ROLE_ITEMS, PROMPT_MACRO_SUGGESTIONS } from "#lib";
import { GUIDED_INPUT_TOKEN, guidedFooterState } from "../lib/assembly-model";

type AssemblyForm = AppFormInstance<PromptConfig>;

/** The `impersonate`-only macro whose value is the perspective word (`GUIDED_IMPERSONATE_PERSONS`). */
const PERSON_TOKEN = "{{person}}";

/** The three cross-link states for the `guided_instruction` marker's health + their chip copy. */
const MARKER_HEALTHS = ["healthy", "off", "absent"] as const;
type MarkerHealth = (typeof MARKER_HEALTHS)[number];

const MARKER_HEALTH_LABEL: Record<MarkerHealth, string> = {
  healthy: "Delivers via Guided instruction",
  off: "Guided instruction is off",
  absent: "No Guided instruction marker",
};

function markerHealth(sections: readonly PromptConfig["sections"][number][]): MarkerHealth {
  const marker = sections.find((s) => s.type === "marker" && s.marker === "guided_instruction");
  if (marker === undefined) {
    return "absent";
  }
  return marker.enabled ? "healthy" : "off";
}

export function GuidedActionsSection({
  form,
  onSelectSection,
}: {
  readonly form: AssemblyForm;
  /** Reveal + select a rack section (the cross-link chip → the `guided_instruction` marker row). */
  readonly onSelectSection: (sectionId: string) => void;
}): ReactElement {
  return (
    <Stack gap="block">
      <Row gap="row" align="start" justify="between">
        <Text size="micro" tone="muted">
          When you steer a generation, the matching template wraps your text — <code>{GUIDED_INPUT_TOKEN}</code> is where your steer lands.
        </Text>
        <form.Subscribe selector={(state): MarkerHealth => markerHealth(state.values.sections)}>
          {(health): ReactElement => <MarkerCrossLink health={health} form={form} onSelectSection={onSelectSection} />}
        </form.Subscribe>
      </Row>

      <Grid cols="auto" gap="field">
        {GUIDED_ACTION_KINDS.map((kind) => (
          <GuidedActionCard key={kind} form={form} kind={kind} />
        ))}
      </Grid>
    </Stack>
  );
}

/** The cross-link chip to the `guided_instruction` marker — clicking selects its rack row. */
function MarkerCrossLink({
  health,
  form,
  onSelectSection,
}: {
  readonly health: MarkerHealth;
  readonly form: AssemblyForm;
  readonly onSelectSection: (sectionId: string) => void;
}): ReactElement {
  const onClick = (): void => {
    const marker = form.state.values.sections.find((s) => s.type === "marker" && s.marker === "guided_instruction");
    if (marker !== undefined) {
      onSelectSection(marker.id);
    }
  };
  const label = MARKER_HEALTH_LABEL[health];
  const intent = health === "healthy" ? "info" : "warning";

  return (
    <Button intent="ghost" size="sm" onClick={onClick} disabled={health === "absent"}>
      <Badge intent={intent} size="sm">
        {label}
      </Badge>
      <Icon icon={ExternalLink} size="sm" />
    </Button>
  );
}

/** One guided-action card — role Select + template MacroField, ghosting the default, with lint + state. */
function GuidedActionCard({ form, kind }: { readonly form: AssemblyForm; readonly kind: GuidedActionKind }): ReactElement {
  // G11: the row's label + fires-on gloss come from the TEMPLATE DEFINITION REGISTRY (`@orb/contracts/preset`)
  // — the client's own copy map is retired, so a new template is one registry row and nothing here changes.
  const def = TEMPLATE_DEF_BY_ID[kind];
  const factoryDefault = DEFAULT_GUIDED_ACTIONS[kind].prompt;

  return (
    <Stack gap="field" padding="field" className="rounded-card border border-border bg-card">
      <Row gap="field" align="center" justify="between">
        <Text size="body" weight="medium">
          {def.label}
        </Text>
        {kind === "impersonate" ? (
          <Row gap="field" align="center">
            <Badge intent="info" size="sm">
              {PERSON_TOKEN}
            </Badge>
            <Text size="micro" tone="muted">
              {GUIDED_IMPERSONATE_PERSONS.join(" · ")}
            </Text>
          </Row>
        ) : null}
      </Row>
      <Text size="micro" tone="muted">
        {def.fires}
      </Text>

      <form.AppField name={`guidedActions.${kind}.role`}>
        {(field): ReactElement => <field.SelectField label="Delivered as" items={MESSAGE_ROLE_ITEMS} />}
      </form.AppField>

      <form.AppField name={`guidedActions.${kind}.prompt`}>
        {(field): ReactElement => <field.MacroField label="Template" suggestions={PROMPT_MACRO_SUGGESTIONS} placeholder={factoryDefault} rows={3} />}
      </form.AppField>

      <form.Subscribe
        selector={(state): { prompt: string; role: MessageRole } => ({
          prompt: state.values.guidedActions?.[kind].prompt ?? factoryDefault,
          role: state.values.guidedActions?.[kind].role ?? "system",
        })}
      >
        {({ prompt, role }): ReactElement => <CardFooter prompt={prompt} role={role} factoryDefault={factoryDefault} />}
      </form.Subscribe>
    </Stack>
  );
}

/** The card footer — Default/Customized state, the missing-`{{input}}` lint, + the assistant-prefill note. */
function CardFooter({ prompt, role, factoryDefault }: { readonly prompt: string; readonly role: MessageRole; readonly factoryDefault: string }): ReactElement {
  const { isEmpty, isDefault, missingInputLint } = guidedFooterState(prompt, factoryDefault);
  return (
    <Stack gap="field">
      <Text size="micro" tone="muted">
        {isDefault ? "Default" : "Customized"}
      </Text>
      {isEmpty ? (
        <Text size="micro" tone="muted">
          Empty — your steering text lands on its own, unwrapped.
        </Text>
      ) : null}
      {missingInputLint ? (
        <Text size="micro" tone="warning">
          No {GUIDED_INPUT_TOKEN} — your steering text won't land anywhere.
        </Text>
      ) : null}
      {role === "assistant" ? (
        <Text size="micro" tone="muted">
          Assistant delivery is normalized on wires without prefill support.
        </Text>
      ) : null}
    </Stack>
  );
}
