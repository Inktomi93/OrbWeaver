// The Characters CONTENT when a row is selected. One always-editing bound form over the draft
// card-content fields, with a key={mountKey} full remount on character switch. The hero name is a
// draft field; the hero portrait/star/archive + the tags row are immediate identity commits outside
// the form. The save-bar carries the token split, the dirty pill, Discard, and Save.
//
// Hero chat affordances: "New chat" always starts a fresh thread with this character; "N chats ›"
// scopes the Chats list to this character and switches sections.

import type { CharacterId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import { SaveBar } from "@orb/ui/save-bar";
import { Text } from "@orb/ui/text";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
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
  /** Reveal the CONTEXT Field inspector — a facet-row click calls this after writing the selection. */
  readonly onRevealField?: (() => void) | undefined;
}

export function CharacterEditorSurface({ characterId, onRevealField }: CharacterEditorSurfaceProps): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text tone="muted">Loading character…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="this character" onRetry={retry} />}
    >
      <CharacterEditorBody characterId={characterId} onRevealField={onRevealField} key={characterId} />
    </QueryBoundary>
  );
}

function CharacterEditorBody({ characterId, onRevealField }: CharacterEditorSurfaceProps): ReactElement {
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

  const { form, mountKey, discard } = useCharacterForm({
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
            <form.AppForm>
              <form.DirtyPill />
            </form.AppForm>
            <Button type="button" intent="ghost" onClick={discard}>
              Discard changes
            </Button>
            {/* Save is primary only while dirty — at rest the hero "Start chat" is the region's one
                primary. */}
            <form.Subscribe selector={(s): readonly [boolean, boolean, boolean] => [s.canSubmit, s.isSubmitting, s.isDefaultValue] as const}>
              {([canSubmit, isSubmitting, isDefaultValue]): ReactElement => (
                <Button type="submit" intent={isDefaultValue ? "secondary" : "primary"} disabled={!canSubmit || isSubmitting} loading={isSubmitting}>
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
    </Stack>
  );
}
