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
// HEADER TRUTH (G7): the header states the ONE fact that changes UNDER the editor and is otherwise only
// legible in another pane — whether this preset is the ACTIVE one for generation. (The model chip that used
// to stand beside it died 2026-08-19; the reversal is recorded at its old site.) The fork-once retarget MOVES
// activation while you edit, and on mobile the LIST is a closed sheet, so a status naming an actionable
// state must be able to act:
// the Activate affordance renders ONLY in the not-active state and rides the SAME `useSetDefaultPreset`
// mutation as the row toggle and its kebab mirror (§16 row 3 echo b — the sanctioned echo, one writer).
//
// The deck's ghost column reads `preset.resolveEffective` (§4.3/D5) — the REAL funnel, not a client
// mirror. A plain `useQuery`: the read fails when no chat connection resolves (the same condition that
// hides the model-fed clusters), and that degrades to un-ghosted rows rather than an error boundary.

import type { ModelCapability } from "@orb/contracts/connection";
import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
// `Download` is GONE with the header Export door (O-16★ — one home, the list-row kebab); `Container` is lane B's shared content-column ruling.
import { Icon, RotateCcw, Zap } from "@orb/ui/icons";
import { Container, Row, Stack } from "@orb/ui/layout";
import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab } from "@orb/ui/tabs";
import { Heading, Text } from "@orb/ui/text";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { ConfirmDialog } from "#components";
import { QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import type { AppFormInstance, AutosaveSession } from "#forms";
import { AutosaveStatus, createAutosaveEntityForm } from "#forms";
import { useFocusOnMount, useScrollFadeX } from "#lib";
import { setPresetEditorView, usePresetEditorView } from "#state";
import { PresetForkChoiceDialog } from "../components/preset-fork-choice-dialog.tsx";
import { usePresetAutosave } from "../hooks/use-preset-autosave.ts";
import { useResetPreset, useSetDefaultPreset } from "../hooks/use-preset-mutations.ts";
import { notifyActivePreset } from "../lib/active-preset-notice.ts";
import type { EffectiveProfileRow } from "../lib/effective-knobs.ts";
import { presetDraftStore } from "../lib/preset-draft-store.ts";
import { seedConfig, validatePresetConfig } from "../lib/preset-editor-model.ts";
import { PRESET_EDITOR_VIEWS } from "../lib/preset-nav.ts";
import type { ViewContentProps } from "../lib/preset-view-content.tsx";
import { viewContent } from "../lib/preset-view-content.tsx";
import type { ReadFailure } from "../lib/resolve-failure.ts";

/** ONE string for the reset door's accessible name AND its hover tooltip (the O-3 icon-door anatomy). */
const RESET_LABEL = "Reset to starter arrangement";

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
      <QueryBoundary
        fallback={<Text voice="gloss">Loading the preset…</Text>}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="the preset" onRetry={retry} />}
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
  const { data: settings } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const reset = useResetPreset({ trpc, invalidation });
  const setDefault = useSetDefaultPreset({ trpc, invalidation });

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
  capability,
  capabilityError,
  effective,
  reset,
  onRevealSection,
}: PresetEditorBodyProps): ReactElement {
  const { form, saveState, retrySave, reseed } = session;

  // The view strip's scroll box (see its own note below) — the hook keeps `@orb/ui`'s `.scroll-fade-x`
  // edge cue honest about which edge is currently hiding a view.
  const stripRef = useRef<HTMLDivElement>(null);
  useScrollFadeX(stripRef);

  const [resetOpen, setResetOpen] = useState(false);
  const confirmReset = (): void => {
    void (async (): Promise<void> => {
      try {
        // Reseed from the mutation's RESPONSE row (§5) — the verb returns the freshly-reset PresetDetail, so
        // there is no post-invalidation cache read to race. `reseed` discard-flags the outgoing session so the
        // dirty pre-reset form is dropped, never written back over the starter (the F2 write-back vector).
        const row = await reset.mutateAsync({ id: presetId });
        reseed(seedConfig(row.config));
      } catch {
        // The mutation's own errorToast already surfaced it; keep the current arrangement.
      }
    })();
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
        {/* THE HEADER SHARES THE BODY'S COLUMN (side-eye 2026-08-19 P1-1). The sticky band itself stays
            full-bleed — it is the surface a scrolled body slides under, and a capped band would leave the
            body visible through the gap — but its CONTENT rides the same capped, centered column every view
            body does, one element in. Measured before: at a 1520px pane the name + its Activate/Reset cluster
            spanned 1822px over a centered body, so the two ends of the header sat a hand-span outside the
            thing they belong to; they aligned only below the cap, where the column IS the pane.
            The `Container` is here for the same reason it is around each panel: `@5xl` has to measure the
            PANE, and only a container can. Same classes as the panel column, deliberately — the header and
            the body must breathe together or they realign at every dock.

            RE-DERIVED AND HELD (side-eye 2026-08-22 P2-1, which read the header as 176px wider than "the
            body column"). Measured live at that arm (both panels hidden, `main` = 1224px): header x=220
            w=896 and panel column x=220 w=896, on all five tabs — the panel column has carried this exact
            class pair since 45cf001d53 (2026-08-01), so the ruling above was never broken. What that report
            measured is a THIRD, deeper column: the Params deck's own 720px instrument cap
            (`params-deck.tsx`, side-eye 2026-08-19 P2), which is why the offset shows on Params and on no
            other tab. Fenced by a CT; the deck's cap is argued at its own site. */}
        <Stack gap="block" padding="block" className="sticky top-0 z-(--z-raised) bg-card">
          <Container className="w-full">
            <Stack className="mx-auto w-full max-w-(--width-content-col) @5xl:max-w-(--width-content-col-wide)" gap="block">
              <Row align="center" justify="between" gap="field">
                <Row align="center" className="min-w-0" gap="field">
                  {/* The artifact's NAME is an h2 (side-eye F-28 / ARIA rec 8): it was a <p>, with the view's
                      kickers as h3s under no h2 at all, so heading navigation could not find the thing being
                      edited. It now RENDERS like the title it is (crunch-list 13): `voice="label"` held it at
                      the deck's 13px/500 label step, so the one thing the whole pane is about read as just
                      another field name beside its own chips. The h2's default `title` size + semibold is the
                      step the mock draws. */}
                  {/* IT DEFERS TO THE TOPBAR AT THE SHELL'S NARROW BUDGET (side-eye 2026-08-19 P2). On a
                      phone the shell's topbar already prints the open preset's name (the section's
                      `useSelectionTitle`), so the name stood twice, 45px apart, in the one regime with the
                      least room for it. `data-shell-identity="defer"` is the SHELL's own opt-in marker and
                      the rule lives with the query that decides it (`shell.css`, the same
                      `@container shell-main (max-width: 30rem)` block that swaps the topbar's identity arms)
                      — a feature must not re-spell that threshold, and `useMobileViewport()` is a DIFFERENT
                      question (a viewport media query, not the content container's width): between 30rem and
                      the mobile breakpoint the topbar renders its WIDE arm, which for Presets is nothing at
                      all while the list is docked, so hiding on that signal would lose the name outright. */}
                  <Heading className="min-w-24 shrink truncate" data-shell-identity="defer" level={2}>
                    {presetName}
                  </Heading>
                  {/* G7 — the two truths that change UNDER the editor. The ACTIVE chip is the LIST row's marker
                      verbatim (one state, one reading); its not-active twin is an AFFORDANCE, because a status
                      that only ever says "not active" is a dead end when the LIST is a closed sheet.
                      `tone="soft"` (rider 1 / side-eye F-06): a SOLID ember chip carried the same fill as the
                      pane's one primary CTA, so a status read as a second call to action. */}
                  {active ? (
                    <Badge intent="primary" size="sm" tone="soft">
                      Active
                    </Badge>
                  ) : (
                    // ITS NAME IS DISTINCT FROM THE LIST RADIO'S (side-eye 2026-08-19 P2). Both controls spelled
                    // `Activate <name> for generation`, in two different ROLES (a one-of-N `radio` in the list's
                    // radiogroup, a `button` here), so an a11y walk of the app met one name attached to two
                    // contracts — and the walker cannot tell from the name which one it landed on. The ROLE split
                    // is correct and stays: the list is where the pick LIVES (one-of-N, roving tabindex), and this
                    // is a one-shot COMMAND on the thing you are editing. So the command names itself as one, in
                    // the editor's own deictic voice ("this preset" — the header is already about a named preset,
                    // which the h2 two elements away states). One act, one writer, two honestly-different names.
                    // THE NAME LEADS WITH THE VISIBLE WORD (side-eye 2026-08-19 P1-2 — WCAG 2.5.3 label-in-name).
                    // The F-5 split above is right and stays; what it got wrong is that it replaced the label
                    // instead of extending it, so a control reading "Activate" answered only to a phrase that
                    // does not contain that word — unaddressable by speech, and unmatchable by anyone who types
                    // what they can see. Visible word first, then the editor-voice gloss that keeps it distinct
                    // from the list's radio.
                    <Button aria-label="Activate — use this preset for generation" intent="ghost" onClick={onActivate} size="sm" type="button">
                      <Icon icon={Zap} size="sm" />
                      Activate
                    </Button>
                  )}
                  {/* THE MODEL CHIP IS DEAD (side-eye 2026-08-19 P1-3), and this REVERSES the sanctioned-echo
                      ruling recorded here on 2026-08-02 — read both, the orchestrator owns the reconciliation.
                      The old ruling: the `resolved for <model>` line is the provenance of every ghosted number,
                      the readout that owns it lives in a CONTEXT panel that is "away on narrow and closable
                      everywhere", so a truncating chip beside the name is a justified §16 echo.
                      Today's measurement: the echo is paid in the NAME. At the 568px content pane the header
                      band spends its width on a chip that is a strict PREFIX of a line the CONTEXT panel is
                      rendering in full AT THE SAME TIME, and the preset's own name — the one thing the whole
                      pane is about — truncates to pay for it. The F-11 fix ("it truncates, and the name does
                      not") held the name's floor but not its legibility.
                      What survives of the old ruling: the panel-away case. It is a real state, and the answer to
                      it is that the READOUT is the one home for resolution truth (`resolvedForLabel` still spells
                      it, once, for that panel) — not a permanent tax on every header in every regime. */}
                </Row>
                <Row align="center" gap="field">
                  {/* Autosave everywhere (§7): the live status stands where Save/Discard used to. */}
                  <AutosaveStatus state={saveState} onRetry={retrySave} />
                  {/* The BUILT-IN's menu would hold NOTHING — "Reset to starter" is a no-op wearing a
                      destructive confirm, because the built-in IS the starter arrangement (side-eye F-25). An
                      empty menu renders no ⋯ at all rather than a trigger that opens nothing (the section
                      drill-in's own rule); items are OMITTED, never disabled.

                      EXPORT IS NOT HERE (crunch-list O-16★, owner ruling): it lived in BOTH this kebab and the
                      LIST row's, and the fix-all's §16 rows 7+27 sanction of that echo is OVERRULED. ONE home —
                      the list-row kebab, matching the characters/chats precedent that lifecycle lives
                      list-side. */}
                  {/* NO ⋯ OVER A SINGLE COMMAND (side-eye F-18). The overflow held exactly one item, so it
                      bought nothing and cost discoverability twice over: `⋯` signals "there is more here" (there
                      isn't) and signals nothing about WHAT, so the only way to learn the surface offers a reset
                      was to open a menu on the chance. The command is now its own control, wearing its own
                      glyph, with the O-3 icon-door anatomy this feature already speaks — `aria-label` and the
                      native `title` from ONE string, so the tooltip and the accessible name cannot drift. If a
                      second header command ever lands, the kebab comes back with two items in it. */}
                  {isSystemDefault ? null : (
                    <Button aria-label={RESET_LABEL} intent="ghost" onClick={(): void => setResetOpen(true)} size="icon" title={RESET_LABEL} type="button">
                      <Icon icon={RotateCcw} size="sm" />
                    </Button>
                  )}
                </Row>
              </Row>
              {/* THE STRIP DEGRADES TO A SCROLL (side-eye 2026-08-19 P1-1), which is the house rule for a
                  strip that outgrows its box — `shell.css` states it for the context tabs verbatim: "degrade
                  to a SCROLL, never into an ellipsis". Measured before: a 503px tablist in a 390px content
                  pane, so "Transforms" painted UNDER the CONTEXT panel with no pointer able to reach it.
                  The scroll box is a WRAPPER and not the `TabsList` itself, for two reasons: the list's own
                  `w-fit` is what makes the tabs measure their words, and a scroll container clips its
                  overflow on BOTH axes (CSS computes a `visible` axis to `auto` when the other is not),
                  which would eat the tabs' `ring-offset-2` focus halo — `py-tight` is the 4px of headroom
                  that halo needs, paid once, here. `.scroll-fade-x` is `@orb/ui`'s own edge-fade recipe
                  (globals.css), driven by the hook per its stated consumer contract: an edge dissolves only
                  while it is actually hiding something. */}
              <Row className="scroll-fade-x min-w-0 overflow-x-auto py-tight" ref={stripRef}>
                {/* THE STRIP NAMES ITSELF (side-eye 2026-08-22 P3-4). Without this the tablist's accessible
                    name computed from its own contents — `ParamsPromptActionsDataTransforms` — which was
                    the ONE element of 112 mapped controls on this surface that resolved to a DOM-path
                    selector instead of a semantic one. */}
                <TabsList aria-label="Preset sections">
                  {PRESET_EDITOR_VIEWS.map((entry) => (
                    <TabsTab key={entry.id} value={entry.id}>
                      {entry.label}
                    </TabsTab>
                  ))}
                  <TabsIndicator />
                </TabsList>
              </Row>
            </Stack>
          </Container>
        </Stack>

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

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset to the starter arrangement?"
        description="This replaces the preset's sampling, reasoning, prompt structure, and every other setting with the starter defaults. This can't be undone."
        confirmLabel="Reset"
        onConfirm={confirmReset}
      />
    </Stack>
  );
}
