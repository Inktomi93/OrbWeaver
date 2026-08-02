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
// Every query here is already classified in the freshness map (`preset.get`, `preset.resolveEffective`,
// `connection.resolveChatCapability`, `settings.getUserSettings`) — this panel adds no new server read,
// which is why it carries no new freshness row (§4.4).

import type { PresetId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { usePresetEditorView, useSelectedPresetId, useSelectedPresetSectionId } from "#state";
import { qualityMappingGloss } from "../../lib/effective-knobs";
import { PRESET_EDITOR_VIEWS } from "../../lib/preset-nav";
import { ActionsReadout } from "./actions-readout";
import { DataReadout } from "./data-readout";
import { PromptReadout } from "./prompt-readout";
import { CapabilityCard, EffectiveProfile } from "./readout-parts";
import { TransformsReadout } from "./transforms-readout";

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
      <EffectiveProfile contextWindow={capability.data?.capability.context.window} effective={effective.data ?? undefined} />
      <CapabilityCard capability={capability.data?.capability} model={effective.data?.model} />
    </Stack>
  );
}

/** The open preset's readout, projected by the ACTIVE VIEW. */
function OpenPresetReadout({ presetId }: { readonly presetId: PresetId }): ReactElement {
  const trpc = useTRPC();
  const view = usePresetEditorView() ?? PRESET_EDITOR_VIEWS[0]?.id;
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
      {view === "prompt" ? <PromptReadout sections={config.sections} selectedSectionId={selectedSectionId} /> : null}
      {view === "actions" ? <ActionsReadout sections={config.sections} /> : null}
      {view === "data" ? <DataReadout config={config} /> : null}
      {view === "transforms" ? <TransformsReadout config={config} /> : null}
      {view === "params" ? (
        <>
          <EffectiveProfile contextWindow={capability.data?.capability.context.window} effective={effective.data ?? undefined} />
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
 *  named for the mapping was the one place the mapping never appeared (side-eye F-15). */
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
      <Text voice="gloss">what the dial feeds when a knob is left inherited</Text>
    </Section>
  );
}
