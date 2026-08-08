// The structural preset-editor bodies — the non-descriptor fields that edit `PromptConfig` directly:
// Prompt, Post-process, Templates (the inline-reasoning parse). Bound via the direct-bind form (no flat
// mapper). The generation deck lives in params-deck.tsx.
//
// preset-surface-redesign.md §3 re-homed four things OUT of the Prompt tab, per the schema→home map:
// `params.thinkingDisplay` → Params ▸ REASONING (F4 — a reasoning knob two groups from its own axis);
// `formatStrings.continueNudge`/`impersonateNudge` + the guided templates → the ACTIONS view (F6 — they
// are per-action steering prose, not prompt structure). `params.compaction.*` moved whole to Params ▸
// CONTEXT, so the Compaction body is gone from here with them.
//
// AND THE TAIL CLUSTERS LEFT TOO (crunch-list O-17★, owner ruling): DELIVERY (speaker names · continue
// delimiter) and COLLAPSING (adjacent-role merging · squash system notes) render in the TRANSFORMS view
// now — they shape the WIRE, not the prompt's content. They still live in this file (`DeliveryTab`), one
// module for the structural `PromptConfig` bodies; only their view changed. Each stays an OPEN kicker
// cluster, never a closed disclosure (F6: a closed disclosure is where a knob goes to die). What is left
// under Prompt is genuinely the rack's: the rack.
//
// THE PROMPT VIEW IS RACK-OR-DRILL-IN (§5.2). SELECT ≠ DRILL: a row's name click SELECTS (the shared
// selection store — the CONTEXT readout echoes it, and that echo IS the inspect view); the row's chevron
// DRILLS — which body the CENTER paints, one region, one writer, and the readout projects the SELECTION and
// never needs to know whether an editor is open. The DRILL rides a STORE axis
// (`state/preset-section-drill-store.ts`), NOT local component state: the built-in's copy-on-write retarget
// remounts the whole keyed `PresetForm` mid-edit, and a local drill id died there — dumping the author from
// the section editor to the top of the rack mid-sentence (the SAME F-2 fork-eject the Actions template drill
// fixed). That store is SCOPED `(presetId, sectionId)` and read scoped here, which is what keeps a store-held
// drill from becoming a leak: the fork explicitly re-stamps (the editing session follows its copy), a
// different preset simply does not match (its rack shows), and a VIEW CHANGE closes it at the view store's
// own chokepoint — so leaving Prompt and returning lands on the rack, and the Actions cross-link lands on
// the rack row it selected. Add mints and auto-drills (§16 row 16), so naming is part of creating.
//
// The center's Compose|Preview toggle is GONE with the toolbar's mode arm — the assembled preview lives
// whole in the CONTEXT readout (§16 row 29), and the zone budget went with it (§7's Prompt panel).

