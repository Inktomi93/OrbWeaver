// The Characters CONTENT when a row is selected. One always-editing AUTOSAVE form over the draft
// card-content fields, mounted through the D78 session boundary (`CharacterForm`) which OWNS the entity
// key — a character switch is a boundary-driven teardown/remount seeded from the new server row, so there
// is no manual `key` to place wrong (D78 L2, autosave-form-doctrine.md §1/§8). The hero name is a draft
// field; the hero portrait/star/archive + the tags row are immediate identity commits outside the form.
// Autosave everywhere (D66 A4 / north-star §7): no Save/Discard — the header carries the token split +
// the shared AutosaveStatus (Saved / Saving… / Save failed — Retry) where Save used to be.
//
// Hero chat affordances: "New chat" always starts a fresh thread with this character; "N chats ›" reveals
// the CONTEXT **Chats** tab, which is where her history lives now that the LIST pane stays the library
// (#501, D8). Both ride the ONE home for those intents (`lib/character-chat-intents.ts`).

import { rendersTrustedHtml } from "@orb/contracts/chat";
import type { CharacterId } from "@orb/kit/ids";
import { groupThousands } from "@orb/kit/strings";
import { Stack } from "@orb/ui/layout";
import { SaveBar } from "@orb/ui/save-bar";
import { Text } from "@orb/ui/text";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { Fragment, useEffect, useRef, useState } from "react";
import { QueryBoundary, QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import type { AppFormInstance, AutosaveSession } from "#forms";
import { AutosaveStatus, createAutosaveEntityForm } from "#forms";
import type { CharacterDetailContribution, CharacterDetailState, ContributorRegistry } from "#lib";
import { notify, useFocusOnMount } from "#lib";
import { clearCharacterFacet, selectCharacterFacet, useSelectedCharacterFacetId } from "#state";
import { CharacterFacetEditor } from "../components/character-facet-editor.tsx";
import { CharacterFacetList } from "../components/character-facet-list.tsx";
import { CharacterHeroBand } from "../components/character-hero-band.tsx";
import { useUpdateCharacter } from "../hooks/use-character-mutations.ts";
import { usePreviewRenderPolicy } from "../hooks/use-preview-render-policy.ts";
import type { CharacterCardFacet } from "../lib/character-card-facets.ts";
import type { CharacterCardFormValues } from "../lib/character-card-form-model.ts";
import {
  characterCardFormFromDetail,
  characterUpdateDiff,
  DEFAULT_CHARACTER_CARD_FORM,
  permanentTokenCount,
  totalTokenCount,
} from "../lib/character-card-form-model.ts";
import { revealCharacterChats, useStartChatWithCharacter } from "../lib/character-chat-intents.ts";
import { characterDraftStore } from "../lib/character-draft-store.ts";
import { clearCharacterForm, publishCharacterForm } from "../lib/character-editor-bridge.ts";

// The character-card session boundary (D78 L2). Module-scope so both the boundary and its keyed Session
// have stable identities; the boundary owns the entity key, so a character switch remounts the form
// (and the body's local drill-in/greeting state) — no consumer `key` to place wrong.
//
// DRAFT MIRROR WIRED (#73, owner-ruled 2026-08-15, CRITICAL tier — 8 free-text prose fields + a
// greetings array). This AMENDS the obligation-5 doctrine's premise for this surface specifically
// (`UI-Primitives-and-Reuse.md` §13.4: "on an AUTOSAVE form the server row IS the crash mirror… a
// confirmed save lands within the debounce window"): the factory's own teardown-flush comment
// (`create-autosave-entity-form.tsx` §"NOT covered here, deliberately") states the premise does NOT
// hold for a page reload/tab close — the debounce window dies with the document, unflushed, and long
// authored prose is exactly the content this dossier (`reports/tooling-drive/dossier-client.md` family
// 2) flags as the highest crash-loss editor in the app. The obligation-5 OMISSION stands as written
// law for the general autosave case (`persona`/`appearance`, still short-field/low-loss); this is the
// owner's named exception, not a reversal of the doctrine.
/** The hero wants her CENSUS, not her rows — the smallest page the server serves still carries it. */
const COUNT_ONLY_PAGE = 1;

const CharacterForm = createAutosaveEntityForm<CharacterCardFormValues>({
  defaultValues: DEFAULT_CHARACTER_CARD_FORM,
  draft: characterDraftStore,
});

export interface CharacterEditorSurfaceProps {
  readonly characterId: CharacterId;
  /** The character-DETAIL contributor registry (§6c) — the agents feature grafts card-evolution review
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

/** The editor's first-boot guess, in `line` rows: the save bar, the hero's identity block, and the field
 *  ladder's first few rows. It is only ever the FIRST paint on a device — `reserveKey` replaces it with what
 *  this device actually measured, and `skeletonRowCountFor` re-fills the count to that box. */
const EDITOR_SKELETON_ROWS = 8;

/**
 * The Characters CONTENT when a row is selected.
 *
 * IT RESERVES ITS BOX AND PAINTS A SHAPE (#1133, side-eye 2026-09-02 F3). Opening a character dropped
 * **14 of 55 frames (25.45%)** with an observed non-virtualized CLS of 0.0233, and the `record` strip showed
 * why: for ~240ms the CONTENT pane was EMPTY except for the words "Loading character…" at the top-left, then
 * the whole editor arrived at once. A bare sentence reserves nothing, so everything below it moved. This is
 * the #885 class and takes the #885 seam: `reserveKey` wraps the fallback in the box this device saw the
 * editor settle at last time (synchronous, off `surface-box-store`, so the very first commit already carries
 * it) and re-measures the settled child on every commit; the `SkeletonRows` count is re-filled to that box,
 * so the placeholder is honest about content as well as height.
 */
export function CharacterEditorSurface({ characterId, detailContributors, onRevealField }: CharacterEditorSurfaceProps): ReactElement {
  return (
    // THE SCROLL CONTAINER IS THE SURFACE'S, NOT THE BODY'S, AND THAT IS LOAD-BEARING (#1133). `reserveKey`
    // makes the boundary wrap its settled child in a measuring element, so a scroll box UNDER the boundary
    // inherits `h-full` from an auto-height wrapper — which computes to `auto`, the pane stops scrolling, and
    // everything past the fold becomes unreachable (caught by the editor CT's facet drill-in: "element is
    // outside of the viewport", 56 scroll retries). Hoisting it here puts the measured wrapper INSIDE the
    // scroller, where an auto-height child is exactly what a scroller wants. `relative` rides along: a scroll
    // box with no containing block dumps every `position:absolute` descendant into an ancestor's scrollable
    // area (character-library-welcome.tsx carries the same note).
    <Stack className="relative h-full overflow-y-auto">
      <QueryBoundary
        fallback={<SkeletonRows count={EDITOR_SKELETON_ROWS} />}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="this character" onRetry={retry} />}
        reserveKey="character.editor"
      >
        <CharacterEditorBody characterId={characterId} detailContributors={detailContributors} onRevealField={onRevealField} />
      </QueryBoundary>
    </Stack>
  );
}

function CharacterEditorBody({ characterId, detailContributors, onRevealField }: CharacterEditorSurfaceProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const update = useUpdateCharacter({ trpc, invalidation });
  const { data } = useSuspenseQuery(trpc.character.get.queryOptions({ characterId }));

  const save = async (values: CharacterCardFormValues): Promise<CharacterCardFormValues> => {
    const saved = await update.mutateAsync({
      characterId,
      // Send only the keys the user changed, never a full-object PUT that could revert a concurrent edit.
      input: characterUpdateDiff(values, data),
    });
    return characterCardFormFromDetail(saved);
  };

  // The editor form rides the D78 session boundary: it OWNS the entity key (keyed by data.id), so a
  // character switch is a full teardown/remount of the Session AND the form-bearing body — no manual
  // `key` to place wrong (autosave-form-doctrine.md §1). `serverValues` re-baselines a clean form on a
  // fresh server echo (§5); the character editor has no reset/revert affordance, so no `reseed` call.
  return (
    <CharacterForm entityId={data.id} serverValues={characterCardFormFromDetail(data)} save={save}>
      {(session): ReactElement => (
        <CharacterEditorForm data={data} trpc={trpc} session={session} detailContributors={detailContributors} onRevealField={onRevealField} />
      )}
    </CharacterForm>
  );
}

interface CharacterEditorFormProps {
  readonly data: Parameters<typeof characterCardFormFromDetail>[0];
  readonly trpc: ReturnType<typeof useTRPC>;
  readonly session: AutosaveSession<CharacterCardFormValues>;
  readonly detailContributors: ContributorRegistry<CharacterDetailContribution>;
  readonly onRevealField?: (() => void) | undefined;
}

/** The form-bearing editor body — remounted per character by the boundary's keyed Session, so the
 *  per-character view state (active greeting, facet back-focus) resets with the entity, and the live
 *  form handle it publishes to the CONTEXT inspector is always the current character's. */
function CharacterEditorForm({ data, trpc, session, detailContributors, onRevealField }: CharacterEditorFormProps): ReactElement {
  // The session hands a widened AppForm surface with `reset` type-removed; the editor threads `form` into
  // ~6 children typed against the full AppFormInstance, so widen once here (reset MISUSE is caught by the
  // no-form-reset-in-autosave gate, not the type — the feature has zero `.reset(` call sites).
  const form = session.form as AppFormInstance<CharacterCardFormValues>;

  const surfaceRef = useRef<HTMLDivElement>(null);
  // Unconditional again (#501). It used to stand down when the selection came from the LIST PICKER, because
  // that pick SWAPPED the pane beside this editor into her chats and the pane the user had just transformed
  // owned the focus. Nothing swaps now — the library stays docked with the pressed row still in it — so
  // there is no second focus claimant and no intent seam to arbitrate one.
  useFocusOnMount(surfaceRef);
  const selectedFacetId = useSelectedCharacterFacetId();
  // Activating a facet drops activeElement to <body>, so on Back we tell the re-mounting facet list
  // which row should reclaim focus.
  const [backFocusFacetId, setBackFocusFacetId] = useState<CharacterCardFacet["id"] | null>(null);

  // The greeting the hero is previewing — lifted here so the save-bar total agrees.
  const [activeGreetingIndex, setActiveGreetingIndex] = useState(0);

  // DRAFT-TRUST arm 1: what the facet preview renders as is the RESOLVED render policy (deployment floor ×
  // this card's override) — the same combine the server runs for committed content, not the card's raw
  // `trustHtml` column, which is only one input to it (see hooks/use-preview-render-policy.ts).
  const previewPolicy = usePreviewRenderPolicy(data);

  // The bus-driven chat CENSUS for this character — the hero's "N chats ›" derives from it in render, never
  // an effect. The SERVER counts (2026-08-09): the projection is a `characterId` argument to the one
  // first-class chats read, so the hero can never disagree with the pane it points at, and it costs a
  // page-of-one instead of the caller's entire membership list filtered on the client.
  const chatsQuery = useQuery(trpc.chat.listChats.queryOptions({ characterId: data.id, limit: COUNT_ONLY_PAGE }));
  const chatCount = chatsQuery.data?.totalCount ?? 0;

  // Always a fresh chat with this character — the SAME writer the LIST band's New chat fires (one home,
  // `character-chat-intents.ts`), so the two primaries can't drift.
  const startChatWith = useStartChatWithCharacter();
  const onNewChat = (): void => startChatWith(data.id);
  // "N chats ›" does not LEAVE for the Chats section (D8) — it reveals the CONTEXT **Chats** tab, which is
  // where her history lives since the LIST pane stopped swapping (#501).
  const onViewChats = (): void => revealCharacterChats();

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

  // The `editor-sections` contributor region (§6c): the agents feature's card-evolution review cards stack
  // in the editor's existing flow. Layout is the SEAM's responsibility — the same centered column the form
  // uses — so nothing a contributor supplies can break it. Zero contributions ⇒ no wrapper, byte-identical
  // to today's editor (mirrors chat-room-surface.tsx's flank posture).
  const detailSections = resolveDetailSections(detailContributors, { characterId: data.id });

  return (
    // The focus target only — the scroll box + its containing block moved up to the surface (see there).
    <Stack ref={surfaceRef} tabIndex={-1} className="outline-none">
      <form
        onSubmit={(event): void => {
          event.preventDefault();
          event.stopPropagation();
          form.handleSubmit().catch(() => notify.error("Couldn't save the character."));
        }}
      >
        <Stack gap="section" className="mx-auto w-full max-w-(--container-cq-lg)" padding="section">
          {/* THE CENSUS IS `meta`, NOT AN ACTION (side-eye 2026-08-18 P1-4). It sat in the bar's `children`
              with every sibling `shrink-0`, so at 430px the token line took 231px and the character's NAME
              — the one thing a phone's save bar is telling you — was clipped to "Sabin…" at 54px. The
              `meta` slot keeps the census inline where there is room and drops it to its own full-width
              line under the identity where there is not: both read whole, neither hidden. */}
          <SaveBar
            title={data.name}
            kind="Character"
            sticky="header"
            meta={
              /* IT CARRIES ITS OWN GLOSS NOW (#493, side-eye 2026-08-22 rail-characters P2-4). `1017
                 permanent` is the editor's most jargon-dense datum and it shipped with NO explanation on
                 this surface — no `title`, no `aria-label`, no tooltip (all three verified null) — while the
                 ONE place that says what it means ("sent every turn") is the CONTEXT pane, 300px away and
                 closed by default. The visible line is unchanged: the `aria-label` is what a screen reader
                 hears and the `title` what a pointer gets, and the mono line stays the glanceable one. */
              <form.Subscribe selector={(s): CharacterCardFormValues => s.values}>
                {(values): ReactElement => (
                  <Text
                    aria-label={`${totalTokenCount(values, activeGreetingIndex)} tokens total, ${permanentTokenCount(values)} permanent — sent every turn`}
                    className="font-mono tabular-nums"
                    title={`${permanentTokenCount(values)} permanent tokens are sent every turn; the rest ride the active greeting.`}
                    voice="gloss"
                  >
                    {/* HOUSE NUMERIC-DATUM TREATMENT (side-eye #844 P3, 2026-09-05) — this is a DATUM, not a
                        label, and `size="micro"` bakes in `tracking-micro` (0.08em), the section-NAME
                        tracking. `voice="gloss"` resolves the identical text-micro/muted step without the
                        label tracking, plus `tabular-nums` so the live count doesn't jitter columns as it
                        ticks — the same recipe `analytics-list-surface.tsx`'s leaderboard datum already
                        uses (`voice="gloss" className="font-mono tabular-nums"`), not a new one. */}
                    {/* GROUPED (#878 F13) — the same `@orb/kit/strings` grouper the context band's token
                        chip prints through, so the editor and the pane cannot spell one number two ways.
                        The `aria-label` above stays UNGROUPED on purpose: a screen reader groups the digits
                        itself, and separators inside a spoken string are read out. */}
                    {/* IT SAYS WHAT IT COUNTS (side-eye 2026-09-02 F11). The line read `1,257 total · 1,017
                        permanent` — the same datum the CONTEXT band prints as `1,257 tokens`, one home
                        naming its unit and one not, which is two vocabularies for one number. `tokens` is
                        the band's word and now this one's; `permanent` keeps its gloss on the `title` +
                        `aria-label` above (a pointer and a screen reader both reach it), because the meta
                        slot is the one that gets clipped at 430px and a second focusable trigger in it is
                        what the P1-4 fix removed. */}
                    {groupThousands(totalTokenCount(values, activeGreetingIndex))} tokens · {groupThousands(permanentTokenCount(values))} permanent
                  </Text>
                )}
              </form.Subscribe>
            }
          >
            {/* Autosave everywhere (§7): the live status stands where Save/Discard used to. */}
            <AutosaveStatus state={session.saveState} onRetry={session.retrySave} />
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
            <CharacterFacetList form={form} characterId={data.id} selectedFacetId={null} focusFacetId={backFocusFacetId} onSelect={onSelectFacet} />
          ) : (
            <CharacterFacetEditor
              form={form}
              characterId={data.id}
              facetId={selectedFacetId as CharacterCardFacet["id"]}
              trusted={rendersTrustedHtml(previewPolicy.htmlTrust)}
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
