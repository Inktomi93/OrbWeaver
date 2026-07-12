// The preset EDITOR surface — the Presets CONTENT (UI-Arch §4.2 Presets row "tabbed editor"; §13.4 many-
// field editor → `createSavedEntityForm`). A containment CONSUMER (§2.1). Binds the nested `PromptConfig`
// DIRECTLY (no flat mapper — preset-form-mapper-elimination.md), so `form.AppField name="params.temperature"`
// walks the config. BUTTON-GATED save through `preset.update` (the save-bar Save button); the params tabs
// render the descriptor-driven `ParamsPanel` off the chat-role model's `ModelCapabilityView` (the GATE:
// render-from-descriptor, never a static knob stack).
//
// The capability read: the params panel needs the target model's descriptor. A preset does NOT carry a
// model (Connections owns `{api, source, model}`, D31/no-config-bound-to-chats); so the editor resolves the
// capability for the user's configured CHAT-role connection (`routing.roleDefaults.chat`) via
// `connection.getModelCapability`. When no chat connection is configured, the params tabs show a note (a
// preset can still be authored — the prompt/templates tabs don't need a model), never a fabricated stack.

import type { ChatApi } from "@orb/contracts/connection";
import type { CredentialSource } from "@orb/contracts/credentials";
import type { PromptConfig } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import { SaveBar } from "@orb/ui/save-bar";
import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab } from "@orb/ui/tabs";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useEffect, useRef } from "react";
import { QueryBoundary, useGatedQuery, useInvalidation, useTRPC } from "#data";
import { useFocusOnMount } from "#lib";
import { ParamsPanel } from "../components/params-panel";
import { PresetStructureTabs } from "../components/preset-structure-tabs";
import { RegexTab } from "../components/regex-tab";
import { VariablesTab } from "../components/variables-tab";
import { usePresetForm } from "../hooks/use-preset-form";
import { useUpdatePreset } from "../hooks/use-preset-mutations";
import { clearAssemblyForm, publishAssemblyForm } from "../lib/preset-editor-bridge";
import { mergeOnSubmit, seedConfig } from "../lib/preset-editor-model";
import { PRESET_EDITOR_TABS } from "../lib/preset-nav";

export interface PresetEditorSurfaceProps {
  readonly presetId: PresetId;
  /** Reveal the CONTEXT section inspector (the route-built choreography, §3.4) — a rack row's name-button
   *  click calls this AFTER writing the section selection. Threaded to the rack via the Prompt tab. */
  readonly onRevealSection?: (() => void) | undefined;
}

/** The tabbed preset editor for the selected preset. */
export function PresetEditorSurface({
  presetId,
  onRevealSection,
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
        <PresetEditor presetId={presetId} onRevealSection={onRevealSection} />
      </QueryBoundary>
    </Stack>
  );
}

function PresetEditor({ presetId, onRevealSection }: PresetEditorSurfaceProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: preset } = useSuspenseQuery(trpc.preset.get.queryOptions({ id: presetId }));
  const { data: settings } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const update = useUpdatePreset({ trpc, invalidation });

  // The chat-role connection (the model the params panel describes). A preset is model-agnostic; the panel
  // borrows the user's configured chat model to know which knobs to show. Unset ⇒ no capability read.
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

  // THE FORM BRIDGE (BUILD-SPEC §2.3) — publish the live handle so the CONTEXT section inspector (a
  // sibling shell region, no shared React ancestor) can bind `sections[i].*`. Re-publishes when the form
  // instance changes (a save/reset cycles `mountKey` → a fresh `form`); clears on unmount so a stale handle
  // never outlives the editor. `presetId`/`form` are the only reactive inputs — this is a genuine external-
  // store sync, the sanctioned effect shape (not a shared-selection chase; app-shell-exempt gate N/A here).
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
        {/* Fixed header: the preset name + tab strip stay pinned to the top of the surface's ONE scroll
            region while a long tab body scrolls under them. `sticky top-0` (not a bounded flex region) keeps
            the raw `<form>` un-classed — a background is required so scrolled content doesn't bleed through. */}
        <Stack gap="block" padding="block" className="sticky top-0 z-(--z-raised) bg-card">
          <Text size="label" weight="medium">
            {preset.name}
          </Text>
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
          {/* The four DESCRIPTOR-driven params tabs — each renders the ParamsPanel off the capability.
              `capability` may be undefined (no chat connection): Quality still renders (it derives nothing
              from the descriptor), the other three show the connect-a-model note — gated inside ParamsPanel. */}
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

          {/* The structural tabs — edit `PromptConfig` fields directly (no model needed). The Prompt tab
              is The Assembly rack; it receives the route-built reveal callback for the section inspector. */}
          <TabsPanel value="prompt">
            <PresetStructureTabs
              form={form}
              tab="prompt"
              onRevealSection={onRevealSection}
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

          {/* The Variables + Regex tabs (BUILD-SPEC §8) — each a ListRow list + an editor Dialog binding
              `variables[i].*` / `regexScripts[i].*`. The merge flip (mergeOnSubmit → edited.*) carries them. */}
          <TabsPanel value="variables">
            <VariablesTab form={form} />
          </TabsPanel>
          <TabsPanel value="regex">
            <RegexTab form={form} />
          </TabsPanel>
        </Stack>
      </Tabs>

      {/* Pinned footer: the save-bar sticks to the bottom of the same scroll region, so Save is always
          reachable no matter how long the active tab body runs (SaveBar owns the sticky + bg + z chrome). */}
      <form.AppForm>
        <SaveBar title={preset.name} kind="Preset" sticky="footer">
          <form.DirtyPill />
          <form.SubmitButton>Save preset</form.SubmitButton>
        </SaveBar>
      </form.AppForm>
    </form>
  );
}
