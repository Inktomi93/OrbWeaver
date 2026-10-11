// Story module for the persona CTs (Spine-Testing §7 — CT mounts ONLY from a non-test module): the switcher
// through its registered chrome entry, the Settings list and row, the editor, the first-run gate and the
// notifications section. Rows instantiate entity mutations, so every story mounts under `CtDataProviders`.

import { QueryBoundary } from "@orb/client/components";
import { PersonaPanelRow, personaChrome } from "@orb/client/features/persona";
import type { NotifyInput, NotifyNotice } from "@orb/client/lib";
import { bindNotify, toNotice } from "@orb/client/lib";
import { __resetConfigNav, selectChat, usePersonaEditorId } from "@orb/client/state";
import type { ChatId, PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { TooltipProvider } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { ConfigContentSurface } from "../../../../packages/client/src/features/config/surfaces/config-content-surface.tsx";
import { ConfigListSurface } from "../../../../packages/client/src/features/config/surfaces/config-list-surface.tsx";
import { FirstRunPersonaDialog } from "../../../../packages/client/src/features/persona/anchors/first-run-persona-dialog.tsx";
import { PersonaEditor } from "../../../../packages/client/src/features/persona/components/persona-editor.tsx";
import { PersonaList } from "../../../../packages/client/src/features/persona/components/persona-list.tsx";
import { PersonaNotificationsSection } from "../../../../packages/client/src/features/persona/components/persona-notifications-section.tsx";
import { realConfigGroups } from "../../../support/browser/ct-config-groups.ts";
import { CtDataProviders, CtRealConfigSectionRegistry } from "../../../support/browser/ct-data-providers.tsx";

const LIST_MOUNT_DELAY_MS = 800;

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
          isDefault={true}
          onDelete={(): void => undefined}
          onClearDefault={(): void => undefined}
          onSetDefault={(): void => undefined}
          onToggleExpand={(): void => undefined}
          persona={{ ...PERSONA, name: "Traveler", starred: true }}
        />
      </div>
    </CtDataProviders>
  );
}

/** The MOBILE YOU SHEET's persona SWITCHER — `personaChrome.body("sheet")`, which is the production
 *  projection (since #866 S4 the sheet lens is the switcher grammar:
 *  who-head · switch rows · account foot — the list moved to Config → Personas). Driven through the
 *  registered chrome entry rather than the surface module so the story mounts exactly what the sheet
 *  mounts, and imports it through the feature's front door (a relative reach into `packages/` would bind
 *  a different React context instance).
 *
 *  The list itself comes from the `.ct.tsx`'s `persona.list` + `settings.getUserSettings` stubs — this
 *  story supplies only the 320px sheet box, which is the narrowest real host for these rows (#458). */
export function PersonaYouSheetStory({ chatId }: { readonly chatId?: ChatId } = {}): ReactElement {
  // `notify` no-ops in the CT harness, so the story binds it to a DOM sink: the last notice's action renders
  // as a button the CT can press, the way the toast host would.
  const [notice, setNotice] = useState<NotifyNotice | null>(null);
  useState(() => {
    if (chatId !== undefined) {
      selectChat(chatId);
    }
    const sink = (raised: NotifyInput): void => setNotice(toNotice(raised));
    bindNotify({ error: sink, info: sink, success: sink, warn: sink });
    return null;
  });
  return (
    <CtDataProviders>
      <div style={{ width: 320 }}>{personaChrome.behavior.kind === "widget" ? personaChrome.behavior.body("sheet") : null}</div>
      <p data-testid="notified">{notice?.title ?? ""}</p>
      {notice?.action === undefined ? null : (
        <button onClick={notice.action.onClick} type="button">
          {notice.action.label}
        </button>
      )}
    </CtDataProviders>
  );
}

/** The BAR lens — the rail switcher POPOVER (#866 S4), with a chat optionally seeded so the CT can drive
 *  the contextual in-chat block (Applies scope · re-attribute). The `.ct.tsx` stubs `persona.list`,
 *  `settings.getUserSettings` and (when a chat is seeded) `chat.getChat`; it owns the `castId` seam. */
export function PersonaSwitcherBarStory({ chatId }: { readonly chatId?: ChatId }): ReactElement {
  useState(() => {
    if (chatId !== undefined) {
      selectChat(chatId);
    }
    return null;
  });
  return (
    <CtDataProviders>
      <div style={{ width: 480, height: 640 }}>{personaChrome.behavior.kind === "widget" ? personaChrome.behavior.body("bar") : null}</div>
    </CtDataProviders>
  );
}

/** The switcher beside the Personas section body it deep-links into. The shell's rail-to-Settings switch is
 *  not mounted here; what is under test is the landing contract: the switcher's Edit door closes its popover
 *  and the list opens that persona's editor, focused. */
