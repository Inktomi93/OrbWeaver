// The GROUP-CONFIG editor (P3 — the CONTEXT panel's Group tab). The room's generation behavior
// (`GroupConfig`): a discriminated union on `output` (narrator ⇒ one merged message · per-speaker ⇒ one
// message each). `output` changes the SHAPE of the config, so every edit goes through `buildConfig`, which
// projects the flat editing values onto the correct arm — the narrator arm is `.strict()` and carries NO
// `cardScope`, so field-patching the stored union would produce an invalid blob; we always rebuild it.
//
// SOURCE-AGNOSTIC (dual-mode, J2/J3): PURE — takes `config` (the current value) + `onSave` (the persist
// seam), owning neither read nor write. COMMITTED → the `setGroupConfig` verb + the `getGroupConfig` read;
// DRAFT → `setDraftGroupConfig` + `draftConfig.groupConfig`. IMMEDIATE-COMMIT (like the sibling room-
// overrides/roster editors + neo's group form): each control writes the whole rebuilt object at once — a
// discriminated-union config is a whole-object write, not a field-form, so this is the right shape (not
// `createSavedEntityForm` — §13.4's table entry predates the DU + dual-mode requirement).
//
// PROGRESSIVE DISCLOSURE: output · speaker-tags · group-nudge are always visible; policy / card-scope /
// auto-mode / member-visibility hide under an Advanced disclosure, each with a one-line cost/consequence
// note. speakerTags' DEFAULT is coupled to output (narrator ⇒ on, per-speaker ⇒ off) and re-derived on a
// mode switch so the legible default follows the mode.

import type { GroupConfig, GroupPolicy, MemberCardVisibility } from "@orb/contracts/chat";
import { MEMBER_CARD_VISIBILITY_LEVELS } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { Accordion, AccordionItem, AccordionPanel, AccordionTrigger } from "@orb/ui/accordion";
import { Row, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import { Slider } from "@orb/ui/slider";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import { useSetGroupConfig } from "../hooks/use-context-panel-mutations";

type GroupOutput = GroupConfig["output"];

/** The flat editing shape — a superset of both union arms. `buildConfig` projects it back onto the
 *  correct discriminated arm so `cardScope` only survives on per-speaker. */
interface FlatGroupConfig {
  output: GroupOutput;
  policy: GroupPolicy;
  cardScope: "merged" | "scoped";
  speakerTags: boolean;
  groupNudge: boolean;
  autoMode: boolean;
  autoModeMaxTurns: number;
  autoModeDelayMs: number;
  allowSelfResponses: boolean;
  memberCardVisibility: MemberCardVisibility;
}

function toFlat(config: GroupConfig): FlatGroupConfig {
  return {
    output: config.output,
    policy: config.policy,
    cardScope: config.output === "per-speaker" ? config.cardScope : "merged",
    speakerTags: config.speakerTags,
    groupNudge: config.groupNudge,
    autoMode: config.autoMode,
    autoModeMaxTurns: config.autoModeMaxTurns,
    autoModeDelayMs: config.autoModeDelayMs,
    allowSelfResponses: config.allowSelfResponses,
    memberCardVisibility: config.memberCardVisibility,
  };
}

/** Project the flat values onto the correct discriminated arm — narrator drops `cardScope` (its `.strict()`
 *  arm rejects it). The single owner of the union shape on the client. */
function buildConfig(flat: FlatGroupConfig): GroupConfig {
  const shared = {
    policy: flat.policy,
    speakerTags: flat.speakerTags,
    groupNudge: flat.groupNudge,
    autoMode: flat.autoMode,
    autoModeMaxTurns: flat.autoModeMaxTurns,
    autoModeDelayMs: flat.autoModeDelayMs,
    allowSelfResponses: flat.allowSelfResponses,
    memberCardVisibility: flat.memberCardVisibility,
  } as const;
  return flat.output === "narrator"
    ? { output: "narrator", ...shared }
    : { output: "per-speaker", cardScope: flat.cardScope, ...shared };
}

/** speakerTags' default coupled to output — narrator labels each line by default; the per-speaker stream
 *  already attributes per message, so tags default off there. */
function defaultSpeakerTags(output: GroupOutput): boolean {
  return output === "narrator";
}

const POLICY_ITEMS: SelectItems<string> = [
  { value: "natural", label: "Natural" },
  { value: "list", label: "Everyone, in order" },
  { value: "pooled", label: "Round-robin" },
  { value: "manual", label: "Only when I pick" },
  { value: "smart", label: "Smart (side-LLM)" },
];

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
  /** The current config (committed → `getGroupConfig`; draft → `draftConfig.groupConfig ?? default`). */
  readonly config: GroupConfig;
  /** The persist seam (fire-and-forget — the form never reads the result): committed → `setGroupConfig.mutate`
   *  (errors surface via the mutation's own errorToast); draft → `setDraftGroupConfig`. `=> void` accepts
   *  both a Promise-returning and a sync caller (TS void-return bivariance). Gets the whole rebuilt
   *  `GroupConfig` (never a field patch). */
  readonly onSave: (config: GroupConfig) => void;
}

