// The preset editor surface — the Presets tabbed editor. Binds the nested `PromptConfig` directly (no
// flat mapper); AUTOSAVE through `preset.update` (D66 A4 / north-star §7) — no Save button, the header
// carries the shared `AutosaveStatus` where Save used to be. A preset carries no model; the Params deck
// resolves capability for the user's configured chat-role connection, and stands its model-fed clusters down
// to `CapabilityGate` (skeleton while pending, the server's message when the resolve fails) until it lands.
//
// D78 L1: mounts the autosave form through the session BOUNDARY (`PresetForm` = createAutosaveEntityForm)
// — the factory owns entity identity (its keyed Session), the teardown flush, and reseed. Reset-to-starter
// is now `session.reseed(seedConfig(row.config))` off the mutation-response row (§5) — no nonce machinery,
// no manual mount key, no `closeForReseed`. Structural array ops persist via the boundary's store driver, so
// the child components carry ZERO manual `handleSubmit` flushes (§10 CT-4 / the retired §7 trap).
//
// Saving goes through `usePresetAutosave` (never an inline mutateAsync): it serializes the writes and owns the
// LOCKED built-in's fork-once retarget — editing the system default COWs into ONE owned copy, and the editor
// session + the active-for-generation seed both follow it (read its header; the ten-duplicates bug lived here).
// Once the owner ALREADY has a fork of the built-in, that hook parks the write on `PresetForkChoiceDialog`
// (rendered here, the surface's second dialog): keep editing the fork they have, or name a new one.
//
// preset-surface-redesign.md §3 (owner decision D3): ONE flat tab level — five views (Params · Prompt ·
// Actions · Data · Transforms) replacing the two-level 4-groups × 10-leaves tree. The Params view is the
// new deck (§4); the other four REHOME the landed leaf bodies per the §3 schema→home map (this lane moves
// them; V2 rebuilds their insides).
//
// The active view is SECTION STATE (`presetEditorView`, #state), not local `Tabs` state, because CONTEXT
// projects per-view (§7): the eye follows the hand. THIS TAB STRIP IS THE ONE WRITER (§16 row 10) — every
// other region reads. `PRESET_EDITOR_VIEWS[0]` is the default an unset store read resolves to, so the
// default lives with the vocabulary.
//
// HEADER TRUTH (G7) LIVES WITH THE BAND: the sticky header — the name, the ACTIVE truth + its Activate
// affordance, the autosave status, the Reset door and its confirm, and the view-tab strip — is
// `../components/preset-editor-header.tsx` (split out at #496 when this file crossed the component-size
// cap). Every ruling recorded against those elements moved there verbatim; read its header for G7, the
// dead model chip's 2026-08-19 reversal, the shared-content-column ruling and the strip's scroll rule.
//
// The deck's ghost column reads `preset.resolveEffective` (§4.3/D5) — the REAL funnel, not a client
// mirror. A plain `useQuery`: the read fails when no chat connection resolves (the same condition that
// hides the model-fed clusters), and that degrades to un-ghosted rows rather than an error boundary.

