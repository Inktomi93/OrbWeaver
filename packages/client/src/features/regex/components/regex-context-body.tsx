// The regex collection's CONTEXT arm — "Where it’s attached" for the selected script.
//
// IT IS ABOUT SCOPES, AND THE BAND NOW SAYS SO (side-eye 2026-08-19). The band read "Where it runs", which
// is one preposition away from the EDITOR's `Runs on` field — and those two decide orthogonal things: the
// field picks which TEXT STREAMS a script rewrites, this pane which SCOPES it is attached from. The band
// was re-headed to the vocabulary this pane's own copy already uses ("Runs in every chat", "Attached by
// presets · 2"); `regex-collection.tsx` records the fork.
//
// THE FOUR SCOPES, EACH IN ITS OWN VOICE (workspace.html's context column). The GLOBAL scope is a SWITCH:
// it is a property of the script (`global_regex_scripts` PKs on the script id) and this library owns it, so
// this pane decides it — and since 2026-08-19 it is the ONLY pane that does. The list row carried a
// second, live copy of this same switch (side-eye P2: two controls for one fact, ~990px apart on one
// screen, no confirm, no undo — a reviewer flipped one by accident driving the pane), and the orchestrator
// ruled that this pane keeps it. `regex-collection-rows.tsx`'s header records the row's side of that fork,
// including why the "a row reserves what its list declares" ruling recorded there SURVIVES the change.
// Do not restore a row-level attach control without re-opening that fork.
//
// The other three are LISTS: a preset, a character and a room each attach from the
// thing they belong to, so this pane can only REPORT them — "Attached by presets · 2" over the two names.
// The read behind them is `regex.listScriptUsage` (REGROSTER), the reverse of the forward `listFor*` lists;
// until it existed the pane shipped an honest sentence pointing at the three carriers instead, because
// faking the answer would have meant an N-query fan-out over every preset and character the owner has.
//
// A LIST ROW IS A NAME, NOT A LINK. There is no door from here to a preset/character/room member — the
// existing `openConfigTo` intent only opens a config COLLECTION, and none of these three is one. A row
// that looked clickable and wasn't would be worse than a row that reads as what it is: a statement of where
// this script already runs. An EMPTY list still renders (with its `· 0` and the line saying where to
// attach one) — omitting it would read as "not built", not as "none yet".
//
// AND THE GLOBAL SCOPE'S RUN ORDER (REGORDER). Global is an ORDERED tier, not a set: the resolver hands
// `executeRegexScripts` the global attachments in junction-`position` order and the executor applies them
// in order, so "which of my always-on scripts bites first" is data — and `regex.applyScopeOrder` shipped
// with no client caller at all. This is the pane where the global membership is decided, so it is the pane
// where its order is decided. The other three scopes author theirs in the shared picker, beside their own
// attach switches.

import type { VisibleRoomRef } from "@orb/contracts/chat";
import type { RegexAttachmentRef, RegexScriptRow } from "@orb/contracts/regex";
import type { CharacterId, PresetId } from "@orb/kit/ids";
import { EmptyState } from "@orb/ui/empty-state";
import type { LucideIcon } from "@orb/ui/icons";
import { Code, Icon, MessagesSquare, SlidersHorizontal, Users } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef } from "react";
import { RegexScopeOrder, SettingSwitchRow } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { deriveChatTitle, regexScriptTitle, rowQualifiers, timeLib } from "#lib";
import { useAttachRegexGlobal, useDetachRegexGlobal } from "../hooks/use-regex-library.ts";

