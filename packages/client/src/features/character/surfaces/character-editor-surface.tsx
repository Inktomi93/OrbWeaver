// character-editor-surface — the Characters CONTENT when a row is selected (FINAL-Character §6). SUPERSEDES
// the J9 read-only detail card (character-detail-surface/character-detail-card, now deleted): a read-only
// card left mounted beside an editor would be TWO CONTENT homes for one artifact (a one-home violation). The
// route mounts this in the `characters` CONTENT slot when `selectedCharacterId` is set (home-page.tsx); a
// null selection falls back to CharacterLibraryWelcome.
//
// ONE always-editing bound form (`createSavedEntityForm`, §13.4) over the DRAFT card-content fields, with a
// `key={mountKey}` full remount on character switch. The hero NAME is a draft field; the hero portrait/star/
// archive + the tags row are IMMEDIATE identity commits OUTSIDE the form (§2). The save-bar (sticky at the
// TOP of CONTENT) carries the §6.5 token split (N total · M permanent), the dirty pill, Discard, and Save.
//
// The hero chat affordances (§9c): "New chat" ALWAYS starts a fresh thread with this character; "N chats ›"
// scopes the roomy Chats LIST to this character (state/chat-list-filter-store) and switches sections — the
// per-character chat view is the filtered Chats list, not a parallel list here. `chatCount` is a RENDER
// derivation over the bus-driven `listChats` (§5.1 — never an effect on a selection pointer).

import type { CharacterId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import { SaveBar } from "@orb/ui/save-bar";
import { Text } from "@orb/ui/text";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { QueryBoundary, useInvalidation, useTRPC } from "#data";
import { useFocusOnMount } from "#lib";
import {
  clearCharacterFacet,
  clearChatListCharacterFilter,
  selectCharacterFacet,
  setActiveSection,
  setChatListCharacterFilter,
  startNewChat,
  useSelectedCharacterFacetId,
} from "#state";
import { CharacterFacetEditor } from "../components/character-facet-editor";
import { CharacterFacetList } from "../components/character-facet-list";
import { CharacterHeroBand } from "../components/character-hero-band";
import { useCharacterForm } from "../hooks/use-character-form";
import { useUpdateCharacter } from "../hooks/use-character-mutations";
import type { CharacterCardFacet } from "../lib/character-card-facets";
import type { CharacterCardFormValues } from "../lib/character-card-form-model";
import {
  characterCardFormFromDetail,
  characterUpdateDiff,
  permanentTokenCount,
  totalTokenCount,
} from "../lib/character-card-form-model";
import { clearCharacterForm, publishCharacterForm } from "../lib/character-editor-bridge";

export interface CharacterEditorSurfaceProps {
  readonly characterId: CharacterId;
  /** Reveal the CONTEXT Field inspector (the route-built choreography) — a facet-row click calls this AFTER
   *  writing the facet selection. Mirrors the preset editor's `onRevealSection`. */
  readonly onRevealField?: (() => void) | undefined;
}

/** The character editor, over `character.get` (suspense + error/loading via QueryBoundary). */
export function CharacterEditorSurface({
  characterId,
  onRevealField,
}: CharacterEditorSurfaceProps): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text tone="muted">Loading character…</Text>}
      renderError={(_error, retry): ReactElement => (
        <Text tone="muted">
          Couldn't load this character.{" "}
          <Button intent="ghost" onClick={retry}>
            Retry
          </Button>
        </Text>
      )}
    >
      {/* key={characterId} remounts the body on a character switch (F17 — render-only remount, §5.1). */}
      <CharacterEditorBody
        characterId={characterId}
        onRevealField={onRevealField}
        key={characterId}
      />
    </QueryBoundary>
  );
}

