// The structural preset-editor bodies — the non-descriptor fields that edit `PromptConfig` directly:
// Prompt, Post-process, Templates (the inline-reasoning parse). Bound via the direct-bind form (no flat
// mapper). The generation deck lives in params-deck.tsx.
//
// preset-surface-redesign.md §3 re-homed four things OUT of the Prompt tab, per the schema→home map:
// `params.thinkingDisplay` → Params ▸ REASONING (F4 — a reasoning knob two groups from its own axis);
// `formatStrings.continueNudge`/`impersonateNudge` + the guided templates → the ACTIONS view (F6 — they
// are per-action steering prose, not prompt structure). `params.compaction.*` moved whole to Params ▸
// CONTEXT, so the Compaction body is gone from here with them. What is left is genuinely the rack's:
// speaker names + the continue delimiter (the DELIVERY cluster) and message handling.

import type { ModelCapability } from "@orb/contracts/connection";
import type { MarkerType, PromptConfig, PromptSection } from "@orb/contracts/preset";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import type { AppFormInstance } from "#forms";
import { clearPresetSection, selectPresetSection, useSelectedPresetSectionId } from "#state";
import { makeSection } from "../lib/assembly-model";
import { CONTINUE_POSTFIX_ITEMS, NAMES_BEHAVIOR_ITEMS } from "../lib/preset-nav";
import { AssemblyToolbar } from "./assembly-toolbar";
import { MessageHandlingSection } from "./message-handling-section";
import { AssemblyPreview } from "./prompt-assembly/assembly-preview";
import { AssemblyRack } from "./prompt-assembly/assembly-rack";
import { deriveZones } from "./prompt-assembly/derive-zones";
import { assemblePreview } from "./prompt-assembly/preview-model";
import { SectionBodyEditor } from "./prompt-assembly/section-body-editor";
import { ZoneSummaryStrip } from "./prompt-assembly/zone-summary-strip";

type AppForm = AppFormInstance<PromptConfig>;

interface PresetStructureTabsProps {
  readonly form: AppForm;
  readonly tab: "prompt" | "templates" | "postProcess";
  /** Reveal the CONTEXT section inspector — Prompt tab only. */
  readonly onRevealSection?: (() => void) | undefined;
  /** Dismiss the CENTER section drill-in — Prompt tab only, the `SectionBodyEditor` back button. */
  readonly onDismissSection?: (() => void) | undefined;
  /** The chat-role model's capability (the Message-handling floor line) — Prompt tab only, may be unset. */
  readonly capability?: ModelCapability | undefined;
}

/** Render one structural tab's fields (direct-bound to the nested `PromptConfig`). */
export function PresetStructureTabs({ form, tab, onRevealSection, onDismissSection, capability }: PresetStructureTabsProps): ReactElement {
  if (tab === "prompt") {
    return <PromptTab form={form} onRevealSection={onRevealSection} onDismissSection={onDismissSection} capability={capability} />;
  }
  if (tab === "templates") {
    return <TemplatesTab form={form} />;
  }
  return <PostProcessTab form={form} />;
}

