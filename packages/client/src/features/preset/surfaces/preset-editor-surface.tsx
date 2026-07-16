// The preset editor surface — the Presets tabbed editor. Binds the nested `PromptConfig` directly (no
// flat mapper); AUTOSAVE through `preset.update` (D66 A4 / north-star §7) — no Save button, the header
// carries the shared `AutosaveStatus` where Save used to be. A preset carries no model; the params tabs
// resolve capability for the user's configured chat-role connection, and show a connect-a-model note when
// none is configured.
//
// north-star §6.2: the ten leaf tabs render as FOUR primary groups (Generation · Prompt · Context ·
// Transforms), each group's leaves shown as sub-navigation — leaf CONTENT is unchanged (a regroup). The
// outer `Tabs` is the group strip; each group panel nests its own `Tabs` over its leaves.

import type { ChatApi, ModelCapability } from "@orb/contracts/connection";
import type { CredentialSource } from "@orb/contracts/credentials";
import type { PromptConfig } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Icon, MoreHorizontal, RotateCcw } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@orb/ui/menu";
import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab } from "@orb/ui/tabs";
import { Text } from "@orb/ui/text";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "#components";
import { QueryBoundary, QueryErrorState, useGatedQuery, useInvalidation, useTRPC } from "#data";
import type { AppFormInstance } from "#forms";
import { AutosaveStatus } from "#forms";
import { useFocusOnMount } from "#lib";
import { ParamsPanel } from "../components/params-panel";
import { PresetStructureTabs } from "../components/preset-structure-tabs";
import { RegexTab } from "../components/regex-tab";
import { VariablesTab } from "../components/variables-tab";
import { usePresetForm } from "../hooks/use-preset-form";
import { useResetPreset, useUpdatePreset } from "../hooks/use-preset-mutations";
import { clearAssemblyForm, publishAssemblyForm } from "../lib/preset-editor-bridge";
import { mergeOnSubmit, seedConfig } from "../lib/preset-editor-model";
import type { PresetEditorTab } from "../lib/preset-nav";
import { PRESET_EDITOR_GROUPS } from "../lib/preset-nav";

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

  // Reset-to-starter remounts the HOOK-OWNING `PresetEditor` (bumping this nonce into its mount key) so its
  // whole FormApi dies and is reborn seeding from the freshly-written server row — NEVER `form.reset` (the
  // autosave isDirty loop; no-form-reset-in-autosave gate). The nonce lives HERE, ABOVE the query boundary,
  // so it composes into `PresetEditor`'s key — a key on a `<form>` BELOW the hook owner remounts DOM only
  // and the frozen-seed FormApi survives (stickler review 2026-07-16-merge-block-28523122).
  const [resetNonce, setResetNonce] = useState(0);

  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="h-full min-h-0 overflow-y-auto overflow-x-hidden outline-none">
      <QueryBoundary
        fallback={<Text tone="muted">Loading the preset…</Text>}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="the preset" onRetry={retry} />}
      >
        <PresetEditor
          key={`${presetId}:${resetNonce}`}
          presetId={presetId}
          onReseed={(): void => setResetNonce((n) => n + 1)}
          onRevealSection={onRevealSection}
          onDismissSection={onDismissSection}
        />
      </QueryBoundary>
    </Stack>
  );
}

interface PresetEditorProps extends PresetEditorSurfaceProps {
  /** Trigger the hook-owner remount onto the freshly-reset server row (the surface bumps the mount nonce). */
  readonly onReseed: () => void;
}

interface LeafContentProps {
  readonly form: AppFormInstance<PromptConfig>;
  readonly capability: ModelCapability | undefined;
  readonly onRevealSection?: (() => void) | undefined;
  readonly onDismissSection?: (() => void) | undefined;
}

/** Render one leaf tab's content, UNCHANGED from the flat editor (the regroup only re-homes the leaf). */
function leafContent(id: PresetEditorTab["id"], props: LeafContentProps): ReactElement {
  const { form, capability, onRevealSection, onDismissSection } = props;
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
    case "regex":
      return <RegexTab form={form} />;
  }
}

function PresetEditor({ presetId, onReseed, onRevealSection, onDismissSection }: PresetEditorProps): ReactElement {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const invalidation = useInvalidation();
  const { data: preset } = useSuspenseQuery(trpc.preset.get.queryOptions({ id: presetId }));
  const { data: settings } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const update = useUpdatePreset({ trpc, invalidation });
  const reset = useResetPreset({ trpc, invalidation });

  const chat = settings.config.routing.roleDefaults.chat;
  const chatModel = chat?.model ?? undefined;
  const capabilityKey =
    chatModel !== undefined && chatModel !== "" && chat?.source !== undefined && chat.api !== undefined
      ? { model: chatModel, source: chat.source as CredentialSource, api: chat.api as ChatApi }
      : null;
  const capabilityQuery = useGatedQuery(capabilityKey, (key) => trpc.connection.getModelCapability.queryOptions(key));
  const capability = capabilityQuery.data;

  const server = preset.config;
  const save = async (values: PromptConfig): Promise<void> => {
    const merged = mergeOnSubmit(values, server);
    await update.mutateAsync({ id: presetId, config: merged });
  };

  const { form, saveState, retrySave, closeForReseed } = usePresetForm({
    entityId: presetId,
    serverValues: seedConfig(server),
    save,
  });

  const [resetOpen, setResetOpen] = useState(false);
  const confirmReset = (): void => {
    void (async (): Promise<void> => {
      try {
        await reset.mutateAsync({ id: presetId });
        // Reseed from the FRESH row: the mutation's own invalidation of `preset.get` is fire-and-forget, so
        // await the editor's read explicitly before the remount — else `PresetEditor` re-suspends against the
        // STALE cache and the starter never lands. Then arm the teardown-flush suppression (a dirty pre-reset
        // form would otherwise re-persist its old values over the fresh row on unmount) and bump the nonce.
        await queryClient.refetchQueries(trpc.preset.get.queryFilter({ id: presetId }));
        closeForReseed();
        onReseed();
      } catch {
        // The mutation's own errorToast already surfaced it; keep the current arrangement.
      }
    })();
  };

  // Publish the live form handle so the CONTEXT section inspector (a sibling shell region, no shared React
  // ancestor) can bind `sections[i].*`; clears on unmount so a stale handle never outlives the editor.
  useEffect(() => {
    publishAssemblyForm({ presetId, form });
    return (): void => clearAssemblyForm();
  }, [presetId, form]);

  const leafProps: LeafContentProps = { form, capability, onRevealSection, onDismissSection };

  return (
    <form
      onSubmit={(event): void => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <Tabs defaultValue={PRESET_EDITOR_GROUPS[0]?.id}>
        <Stack gap="block" padding="block" className="sticky top-0 z-(--z-raised) bg-card">
          <Row align="center" justify="between" gap="field">
            <Text size="label" weight="medium">
              {preset.name}
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
    </form>
  );
}
