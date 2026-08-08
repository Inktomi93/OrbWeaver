// The Presets CONTEXT panel — ONE per-view READOUT (preset-surface-redesign.md §7, owner decision D2).
//
// CONTEXT stops renting editing and becomes the preset's INSTRUMENT. The section INSPECTOR is deleted
// (with its form bridge — one object, one place, §5.2), and what stands here PROJECTS BY VIEW: what the
// eye needs depends on which hand is active. Every panel names the decision it informs; an element that
// informs no decision does not ship.
//
// THREE PINS (§7 mechanics), all load-bearing:
//  1. THE VIEW IS SECTION STATE. `presetEditorView` is written by the editor's tab strip and by NOTHING
//     else (§16 row 10); this panel READS it and never sets it — a projection, not a second navigation
//     surface.
//  2. SAVED TRUTH ONLY. Every panel reads `preset.get` + `preset.resolveEffective` + the capability read.
//     The form bridge does not come back: autosave means saved lags a typed edit by one debounce, the
//     `AutosaveStatus` chip already narrates settle, and a pure-query readout needs no cross-region form
//     machinery. "Settle-live" is stated, never faked keystroke-live.
//  3. READ-ONLY + NAVIGATION-ONLY. The only interactive elements are the sanctioned selection ECHOES
//     (§16 rows 14/19/29), each writing through the ONE selection store action. Zero mutation affordances
//     live in this panel — a standing §16 invariant.
//
// NO SELECTION IS A FIRST-CLASS PANEL, not an empty state: with the LIST open and no editor, the readout
// points the SAME effective projection at the ACTIVE preset — "is what generation will use right now what
// I want?" It is the §4.3 read pointed at a different preset id; zero new machinery.
//
// FRESHNESS (§4.4): every read this panel mounts is classified. `preset.get`, `preset.resolveEffective`,
// `connection.resolveChatCapability`, `settings.getUserSettings` and `chat.listChats` were already covered;
// the D8 binding adds ONE — `chat.previewActionTemplates`, which joins `promptPreviewReads` in the
// invalidation seam (see its comment there for why that row is the right home and what it inherits). The
// D121-G Prompt half adds NO row: it reads `chat.previewAssembly`, the read that member has carried since it
// was minted, so the bound rack inherits `presetsChanged` (the autosave you just made) + every canon terminal
// (the conversation it is pricing) by construction.

