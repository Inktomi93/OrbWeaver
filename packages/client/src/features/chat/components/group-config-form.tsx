// The Group-config editor — the room's generation behavior, edited as an autosave form (each field flip
// debounces a whole-config write, no save-bar). Source-agnostic: GroupConfigForm takes config + save,
// owning neither read nor write; committed wires setGroupConfig/getGroupConfig, draft wires
// setDraftGroupConfig directly. Output is the DU discriminator — a mode switch re-derives the coupled
// speakerTags default so the legible default follows the mode.

import type { GroupConfig, GroupPolicy, MemberCardVisibility } from "@orb/contracts/chat";
import {
  DEFAULT_GROUP_CONFIG,
  GROUP_OUTPUT_LABELS,
  GROUP_POLICIES,
  GROUP_POLICY_LABELS,
  MEMBER_CARD_VISIBILITY_LEVELS,
  narratorPolicyOf,
  SMART_PICKER_LABELS,
  SMART_UTILITY_SWITCH_LABEL,
} from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { Accordion, AccordionItem, AccordionPanel, AccordionTrigger } from "@orb/ui/accordion";
import { Row, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { RerankModelDoor, UtilityModelDoor, useRerankModel, useUtilityModel } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { createAutosaveEntityForm } from "#forms/editor";
import { SMART_POLICY_COST_SENTENCE } from "#lib";
import { useSetGroupConfig } from "../hooks/use-context-panel-mutations.ts";
import type { GroupConfigFormValues } from "../lib/group-config-model.ts";
import { defaultSpeakerTags, fromGroupConfigForm, GROUP_CONFIG_ENTITY_PREFIX, toGroupConfigForm } from "../lib/group-config-model.ts";

type GroupOutput = GroupConfig["output"];

type UtilityModel = ReturnType<typeof useUtilityModel>;
type RerankModel = ReturnType<typeof useRerankModel>;

// Smart picks with the reranker by default, so it needs no Utility model; only its opt-in upgrade does.
const POLICY_ITEMS: SelectItems<string> = GROUP_POLICIES.map((value) => ({ value, label: GROUP_POLICY_LABELS[value] }));

/** Why a Narrator room cannot pick Smart, shown under the disabled option. */
const NARRATOR_SMART_REASON = "Not in Narrator: one message voices everyone, so there is no next speaker to pick.";

/** A Narrator room cannot hold Smart (the contract heals it to Natural), so the option is disabled and says why. */
const NARRATOR_POLICY_ITEMS: SelectItems<string> = GROUP_POLICIES.map((value) =>
  value === "smart"
    ? { value, label: GROUP_POLICY_LABELS[value], disabled: true, description: NARRATOR_SMART_REASON }
    : { value, label: GROUP_POLICY_LABELS[value] },
);

function policyItemsFor(output: GroupOutput): SelectItems<string> {
  return output === "narrator" ? NARRATOR_POLICY_ITEMS : POLICY_ITEMS;
}

const RERANKER_SMART_HELP = `Smart ranks the characters against the last message with your ${SMART_PICKER_LABELS.reranker}. A character plainly named in that message replies first; when several share the name, Smart ranks only those. If no ${SMART_PICKER_LABELS.reranker} is available, Natural picks and you're told once per session.`;

// The help under each control states what the server does with it (`engine/select-speakers.ts`,
// `engine/round.ts`), per policy, so the Rooms guide never has to restate it. Smart's help depends on the
// Utility model, so it is `smartHelp` instead.
const POLICY_HELP: Record<Exclude<GroupPolicy, "smart">, string> = {
  natural:
    "Characters you name in your message reply, even one who just spoke. Each other character replies by chance, set by their talkativeness, and if nobody would, one of them does. When characters reply to each other, whoever spoke last sits out unless a character may reply to itself.",
  list: "Every character who can speak replies, in the order they joined. Whoever spoke last sits out unless a character may reply to itself.",
  pooled: "Every character who can speak replies, starting with the one after whoever spoke last.",
  manual: "Nobody replies on their own. Mention a character with @, or pick one from Generate reply. A Narrator room still narrates every message.",
};

function smartHelp(utility: UtilityModel, usesUtility: boolean): string {
  if (!usesUtility) {
    return RERANKER_SMART_HELP;
  }
  if (utility.kind === "ready") {
    return `${SMART_POLICY_COST_SENTENCE} It runs on ${utility.label}. If it can't decide, Natural picks and you're told once per session.`;
  }
  if (utility.kind === "unset") {
    return `${SMART_POLICY_COST_SENTENCE} No Utility model is set, so Natural picks every round and you're told once per session.`;
  }
  if (utility.kind === "blocked") {
    return `${SMART_POLICY_COST_SENTENCE} Your Utility model is set but not running: ${utility.cause}. Until it runs, Natural picks and you're told once per session.`;
  }
  return `${SMART_POLICY_COST_SENTENCE} If it can't decide, Natural picks and you're told once per session.`;
}

function policyHelp(policy: GroupPolicy, utility: UtilityModel, usesUtility: boolean): string {
  return policy === "smart" ? smartHelp(utility, usesUtility) : POLICY_HELP[policy];
}

// The Utility door is the fix only when this room's Smart actually picks with the Utility model.
function needsUtilityDoor(policy: GroupPolicy, utility: UtilityModel, usesUtility: boolean): boolean {
  return policy === "smart" && usesUtility && (utility.kind === "unset" || utility.kind === "blocked");
}

// The Rerank door is the fix when Smart picks with the Rerank model (the default) and none is running.
function needsRerankDoor(policy: GroupPolicy, rerank: RerankModel, usesUtility: boolean): boolean {
  return policy === "smart" && !usesUtility && (rerank.kind === "unset" || rerank.kind === "blocked");
}

/** The speaker-order control. Mounted only when Advanced opens, so the role reads run only then. */
function PolicyField({ children }: { readonly children: (utility: UtilityModel, rerank: RerankModel) => ReactElement }): ReactElement {
  return children(useUtilityModel(), useRerankModel());
}

const SPEAKER_TAGS_HELP: Record<GroupOutput, string> = {
  narrator: "Asks the model to mark who says each line, so every character's lines get their own color.",
  "per-speaker": "Only used by Narrator. Here every message already belongs to one character.",
};

const GROUP_NUDGE_HELP: Record<GroupOutput, string> = {
  narrator: "Tells the model which characters are present to voice.",
  "per-speaker": "When several characters reply, tells each one to write only as themselves.",
};

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
                      // A Narrator room cannot hold Smart: it becomes Natural, and switching back does not restore it.
                      if (output === "narrator") {
                        form.setFieldValue("policy", narratorPolicyOf(form.getFieldValue("policy")));
                      }
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

          <form.Subscribe selector={(state): GroupOutput => state.values.output}>
            {(output): ReactElement => (
              <>
                <form.AppField name="speakerTags">
                  {(field): ReactElement => (
                    // Only the narrator round reads speakerTags; in a per-speaker room the switch would be a
                    // no-op, so it stays visible, disabled, and explained by its description.
                    <field.SwitchField label="Label each speaker" description={SPEAKER_TAGS_HELP[output]} disabled={output === "per-speaker"} />
                  )}
                </form.AppField>
                <form.AppField name="groupNudge">
                  {(field): ReactElement => <field.SwitchField label="Nudge the group to stay in character" description={GROUP_NUDGE_HELP[output]} />}
                </form.AppField>
              </>
            )}
          </form.Subscribe>

          <Accordion>
            <AccordionItem value="advanced">
              <AccordionTrigger>Advanced</AccordionTrigger>
              <AccordionPanel>
                <Stack gap="section" className="pt-block">
                  <PolicyField>
                    {(utility, rerank): ReactElement => (
                      <form.Subscribe selector={(state): GroupOutput => state.values.output}>
                        {(output): ReactElement => (
                          <form.Subscribe selector={(state): boolean => state.values.smartUsesUtility}>
                            {(usesUtility): ReactElement => (
                              <form.AppField name="policy">
                                {(field): ReactElement => (
                                  <Stack gap="field">
                                    <field.SelectField
                                      label="Who speaks each round"
                                      items={policyItemsFor(output)}
                                      description={policyHelp(field.state.value, utility, usesUtility)}
                                    />
                                    {needsUtilityDoor(field.state.value, utility, usesUtility) ? (
                                      <Row>
                                        <UtilityModelDoor />
                                      </Row>
                                    ) : null}
                                    {needsRerankDoor(field.state.value, rerank, usesUtility) ? (
                                      <Row>
                                        <RerankModelDoor />
                                      </Row>
                                    ) : null}
                                  </Stack>
                                )}
                              </form.AppField>
                            )}
                          </form.Subscribe>
                        )}
                      </form.Subscribe>
                    )}
                  </PolicyField>

                  {/* The upgrade inside Smart, which only a per-speaker room can hold. */}
                  <form.Subscribe selector={(state): boolean => state.values.policy === "smart"}>
                    {(picks): ReactElement | null =>
                      picks ? (
                        <form.AppField name="smartUsesUtility">
                          {(field): ReactElement => <field.SwitchField label={SMART_UTILITY_SWITCH_LABEL} description={SMART_POLICY_COST_SENTENCE} />}
                        </form.AppField>
                      ) : null
                    }
                  </form.Subscribe>

                  <form.Subscribe selector={(state): GroupOutput => state.values.output}>
                    {(output): ReactElement | null =>
                      output === "per-speaker" ? (
                        <form.AppField name="scopedCards">
                          {(field): ReactElement => (
                            <field.SwitchField
                              label="Each character sees only their own card"
                              description="Each reply is written from that character's card alone, and with memory on they recall only what happened while they were in the room. Off, every reply sees every card."
                            />
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
                        description="What the other people in this room can open on each character's card. You always see the whole card."
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
                              {(field): ReactElement => <field.SliderField label="Max turns in a row" min={MAX_TURNS_MIN} max={MAX_TURNS_MAX} step={1} />}
                            </form.AppField>
                            <form.AppField name="autoModeDelayMs">
                              {(field): ReactElement => (
                                <field.SliderField label="Delay between turns" min={DELAY_MS_MIN} max={DELAY_MS_MAX} step={DELAY_MS_STEP} />
                              )}
                            </form.AppField>
                          </Stack>
                        ) : null
                      }
                    </form.Subscribe>
                  </Stack>

                  {/* Not an auto-mode knob: `verbs/turn.ts::banLastFor` reads it on every round the app picks
                      speakers for. The form mounts only in a room with more than one character. */}
                  <form.AppField name="allowSelfResponses">
                    {(field): ReactElement => (
                      <field.SwitchField
                        label="Let a character reply to itself"
                        description="Off, whoever spoke last sits out of every round the app picks speakers for. Under Natural, a character you name can always answer."
                      />
                    )}
                  </form.AppField>
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
