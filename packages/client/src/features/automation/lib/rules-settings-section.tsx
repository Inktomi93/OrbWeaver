// B2 — automation's "This chat" SECTION contribution: the host-only Rules surface, grafted into chat's
// consolidated per-chat-configuration tab through the §6c `ChatSettingsSectionContribution` seam.
// automation NEVER imports chat and chat never imports automation — the door (`compose/authed-app.tsx`)
// assembles this def into the `chat-settings-sections` registry, and `CommittedSettingsTab` renders it
// blind inside its host-controls band, in that band's own `<Section kicker>` grammar.
//
// IT SHIPPED AS A TAB AND WAS RETIRED (#616, owner ruling 2026-08-24 — "im fine with it going in this
// chat"). B2 grafted a 5th host TAB through the whole-TAB `contextTabs` seam because no SECTION seam
// existed; a side-eye pass measured what that cost: the tab strip OVERFLOWED at 1024px (clientWidth 290
// vs scrollWidth 313, the first tab painting as "…mbers" with no scroll affordance), and per-chat
// configuration lived in two homes — "This chat" (injections, documents, macro picks, background, host
// controls) AND "Rules", which is the same KIND of surface as Injections. The ruling authorized minting
// the SECTION family; the tab graft went in the same change (no half-migration).
//
// The section is HOST-ONLY BY MOUNT, not by a predicate: the `host-controls` anchor's whole band is
// omitted for a member (`CommittedSettingsTab`), and every `automation.*` rule verb is host-gated
// server-side anyway (a member's `listRules` collapses to a leak-free NOT_FOUND).

import type { ReactElement } from "react";
import { QueryBoundary, QueryErrorState, SkeletonRows } from "#data";
import type { ChatSettingsSectionContribution } from "#lib";
import { RulesSection } from "../components/rules-section.tsx";

/** The host-only "Rules" section inside the "This chat" tab — the rule list + enable toggle + Test /
 *  Run-now + preset picker + fire log. Suspends on `listRules`, so the body owns its `QueryBoundary`. */
export const automationRulesSection: ChatSettingsSectionContribution = {
  id: "automationRules",
  anchor: "host-controls",
  kicker: "Rules",
  body: (state) => (
    <QueryBoundary
      fallback={<SkeletonRows count={3} shape="line" />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="this chat's rules" onRetry={retry} />}
    >
      <RulesSection chatId={state.chatId} />
    </QueryBoundary>
  ),
};
