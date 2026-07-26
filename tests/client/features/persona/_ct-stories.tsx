// Story module for the persona-panel-row CT (Spine-Testing §7 — CT mounts ONLY from a non-test module).
// Drives the side-eye item-13 rework: the "set current" target is a stretched real `<Button>` pinned under
// the row's controls (NOT a hand-rolled role="button" div), and the avatar/name/action controls are
// disjoint SIBLINGS layered above it — so a CT can prove clicking a control fires ONLY its own action, not
// "set current" (no nesting, no stopPropagation crutch). The row instantiates `useUpdatePersona`, so it
// mounts under `CtDataProviders` (the trpc client) — the overlay tests trigger no network call.

import { QueryBoundary } from "@orb/client/data";
import { PersonaPanelRow } from "@orb/client/features/persona";
import { bindNotify } from "@orb/client/lib";
import { selectChat } from "@orb/client/state";
import type { ChatId, PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { useState } from "react";
import { PersonaThisChatSection } from "../../../../packages/client/src/features/persona/components/persona-this-chat-section";
import { CtDataProviders } from "../../../support/ct/ct-data-providers";

type PersonaFixture = Parameters<typeof PersonaPanelRow>[0]["persona"];

const PERSONA: PersonaFixture = {
  id: castId<PersonaId>("persona_ct"),
  name: "Nova",
  title: "the navigator",
  description: "A steady hand at the helm.",
  starred: false,
  avatarAssetId: null,
  avatarHash: null,
  metadata: null,
  createdAt: 1,
  updatedAt: 1,
};

// The CT's active-chat id — the `.ct.tsx` stubs `chat.getChat` for this same id (a plain module-const, not
// an export: a story module exports components ONLY — useComponentExportOnlyModules).
const THIS_CHAT_ID = castId<ChatId>("chat_persona_ct");

/** `<PersonaThisChatSection>` with an active chat seeded (⑥b — HONOR persona.showNotifications). The section
 *  suspends on persona.list + getUserSettings + gates on getChat, all stubbed per-test; the seeded chat makes
 *  `useActiveChatId` non-null so the section renders. Wrapped in the production QueryBoundary (the persona
 *  panel's own boundary in-app) so the suspense reads have a boundary. */
export function PersonaThisChatStory(): ReactElement {
  // `notify` no-ops in the CT harness (bindNotify is main.tsx-only), so bind it here to a DOM sink — the CT
  // observes the gated `notify.info` via the marker rather than the (unbound) toast surface.
  const [notified, setNotified] = useState<string>("");
  useState(() => {
    selectChat(THIS_CHAT_ID);
    bindNotify({ info: (m): void => setNotified(m), success: (m): void => setNotified(m), error: (m): void => setNotified(m) });
    return null;
  });
  return (
    <CtDataProviders>
      <div style={{ width: 360, padding: 16 }}>
        <QueryBoundary fallback={<p>Loading…</p>} renderError={(): ReactElement => <p>error</p>}>
          <PersonaThisChatSection />
        </QueryBoundary>
        <p data-testid="notified">{notified}</p>
      </div>
    </CtDataProviders>
  );
}

/** `<PersonaPanelRow>` under the data layer — records which callback fired into a visible marker so the CT
 *  can assert control clicks are disjoint from the "set current" overlay. */
export function PersonaPanelRowStory(): ReactElement {
  const [fired, setFired] = useState<string>("none");
  const [expanded, setExpanded] = useState(false);
  return (
    <CtDataProviders>
      <div style={{ width: 320 }}>
        <PersonaPanelRow
          expanded={expanded}
          isCurrent={false}
          isDefault={false}
          onDelete={(): void => setFired("delete")}
          onSetCurrent={(): void => setFired("current")}
          onSetDefault={(): void => setFired("default")}
          onToggleExpand={(): void => {
            setFired("expand");
            setExpanded((v) => !v);
          }}
          persona={PERSONA}
        />
        <p data-testid="fired">{fired}</p>
      </div>
    </CtDataProviders>
  );
}
