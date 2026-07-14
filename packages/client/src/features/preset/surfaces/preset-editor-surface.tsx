// The preset editor surface — the Presets tabbed editor. Binds the nested `PromptConfig` directly (no
// flat mapper), button-gated save through `preset.update`. A preset carries no model; the params tabs
// resolve capability for the user's configured chat-role connection, and show a connect-a-model note
// when none is configured.

import type { ChatApi } from "@orb/contracts/connection";
import type { CredentialSource } from "@orb/contracts/credentials";
import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve Icon/MoreHorizontal/RotateCcw fine (the preset-library-surface.tsx precedent).
import { Icon, MoreHorizontal, RotateCcw } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@orb/ui/menu";
import { SaveBar } from "@orb/ui/save-bar";
import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab } from "@orb/ui/tabs";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "#components";
import { QueryBoundary, useGatedQuery, useInvalidation, useTRPC } from "#data";
import { useFocusOnMount } from "#lib";
import { ParamsPanel } from "../components/params-panel";
import { PresetStructureTabs } from "../components/preset-structure-tabs";
import { RegexTab } from "../components/regex-tab";
import { VariablesTab } from "../components/variables-tab";
import { usePresetForm } from "../hooks/use-preset-form";
import { useResetPreset, useUpdatePreset } from "../hooks/use-preset-mutations";
import { clearAssemblyForm, publishAssemblyForm } from "../lib/preset-editor-bridge";
import { mergeOnSubmit, seedConfig } from "../lib/preset-editor-model";
import { PRESET_EDITOR_TABS } from "../lib/preset-nav";

export interface PresetEditorSurfaceProps {
  readonly presetId: PresetId;
  /** Reveal the CONTEXT section inspector — a rack row's name-button click calls this after selecting the section. */
  readonly onRevealSection?: (() => void) | undefined;
  /** Dismiss the section drill-in — the CENTER `SectionBodyEditor` back button. */
  readonly onDismissSection?: (() => void) | undefined;
}

export function PresetEditorSurface({
  presetId,
  onRevealSection,
  onDismissSection,
}: PresetEditorSurfaceProps): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    <Stack
      ref={surfaceRef}
      tabIndex={-1}
      className="h-full min-h-0 overflow-y-auto overflow-x-hidden outline-none"
    >
      <QueryBoundary
        fallback={<Text tone="muted">Loading the preset…</Text>}
        renderError={(_error, retry): ReactElement => (
          <Text tone="muted">
            Couldn't load the preset.{" "}
            <Button intent="ghost" onClick={retry}>
              Retry
            </Button>
          </Text>
        )}
      >
        <PresetEditor
          presetId={presetId}
          onRevealSection={onRevealSection}
          onDismissSection={onDismissSection}
        />
      </QueryBoundary>
    </Stack>
  );
}

function PresetEditor({
  presetId,
  onRevealSection,
  onDismissSection,
}: PresetEditorSurfaceProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: preset } = useSuspenseQuery(trpc.preset.get.queryOptions({ id: presetId }));
  const { data: settings } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const update = useUpdatePreset({ trpc, invalidation });
  const reset = useResetPreset({ trpc, invalidation });

  const chat = settings.config.routing.roleDefaults.chat;
  const chatModel = chat?.model ?? undefined;
  const capabilityKey =
    chatModel !== undefined &&
    chatModel !== "" &&
    chat?.source !== undefined &&
    chat.api !== undefined
      ? { model: chatModel, source: chat.source as CredentialSource, api: chat.api as ChatApi }
      : null;
  const capabilityQuery = useGatedQuery(capabilityKey, (key) =>
    trpc.connection.getModelCapability.queryOptions(key),
  );
  const capability = capabilityQuery.data;

  const server = preset.config;
  const save = async (values: PromptConfig): Promise<PromptConfig> => {
    const merged = mergeOnSubmit(values, server);
    await update.mutateAsync({ id: presetId, config: merged });
    return seedConfig(merged);
  };

  const { form, mountKey } = usePresetForm({
    entityId: presetId,
    serverValues: seedConfig(server),
    save,
  });

  const [resetOpen, setResetOpen] = useState(false);
  const confirmReset = (): void => {
    void (async (): Promise<void> => {
      try {
        await reset.mutateAsync({ id: presetId });
        // Re-baseline the live form to the starter the server just wrote — the reseed guard alone only
        // fires on an untouched form, so a dirty editor would keep showing the discarded arrangement.
        form.reset(seedConfig(DEFAULT_PROMPT_CONFIG));
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

  return (
    <form
      key={mountKey}
      onSubmit={(event): void => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <Tabs defaultValue="quality">
        <Stack gap="block" padding="block" className="sticky top-0 z-(--z-raised) bg-card">
          <Row align="center" justify="between" gap="field">
            <Text size="label" weight="medium">
              {preset.name}
            </Text>
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
          <TabsList>
            {PRESET_EDITOR_TABS.map((tab) => (
              <TabsTab key={tab.id} value={tab.id}>
                {tab.label}
              </TabsTab>
            ))}
            <TabsIndicator />
          </TabsList>
        </Stack>

        <Stack gap="block" padding="block">
          <TabsPanel value="quality">
            <ParamsPanel capability={capability} form={form} axis="quality" />
          </TabsPanel>
          <TabsPanel value="sampling">
            <ParamsPanel capability={capability} form={form} axis="sampling" />
          </TabsPanel>
          <TabsPanel value="reasoning">
            <ParamsPanel capability={capability} form={form} axis="reasoning" />
          </TabsPanel>
          <TabsPanel value="output">
            <ParamsPanel capability={capability} form={form} axis="output" />
          </TabsPanel>

          <TabsPanel value="prompt">
            <PresetStructureTabs
              form={form}
              tab="prompt"
              onRevealSection={onRevealSection}
              onDismissSection={onDismissSection}
              capability={capability}
            />
          </TabsPanel>
          <TabsPanel value="templates">
            <PresetStructureTabs form={form} tab="templates" />
          </TabsPanel>
          <TabsPanel value="postProcess">
            <PresetStructureTabs form={form} tab="postProcess" />
          </TabsPanel>
          <TabsPanel value="compaction">
            <PresetStructureTabs form={form} tab="compaction" />
          </TabsPanel>

          <TabsPanel value="variables">
            <VariablesTab form={form} />
          </TabsPanel>
          <TabsPanel value="regex">
            <RegexTab form={form} />
          </TabsPanel>
        </Stack>
      </Tabs>

      <form.AppForm>
        <SaveBar title={preset.name} kind="Preset" sticky="footer">
          <form.DirtyPill />
          <form.SubmitButton>Save preset</form.SubmitButton>
        </SaveBar>
      </form.AppForm>

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
