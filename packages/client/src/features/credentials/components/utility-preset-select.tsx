// The Utility role's preset choice (D304), beside its connection in Model roles. A background task takes only the
// chosen preset's generation params and its reasoning tag pair, never its prompts, so the copy says sampling, not "preset behaviour".

import type { RolePresetChoice } from "@orb/contracts/settings";
import { ROLE_PRESET_CHOICE_KINDS } from "@orb/contracts/settings";
import type { PresetId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { HintTrigger } from "@orb/ui/hint-trigger";
import { Row } from "@orb/ui/layout";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useInvalidation, useSuspenseQueries, useTRPC } from "#data";
import { useSetUtilityPreset } from "../hooks/use-connections-mutations.ts";

// A preset id is a prefixed TypeID, so neither option value can collide with one.
const TASK_DEFAULTS_VALUE = "task-defaults";
const SAME_AS_CHAT_VALUE = ROLE_PRESET_CHOICE_KINDS.sameAsChat;

function selectedValueOf(choice: RolePresetChoice | null, presetIds: readonly PresetId[]): string {
  if (choice === null) {
    return TASK_DEFAULTS_VALUE;
  }
  if (choice.kind === ROLE_PRESET_CHOICE_KINDS.sameAsChat) {
    return SAME_AS_CHAT_VALUE;
  }
  // A deleted or foreign preset runs as task defaults on the server, so the picker says so.
  return presetIds.includes(choice.presetId) ? choice.presetId : TASK_DEFAULTS_VALUE;
}

function choiceOf(value: string): RolePresetChoice | null {
  if (value === TASK_DEFAULTS_VALUE) {
    return null;
  }
  if (value === SAME_AS_CHAT_VALUE) {
    return { kind: ROLE_PRESET_CHOICE_KINDS.sameAsChat };
  }
  // A Select value is UI text: an unknown one reads as task defaults rather than throwing in a change handler.
  const presetId = typeIdSchema(ID_PREFIX.preset).safeParse(value);
  return presetId.success ? { kind: ROLE_PRESET_CHOICE_KINDS.preset, presetId: presetId.data } : null;
}

export function UtilityPresetSelect(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const [{ data: presets }, { data: settings }] = useSuspenseQueries({
    queries: [trpc.preset.list.queryOptions(), trpc.settings.getUserSettings.queryOptions()],
  });
  const setPreset = useSetUtilityPreset({ trpc, invalidation });

  const items = [
    { label: "Task defaults", value: TASK_DEFAULTS_VALUE, description: "Each background task uses its own sampling." },
    { label: "Same as chat", value: SAME_AS_CHAT_VALUE, description: "Uses your active chat preset's sampling." },
    ...presets.map((preset) => ({ label: preset.name, value: preset.id })),
  ];
  const value = selectedValueOf(
    settings.config.seeds.summarizePreset,
    presets.map((preset) => preset.id),
  );

  return (
    // The same placement the role rows use: the picker ends the label row, and under one container width it sits below the label.
    <Row align="center" alignBelow="stretch-cq-32" gap="field" indent={true} justify="between" stackBelow="cq-32">
      {/* The hint is a sibling of the label, never inside it, or its name joins the label's. */}
      <Row align="center" className="min-inline-0" gap="tight" wrap="cq-20">
        <Text className="min-inline-0" voice="label" wrap="word">
          Utility preset
        </Text>
        <HintTrigger
          hint="The sampling summaries, extraction, captions and other background tasks run at. A preset here lends only its sampling settings, never its prompts."
          subject="Utility preset"
        />
      </Row>
      <Row>
        <Select
          aria-label="Utility preset"
          items={items}
          layout="hug"
          value={value}
          disabled={setPreset.isPending}
          onValueChange={(next): void => {
            if (next === null) {
              return;
            }
            setPreset.mutate({ section: "seeds", patch: { summarizePreset: choiceOf(next) } });
          }}
        />
      </Row>
    </Row>
  );
}
