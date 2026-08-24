// B2 — automation's chat-context TAB contribution: the host-only "Rules" surface, grafted onto chat's
// CONTEXT panel through the EXISTING `contextTabs` contributor seam (the rpg-tabs precedent,
// `makeRpgContextTabs`). automation NEVER imports chat and chat never imports automation — the door
// (`compose/authed-app.tsx`) assembles this def into the `chat-context` registry, and chat renders it
// blind via `defineContextTabs`'s `contributors` arm.
//
// WHY A TAB, NOT A SECTION-IN-"THIS CHAT": interaction-direction-spec §7 B2 places the Rules surface as a
// SECTION inside the "This chat" tab. That tab body (`CommittedSettingsTab`) is a CHAT-feature component, and
// `client-features-no-cross` forbids it importing this automation surface at runtime; there is no
// context-tab SECTION contributor registry today (only the whole-TAB `contextTabs` seam and the whole-pane
// region-claim seam). Grafting a host-only "Rules" tab through the existing seam ships B2 with zero new
// client architecture and keeps the whole surface in `features/automation` (deliverable #4). A
// section-in-"This chat" would require minting a new contributor family — recorded for the orchestrator.
//
// `when: isHost` is the PERMISSION-omit (every `automation.*` verb is host-gated server-side anyway);
// `crown` paints the host-only glyph, the Preview-tab convention.

import { Zap } from "@orb/ui/icons";
import type { ReactElement } from "react";
import { QueryBoundary, QueryErrorState, SkeletonRows } from "#data";
import type { ChatContextState, ContextTabDef } from "#lib";
import { RulesSection } from "../components/rules-section.tsx";

/** The host-only "Rules" chat-context tab — the rule list + enable toggle + Test/Run-now + preset picker +
 *  fire log. Suspends on `listRules`, so the body owns its `QueryBoundary`. */
export const automationRulesContextTab: ContextTabDef<ChatContextState> = {
  id: "automationRules",
  label: "Rules",
  icon: Zap,
  crown: true,
  when: (state) => state.isHost,
  body: (state) => (
    <QueryBoundary
      fallback={<SkeletonRows count={3} shape="line" />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="this chat's rules" onRetry={retry} />}
    >
      <RulesSection chatId={state.chatId} />
    </QueryBoundary>
  ),
};
