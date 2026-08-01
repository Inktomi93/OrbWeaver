// The preset editor surface — the Presets tabbed editor. Binds the nested `PromptConfig` directly (no
// flat mapper); AUTOSAVE through `preset.update` (D66 A4 / north-star §7) — no Save button, the header
// carries the shared `AutosaveStatus` where Save used to be. A preset carries no model; the Params deck
// resolves capability for the user's configured chat-role connection, and shows a connect-a-model note when
// none is configured.
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
// The deck's ghost column reads `preset.resolveEffective` (§4.3/D5) — the REAL funnel, not a client
// mirror. A plain `useQuery`: the read fails when no chat connection resolves (the same condition that
// hides the model-fed clusters), and that degrades to un-ghosted rows rather than an error boundary.

import type { ModelCapability } from "@orb/contracts/connection";
import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Icon, MoreHorizontal, RotateCcw } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@orb/ui/menu";
import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab } from "@orb/ui/tabs";
import { Text } from "@orb/ui/text";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "#components";
import { QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import type { AppFormInstance, AutosaveSession } from "#forms";
import { AutosaveStatus, createAutosaveEntityForm } from "#forms";
import { useFocusOnMount } from "#lib";
import { selectPresetSection, setPresetEditorView, usePresetEditorView } from "#state";
import { ActionsView } from "../components/actions-view";
import { ParamsDeck } from "../components/params-deck";
import { PresetForkChoiceDialog } from "../components/preset-fork-choice-dialog";
import { PresetStructureTabs } from "../components/preset-structure-tabs";
import { RegexTab } from "../components/regex-tab";
import { UserMacrosTab } from "../components/user-macros-tab";
import { VariablesTab } from "../components/variables-tab";
import { usePresetAutosave } from "../hooks/use-preset-autosave";
import { useResetPreset } from "../hooks/use-preset-mutations";
import type { EffectiveProfileRow } from "../lib/effective-knobs";
import { clearAssemblyForm, publishAssemblyForm } from "../lib/preset-editor-bridge";
import { seedConfig } from "../lib/preset-editor-model";
import type { PresetEditorView } from "../lib/preset-nav";
import { PRESET_EDITOR_VIEWS } from "../lib/preset-nav";

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
  /** Dismiss the section drill-in — the CENTER `SectionBodyEditor` back button. */
  readonly onDismissSection?: (() => void) | undefined;
}

export function PresetEditorSurface({ presetId, onRevealSection, onDismissSection }: PresetEditorSurfaceProps): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="h-full min-h-0 overflow-y-auto overflow-x-hidden outline-none">
      <QueryBoundary
        fallback={<Text tone="muted">Loading the preset…</Text>}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="the preset" onRetry={retry} />}
      >
        <PresetEditor presetId={presetId} onRevealSection={onRevealSection} onDismissSection={onDismissSection} />
      </QueryBoundary>
    </Stack>
  );
}

interface ViewContentProps {
  readonly form: AppFormInstance<PromptConfig>;
  readonly capability: ModelCapability | undefined;
  /** The funnel projected for this preset (§4.3) — undefined while unavailable. */
  readonly effective: EffectiveProfileRow | undefined;
  /** The server-only BYOK passthrough's keys (D7's presence row) — it never enters the form values. */
  readonly customParameterKeys: readonly string[];
  /** The Macros body's source attribution (`preset:<id>` in the browser). */
  readonly presetId: PresetId;
  readonly onRevealSection?: (() => void) | undefined;
  readonly onDismissSection?: (() => void) | undefined;
}

/** Render one VIEW's body. Params is the new deck; the other four are the landed bodies re-homed per the
 *  §3 map (Data and Transforms simply stack the leaves that used to be sub-tabs). */