import type { ModelCapability } from "@orb/contracts/connection";
import type { MarkerType, PromptConfig, PromptSection } from "@orb/contracts/preset";
import { DEFAULT_CONTINUE_POSTFIX, DEFAULT_NAMES_BEHAVIOR } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
import { FieldLayout } from "@orb/ui/field";
import { Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import type { AppFormInstance } from "#forms";
import { closePresetSectionDrill, drillPresetSection, selectPresetSection, useDrilledPresetSectionId, useSelectedPresetSectionId } from "#state";
import { makeSection } from "../lib/assembly-model.ts";
import { CONTINUE_POSTFIX_ITEMS, continuePostfixLabel, NAMES_BEHAVIOR_ITEMS, namesBehaviorLabel } from "../lib/preset-nav.ts";
import { AssemblyToolbar } from "./assembly-toolbar.tsx";
import { MessageHandlingSection } from "./message-handling-section.tsx";
import { AssemblyRack } from "./prompt-assembly/assembly-rack.tsx";
import { SectionDrillIn } from "./prompt-assembly/section-drill-in.tsx";

type AppForm = AppFormInstance<PromptConfig>;

interface PresetStructureTabsProps {
  readonly form: AppForm;
  readonly tab: "prompt" | "delivery" | "templates" | "postProcess";
  /** WHICH preset is open — the SCOPE the Prompt tab's section drill is stamped with, so a drill can never
   *  paint over a different preset's rack (rack section ids are `DEFAULT_PROMPT_CONFIG` literals, so
   *  collisions between presets are the norm). Required rather than Prompt-only-optional: an unscoped read
   *  is exactly the leak this closes, so no caller may omit it. */
  readonly presetId: PresetId;
  /** Reveal the CONTEXT readout (the mobile/overlay half of the select echo) — Prompt tab only. */
  readonly onRevealSection?: (() => void) | undefined;
  /** The chat-role model's capability (the Collapsing floor line) — Delivery tab only, may be unset. */
  readonly capability?: ModelCapability | undefined;
}

/** Render one structural tab's fields (direct-bound to the nested `PromptConfig`). */
export function PresetStructureTabs({ form, tab, presetId, onRevealSection, capability }: PresetStructureTabsProps): ReactElement {
  if (tab === "prompt") {
    return <PromptTab form={form} onRevealSection={onRevealSection} presetId={presetId} />;
  }
  if (tab === "delivery") {
    return <DeliveryTab capability={capability} form={form} />;
  }
  if (tab === "templates") {
    return <TemplatesTab form={form} />;
  }
  return <PostProcessTab form={form} />;
}

/** DELIVERY + COLLAPSING — the rack's WIRE-SHAPING tail, homed in TRANSFORMS (crunch-list O-17★, owner
 *  ruling, verbatim: "they're wire-shaping, not prompt content"). Speaker names and the continue delimiter
 *  decide how the assembled rows are SPELLED on the wire, and the collapsing pair decides how they are
 *  MERGED — the same job the regex lanes and the post-process steps do, one view over. §5.3 homed them
 *  under Prompt as "how sections speak"; the owner sort wins (the counterpoint is recorded in the spec,
 *  not argued). They stay ONE open kicker cluster each, never a closed disclosure (F6). */
function DeliveryTab({ form, capability }: { readonly form: AppForm; readonly capability?: ModelCapability | undefined }): ReactElement {
  return (
    <Stack gap="section">
      <Section kicker="Delivery">
        {/* GHOSTED DEFAULTS, never blank (side-eye F-05): an unset select rendered an EMPTY combobox, so
            the one datum the row exists to state — what actually happens when you leave it alone — was
            the one thing missing. The placeholder is the wire's own default, read from the constant the
            assembler resolves through, and the explainer moves to the hover hint (§4.1). */}
        <form.AppField name="namesBehavior">
          {(field): ReactElement => (
            <field.SelectField
              hint="Whether and how speaker names are attached to each message."
              items={NAMES_BEHAVIOR_ITEMS}
              label="Speaker names"
              placeholder={namesBehaviorLabel(DEFAULT_NAMES_BEHAVIOR)}
            />
          )}
        </form.AppField>
        <form.AppField name="continuePostfix">
          {(field): ReactElement => (
            <field.SelectField
              hint="What's inserted between the existing text and a continuation."
              items={CONTINUE_POSTFIX_ITEMS}
              label="Continue delimiter"
              placeholder={continuePostfixLabel(DEFAULT_CONTINUE_POSTFIX)}
            />
          )}
        </form.AppField>
      </Section>
      <MessageHandlingSection capability={capability} form={form} />
    </Stack>
  );
}

function PromptTab({
  form,
  presetId,
  onRevealSection,
}: {
  readonly form: AppForm;
  readonly presetId: PresetId;
  readonly onRevealSection?: (() => void) | undefined;
}): ReactElement {
  // WHICH body the center paints. A STORE axis, not local state, so the built-in's fork-retarget remount
  // cannot eject the author from an open editor (see the file header). Read SCOPED to this preset, so a
  // drill left open in another preset reads as the rack. The SELECTION (below) is the shared store the
  // readout echoes — the two axes are deliberately separate (§16 row 19).
  const drilledSectionId = useDrilledPresetSectionId(presetId);
  // WHICH chevron takes focus when the rack comes BACK (side-eye F-04). Set only by the drill-in's exit,
  // so a fresh Prompt-view mount never steals focus; the row consumes it on mount and nothing clears it,
  // because a re-render of the rack with the same id is the same restore.
  const [restoreFocusSectionId, setRestoreFocusSectionId] = useState<string | null>(null);
  const selectedSectionId = useSelectedPresetSectionId();

  const onSelectSection = (sectionId: string): void => {
    selectPresetSection(sectionId);
    onRevealSection?.();
  };
  // Drilling also SELECTS: the row you are editing is the row the readout should be echoing.
  const onDrillSection = (sectionId: string): void => {
    selectPresetSection(sectionId);
    drillPresetSection(presetId, sectionId);
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
            return (
              <SectionDrillIn
                form={form}
                index={index}
                key={drilled.id}
                onBack={(): void => {
                  setRestoreFocusSectionId(drilled.id);
                  closePresetSectionDrill();
                }}
                section={drilled}
              />
            );
          }
          return (
            <Stack gap="block">
              <AssemblyToolbar form={form} onAdd={onAdd} />
              <AssemblyRack
                form={form}
                onAddChatHistory={onAddChatHistory}
                onDrillSection={onDrillSection}
                onSelectSection={onSelectSection}
                restoreFocusSectionId={restoreFocusSectionId}
                selectedSectionId={selectedSectionId}
              />
            </Stack>
          );
        }}
      </form.Subscribe>
    </Stack>
  );
}

