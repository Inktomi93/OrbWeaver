// Character library CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module). The
// anchor + surface come through the feature front door; `CharacterCardTile` too (a leaf, but its own props
// type is exported from the front door so a story can drive it directly without a network layer).
//
// `CharacterCardTileStoryProps.tags` takes PLAIN string ids (CT-serializable — the branded `TagId`/
// `CharacterId` types are compile-time only, so `castId` is a zero-cost cast run HERE, inside the story
// component that executes post-mount in the real browser context, never at the `.ct.tsx` call site —
// the same "build the branded shape inside the story" precedent `MessageRowStory` sets for `Map`s).

import { useTRPC } from "@orb/client/data";
import {
  CharacterActionsMenu,
  CharacterAppearanceTab,
  CharacterBulkBar,
  CharacterCardTile,
  CharacterEditorSurface,
  CharacterFacetInspector,
  CharacterLibraryAnchor,
  CharacterLibrarySurface,
  CharacterLibraryWelcome,
  CharacterOptionsTab,
} from "@orb/client/features/character";
import type { CharacterDetailContribution } from "@orb/client/lib";
import { createContributorRegistry } from "@orb/client/lib";
import {
  clearCharacterSelection,
  selectCharacter,
  setFocusMode,
  useActiveChatId,
  useActiveSection,
  useSectionRegistry,
  useSelectedRefinerySessionId,
} from "@orb/client/state";
import type { CharacterHandle, CharacterId, TagId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
// The shell's own CONTEXT-panel consumer, by its internal path: a story is the one place allowed to reach a
// feature's internals to mount the REAL production host (the app-shell stories do the same).
import { SectionContextHost } from "../../../../packages/client/src/features/app-shell/components/section-context-host.tsx";
import { CtAppDataProviders, CtCharacterContributorSectionRegistry, CtDataProviders, CtRealSectionRegistry } from "../../../support/ct/ct-data-providers.tsx";
import { CtToastSurface } from "../../lib/_ct-stories.tsx";

// The door's empty character-detail registry (§6c) — stories that don't test the seam pass this, mirroring
// main.tsx's zero-contribution assembly (byte-identical to today's editor, no review-section wrapper).
const NO_DETAIL_CONTRIBUTORS = createContributorRegistry<CharacterDetailContribution>("character-detail", []);

// ── Pure-render story (no data layer) ───────────────────────────────────────────────────────────

interface CharacterCardTileStoryTag {
  readonly id: string;
  readonly name: string;
  readonly isHiddenOnCard: boolean;
}

export interface CharacterCardTileStoryProps {
  readonly name?: string;
  readonly handle?: CharacterHandle;
  /** #517 — the server's library-wide verdict that another character carries this name. The row spends its
   *  handle as a visible + announced disambiguator on exactly this. */
  readonly nameIsAmbiguous?: boolean;
  readonly archived?: boolean;
  readonly starred?: boolean;
  readonly avatarHash?: string | null;
  readonly elevatorPitch?: string | null;
  readonly tags?: readonly CharacterCardTileStoryTag[];
  readonly selected?: boolean;
  readonly bulkMode?: boolean;
  readonly bulkSelected?: boolean;
}

/** The bare `<CharacterCardTile>` (§4.4 row) — drives avatar/subtitle-ladder/star/accent/bulk rendering in
 *  isolation; each action records its id into a visible marker so a CT can assert the seam fires with the
 *  right character id (the callback closures run in-browser, inside this story). */
export function CharacterCardTileStory({
  name = "Aria Nightshade",
  handle = castId<CharacterHandle>("aria-nightshade"),
  nameIsAmbiguous = false,
  archived = false,
  starred = false,
  avatarHash = null,
  elevatorPitch = null,
  tags = [],
  selected = false,
  bulkMode = false,
  bulkSelected = false,
}: CharacterCardTileStoryProps): ReactElement {
  const [chattedId, setChattedId] = useState<string | null>(null);
  const [bulkId, setBulkId] = useState<string | null>(null);
  const [starredId, setStarredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [archivedId, setArchivedId] = useState<string | null>(null);
  const [duplicatedId, setDuplicatedId] = useState<string | null>(null);
  const [deletedId, setDeletedId] = useState<string | null>(null);
  return (
    <div style={{ width: 360 }}>
      <CharacterCardTile
        bulkMode={bulkMode}
        bulkSelected={bulkSelected}
        character={{
          id: castId<CharacterId>("char_ct_story"),
          name,
          handle,
          nameIsAmbiguous,
          archived,
          starred,
          avatarHash,
          elevatorPitch,
          themeOverride: null,
          tokenSize: 128,
          // `folderType` defaults to the plain-tag value here: the ROW never reads it (it decides a
          // categorized GROUP's first paint, C9-1d), so a story tag carries the neutral one.
          tags: tags.map((tag) => ({ folderType: "NONE" as const, ...tag, id: castId<TagId>(tag.id) })),
        }}
        onChat={setChattedId}
        onDelete={(id): void => setDeletedId(id)}
        onDuplicate={(id): void => setDuplicatedId(id)}
        onSelect={setSelectedId}
        onToggleArchive={(id): void => setArchivedId(id)}
        onToggleBulk={setBulkId}
        onToggleStar={(id): void => setStarredId(id)}
        selected={selected}
      />
      <p data-testid="chatted-id">{chattedId ?? ""}</p>
      <p data-testid="bulk-id">{bulkId ?? ""}</p>
      <p data-testid="starred-id">{starredId ?? ""}</p>
      <p data-testid="selected-id">{selectedId ?? ""}</p>
      <p data-testid="archived-id">{archivedId ?? ""}</p>
      <p data-testid="duplicated-id">{duplicatedId ?? ""}</p>
      <p data-testid="deleted-id">{deletedId ?? ""}</p>
    </div>
  );
}

// ── Editor surface story (§6 — the CONTENT editor; data layer, trpc stubbed at the network) ─────────

export interface CharacterEditorSurfaceStoryProps {
  /** Pin the editor's width — the save bar and the suggestion rail are both width-sensitive (side-eye
   *  2026-08-18 P1-4 / P2-5 measured both at a 430px phone). Omitted = the desk width. */
  readonly width?: number;
}

/** The §6 character editor over the real data layer (`character.get` + `chat.listChats` stubbed by
 *  routeTrpc). Fixed to one id so the CT drives the whole hero + tabs + save-bar. */
export function CharacterEditorSurfaceStory({ width = 720 }: CharacterEditorSurfaceStoryProps = {}): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 640, width }}>
        <CharacterEditorSurface characterId={castId<CharacterId>("char_ct_1")} detailContributors={NO_DETAIL_CONTRIBUTORS} />
      </div>
    </CtDataProviders>
  );
}

