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
// resume-or-new (§9c): the hero "Start chat" resumes the most-recent chat with this character or starts new
// — a RENDER derivation over the bus-driven `listChats` (`resumeTargets`, §5.1 — never an effect on a
// selection pointer), firing exactly one store action. The SAME path the LIST row uses.

import type { CharacterId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import { SaveBar } from "@orb/ui/save-bar";
import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab } from "@orb/ui/tabs";
import { Text } from "@orb/ui/text";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useMemo, useRef, useState } from "react";
import { QueryBoundary, useInvalidation, useTRPC } from "#data";
import { useFocusOnMount } from "#lib";
import { selectChat, setActiveSection, startNewChat } from "#state";
import { CharacterAdvancedTab } from "../components/character-advanced-tab";
import { CharacterHeroBand } from "../components/character-hero-band";
import { CharacterMainTab } from "../components/character-main-tab";
import { useCharacterForm } from "../hooks/use-character-form";
import { useUpdateCharacter } from "../hooks/use-character-mutations";
import type { CharacterCardFormValues } from "../lib/character-card-form-model";
import {
  characterCardFormFromDetail,
  characterUpdateDiff,
  permanentTokenCount,
  totalTokenCount,
} from "../lib/character-card-form-model";
import { resumeTargets } from "../lib/character-list-view";

export interface CharacterEditorSurfaceProps {
  readonly characterId: CharacterId;
}

/** The character editor, over `character.get` (suspense + error/loading via QueryBoundary). */
export function CharacterEditorSurface({ characterId }: CharacterEditorSurfaceProps): ReactElement {
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
      {/* key={characterId} remounts the body on a character switch so the `activeGreetingIndex` state
          (which lives ABOVE the form's `key={mountKey}` subtree) resets to 0 — otherwise viewing
          "Opening 4" on one character carries into the next (F17). A render-only remount, never a
          selection-keyed effect (§5.1 / rule 12). */}
      <CharacterEditorBody characterId={characterId} key={characterId} />
    </QueryBoundary>
  );
}

function CharacterEditorBody({ characterId }: CharacterEditorSurfaceProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const update = useUpdateCharacter({ trpc, invalidation });
  const { data } = useSuspenseQuery(trpc.character.get.queryOptions({ characterId }));

  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

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

  // resume-or-new — a render derivation over the bus-driven `listChats` (§9c/§5.1), one store action.
  const chatsQuery = useQuery(trpc.chat.listChats.queryOptions({}));
  const resumeMap = useMemo(() => resumeTargets(chatsQuery.data ?? []), [chatsQuery.data]);
  const onStartChat = (): void => {
    const target = resumeMap.get(data.id);
    if (target === undefined) {
      startNewChat({ characterIds: [data.id] });
    } else {
      selectChat(target);
    }
    setActiveSection("chats");
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
              Discard
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
            onStartChat={onStartChat}
            activeGreetingIndex={activeGreetingIndex}
            onActiveGreetingIndexChange={setActiveGreetingIndex}
          />

          <Tabs defaultValue="main">
            <TabsList>
              <TabsTab value="main">Main</TabsTab>
              <TabsTab value="advanced">Advanced</TabsTab>
              <TabsIndicator />
            </TabsList>
            <TabsPanel value="main">
              <CharacterMainTab form={form} trusted={data.trustHtml === true} />
            </TabsPanel>
            <TabsPanel value="advanced">
              <CharacterAdvancedTab
                form={form}
                readOnly={{
                  importedFrom: data.importedFrom,
                  importHash: data.importHash,
                  extensions: data.extensions,
                  residualData: data.residualData,
                  refinery: data.refinery,
                }}
              />
            </TabsPanel>
          </Tabs>
        </Stack>
      </form>
    </Stack>
  );
}
