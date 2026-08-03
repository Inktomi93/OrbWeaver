// The regex collection's CONTEXT arm — "Where it runs" for the selected script.
//
// WHAT IT SHOWS AND WHY IT IS NOT THE MOCK'S FULL PANEL: workspace.html draws three attachment rosters
// ("Attached by presets · 2", "…by characters · 1", "…by rooms · 0"). The regex router has only the
// FORWARD lists (`listForPreset`/`listForCharacter`/`listForChat` — "what does THIS carrier attach"); the
// reverse "who attaches this script" is not a verb that exists, and inventing an N-query fan-out over
// every preset and character to fake it would be worse than saying the true thing. So the pane carries
// the one scope this library actually owns — the global toggle — plus the sentence that tells the reader
// where the other three live. The rosters are a SERVER verb away, not a layout away.
//
// AND THE GLOBAL SCOPE'S RUN ORDER (REGORDER). Global is an ORDERED tier, not a set: the resolver hands
// `executeRegexScripts` the global attachments in junction-`position` order and the executor applies them
// in order, so "which of my always-on scripts bites first" is data — and `regex.applyScopeOrder` shipped
// with no client caller at all. This is the pane where the global membership is decided, so it is the pane
// where its order is decided. The other three scopes author theirs in the shared picker, beside their own
// attach switches.

import type { RegexScriptRow } from "@orb/contracts/regex";
import { EmptyState } from "@orb/ui/empty-state";
import { Code, Icon } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { RegexScopeOrder } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { regexScriptTitle } from "#lib";
import { useAttachRegexGlobal, useDetachRegexGlobal } from "../hooks/use-regex-library";

export function RegexContextBody({ memberId }: { readonly memberId: string }): ReactElement {
  const trpc = useTRPC();
  const { data: scripts } = useSuspenseQuery(trpc.regex.listScripts.queryOptions());
  const { data: globals } = useSuspenseQuery(trpc.regex.listGlobal.queryOptions());
  const script = scripts.find((row) => row.id === memberId);
  if (script === undefined) {
    return <EmptyState description="This script was deleted. Pick another on the left." icon={<Icon icon={Code} size="lg" />} title="Script not found" />;
  }
  return <RegexScopePanel globals={globals} isGlobal={globals.some((row) => row.id === script.id)} script={script} />;
}

function RegexScopePanel({
  script,
  isGlobal,
  globals,
}: {
  readonly script: RegexScriptRow;
  readonly isGlobal: boolean;
  readonly globals: readonly RegexScriptRow[];
}): ReactElement {
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
        The one scope this library owns. The other three — a preset, a character, a room — attach this script from the thing it belongs to, so a script can run
        in one campaign without following you everywhere.
      </Text>
      {/* Only once there is an order to author: one global script has no run order, and a non-global
          script's pane has no business editing a tier it is not in. */}
      {isGlobal && globals.length > 1 ? (
        <Section kicker="Global run order">
          <Stack gap="field">
            <Text voice="gloss">First to last. Every always-on script runs in this order, on every message.</Text>
            <RegexScopeOrder
              renderItem={(row, index): ReactElement => <GlobalOrderRow current={row.id === script.id} position={index + 1} script={row} />}
              scope={GLOBAL_SCOPE}
              scripts={globals}
            />
          </Stack>
        </Section>
      ) : null}
    </Stack>
  );
}

/** The `applyScopeOrder` scope this pane writes — hoisted so a re-render never hands the order editor a
 *  fresh object identity for a value that never changes. */
const GLOBAL_SCOPE = { kind: "global" } as const;

/** One row of the global order: its position, its name, and — for the script this pane is about — the fact
 *  that it is the one you came here for. Without that marker the reader has to match names by eye to find
 *  out where their own script sits, which is the whole question the panel answers. */
function GlobalOrderRow({
  script,
  position,
  current,
}: {
  readonly script: RegexScriptRow;
  readonly position: number;
  readonly current: boolean;
}): ReactElement {
  return (
    <Row align="center" gap="field" justify="between">
      <Row align="center" className="min-w-0" gap="field">
        <Text as="span" voice="datum">
          {position}
        </Text>
        <Text as="span">{regexScriptTitle(script)}</Text>
      </Row>
      {current ? (
        <Text as="span" voice="gloss">
          this script
        </Text>
      ) : null}
    </Row>
  );
}
