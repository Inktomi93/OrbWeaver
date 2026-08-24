// Automation Rules-section CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module).
// Exports ONLY components (a mixed component+constant export breaks playwright-ct's named-import rewrite).
// The story wraps the REAL `RulesSection` in `<CtDataProviders>` (Query + real tRPC over the stubbed
// network) plus the `QueryBoundary` the "This chat" tab supplies in production, so a CT exercises the real
// suspense + tRPC query-key + mutation path. The automation-room subscription the section mounts is inert
// here (no `useOrbSocket`, so the room is recorded-but-never-announced — no SSE stub needed).

import { QueryBoundary, QueryErrorState } from "@orb/client/data";
import { RulesSection } from "@orb/client/features/automation";
import type { ChatId } from "@orb/kit/ids";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { CtDataProviders } from "../../../support/ct/ct-data-providers.tsx";

/** The Rules section over the stubbed network — the tab body production wraps in its own `QueryBoundary`. */
export function RulesSectionStory({ chatId }: { readonly chatId: ChatId }): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 420 }}>
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
