// Automation Rules-section CT stories (docs/law/Spine-Testing.md §7 — CT mounts ONLY from a non-test module).
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

import { QueryBoundary } from "@orb/client/components";
import { QueryErrorState } from "@orb/client/data";
import {
  automationBudgetSection,
  automationLibraryRulesSection,
  automationRulesSection,
  ClockMeter,
  NeedleMeter,
  RulesSection,
} from "@orb/client/features/automation";
import type { ChatSettingsSectionContribution } from "@orb/client/lib";
import { createContributorRegistry } from "@orb/client/lib";
import type { ConfigSectionContribution } from "@orb/client/state";
import type { ChatId } from "@orb/kit/ids";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { CommittedSettingsTab } from "../../../../packages/client/src/features/chat/components/settings-context-tab.tsx";
import { CtAppDataProviders, CtConfigGroupBody, CtDataProviders } from "../../../support/browser/ct-data-providers.tsx";
import { CtToastSurface } from "../../lib/_ct-stories.tsx";

/** The narrowest REAL host for this surface — the CONTEXT pane at its docked width. A trailing control
 *  cluster sized in a wide story agrees with the bug (UI lane law: measure at the narrowest real mount). */
const CONTEXT_PANE_WIDTH = 384;
/** The narrowest REAL host for a SETTINGS pane body — the settings modal's content column. A settings
 *  surface never renders in the docked context pane, so measuring it at 384px would be a mount that does
 *  not exist (the other half of "measure at the narrowest REAL host"). */
const SETTINGS_PANE_WIDTH = 560;

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

/** The Rules section on the REAL app QueryClient + the production toast outlet — the ONE stack in which a
 *  mutation's `meta.errorToast` reaches a rendered toast (the plain `CtDataProviders` client has no error
 *  channel at all). That is what makes the MINT REFUSAL assertable end to end: the picker can only pre-empt
 *  SHAPE, and "that book is not attached to this chat" is a LIVE fact the server owns — a book listed when
 *  the form rendered can stop qualifying before the press (#630). */
export function RulesSectionToastStory({ chatId }: { readonly chatId: ChatId }): ReactElement {
  return (
    <CtAppDataProviders>
      <CtToastSurface>
        <div style={{ width: CONTEXT_PANE_WIDTH }}>
          <QueryBoundary
            fallback={<Text voice="gloss">Loading…</Text>}
            renderError={(_error, retry): ReactElement => <QueryErrorState label="this chat's rules" onRetry={retry} />}
          >
            <RulesSection chatId={chatId} />
          </QueryBoundary>
        </div>
      </CtToastSurface>
    </CtAppDataProviders>
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

/** The Automation group's two contributed sections (config-revamp-design.md §6.8), assembled as at the
 *  door and rendered through the config host's OWN resolver (`CtConfigGroupBody`). */
const automationSections: ReturnType<typeof createContributorRegistry<ConfigSectionContribution>> = createContributorRegistry<ConfigSectionContribution>(
  "config-sections",
  [automationLibraryRulesSection, automationBudgetSection],
);

/** C5's OWNER-GLOBAL sections — the Automation config group's body, over the stubbed network. Each section
 *  carries its OWN `QueryBoundary`, so unlike the Rules section it needs no wrapper boundary here: the story
 *  is exactly what the config host's skimmer mounts for the `automation` anchor.
 *
 *  THE WIDTH IS THE CONTENT PANE's, not the docked context pane's — a config section's narrowest real host
 *  is the CONTENT pane, and sizing this at 384px would measure a mount that does not exist. */
export function OwnerAutomationSectionsStory({ width = SETTINGS_PANE_WIDTH }: { readonly width?: number } = {}): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width }}>
        <CtConfigGroupBody anchor="automation" sections={automationSections} />
      </div>
    </CtDataProviders>
  );
}

/** #16's NEEDLE METER over the stubbed network — the REAL `chat.getRuntimeVariables` read path. NO wrapper
 *  width and NO `QueryBoundary`, both matching production: the widget mounts as a `thread-flank`
 *  contribution, which is content-sized beside the transcript and is rendered with no Suspense boundary of
 *  its own (which is exactly why the component is non-suspending). */
export function NeedleMeterStory({ chatId }: { readonly chatId: ChatId }): ReactElement {
  return (
    <CtDataProviders>
      <NeedleMeter chatId={chatId} />
    </CtDataProviders>
  );
}

/** B9's CLOCK METER over the stubbed network — the REAL `chat.getRuntimeVariables` read path, same non-wrapped
 *  posture as the needle: the widget mounts as a content-sized `thread-flank` contribution with no Suspense
 *  boundary of its own (which is why the component is non-suspending). */
export function ClockMeterStory({ chatId }: { readonly chatId: ChatId }): ReactElement {
  return (
    <CtDataProviders>
      <ClockMeter chatId={chatId} />
    </CtDataProviders>
  );
}
