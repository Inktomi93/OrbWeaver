// The consolidated "This chat" CONTEXT tab body — everything a host bends for THIS chat,
// in ONE tab whose body is grouped sections (`Section` primitive, real h3 headings).
//
// THE PANE IS INSTRUMENT TIER, SO THE SECTIONS SPEAK IN THE KICKER VOICE (density-pass-spec §2.3/§3.1 —
// "CONTEXT panel viewport (rpg tabs, meta tabs)" is named there explicitly; side-eye 08-01 F8). They shipped
// on `heading` — the FORM-tier h3, 16px/500 — inside the same pane where every rpg section names itself in
// micro-caps over a hairline, so the meta tabs wore settings-modal clothes in an instrument. `kicker` is the
// same `<h3>` (the document outline is unchanged) in the tier's own voice.
//
// D-1 (owner ruling 2026-07-31, `docs/design/context-panel-fidelity-findings.md` §2/§4): the merge had
// stacked FIVE unrelated concerns in one flat list ("a whole menu got garbled together"). The HOST-OPS trio
// — Background · Group behavior · Tool use — now sits under its own "Host controls" group, which is also
// exactly the permission line: everything above it any member may set, everything inside it is host-only.
//
// The former "Appearance overrides" tab and the separate "Injections" meta-tab were the same
// family ("what I'm bending for this chat"), so they merge here: "Field overrides" (the collapse-until-
// needed override rows), "Injections" (the manual prompt-injection list, folded in from its deleted tab),
// and "Background" (the per-chat decorative background). The host-only Group-behavior + Tool-use sections
// (Context-Panel-Program §1 CP-1) ride along below, each gated at SECTION granularity — the §8.1
// permission-OMIT, moved from tab-level so the tab strip stays slim without dropping a control.
//
// D-4 (databank-surface-spec): "Documents" — the per-chat databank rack + the D85 host visibility toggle —
// lands directly AFTER Injections. Same family ("extra content entering this room's prompt"), and it is
// member-READABLE, so it belongs above the host-only band rather than inside it.
//
// THE DRAFT TWIN IS GONE (chat-creation-draft-mode-replacement.md §4.9, R1). `DraftSettingsTab` rendered
// draft-config-store-backed copies of Field overrides / Injections / Group behavior for a room with no
// server row — and could not offer Background, Documents, Macro picks, Appearance or Tool use at all,
// because each needs a `chatId`. The room has one from the creation click, so this tab is the whole tab in
// every phase, and the four sections a pre-send room could not show are simply present.

import type { RoomOverrides } from "@orb/contracts/chat";
import type { ThemeBackground } from "@orb/contracts/theme";
import type { ChatId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Section, Stack } from "@orb/ui/layout";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { QueryBoundary, QueryErrorState, SkeletonRows, useTRPC } from "#data";
import { ChatDocumentsSection } from "./chat-documents-section.tsx";
import { CommittedGroupConfigTab } from "./group-config-form.tsx";
import { HostDisplayScriptsControl } from "./host-display-scripts-control.tsx";
import { InjectionsManager } from "./injections-manager.tsx";
import { MacroPicksSection } from "./macro-picks-section.tsx";
import { ChatBackgroundSection, RoomOverridesTab } from "./room-overrides-tab.tsx";
import { ToolRecurseControl } from "./tool-recurse-control.tsx";

// The Group-behavior form's initially-visible control rows (reply-mode + 2 switches + Advanced trigger).
const GROUP_SECTION_SKELETON_ROWS = 4;

// A section-heading with an at-a-glance kicker-count chip — the label plus a small soft
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

