// `ON SCREEN` — the last group of the room's Regex section: every display script running on this viewer's
// transcript here, in the order it runs, each with where it comes from.
//
// THE LIST IS THE SERVER'S (`regex.listDisplayScripts`, through `#data`'s `useDisplayEntries`). A display script
// runs where it is attached: the room's tiers under the host, then the viewer's own globals last. A member gets
// the room's tiers unless the host switches sharing off; a room whose host never touched the switch shares. The gloss
// says which case this viewer is in, and each row says whose script it is. A member's row shows every field it is
// sent, the pattern included: the member's browser needs the pattern to run the script, so hiding it here would hide
// nothing. The tier groups above list the same scripts for their prompt pass; this roster is the one that answers
// "why does my screen look like this".
//
// THE HOST'S SHARING SWITCH LIVES HERE (§2, §3), host-only: a member's group omits it (§8.1 permission-OMIT). It
// reads on until the host switches it off.
//
// ONLY YOUR OWN ROWS CARRY A SWITCH. A row from the room is the host's library row for a member: you cannot flip
// someone else's library flag, and a control that looked operable and was not is the affordance lie the sibling
// racks exist to correct. The server's list holds only what runs, so the scripts that are attached but held off are
// appended with the `Off` mark, each at the place it would run from: your own switched-off ones, so a flip here is
// reversible here, and for the host a script a tier lever or the room's master holds off, with the switch named.
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
import type { ReactElement, ReactNode } from "react";
import { useEffect, useRef } from "react";
import { MutedLine, RegexAxesGlyphs, RowActionsMenu } from "#components";
import { roomRosterOptions, useDisplayEntries, useInvalidation, useSuspenseQuery, useTRPC } from "#data";
import type { StoppedDisplayScript } from "#lib";
import { ROW_MORE_LEAD, regexScriptTitle, rowActionSubject, rowQualifiers, timeLib } from "#lib";
import { clearRegexRowRequest, openConfigTo, selectCollectionMember, useRequestedRegexRow } from "#state";
import { useSetRegexScriptEnabled } from "../hooks/use-chat-regex-mutations.ts";
import { useDisplayScriptStop } from "../hooks/use-display-text.ts";
import type { RegexRosterOff, RegexRosterOffEntry } from "../lib/regex-section-model.ts";
import {
  REGEX_OFF_MARK,
  REGEX_ON_SCREEN_LIST,
  regexRosterOffReason,
  regexScriptEverywhereSwitchName,
  regexTierKicker,
  regexTierLever,
} from "../lib/regex-section-model.ts";
import { REGEX_BROWSER_STOPPED_MARK, REGEX_BROWSER_STOPPED_REASON, REGEX_NOT_APPLIED_MARK, regexNotAppliedReason } from "../lib/regex-stop-copy.ts";
import { HostDisplayScriptsControl } from "./host-display-scripts-control.tsx";

/** The config group the script library lives in — the `⋯ → Open in library` destination (#1725). */
const REGEX_COLLECTION = "regex";

/** A row's source word for the viewer's own scripts. */
const YOURS = "yours";

export interface RegexOnScreenGroupProps {
  readonly chatId: ChatId;
  readonly isHost: boolean;
  /** The room's tier names the host's section already resolved (the preset's name above all). A member passes an
   *  empty map; seat names come from the roster either way. */
  readonly labels: ReadonlyMap<RegexTierKey, string>;
  /** The display scripts that are attached but not on screen, at the place each would run from, with the switch that
   *  holds it: the host's from the room's tiers (`regexSwitchedOffDisplay`), a member's own from their globals. */
  readonly switchedOff: readonly RegexRosterOffEntry[];
}

export function RegexOnScreenGroup({ chatId, isHost, labels, switchedOff }: RegexOnScreenGroupProps): ReactElement {
  const trpc = useTRPC();
  const entries = useDisplayEntries(chatId);
  const { data: owned } = useSuspenseQuery(trpc.regex.listScripts.queryOptions());
  const { data: chat } = useSuspenseQuery(roomRosterOptions(trpc, { chatId }));
  const stopOf = useDisplayScriptStop();
  const requestedRow = useRequestedRegexRow();
  const ownedIds = new Set(owned.map((script) => script.id));
  const rows: readonly (RegexDisplayEntry & { readonly off?: RegexRosterOff })[] = [...entries, ...switchedOff];
  const names = withSeatNames(labels, rows, chat.participants);
  const listsRequestedRow = requestedRow !== null && rows.some((row) => row.script.id === requestedRow);
  // The roster's read has settled by the time it renders, so a request for a script it does not list never will match.
  useEffect(() => {
    if (requestedRow !== null && !listsRequestedRow) {
      clearRegexRowRequest();
    }
  }, [requestedRow, listsRequestedRow]);
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
            <RosterItem key={row.script.id} requested={row.script.id === requestedRow}>
              <DisplayScriptRow
                isYours={ownedIds.has(row.script.id)}
                offReason={row.off === undefined || row.from === REGEX_VIEWER_SOURCE ? null : regexRosterOffReason(row.off, regexTierLever(row.from, names))}
                qualifier={qualifiers[index]}
                script={row.script}
                source={sourceWords(row.from, isHost, names)}
                stop={stopOf(row.script)}
              />
            </RosterItem>
          ))}
        </Stack>
      )}
      {isHost ? <HostDisplayScriptsControl chatId={chatId} /> : null}
    </Section>
  );
}