export function RegexContextBody({ memberId }: { readonly memberId: string }): ReactElement {
  const trpc = useTRPC();
  const { data: scripts } = useSuspenseQuery(trpc.regex.listScripts.queryOptions());
  const { data: globals } = useSuspenseQuery(trpc.regex.listGlobal.queryOptions());
  const script = scripts.find((row) => row.id === memberId);
  if (script === undefined) {
    // @orb-waive empty-state-has-action(EmptyState): the regex CONTEXT pane's GONE arm — the script was deleted while its context was open. The next step is picking another row in the sibling roster, which is on screen; the member-editor twin, same species. Ends if the context pane can be shown without its sibling roster.
    return <EmptyState description="This script was deleted. Pick another from the list." icon={<Icon icon={Code} size="lg" />} title="Script not found" />;
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
  // Keyed on the RESOLVED script id, so the lists can never belong to the previously-selected row. Rides
  // the `regexChanged` bus row (invalidation.ts path-invalidates the whole regex router), so an attach or
  // detach made anywhere — this device or another — repaints these lists.
  const { data: usage } = useSuspenseQuery(trpc.regex.listScriptUsage.queryOptions({ scriptId: script.id }));
  const invalidation = useInvalidation();
  const attach = useAttachRegexGlobal({ trpc, invalidation });
  const detach = useDetachRegexGlobal({ trpc, invalidation });
  const globalAdmission = useRef(false);

  const onGlobalChange = (checked: boolean): void => {
    if (globalAdmission.current) {
      return;
    }
    globalAdmission.current = true;
    const release = (): void => {
      globalAdmission.current = false;
    };
    if (checked) {
      attach.mutate({ scriptId: script.id }, { onSettled: release });
    } else {
      detach.mutate({ scriptId: script.id }, { onSettled: release });
    }
  };

  return (
    // `padding="block"` — the same inset its sibling arm (`BookAttachments`) uses, so one context slot has
    // one edge (side-eye 2026-08-03 P3, the two-grammars finding).
    <Stack data-slot="regex-context-body" gap="block" padding="block">
      {/* THE HOUSE SWITCH ROW, NOT A FOURTH HAND-ROLL (#980 F22). This was a bare
          `<Row justify="between">` + a sibling gloss paragraph — the same orientation `SettingSwitchRow`
          ships (label left, control right) drawn a different way, which is mechanism drift rather than
          visual drift and is exactly how two rows end up disagreeing later. Routing it through the shared
          row buys three things it did not have: the label is a real `Field.Label`, so clicking the words
          toggles the switch; the gloss becomes the `description`, which is `aria-describedby`-wired and
          reading-measure capped instead of running the pane's full width; and the row answers to the same
          `FieldLayout` an Appearance settings row does.
          The accessible name loses the script's own title (it was "<script> runs in every chat"): a
          `Field` label IS the control's name, this pane is that script's context arm, and the head band
          above it states the subject — a name that repeats it is the name-and-mark weld #1214-1 records. */}
      <SettingSwitchRow
        checked={isGlobal}
        description="The one scope this library owns — the other three attach this script from the thing it belongs to."
        disabled={attach.isPending || detach.isPending}
        label="Runs in every chat"
        onChange={onGlobalChange}
      />
      {/* THE SCOPE IS MOOT WHEN THE SCRIPT RUNS ON NOTHING (side-eye 2026-08-03 P2). This pane's entire job
          is "where does this script run", and with `placement: []` the honest answer is nowhere — no amount
          of attaching changes that. Said here as well as on the row and in the editor, because this is the
          pane a reader opens to ask the question. */}
      {script.placement.length === 0 ? (
        <Text className="text-destructive" voice="label">
          This script has no “Runs on” stream selected, so it will not run in any of these scopes. Pick one in the editor.
        </Text>
      ) : null}
      <AttachmentList
        emptyText="No preset attaches this script yet. Open a preset's Regex tab to attach it there."
        glyph={SlidersHorizontal}
        noun="presets"
        rows={usage.presets}
      />
      <AttachmentList
        emptyText="No character attaches this script yet. Open a character's Regex field to attach it there."
        glyph={Users}
        noun="characters"
        rows={usage.characters}
      />
      <RoomList rooms={usage.rooms} />
      {/* THE LISTS LEAD, THE ORDER FOLLOWS (side-eye 2026-08-03 P2 "panel burial"). The order editor used
          to sit directly under the global switch: at the owner's 34 global scripts its 34 rows pushed
          "Attached by presets / characters / rooms" ~1400px below the fold, in a panel whose entire stated
          job is telling you where this script runs. The three lists ARE that answer and they are bounded
          (a script is attached by a handful of carriers); the order list is unbounded in the library's size,
          so it goes last. Still gated: one global script has no run order, and a non-global script's pane
          has no business editing a tier it is not in. */}
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

/**
 * ONE reverse list — "Attached by <noun> · N" over the carrier names, or the honest none-yet line.
 *
 * The COUNT rides in the kicker rather than a badge because the count IS part of the section's name here:
 * "Attached by rooms · 0" is a complete statement, where a bare "Attached by rooms" over an empty box asks
 * the reader whether the list failed to load. The empty arm keeps the section — an omitted section reads as
 * a surface that was never built, not as a scope with nothing in it.
 *
 * The glyph is `aria-hidden` (Icon's default): the noun is already in the section heading the row sits
 * under, so announcing it per row would say "presets" three times before each name.
 */
function AttachmentList({
  noun,
  glyph,
  rows,
  emptyText,
}: {
  readonly noun: string;
  readonly glyph: LucideIcon;
  readonly rows: readonly RegexAttachmentRef<PresetId | CharacterId>[];
  readonly emptyText: string;
}): ReactElement {
  return (
    <Section data-slot={`regex-usage-${noun}`} kicker={`Attached by ${noun} · ${rows.length}`}>
      {rows.length === 0 ? (
        <Text voice="gloss">{emptyText}</Text>
      ) : (
        <Stack gap="tight">
          {rows.map((row) => (
            // `min-w-0` + `truncate`: this pane is the config rail's 320px context column, and a long
            // preset name must clip inside it rather than push the list past its own edge.
            <Row align="center" className="min-w-0" gap="field" key={row.id}>
              <Icon icon={glyph} size="xs" />
              <Text as="span" className="truncate" title={row.name}>
                {row.name}
              </Text>
            </Row>
          ))}
        </Stack>
      )}
    </Section>
  );
}

/**
 * THE ROOM LIST — the same list, one rung richer, because a chat is not named the way a preset is.
 *
 * A preset and a character each HAVE a name. A room's title is a fallback CHAIN, and this list used to
 * implement only two of its three rungs server-side: every room nobody had renamed read "Untitled chat",
 * which named nobody and, at three unnamed rooms, produced three identical rows. The chats list two panes
 * over calls the same rooms by their characters. `deriveChatTitle` is that chain's ONE home (it moved into `#lib`
 * for this), so the list now runs it instead of receiving someone else's answer.
 *
 * AND THE STAMP, for the reason titling by character names CREATES: "Nate, Niko" is a perfectly good title for three
 * different rooms. `rowQualifiers` is the house answer to exactly that collision on exactly this data (it
 * disambiguates the chats list, whose N rows titled "Azarael" are the same shape), escalating only where it
 * must — the short relative form when the rooms are distinguishable by it, the absolute date-time when they
 * are not, an ordinal when nothing on screen can tell them apart. So a room row here reads the way a chats
 * row does: who is in it, and when it last moved.
 */
function RoomList({ rooms }: { readonly rooms: readonly VisibleRoomRef[] }): ReactElement {
  const stamps = rowQualifiers(
    rooms.map((room) => ({ name: deriveChatTitle(room.title, room.participantNames), at: room.at })),
    timeLib.formatRelativeCompact,
    timeLib.formatDateTime,
  );
  return (
    <Section data-slot="regex-usage-rooms" kicker={`Attached by rooms · ${rooms.length}`}>
      {rooms.length === 0 ? (
        <Text voice="gloss">No room attaches this script yet. Open a chat's This-chat panel to attach it there.</Text>
      ) : (
        <Stack gap="tight">
          {rooms.map((room, index) => {
            const title = deriveChatTitle(room.title, room.participantNames);
            const stamp = stamps[index] ?? "";
            return (
              // The stamp is `shrink-0` and the title takes the squeeze — this pane is the config rail's
              // 320px context column, so the datum that must never wrap is the short one.
              <Row align="center" className="min-w-0" gap="field" key={room.id}>
                <Icon icon={MessagesSquare} size="xs" />
                <Text as="span" className="truncate" title={title}>
                  {title}
                </Text>
                <Text as="span" className="shrink-0" voice="datum">
                  {stamp}
                </Text>
              </Row>
            );
          })}
        </Stack>
      )}
    </Section>
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