/** The same editor, mounted on the REAL app QueryClient + the real toast surface — the wiring a "Suggest
 *  tags" FAILURE needs to be observable at all: the refusal rides `meta.errorToast` → `notify.error` → the
 *  Toaster. `CtDataProviders`' plain client has no MutationCache error channel, so a toast CT must use this
 *  stack (the on-demand distill's refusal copy is the whole user-facing half of the 2026-08-03 fix). */
export function CharacterEditorSuggestToastStory(): ReactElement {
  return (
    <CtAppDataProviders>
      <CtToastSurface>
        <div style={{ height: 640, width: 720 }}>
          <CharacterEditorSurface characterId={castId<CharacterId>("char_ct_1")} detailContributors={NO_DETAIL_CONTRIBUTORS} />
        </div>
      </CtToastSurface>
    </CtAppDataProviders>
  );
}

// ── The character-detail CONTRIBUTOR seam (client-architecture-lockdown.md §6c) ─────────────────────
// The seam is built EMPTY at the door; no CT had ever mounted a LIVE contribution through it. This proves
// a fake `CharacterDetailContribution` at the `editor-sections` anchor, registered at a door-mirroring
// `CtCharacterContributorSectionRegistry` in place of main.tsx's empty registry, renders as a real review
// section in the editor body AND `when`-gates — through the REAL section → `makeCharactersSection` →
// `CharacterContent` → `CharacterEditorSurface` anchor-consumer path (not a bespoke test double).

const CT_DETAIL_SECTION_ID = "ct-fake-detail-section";

export interface CharacterDetailContributorStoryProps {
  /** Drives the fake section's `when` — `false` proves the anchor HIDES it (no wrapper, today's layout). */
  readonly visible: boolean;
}

/** Mounts the characters section's CONTENT through the real registry (`registry.get("characters").content()`)
 *  — the same call the shell's `SectionContent` makes — so the contributor CT drives the production path. */
function CharacterContentHarness(): ReactElement {
  const registry = useSectionRegistry();
  const content = registry.get("characters").content;
  if (typeof content !== "function") {
    throw new Error("ct-stories: characters section content is a planned stub, not a body");
  }
  return <div style={{ height: 640, width: 720 }}>{content()}</div>;
}