import type { PresetId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { usePresetEditorView, useSelectedPresetId, useSelectedPresetSectionId } from "#state";
import { useReadoutBinding } from "../../hooks/use-readout-binding.ts";
import { qualityMappingGloss } from "../../lib/effective-knobs.ts";
import type { PresetEditorView } from "../../lib/preset-nav.ts";
import { PRESET_EDITOR_VIEWS } from "../../lib/preset-nav.ts";
import { templateStoredText } from "../../lib/template-rows.ts";
import { ActionsReadout } from "./actions-readout.tsx";
import { DataReadout } from "./data-readout.tsx";
import { PromptReadout } from "./prompt-readout.tsx";
import { ReadoutBindingChip } from "./readout-binding.tsx";
import { CapabilityCard, EffectiveProfile } from "./readout-parts.tsx";
import { TransformsReadout } from "./transforms-readout.tsx";

export function PresetReadout(): ReactElement {
  const presetId = useSelectedPresetId();
  if (presetId === null) {
    return <ActivePresetReadout />;
  }
  return <OpenPresetReadout presetId={presetId} />;
}

/** The no-selection panel: the ACTIVE pick's effective profile. Useful before a row is ever clicked.
 *  The active id is resolved THROUGH the list (whose rows carry real `PresetId`s) rather than cast out of
 *  the settings blob's plain string — the seed is a pointer, the list is the identity.
 *
 *  ONE VOCABULARY WITH THE LIST (side-eye F-07): `defaultPresetId === null` is not "nothing is activated" —
 *  it IS the built-in row's activate state, which the LIST paints with an Active badge. The panel used to
 *  say the opposite, beside that badge, and showed no profile at all. The built-in is a REAL row with a
 *  real id, so the null pick resolves to it and gets the same chip + the same effective table as any other
 *  preset: the resolver already answers for it. */
function ActivePresetReadout(): ReactElement {
  const trpc = useTRPC();
  const settings = useQuery(trpc.settings.getUserSettings.queryOptions());
  const presets = useQuery(trpc.preset.list.queryOptions());
  const activeId = settings.data?.config.seeds.defaultPresetId ?? null;
  const active = activeId === null ? presets.data?.find((preset) => preset.isSystemDefault) : presets.data?.find((preset) => preset.id === activeId);
  if (active === undefined) {
    // The list has not landed yet — the honest wait, not an "activate something" claim (that claim is what
    // F-07 measured as false).
    return (
      <Stack padding="block">
        <Text voice="gloss">Loading the active preset…</Text>
      </Stack>
    );
  }
  return <ActiveProfile isSystemDefault={active.isSystemDefault} name={active.name} presetId={active.id} />;
}

function ActiveProfile({
  presetId,
  name,
  isSystemDefault,
}: {
  readonly presetId: PresetId;
  readonly name: string;
  readonly isSystemDefault: boolean;
}): ReactElement {
  const trpc = useTRPC();
  const capability = useQuery(trpc.connection.resolveChatCapability.queryOptions());
  const effective = useQuery(trpc.preset.resolveEffective.queryOptions({ id: presetId }));
  return (
    <Stack gap="section" padding="block">
      <Section kicker="Active preset">
        <Row align="center" gap="field">
          <Text voice="label">{name}</Text>
          {/* The SAME chip the LIST row and the editor header wear — one state, one reading (F-07). */}
          <Badge intent="primary" size="sm" tone="soft">
            Active
          </Badge>
        </Row>
        {isSystemDefault ? <Text voice="gloss">The built-in preset runs generation until you activate one of your own.</Text> : null}
      </Section>
      {/* The resolve's ERROR rides alongside its data (F-02): absent+no-error is PENDING, absent+error is a
          settled failure. Handing only the data over would make the panel state one as the other — and the
          ERROR OBJECT goes down whole (2026-08-08), because the band discriminates on tRPC's structured
          `data.code` to decide which cause it is entitled to name. `refetch` makes its Retry a real re-read. */}
      <EffectiveProfile
        contextWindow={capability.data?.capability.context.window}
        effective={effective.data ?? undefined}
        error={effective.error}
        onRetry={(): void => {
          void effective.refetch();
        }}
      />
      <CapabilityCard capability={capability.data?.capability} model={effective.data?.model} />
    </Stack>
  );
}

/** WHICH views a bound chat actually changes — and, for the ones it does not, WHY (D121-G: the set became a
 *  real TABLE when Prompt joined it). Membership is a PROMISE: a `true` row resolves something through the
 *  binding, so naming the binding above it is a statement of fact rather than a claim. A total
 *  `Record<PresetEditorView["id"], …>`, so a SIXTH view is a `tsc` error here — the chip can never be decided
 *  by omission (§5.5 dispatch discipline). */
const BINDING_VIEWS: Record<PresetEditorView["id"], boolean> = {
  // The effective profile is preset × capability and genuinely chat-independent — a chip over it would claim
  // a resolution that is not happening (the §7 honesty pin, inverted).
  params: false,
  // The rack's bars + the selected carrier's rows are priced by the BOUND chat's own assembly.
  prompt: true,
  // The selected template is rendered by the chat (Ruling B: the editor displays a chat-side answer).
  actions: true,
  // A pure client scan over the saved config — no chat can change a reference count inside this preset.
  data: false,
  // The pipeline ORDER is preset-side; a chat neither adds nor removes a stage.
  transforms: false,
};

/** The open preset's readout, projected by the ACTIVE VIEW. */
function OpenPresetReadout({ presetId }: { readonly presetId: PresetId }): ReactElement {
  const trpc = useTRPC();
  const binding = useReadoutBinding();
  // Resolved through the REGISTRY (the header's own idiom), not off the raw store string: the binding table
  // below is keyed by the view-id union, so an unset/stale store read has to land on a real view before it can
  // decide anything — and the strip's `[0]` default is read from the tuple rather than re-spelled.
  const storedView = usePresetEditorView();
  const view = (PRESET_EDITOR_VIEWS.find((entry) => entry.id === storedView) ?? PRESET_EDITOR_VIEWS[0])?.id;
  const selectedSectionId = useSelectedPresetSectionId();
  const preset = useQuery(trpc.preset.get.queryOptions({ id: presetId }));
  const effective = useQuery(trpc.preset.resolveEffective.queryOptions({ id: presetId }));
  const capability = useQuery(trpc.connection.resolveChatCapability.queryOptions());

  const config = preset.data?.config;
  if (config === undefined) {
    return (
      <Stack padding="block">
        <Text voice="gloss">Loading the readout…</Text>
      </Stack>
    );
  }
  return (
    <Stack gap="section" padding="block">
      {/* THE BINDING (D8 / §7.1) sits above the projected panel — the readout's own header row, exactly where
          the mock draws it, and only on the views that CONSUME it (the `BINDING_VIEWS` table above states, per
          view, whether a resolution actually happens there). */}
      {view !== undefined && BINDING_VIEWS[view] ? <ReadoutBindingChip binding={binding} /> : null}
      {view === "prompt" ? (
        <PromptReadout boundChatId={binding.boundChatId} presetId={presetId} sections={config.sections} selectedSectionId={selectedSectionId} />
      ) : null}
      {view === "actions" ? (
        <ActionsReadout
          boundChatId={binding.boundChatId}
          presetId={presetId}
          sections={config.sections}
          templateText={(id): string => templateStoredText(config, id)}
        />
      ) : null}
      {view === "data" ? <DataReadout config={config} /> : null}
      {/* `attachable` is the SYSTEM-DEFAULT fact, read off the wire flag (never the sentinel id): that preset
          has a null owner, so the attachment read refuses it by design and its regex stages are known-off
          rather than unread. */}
      {view === "transforms" ? <TransformsReadout attachable={preset.data?.isSystemDefault !== true} config={config} presetId={presetId} /> : null}
      {view === "params" ? (
        <>
          <EffectiveProfile
            contextWindow={capability.data?.capability.context.window}
            effective={effective.data ?? undefined}
            error={effective.error}
            onRetry={(): void => {
              void effective.refetch();
            }}
          />
          <CapabilityCard capability={capability.data?.capability} model={effective.data?.model} />
          <QualityMapping effective={effective.data ?? undefined} quality={config.params.quality} />
        </>
      ) : null}
    </Stack>
  );
}

/** THE MAPPING DATUM — what the dial FEEDS ("deep → effort high · temp 1.0"), the server's own projection
 *  of the dial table (never a client re-mapping of quality→axes, which is the drift
 *  `capability-panel-model.ts` bans). It used to repeat the deck's override-STATUS sentence, so the panel
 *  named for the mapping was the one place the mapping never appeared (side-eye F-15).
 *
 *  THE OFF ARM (owner ruling O-18): the dropdown's "Don't use quality" is a real, named arm, so this group
 *  states it ("quality off — knobs are what you set") instead of vanishing. A missing group cannot be told
 *  apart from a read that has not landed — and "no dial" is precisely the fact a reader of the mapping panel
 *  came for. The teach line under it belongs to the SET arms only (with no dial there is nothing it feeds). */
function QualityMapping({
  effective,
  quality,
}: {
  readonly effective: Parameters<typeof qualityMappingGloss>[0];
  readonly quality: string | undefined;
}): ReactElement | null {
  const gloss = qualityMappingGloss(effective, quality);
  if (gloss === null) {
    return null;
  }
  return (
    <Section kicker="Quality mapping">
      <Text voice="datum">{gloss}</Text>
      {quality === undefined ? null : <Text voice="gloss">what the dial feeds when a knob is left inherited</Text>}
    </Section>
  );
}
