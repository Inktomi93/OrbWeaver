// The regex collection's CONTEXT arm — "Where it runs" for the selected script.
//
// WHAT IT SHOWS AND WHY IT IS NOT THE MOCK'S FULL PANEL: workspace.html draws three attachment rosters
// ("Attached by presets · 2", "…by characters · 1", "…by rooms · 0"). The regex router has only the
// FORWARD lists (`listForPreset`/`listForCharacter`/`listForChat` — "what does THIS carrier attach"); the
// reverse "who attaches this script" is not a verb that exists, and inventing an N-query fan-out over
// every preset and character to fake it would be worse than saying the true thing. So the pane carries
// the one scope this library actually owns — the global toggle — plus the sentence that tells the reader
// where the other three live. The rosters are a SERVER verb away, not a layout away.

import type { RegexScriptRow } from "@orb/contracts/regex";
import { EmptyState } from "@orb/ui/empty-state";
import { Code, Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useInvalidation, useTRPC } from "#data";
import { useAttachRegexGlobal, useDetachRegexGlobal } from "../hooks/use-regex-library";
import { regexScriptTitle } from "../lib/regex-model";

export function RegexContextBody({ memberId }: { readonly memberId: string }): ReactElement {
  const trpc = useTRPC();
  const { data: scripts } = useSuspenseQuery(trpc.regex.listScripts.queryOptions());
  const { data: globals } = useSuspenseQuery(trpc.regex.listGlobal.queryOptions());
  const script = scripts.find((row) => row.id === memberId);
  if (script === undefined) {
    return <EmptyState description="This script was deleted. Pick another on the left." icon={<Icon icon={Code} size="lg" />} title="Script not found" />;
  }
  return <RegexScopePanel isGlobal={globals.some((row) => row.id === script.id)} script={script} />;
}

function RegexScopePanel({ script, isGlobal }: { readonly script: RegexScriptRow; readonly isGlobal: boolean }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const attach = useAttachRegexGlobal({ trpc, invalidation });
  const detach = useDetachRegexGlobal({ trpc, invalidation });

  return (
    <Stack className="p-field" gap="block" data-slot="regex-context-body">
      <Row align="center" gap="field" justify="between">
        <Text as="span" voice="label">
          Runs in every chat
        </Text>
        <Switch
          aria-label={`${regexScriptTitle(script)} runs in every chat`}
          checked={isGlobal}
          onCheckedChange={(checked): void => {
            if (checked) {
              void attach.mutateAsync({ scriptId: script.id });
            } else {
              void detach.mutateAsync({ scriptId: script.id });
            }
          }}
        />
      </Row>
      <Text voice="gloss">
        The one scope this library owns. The other three — a preset, a character, a room — attach this script from the thing it belongs to, so a script can
        run in one campaign without following you everywhere.
      </Text>
    </Stack>
  );
}
