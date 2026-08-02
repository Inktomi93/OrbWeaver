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
// HEADER TRUTH (G7): the header states the two facts that change UNDER the editor and are otherwise only
// legible in another pane — whether this preset is the ACTIVE one for generation, and which model the deck's
// effective column resolved against ("for <model>"). The fork-once retarget MOVES activation while you edit,
// and on mobile the LIST is a closed sheet, so a status chip naming an actionable state must be able to act:
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
// `Download` is GONE with the header Export door (O-16★ — one home, the list-row kebab); `Container` is
// lane B's shared content-column ruling.
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
import { useFocusOnMount } from "#lib";
import { setPresetEditorView, usePresetEditorView } from "#state";
import { ActionsView } from "../components/actions-view";
import { ParamsDeck } from "../components/params-deck";
import { PresetForkChoiceDialog } from "../components/preset-fork-choice-dialog";
import { PresetStructureTabs } from "../components/preset-structure-tabs";
import { RegexTab } from "../components/regex-tab";
import { UserMacrosTab } from "../components/user-macros-tab";
import { VariablesTab } from "../components/variables-tab";
import { usePresetAutosave } from "../hooks/use-preset-autosave";
import { useResetPreset, useSetDefaultPreset } from "../hooks/use-preset-mutations";
import type { EffectiveProfileRow } from "../lib/effective-knobs";
import { resolvedForLabel } from "../lib/effective-knobs";
import { seedConfig } from "../lib/preset-editor-model";
import type { PresetEditorView } from "../lib/preset-nav";
import { openSectionInPrompt, PRESET_EDITOR_VIEWS } from "../lib/preset-nav";

/** ONE string for the reset door's accessible name AND its hover tooltip (the O-3 icon-door anatomy). */
const RESET_LABEL = "Reset to starter arrangement";

// The session-boundary autosave form (D78 §1). Module-scope so both the Boundary and its inner Session have
// stable identities (never a per-render factory call). Entity identity, the teardown flush, and reseed live
// INSIDE it — a consumer cannot mount it any way except keyed by `entityId`.
const PresetForm = createAutosaveEntityForm<PromptConfig>({
  defaultValues: DEFAULT_PROMPT_CONFIG,
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
    <Stack ref={surfaceRef} tabIndex={-1} className="h-full min-h-0 overflow-y-auto overflow-x-hidden outline-none">
      <QueryBoundary
        fallback={<Text tone="muted">Loading the preset…</Text>}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="the preset" onRetry={retry} />}
      >
        <PresetEditor presetId={presetId} onRevealSection={onRevealSection} />
      </QueryBoundary>
    </Stack>
  );
}

interface ViewContentProps {
  readonly form: AppFormInstance<PromptConfig>;
  readonly capability: ModelCapability | undefined;
  readonly capabilityError: string | null;
  /** The funnel projected for this preset (§4.3) — undefined while unavailable. */
  readonly effective: EffectiveProfileRow | undefined;
  /** The server-only BYOK passthrough's keys (D7's presence row) — it never enters the form values. */
  readonly customParameterKeys: readonly string[];
  /** The Macros body's source attribution (`preset:<id>` in the browser). */
  readonly presetId: PresetId;
  readonly onRevealSection?: (() => void) | undefined;
}

/** Render one VIEW's body. Params is the new deck; the other four are the landed bodies re-homed per the
 *  §3 map (Data and Transforms simply stack the leaves that used to be sub-tabs). */