function TemplatesTab({ form }: { readonly form: AppForm }): ReactElement {
  return (
    // KICKER, not a 17px sans heading (side-eye F-22): Transforms and Data were the only views still
    // speaking the form-tier heading voice, so they read as a different product from the deck and the rack
    // beside them. `gloss` (not `size="micro"`) is the four-voice grammar's own explainer step (§2).
    <Section kicker="Inline reasoning parsing">
      <Text voice="gloss">
        A fallback that splits an inline reasoning block out of the reply when the model has no native reasoning channel. Native reasoning is always preferred.
      </Text>
      <FieldLayout orientation="horizontal">
        <form.AppField name="reasoningParse.autoParse">
          {(field): ReactElement => (
            <field.SwitchField hint="Split a `<think>…</think>`-style block into the reasoning channel." label="Parse inline reasoning tags" />
          )}
        </form.AppField>
        <form.AppField name="reasoningParse.prefix">
          {(field): ReactElement => <field.TextField hint="The block's start marker." label="Opening tag" />}
        </form.AppField>
        <form.AppField name="reasoningParse.suffix">
          {(field): ReactElement => <field.TextField hint="The block's end marker." label="Closing tag" />}
        </form.AppField>
      </FieldLayout>
    </Section>
  );
}

/** POST-PROCESSING — the reply-side cleanup steps, in the order the pipeline runs them (the same order the
 *  Transforms readout prints, §7: ONE pipeline, ONE vocabulary — side-eye F-23, which measured two names
 *  and two counts for one pipeline). Each switch is a label-left/switch-right row like every other switch
 *  in the surface; the per-step explainer rides the hover hint rather than stacking a third line under a
 *  control that is already two lines tall (side-eye F-22). */
function PostProcessTab({ form }: { readonly form: AppForm }): ReactElement {
  return (
    <Section kicker="Post-processing">
      <Text voice="gloss">Cleanup applied to the model's reply before it lands in the chat, in this order.</Text>
      <FieldLayout orientation="horizontal">
        <form.AppField name="postProcess.collapseNewlines">
          {(field): ReactElement => <field.SwitchField hint="Merge runs of blank lines into one." label="Collapse blank lines" />}
        </form.AppField>
        <form.AppField name="postProcess.trimTrailingWhitespace">
          {(field): ReactElement => <field.SwitchField hint="Strip line-end spaces." label="Trim trailing whitespace" />}
        </form.AppField>
        <form.AppField name="postProcess.dropIncompleteSentence">
          {(field): ReactElement => <field.SwitchField hint="Remove a final sentence the model didn't finish." label="Drop a dangling sentence" />}
        </form.AppField>
        <form.AppField name="postProcess.singleLine">
          {(field): ReactElement => <field.SwitchField hint="Flatten the whole reply to one line." label="Single line" />}
        </form.AppField>
      </FieldLayout>
    </Section>
  );
}