export function CharacterDetailContributorStory({ visible }: CharacterDetailContributorStoryProps): ReactElement {
  useEffect(() => {
    selectCharacter(castId<CharacterId>("char_ct_1"));
  }, []);
  const fakeSection: CharacterDetailContribution = {
    id: CT_DETAIL_SECTION_ID,
    anchor: "editor-sections",
    when: () => visible,
    body: (): ReactElement => <div data-testid="ct-fake-detail-section">fake review card</div>,
  };
  const detailContributors = createContributorRegistry<CharacterDetailContribution>("character-detail", [fakeSection]);
  return (
    <CtDataProviders>
      <CtCharacterContributorSectionRegistry detailContributors={detailContributors}>
        <CharacterContentHarness />
      </CtCharacterContributorSectionRegistry>
    </CtDataProviders>
  );
}

/** The §8.1 CONTEXT Appearance tab over the real data layer (`character.get` + `character.update` stubbed
 *  by routeTrpc) — drives the per-character theme cluster's immediate-commit / reset / per-field-clear. */
export function CharacterAppearanceTabStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 720 }}>
        <CharacterAppearanceTab characterId={castId<CharacterId>("char_ct_1")} />
      </div>
    </CtDataProviders>
  );
}

/** The CONTEXT Options tab at the real context-panel width — the tab OWNS the field orientation for the
 *  theme cluster it re-homes, so the density contract is only observable through this mount, never
 *  through `CharacterAppearanceTabStory`. */
export function CharacterOptionsTabStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 463 }}>
        <CharacterOptionsTab characterId={castId<CharacterId>("char_ct_1")} />
      </div>
    </CtDataProviders>
  );
}

// ── Surface story (data layer — trpc stubbed at the network) ───────────────────────────────────────

export interface CharacterLibrarySurfaceStoryProps {
  /** Pin the LIST panel width (the toolbar's flex row is width-sensitive — F1). Omitted = the mount root's. */
  readonly width?: number;
}

/** The library surface wrapped in its anchor + the real data layer (`routeTrpc` stubs the network), with
 *  the section's real LIST chrome band above it — the title + create/import menu live THERE now
 *  (list-pane-projection L1 / D66 A1), so a surface mounted without the band is not the production pane. */
export function CharacterLibrarySurfaceStory({ width }: CharacterLibrarySurfaceStoryProps = {}): ReactElement {
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        {/* The import path's outcome is a `notify.*` call, so the story carries the real toast surface —
            `notify` is BOUND for every story in this module (bindNotify is module-global; importing
            CtToastSurface anywhere in the module binds it), which makes the console fallback unreachable.
            Rendered pixels are the honest assertion for it anyway. */}
        <CtToastSurface>
          <div style={width === undefined ? { height: 480 } : { height: 480, width }}>
            <CharactersListBand />
            <CharacterLibraryAnchor>
              <CharacterLibrarySurface />
            </CharacterLibraryAnchor>
          </div>
        </CtToastSurface>
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

/** The characters section's own `listHeader` closure, rendered where the shell's PanelChrome renders it. */
function CharactersListBand(): ReactElement {
  const registry = useSectionRegistry();
  return <div data-testid="list-band">{registry.get("characters").listHeader?.()}</div>;
}

// ── The CONTEXT Field tab (§6c) — the panel body the shell renders beside the editor ────────────────

/** `<CharacterFacetInspector>` at the docked CONTEXT-panel width, over the real data layer. With no facet
 *  drilled (the store's resting state) this is the F4 overview card. */
export function CharacterFacetInspectorStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 640, width: 480 }}>
        <CharacterFacetInspector characterId={castId<CharacterId>("char_ct_1")} />
      </div>
    </CtDataProviders>
  );
}

// ── Bulk-bar story (P1: the narrow-panel clip regression) ──────────────────────────────────────────

/** `<CharacterBulkBar>` under the data layer, in a NARROW (~337px) LIST panel — the width side-eye measured
 *  the Delete button clipped at. `trpc` is read inside the provider tree (the surface's own wiring). */
function BulkBarInner(): ReactElement {
  const trpc = useTRPC();
  return <CharacterBulkBar ids={["char_a", "char_b", "char_c"]} onClear={(): void => undefined} selectedCount={3} trpc={trpc} />;
}