function CharacterEditorBody({
  characterId,
  onRevealField,
}: CharacterEditorSurfaceProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const update = useUpdateCharacter({ trpc, invalidation });
  const { data } = useSuspenseQuery(trpc.character.get.queryOptions({ characterId }));

  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);
  const selectedFacetId = useSelectedCharacterFacetId();
  // The drill-in ← Back focus-restore target (side-eye P3): activating a facet drops `activeElement` to
  // `<body>`, so on Back we tell the re-mounting facet list WHICH row should reclaim focus (app-owned, not
  // the browser's DOM-position heuristic). State, not a ref — the facet list reads it as a prop, and the
  // row focuses itself once on mount; a lingering value is harmless (a row re-focuses only if it remounts,
  // i.e. another drill-in→Back cycle, which sets a fresh target).
  const [backFocusFacetId, setBackFocusFacetId] = useState<CharacterCardFacet["id"] | null>(null);

  // The greeting the hero is previewing (drives the §6.5 total) — lifted here so the save-bar total agrees.
  const [activeGreetingIndex, setActiveGreetingIndex] = useState(0);

  // Save = the whole-card `character.update`, re-mapped back to form values (the re-baseline source,
  // obligation 3). Only the DRAFT card fields flow through here; identity fields patch elsewhere (§2).
  const save = async (values: CharacterCardFormValues): Promise<CharacterCardFormValues> => {
    const saved = await update.mutateAsync({
      characterId,
      // §2: send only the keys the user CHANGED (diffed against the server row `data`), never a full-object
      // PUT — that would silently revert a concurrent edit to an untouched field (F3).
      input: characterUpdateDiff(values, data),
    });
    return characterCardFormFromDetail(saved);
  };

  const { form, mountKey, discard } = useCharacterForm({
    entityId: data.id,
    serverValues: characterCardFormFromDetail(data),
    save,
  });

  // The bus-driven chat list — the hero's chat count ("N chats ›") + the "New chat" seam derive from it in
  // render (§5.1 — never an effect on a selection pointer). `chatCount` counts THIS character's threads.
  const chatsQuery = useQuery(trpc.chat.listChats.queryOptions({}));
  const chats = useMemo(() => chatsQuery.data ?? [], [chatsQuery.data]);
  const chatCount = useMemo(
    () => chats.filter((chat) => chat.participantCharacterIds.includes(data.id)).length,
    [chats, data.id],
  );

  // Hero "New chat" — ALWAYS a fresh chat with this character (not resume-or-new; the hero's job is to start
  // a new thread, per the redesign), then jump to the roomy Chats section. Clear any per-character LIST
  // filter so the fresh draft isn't shown behind a stale scope chip.
  const onNewChat = (): void => {
    clearChatListCharacterFilter();
    startNewChat({ characterIds: [data.id] });
    setActiveSection("chats");
  };
  // Hero "N chats ›" — scope the roomy Chats LIST to THIS character's threads (state/chat-list-filter-store)
  // AND switch to the Chats section. The Chats LIST reads the filter, shows a "filtered by [name] ✕" chip,
  // and the user opens a past thread or starts a new one from there (the redesign's real per-character view).
  // We set the filter but DON'T pre-select a thread: the filtered list IS the landing (§4.2 rule 1).
  const onViewChats = (): void => {
    setChatListCharacterFilter({ id: data.id, name: data.name });
    setActiveSection("chats");
  };

  // THE CHARACTER FORM BRIDGE — publish the live handle so the CONTEXT Field inspector (a sibling shell
  // region, no shared React ancestor) can bind the facet's small fields (depth/role, provenance). Re-
  // publishes when the form instance changes (a save/reset cycles `mountKey` → a fresh `form`); clears on
  // unmount so a stale handle never outlives the editor (mirrors the preset editor's bridge effect).
  useEffect(() => {
    publishCharacterForm({ characterId: data.id, form });
    return (): void => clearCharacterForm();
  }, [data.id, form]);

  // A facet-row click does BOTH: write the facet selection (drills CONTENT into the facet body AND drives
  // the CONTEXT Field tab) + reveal the CONTEXT inspector (the route builds the reveal). Mirrors the preset
  // rack's `onSelectSection` two-things-at-once.
  const onSelectFacet = (id: CharacterCardFacet["id"]): void => {
    selectCharacterFacet(id);
    onRevealField?.();
  };

  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="h-full overflow-y-auto outline-none">
      <form
        key={mountKey}
        onSubmit={(event): void => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <Stack gap="section" className="mx-auto w-full max-w-(--container-cq-lg)" padding="section">
          <SaveBar title={data.name} kind="Character" sticky="header">
            <form.Subscribe selector={(s): CharacterCardFormValues => s.values}>
              {(values): ReactElement => (
                <Text size="micro" tone="muted" className="font-mono">
                  {totalTokenCount(values, activeGreetingIndex)} total ·{" "}
                  {permanentTokenCount(values)} permanent
                </Text>
              )}
            </form.Subscribe>
            <form.AppForm>
              <form.DirtyPill />
            </form.AppForm>
            <Button type="button" intent="ghost" onClick={discard}>
              Discard changes
            </Button>
            {/* Save is `primary` ONLY while dirty (not `isDefaultValue`): at rest the hero "Start chat" is
                the region's ONE primary (§6.1 / UI-Arch §4.3 rule 3 — "one primary visible per region at
                rest"). A local bound Button (not the shared `form.SubmitButton`, which is always-primary)
                keeps the intent-by-dirtiness confined to this surface. F8. */}
            <form.Subscribe
              selector={(s): readonly [boolean, boolean, boolean] =>
                [s.canSubmit, s.isSubmitting, s.isDefaultValue] as const
              }
            >
              {([canSubmit, isSubmitting, isDefaultValue]): ReactElement => (
                <Button
                  type="submit"
                  intent={isDefaultValue ? "secondary" : "primary"}
                  disabled={!canSubmit || isSubmitting}
                  loading={isSubmitting}
                >
                  Save
                </Button>
              )}
            </form.Subscribe>
          </SaveBar>

          <CharacterHeroBand
            detail={data}
            form={form}
            trpc={trpc}
            onNewChat={onNewChat}
            onViewChats={onViewChats}
            chatCount={chatCount}
            activeGreetingIndex={activeGreetingIndex}
            onActiveGreetingIndexChange={setActiveGreetingIndex}
          />

          {/* CONTENT = a master FACET LIST (tiered Voice/Extras/Advanced) → click a row → the list is
              REPLACED by the full-width facet BODY editor (← Back to return). This one calm master→drill-in
              REPLACES the old flat Main/Advanced two-tab scroll (side-eye P0 #1 SaveBar z-fight + P0 #3
              tab-click-no-scroll both DISSOLVE — there is no second `Tabs` and no off-screen tab body). */}
          {selectedFacetId === null ? (
            <CharacterFacetList
              form={form}
              selectedFacetId={null}
              focusFacetId={backFocusFacetId}
              onSelect={onSelectFacet}
            />
          ) : (
            <CharacterFacetEditor
              form={form}
              facetId={selectedFacetId as CharacterCardFacet["id"]}
              trusted={data.trustHtml === true}
              readOnly={{
                importedFrom: data.importedFrom,
                importHash: data.importHash,
                extensions: data.extensions,
                residualData: data.residualData,
                refinery: data.refinery,
              }}
              onBack={(): void => {
                // Remember the facet we're leaving so the re-mounting list restores focus to its row.
                setBackFocusFacetId(selectedFacetId as CharacterCardFacet["id"]);
                clearCharacterFacet();
              }}
            />
          )}
        </Stack>
      </form>
    </Stack>
  );
}