import type { ModelCapability } from "@orb/contracts/connection";
import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
// `Container` is lane B's shared content-column ruling — the panel column measures the PANE through it.
import { Container, Stack } from "@orb/ui/layout";
import { Tabs, TabsPanel } from "@orb/ui/tabs";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef } from "react";
import { QueryBoundary, QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import type { AppFormInstance, AutosaveSession } from "#forms";
import { createAutosaveEntityForm } from "#forms";
import { useFocusOnMount } from "#lib";
import { setPresetEditorView, usePresetEditorView } from "#state";
import { BuiltInCopyOnWriteNotice } from "../components/built-in-copy-on-write-notice.tsx";
import { PresetEditorHeader } from "../components/preset-editor-header.tsx";
import { PresetForkChoiceDialog } from "../components/preset-fork-choice-dialog.tsx";
import { usePresetAutosave } from "../hooks/use-preset-autosave.ts";
import { useResetPreset, useSetDefaultPreset, useUpdatePreset } from "../hooks/use-preset-mutations.ts";
import { notifyActivePreset } from "../lib/active-preset-notice.ts";
import type { EffectiveProfileRow } from "../lib/effective-knobs.ts";
import { presetDraftStore } from "../lib/preset-draft-store.ts";
import { seedConfig, validatePresetConfig } from "../lib/preset-editor-model.ts";
import { PRESET_EDITOR_VIEWS } from "../lib/preset-nav.ts";
import type { ViewContentProps } from "../lib/preset-view-content.tsx";
import { viewContent } from "../lib/preset-view-content.tsx";
import type { ReadFailure } from "../lib/resolve-failure.ts";

// The session-boundary autosave form (D78 §1). Module-scope so both the Boundary and its inner Session have
// stable identities (never a per-render factory call). Entity identity, the teardown flush, and reseed live
// INSIDE it — a consumer cannot mount it any way except keyed by `entityId`.
//
// DRAFT MIRROR WIRED (#73, owner-ruled 2026-08-15, HIGH tier — a multi-section prompt-assembly config
// carrying full free-text literal/templated-marker bodies, comparable in loss-severity to the
// character card). Same owner exception to the obligation-5 doctrine's autosave-omits-draft default
// as the character editor — see that surface's header for the full citation.
const PresetForm = createAutosaveEntityForm<PromptConfig>({
  defaultValues: DEFAULT_PROMPT_CONFIG,
  draft: presetDraftStore,
  // THE ONE VALIDATOR ON THIS FORM, and it REFUSES a write rather than advising — `validatePresetProse`'s
  // header carries the why. `onDynamic` is the slot `revalidateLogic()` drives (the factory sets it).
  options: {
    validators: {
      onDynamic: ({ value }: { value: PromptConfig }): { fields: Record<string, string> } | undefined => validatePresetConfig(value),
    },
  },
});

export interface PresetEditorSurfaceProps {
  readonly presetId: PresetId;
  /** Reveal the CONTEXT section inspector — a rack row's name-button click calls this after selecting the section. */
  readonly onRevealSection?: (() => void) | undefined;
}

export function PresetEditorSurface({ presetId, onRevealSection }: PresetEditorSurfaceProps): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    // NAMED, for the reason the list surface's twin is (side-eye 2026-08-19 ARIA): `useFocusOnMount` lands
    // focus here on entry, and an unnamed role-less div announces nothing about where you just arrived.
    <Stack
      aria-label="Preset editor"
      ref={surfaceRef}
      role="region"
      tabIndex={-1}
      className="relative h-full min-h-0 overflow-y-auto overflow-x-hidden outline-none"
    >
      {/* RESERVED (#1098). The editor IS the CONTENT pane, so the read landing used to collapse the pane to
          a one-line sentence and pop it back to a full form — taking the scrollbar and the reader's scroll
          position with it. The remembered box holds the pane across a preset switch; the authored count is
          only the first-boot guess (the reserved box re-fills it). The scroll box is the Stack ABOVE this
          boundary, so the measuring wrapper sits INSIDE the scroller and cannot flatten it (#1133). */}
      <QueryBoundary
        fallback={<SkeletonRows count={6} />}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="the preset" onRetry={retry} />}
        reserveKey="preset.editor"
      >
        <PresetEditor presetId={presetId} onRevealSection={onRevealSection} />
      </QueryBoundary>
    </Stack>
  );
}