export function CharacterBulkBarStory(): ReactElement {
  return (
    <CtDataProviders>
      <div data-testid="bulk-panel" style={{ width: 337 }}>
        <BulkBarInner />
      </div>
    </CtDataProviders>
  );
}

// ── The LIST pane + the CONTEXT pane, through the REAL section registry ─────────────────────────────
// `registry.get("characters").list()` / `.listHeader()` / `.context` are the same calls the shell's list
// region, PanelChrome and `SectionContextHost` make — so these drive the PRODUCTION path end to end,
// including the `makeCharactersSection` door param and the chat-owned projection body threaded in at it.
// A bespoke mount of a pane component would prove none of that.
//
// The LIST harness used to carry a `selectedCharacterId` PROJECTION arm, because the pane swapped roles on
// selection (Arm A). #501 ended the swap — the pane is the library in both arms — so selection is now just
// state the CT sets to prove the library STAYS.

/** Mirrors the shell's two LIST mount points: the chrome band + the pane, in one box. */
function CharactersListHarness(): ReactElement {
  const registry = useSectionRegistry();
  const definition = registry.get("characters");
  const list = definition.list;
  if (typeof list !== "function") {
    throw new Error("ct-stories: the characters section has no list pane");
  }
  const activeSection = useActiveSection();
  const activeChatId = useActiveChatId();
  return (
    <div style={{ height: 560, width: 320 }}>
      <div data-testid="list-band">{definition.listHeader?.()}</div>
      {list()}
      {/* Probes for the cross-section WRITES the pane fires (assert the store action, not a UI echo). */}
      <p data-testid="active-section">{activeSection}</p>
      <p data-testid="started-chat">{activeChatId ?? ""}</p>
    </div>
  );
}

export interface CharactersListPaneStoryProps {
  /** Pre-select a character — the arm that proves the library STAYS (#501). Omitted = nothing selected. */
  readonly selectedCharacterId?: string;
}

