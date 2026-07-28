// The GM console's SCALAR autosave form (extracted from rpg-game-tab.tsx for the component-size cap):
// Play style (CYOA switch + the compose|send segmented choice-click knob + plot steering) → Hidden
// channels → Steering note → Delivery model (the mock's SEGMENTED reliable|cheap toggle with its honest
// consequence line — never a resting dropdown, DESIGN §12.4.1). Everything autosaves (D66 A4). The
// section ORDER inside this form is the tail of the mock's console order (game.html) — the array/record
// sub-editors render before it in rpg-game-tab.tsx.

import type { RpgConfigView, RpgDateMode, RpgExtractionMode } from "@orb/contracts/rpg";
import { RPG_STEERING_NOTE_MAX } from "@orb/contracts/rpg";
import type { ChatId } from "@orb/kit/ids";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import type { ReactElement } from "react";
import { useInvalidation, useTRPC } from "#data";
import { createAutosaveEntityForm } from "#forms";
import { useUpdateConfig } from "../hooks/use-rpg-mutations";
import type { GmConsoleFormValues } from "../lib/gm-console-form-model";
import { EMPTY_GM_CONSOLE_FORM, fromGmConsoleForm, toGmConsoleForm } from "../lib/gm-console-form-model";
import { Kicker } from "./rpg-kicker";

/** The honest one-line consequence per delivery mode (the mock's fact — the same freshness posture the
 *  band cue renders), keyed over the closed mode axis. */
const EXTRACTION_CONSEQUENCE: Readonly<Record<RpgExtractionMode, string>> = {
  reliable: "state extracts after the turn — trackers lag one beat",
  cheap: "state rides the turn — trackers update live, best-effort",
};

/** The CYOA choice-click consequence per behavior (the P5 knob the Scene echo + transcript obey). */
const CHOICE_BEHAVIOR_CONSEQUENCE: Readonly<Record<RpgConfigView["cyoaChoiceBehavior"], string>> = {
  compose: "a pick drops into the composer — edit before sending",
  send: "a pick sends immediately as your turn",
};

/** The #9 date-mode consequence lines (the choice-behavior segmented-toggle precedent). */
const DATE_MODE_CONSEQUENCE: Readonly<Record<RpgDateMode, string>> = {
  narrated: "The story narrates the date as free text — no day counter.",
  structured: "A running day counter shows beside the time of day.",
};

// The autosave scalar form (§13.4). Module scope (stable identity); keys its Session by `entityId` (the
// chatId) so a chat switch with the Game tab open is a full remount seeded from the new game's config.
const GmConsoleFormBoundary = createAutosaveEntityForm<GmConsoleFormValues>({
  defaultValues: EMPTY_GM_CONSOLE_FORM,
});