function viewContent(id: PresetEditorView["id"], props: ViewContentProps): ReactElement {
  const { form, capability, capabilityError, effective, customParameterKeys, presetId, onRevealSection } = props;
  switch (id) {
    case "params":
      return (
        <ParamsDeck capability={capability} capabilityError={capabilityError} customParameterKeys={customParameterKeys} effective={effective} form={form} />
      );
    case "prompt":
      // No `capability` here any more: the one cluster that read it (Collapsing's floor line) moved to
      // Transforms with the rest of the wire-shaping tail (O-17★).
      return <PresetStructureTabs form={form} onRevealSection={onRevealSection} tab="prompt" />;
    case "actions":
      return (
        <ActionsView
          form={form}
          // THE REAL DOOR (crunch-list O-13): the cross-link used to select a rack row and leave you
          // standing in Actions, where no rack exists — a click with no visible effect. `openSectionInPrompt`
          // does both halves (view + selection); the reveal stays for the narrow regime, where the readout
          // that echoes the selection is a closed sheet.
          onSelectSection={(sectionId): void => {
            openSectionInPrompt(sectionId);
            onRevealSection?.();
          }}
        />
      );
    case "data":
      return (
        <Stack gap="section">
          <VariablesTab form={form} />
          <UserMacrosTab form={form} presetId={presetId} />
        </Stack>
      );
    case "transforms":
      return (
        <Stack gap="section">
          {/* DELIVERY + COLLAPSING lead the view (crunch-list O-17★): they shape the OUTGOING wire, so
              they sit above the prompt-side regex lanes and everything reply-side, in the same execution
              order the Transforms readout prints. */}
          <PresetStructureTabs capability={capability} form={form} tab="delivery" />
          <RegexTab presetId={presetId} />
          <PresetStructureTabs form={form} tab="postProcess" />
          <PresetStructureTabs form={form} tab="templates" />
        </Stack>
      );
  }
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
  const onActivate = (): void => {
    setDefault.mutate({ section: "seeds", patch: { defaultPresetId: preset.isSystemDefault ? null : presetId } });
  };
  // isError ≠ no-model (side-eye F-02): a FAILED capability read must not render as "connect a chat model"
  // to someone who has one connected. The message is the server's own. `null` therefore means PENDING, which
  // is the gate's other (and only other) arm — see `capability-gate.tsx`'s header.
  const capabilityError = capabilityQuery.error === null ? null : capabilityQuery.error.message;

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
            customParameterKeys={Object.keys(preset.config.customParameters ?? {})}
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
  /** The capability read's failure message, `null` while it is still PENDING (§F-02). */
  readonly capabilityError: string | null;
  readonly effective: EffectiveProfileRow | undefined;
  readonly customParameterKeys: readonly string[];
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
  customParameterKeys,
  reset,
  onRevealSection,
}: PresetEditorBodyProps): ReactElement {
  const { form, saveState, retrySave, reseed } = session;

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

  const viewProps: ViewContentProps = { form: boundForm, capability, capabilityError, effective, customParameterKeys, presetId, onRevealSection };
  // The ONE writer of the view axis; an unset store read resolves to the tuple's first view.
  const view = usePresetEditorView() ?? PRESET_EDITOR_VIEWS[0]?.id;

  return (
    <Stack>
      <Tabs onValueChange={(next): void => setPresetEditorView(String(next))} value={view}>
        <Stack gap="block" padding="block" className="sticky top-0 z-(--z-raised) bg-card">
          <Row align="center" justify="between" gap="field">
            <Row align="center" className="min-w-0" gap="field">
              {/* The artifact's NAME is an h2 (side-eye F-28 / ARIA rec 8): it was a <p>, with the view's
                  kickers as h3s under no h2 at all, so heading navigation could not find the thing being
                  edited. It now RENDERS like the title it is (crunch-list 13): `voice="label"` held it at
                  the deck's 13px/500 label step, so the one thing the whole pane is about read as just
                  another field name beside its own chips. The h2's default `title` size + semibold is the
                  step the mock draws. */}
              <Heading className="min-w-24 shrink truncate" level={2}>
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
                <Button aria-label={`Activate ${presetName} for generation`} intent="ghost" onClick={onActivate} size="sm" type="button">
                  <Icon icon={Zap} size="sm" />
                  Activate
                </Button>
              )}
              {/* The PROVENANCE of everything the deck ghosts: `resolveEffective` resolves against the
                  caller's own chat model, so the header names it rather than letting the numbers imply a
                  model that may have been swapped since. Absent read ⇒ absent chip, never a guessed name.
                  THE NAME OUTRANKS IT AT NARROW (side-eye F-11): at 430px the chip pushed the preset name
                  out of the header entirely and overlapped the save status. It truncates, and the name
                  does not.

                  ITS WORDS ARE THE READOUT'S (crunch-list O-2). It read `for anthropic/claude-sonnet-5`,
                  which is a sentence about the PRESET — "this preset is for that model" — and the preset is
                  for nothing: it is a config that resolves against whatever chat model you currently have.
                  The readout owns resolution truth and already said it correctly, so the vocabulary homes
                  ONCE in `resolvedForLabel` (`../lib/effective-knobs`, beside the rung vocabulary the same
                  read's other glosses share) and both spellings come out of it. The chip KEEPS its home:
                  the readout lives in the CONTEXT panel, which is away on narrow and closable everywhere,
                  and this is the §16 sanctioned-echo class — a justified echo, not a second home. */}
              {effective === undefined ? null : (
                <Badge className="min-w-0 shrink truncate" intent="neutral" size="sm" tone="ghost">
                  {resolvedForLabel(effective.model)}
                </Badge>
              )}
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
          <TabsList>
            {PRESET_EDITOR_VIEWS.map((entry) => (
              <TabsTab key={entry.id} value={entry.id}>
                {entry.label}
              </TabsTab>
            ))}
            <TabsIndicator />
          </TabsList>
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
