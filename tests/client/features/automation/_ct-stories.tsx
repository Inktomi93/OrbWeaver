// Automation Rules-section CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module).
// Exports ONLY components (a mixed component+constant export breaks playwright-ct's named-import rewrite).
// The story wraps the REAL `RulesSection` in `<CtDataProviders>` (Query + real tRPC over the stubbed
// network) plus the `QueryBoundary` the "This chat" tab supplies in production, so a CT exercises the real
// suspense + tRPC query-key + mutation path. The automation-room subscription the section mounts is inert
// here (no `useOrbSocket`, so the room is recorded-but-never-announced — no SSE stub needed).
//
// The SECOND story mounts the REAL "This chat" tab body with the REAL section contribution in its registry
// — the #616 graft end to end (chat renders a foreign feature's section, importing nothing from it). It is
// the only place the seam can be proven: the tab body is a chat component, the contribution is automation's,
// and the wiring between them exists only at the composition root.

import { QueryBoundary, QueryErrorState } from "@orb/client/data";
import { automationRulesSection, RulesSection } from "@orb/client/features/automation";
import type { ChatSettingsSectionContribution } from "@orb/client/lib";
import { createContributorRegistry } from "@orb/client/lib";
import type { ChatId } from "@orb/kit/ids";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { CommittedSettingsTab } from "../../../../packages/client/src/features/chat/components/settings-context-tab.tsx";
import { CtDataProviders } from "../../../support/ct/ct-data-providers.tsx";

/** The narrowest REAL host for this surface — the CONTEXT pane at its docked width. A trailing control
 *  cluster sized in a wide story agrees with the bug (UI lane law: measure at the narrowest real mount). */
const CONTEXT_PANE_WIDTH = 384;

/** The Rules section over the stubbed network — the tab body production wraps in its own `QueryBoundary`. */
export function RulesSectionStory({ chatId, width = CONTEXT_PANE_WIDTH }: { readonly chatId: ChatId; readonly width?: number }): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width }}>
        <QueryBoundary
          fallback={<Text voice="gloss">Loading…</Text>}
          renderError={(_error, retry): ReactElement => <QueryErrorState label="this chat's rules" onRetry={retry} />}
        >
          <RulesSection chatId={chatId} />
        </QueryBoundary>
      </div>
    </CtDataProviders>
  );
}

/** The REAL "This chat" tab body with automation's REAL section contribution wired into its §6c registry —
 *  exactly what `compose/authed-app.tsx` assembles. `isHost` drives the host-controls band's mount, which is
 *  what makes the grafted section host-only without a predicate of its own. */
export function RulesInThisChatTabStory({ chatId, isHost = true }: { readonly chatId: ChatId; readonly isHost?: boolean }): ReactElement {
  const sections = createContributorRegistry<ChatSettingsSectionContribution>("chat-settings-sections", [automationRulesSection]);
  return (
    <CtDataProviders>
      <div style={{ width: CONTEXT_PANE_WIDTH }}>
        <CommittedSettingsTab chatId={chatId} roomOverrides={{}} isHost={isHost} background={null} showGroup={false} sections={sections} />
      </div>
    </CtDataProviders>
  );
}
