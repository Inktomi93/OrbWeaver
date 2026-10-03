// The Utility role's preset choice (D299), beside its connection in Model roles. A background task takes only the
// chosen preset's generation params, never its prompts, so the copy says sampling, not "preset behaviour".

import type { RolePresetChoice } from "@orb/contracts/settings";
import { ROLE_PRESET_CHOICE_KINDS } from "@orb/contracts/settings";
import { Row, Stack } from "@orb/ui/layout";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { useSuspenseQueries } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useInvalidation, useTRPC } from "#data";
import { useSetUtilityPreset } from "../hooks/use-connections-mutations.ts";

// A preset id is a prefixed TypeID, so neither option value can collide with one.
const TASK_DEFAULTS_VALUE = "task-defaults";
const SAME_AS_CHAT_VALUE = ROLE_PRESET_CHOICE_KINDS.sameAsChat;

const PROSE_MEASURE = "max-w-(--reading-measure-prose)";

function selectedValueOf(choice: RolePresetChoice | null, presetIds: readonly string[]): string {
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
  return { kind: ROLE_PRESET_CHOICE_KINDS.preset, presetId: value };
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
    ...presets.map((preset) => ({ label: preset.name, value: preset.id as string })),
  ];
  const value = selectedValueOf(
    settings.config.seeds.summarizePreset,
    presets.map((preset) => preset.id as string),
  );

  return (
    <Row gap="field" align="start" justify="between" className="flex-wrap">
      <Stack gap="tight">
        <Text voice="label">Utility preset</Text>
        <Text voice="gloss" className={PROSE_MEASURE}>
          The sampling summaries, extraction, captions and other background tasks run at. A preset here lends only its sampling settings, never its prompts.
        </Text>
      </Stack>
      <Select
        aria-label="Utility preset"
        items={items}
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
  );
}