// The Documents count, on the same non-suspending shared-cache idiom as Injections above. It counts the
// rows THIS VIEWER received, which is the only honest number: a member's payload is already filtered to the
// visible set, and a chip saying "there are N more you cannot see" would leak the host's hidden count.
function DocumentsHeading({ chatId }: { readonly chatId: ChatId }): ReactNode {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.databank.listActiveForChat.queryOptions({ chatId }));
  return <HeadingWithCount count={data?.length ?? 0} label="Documents" />;
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
      <Section kicker={<HeadingWithCount count={countSetOverrides(roomOverrides)} label="Field overrides" unit=" set" />}>
        <RoomOverridesTab chatId={chatId} roomOverrides={roomOverrides} isHost={isHost} />
      </Section>
      <Section kicker={<InjectionsHeading chatId={chatId} />}>
        <QueryBoundary
          fallback={<SkeletonRows count={1} shape="line" />}
          renderError={(_error, retry): ReactElement => <QueryErrorState label="injections" onRetry={retry} />}
        >
          <InjectionsManager chatId={chatId} isHost={isHost} />
        </QueryBoundary>
      </Section>
      {/* Documents (D-4) — the per-chat databank rack, placed directly AFTER Injections because it is the
          same family ("extra content entering this room's prompt") and, unlike the host-only band below, it
          is member-READABLE: `listActiveForChat` is member-gated by design, so a member sees the rows and
          simply gets no visibility toggle, no detach and no add (the §8.1 permission-OMIT at ROW level). */}
      <Section kicker={<DocumentsHeading chatId={chatId} />}>
        <QueryBoundary
          fallback={<SkeletonRows count={2} shape="line" />}
          renderError={(_error, retry): ReactElement => <QueryErrorState label="this chat's documents" onRetry={retry} />}
        >
          <ChatDocumentsSection chatId={chatId} isHost={isHost} />
        </QueryBoundary>
      </Section>
      {/* Macro picks (#24) — the per-chat user-macro INPUT picks. NOT host-gated: the picks are room play
          state any member may set (`setUserMacroValues` is member-gated, the `setVariables` sibling), so it
          sits with Field overrides/Injections rather than in the host-only band below. */}
      <Section kicker="Macro picks">
        <QueryBoundary
          fallback={<SkeletonRows count={2} shape="line" />}
          renderError={(_error, retry): ReactElement => <QueryErrorState label="the macro picks" onRetry={retry} />}
        >
          <MacroPicksSection chatId={chatId} />
        </QueryBoundary>
      </Section>
      {/* THE HOST-OPS GROUP (D-1). Rendered only for a host, so the group's own name is never an empty
          promise — and the three §8.1 permission-OMITs inside it keep their individual gates (Group behavior
          also needs a group chat). A member's tab simply ends after Macro picks. */}
      {isHost ? <HostControls chatId={chatId} background={background} showGroup={showGroup} /> : null}
    </Stack>
  );
}

/** The host-ops trio under one name (D-1): the per-chat Background, the Group-behavior form, and the
 *  tool-round cap. Grouped rather than merged — each keeps its own section, its own read and its own
 *  boundary; what changes is that they read as ONE band of host knobs instead of three more entries in a
 *  five-concern list. */
function HostControls({
  chatId,
  background,
  showGroup,
}: {
  readonly chatId: ChatId;
  readonly background: ThemeBackground | null;
  readonly showGroup: boolean;
}): ReactElement {
  return (
    <Section kicker="Host controls">
      <Stack gap="section">
        <Section kicker="Background">
          <ChatBackgroundSection chatId={chatId} background={background} />
        </Section>
        {showGroup ? (
          <Section kicker="Group behavior">
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
        {/* Appearance — the room's display-tier broadcast switch (D121-E). Reads the same getChat this tab
            already loaded, so the QueryBoundary matches the tool-round control's exactly. */}
        <Section kicker="Appearance">
          <QueryBoundary
            fallback={<SkeletonRows count={1} shape="line" />}
            renderError={(_error, retry): ReactElement => <QueryErrorState label="the display-script setting" onRetry={retry} />}
          >
            <HostDisplayScriptsControl chatId={chatId} />
          </QueryBoundary>
        </Section>
        {/* Tool use — reads getChat (already loaded for this tab) for the current cap; the QueryBoundary
            matches the getChat suspense. */}
        <Section kicker="Tool use">
          <QueryBoundary
            fallback={<SkeletonRows count={1} shape="line" />}
            renderError={(_error, retry): ReactElement => <QueryErrorState label="the tool round limit" onRetry={retry} />}
          >
            <ToolRecurseControl chatId={chatId} />
          </QueryBoundary>
        </Section>
      </Stack>
    </Section>
  );
}