function PromptTab({
  form,
  onRevealSection,
  onDismissSection,
  capability,
}: {
  readonly form: AppForm;
  readonly onRevealSection?: (() => void) | undefined;
  readonly onDismissSection?: (() => void) | undefined;
  readonly capability?: ModelCapability | undefined;
}): ReactElement {
  // Mode is local view state — it never touches the form.
  const [mode, setMode] = useState<"compose" | "preview">("compose");
  const selectedSectionId = useSelectedPresetSectionId();

  const onSelectSection = (sectionId: string): void => {
    selectPresetSection(sectionId);
    onRevealSection?.();
  };

  const onSelectPreviewBlock = (sectionId: string): void => {
    setMode("compose");
    onSelectSection(sectionId);
  };

  const onAdd = (marker: MarkerType | null): void => {
    // The autosave BOUNDARY's store driver persists structural array ops (D78 §3) — no manual flush.
    form.pushFieldValue("sections", makeSection(marker));
  };
  const onAddChatHistory = (): void => onAdd("chat_history");

  return (
    <Stack gap="block">
      <form.Subscribe selector={(state): readonly PromptSection[] => state.values.sections}>
        {(sections): ReactElement => {
          const index = selectedSectionId === null ? -1 : sections.findIndex((s) => s.id === selectedSectionId);
          const selected = index === -1 ? undefined : sections[index];
          if (selected !== undefined) {
            return <SectionBodyEditor key={selected.id} form={form} section={selected} index={index} onBack={onDismissSection ?? clearPresetSection} />;
          }
          return (
            <Stack gap="block">
              <AssemblyToolbar form={form} mode={mode} onModeChange={setMode} onAdd={onAdd} />

              <ZoneSummaryStrip zones={deriveZones(sections)} />

              {mode === "preview" ? (
                <AssemblyPreview preview={assemblePreview(sections)} onSelectBlock={onSelectPreviewBlock} />
              ) : (
                <AssemblyRack form={form} selectedSectionId={selectedSectionId} onSelectSection={onSelectSection} onAddChatHistory={onAddChatHistory} />
              )}
            </Stack>
          );
        }}
      </form.Subscribe>

      <CollapsedSection title="Message delivery">
        <form.AppField name="namesBehavior">
          {(field): ReactElement => (
            <field.SelectField label="Speaker names" description="Whether and how speaker names are attached to each message." items={NAMES_BEHAVIOR_ITEMS} />
          )}
        </form.AppField>
        <form.AppField name="continuePostfix">
          {(field): ReactElement => (
            <field.SelectField
              label="Continue delimiter"
              description="What's inserted between the existing text and a continuation."
              items={CONTINUE_POSTFIX_ITEMS}
            />
          )}
        </form.AppField>
      </CollapsedSection>

      <CollapsedSection title="Message handling">
        <MessageHandlingSection form={form} capability={capability} />
      </CollapsedSection>
    </Stack>
  );
}

/** A collapsed (closed-by-default) disclosure Section under the rack — Message delivery / Guided actions. */
function CollapsedSection({ title, children }: { readonly title: string; readonly children: ReactElement | readonly ReactElement[] }): ReactElement {
  return (
    <Collapsible>
      <CollapsibleTrigger>
        <Text size="label" weight="medium">
          {title}
        </Text>
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <Stack gap="field">{children}</Stack>
      </CollapsiblePanel>
    </Collapsible>
  );
}

function TemplatesTab({ form }: { readonly form: AppForm }): ReactElement {
  return (
    <Section heading="Inline reasoning parsing">
      <Text size="micro" tone="muted">
        A fallback that splits an inline reasoning block out of the reply when the model has no native reasoning channel. Native reasoning is always preferred.
      </Text>
      <form.AppField name="reasoningParse.autoParse">
        {(field): ReactElement => (
          <field.SwitchField label="Parse inline reasoning tags" description="Split a `<think>…</think>`-style block into the reasoning channel." />
        )}
      </form.AppField>
      <form.AppField name="reasoningParse.prefix">
        {(field): ReactElement => <field.TextField label="Opening tag" description="The block's start marker." />}
      </form.AppField>
      <form.AppField name="reasoningParse.suffix">
        {(field): ReactElement => <field.TextField label="Closing tag" description="The block's end marker." />}
      </form.AppField>
    </Section>
  );
}

function PostProcessTab({ form }: { readonly form: AppForm }): ReactElement {
  return (
    <Section heading="Post-processing">
      <Text size="micro" tone="muted">
        Cleanup applied to the model's reply before it lands in the chat.
      </Text>
      <form.AppField name="postProcess.collapseNewlines">
        {(field): ReactElement => <field.SwitchField label="Collapse blank lines" description="Merge runs of blank lines into one." />}
      </form.AppField>
      <form.AppField name="postProcess.trimTrailingWhitespace">
        {(field): ReactElement => <field.SwitchField label="Trim trailing whitespace" description="Strip line-end spaces." />}
      </form.AppField>
      <form.AppField name="postProcess.dropIncompleteSentence">
        {(field): ReactElement => <field.SwitchField label="Drop a dangling sentence" description="Remove a final sentence the model didn't finish." />}
      </form.AppField>
      <form.AppField name="postProcess.singleLine">
        {(field): ReactElement => <field.SwitchField label="Single line" description="Flatten the whole reply to one line." />}
      </form.AppField>
    </Section>
  );
}
