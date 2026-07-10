// The GROUP-CONFIG editor (P3 — the CONTEXT panel's Group tab). The room's generation behavior
// (`GroupConfig`), edited as an AUTOSAVE form (`createAutosaveEntityForm`, UI-Primitives §13.4 —
// "Group-chat create + config"): each field flip debounces a whole-config write ("flip it and it saves"),
// matching the sibling room-overrides tab + the immediate-commit chat law (FINAL-Chats §2 — the chats
// section carries NO save-bar). The form machinery + the seed/remount/reseed obligations live in
// `use-group-config-form.ts`, the form↔wire mapping in `../lib/group-config-model.ts`; this file is the
// FIELDS + the copy + the progressive disclosure.
//
// WHY autosave, not `createSavedEntityForm`: a save-bar on the Group tab violates the no-save-bar chat
// law, and the shipped semantics ARE flip-and-it-saves. The `GroupConfig` DU is a whole-object write, but
// that discipline is the WRITE SHAPE (`fromGroupConfigForm`, in the save fn), orthogonal to the form
// machinery — the factory expresses it fine. NO draft mirror (the server row is the crash mirror — the
// room-overrides/appearance precedent).
//
// SOURCE-AGNOSTIC (dual-mode, J2/J3): the pure `GroupConfigForm` takes `config` (the current value) +
// `save` (the persist seam, returning a Promise), owning neither read nor write. COMMITTED → the
// `setGroupConfig` verb + the `getGroupConfig` read (`CommittedGroupConfigTab` below); DRAFT →
// `setDraftGroupConfig` + `draftConfig.groupConfig` (the draft surface wires it directly).
//
// PROGRESSIVE DISCLOSURE: output · label-speaker · group-nudge are always visible; policy / card-scope /
// member-visibility / auto-mode hide under an Advanced disclosure. `output` is the DU discriminator — a
// mode switch re-derives the coupled speakerTags default (via `form.setFieldValue`) so the legible default
// follows the mode; card-scope shows only on per-speaker.

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
  /** The form's stable identity for seed/remount (committed → `group-config:${chatId}`; draft →
   *  `group-config:draft:${draftKey}`). */
  readonly entityId: string;
  /** The current config (committed → `getGroupConfig`; draft → `draftConfig.groupConfig ?? default`). */
  readonly config: GroupConfig;
  /** The persist seam (fire-and-forget from the debounced listener; failures surface via the caller's
   *  channel): committed → `setGroupConfig.mutateAsync`; draft → the draft store write. Gets the whole
   *  rebuilt `GroupConfig` (never a field patch). Absent ⇒ read-only. */
  readonly save?: ((config: GroupConfig) => Promise<unknown>) | undefined;
}

/** The Group tab body — the room's generation-behavior knobs, autosaving, progressively disclosed. */
export function GroupConfigForm({ entityId, config, save }: GroupConfigFormProps): ReactElement {
  // Adapt the surface's config-level `save` to the factory's form-values-level persist fn — the whole-
  // object DU rebuild (`fromGroupConfigForm`) happens HERE so callers deal in domain `GroupConfig`.
  const factorySave =
    save === undefined
      ? undefined
      : (values: GroupConfigFormValues): Promise<unknown> => save(fromGroupConfigForm(values));

  const { form, mountKey } = useGroupConfigForm({
    entityId,
    serverValues: toGroupConfigForm(config),
    // Read-only (no persist fn) unless a save is supplied (spread, not `undefined` — exactOptional).
    ...(factorySave === undefined ? {} : { save: factorySave }),
  });

  return (
    <Stack key={mountKey} gap="section" data-slot="group-config-form">
      {/* Output — the DU discriminator (a whole-object mode switch). A raw single-select ToggleGroup:
          the switch also re-derives the coupled speakerTags default, which no bound field expresses. */}
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
                  // The coupling holds on switch, not just load — re-derive the speakerTags default.
                  form.setFieldValue("speakerTags", defaultSpeakerTags(output));
                }
              }}
              aria-label="How the cast replies"
            >
              {/* Concise mode names (the hint line below carries the friendly explanation) — the
                  descriptive labels truncate in the narrow CONTEXT panel. */}
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

/** The COMMITTED Group tab: reads `chat.getGroupConfig` + wires the `setGroupConfig` verb, then renders the
 *  pure `GroupConfigForm`. A draft renders `GroupConfigForm` directly with its `draftConfig.groupConfig`
 *  source + `setDraftGroupConfig` seam. Suspends on the read (mount inside a QueryBoundary). */
export function CommittedGroupConfigTab({ chatId }: CommittedGroupConfigTabProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const setGroupConfig = useSetGroupConfig({ trpc, invalidation });
  const { data: config } = useSuspenseQuery(trpc.chat.getGroupConfig.queryOptions({ chatId }));

  return (
    <GroupConfigForm
      entityId={`${GROUP_CONFIG_ENTITY_PREFIX}${chatId}`}
      config={config}
      // `.catch` swallows the autosave rejection so a failed write doesn't leak an unhandled TRPCClientError
      // as a page error — the mutation's `meta.errorToast` already surfaces the failure to the user.
      save={(next): Promise<unknown> =>
        setGroupConfig.mutateAsync({ chatId, config: next }).catch(() => undefined)
      }
    />
  );
}
