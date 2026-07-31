// The preset editor surface — the Presets tabbed editor. Binds the nested `PromptConfig` directly (no
// flat mapper); AUTOSAVE through `preset.update` (D66 A4 / north-star §7) — no Save button, the header
// carries the shared `AutosaveStatus` where Save used to be. A preset carries no model; the params tabs
// resolve capability for the user's configured chat-role connection, and show a connect-a-model note when
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
//
// north-star §6.2: the ten leaf tabs render as FOUR primary groups (Generation · Prompt · Context ·
// Transforms), each group's leaves shown as sub-navigation — leaf CONTENT is unchanged (a regroup). The
// outer `Tabs` is the group strip; each group panel nests its own `Tabs` over its leaves.

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
import { ParamsPanel } from "../components/params-panel";
import { PresetStructureTabs } from "../components/preset-structure-tabs";
import { RegexTab } from "../components/regex-tab";
import { UserMacrosTab } from "../components/user-macros-tab";
import { VariablesTab } from "../components/variables-tab";
import { usePresetAutosave } from "../hooks/use-preset-autosave";
import { useResetPreset } from "../hooks/use-preset-mutations";
import { clearAssemblyForm, publishAssemblyForm } from "../lib/preset-editor-bridge";
import { seedConfig } from "../lib/preset-editor-model";
import type { PresetEditorTab } from "../lib/preset-nav";
import { PRESET_EDITOR_GROUPS } from "../lib/preset-nav";

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

interface LeafContentProps {
  readonly form: AppFormInstance<PromptConfig>;
  readonly capability: ModelCapability | undefined;
  /** The Macros leaf's source attribution (`preset:<id>` in the browser). */
  readonly presetId: PresetId;
  readonly onRevealSection?: (() => void) | undefined;
  readonly onDismissSection?: (() => void) | undefined;
}

/** Render one leaf tab's content, UNCHANGED from the flat editor (the regroup only re-homes the leaf). */
function leafContent(id: PresetEditorTab["id"], props: LeafContentProps): ReactElement {
  const { form, capability, presetId, onRevealSection, onDismissSection } = props;
  switch (id) {
    case "quality":
    case "sampling":
    case "reasoning":
    case "output":
      return <ParamsPanel capability={capability} form={form} axis={id} />;
    case "prompt":
      return <PresetStructureTabs form={form} tab="prompt" onRevealSection={onRevealSection} onDismissSection={onDismissSection} capability={capability} />;
    case "templates":
      return <PresetStructureTabs form={form} tab="templates" />;
    case "postProcess":
      return <PresetStructureTabs form={form} tab="postProcess" />;
    case "compaction":
      return <PresetStructureTabs form={form} tab="compaction" />;
    case "variables":
      return <VariablesTab form={form} />;
    case "macros":
      return <UserMacrosTab form={form} presetId={presetId} />;
    case "regex":
      return <RegexTab form={form} />;
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

  // The save path incl. the built-in's fork-once retarget (see the hook header) — never an inline mutateAsync.
  const save = usePresetAutosave({ presetId, server: preset.config, activePresetId: settings.config.seeds.defaultPresetId });

  return (
    <PresetForm entityId={presetId} serverValues={seedConfig(preset.config)} save={save}>
      {(session): ReactElement => (
        <PresetEditorBody
          session={session}
          presetId={presetId}
          presetName={preset.name}
          capability={capability}
          reset={reset}
          onRevealSection={onRevealSection}
          onDismissSection={onDismissSection}
        />
      )}
    </PresetForm>
  );
}

interface PresetEditorBodyProps {
  readonly session: AutosaveSession<PromptConfig>;
  readonly presetId: PresetId;
  readonly presetName: string;
  readonly capability: ModelCapability | undefined;
  readonly reset: ReturnType<typeof useResetPreset>;
  readonly onRevealSection?: (() => void) | undefined;
  readonly onDismissSection?: (() => void) | undefined;
}

function PresetEditorBody({ session, presetId, presetName, capability, reset, onRevealSection, onDismissSection }: PresetEditorBodyProps): ReactElement {
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

  const leafProps: LeafContentProps = { form: boundForm, capability, presetId, onRevealSection, onDismissSection };

  return (
    <Stack>
      <Tabs defaultValue={PRESET_EDITOR_GROUPS[0]?.id}>
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
            {PRESET_EDITOR_GROUPS.map((group) => (
              <TabsTab key={group.id} value={group.id}>
                {group.label}
              </TabsTab>
            ))}
            <TabsIndicator />
          </TabsList>
        </Stack>

        {PRESET_EDITOR_GROUPS.map((group) => (
          <TabsPanel key={group.id} value={group.id}>
            <Tabs defaultValue={group.tabs[0]?.id}>
              <Stack gap="block" padding="block">
                <TabsList>
                  {group.tabs.map((tab) => (
                    <TabsTab key={tab.id} value={tab.id}>
                      {tab.label}
                    </TabsTab>
                  ))}
                  <TabsIndicator />
                </TabsList>
                {group.tabs.map((tab) => (
                  <TabsPanel key={tab.id} value={tab.id}>
                    {leafContent(tab.id, leafProps)}
                  </TabsPanel>
                ))}
              </Stack>
            </Tabs>
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
