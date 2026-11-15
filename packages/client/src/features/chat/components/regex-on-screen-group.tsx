// `ON SCREEN` — the last group of the room's Regex section: every display script running on this viewer's
// transcript here, in the order it runs, each with where it comes from.
//
// THE LIST IS THE SERVER'S (`regex.listDisplayScripts`, through `#data`'s `useDisplayEntries`). A display script
// runs where it is attached: the room's tiers under the host, then the viewer's own globals last. A member gets
// the room's tiers only while the host shares them, so the gloss says which case this viewer is in, and each row
// says whose script it is. The tier groups above list the same scripts for their prompt pass; this roster is the
// one that answers "why does my screen look like this".
//
// THE HOST'S SHARING SWITCH LIVES HERE (§2, §3), host-only: a member's group omits it (§8.1 permission-OMIT).
//
// ONLY YOUR OWN ROWS CARRY A SWITCH. A row from the room is the host's library row for a member: you cannot flip
// someone else's library flag, and a control that looked operable and was not is the affordance lie the sibling
// racks exist to correct. The server's list holds only enabled scripts, so your own switched-off display scripts
// are appended with the `Off` mark, each at the place it would run from: a flip here is reversible here.
//
// A STOPPED SCRIPT IS MARKED, NOT HIDDEN. The display pass stops a script that overruns its time on this device for
// the rest of the session; its row keeps its place and says so, because a script silently missing from a list
// that claims to be what runs is the defect this roster exists to prevent.

