// The Group-config editor — the room's generation behavior, edited as an autosave form (each field flip
// debounces a whole-config write, no save-bar). Source-agnostic: GroupConfigForm takes config + save,
// owning neither read nor write; committed wires setGroupConfig/getGroupConfig, draft wires
// setDraftGroupConfig directly. Output is the DU discriminator — a mode switch re-derives the coupled
// speakerTags default so the legible default follows the mode.

import type { GroupConfig, MemberCardVisibility } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG, GROUP_OUTPUT_LABELS, GROUP_POLICIES, GROUP_POLICY_LABELS, MEMBER_CARD_VISIBILITY_LEVELS } from "@orb/contracts/chat";
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
import { createAutosaveEntityForm } from "#forms/editor";
import { useSetGroupConfig } from "../hooks/use-context-panel-mutations.ts";
import type { GroupConfigFormValues } from "../lib/group-config-model.ts";
import { defaultSpeakerTags, fromGroupConfigForm, GROUP_CONFIG_ENTITY_PREFIX, toGroupConfigForm } from "../lib/group-config-model.ts";

type GroupOutput = GroupConfig["output"];

const POLICY_ITEMS: SelectItems<string> = GROUP_POLICIES.map((value) => ({
  value,
  label: GROUP_POLICY_LABELS[value],
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

interface GroupConfigFormProps {
  readonly entityId: string;
  readonly config: GroupConfig;
  /**
   * Gets the whole rebuilt GroupConfig, never a field patch. REQUIRED (client-forms-01): this editor used
   * to declare "absent ⇒ read-only", but no caller ever mounted it that way and the boundary had no way to
   * honor it — an omitted seam silently discarded edits under a "Saved" status. A genuine read-only Group
   * tab would mount the boundary's declared `readOnly` arm, not an absent save.
   */
  readonly save: (config: GroupConfig) => Promise<unknown>;
}

// The session-boundary autosave form (D78 L3). Built at MODULE scope (stable component identity, §13.1) —
// the boundary OWNS the entity key: it keys its private Session by `entityId`, so a chat switch with the
// Group tab open (this editor mounts under `ContextTabsPanel`, which keys by TAB id only) is a full
// teardown/remount seeded from the new chat's config. Wrong key placement is unspellable — the lane-h
// wrapper-split that hand-keyed `GroupConfigFormBody` is superseded (D78).
// No module `config.save` (the persist fn closes over the live tRPC client, unreachable here) — the
// SURFACE supplies it per-instance. No draft mirror: the immediate-commit chat law persists the whole
// config within the debounce window, so the server row IS the crash mirror (the room-overrides precedent).
const GroupConfigFormBoundary = createAutosaveEntityForm<GroupConfigFormValues>({
  defaultValues: toGroupConfigForm(DEFAULT_GROUP_CONFIG),
});

/**
 * The Group tab body. The boundary owns identity: it keys its private Session by `entityId`, so the whole
 * form (its FormApi + this render-prop body) dies + is reborn when the chat identity changes — this editor
 * mounts under `ContextTabsPanel`, which keys by TAB id only, so without the boundary a chat switch with
 * the tab open would keep the SAME FormApi and its frozen seed, and one field flip could autosave chat A's
 * group config into chat B. The boundary keys by `entityId` regardless of mount site, so BOTH mount arms
 * (the committed Group tab and the draft arm in `draft-context-tabs.tsx`) are protected.
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export function GroupConfigForm({ entityId, config, save }: GroupConfigFormProps): ReactElement {
  const factorySave = (values: GroupConfigFormValues): Promise<unknown> => save(fromGroupConfigForm(values));

  return (
    <GroupConfigFormBoundary entityId={entityId} serverValues={toGroupConfigForm(config)} save={factorySave}>
      {({ form }): ReactElement => (
        <Stack gap="section" data-slot="group-config-form">
          <form.AppField name="output">
            {(field): ReactElement => (
              <Stack gap="field">
                <Text voice="label">How the characters reply</Text>
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
                  aria-label="How the characters reply"
                >
                  <Toggle value="per-speaker">{GROUP_OUTPUT_LABELS["per-speaker"]}</Toggle>
                  <Toggle value="narrator">{GROUP_OUTPUT_LABELS.narrator}</Toggle>
                </ToggleGroup>
                <Text voice="gloss">
                  {field.state.value === "narrator"
                    ? "One message voices everyone — you can't swipe individuals."
                    : "Each character replies in their own message — swipe them individually."}
                </Text>
              </Stack>
            )}
          </form.AppField>

          <form.AppField name="speakerTags">{(field): ReactElement => <field.SwitchField label="Label each speaker" />}</form.AppField>

          <form.AppField name="groupNudge">{(field): ReactElement => <field.SwitchField label="Nudge the group to stay in character" />}</form.AppField>

          <Accordion>
            <AccordionItem value="advanced">
              <AccordionTrigger>Advanced</AccordionTrigger>
              <AccordionPanel>
                <Stack gap="section" className="pt-block">
                  <form.AppField name="policy">
                    {(field): ReactElement => <field.SelectField label="Who speaks each round" items={POLICY_ITEMS} />}
                  </form.AppField>

                  <form.Subscribe selector={(state): GroupOutput => state.values.output}>
                    {(output): ReactElement | null =>
                      output === "per-speaker" ? (
                        <form.AppField name="scopedCards">
                          {(field): ReactElement => <field.SwitchField label="Each character sees only their own card" />}
                        </form.AppField>
                      ) : null
                    }
                  </form.Subscribe>

                  <form.AppField name="memberCardVisibility">
                    {(field): ReactElement => <field.SelectField label="How much of each member the others see" items={VISIBILITY_ITEMS} />}
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
                              {(field): ReactElement => <field.SliderField label="Max turns in a row" min={MAX_TURNS_MIN} max={MAX_TURNS_MAX} step={1} />}
                            </form.AppField>
                            <form.AppField name="autoModeDelayMs">
                              {(field): ReactElement => (
                                <field.SliderField label="Delay between turns" min={DELAY_MS_MIN} max={DELAY_MS_MAX} step={DELAY_MS_STEP} />
                              )}
                            </form.AppField>
                            <form.AppField name="allowSelfResponses">
                              {(field): ReactElement => <field.SwitchField label="Let a character reply to itself" />}
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
      )}
    </GroupConfigFormBoundary>
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
      // NO `.catch` HERE, AND THAT IS THE CONTRACT (#1501). `createAutosaveEntityForm` decides saved-vs-error
      // by whether this promise RESOLVES (`forms/editor/create-autosave-entity-form.tsx` onSubmit: it re-baselines,
      // clears the crash draft and sets "saved" on resolve; on rejection it keeps the draft, sets "error" and
      // lights Retry). A `.catch(() => undefined)` here turned every rejected write into a resolved one, so a
      // failed save re-baselined the form, dropped the edit's only durable copy and printed "Saved". The
      // rejection is the signal; the mutation's own errorToast is the words.
      save={(next): Promise<unknown> => setGroupConfig.mutateAsync({ chatId, config: next })}
    />
  );
}