/** The Group tab body — the room's generation-behavior knobs, immediate-commit, progressively disclosed. */
export function GroupConfigForm({ config, onSave }: GroupConfigFormProps): ReactElement {
  // Local edit state IS the source of truth while mounted (immediate-commit keeps it === persisted ===
  // `config`). Seeded once; a slot change / draft clear remounts the form fresh.
  const [flat, setFlat] = useState<FlatGroupConfig>(() => toFlat(config));

  const writeConfig = (next: FlatGroupConfig): void => {
    setFlat(next);
    onSave(buildConfig(next));
  };
  const commit = (patch: Partial<FlatGroupConfig>): void => writeConfig({ ...flat, ...patch });
  // Slider drag: update the local value every frame WITHOUT persisting; the release (`onValueCommitted`)
  // persists once.
  const drag = (patch: Partial<FlatGroupConfig>): void => setFlat({ ...flat, ...patch });

  const setOutput = (output: GroupOutput): void => {
    if (output === flat.output) {
      return;
    }
    // Re-derive the speakerTags default for the new mode (the coupling holds on switch, not just load).
    commit({ output, speakerTags: defaultSpeakerTags(output) });
  };

  return (
    <Stack gap="section" data-slot="group-config-form">
      {/* Output — the discriminator (a whole-object mode switch). */}
      <Stack gap="field">
        <Text size="label" weight="medium">
          How the cast replies
        </Text>
        <ToggleGroup
          value={[flat.output]}
          onValueChange={(value): void => {
            const next = value[0];
            if (next !== undefined) {
              setOutput(next as GroupOutput);
            }
          }}
          aria-label="How the cast replies"
        >
          {/* Concise mode names (the hint line below carries the friendly explanation) — the descriptive
              "One message each"/"One narrator voice" truncate in the narrow CONTEXT panel. */}
          <Toggle value="per-speaker">Per-speaker</Toggle>
          <Toggle value="narrator">Narrator</Toggle>
        </ToggleGroup>
        <Text size="micro" tone="muted">
          {flat.output === "narrator"
            ? "One message voices everyone — you can't swipe individuals."
            : "Each character replies in their own message — swipe them individually."}
        </Text>
      </Stack>

      <Row gap="field" align="center" justify="between">
        <Text size="label">Label each speaker</Text>
        <Switch
          aria-label="Label each speaker"
          checked={flat.speakerTags}
          onCheckedChange={(checked): void => commit({ speakerTags: checked })}
        />
      </Row>

      <Row gap="field" align="center" justify="between">
        <Text size="label">Nudge the group to stay in character</Text>
        <Switch
          aria-label="Group nudge"
          checked={flat.groupNudge}
          onCheckedChange={(checked): void => commit({ groupNudge: checked })}
        />
      </Row>

      <Accordion>
        <AccordionItem value="advanced">
          <AccordionTrigger>Advanced</AccordionTrigger>
          <AccordionPanel>
            <Stack gap="section" className="pt-block">
              <Select
                label="Who speaks each round"
                items={POLICY_ITEMS}
                value={flat.policy}
                onValueChange={(value): void => commit({ policy: value as GroupPolicy })}
              />

              {flat.output === "per-speaker" ? (
                <Row gap="field" align="center" justify="between">
                  <Text size="label">Each character sees only their own card</Text>
                  <Switch
                    aria-label="Scoped cards"
                    checked={flat.cardScope === "scoped"}
                    onCheckedChange={(checked): void =>
                      commit({ cardScope: checked ? "scoped" : "merged" })
                    }
                  />
                </Row>
              ) : null}

              <Select
                label="How much of each member the others see"
                items={VISIBILITY_ITEMS}
                value={flat.memberCardVisibility}
                onValueChange={(value): void =>
                  commit({ memberCardVisibility: value as MemberCardVisibility })
                }
              />

              <Stack gap="field">
                <Row gap="field" align="center" justify="between">
                  <Text size="label">Let characters reply to each other</Text>
                  <Switch
                    aria-label="Auto-mode"
                    checked={flat.autoMode}
                    onCheckedChange={(checked): void => commit({ autoMode: checked })}
                  />
                </Row>
                <Text size="micro" tone="muted">
                  They keep the conversation going on their own — each auto-turn is a full
                  generation you pay for.
                </Text>
                {flat.autoMode ? (
                  <Stack gap="field">
                    <Row gap="field" align="center" justify="between">
                      <Text size="label">Max turns in a row</Text>
                      <Text size="micro" tone="muted">
                        {flat.autoModeMaxTurns}
                      </Text>
                    </Row>
                    <Slider
                      aria-label="Max auto-turns in a row"
                      value={flat.autoModeMaxTurns}
                      min={MAX_TURNS_MIN}
                      max={MAX_TURNS_MAX}
                      step={1}
                      onValueChange={(value): void =>
                        drag({
                          autoModeMaxTurns:
                            typeof value === "number" ? value : flat.autoModeMaxTurns,
                        })
                      }
                      onValueCommitted={(value): void =>
                        commit({
                          autoModeMaxTurns:
                            typeof value === "number" ? value : flat.autoModeMaxTurns,
                        })
                      }
                    />
                    <Row gap="field" align="center" justify="between">
                      <Text size="label">Delay between turns</Text>
                      <Text size="micro" tone="muted">
                        {flat.autoModeDelayMs} ms
                      </Text>
                    </Row>
                    <Slider
                      aria-label="Delay between auto-turns"
                      value={flat.autoModeDelayMs}
                      min={DELAY_MS_MIN}
                      max={DELAY_MS_MAX}
                      step={DELAY_MS_STEP}
                      onValueChange={(value): void =>
                        drag({
                          autoModeDelayMs: typeof value === "number" ? value : flat.autoModeDelayMs,
                        })
                      }
                      onValueCommitted={(value): void =>
                        commit({
                          autoModeDelayMs: typeof value === "number" ? value : flat.autoModeDelayMs,
                        })
                      }
                    />
                    <Row gap="field" align="center" justify="between">
                      <Text size="label">Let a character reply to itself</Text>
                      <Switch
                        aria-label="Allow self responses"
                        checked={flat.allowSelfResponses}
                        onCheckedChange={(checked): void => commit({ allowSelfResponses: checked })}
                      />
                    </Row>
                  </Stack>
                ) : null}
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
      config={config}
      onSave={(next): void => setGroupConfig.mutate({ chatId, config: next })}
    />
  );
}
