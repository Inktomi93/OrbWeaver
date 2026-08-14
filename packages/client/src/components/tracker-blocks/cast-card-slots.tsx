// The CAST CARD and its header slots (both extracted from tracker-blocks.tsx under the component-size cap —
// the card followed its slots here rather than splitting one unit across two files: it is nothing but their
// arrangement, and no other component composes them). The slots: the
// relationship slot (a display-at-rest badge whose CLICK opens the closed 6-token kind PICKER — Tier-0
// §12.3, but never a RESTING dropdown per DESIGN §12.4.1) and the mood slot (display-at-rest,
// input-on-click via TrackerValue) and the GUIDE lines (RV-11 — the standing appearance/outfit/thoughts the
// story writes every beat, which reached no reader at all until the panel and the steering reminder grew one).
// All three are editable-in-place by default per the kit doctrine (§3.2).

import type { RpgCastGuideField, RpgRelationship, RpgRelationshipKind } from "@orb/contracts/rpg";
import { RPG_CAST_GUIDE_FIELDS, RPG_RELATIONSHIP_KINDS } from "@orb/contracts/rpg";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Popover, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { RelationshipBadge } from "./relationship-badge.tsx";
import { TrackerChip } from "./tracker-blocks.tsx";
import { TrackerValue } from "./tracker-value.tsx";

interface CastRelationshipProps {
  readonly name: string;
  readonly relationship?: RpgRelationship;
  readonly onEditRelationshipKind?: (next: RpgRelationshipKind) => void;
  /** An optional relationship glyph (aria-hidden) for the SEED state only ("+ relationship") — the feature
   *  supplies it (the tier-2 kit can't reach a feature glyph lib). Once a badge renders it carries its OWN
   *  glyph, so the seed glyph must not double up beside it (owner double-star report, 08-01). */
  readonly relationshipGlyph?: ReactNode;
}

/** The relationship slot — display-at-rest: the read badge (or a quiet "+ relationship" seed affordance
 *  when neutral) opens the 6-kind PICKER popover on click. Read-only (no callback): the badge alone,
 *  silent on neutral. Off-vocab kinds are unconstructable (Tier-0). */
function CastRelationship({ name, relationship, onEditRelationshipKind, relationshipGlyph }: CastRelationshipProps): ReactElement | null {
  const kind = relationship?.kind ?? "neutral";
  // Controlled so a PICK closes the popover in the same gesture (commit-and-close, §12.4.1).
  const [open, setOpen] = useState(false);
  if (onEditRelationshipKind !== undefined) {
    const badge = relationship !== undefined && kind !== "neutral" ? <RelationshipBadge relationship={relationship} /> : null;
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              intent="ghost"
              size="inline"
              aria-label={`${name} relationship`}
              title="Click to edit"
              // rounded-full + zero padding when a badge shows: the trigger's hover highlight must hug the
              // pill EXACTLY — padding around it reads as a mismatched halo (owner reports ×2, 08-01). The
              // seed state ("+ relationship") keeps its own padding for a clickable text target.
              className={badge === null ? "rounded-full px-field" : "rounded-full"}
            >
              {badge ?? (
                <>
                  {relationshipGlyph}
                  <Text as="span" size="micro" tone="muted">
                    + relationship
                  </Text>
                </>
              )}
            </Button>
          }
        />
        <PopoverPopup>
          <Stack gap="field" role="group" aria-label={`${name} relationship kind`}>
            {RPG_RELATIONSHIP_KINDS.map((option) => (
              <Button
                key={option}
                type="button"
                intent={option === kind ? "secondary" : "ghost"}
                size="sm"
                className="justify-start"
                onClick={(): void => {
                  if (option !== kind) {
                    onEditRelationshipKind(option);
                  }
                  setOpen(false);
                }}
              >
                {option}
              </Button>
            ))}
          </Stack>
        </PopoverPopup>
      </Popover>
    );
  }
  if (relationship === undefined) {
    return null;
  }
  return <RelationshipBadge relationship={relationship} />;
}

/** The italic voice for `thoughts` — inner state the reader is overhearing, not a line anyone says. The
 *  other two guides are plain muted prose (they describe what IS on stage). One map, so the distinction is a
 *  lookup rather than a conditional sprinkled through the render. */
const GUIDE_CLASS: Readonly<Record<RpgCastGuideField, string>> = {
  appearance: "min-w-0 break-words",
  outfit: "min-w-0 break-words",
  thoughts: "min-w-0 break-words italic",
};