function PresetEditor({ presetId, onRevealSection }: PresetEditorSurfaceProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: preset } = useSuspenseQuery(trpc.preset.get.queryOptions({ id: presetId }));
  // The active-for-generation pointer — read here (not just in the LIST) because the built-in's copy-on-write
  // fork must INHERIT it: a fork the user can't generate with makes every edit a silent no-op.
  //
  // THESE TWO STAY SINGULAR, AND THAT IS MEASURED, NOT AN OVERSIGHT (#859). They are the same serialized-
  // waterfall shape the LIST pane's `preset-library-surface.tsx` just closed with `useSuspenseQueries` — the
  // first read SUSPENDS before React reaches the second hook — but the PLURAL hook cannot be used HERE,
  // because `presetId` is a prop that CHANGES (the rail switches presets under a mounted editor).
  // `useQueries` only pushes new queries into its `QueriesObserver` from an EFFECT, and an effect never runs
  // while the component is suspended, so a key change suspends forever: converted, this pane stuck in its
  // `QueryBoundary` fallback after "switch to B" and took the SWITCH and drill-leak P0 pins red with it
  // (measured 2026-09-05, @tanstack/react-query 5.101.4). The repo's other warm channel does not apply
  // either: `usePrefetchQuery` is ruled unusable with tRPC's `queryOptions()` output
  // (`data/use-display-scripts.ts`), and the house `ensureQueryData` idiom fires from an effect — one commit
  // too late to join this wave. Closing this one needs a different mechanism, not this one.
  const { data: settings } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const reset = useResetPreset({ trpc, invalidation });
  const setDefault = useSetDefaultPreset({ trpc, invalidation });
  // The name-only write behind the header's rename door (#483) — the SAME `preset.update` verb the LIST
  // kebab's Rename calls, with `config` untouched, so a rename can never race the autosave's config write
  // into one merged patch.
  const update = useUpdatePreset({ trpc, invalidation });

  // The LIVE resolved chat capability — the SAME `(model, source, api)` a real turn resolves (incl. the
  // vLLM engine's self-reported window), not a hand-built key off `roleDefaults.chat` (often unset on the
  // vLLM default). Refetches on a settings change (the routing knobs feed the resolution). A resolve failure
  // leaves `capability` undefined AND `capabilityError` set ⇒ the deck stands down to `CapabilityGate`'s
  // FAILURE arm, quoting the server (F-02); an unlanded read leaves both empty ⇒ the gate's PENDING skeleton.
  const capabilityQuery = useQuery(trpc.connection.resolveChatCapability.queryOptions());
  // The read carries the resolved `(api, source, model)` alongside the descriptor (the Connections pane names
  // the fallback from it); this panel gates on the descriptor only.
  const capability = capabilityQuery.data?.capability;

  // The EFFECTIVE profile — the generation funnel projected for this preset against the caller's own chat
  // model (§4.3). It is what every ghosted knob renders, and it rides the freshness map (`presetsChanged`
  // via the preset root + the narrow `settingsChanged` row), so a save or a model swap re-resolves it.
  // `?? undefined` at the seam: a query that has not landed (or an environment where the read yields no
  // row) must degrade to "no ghost", and every consumer below takes `EffectiveProfileRow | undefined`.
  const effectiveQuery = useQuery(trpc.preset.resolveEffective.queryOptions({ id: presetId }));

  // The save path incl. the built-in's fork-once retarget (see the hook header) — never an inline mutateAsync.
  const activePresetId = settings.config.seeds.defaultPresetId;
  const autosave = usePresetAutosave({ presetId, server: preset.config, activePresetId });

  // G7: the built-in IS the null pick, exactly as the LIST row reads it — the two surfaces must not
  // disagree about which preset the next turn runs with.
  const active = preset.isSystemDefault ? activePresetId === null : presetId === activePresetId;
  // ACTIVATION ANNOUNCES on success, through the same one home as the LIST row's radio (#481): it is the act
  // with global reach on this surface, and it used to change every future generation in silence.
  const onActivate = (): void => {
    setDefault.mutate(
      { section: "seeds", patch: { defaultPresetId: preset.isSystemDefault ? null : presetId } },
      { onSuccess: (): void => notifyActivePreset(preset.name) },
    );
  };
  // isError ≠ no-model (F-02): a FAILED read must not render as "connect a chat model" to someone who has one.
  // The ERROR goes down WHOLE (2026-08-08) so the gate discriminates on `data.code` — the routing verdict is
  // EARNED, never asserted. `null` = PENDING.
  const capabilityError = capabilityQuery.error;

  return (
    <>
      <PresetForm entityId={presetId} serverValues={seedConfig(preset.config)} save={autosave.save}>
        {(session): ReactElement => (
          <PresetEditorBody
            session={session}
            presetId={presetId}
            presetName={preset.name}
            active={active}
            isSystemDefault={preset.isSystemDefault}
            onActivate={onActivate}
            onRename={(name): void => update.mutate({ id: presetId, name })}
            capability={capability}
            capabilityError={capabilityError}
            effective={effectiveQuery.data ?? undefined}
            reset={reset}
            onRevealSection={onRevealSection}
          />
        )}
      </PresetForm>
      {/* The built-in's fork choice — the ONE thing that interrupts the autosave, and only when the owner
          already has a fork to lose track of (the hook parks the write until an arm is picked). */}
      {autosave.forkChoice === null ? null : (
        <PresetForkChoiceDialog
          forkName={autosave.forkChoice.forkName}
          onKeepEditing={autosave.keepEditingFork}
          onNewFork={autosave.startNewFork}
          open={true}
          sourceName={autosave.forkChoice.sourceName}
          suggestedName={autosave.forkChoice.suggestedName}
        />
      )}
    </>
  );
}

interface PresetEditorBodyProps {
  readonly session: AutosaveSession<PromptConfig>;
  readonly presetId: PresetId;
  readonly presetName: string;
  /** This preset is the ACTIVE-for-generation pick (the built-in ⇔ `defaultPresetId === null`). */
  readonly active: boolean;
  /** The locked built-in: no Export (it re-seeds on the target box), no Reset (it IS the starter). */
  readonly isSystemDefault: boolean;
  /** Make it the pick — the one `setDefault` mutation the LIST row toggle also calls (§16 row 3). */
  readonly onActivate: () => void;
  /** Commit a new name (#483) — the header owns the door + its dialog; this is the write. */
  readonly onRename: (name: string) => void;
  readonly capability: ModelCapability | undefined;
  /** The capability read's thrown error object, `null` while it is still PENDING (§F-02). */
  readonly capabilityError: ReadFailure | null;
  readonly effective: EffectiveProfileRow | undefined;
  readonly reset: ReturnType<typeof useResetPreset>;
  readonly onRevealSection?: (() => void) | undefined;
}