function viewContent(id: PresetEditorView["id"], props: ViewContentProps): ReactElement {
  const { form, capability, effective, customParameterKeys, presetId, onRevealSection, onDismissSection } = props;
  switch (id) {
    case "params":
      return <ParamsDeck capability={capability} customParameterKeys={customParameterKeys} effective={effective} form={form} />;
    case "prompt":
      return <PresetStructureTabs capability={capability} form={form} onDismissSection={onDismissSection} onRevealSection={onRevealSection} tab="prompt" />;
    case "actions":
      return (
        <ActionsView
          form={form}
          onSelectSection={(sectionId): void => {
            selectPresetSection(sectionId);
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
          <RegexTab form={form} />
          <PresetStructureTabs form={form} tab="postProcess" />
          <PresetStructureTabs form={form} tab="templates" />
        </Stack>
      );
  }
}

function PresetEditor({ presetId, onRevealSection, onDismissSection }: PresetEditorSurfaceProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: preset } = useSuspenseQuery(trpc.preset.get.queryOptions({ id: presetId }));
  // The active-for-generation pointer — read here (not just in the LIST) because the built-in's copy-on-write
  // fork must INHERIT it: a fork the user can't generate with makes every edit a silent no-op.
  const { data: settings } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const reset = useResetPreset({ trpc, invalidation });

  // The LIVE resolved chat capability — the SAME `(model, source, api)` a real turn resolves (incl. the
  // vLLM engine's self-reported window), not a hand-built key off `roleDefaults.chat` (often unset on the
  // vLLM default). Refetches on a settings change (the routing knobs feed the resolution). A resolve failure
  // (no chat connection configured) leaves `capability` undefined ⇒ the panel shows its connect-a-model note.
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
  const autosave = usePresetAutosave({ presetId, server: preset.config, activePresetId: settings.config.seeds.defaultPresetId });

  return (
    <>
      <PresetForm entityId={presetId} serverValues={seedConfig(preset.config)} save={autosave.save}>
        {(session): ReactElement => (
          <PresetEditorBody
            session={session}
            presetId={presetId}
            presetName={preset.name}
            capability={capability}
            effective={effectiveQuery.data ?? undefined}
            customParameterKeys={Object.keys(preset.config.customParameters ?? {})}
            reset={reset}
            onRevealSection={onRevealSection}
            onDismissSection={onDismissSection}
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
  readonly capability: ModelCapability | undefined;
  readonly effective: EffectiveProfileRow | undefined;
  readonly customParameterKeys: readonly string[];
  readonly reset: ReturnType<typeof useResetPreset>;
  readonly onRevealSection?: (() => void) | undefined;
  readonly onDismissSection?: (() => void) | undefined;
}

function PresetEditorBody({
  session,
  presetId,
  presetName,
  capability,
  effective,
  customParameterKeys,
  reset,
  onRevealSection,
  onDismissSection,
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

  // Publish the live form handle so the CONTEXT section inspector (a sibling shell region, no shared React
  // ancestor) can bind `sections[i].*`; clears on unmount so a stale handle never outlives the editor. The
  // session's `form` is the boundary's widened surface minus `reset`; the bridge consumers are typed against
  // the full `AppFormInstance` (the editor never calls `reset`), so widen once here.
  const boundForm = form as AppFormInstance<PromptConfig>;
  useEffect(() => {
    publishAssemblyForm({ presetId, form: boundForm });
    return (): void => clearAssemblyForm();
  }, [presetId, boundForm]);

  const viewProps: ViewContentProps = { form: boundForm, capability, effective, customParameterKeys, presetId, onRevealSection, onDismissSection };
  // The ONE writer of the view axis; an unset store read resolves to the tuple's first view.
  const view = usePresetEditorView() ?? PRESET_EDITOR_VIEWS[0]?.id;

  return (
    <Stack>
      <Tabs onValueChange={(next): void => setPresetEditorView(String(next))} value={view}>
        <Stack gap="block" padding="block" className="sticky top-0 z-(--z-raised) bg-card">
          <Row align="center" justify="between" gap="field">
            <Text size="label" weight="medium">
              {presetName}
            </Text>
            <Row align="center" gap="field">
              {/* Autosave everywhere (§7): the live status stands where Save/Discard used to. */}
              <AutosaveStatus state={saveState} onRetry={retrySave} />
              <Menu>
                <MenuTrigger
                  render={
                    <Button intent="ghost" size="icon" aria-label="Preset options">
                      <Icon icon={MoreHorizontal} size="sm" />
                    </Button>
                  }
                />
                <MenuPopup align="end">
                  <MenuItem onClick={(): void => setResetOpen(true)}>
                    <Icon icon={RotateCcw} size="sm" />
                    Reset to starter arrangement
                  </MenuItem>
                </MenuPopup>
              </Menu>
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
            <Stack gap="block" padding="block">
              {viewContent(entry.id, viewProps)}
            </Stack>
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
