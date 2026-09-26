// The Home "Rosters" tile body: each saved roster, one press from a running chat (D263). It reads the
// picker's `rosterPreset.list` key, and an empty library never reaches it: the tile's `useVisible` hides it.

import { blobUrl } from "@orb/contracts/assets";
import type { RosterPresetSummary } from "@orb/contracts/roster-preset";
import { AvatarStack, avatarStackInlineSize } from "@orb/ui/avatar-stack";
import { Button } from "@orb/ui/button";
import { Icon, MessagesSquare } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { useStartRoster } from "../hooks/use-start-roster.ts";
import { rosterCountsSuffix } from "../lib/roster-copy.ts";
import { rosterScent } from "../lib/roster-model.ts";

// Faces a row spends before the "+N" chip: the chat rows' budget, so a roster and its room match.
const STACK_SLOTS = 4;

function RosterStartRow(props: {
  readonly roster: RosterPresetSummary;
  /** The stack slots every row's leading column reserves. */
  readonly leadingSlots: number;
  readonly busy: boolean;
  readonly onStart: (roster: RosterPresetSummary) => void;
}): ReactElement {
  const { roster, leadingSlots, busy, onStart } = props;
  return (
    <ListRow
      actions={
        // The name carries what the press applies (rules, group behavior): consent belongs on the control.
        <Button
          aria-label={`Start a chat with ${roster.name}${rosterCountsSuffix(roster.characterCount, roster.rules.length, roster.hasGroupConfig)}`}
          disabled={busy}
          intent="ghost"
          onClick={(): void => onStart(roster)}
          size="sm"
        >
          <Icon icon={MessagesSquare} size="sm" />
          Start
        </Button>
      }
      leading={
        <Row align="center" className="shrink-0" style={{ minInlineSize: avatarStackInlineSize(leadingSlots, "md") }}>
          <AvatarStack
            aria-label={roster.members.map((member) => member.name).join(", ")}
            items={roster.members.map((member) => ({ name: member.name, ...(member.avatarHash === null ? {} : { src: blobUrl(member.avatarHash) }) }))}
            max={STACK_SLOTS}
            size="md"
          />
        </Row>
      }
      // A roster saved from a room has no description; its census and names stand in.
      subtitle={roster.description === "" ? rosterScent(roster) : roster.description}
      subtitleStep="label"
      subtitleWrap={true}
      title={roster.name}
    />
  );
}

export function HomeRostersTileBody(): ReactElement {
  const trpc = useTRPC();
  const { data: rosters } = useSuspenseQuery(trpc.rosterPreset.list.queryOptions());
  const start = useStartRoster();
  // Every leading slot takes the widest stack's size, so the names share one left edge down the tile.
  const leadingSlots = Math.min(Math.max(1, ...rosters.map((roster) => roster.members.length)), STACK_SLOTS);
  return (
    // The tile frame's heading names the region, so the list stays unnamed.
    <Stack gap="tight" role="list">
      {rosters.map((roster) => (
        <Stack key={roster.id} role="listitem">
          <RosterStartRow busy={start.isPending} leadingSlots={leadingSlots} onStart={start.startRoster} roster={roster} />
        </Stack>
      ))}
    </Stack>
  );
}
