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
import { Section, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { QueryBoundary, QueryErrorState, SkeletonRows } from "#data";
import { DraftGroupConfigTabBody, DraftInjectionsTab, DraftOverridesTabBody } from "./draft-context-tabs";
import { CommittedGroupConfigTab } from "./group-config-form";
import { InjectionsManager } from "./injections-manager";
import { ChatBackgroundSection, RoomOverridesTab } from "./room-overrides-tab";
import { ToolRecurseControl } from "./tool-recurse-control";

// The Group-behavior form's initially-visible control rows (reply-mode + 2 switches + Advanced trigger).
const GROUP_SECTION_SKELETON_ROWS = 4;

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
      <Section heading="Field overrides">
        <RoomOverridesTab chatId={chatId} roomOverrides={roomOverrides} isHost={isHost} />
      </Section>
      <Section heading="Injections">
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
            renderError={(_error, retry): ReactElement => <QueryErrorState label="the tool-call limit" onRetry={retry} />}
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
