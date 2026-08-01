// The consolidated "This chat" CONTEXT tab body (panel-redesign) — everything a host bends for THIS chat,
// in ONE tab whose body is grouped sections on the settings-modal idiom (`Section` primitive, real h3
// headings). The former "Appearance overrides" tab and the separate "Injections" meta-tab were the same
// family ("what I'm bending for this chat"), so they merge here: "Field overrides" (the collapse-until-
// needed override rows), "Injections" (the manual prompt-injection list, folded in from its deleted tab),
// and "Background" (the per-chat decorative background). The host-only Group-behavior + Tool-use sections
// (Context-Panel-Program §1 CP-1) ride along below, each gated at SECTION granularity — the §8.1
// permission-OMIT, moved from tab-level so the tab strip stays slim without dropping a control.
//
// Both arms compose the SAME leaf bodies (RoomOverridesTab / InjectionsManager / ChatBackgroundSection and
// the draft twins DraftOverridesTabBody / DraftInjectionsTab), so every moved read keeps its own query +
// invalidation coverage unchanged and each override/injection/background control stays reachable + editable.

import type { RoomOverrides } from "@orb/contracts/chat";
import type { ThemeBackground } from "@orb/contracts/theme";
import type { ChatId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Section, Stack } from "@orb/ui/layout";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { QueryBoundary, QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { DraftGroupConfigTabBody, DraftInjectionsTab, DraftOverridesTabBody } from "./draft-context-tabs";
import { CommittedGroupConfigTab } from "./group-config-form";
import { InjectionsManager } from "./injections-manager";
import { ChatBackgroundSection, RoomOverridesTab } from "./room-overrides-tab";
import { ToolRecurseControl } from "./tool-recurse-control";

// The Group-behavior form's initially-visible control rows (reply-mode + 2 switches + Advanced trigger).
const GROUP_SECTION_SKELETON_ROWS = 4;

// A section-heading with an at-a-glance kicker-count chip (panel-redesign) — the label plus a small soft
// badge when the count is non-zero (a "0" chip is noise). Rendered as the Section's `heading` ReactNode, so
// its content lands INSIDE the <h3>; the count rides the heading's accessible name ("Injections 3"). Only
// phrasing content here (a Badge is an inline span) — never a Row/div, which is illegal inside a heading.
function HeadingWithCount({ label, count, unit }: { readonly label: string; readonly count: number; readonly unit?: string }): ReactNode {
  return (
    <>
      {label}
      {count > 0 ? (
        <>
          {" "}
          <Badge className="align-middle" intent="neutral" size="sm" tone="soft">
            {count}
            {unit}
          </Badge>
        </>
      ) : null}
    </>
  );
}

// Count the SET override fields (exactly the three `RoomOverrides` slots) — a stored field is only ever
// present when non-empty (empty omits on save, `fromRoomOverridesForm`), so truthiness IS "overridden".
function countSetOverrides(overrides: RoomOverrides): number {
  const set = (value: string | undefined): number => (value !== undefined && value !== "" ? 1 : 0);
  return set(overrides.mainPrompt) + set(overrides.postHistory) + set(overrides.scenario);
}

// The Injections heading's count reads the SAME `listChatInjections` query the section body suspends on, but
// NON-suspending (shares the query cache — one fetch) so the heading paints immediately and the chip fills in
// when the list lands (the chat-list-header count precedent). No chip until the read resolves / when empty.
function InjectionsHeading({ chatId }: { readonly chatId: ChatId }): ReactNode {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.chat.listChatInjections.queryOptions({ chatId }));
  return <HeadingWithCount count={data?.length ?? 0} label="Injections" />;
}

export interface CommittedSettingsTabProps {
  readonly chatId: ChatId;
  readonly roomOverrides: RoomOverrides;
  readonly isHost: boolean;
  readonly background: ThemeBackground | null;
  /** The group-level gate — host of a group chat (was the whole Group tab's `when`). */
  readonly showGroup: boolean;
}

/** The committed-chat "This chat" tab: Field overrides + Injections always present; Background is host-only;
 *  Group behavior only for a host of a group chat; Tool use only for a host (the §8.1 permission-omit,
 *  moved from tab-level to section-level). */
export function CommittedSettingsTab({ chatId, roomOverrides, isHost, background, showGroup }: CommittedSettingsTabProps): ReactElement {
  return (
    <Stack gap="section">
      <Section heading={<HeadingWithCount count={countSetOverrides(roomOverrides)} label="Field overrides" unit=" set" />}>
        <RoomOverridesTab chatId={chatId} roomOverrides={roomOverrides} isHost={isHost} />
      </Section>
      <Section heading={<InjectionsHeading chatId={chatId} />}>
        <QueryBoundary
          fallback={<SkeletonRows count={1} shape="line" />}
          renderError={(_error, retry): ReactElement => <QueryErrorState label="injections" onRetry={retry} />}
        >
          <InjectionsManager chatId={chatId} isHost={isHost} />
        </QueryBoundary>
      </Section>
      {isHost ? (
        <Section heading="Background">
          <ChatBackgroundSection chatId={chatId} background={background} />
        </Section>
      ) : null}
      {showGroup ? (
        <Section heading="Group behavior">
          <QueryBoundary
            // Shape-matched skeleton for the Group-behavior form's initially-visible rows (the reply-mode
            // toggle-group, the two switch fields, the Advanced accordion trigger) — never a spinner/text
            // void (house loading law, UIP-309 / UI-Arch §4.3 rule 7). Same idiom every panel section uses.
            fallback={<SkeletonRows count={GROUP_SECTION_SKELETON_ROWS} shape="line" />}
            renderError={(_error, retry): ReactElement => <QueryErrorState label="group settings" onRetry={retry} />}
          >
            <CommittedGroupConfigTab chatId={chatId} />
          </QueryBoundary>
        </Section>
      ) : null}
      {/* Tool use — host-only (⑦, the §8.1 permission-OMIT: a member never sees the control). Reads getChat
          (already loaded for this tab) for the current cap; the QueryBoundary matches the getChat suspense. */}
      {isHost ? (
        <Section heading="Tool use">
          <QueryBoundary
            fallback={<SkeletonRows count={1} shape="line" />}
            renderError={(_error, retry): ReactElement => <QueryErrorState label="the tool round limit" onRetry={retry} />}
          >
            <ToolRecurseControl chatId={chatId} />
          </QueryBoundary>
        </Section>
      ) : null}
    </Stack>
  );
}

export interface DraftSettingsTabProps {
  readonly draftKey: string;
  /** The draft group-level gate — a ≥2-cast draft (was the draft Group tab's `when`). */
  readonly showGroup: boolean;
}

/** The draft-chat "This chat" tab: the draft-config-backed twins of the committed sections. A draft is
 *  always authored (and only visible) by its host, so overrides + injections are editable; Group behavior
 *  appears once the draft crosses the group floor. Background has no draft store (no server row yet), so
 *  it is committed-only. */
export function DraftSettingsTab({ draftKey, showGroup }: DraftSettingsTabProps): ReactElement {
  return (
    <Stack gap="section">
      <Section heading="Field overrides">
        <DraftOverridesTabBody draftKey={draftKey} />
      </Section>
      <Section heading="Injections">
        <DraftInjectionsTab draftKey={draftKey} />
      </Section>
      {showGroup ? (
        <Section heading="Group behavior">
          <DraftGroupConfigTabBody draftKey={draftKey} />
        </Section>
      ) : null}
    </Stack>
  );
}