/** The characters LIST band + pane over the real registry and the real data layer. */
export function CharactersListStory({ selectedCharacterId }: CharactersListPaneStoryProps = {}): ReactElement {
  useEffect(() => {
    if (selectedCharacterId !== undefined) {
      selectCharacter(castId<CharacterId>(selectedCharacterId));
    }
    return (): void => clearCharacterSelection();
  }, [selectedCharacterId]);
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <CharactersListHarness />
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

/** Mirrors the shell's CONTEXT mount: `SectionContextHost` over the section definition — the real tab strip
 *  (Field · Chats · Links · Options) and the real body, at the docked panel's width. The cross-section
 *  probes ride along, because a projection row click is a store write, never a UI echo. */
function CharactersContextHarness(): ReactElement {
  const registry = useSectionRegistry();
  const activeSection = useActiveSection();
  const activeChatId = useActiveChatId();
  return (
    <div style={{ height: 640, width: 384 }}>
      <SectionContextHost definition={registry.get("characters")} />
      <p data-testid="active-section">{activeSection}</p>
      <p data-testid="started-chat">{activeChatId ?? ""}</p>
    </div>
  );
}

export interface CharactersContextStoryProps {
  /** The open character whose CONTEXT the pane shows — the tabs' whole state projection. */
  readonly selectedCharacterId: string;
}

/** The characters CONTEXT panel over the real registry + data layer (#501 — her chats live here now). */
export function CharactersContextStory({ selectedCharacterId }: CharactersContextStoryProps): ReactElement {
  useEffect(() => {
    selectCharacter(castId<CharacterId>(selectedCharacterId));
    return (): void => clearCharacterSelection();
  }, [selectedCharacterId]);
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <CharactersContextHarness />
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

// ── The COMPOSED characters screen: LIST pane + CONTENT editor + CONTEXT panel — the three regions one
// selection drives. Composed, not separate, because the findings live BETWEEN them: whether the library
// survives a pick (#501) is a claim about LIST while CONTENT mounts, and whether the hero's "N chats ›"
// lands anywhere is a claim about CONTENT writing a tab CONTEXT renders. All three come from the REAL
// section registry, exactly as the shell renders them.

/** The characters section's LIST (band + pane), its CONTENT (the editor) and its CONTEXT (the tab panel),
 *  plus a NON-picker entry into the same selection — a deep link / agent nav. */
function CharactersScreenHarness(): ReactElement {
  const registry = useSectionRegistry();
  const definition = registry.get("characters");
  const list = definition.list;
  const content = definition.content;
  if (typeof list !== "function" || typeof content !== "function") {
    throw new Error("ct-stories: the characters section has no list pane or content body");
  }
  return (
    <div style={{ display: "flex", height: 560 }}>
      <div style={{ width: 320 }}>
        <div data-testid="list-band">{definition.listHeader?.()}</div>
        {list()}
      </div>
      <div data-testid="content-region" style={{ flex: 1, minWidth: 0 }}>
        {content()}
      </div>
      <div data-testid="context-region" style={{ width: 384 }}>
        <SectionContextHost definition={definition} />
      </div>
    </div>
  );
}

// ── The CONTEXT actions menu, with its CROSS-SECTION door (#157's third door) ────────────────────────

export interface CharacterActionsMenuStoryProps {
  /** The card the menu acts on — the same id "Open in Refinery" must carry across the section boundary.
   *  A PLAIN string (CT-serializable; see the header) and deliberately NOT spelled `characterId`, which is
   *  a branded NAME POSITION the `brand-in-name-position` gate owns — the `deepLinkCharacterId` prop below
   *  set that precedent for exactly this reason. `castId` runs inside the story component. */
  readonly menuCharacterId: string;
}

/**
 * `CharacterActionsMenu` on the REAL data tier + toast channel, with the two facts a cross-section jump
 * produces rendered as text a CT can read: which section is active, and which refinery session is open.
 * Both come off the shared state seam the flow writes (`#data`'s `useOpenRefinery`), which is the whole
 * point — the character feature never imports the refinery feature, so the only observable a CT can hold
 * it to is the shell-level outcome.
 */
export function CharacterActionsMenuStory({ menuCharacterId }: CharacterActionsMenuStoryProps): ReactElement {
  return (
    <CtAppDataProviders>
      <CtToastSurface>
        <CharacterActionsMenu characterId={castId<CharacterId>(menuCharacterId)} />
        <RefineryJumpReadout />
      </CtToastSurface>
    </CtAppDataProviders>
  );
}

function RefineryJumpReadout(): ReactElement {
  const section = useActiveSection();
  const sessionId = useSelectedRefinerySessionId();
  return (
    <div>
      <p data-testid="active-section">{`section=${section}`}</p>
      <p data-testid="refinery-session">{`session=${sessionId ?? "none"}`}</p>
    </div>
  );
}

export interface CharactersScreenStoryProps {
  /** The character a NON-picker entry (the "deep link" button) selects — the CONTENT-owned focus arm. */
  readonly deepLinkCharacterId: string;
}

/** LIST + CONTENT together, with a deep-link control the CT can press to enter the same selection WITHOUT
 *  the picker (the two focus arms differ only by that intent). */
export function CharactersScreenStory({ deepLinkCharacterId }: CharactersScreenStoryProps): ReactElement {
  useEffect(() => (): void => clearCharacterSelection(), []);
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <button data-testid="deep-link" onClick={(): void => selectCharacter(castId<CharacterId>(deepLinkCharacterId))} type="button">
          Open via deep link
        </button>
        <CharactersScreenHarness />
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}

/** The Characters CONTENT teaching hero with a live driver for the shell's LIST MODE (#446). Both arms in
 *  ONE mount, because a CT mounts once per test and the finding is which arm the SAME pane shows.
 *
 *  THE DRIVER IS FOCUS MODE — the shell's ONE flag for "no side panel is showing" (item 20): regime-free,
 *  section-independent and SYNCHRONOUS, where `setPanelMode` writes the ACTIVE section's override and
 *  `setActiveSection` defers its write through `withViewTransition` (a story doing both in one handler
 *  lands the override on the previous section — measured, #434). The pane reads the RESOLVED mode, so any
 *  regime resolving `collapsed` exercises it; the override path's own resolution is pinned in
 *  `shell-store.ct` / `section-list-projection.ct`. Under the REAL registry, because the projection reads
 *  this section's declared `panelDefaults`. */
export function CharacterLibraryWelcomeListModeStory(): ReactElement {
  return (
    <CtDataProviders>
      <CtRealSectionRegistry>
        <button onClick={(): void => setFocusMode(true)} type="button">
          take the list off screen
        </button>
        <button onClick={(): void => setFocusMode(false)} type="button">
          put the list back
        </button>
        <div style={{ height: 640, width: 720 }}>
          <CharacterLibraryWelcome />
        </div>
      </CtRealSectionRegistry>
    </CtDataProviders>
  );
}