function PresetEditorBody({
  session,
  presetId,
  presetName,
  active,
  isSystemDefault,
  onActivate,
  onRename,
  capability,
  capabilityError,
  effective,
  reset,
  onRevealSection,
}: PresetEditorBodyProps): ReactElement {
  const { form, saveState, retrySave, reseed } = session;

  // The reset ACT — the header owns the door and its confirm; the write is a SESSION concern (the mutation
  // plus the reseed that lands its response row), so it is wired here and injected.
  const confirmReset = (): void => {
    // Reseed from the mutation's RESPONSE row (§5) — the verb returns the freshly-reset PresetDetail, so
    // there is no post-invalidation cache read to race. `reseed` discard-flags the outgoing session so the
    // dirty pre-reset form is dropped, never written back over the starter (the F2 write-back vector).
    reset.mutate({ id: presetId }, { onSuccess: (row): void => reseed(seedConfig(row.config)) });
  };

  // The session's `form` is the boundary's widened surface minus `reset`; the view bodies are typed
  // against the full `AppFormInstance` (the editor never calls `reset`), so widen once here. NOTHING
  // publishes it any more: the form BRIDGE is deleted with the CONTEXT inspector (§5.2) — CONTEXT is a
  // pure-query readout now, so no sibling shell region needs a live form handle.
  const boundForm = form as AppFormInstance<PromptConfig>;

  // `attachable` is the NEGATION of the SAME `isSystemDefault` wire flag the header's Reset arm reads — the
  // client never sniffs the built-in from its sentinel id (`domain/preset/constants.ts`: "Not cross-boundary").
  const viewProps: ViewContentProps = {
    form: boundForm,
    capability,
    capabilityError,
    effective,
    presetId,
    attachable: !isSystemDefault,
    onRevealSection,
  };
  // The ONE writer of the view axis; an unset store read resolves to the tuple's first view.
  const view = usePresetEditorView() ?? PRESET_EDITOR_VIEWS[0]?.id;

  return (
    <Stack>
      <Tabs onValueChange={(next): void => setPresetEditorView(String(next))} value={view}>
        <PresetEditorHeader
          presetName={presetName}
          active={active}
          isSystemDefault={isSystemDefault}
          onActivate={onActivate}
          onRename={onRename}
          saveState={saveState}
          onRetrySave={retrySave}
          onConfirmReset={confirmReset}
        />

        {/* THE COPY-ON-WRITE RULE, WHERE THE EDIT HAPPENS (side-eye 2026-08-30 P2-A) — the surface's own
            finding was that the rule lived in the FIFTH tab's third section while the edit that triggers it
            happens on any of the five, so it sits above the view bodies and under the band, in the SAME
            capped column both of those ride (the header's note argues that column; it is stated twice on
            purpose so neither can drift).
            IT IS NOT INSIDE THE PANELS, and that is a measured correction, not a preference: `TabsPanel`'s
            own header says "Base UI keeps only the OPEN panel mounted", and the CT strict-mode violation
            says otherwise — after tabbing Params→Prompt→Actions→Data, TWO panels held the notice at once.
            One notice per tab-visit is a paragraph the DOM accumulates and a locator cannot resolve. */}
        {isSystemDefault ? (
          <Container className="w-full">
            <Stack className="mx-auto w-full max-w-(--width-content-col) @5xl:max-w-(--width-content-col-wide)" padding="block">
              <BuiltInCopyOnWriteNotice active={active} />
            </Stack>
          </Container>
        ) : null}

        {PRESET_EDITOR_VIEWS.map((entry) => (
          <TabsPanel key={entry.id} value={entry.id}>
            {/* THE CONTENT COLUMN IS CAPPED AND CENTERED (side-eye F-16 as amended by the owner's rendered
                read, 2026-08-02), once, for all five views. The cap is why: a wide pane stretched rack rows
                to ~840px with a ~60% dead gutter and ran drill-in glosses to ~130ch against the 65-75ch
                reading measure. What the first build got wrong is the RULING: a 720px cap LEFT-PINNED inside
                a 958px pane parks 240px of void on one side, and in focus mode ~800px ("looks okay when both
                panels are out, but when you close them it looks awful"). So the column CENTERS — the house
                convention for a wide content-pane editor (character-editor-surface.tsx uses the same
                `mx-auto w-full max-w-…`) — and BREATHES to `--width-content-col-wide` once the pane itself
                clears @5xl, which is exactly the panels-collapsed / focus-mode regime. The `Container` is
                what the @5xl query measures (the pane's own width), which is why the cap and the container
                are two elements and not one. It lives HERE and not per view so no body can opt out. */}
            <Container className="w-full">
              <Stack className="mx-auto w-full max-w-(--width-content-col) @5xl:max-w-(--width-content-col-wide)" gap="block" padding="block">
                {viewContent(entry.id, viewProps)}
              </Stack>
            </Container>
          </TabsPanel>
        ))}
      </Tabs>
    </Stack>
  );
}
