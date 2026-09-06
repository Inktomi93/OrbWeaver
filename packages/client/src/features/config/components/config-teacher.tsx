// The TEACHER's render half (config-revamp-design.md §3.5/§7.2, #866 S3) — the bracket band and the three
// tab bodies over the RESOLVED `ConfigContextState` (the host already flattened focus × registries into
// display data; nothing here re-resolves).
//
// ABOUT HAS TWO ARMS AND THE STATE PICKS (#926, the owner's PS5 ruling — the one-setting-at-a-time model
// this pane was built on was rejected verbatim): a non-empty `roster` is the AT-REST body, one entry per
// setting row the reader can currently SEE; an empty one is the drilled row's own lesson (definition ·
// value · affects · related doors), which is also what an open member and a leafless section get.
// Applies is where a narrower scope wins — and for an OPEN collection member it IS that collection's own
// context arm (its "where it's attached" answer, unchanged contract); Learn renders only when a
// contribution supplied one. Both tabs' APPLICABILITY (`when`) lives in `config-teacher-tabs.tsx`.

import { Button } from "@orb/ui/button";
import { EmptyState } from "@orb/ui/empty-state";
import type { LucideIcon } from "@orb/ui/icons";
import { Icon, RotateCcw } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import type { CollectionContribution, ConfigContextState, ConfigRosterEntry, ConfigTeachDoor, ConfigTeachValue } from "#lib";

export interface TeacherProps {
  readonly state: ConfigContextState;
}

/** The pane's HEAD band — names what the pane ANSWERS (the focused subject, or the open member) over its
 *  place on the map. Never the neutral "Details" (side-eye 2026-08-03 P3, carried forward from the retired
 *  `ConfigContextHeader`). */
export function TeacherBand({ state }: TeacherProps): ReactElement {
  const title = state.member === null ? state.teach.title : state.member.title;
  return (
    <Stack gap="tight" className="min-w-0">
      <Text as="span" voice="kicker" className="truncate">
        {title}
      </Text>
      <Text as="span" voice="gloss" className="truncate">
        {state.teach.trail}
      </Text>
    </Stack>
  );
}

/** One walkable door row — Related links and Applies overrides share the anatomy. */
function DoorRows({ doors }: { readonly doors: readonly ConfigTeachDoor[] }): ReactElement {
  return (
    <Stack gap="tight">
      {doors.map((door) => (
        <ListRow key={door.label} clickable={true} onClick={door.open} title={door.label} />
      ))}
    </Stack>
  );
}

function KickerBlock({ kicker, children }: { readonly kicker: string; readonly children: ReactNode }): ReactElement {
  return (
    <Stack gap="tight">
      <Text as="span" voice="kicker">
        {kicker}
      </Text>
      {children}
    </Stack>
  );
}

/** ABOUT's default-vs-current block (§3.4, the row-chrome leg) — the COARSE pointer's one Reset door
 *  (the row's ⋯ is fine-pointer chrome). Modified ⇒ the pair + Reset; at default ⇒ the honest one-liner,
 *  NO button (a verb only where there is something to do — the pin-not-crown rule).
 *
 *  The two values arrive already in the CONTROL'S OWN WORDS (#1099 F15): the host resolves them through the
 *  leaf's declared option table before they cross the seam, so this block prints "Medium" where the picker
 *  says "Medium". It used to format raw stored values here and printed "md.". */
function TeacherValueBlock({ value }: { readonly value: ConfigTeachValue }): ReactElement {
  if (!value.modified) {
    return (
      <Text voice="gloss" data-slot="teacher-value-default">
        Using the default — {value.defaultValue}.
      </Text>
    );
  }
  return (
    <Stack gap="tight" data-slot="teacher-value">
      <Row align="center" gap="field" className="min-w-0">
        <Text as="span" voice="label" className="min-w-0 truncate">
          Current {value.current}
        </Text>
        <Text as="span" voice="gloss" aria-hidden={true}>
          ·
        </Text>
        <Text as="span" voice="gloss" className="min-w-0 truncate">
          Default {value.defaultValue}
        </Text>
      </Row>
      <Row>
        <Button intent="ghost" size="sm" onClick={value.reset}>
          <Icon icon={RotateCcw} size="sm" />
          Reset to default
        </Button>
      </Row>
    </Stack>
  );
}

/** THE ROSTER — the pane's AT-REST body (#926, the owner's PS5 ruling). One entry per setting row the
 *  reader can currently SEE, in the order the content pane paints them; the set (and therefore the COUNT)
 *  re-derives as the scroll-spy's window moves.
 *
 *  NO ENTRY IS A DOOR (#1101): the LIST is the map, and a roster row that scrolled its setting into view
 *  would restate the LIST 900px to its right. The entries are read-only prose — name, what it does, what
 *  it is set to — which is exactly what the reader who has just arrived on a surface needs and what the
 *  one-at-a-time inspector could not give them for the seven rows they had not touched. */
