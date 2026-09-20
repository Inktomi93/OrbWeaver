// The per-VIEW body dispatch for `preset-editor-surface.tsx` (extracted #73 — component-size gate). Params
// is the new deck; the other four are the landed bodies re-homed per preset-surface-redesign.md §3's
// schema→home map (Data and Transforms simply stack the leaves that used to be sub-tabs).

import type { GenerationCapability } from "@orb/contracts/inference";
import type { PromptConfig } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import type { AppFormInstance } from "#forms/editor";
import { ActionsView } from "../components/actions-view.tsx";
import { ParamsDeck } from "../components/params-deck.tsx";
import { PresetStructureTabs } from "../components/preset-structure-tabs.tsx";
import { RegexTab } from "../components/regex-tab.tsx";
import { UserMacrosTab } from "../components/user-macros-tab.tsx";
import { VariablesTab } from "../components/variables-tab.tsx";
import type { EffectiveProfileRow } from "./effective-knobs.ts";
import type { PresetEditorView } from "./preset-nav.ts";
import { openSectionInPrompt } from "./preset-nav.ts";
import type { ReadFailure } from "./resolve-failure.ts";

export interface ViewContentProps {
  readonly form: AppFormInstance<PromptConfig>;
  readonly capability: GenerationCapability | undefined;
  readonly capabilityError: ReadFailure | null;
  /** The funnel projected for this preset (§4.3) — undefined while unavailable. */
  readonly effective: EffectiveProfileRow | undefined;
  /** The Macros body's source attribution (`preset:<id>` in the browser). */
  readonly presetId: PresetId;
  /** Can this preset hold regex ATTACHMENTS? `false` for the built-in default (null `ownerId`), whose
   *  attachment read `ensurePresetOwned` refuses by construction. The SAME fact the CONTEXT readout takes
   *  (`TransformsReadout.attachable`) — one fact, one answer, so the Transforms tab and the readout beside it
   *  cannot say different things about the same eight pipeline stages (side-eye 2026-08-07 P2). */
  readonly attachable: boolean;
  readonly onRevealSection?: (() => void) | undefined;
}

/** Render one VIEW's body. Params is the new deck; the other four are the landed bodies re-homed per the
 *  §3 map (Data and Transforms simply stack the leaves that used to be sub-tabs). */
export function viewContent(id: PresetEditorView["id"], props: ViewContentProps): ReactElement {
  const { form, capability, capabilityError, effective, presetId, attachable, onRevealSection } = props;
  switch (id) {
    case "params":
      return <ParamsDeck capability={capability} capabilityError={capabilityError} effective={effective} form={form} />;
    case "prompt":
      // No `capability` here any more: the one cluster that read it (Collapsing's floor line) moved to
      // Transforms with the rest of the wire-shaping tail (O-17★).
      return <PresetStructureTabs form={form} onRevealSection={onRevealSection} presetId={presetId} tab="prompt" />;
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
          <PresetStructureTabs capability={capability} form={form} presetId={presetId} tab="delivery" />
          <RegexTab attachable={attachable} presetId={presetId} />
          <PresetStructureTabs form={form} presetId={presetId} tab="postProcess" />
          <PresetStructureTabs form={form} presetId={presetId} tab="templates" />
        </Stack>
      );
  }
}
