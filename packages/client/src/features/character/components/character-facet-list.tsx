// CharacterFacetList — the CONTENT master list of card-content facets (character-editor redesign, from
// assembly-rack.tsx). The facets render GROUPED BY TIER (Voice / Extras / Advanced) with a heading per
// group — THE hierarchy the audit found missing ("nine same-weight fields, nothing chunked"). It reads the
// live draft form to compute each facet's filled-state + content preview in render (`form.Subscribe` over
// the whole values object — the blessed live read, character-advanced-tab precedent). Token counts live in
// the editor header readout (P5), never per-row.
//
// Clicking a row calls `onSelect(facetId)` — the surface writes the local selection AND reveals the CONTEXT
// Field tab (two-things-at-once, mirroring the preset rack's `onSelectSection`).

import type { CharacterId } from "@orb/kit/ids";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import type { AppFormInstance } from "#forms";
import type { CharacterCardFacet } from "../lib/character-card-facets";
import { CHARACTER_CARD_FACETS, CHARACTER_FACET_TIER_LABELS, CHARACTER_FACET_TIERS } from "../lib/character-card-facets";
import type { CharacterCardFormValues } from "../lib/character-card-form-model";
import { CharacterFacetRow } from "./character-facet-row";

type CardForm = AppFormInstance<CharacterCardFormValues>;

export interface CharacterFacetListProps {
  readonly form: CardForm;
  /** D121-E: the regex facet's "Set" cue + preview count come from `regex.listForCharacter`, not the draft. */
  readonly characterId: CharacterId;
  /** The CONTENT-drilled / CONTEXT-inspected facet (highlights its row), or `null`. */
  readonly selectedFacetId: CharacterCardFacet["id"] | null;
  /** The facet whose row should reclaim keyboard focus when the list (re)mounts — the drill-in ← Back
   *  return target, so backing out of a facet lands focus on the row it came from (not `<body>`). `null` =
   *  no restore (e.g. the initial list mount, where stealing focus would jump past the rail nav). */
  readonly focusFacetId: CharacterCardFacet["id"] | null;
  /** Drill a facet → reveal the CONTEXT Field inspector (the route-built choreography). */
  readonly onSelect: (id: CharacterCardFacet["id"]) => void;
}

/** Whether a facet holds authored content (drives the "Set" cue). depthPrompt reads its note text; provenance
 *  is filled when either creator or version is set; regexScripts when the character has ATTACHED library rows
 *  (D121-E — a count the caller reads from the server, since scripts are no longer card content); the rest are
 *  filled when their text field is non-blank. */
function facetFilled(id: CharacterCardFacet["id"], values: CharacterCardFormValues, attachedRegexCount: number): boolean {
  switch (id) {
    case "depthPrompt":
      return values.depthPromptText.trim() !== "";
    case "regexScripts":
      return attachedRegexCount > 0;
    case "provenance":
      return values.creator.trim() !== "" || values.cardVersion.trim() !== "";
    case "description":
    case "personality":
    case "scenario":
    case "exampleMessages":
    case "systemPrompt":
    case "postHistoryInstructions":
    case "creatorNotes":
      return values[id].trim() !== "";
  }
}

/** A short content preview for a FILLED facet row (reads as content, not metadata) — `null` when empty.
 *  depthPrompt previews its note text; regexScripts a count; provenance the creator/version; the rest the
 *  field's own text (the row truncates it). Kept in sync with `facetFilled` (same non-empty definition). */
function facetPreview(id: CharacterCardFacet["id"], values: CharacterCardFormValues, attachedRegexCount: number): string | null {
  switch (id) {
    case "depthPrompt": {
      const text = values.depthPromptText.trim();
      return text === "" ? null : text;
    }
    case "regexScripts": {
      return attachedRegexCount === 0 ? null : `${attachedRegexCount} ${attachedRegexCount === 1 ? "script" : "scripts"}`;
    }
    case "provenance": {
      const parts = [values.creator.trim(), values.cardVersion.trim()].filter((part) => part !== "");
      return parts.length === 0 ? null : parts.join(" · ");
    }
    case "description":
    case "personality":
    case "scenario":
    case "exampleMessages":
    case "systemPrompt":
    case "postHistoryInstructions":
    case "creatorNotes": {
      const text = values[id].trim();
      return text === "" ? null : text;
    }
  }
}

export function CharacterFacetList({ form, characterId, selectedFacetId, focusFacetId, onSelect }: CharacterFacetListProps): ReactElement {
  const trpc = useTRPC();
  // D121-E: the regex facet's row cue reads the ATTACHED junction, not the draft. `useQuery` (not
  // suspense) so the facet list paints immediately and the regex row's cue fills in — a facet list that
  // blocks on a satellite read is a worse trade than one row's cue arriving a beat late.
  const attachedRegex = useQuery(trpc.regex.listForCharacter.queryOptions({ characterId }));
  const attachedRegexCount = attachedRegex.data?.length ?? 0;
  return (
    <form.Subscribe selector={(s): CharacterCardFormValues => s.values}>
      {(values): ReactElement => (
        <Stack gap="section">
          {CHARACTER_FACET_TIERS.map((tier) => {
            const facets = CHARACTER_CARD_FACETS.filter((facet) => facet.tier === tier);
            return (
              <Stack key={tier} gap="field">
                <Text size="label" weight="medium" tone="muted" transform="caps">
                  {CHARACTER_FACET_TIER_LABELS[tier]}
                </Text>
                {facets.map((facet) => (
                  <CharacterFacetRow
                    key={facet.id}
                    facet={facet}
                    selected={facet.id === selectedFacetId}
                    filled={facetFilled(facet.id, values, attachedRegexCount)}
                    preview={facetPreview(facet.id, values, attachedRegexCount)}
                    focusOnMount={facet.id === focusFacetId}
                    onSelect={onSelect}
                  />
                ))}
              </Stack>
            );
          })}
        </Stack>
      )}
    </form.Subscribe>
  );
}
