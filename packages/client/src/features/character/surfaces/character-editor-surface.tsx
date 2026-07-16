// The Characters CONTENT when a row is selected. One always-editing AUTOSAVE form over the draft
// card-content fields, with a key={mountKey} full remount on character switch. The hero name is a
// draft field; the hero portrait/star/archive + the tags row are immediate identity commits outside
// the form. Autosave everywhere (D66 A4 / north-star §7): no Save/Discard — the header carries the
// token split + the shared AutosaveStatus (Saved / Saving… / Save failed — Retry) where Save used to be.
//
// Hero chat affordances: "New chat" always starts a fresh thread with this character; "N chats ›"
// scopes the Chats list to this character and switches sections.

import type { CharacterId } from "@orb/kit/ids";
import { Stack } from "@orb/ui/layout";
import { SaveBar } from "@orb/ui/save-bar";
import { Text } from "@orb/ui/text";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import { AutosaveStatus } from "#forms";
import type { CharacterDetailContribution, CharacterDetailState, ContributorRegistry } from "#lib";
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
import { characterCardFormFromDetail, characterUpdateDiff, permanentTokenCount, totalTokenCount } from "../lib/character-card-form-model";
import { clearCharacterForm, publishCharacterForm } from "../lib/character-editor-bridge";

export interface CharacterEditorSurfaceProps {
  readonly characterId: CharacterId;
  /** The character-DETAIL contributor registry (§6c) — the crew feature grafts card-evolution review
   *  sections into the editor body's `editor-sections` anchor without importing character. */
  readonly detailContributors: ContributorRegistry<CharacterDetailContribution>;
  /** Reveal the CONTEXT Field inspector — a facet-row click calls this after writing the selection. */
  readonly onRevealField?: (() => void) | undefined;
}

/** Resolves the `when`-filtered, in-declared-order review-section nodes for the editor body — zero
 *  contributions ⇒ an empty array, so the caller renders no wrapper (byte-identical to today's editor;
 *  §6c/M8 posture). No anchor filter: `editor-sections` is the sole anchor today, so every contribution
 *  targets the body; a SECOND anchor carrying a different state is compile-forced to add the discriminant
 *  narrowing here (the union arm won't typecheck against one `state` shape otherwise). */
function resolveDetailSections(
  registry: ContributorRegistry<CharacterDetailContribution>,
  state: CharacterDetailState,
): readonly { readonly id: string; readonly node: ReactNode }[] {
  return registry
    .list()
    .filter((c) => c.when?.(state) ?? true)
    .map((c) => ({ id: c.id, node: c.body(state) }));
}

export function CharacterEditorSurface({ characterId, detailContributors, onRevealField }: CharacterEditorSurfaceProps): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text tone="muted">Loading character…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="this character" onRetry={retry} />}
    >
      <CharacterEditorBody characterId={characterId} detailContributors={detailContributors} onRevealField={onRevealField} key={characterId} />
    </QueryBoundary>
  );
}

function CharacterEditorBody({ characterId, detailContributors, onRevealField }: CharacterEditorSurfaceProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const update = useUpdateCharacter({ trpc, invalidation });
  const { data } = useSuspenseQuery(trpc.character.get.queryOptions({ characterId }));

  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);
  const selectedFacetId = useSelectedCharacterFacetId();
  // Activating a facet drops activeElement to <body>, so on Back we tell the re-mounting facet list
  // which row should reclaim focus.
  const [backFocusFacetId, setBackFocusFacetId] = useState<CharacterCardFacet["id"] | null>(null);

  // The greeting the hero is previewing — lifted here so the save-bar total agrees.
  const [activeGreetingIndex, setActiveGreetingIndex] = useState(0);

  const save = async (values: CharacterCardFormValues): Promise<CharacterCardFormValues> => {
    const saved = await update.mutateAsync({
      characterId,
      // Send only the keys the user changed, never a full-object PUT that could revert a concurrent edit.
      input: characterUpdateDiff(values, data),
    });
    return characterCardFormFromDetail(saved);
  };

  const { form, mountKey, saveState, retrySave } = useCharacterForm({
    entityId: data.id,
    serverValues: characterCardFormFromDetail(data),
    save,
  });

  // The bus-driven chat list — the hero's chat count derives from it in render, never an effect.
  const chatsQuery = useQuery(trpc.chat.listChats.queryOptions({}));
  const chats = useMemo(() => chatsQuery.data ?? [], [chatsQuery.data]);
  const chatCount = useMemo(() => chats.filter((chat) => chat.participantCharacterIds.includes(data.id)).length, [chats, data.id]);

  // Always a fresh chat with this character. Clear any per-character filter so the fresh draft isn't
  // shown behind a stale scope chip.
  const onNewChat = (): void => {
    clearChatListCharacterFilter();
    startNewChat({ characterIds: [data.id] });
    setActiveSection("chats");
  };
  // Scope the Chats list to this character's threads and switch sections. We set the filter but don't
  // pre-select a thread: the filtered list is the landing.
  const onViewChats = (): void => {
    setChatListCharacterFilter({ id: data.id, name: data.name });
    setActiveSection("chats");
  };

  // Publish the live handle so the CONTEXT Field inspector (a sibling shell region, no shared React
  // ancestor) can bind the facet's small fields. Clears on unmount so a stale handle never outlives
  // the editor.
  useEffect(() => {
    publishCharacterForm({ characterId: data.id, form });
    return (): void => clearCharacterForm();
  }, [data.id, form]);

  // Write the facet selection and reveal the CONTEXT inspector.
  const onSelectFacet = (id: CharacterCardFacet["id"]): void => {
    selectCharacterFacet(id);
    onRevealField?.();
  };

  // The `editor-sections` contributor region (§6c): the crew feature's card-evolution review cards stack
  // in the editor's existing flow. Layout is the SEAM's responsibility — the same centered column the form
  // uses — so nothing a contributor supplies can break it. Zero contributions ⇒ no wrapper, byte-identical
  // to today's editor (mirrors chat-room-surface.tsx's flank posture).
  const detailSections = resolveDetailSections(detailContributors, { characterId: data.id });

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
                  {totalTokenCount(values, activeGreetingIndex)} total · {permanentTokenCount(values)} permanent
                </Text>
              )}
            </form.Subscribe>
            {/* Autosave everywhere (§7): the live status stands where Save/Discard used to. */}
            <AutosaveStatus state={saveState} onRetry={retrySave} />
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

          {/* A master facet list; click a row and the list is replaced by the full-width facet body
              editor (← Back to return). */}
          {selectedFacetId === null ? (
            <CharacterFacetList form={form} selectedFacetId={null} focusFacetId={backFocusFacetId} onSelect={onSelectFacet} />
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
                setBackFocusFacetId(selectedFacetId as CharacterCardFacet["id"]);
                clearCharacterFacet();
              }}
            />
          )}
        </Stack>
      </form>

      {/* Contributed review sections (§6c) — outside the autosave `<form>` (they carry their own
          mutations), in the SAME centered column so a live section can't crush the editor width. */}
      {detailSections.length === 0 ? null : (
        <Stack gap="section" className="mx-auto w-full max-w-(--container-cq-lg)" padding="section" data-slot="character-editor-sections">
          {detailSections.map((section) => (
            <Fragment key={section.id}>{section.node}</Fragment>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
