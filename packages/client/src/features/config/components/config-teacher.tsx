// The TEACHER's render half (config-revamp-design.md §3.5/§7.2, #866 S3) — the bracket band and the three
// tab bodies over the RESOLVED `ConfigContextState` (the host already flattened focus × registries into
// display data; nothing here re-resolves). The About tab is the lesson (definition · affects · related
// doors); Applies is where a narrower scope wins — and for an OPEN collection member it IS that
// collection's own context arm (its "where it's attached" answer, unchanged contract); Learn renders only
// when a contribution supplied one (APPLICABILITY — the tab's `when` lives in `config-teacher-tabs.tsx`).

import { EmptyState } from "@orb/ui/empty-state";
import type { LucideIcon } from "@orb/ui/icons";
import { Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import type { CollectionContribution, ConfigContextState, ConfigTeachDoor } from "#lib";

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

/** ABOUT — the definition, what moves when it moves, and the knobs it interacts with. */
export function TeacherAbout({ state }: TeacherProps): ReactElement {
  const { teach } = state;
  return (
    <Stack gap="block" data-slot="teacher-about">
      <Text>{teach.summary}</Text>
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

/** APPLIES — for an open member, the collection's own arm; otherwise the override doors, or the honest
 *  "nothing narrower" sentence (an empty pane would read as unbuilt — empty states are load-bearing). */
export function TeacherApplies({ state }: TeacherProps): ReactElement {
  if (state.member !== null) {
    return <>{state.member.body()}</>;
  }
  if (state.teach.applies.length === 0) {
    return (
      <Text voice="gloss" data-slot="teacher-applies-none">
        Nothing narrower overrides this — what you set here is what runs.
      </Text>
    );
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
