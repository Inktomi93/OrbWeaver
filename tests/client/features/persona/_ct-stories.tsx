// Story module for the persona-panel-row CT (Spine-Testing §7 — CT mounts ONLY from a non-test module).
// Drives the side-eye item-13 rework: the "set current" target is a stretched real `<Button>` pinned under
// the row's controls (NOT a hand-rolled role="button" div), and the avatar/name/action controls are
// disjoint SIBLINGS layered above it — so a CT can prove clicking a control fires ONLY its own action, not
// "set current" (no nesting, no stopPropagation crutch). The row instantiates `useUpdatePersona`, so it
// mounts under `CtDataProviders` (the trpc client) — the overlay tests trigger no network call.

import { QueryBoundary } from "@orb/client/data";
import { PersonaPanelRow } from "@orb/client/features/persona";
import type { NotifyInput } from "@orb/client/lib";
import { bindNotify, toNotice } from "@orb/client/lib";
import { selectChat } from "@orb/client/state";
import type { ChatId, PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { useState } from "react";
import { PersonaEditor } from "../../../../packages/client/src/features/persona/components/persona-editor.tsx";
import { PersonaThisChatSection } from "../../../../packages/client/src/features/persona/components/persona-this-chat-section.tsx";
import { CtDataProviders } from "../../../support/ct/ct-data-providers.tsx";

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

/** The editor's own detail row, spelled at the REAL prop type (never a cast): a field added to
 *  `persona.get`'s output breaks this story at compile time rather than surviving as a fabricated hole. */
const EDITOR_PERSONA: Parameters<typeof PersonaEditor>[0]["persona"] = {
  ...PERSONA,
};

/** MACU-2 — `<PersonaEditor>` over the data layer, for the macro-plane completion arm. The editor mounts its
 *  own D78 session boundary, so the story only supplies the detail row + the providers; the `.ct.tsx` stubs
 *  `settings.getUserSettings` (for `seeds.defaultPresetId`) and `preset.get` (for that preset's
 *  `userMacros`), which is the plane `usePromptMacroSuggestions` composes. */
export function PersonaEditorMacroStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 480 }}>
        <PersonaEditor persona={EDITOR_PERSONA} onRequestDelete={(): void => undefined} />
      </div>
    </CtDataProviders>
  );
}

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
    const sink = (notice: NotifyInput): void => setNotified(toNotice(notice).title);
    bindNotify({ error: sink, info: sink, success: sink, warn: sink });
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

/** The DENSE row at the rail-foot panel's REAL width (side-eye 2026-08-06 P1). Every marker lit — current +
 *  default + favorited — which is the state the shipped seed persona is in, and the state that made the row
 *  reserve BOTH the marker strip and the action strip and truncate "Traveler" to "Tra…".
 *
 *  358px is the production host, not a story convenience: the rail-foot persona panel measures 358px, and the
 *  defect is invisible at the 320px default story width for the same reason the theme-band clip was invisible
 *  at the content-sized mount — a shortfall this narrow only shows once the box is the real one. The width is
 *  SET on the container (the mount root is content-sized and would simply grow). */
export function PersonaPanelRowDenseStory({ width = 358 }: { readonly width?: number } = {}): ReactElement {
  return (
    <CtDataProviders>
      {/* A FIXED-width container (the narrowest-mount rule): a content-sized mount root agrees with the
          bug. 358px is the desktop rail row; 320 is the same row inside the mobile You sheet. */}
      <div style={{ width }}>
        <PersonaPanelRow
          expanded={false}
          isCurrent={true}
          isDefault={true}
          onDelete={(): void => undefined}
          onSetCurrent={(): void => undefined}
          onSetDefault={(): void => undefined}
          onToggleExpand={(): void => undefined}
          persona={{ ...PERSONA, name: "Traveler", starred: true }}
        />
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