/** One roster row's list item. A request for this script's row (the stopped-script notice's action) lands here: the row
 *  scrolls to the middle of the pane and takes focus, so the reader is on the row the notice named, not above or below it. */
function RosterItem({ requested, children }: { readonly requested: boolean; readonly children: ReactNode }): ReactElement {
  const node = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!requested) {
      return;
    }
    node.current?.scrollIntoView({ block: "center" });
    node.current?.focus({ preventScroll: true });
    clearRegexRowRequest();
  }, [requested]);
  return (
    <Stack focusTarget={true} ref={node} role="listitem" tabIndex={-1}>
      {children}
    </Stack>
  );
}

/** What the roster is, for this viewer, and whether the room's scripts reach the members. */
function rosterGloss(isHost: boolean, shared: boolean): string {
  if (isHost) {
    return shared
      ? "What changes your screen here, in the order it runs: the scripts attached to this room. Everyone in the room sees them too, with their patterns, unless you switch sharing off below."
      : "What changes your screen here, in the order it runs: the scripts attached to this room. Sharing is off, so they change only your screen.";
  }
  return shared
    ? "What changes your screen here, in the order it runs: the host's scripts for this room, then your own Everywhere scripts."
    : "What changes your screen here: your own Everywhere scripts. The host switched off sharing this room's scripts.";
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

/** One display-pass row: the name, then the axes and whose script it is and which tier it runs from, then the pattern
 *  and any stop with its reason; for the viewer's own script, the library switch. The source line answers why the
 *  screen looks as it does, so it never shares a line with the pattern, which is the part that may truncate. */
function DisplayScriptRow({
  isYours,
  offReason,
  qualifier,
  script,
  source,
  stop,
}: {
  readonly isYours: boolean;
  /** The room switch that holds this script off screen, in words, or `null` when none does. */
  readonly offReason: string | null;
  /** The disambiguator the row's switch and menu carry beside its name (`rowQualifiers`). */
  readonly qualifier: string | undefined;
  readonly script: RegexScriptRow;
  readonly source: string;
  readonly stop: StoppedDisplayScript | undefined;
}): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const setEnabled = useSetRegexScriptEnabled({ trpc, invalidation });
  const name = regexScriptTitle(script);
  const subject = rowActionSubject(name, qualifier);
  const pattern = script.findRegex.trim() === "" ? "no pattern yet" : script.findRegex.trim();
  const off = !script.enabled || offReason !== null;
  return (
    <ListRow
      // Only a row with a mark passes one: an empty markers box still takes its gap from the title line.
      {...(off || stop !== undefined ? { markers: <RowMarks off={off} stop={stop} /> } : {})}
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
      detail={<RowDetail offReason={offReason} pattern={pattern} stop={stop} />}
      subtitle={source}
      subtitleLead={<RegexAxesGlyphs passes={script.passes} targets={script.targets} />}
      subtitleWrap={true}
      title={name}
    />
  );
}

/** The title-line marks; a stop's reason is the row's detail, in words. */
function RowMarks({ off, stop }: { readonly off: boolean; readonly stop: StoppedDisplayScript | undefined }): ReactElement {
  return (
    <Row align="center" gap="tight">
      {off ? <InlineToken>{REGEX_OFF_MARK}</InlineToken> : null}
      {stop === undefined ? null : <StopMark stop={stop} />}
    </Row>
  );
}

// A browser stop and a server one read differently because the next step differs: a browser stop lifts at a
// reload, which does not fix it, and a server one holds until the pattern is fixed.
function StopMark({ stop }: { readonly stop: StoppedDisplayScript }): ReactElement {
  const mark = stop.side === "browser" ? REGEX_BROWSER_STOPPED_MARK : REGEX_NOT_APPLIED_MARK;
  return <InlineToken tone="warning">{mark}</InlineToken>;
}

/** Under the source: the pattern on one truncating line, then the room switch holding it off and a stop's reason, in
 *  full. */
function RowDetail({
  offReason,
  pattern,
  stop,
}: {
  readonly offReason: string | null;
  readonly pattern: string;
  readonly stop: StoppedDisplayScript | undefined;
}): ReactElement {
  return (
    <>
      <Text cap="fit" data-slot="regex-on-screen-pattern" truncate={true} voice="gloss">
        {pattern}
      </Text>
      {offReason === null ? null : (
        <Text data-slot="regex-on-screen-off-reason" voice="gloss">
          {offReason}
        </Text>
      )}
      {stop === undefined ? null : (
        <Text data-slot="regex-on-screen-stop-reason" tone="warning" voice="gloss">
          {stop.side === "browser" ? REGEX_BROWSER_STOPPED_REASON : regexNotAppliedReason(stop.cause, stop.pass)}
        </Text>
      )}
    </>
  );
}