interface CastGuidesProps {
  readonly name: string;
  /** The standing per-character guides (RV-11) — the story writes them; an unwritten one is simply ABSENT
   *  (an omitted line, never a "none" placeholder: a missing guide is not a missing feature). */
  readonly appearance?: string;
  readonly outfit?: string;
  readonly thoughts?: string;
  /** Commit one guide (free text) — present ⇒ each SHOWN guide is editable-in-place (§3.2). It cannot seed an
   *  unwritten guide: these are prose the story authors, and three empty labelled rows on every cast card
   *  would cost more than the seeding is worth. */
  readonly onEditGuide?: (field: RpgCastGuideField, next: string) => void;
}

/** The guide lines under the cast header — `appearance`/`outfit`/`thoughts` as quiet secondary prose. They
 *  are MODEL-authored free text with no length contract, so every line wraps (`min-w-0 break-words`) instead
 *  of widening the card (the 08-01 mood/beat overflow class). Empty ⇒ the line is omitted entirely. */
function CastGuides({ name, appearance, outfit, thoughts, onEditGuide }: CastGuidesProps): ReactElement | null {
  const shown = RPG_CAST_GUIDE_FIELDS.map((field) => ({ field, text: { appearance, outfit, thoughts }[field]?.trim() ?? "" })).filter((g) => g.text !== "");
  if (shown.length === 0) {
    return null;
  }
  return (
    <Stack gap="field" data-slot="cast-guides">
      {shown.map(({ field, text }) => (
        <Row key={field} gap="field" align="baseline" className="min-w-0">
          <Text as="span" size="micro" tone="muted" className="shrink-0">
            {field}
          </Text>
          {onEditGuide === undefined ? (
            <Text as="span" size="label" tone="muted" className={GUIDE_CLASS[field]}>
              {text}
            </Text>
          ) : (
            <TrackerValue
              ariaLabel={`${name} ${field}`}
              display={text}
              tone="muted"
              onEdit={(next): void => onEditGuide(field, next)}
              wrap={true}
              className={`!w-auto max-w-full field-sizing-content ${GUIDE_CLASS[field]}`}
              restClassName={GUIDE_CLASS[field]}
            />
          )}
        </Row>
      ))}
    </Stack>
  );
}

interface CastMoodProps {
  readonly name: string;
  readonly mood?: string;
  readonly onEditMood?: (next: string) => void;
}

/** The mood slot — display-at-rest with the inline editor on click (TrackerValue owns the grammar);
 *  read-only shows the plain line (omitted when absent). */
