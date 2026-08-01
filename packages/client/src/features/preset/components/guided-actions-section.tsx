// Guided actions — a collapsed Section in the Prompt tab. When you steer a generation, the matching
// template wraps your text — `{{input}}` is where the steer lands. Header: framing copy + a cross-link
// chip to the `guided_instruction` marker (healthy/off/absent), clicking selects the marker row. A grid
// of all six cards (`GUIDED_ACTION_KINDS`) — role Select · template MacroField (ghosting the default) ·
// Default/Customized state · a missing-`{{input}}` lint.

import type { GuidedActionKind, PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_GUIDED_ACTIONS, GUIDED_ACTION_KINDS, GUIDED_IMPERSONATE_PERSONS } from "@orb/contracts/preset";
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

/** Human titles + one-line "fires on" copy per guided-action kind (registry-as-data over the tuple). */
const GUIDED_ACTION_COPY: Record<GuidedActionKind, { readonly title: string; readonly fires: string }> = {
  response: { title: "Response", fires: "You steer your next reply from the composer" },
  swipe: { title: "Swipe", fires: "You steer a re-roll of the last reply" },
  impersonate: { title: "Impersonate", fires: "The model writes as you for one turn" },
  rewrite: { title: "Rewrite", fires: "You rewrite the last reply out of character" },
  opening: { title: "Opening", fires: "A new chat's first message" },
  continue: { title: "Continue", fires: "You steer a continuation of the last reply" },
  // Greeting studio (audit §3) — authoring-time card templates the studio verbs resolve; `{{base}}` (the
  // existing greeting) is available in the rewrite template.
  // biome-ignore-start lint/style/useNamingConvention: the map key IS the GuidedActionKind string (snake_case vocabulary, audit §3)
  greeting_rewrite: { title: "Greeting rewrite", fires: "You rewrite an existing greeting in the character studio" },
  greeting_new: { title: "New greeting", fires: "You generate a fresh greeting in the character studio" },
  // biome-ignore-end lint/style/useNamingConvention: the map key IS the GuidedActionKind string (snake_case vocabulary, audit §3)
};

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
  const copy = GUIDED_ACTION_COPY[kind];
  const factoryDefault = DEFAULT_GUIDED_ACTIONS[kind].prompt;

  return (
    <Stack gap="field" padding="field" className="rounded-card border border-border bg-card">
      <Row gap="field" align="center" justify="between">
        <Text size="body" weight="medium">
          {copy.title}
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
        {copy.fires}
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