import type { RegexDisplayEntry, RegexDisplaySource, RegexTierKey } from "@orb/contracts/chat";
import { parseCharacterRegexTierKey, REGEX_VIEWER_SOURCE } from "@orb/contracts/chat";
import type { RegexScriptRow } from "@orb/contracts/regex";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { BookOpen, Icon } from "@orb/ui/icons";
import { InlineToken } from "@orb/ui/inline-token";
import { Row, Section, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { MenuItem } from "@orb/ui/menu";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { MutedLine, RegexAxesGlyphs, RowActionsMenu } from "#components";
import { roomRosterOptions, useDisplayEntries, useInvalidation, useSuspenseQuery, useTRPC } from "#data";
import { ROW_MORE_LEAD, regexScriptTitle, rowActionSubject, rowQualifiers, timeLib } from "#lib";
import { openConfigTo, selectCollectionMember } from "#state";
import { useSetRegexScriptEnabled } from "../hooks/use-chat-regex-mutations.ts";
import { useIsDisplayScriptStopped } from "../hooks/use-display-text.ts";
import { REGEX_OFF_MARK, REGEX_ON_SCREEN_LIST, regexScriptEverywhereSwitchName, regexTierKicker } from "../lib/regex-section-model.ts";
import { HostDisplayScriptsControl } from "./host-display-scripts-control.tsx";

/** The config group the script library lives in — the `⋯ → Open in library` destination (#1725). */
const REGEX_COLLECTION = "regex";

/** A row's source word for the viewer's own scripts. */
const YOURS = "yours";

/** The mark and its spoken reason on a script the display pass stopped. */
const STOPPED_MARK = "Stopped";
const STOPPED_REASON = "It took too long to run on this device and is stopped until you reload.";

export interface RegexOnScreenGroupProps {
  readonly chatId: ChatId;
  readonly isHost: boolean;
  /** The room's tier names the host's section already resolved (the preset's name above all). A member passes an
   *  empty map; seat names come from the roster either way. */
  readonly labels: ReadonlyMap<RegexTierKey, string>;
  /** The viewer's own switched-off display scripts, at the place each would run from once switched back on: the
   *  host's from the room's tiers (`regexSwitchedOffDisplay`), a member's from their globals. */
  readonly switchedOff: readonly RegexDisplayEntry[];
}

export function RegexOnScreenGroup({ chatId, isHost, labels, switchedOff }: RegexOnScreenGroupProps): ReactElement {
  const trpc = useTRPC();
  const entries = useDisplayEntries(chatId);
  const { data: owned } = useSuspenseQuery(trpc.regex.listScripts.queryOptions());
  const { data: chat } = useSuspenseQuery(roomRosterOptions(trpc, { chatId }));
  const isStopped = useIsDisplayScriptStopped();
  const ownedIds = new Set(owned.map((script) => script.id));
  const rows: readonly RegexDisplayEntry[] = [...entries, ...switchedOff];
  const names = withSeatNames(labels, rows, chat.participants);
  // Two scripts can share a title, and a row's switch and menu then announce one name for two rows: the qualifier is resolved with the whole roster in hand.
  const qualifiers = rowQualifiers(
    rows.map((row) => ({ name: regexScriptTitle(row.script), at: row.script.updatedAt })),
    timeLib.formatRelative,
    timeLib.formatDateTime,
  );
  return (
    <Section data-slot="regex-on-screen" kicker={REGEX_ON_SCREEN_LIST}>
      <Text voice="gloss">{rosterGloss(isHost, chat.hostDisplayScripts)}</Text>
      {rows.length === 0 ? (
        <MutedLine>No display scripts are running on your transcript here.</MutedLine>
      ) : (
        <Stack gap="tight" role="list">
          {rows.map((row, index) => (
            <Stack key={row.script.id} role="listitem">
              <DisplayScriptRow
                isYours={ownedIds.has(row.script.id)}
                qualifier={qualifiers[index]}
                script={row.script}
                source={sourceWords(row.from, isHost, names)}
                stopped={isStopped(row.script)}
              />
            </Stack>
          ))}
        </Stack>
      )}
      {isHost ? <HostDisplayScriptsControl chatId={chatId} /> : null}
    </Section>
  );
}

/** What the roster is, for this viewer. A member's case turns on whether the host shares the room's scripts. */
function rosterGloss(isHost: boolean, shared: boolean): string {
  if (isHost) {
    return "What changes your screen here, in the order it runs: the scripts attached to this room. Members see them only while you share them below.";
  }
  return shared
    ? "What changes your screen here, in the order it runs: the host's scripts for this room, then your own Everywhere scripts."
    : "What changes your screen here: your own Everywhere scripts. The host isn't sharing this room's scripts.";
}

/** The tier names, with each character tier the entries carry named from the roster by its own seat id. */
function withSeatNames(
  labels: ReadonlyMap<RegexTierKey, string>,
  entries: readonly RegexDisplayEntry[],
  participants: readonly { readonly characterId: CharacterId | null; readonly displayName: string }[],
): ReadonlyMap<RegexTierKey, string> {
  const names = new Map(labels);
  for (const { from } of entries) {
    if (from === REGEX_VIEWER_SOURCE || names.has(from)) {
      continue;
    }
    const characterId = parseCharacterRegexTierKey(from);
    const seat = characterId === null ? undefined : participants.find((participant) => participant.characterId === characterId);
    if (seat !== undefined) {
      names.set(from, seat.displayName);
    }
  }
  return names;
}

/** Whose script a row is and where it runs from. A member reads the room's tiers as the host's. */
function sourceWords(from: RegexDisplaySource, isHost: boolean, names: ReadonlyMap<RegexTierKey, string>): string {
  if (from === REGEX_VIEWER_SOURCE) {
    return `${YOURS} · Everywhere`;
  }
  const tier = regexTierKicker(from, names);
  return isHost ? tier : `the host’s · ${tier}`;
}

/** One display-pass row: name · axes · pattern · source, and for the viewer's own script the library switch. */
function DisplayScriptRow({
  isYours,
  qualifier,
  script,
  source,
  stopped,
}: {
  readonly isYours: boolean;
  /** The disambiguator the row's switch and menu carry beside its name (`rowQualifiers`). */
  readonly qualifier: string | undefined;
  readonly script: RegexScriptRow;
  readonly source: string;
  readonly stopped: boolean;
}): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const setEnabled = useSetRegexScriptEnabled({ trpc, invalidation });
  const name = regexScriptTitle(script);
  const subject = rowActionSubject(name, qualifier);
  const pattern = script.findRegex.trim() === "" ? "no pattern yet" : script.findRegex.trim();
  return (
    <ListRow
      markers={<RowMarks enabled={script.enabled} stopped={stopped} />}
      {...(isYours
        ? {
            actions: (
              <>
                {/* The same "everywhere" setting as a tier row's switch, because it is the same flag on the same
                    library row; the list word keeps the two switches of a script drawn in both places apart. */}
                <Switch
                  aria-label={regexScriptEverywhereSwitchName(subject, REGEX_ON_SCREEN_LIST)}
                  checked={script.enabled}
                  onCheckedChange={(next): void => {
                    setEnabled.mutate({ scriptId: script.id, input: { enabled: next } });
                  }}
                  tone="quiet"
                />
                <RowActionsMenu label={`${ROW_MORE_LEAD} ${subject}: Open in library`}>
                  <MenuItem
                    onClick={(): void => {
                      openConfigTo(REGEX_COLLECTION);
                      selectCollectionMember(REGEX_COLLECTION, script.id);
                    }}
                  >
                    <Icon icon={BookOpen} size="sm" />
                    Open in library
                  </MenuItem>
                </RowActionsMenu>
              </>
            ),
          }
        : {})}
      subtitle={`${pattern} · ${source}`}
      subtitleLead={<RegexAxesGlyphs passes={script.passes} targets={script.targets} />}
      subtitlePlacement="inline"
      title={name}
    />
  );
}

/** The title-line marks. The stopped reason rides an sr-only line beside the visible word, the tier row's shape
 *  for a compressed mark whose sentence is the datum. */
function RowMarks({ enabled, stopped }: { readonly enabled: boolean; readonly stopped: boolean }): ReactElement | null {
  if (enabled && !stopped) {
    return null;
  }
  return (
    <Row align="center" gap="tight">
      {enabled ? null : <InlineToken>{REGEX_OFF_MARK}</InlineToken>}
      {stopped ? (
        <>
          <InlineToken tone="warning">{STOPPED_MARK}</InlineToken>
          <Text as="span" className="sr-only">
            {STOPPED_REASON}
          </Text>
        </>
      ) : null}
    </Row>
  );
}
