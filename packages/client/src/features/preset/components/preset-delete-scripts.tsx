// The preset delete confirm's list of the regex scripts only that preset uses, each checked to go with it. A script
// another preset, a character, a room or the global tier uses is never listed: the server's `listPresetOnly` read
// leaves it out, and the delete keeps it even if a stale list named it. While the read settles, or when the preset
// holds no script of its own, the confirm carries no list.

import type { PresetId, RegexScriptId } from "@orb/kit/ids";
import { Checkbox } from "@orb/ui/checkbox";
import { Field } from "@orb/ui/field";
import { Stack } from "@orb/ui/layout";
import { ScrollArea } from "@orb/ui/scroll-area";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { regexScriptTitle } from "#lib";
import { PRESET_DELETE_SCRIPTS_REGION_NAME, presetDeleteScriptsLead } from "../lib/preset-names.ts";

export interface PresetDeleteScriptsProps {
  readonly presetId: PresetId;
  /** The scripts the owner unchecked: they stay in the library. */
  readonly kept: ReadonlySet<RegexScriptId>;
  readonly onToggle: (id: RegexScriptId) => void;
}

export function PresetDeleteScripts({ presetId, kept, onToggle }: PresetDeleteScriptsProps): ReactElement | null {
  const trpc = useTRPC();
  const scripts = useQuery(trpc.regex.listPresetOnly.queryOptions({ presetId })).data;
  if (scripts === undefined || scripts.length === 0) {
    return null;
  }
  return (
    <Stack data-slot="preset-delete-scripts" gap="row">
      <Text voice="gloss">{presetDeleteScriptsLead(scripts.length)}</Text>
      <ScrollArea
        contentFull={true}
        maxHeight="scrollSm"
        viewportProps={{ role: "region", "aria-label": PRESET_DELETE_SCRIPTS_REGION_NAME }}
        wrapContent={true}
      >
        {/* The inline-end inset holds each checkbox's touch-target hit area inside the scroller, so the list never scrolls sideways. */}
        <Stack gap="row" paddingInlineEnd="block">
          {scripts.map((script) => (
            <Field key={script.id} label={regexScriptTitle(script)} orientation="inline">
              <Checkbox checked={!kept.has(script.id)} onCheckedChange={(): void => onToggle(script.id)} />
            </Field>
          ))}
        </Stack>
      </ScrollArea>
    </Stack>
  );
}