function CastMood({ name, mood, onEditMood }: CastMoodProps): ReactElement | null {
  if (onEditMood !== undefined) {
    // flex-1 (basis-0) + min-w-0: the mood is model-authored free text with no length contract — it takes
    // only the LEFTOVER header width and wraps inside it. A shrinkable auto-basis box instead put the
    // name+badge half under shrink pressure, collapsing the pill under the mood label (owner scene-jank
    // screenshot, 08-01). justify-end keeps the slot hugging the card's right edge like the mock.
    return (
      <Row gap="field" align="baseline" className="min-w-0 flex-1 justify-end">
        <Text as="span" size="micro" tone="muted" className="shrink-0">
          mood
        </Text>
        <TrackerValue
          ariaLabel={`${name} mood`}
          display={mood ?? ""}
          placeholder="—"
          onEdit={onEditMood}
          wrap={true}
          className="!w-auto min-w-0 max-w-full field-sizing-content"
        />
      </Row>
    );
  }
  if (mood === undefined) {
    return null;
  }
  return (
    <Text as="span" size="label" tone="muted" className="min-w-0 break-words">
      mood — {mood}
    </Text>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE CARD — the arrangement of the three slots above (moved here from tracker-blocks.tsx under the
// component-size cap): emoji · name · relationship · mood, then guides, meters and the field chips.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

export interface CastField {
  readonly name: string;
  readonly value: string;
}

export interface CastCardProps {
  readonly name: string;
  /** The model-written cast EMOJI — the character's face on the row (the reminder has rendered it beside the
   *  name server-side all along; the client slot was named in this file's cast-row order and never built).
   *  Decoration beside the datum: the NAME is the accessible name, so the glyph is `aria-hidden` (the
   *  relationship/tracker-shape glyph rule). Empty ⇒ nothing renders. */
  readonly emoji?: string;
  readonly mood?: string;
  /** The standing per-character GUIDES (RV-11) — prose the story keeps current between beats. Quiet
   *  secondary lines under the header, NOT tracker chips: they are sentences, not readings. Empty ⇒ omitted. */
  readonly appearance?: string;
  readonly outfit?: string;
  /** The character's unspoken inner state — rendered in the italic overheard voice, never as dialogue. */
  readonly thoughts?: string;
  /** Commit one guide by field — present ⇒ the shown guide lines are editable; absent ⇒ read-only. */
  readonly onEditGuide?: (field: RpgCastGuideField, next: string) => void;
  readonly fields?: readonly CastField[];
  /** The cast member's relationship stance (§2.1) — badged in the header row; a neutral default shows nothing. */
  readonly relationship?: RpgRelationship;
  /** Meter blocks for numeric per-NPC trackers (rendered above the text-field chips). */
  readonly meters?: ReactNode;
  /** Commit a field value by field name — present ⇒ its chips are editable; absent ⇒ read-only. */
  readonly onEditField?: (fieldName: string, next: string) => void;
  /** Commit a new mood (free text) — present ⇒ the mood is editable-in-place (§3.2). */
  readonly onEditMood?: (next: string) => void;
  /** Commit a new relationship KIND (the closed 6-token vocab — a PICKER, Tier-0 §12.3; off-vocab is
   *  unconstructable). Present ⇒ the badge becomes a compact kind picker. */
  readonly onEditRelationshipKind?: (next: RpgRelationshipKind) => void;
  /** An optional leading relationship glyph (aria-hidden decoration) shown beside the picker in EDIT mode —
   *  the feature supplies it from its glyph resolver, since the tier-2 kit can't reach a feature lib. In
   *  read mode the badge carries its own glyph, so this is only used when the picker is shown. */
  readonly relationshipGlyph?: ReactNode;
}

/** A present-character card: emoji · name · relationship badge/picker · mood · standing guides · numeric
 *  meters · text-field chips. */
export function CastCard({
  name,
  emoji,
  mood,
  appearance,
  outfit,
  thoughts,
  onEditGuide,
  fields,
  relationship,
  meters,
  onEditField,
  onEditMood,
  onEditRelationshipKind,
  relationshipGlyph,
}: CastCardProps): ReactElement {
  return (
    <Stack gap="block" className="rounded-base border border-border bg-card px-block py-row" data-slot="cast-card">
      <Row justify="between" align="baseline" gap="block">
        <Row gap="field" align="center" className="min-w-0">
          {emoji === undefined || emoji === "" ? null : (
            <Text as="span" size="label" aria-hidden={true} className="shrink-0">
              {emoji}
            </Text>
          )}
          {/* `shrink-0` keeps the name from collapsing to 0px when a long custom relationship label is present —
              the badge yields width to the name (it truncates), never the reverse. */}
          <Text as="span" size="label" weight="semibold" className="shrink-0">
            {name}
          </Text>
          <CastRelationship
            name={name}
            {...(relationship === undefined ? {} : { relationship })}
            {...(onEditRelationshipKind === undefined ? {} : { onEditRelationshipKind })}
            {...(relationshipGlyph === undefined ? {} : { relationshipGlyph })}
          />
        </Row>
        <CastMood name={name} {...(mood === undefined ? {} : { mood })} {...(onEditMood === undefined ? {} : { onEditMood })} />
      </Row>
      {/* The standing guides sit directly under the header (the design-set cast row order: name · emoji ·
          mood · outfit · thoughts · customFields) — prose first, then the tracked readings. */}
      <CastGuides
        name={name}
        {...(appearance === undefined ? {} : { appearance })}
        {...(outfit === undefined ? {} : { outfit })}
        {...(thoughts === undefined ? {} : { thoughts })}
        {...(onEditGuide === undefined ? {} : { onEditGuide })}
      />
      {meters}
      {fields === undefined || fields.length === 0 ? null : (
        <Row gap="field" className="flex-wrap">
          {fields.map((field) => (
            <TrackerChip
              key={field.name}
              label={field.name}
              value={field.value}
              // WHOSE reading — the card already names the character; its chips did not (side-eye 08-01).
              subject={name}
              {...(onEditField === undefined ? {} : { onEditValue: (next: string): void => onEditField(field.name, next) })}
            />
          ))}
        </Row>
      )}
    </Stack>
  );
}