/** The scalar autosave form — play style · hidden channels · steering note · delivery model. */
export function GmConsoleScalars({ chatId, config }: { readonly chatId: ChatId; readonly config: RpgConfigView }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const updateConfig = useUpdateConfig({ trpc, invalidation });
  const save = (values: GmConsoleFormValues): Promise<unknown> => {
    const { patch, extractionMode } = fromGmConsoleForm(values);
    return updateConfig.mutateAsync({ chatId, patch, extractionMode });
  };
  return (
    <GmConsoleFormBoundary entityId={`rpg-game:${chatId}`} serverValues={toGmConsoleForm(config)} save={save}>
      {({ form }): ReactElement => (
        <Stack gap="section">
          <Stack gap="field">
            <Kicker>Play style</Kicker>
            <form.AppField name="cyoa">
              {(field): ReactElement => (
                <field.SwitchField label="CYOA choices" hint="Every reply ends with a clickable set of choices — pick one to play it as your turn." />
              )}
            </form.AppField>
            {/* The compose|send choice-click knob (P5) — a SEGMENTED toggle with its consequence line,
                APPLICABILITY-shown only while CYOA is on (never a disabled twin). */}
            <form.AppField name="cyoa">
              {(cyoaField): ReactElement | null =>
                cyoaField.state.value ? (
                  <form.AppField name="cyoaChoiceBehavior">
                    {(field): ReactElement => (
                      <Row gap="block" align="center">
                        <ToggleGroup
                          aria-label="Choice click behavior"
                          value={[field.state.value]}
                          onValueChange={(next): void => {
                            const picked = next[0];
                            if (picked === "compose" || picked === "send") {
                              field.handleChange(picked);
                            }
                          }}
                        >
                          <Toggle value="compose">compose</Toggle>
                          <Toggle value="send">send</Toggle>
                        </ToggleGroup>
                        <Text size="micro" tone="muted" className="min-w-0 flex-1">
                          {CHOICE_BEHAVIOR_CONSEQUENCE[field.state.value]}
                        </Text>
                      </Row>
                    )}
                  </form.AppField>
                ) : null
              }
            </form.AppField>
            {/* The #9 ambient-date mode — a SEGMENTED toggle (narrated default: the model narrates the
                date as a freeform string, no day counter; structured keeps the integer day). Time-of-day
                + weather stay structured in both (the Waystone visual never turns off). */}
            <form.AppField name="dateMode">
              {(field): ReactElement => (
                <Row gap="block" align="center">
                  <ToggleGroup
                    aria-label="Ambient date mode"
                    value={[field.state.value]}
                    onValueChange={(next): void => {
                      const picked = next[0];
                      if (picked === "narrated" || picked === "structured") {
                        field.handleChange(picked);
                      }
                    }}
                  >
                    <Toggle value="narrated">narrated</Toggle>
                    <Toggle value="structured">structured</Toggle>
                  </ToggleGroup>
                  <Text size="micro" tone="muted" className="min-w-0 flex-1">
                    {DATE_MODE_CONSEQUENCE[field.state.value]}
                  </Text>
                </Row>
              )}
            </form.AppField>
            <form.AppField name="plotProgression">
              {(field): ReactElement => (
                <field.SwitchField
                  label="Plot steering"
                  hint="Adds a Plot submenu to the composer wand — one-shot story steers (twist, escalate, advance the act)."
                />
              )}
            </form.AppField>
          </Stack>

          <Stack gap="field">
            <Kicker crown={true}>Hidden channels — host only</Kicker>
            <form.AppField name="deception">
              {(field): ReactElement => (
                <field.SwitchField label="Deception" hint="Teach the model the <lie> channel — characters can hold standing secrets (the Veiled ledger)." />
              )}
            </form.AppField>
            <form.AppField name="omniscience">
              {(field): ReactElement => (
                <field.SwitchField label="Omniscience" hint="Teach the <ofilter> channel — the model can note events the party can't perceive." />
              )}
            </form.AppField>
          </Stack>

          <Stack gap="field">
            <Kicker>Steering note — never shown to members</Kicker>
            <form.AppField name="steeringNote">
              {(field): ReactElement => (
                <field.TextareaField
                  label="Steering note"
                  hint={`An always-wins host directive spliced into the game reminder. Members never see it. Max ${RPG_STEERING_NOTE_MAX} chars.`}
                  rows={3}
                />
              )}
            </form.AppField>
          </Stack>

          <Stack gap="field">
            <Kicker>Delivery model</Kicker>
            {/* The mock's SEGMENTED reliable|cheap toggle + its honest consequence line — never a
                resting dropdown (§12.4.1). */}
            <form.AppField name="extractionMode">
              {(field): ReactElement => (
                <Row gap="block" align="center">
                  <ToggleGroup
                    aria-label="Delivery model"
                    value={[field.state.value]}
                    onValueChange={(next): void => {
                      const picked = next[0];
                      if (picked === "reliable" || picked === "cheap") {
                        field.handleChange(picked);
                      }
                    }}
                  >
                    <Toggle value="reliable">reliable</Toggle>
                    <Toggle value="cheap">cheap</Toggle>
                  </ToggleGroup>
                  <Text size="micro" tone="muted" className="min-w-0 flex-1">
                    {EXTRACTION_CONSEQUENCE[field.state.value]}
                  </Text>
                </Row>
              )}
            </form.AppField>
          </Stack>
        </Stack>
      )}
    </GmConsoleFormBoundary>
  );
}
