// The Group-config editor — the room's generation behavior, edited as an autosave form (each field flip
// debounces a whole-config write, no save-bar). Source-agnostic: GroupConfigForm takes config + save,
// owning neither read nor write; committed wires setGroupConfig/getGroupConfig, draft wires
// setDraftGroupConfig directly. Output is the DU discriminator — a mode switch re-derives the coupled
// speakerTags default so the legible default follows the mode.

import type { GroupConfig, GroupPolicy, MemberCardVisibility } from "@orb/contracts/chat";
import { GROUP_POLICIES, MEMBER_CARD_VISIBILITY_LEVELS } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { Accordion, AccordionItem, AccordionPanel, AccordionTrigger } from "@orb/ui/accordion";
import { Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useInvalidation, useTRPC } from "#data";
import { useSetGroupConfig } from "../hooks/use-context-panel-mutations";
import { GROUP_CONFIG_ENTITY_PREFIX, useGroupConfigForm } from "../hooks/use-group-config-form";
import type { GroupConfigFormValues } from "../lib/group-config-model";
import {
  defaultSpeakerTags,
  fromGroupConfigForm,
  toGroupConfigForm,
} from "../lib/group-config-model";

type GroupOutput = GroupConfig["output"];

const POLICY_LABELS: Record<GroupPolicy, string> = {
  natural: "Natural",
  list: "Everyone, in order",
  pooled: "Round-robin",
  manual: "Only when I pick",
  smart: "Smart (side-LLM)",
};
const POLICY_ITEMS: SelectItems<string> = GROUP_POLICIES.map((value) => ({
  value,
  label: POLICY_LABELS[value],
}));

const VISIBILITY_LABELS: Record<MemberCardVisibility, string> = {
  "name-avatar": "Name + avatar only",
  sheet: "Character sheet",
  "sheet+lore": "Sheet + lore",
  full: "Full card",
};
const VISIBILITY_ITEMS: SelectItems<string> = MEMBER_CARD_VISIBILITY_LEVELS.map((value) => ({
  value,
  label: VISIBILITY_LABELS[value],
}));

const MAX_TURNS_MIN = 1;
const MAX_TURNS_MAX = 20;
const DELAY_MS_MIN = 0;
const DELAY_MS_MAX = 60_000;
const DELAY_MS_STEP = 250;

export interface GroupConfigFormProps {
  readonly entityId: string;
  readonly config: GroupConfig;
  /** Gets the whole rebuilt GroupConfig, never a field patch. Absent ⇒ read-only. */
  readonly save?: ((config: GroupConfig) => Promise<unknown>) | undefined;
}

export function GroupConfigForm({ entityId, config, save }: GroupConfigFormProps): ReactElement {
  const factorySave =
    save === undefined
      ? undefined
      : (values: GroupConfigFormValues): Promise<unknown> => save(fromGroupConfigForm(values));

  const { form, mountKey } = useGroupConfigForm({
    entityId,
    serverValues: toGroupConfigForm(config),
    ...(factorySave === undefined ? {} : { save: factorySave }),
  });

  return (
    <Stack key={mountKey} gap="section" data-slot="group-config-form">
      <form.AppField name="output">
        {(field): ReactElement => (
          <Stack gap="field">
            <Text size="label" weight="medium">
              How the cast replies
            </Text>
            <ToggleGroup
              value={[field.state.value]}
              onValueChange={(value): void => {
                const next = value[0];
                if (next !== undefined && next !== field.state.value) {
                  const output = next as GroupOutput;
                  field.handleChange(output);
                  form.setFieldValue("speakerTags", defaultSpeakerTags(output));
                }
              }}
              aria-label="How the cast replies"
            >
              <Toggle value="per-speaker">Per-speaker</Toggle>
              <Toggle value="narrator">Narrator</Toggle>
            </ToggleGroup>
            <Text size="micro" tone="muted">
              {field.state.value === "narrator"
                ? "One message voices everyone — you can't swipe individuals."
                : "Each character replies in their own message — swipe them individually."}
            </Text>
          </Stack>
        )}
      </form.AppField>

      <form.AppField name="speakerTags">
        {(field): ReactElement => <field.SwitchField label="Label each speaker" />}
      </form.AppField>

      <form.AppField name="groupNudge">
        {(field): ReactElement => (
          <field.SwitchField label="Nudge the group to stay in character" />
        )}
      </form.AppField>

      <Accordion>
        <AccordionItem value="advanced">
          <AccordionTrigger>Advanced</AccordionTrigger>
          <AccordionPanel>
            <Stack gap="section" className="pt-block">
              <form.AppField name="policy">
                {(field): ReactElement => (
                  <field.SelectField label="Who speaks each round" items={POLICY_ITEMS} />
                )}
              </form.AppField>

              <form.Subscribe selector={(state): GroupOutput => state.values.output}>
                {(output): ReactElement | null =>
                  output === "per-speaker" ? (
                    <form.AppField name="scopedCards">
                      {(field): ReactElement => (
                        <field.SwitchField label="Each character sees only their own card" />
                      )}
                    </form.AppField>
                  ) : null
                }
              </form.Subscribe>

              <form.AppField name="memberCardVisibility">
                {(field): ReactElement => (
                  <field.SelectField
                    label="How much of each member the others see"
                    items={VISIBILITY_ITEMS}
                  />
                )}
              </form.AppField>

              <Stack gap="field">
                <form.AppField name="autoMode">
                  {(field): ReactElement => (
                    <field.SwitchField
                      label="Let characters reply to each other"
                      description="They keep the conversation going on their own — each auto-turn is a full generation you pay for."
                    />
                  )}
                </form.AppField>
                <form.Subscribe selector={(state): boolean => state.values.autoMode}>
                  {(autoMode): ReactElement | null =>
                    autoMode ? (
                      <Stack gap="field">
                        <form.AppField name="autoModeMaxTurns">
                          {(field): ReactElement => (
                            <field.SliderField
                              label="Max turns in a row"
                              min={MAX_TURNS_MIN}
                              max={MAX_TURNS_MAX}
                              step={1}
                            />
                          )}
                        </form.AppField>
                        <form.AppField name="autoModeDelayMs">
                          {(field): ReactElement => (
                            <field.SliderField
                              label="Delay between turns"
                              min={DELAY_MS_MIN}
                              max={DELAY_MS_MAX}
                              step={DELAY_MS_STEP}
                            />
                          )}
                        </form.AppField>
                        <form.AppField name="allowSelfResponses">
                          {(field): ReactElement => (
                            <field.SwitchField label="Let a character reply to itself" />
                          )}
                        </form.AppField>
                      </Stack>
                    ) : null
                  }
                </form.Subscribe>
              </Stack>
            </Stack>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </Stack>
  );
}

export interface CommittedGroupConfigTabProps {
  readonly chatId: ChatId;
}

export function CommittedGroupConfigTab({ chatId }: CommittedGroupConfigTabProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const setGroupConfig = useSetGroupConfig({ trpc, invalidation });
  const { data: config } = useSuspenseQuery(trpc.chat.getGroupConfig.queryOptions({ chatId }));

  return (
    <GroupConfigForm
      entityId={`${GROUP_CONFIG_ENTITY_PREFIX}${chatId}`}
      config={config}
      save={(next): Promise<unknown> =>
        setGroupConfig.mutateAsync({ chatId, config: next }).catch(() => undefined)
      }
    />
  );
}