export function PersonaEditDoorStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ display: "flex", gap: 16, width: 900 }}>
        <div style={{ width: 120, height: 640 }}>{personaChrome.behavior.kind === "widget" ? personaChrome.behavior.body("bar") : null}</div>
        <div style={{ width: 360 }}>
          <QueryBoundary fallback={<p>Loading…</p>} renderError={(): ReactElement => <p>error</p>}>
            <PersonaList />
          </QueryBoundary>
        </div>
      </div>
    </CtDataProviders>
  );
}

/** The switcher beside a Settings that is NOT mounted yet: the Config panes appear only once the Edit door
 *  selects a persona, the way the shell mounts Settings on the first jump — so the list's arrival focus runs
 *  AFTER the door has focused the editor. */
export function PersonaEditDoorColdStory(): ReactElement {
  useState(() => {
    __resetConfigNav();
    return null;
  });
  return (
    <CtDataProviders>
      <CtRealConfigSectionRegistry>
        <TooltipProvider>
          <div style={{ display: "flex", gap: 16, width: 1100 }}>
            <div style={{ width: 120, height: 640 }}>{personaChrome.behavior.kind === "widget" ? personaChrome.behavior.body("bar") : null}</div>
            <ColdConfigPanes />
          </div>
        </TooltipProvider>
      </CtRealConfigSectionRegistry>
    </CtDataProviders>
  );
}

// The CONTENT pane mounts with the selection and the LIST a beat later — the order a lazily-loaded Settings
// produces, which is what lets the list's arrival focus land after the editor already has focus.
function ColdConfigPanes(): ReactElement | null {
  const selected = usePersonaEditorId();
  const [listMounted, setListMounted] = useState(false);
  useEffect(() => {
    if (selected === null) {
      return;
    }
    const timer = setTimeout((): void => setListMounted(true), LIST_MOUNT_DELAY_MS);
    return (): void => clearTimeout(timer);
  }, [selected]);
  if (selected === null) {
    return null;
  }
  return (
    <div style={{ display: "flex", height: 560, width: 900 }}>
      <div style={{ minHeight: 0, overflow: "auto", width: 280 }}>{listMounted ? <ConfigListSurface groups={realConfigGroups} /> : null}</div>
      <div style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
        <ConfigContentSurface groups={realConfigGroups} />
      </div>
    </div>
  );
}

/** The LIST at its ONE remaining mount posture — the Config → Personas section body (#866 S4 moved it
 *  out of the popover and the sheet). 360px stands in for the narrowest real content-pane column (a 430px
 *  phone minus the pane padding); the #443/#458/#463 collision pins run against this mount now. */
export function PersonaListStory({ width = 360 }: { readonly width?: number } = {}): ReactElement {
  // `notify` no-ops in the CT harness, so the story binds it to a DOM sink the CT reads.
  const [notified, setNotified] = useState<string>("");
  useState(() => {
    const sink = (notice: NotifyInput): void => setNotified(toNotice(notice).title);
    bindNotify({ error: sink, info: sink, success: sink, warn: sink });
    return null;
  });
  return (
    <CtDataProviders>
      <div style={{ width }}>
        <QueryBoundary fallback={<p>Loading…</p>} renderError={(): ReactElement => <p>error</p>}>
          <PersonaList />
        </QueryBoundary>
      </div>
      <p data-testid="notified">{notified}</p>
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
          isDefault={false}
          onDelete={(): void => setFired("delete")}
          onClearDefault={(): void => setFired("clear")}
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

/** The FIRST-RUN persona gate — the forced dialog a viewer who owns zero personas meets before chatting.
 *  Mounted bare, the way `AppRoot` mounts it (an AppShell sibling on `/`): the gate reads `persona.list`
 *  itself and renders nothing until the zero-personas trigger fires. */
export function FirstRunPersonaDialogStory(): ReactElement {
  return (
    <CtDataProviders>
      <FirstRunPersonaDialog />
    </CtDataProviders>
  );
}

/** The Personas NOTIFICATIONS section with a REOPEN driver (#1726, the `LooksSectionReopenStory` idiom).
 *  The section's `QueryBoundary` carries `reserveKey="config.personas.notifications"`, and a reservation is
 *  only observable across a SECOND cold read of the same surface: the box store is module-level and
 *  survives, while `key`-ing the providers gives the remount a fresh QueryClient so `getUserSettings` is
 *  actually re-requested rather than served from cache. The tail sentinel below is what a reader is
 *  looking at when the pane jumps — the section sits mid-column in the Personas group, so everything under
 *  it pays the delta between a text line and a control row. */
export function PersonaNotificationsReopenStory(): ReactElement {
  const [open, setOpen] = useState(0);
  return (
    <>
      <button type="button" onClick={(): void => setOpen((n) => n + 1)}>
        reopen
      </button>
      <CtDataProviders key={open}>
        <div style={{ width: 720, padding: 16 }}>
          <PersonaNotificationsSection />
          <div data-testid="personas-notifications-tail" style={{ height: 8 }} />
        </div>
      </CtDataProviders>
    </>
  );
}
