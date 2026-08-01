// The structural preset-editor bodies — the non-descriptor fields that edit `PromptConfig` directly:
// Prompt, Post-process, Templates (the inline-reasoning parse). Bound via the direct-bind form (no flat
// mapper). The generation deck lives in params-deck.tsx.
//
// preset-surface-redesign.md §3 re-homed four things OUT of the Prompt tab, per the schema→home map:
// `params.thinkingDisplay` → Params ▸ REASONING (F4 — a reasoning knob two groups from its own axis);
// `formatStrings.continueNudge`/`impersonateNudge` + the guided templates → the ACTIONS view (F6 — they
// are per-action steering prose, not prompt structure). `params.compaction.*` moved whole to Params ▸
// CONTEXT, so the Compaction body is gone from here with them. What is left is genuinely the rack's:
// speaker names + the continue delimiter and message handling — the §5.3 DELIVERY cluster, an OPEN kicker
// cluster now rather than two closed disclosures (F6: a closed disclosure is where a knob goes to die).
//
// THE PROMPT VIEW IS RACK-OR-DRILL-IN (§5.2). SELECT ≠ DRILL: a row's name click SELECTS (the shared
// selection store — the CONTEXT readout echoes it, and that echo IS the inspect view); the row's chevron
// DRILLS. The DRILL is LOCAL view state, deliberately: it is which body the CENTER paints, one region, one
// writer — the readout projects the SELECTION and never needs to know whether an editor is open. Add mints
// and auto-drills (§16 row 16), so naming is part of creating.
//
// The center's Compose|Preview toggle is GONE with the toolbar's mode arm — the assembled preview lives
// whole in the CONTEXT readout (§16 row 29), and the zone budget went with it (§7's Prompt panel).

import type { ModelCapability } from "@orb/contracts/connection";
import type { MarkerType, PromptConfig, PromptSection } from "@orb/contracts/preset";
import { Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import type { AppFormInstance } from "#forms";
import { selectPresetSection, useSelectedPresetSectionId } from "#state";
import { makeSection } from "../lib/assembly-model";
import { CONTINUE_POSTFIX_ITEMS, NAMES_BEHAVIOR_ITEMS } from "../lib/preset-nav";
import { AssemblyToolbar } from "./assembly-toolbar";
import { MessageHandlingSection } from "./message-handling-section";
import { AssemblyRack } from "./prompt-assembly/assembly-rack";
import { SectionDrillIn } from "./prompt-assembly/section-drill-in";

type AppForm = AppFormInstance<PromptConfig>;

interface PresetStructureTabsProps {
  readonly form: AppForm;
  readonly tab: "prompt" | "templates" | "postProcess";
  /** Reveal the CONTEXT readout (the mobile/overlay half of the select echo) — Prompt tab only. */
  readonly onRevealSection?: (() => void) | undefined;
  /** The chat-role model's capability (the Message-handling floor line) — Prompt tab only, may be unset. */
  readonly capability?: ModelCapability | undefined;
}

/** Render one structural tab's fields (direct-bound to the nested `PromptConfig`). */
export function PresetStructureTabs({ form, tab, onRevealSection, capability }: PresetStructureTabsProps): ReactElement {
  if (tab === "prompt") {
    return <PromptTab capability={capability} form={form} onRevealSection={onRevealSection} />;
  }
  if (tab === "templates") {
    return <TemplatesTab form={form} />;
  }
  return <PostProcessTab form={form} />;
}

function PromptTab({
  form,
  onRevealSection,
  capability,
}: {
  readonly form: AppForm;
  readonly onRevealSection?: (() => void) | undefined;
  readonly capability?: ModelCapability | undefined;
}): ReactElement {
  // WHICH body the center paints. Local by construction: one region, one writer. The SELECTION (below) is
  // the shared store the readout echoes — the two axes are deliberately separate (§16 row 19).
  const [drilledSectionId, setDrilledSectionId] = useState<string | null>(null);
  const selectedSectionId = useSelectedPresetSectionId();

  const onSelectSection = (sectionId: string): void => {
    selectPresetSection(sectionId);
    onRevealSection?.();
  };
  // Drilling also SELECTS: the row you are editing is the row the readout should be echoing.
  const onDrillSection = (sectionId: string): void => {
    selectPresetSection(sectionId);
    setDrilledSectionId(sectionId);
  };

  const onAdd = (marker: MarkerType | null): void => {
    const section = makeSection(marker);
    // The autosave BOUNDARY's store driver persists structural array ops (D78 §3) — no manual flush.
    form.pushFieldValue("sections", section);
    // §16 row 16 — mint AND drill: the NAME field lives in the editor, so naming is part of creating.
    onDrillSection(section.id);
  };
  const onAddChatHistory = (): void => onAdd("chat_history");

  return (
    <Stack gap="section">
      <form.Subscribe selector={(state): readonly PromptSection[] => state.values.sections}>
        {(sections): ReactElement => {
          const index = drilledSectionId === null ? -1 : sections.findIndex((s) => s.id === drilledSectionId);
          const drilled = index === -1 ? undefined : sections[index];
          if (drilled !== undefined) {
            return <SectionDrillIn form={form} index={index} key={drilled.id} onBack={(): void => setDrilledSectionId(null)} section={drilled} />;
          }
          return (
            <Stack gap="block">
              <AssemblyToolbar form={form} onAdd={onAdd} />
              <AssemblyRack
                form={form}
                onAddChatHistory={onAddChatHistory}
                onDrillSection={onDrillSection}
                onSelectSection={onSelectSection}
                selectedSectionId={selectedSectionId}
              />
            </Stack>
          );
        }}
      </form.Subscribe>

      {/* §5.3 — the DELIVERY cluster: wire-shaping knobs for the rack's output, so they stay with the rack.
          An OPEN kicker cluster, never a closed disclosure (F6). Hidden while drilled: the drill-in is a
          full-pane takeover of one object, and these belong to the arrangement. */}
      {drilledSectionId === null ? (
        <Section kicker="Delivery">
          <form.AppField name="namesBehavior">
            {(field): ReactElement => (
              <field.SelectField description="Whether and how speaker names are attached to each message." items={NAMES_BEHAVIOR_ITEMS} label="Speaker names" />
            )}
          </form.AppField>
          <form.AppField name="continuePostfix">
            {(field): ReactElement => (
              <field.SelectField
                description="What's inserted between the existing text and a continuation."
                items={CONTINUE_POSTFIX_ITEMS}
                label="Continue delimiter"
              />
            )}
          </form.AppField>
          <MessageHandlingSection capability={capability} form={form} />
        </Section>
      ) : null}
    </Stack>
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