function TeacherRoster({ roster }: { readonly roster: readonly ConfigRosterEntry[] }): ReactElement {
  return (
    <Stack gap="block" data-slot="teacher-roster">
      {roster.map((entry) => (
        <Stack key={entry.id} data-modified={entry.modified ? "" : undefined} data-setting={entry.id} data-slot="teacher-roster-entry" gap="tight">
          <Row align="baseline" gap="field" className="min-w-0">
            <Text as="span" voice="label" className="min-w-0 truncate">
              {entry.label}
            </Text>
            {/* The VALUE rides the entry's own line, in the control's display words — a roster of names
                with no values would answer "what is in here?" and not "what is it set to?", and the
                second question is the one a settings surface you touch twice a year is opened for. */}
            {entry.value === null ? null : (
              <Text as="span" voice="gloss" className="min-w-0 truncate" data-slot="teacher-roster-value">
                {entry.value}
              </Text>
            )}
          </Row>
          {entry.gloss === null ? null : (
            <Text voice="gloss" className="max-w-(--reading-measure)">
              {entry.gloss}
            </Text>
          )}
        </Stack>
      ))}
    </Stack>
  );
}

/** ABOUT — the ROSTER at rest, the drilled row's lesson when one is focused and on screen.
 *
 *  ONE FIELD DECIDES (`roster` non-empty), not a branch re-derived here: the host already knows whether
 *  the pane is resting on a settings body, drilled into a row, or sitting over a member, and a tab body
 *  that re-decided it would be a second resolver to keep in step (G3 strict — the tabs render state-blind). */
export function TeacherAbout({ state }: TeacherProps): ReactElement {
  const { teach } = state;
  if (state.roster.length > 0) {
    return <TeacherRoster roster={state.roster} />;
  }
  return (
    <Stack gap="block" data-slot="teacher-about">
      <Text>{teach.summary}</Text>
      {teach.value === null ? null : <TeacherValueBlock value={teach.value} />}
      {teach.affects.length === 0 ? null : (
        <KickerBlock kicker="Affects">
          <Stack gap="tight">
            {teach.affects.map((line) => (
              <Row key={line} align="start" gap="field">
                <Text as="span" voice="gloss" aria-hidden={true}>
                  ·
                </Text>
                <Text as="span" voice="label">
                  {line}
                </Text>
              </Row>
            ))}
          </Stack>
        </KickerBlock>
      )}
      {teach.related.length === 0 ? null : (
        <KickerBlock kicker="Related">
          <DoorRows doors={teach.related} />
        </KickerBlock>
      )}
    </Stack>
  );
}

/** APPLIES — for an open member, the collection's own arm; otherwise the override doors.
 *
 *  THERE IS NO EMPTY ARM ANY MORE and that is not a regression of the empty-states law (#926): the tab's
 *  `when` now guarantees content, so the "Nothing narrower overrides this" sentence became unreachable
 *  code. It was never an empty STATE — it was the only thing 107 of 107 settings ever showed here, which
 *  is what the applicability gate replaced. */
export function TeacherApplies({ state }: TeacherProps): ReactElement {
  if (state.member !== null) {
    return <>{state.member.body()}</>;
  }
  return (
    <Stack gap="block" data-slot="teacher-applies">
      <Text voice="gloss">Where a narrower scope wins over this setting:</Text>
      <DoorRows doors={state.teach.applies} />
    </Stack>
  );
}

/** LEARN — the contribution's own in-app lesson. The tab's `when` guarantees `learn` here. */
export function TeacherLearn({ state }: TeacherProps): ReactElement {
  return <>{state.teach.learn?.()}</>;
}

export interface CollectionMemberContextProps {
  readonly context: CollectionContribution["context"];
  readonly icon: LucideIcon;
  readonly memberId: string;
}

/** The open member's context arm — the retired `ConfigContextBody`'s member truths, re-homed: a collection
 *  that declares `{kind:"none"}` renders ITS copy (something IS selected; this library just has nothing to
 *  attach — a generic "nothing selected" would be a lie). */
export function CollectionMemberContext({ context, icon, memberId }: CollectionMemberContextProps): ReactElement {
  if (context.kind === "none") {
    // @orb-waive empty-state-has-action(EmptyState): the TEACHER's member arm for a collection that declares context {kind:"none"} ("Nothing to attach" — a tag applies wherever you put it, so there is genuinely nothing to manage here). The copy is the COLLECTION's own, not a host generic. Ends when a kind:"none" collection gains an attachable surface, at which point this arm stops being reachable.
    return <EmptyState description={context.description} icon={<Icon icon={icon} size="lg" />} title={context.title} />;
  }
  return (
    // The arm's TITLE ("Where it's attached") heads the tab body: the retired `single` context printed it
    // as the pane's band, and the band now names the MEMBER — the answer's own name still has to appear
    // exactly once, here, over the arm that answers it.
    <Stack gap="tight">
      <Text as="span" voice="kicker">
        {context.title}
      </Text>
      {context.render({ memberId })}
    </Stack>
  );
}
