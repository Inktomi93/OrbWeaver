// The consolidated "Settings" CONTEXT tab body (Context-Panel-Program §1 CP-1) — the former Overrides
// and Group tabs, merged into ONE tab whose body is grouped sections on the settings-modal idiom
// (`Section` primitive, real h3 headings). "Appearance overrides" is the room-overrides body; "Group
// behavior" is the group-config body. The host-only + group-chat gate that used to gate the WHOLE Group
// tab (chats-section.tsx's `when`) moves down one level here: the "Group behavior" section is present
// only when the viewer is host of a group chat (committed) / the draft has ≥2 cast (draft) — the §8.1
// permission-OMIT law, moved to section granularity so the tab strip loses a slot without losing a control.
//
// Both arms compose the SAME leaf bodies the tabs used before (RoomOverridesTab / CommittedGroupConfigTab
// and the draft twins DraftOverridesTabBody / DraftGroupConfigTabBody), so every moved read keeps its own
// query + invalidation coverage unchanged and each override/group control stays reachable + editable.

import type { RoomOverrides } from "@orb/contracts/chat";
import type { ThemeBackground } from "@orb/contracts/theme";
import type { ChatId } from "@orb/kit/ids";
import { Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { QueryBoundary, QueryErrorState } from "#data";
import { DraftGroupConfigTabBody, DraftOverridesTabBody } from "./draft-context-tabs";
import { CommittedGroupConfigTab } from "./group-config-form";
import { RoomOverridesTab } from "./room-overrides-tab";

export interface CommittedSettingsTabProps {
  readonly chatId: ChatId;
  readonly roomOverrides: RoomOverrides;
  readonly isHost: boolean;
  readonly background: ThemeBackground | null;
  /** The group-level gate — host of a group chat (was the whole Group tab's `when`). */
  readonly showGroup: boolean;
}

/** The committed-chat Settings tab: Appearance overrides always present; Group behavior only for a host
 *  of a group chat (the §8.1 permission-omit, moved from tab-level to section-level). */
export function CommittedSettingsTab({ chatId, roomOverrides, isHost, background, showGroup }: CommittedSettingsTabProps): ReactElement {
  return (
    <Stack gap="section">
      <Section heading="Appearance overrides">
        <RoomOverridesTab chatId={chatId} roomOverrides={roomOverrides} isHost={isHost} background={background} />
      </Section>
      {showGroup ? (
        <Section heading="Group behavior">
          <QueryBoundary
            fallback={<Text tone="muted">Loading group settings…</Text>}
            renderError={(_error, retry): ReactElement => <QueryErrorState label="group settings" onRetry={retry} />}
          >
            <CommittedGroupConfigTab chatId={chatId} />
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

/** The draft-chat Settings tab: the draft-config-backed twins of the committed sections. A draft is
 *  always authored (and only visible) by its host, so Appearance is editable; Group behavior appears
 *  once the draft crosses the group floor. */
export function DraftSettingsTab({ draftKey, showGroup }: DraftSettingsTabProps): ReactElement {
  return (
    <Stack gap="section">
      <Section heading="Appearance overrides">
        <DraftOverridesTabBody draftKey={draftKey} />
      </Section>
      {showGroup ? (
        <Section heading="Group behavior">
          <DraftGroupConfigTabBody draftKey={draftKey} />
        </Section>
      ) : null}
    </Stack>
  );
}
